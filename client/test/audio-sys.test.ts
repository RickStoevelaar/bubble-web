import { describe, expect, it } from "vitest";
import { AudioSys, MAX_SFX_VOICES, MAX_TOTAL_VOICES } from "../src/audio/audio";
import { NULL_AUDIO, createAudio } from "../src/audio";
import { FakeAudioContext, fakeTimers, memStorage, throwingStorage } from "./audio-fake";

function setup(storage: ReturnType<typeof memStorage> | typeof throwingStorage = memStorage()) {
  const timers = fakeTimers();
  const sys = AudioSys.create({ AudioContextCtor: FakeAudioContext as never, timers, storage })!;
  const ctx = FakeAudioContext.last!;
  const settle = () => new Promise<void>((r) => setTimeout(r, 0));
  const unlock = async () => {
    sys.unlock();
    await settle();
  };
  return { sys, ctx, timers, storage, settle, unlock, adv: (s: number) => timers.advance(ctx, s) };
}

describe("AudioSys creation and the null wrapper", () => {
  it("returns null without a WebAudio constructor", () => {
    expect(AudioSys.create({ AudioContextCtor: null })).toBeNull();
  });
  it("createAudio falls back to a wrapper whose every method is a harmless no-op", () => {
    const a = createAudio({ AudioContextCtor: null });
    expect(a).toBe(NULL_AUDIO);
    a.unlock();
    a.playSfx("pop1");
    a.setMusic("main");
    a.setMuted(true);
    a.setVolume(0.2);
    a.suspend();
    a.resume();
    a.dispose();
    expect(a.isMuted()).toBe(true);
    let called = 0;
    a.onUnlocked(() => called++);
    expect(called).toBe(0);
  });
  it("survives a constructor that throws", () => {
    const Bad = function () {
      throw new Error("nope");
    };
    expect(AudioSys.create({ AudioContextCtor: Bad as never })).toBeNull();
  });
});

describe("autoplay lock", () => {
  it("creates no voices before unlock but remembers the music, which starts after unlock", async () => {
    const { sys, ctx, unlock, adv } = setup();
    sys.playSfx("pop1");
    sys.setMusic("main");
    adv(0.5);
    expect(ctx.allSources().length).toBe(0);
    await unlock();
    adv(0.3);
    expect(ctx.allSources().length).toBeGreaterThan(0);
  });
  it("unlock twice is harmless and the silent unlock buffer is played inside the gesture", async () => {
    const { sys, ctx, unlock } = setup();
    sys.unlock();
    const silent = ctx.nodes.filter((n) => n.kind === "bufsrc" && !n.loop);
    expect(silent.length).toBe(1);
    expect(silent[0]!.startedAt).toBeDefined();
    await unlock();
    await unlock();
    expect(ctx.resumeCalls).toBe(1);
    expect(sys.isRunning()).toBe(true);
  });
});

describe("voices are released", () => {
  it("every node of a sound is stopped and disconnected after its end time", async () => {
    const { sys, ctx, unlock, adv } = setup();
    await unlock();
    const baseline = ctx.liveNodes();
    sys.playSfx("pop1");
    expect(ctx.liveSources().length).toBeGreaterThanOrEqual(1);
    expect(ctx.liveNodes()).toBeGreaterThan(baseline);
    adv(1);
    expect(ctx.liveSources().length).toBe(0);
    expect(ctx.liveNodes()).toBe(baseline);
    for (const s of ctx.allSources()) expect(s.stoppedAt).toBeDefined();
    expect(sys.liveVoices()).toBe(0);
  });
  it("the housekeeping timer stops when nothing is live and no music plays", async () => {
    const { sys, timers, unlock, adv } = setup();
    await unlock();
    sys.playSfx("collect");
    expect(timers.count()).toBe(1);
    expect(timers.minMs()).toBeGreaterThanOrEqual(25);
    adv(1);
    expect(timers.count()).toBe(0);
  });
  it("a burst of 50 sounds respects the polyphony cap and the per-sound rate limit", async () => {
    const { sys, ctx, unlock } = setup();
    await unlock();
    for (let i = 0; i < 50; i++) sys.playSfx("jump");
    expect(ctx.allSources().length).toBeLessThanOrEqual(6); // one voice per jump, spaced by the gap, within the max delay
    const names = ["pop1", "pop2", "collect", "death", "clear", "oneup", "boing", "gameover"] as const;
    for (let i = 0; i < 50; i++) sys.playSfx(names[i % names.length]!);
    expect(ctx.liveSources().length).toBeLessThanOrEqual(MAX_SFX_VOICES);
    expect(MAX_SFX_VOICES).toBeLessThanOrEqual(MAX_TOTAL_VOICES);
    expect(MAX_TOTAL_VOICES).toBeLessThanOrEqual(24);
  });
  it("a chain of 8 pops is spread into a run, not stacked on one instant", async () => {
    const { sys, ctx, unlock } = setup();
    await unlock();
    for (let i = 1; i <= 8; i++) sys.playSfx(`pop${i}` as never);
    const starts = ctx.allSources().filter((n) => n.kind === "osc").map((n) => n.startedAt!);
    expect(new Set(starts.map((s) => s.toFixed(3))).size).toBe(8);
  });
});

describe("mute and persistence", () => {
  it("mute silences new voices and stops the music; unmute resumes the current track", async () => {
    const { sys, ctx, unlock, adv } = setup();
    await unlock();
    sys.setMusic("main");
    adv(0.3);
    const n0 = ctx.allSources().length;
    expect(n0).toBeGreaterThan(0);
    sys.setMuted(true);
    expect(sys.isMuted()).toBe(true);
    adv(3);
    expect(ctx.allSources().length).toBe(n0);
    expect(ctx.liveSources().length).toBe(0);
    sys.playSfx("pop1");
    expect(ctx.allSources().length).toBe(n0);
    sys.setMuted(false);
    adv(0.3);
    expect(ctx.allSources().length).toBeGreaterThan(n0);
  });
  it("persists mute and volume and reads them back; default volume is 0.7 unmuted", () => {
    const storage = memStorage();
    const a = setup(storage);
    expect(a.sys.isMuted()).toBe(false);
    expect(a.sys.getVolume()).toBe(0.7);
    a.sys.setMuted(true);
    a.sys.setVolume(0.3);
    const b = setup(storage);
    expect(b.sys.isMuted()).toBe(true);
    expect(b.sys.getVolume()).toBeCloseTo(0.3);
  });
  it("clamps the volume and tolerates garbage or throwing storage", () => {
    const s = setup(throwingStorage);
    s.sys.setVolume(5);
    expect(s.sys.getVolume()).toBe(1);
    s.sys.setMuted(true);
    expect(s.sys.isMuted()).toBe(true);
    const st = memStorage();
    st.map.set("bubble.audio", "{not json");
    expect(setup(st).sys.getVolume()).toBe(0.7);
  });
  it("master level is 0.5 x volume", () => {
    const { sys, ctx } = setup();
    sys.setVolume(0.8);
    const master = ctx.nodes.filter((n) => n.kind === "gain").find((n) => n.connects.some((c) => c.kind === "comp"))!;
    expect(master.gain.value).toBeCloseTo(0.4);
  });
});

describe("page visibility", () => {
  it("suspend stops every voice and the timer; resume restarts music without catch-up", async () => {
    const { sys, ctx, timers, unlock, adv } = setup();
    await unlock();
    sys.setMusic("main");
    adv(1);
    sys.suspend();
    expect(ctx.liveSources().length).toBe(0);
    expect(timers.count()).toBe(0);
    expect(ctx.suspendCalls).toBe(1);
    sys.playSfx("pop1");
    expect(ctx.liveSources().length).toBe(0);
    ctx.currentTime += 30; // the page was hidden for 30 s
    const before = ctx.allSources().length;
    sys.resume();
    await new Promise<void>((r) => setTimeout(r, 0));
    adv(0.3);
    const fresh = ctx.allSources().slice(before);
    expect(fresh.length).toBeGreaterThan(0);
    expect(fresh.length).toBeLessThan(25);
    for (const n of fresh) expect(n.startedAt!).toBeGreaterThanOrEqual(ctx.currentTime - 0.3 - 1e-9);
  });
  it("resume before any unlock does not try to start the context", () => {
    const { sys, ctx } = setup();
    sys.suspend();
    sys.resume();
    expect(ctx.resumeCalls).toBe(0);
  });
  it("dispose clears the timer and closes the context", async () => {
    const { sys, ctx, timers, unlock } = setup();
    await unlock();
    sys.setMusic("boss");
    sys.dispose();
    expect(timers.count()).toBe(0);
    expect(ctx.state).toBe("closed");
    sys.playSfx("pop1");
    sys.setMusic("main");
  });
});
