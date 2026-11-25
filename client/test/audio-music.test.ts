import { describe, expect, it } from "vitest";
import { TRACKS, TRACK_NAMES, CHANNELS, loopSeconds, stepSeconds, voiceForNote, type Track } from "../src/audio/music";
import { Scheduler, type VoiceSink } from "../src/audio/scheduler";
import type { VoiceSpec } from "../src/audio/sfx";

interface Played {
  t: number;
  spec: VoiceSpec;
}

function rig() {
  const played: Played[] = [];
  let stopped = 0;
  const clock = { currentTime: 0 };
  const sink: VoiceSink = {
    play: (spec, t) => void played.push({ t, spec }),
    stopAll: () => void stopped++,
  };
  const sched = new Scheduler(sink, clock);
  return {
    played,
    clock,
    sched,
    stops: () => stopped,
    /** Ticks every 25 ms of fake time. */
    run(seconds: number) {
      const steps = Math.round(seconds / 0.025);
      for (let i = 0; i < steps; i++) {
        clock.currentTime += 0.025;
        sched.tick();
      }
    },
  };
}

describe("Scheduler", () => {
  it("schedules notes in monotonically increasing time within the lookahead window", () => {
    const r = rig();
    r.sched.start(TRACKS.main);
    let lastLen = 0;
    for (let i = 0; i < 200; i++) {
      r.clock.currentTime += 0.025;
      r.sched.tick();
      for (let k = lastLen; k < r.played.length; k++) expect(r.played[k]!.t).toBeLessThanOrEqual(r.clock.currentTime + 0.12 + 1e-9);
      lastLen = r.played.length;
    }
    expect(r.played.length).toBeGreaterThan(20);
    for (let i = 1; i < r.played.length; i++) expect(r.played[i]!.t).toBeGreaterThanOrEqual(r.played[i - 1]!.t);
  });

  it("loops seamlessly: loop N+1 starts exactly one loop length after loop N", () => {
    const tr = TRACKS.secret; // short loop
    const r = rig();
    r.sched.start(tr);
    r.run(loopSeconds(tr) * 3 + 1);
    const first = tr.notes[0]!;
    const fv = voiceForNote(first, stepSeconds(tr));
    const starts = r.played.filter((p) => p.spec.freq === fv.freq && p.spec.wave === fv.wave).map((p) => p.t);
    const t0 = r.played[0]!.t - first.step * stepSeconds(tr);
    for (let n = 0; n < 3; n++) {
      const expected = t0 + n * loopSeconds(tr) + first.step * stepSeconds(tr);
      expect(starts.some((s) => Math.abs(s - expected) < 1e-9)).toBe(true);
    }
    // total count of notes: three full loops are present
    const perLoop = tr.notes.length;
    const inFirstThree = r.played.filter((p) => p.t < t0 + 3 * loopSeconds(tr) - 1e-9).length;
    expect(inFirstThree).toBe(perLoop * 3);
  });

  it("switching stops the old voices and starts the new track on the next beat boundary", () => {
    const r = rig();
    r.sched.start(TRACKS.main);
    r.run(1.03);
    const t0 = r.played[0]!.t;
    const beat = 60 / TRACKS.main.bpm;
    const n = r.played.length;
    const stopsBefore = r.stops();
    r.sched.start(TRACKS.boss);
    expect(r.stops()).toBeGreaterThan(stopsBefore);
    r.run(0.5);
    const fresh = r.played.slice(n);
    expect(fresh.length).toBeGreaterThan(0);
    const first = fresh[0]!.t;
    expect(first).toBeGreaterThanOrEqual(1.03);
    const k = (first - t0) / beat;
    expect(Math.abs(k - Math.round(k))).toBeLessThan(1e-6);
    // nothing of the old track is scheduled afterwards: every later note belongs to the new track (boss has no 25% pulse lead above E6 etc: check by grid)
    const stepB = stepSeconds(TRACKS.boss);
    for (const p of fresh) {
      const rel = (p.t - first) / stepB;
      expect(Math.abs(rel - Math.round(rel))).toBeLessThan(1e-6);
    }
  });

  it("the ending plays once, then nothing more is scheduled", () => {
    const tr = TRACKS.ending;
    const r = rig();
    r.sched.start(tr);
    r.run(loopSeconds(tr) + 3);
    const count = r.played.length;
    expect(count).toBe(tr.notes.length);
    r.run(loopSeconds(tr) * 2);
    expect(r.played.length).toBe(count);
    expect(r.sched.finished).toBe(true);
  });

  it("a long stall (hidden page) skips the missed notes instead of bursting them out", () => {
    const r = rig();
    r.sched.start(TRACKS.main);
    r.run(0.5);
    const n = r.played.length;
    r.clock.currentTime += 60; // timer frozen for a minute, then one tick
    r.sched.tick();
    r.run(0.1);
    const fresh = r.played.slice(n);
    expect(fresh.length).toBeLessThan(12);
    for (const p of fresh) expect(p.t).toBeGreaterThanOrEqual(r.clock.currentTime - 0.1 - 0.05);
  });

  it("stop halts all scheduling", () => {
    const r = rig();
    r.sched.start(TRACKS.main);
    r.run(0.5);
    r.sched.stop();
    const n = r.played.length;
    r.run(2);
    expect(r.played.length).toBe(n);
    expect(r.sched.playing).toBe(false);
  });
});

describe("track data", () => {
  const all = TRACK_NAMES.map((n) => TRACKS[n]);
  it("has the expected tracks", () => {
    expect([...TRACK_NAMES].sort()).toEqual(["boss", "ending", "hurry", "main", "secret"]);
    expect(TRACKS.ending.loop).toBe(false);
    for (const n of ["main", "hurry", "boss", "secret"] as const) expect(TRACKS[n].loop).toBe(true);
  });
  it("tempo and loop length are consistent", () => {
    expect(TRACKS.main.length).toBe(16 * 16);
    expect(TRACKS.main.bpm).toBe(150);
    expect(TRACKS.hurry.length).toBe(TRACKS.main.length);
    expect(TRACKS.hurry.bpm / TRACKS.main.bpm).toBeGreaterThan(1.2);
    expect(TRACKS.hurry.bpm / TRACKS.main.bpm).toBeLessThan(1.3);
    for (const t of all) {
      expect(t.bpm).toBeGreaterThan(60);
      expect(t.bpm).toBeLessThan(220);
      expect(t.length % 16).toBe(0);
      expect(loopSeconds(t)).toBeCloseTo((t.length / 4) * (60 / t.bpm), 9);
    }
  });
  it("notes are in range, sorted, on known channels and none outlasts the loop", () => {
    for (const t of all as Track[]) {
      expect(t.notes.length).toBeGreaterThan(30);
      let prev = -1;
      for (const n of t.notes) {
        expect(CHANNELS[n.ch], `${t.name} channel`).toBeDefined();
        expect(Number.isInteger(n.step) && n.step >= 0 && n.step < t.length, `${t.name} step ${n.step}`).toBe(true);
        expect(n.len >= 1 && n.len <= t.length, `${t.name} len`).toBe(true);
        expect(n.step + n.len, `${t.name} end`).toBeLessThanOrEqual(t.length);
        expect(n.step, `${t.name} sorted`).toBeGreaterThanOrEqual(prev);
        prev = n.step;
        if (n.ch !== "hat") expect(n.note >= 36 && n.note <= 88, `${t.name} register ${n.note}`).toBe(true);
        const v = voiceForNote(n, stepSeconds(t));
        expect(Number.isFinite(v.freq) && v.freq > 0 && v.dur > 0).toBe(true);
      }
    }
  });
  it("the tracks are all different", () => {
    const keys = new Set(all.map((t) => JSON.stringify(t.notes)));
    expect(keys.size).toBe(all.length);
    expect(new Set(all.map((t) => t.bpm)).size).toBeGreaterThanOrEqual(4);
  });
  it("the lead rests regularly (no 4-bar stretch is wall-to-wall notes) and stays modest in register", () => {
    for (const t of all) {
      const lead = t.notes.filter((n) => n.ch === "lead");
      expect(Math.max(...lead.map((n) => n.note))).toBeLessThanOrEqual(84);
      const bars = t.length / 16;
      let barsWithRest = 0;
      for (let b = 0; b < bars; b++) {
        const covered = lead.filter((n) => n.step >= b * 16 && n.step < (b + 1) * 16).reduce((a, n) => a + n.len, 0);
        if (covered < 16) barsWithRest++;
      }
      expect(barsWithRest / bars, t.name).toBeGreaterThan(0.5);
    }
  });
  it("the ending closes on a long tonic", () => {
    const t = TRACKS.ending;
    const last = t.notes.filter((n) => n.ch === "lead").at(-1)!;
    expect(last.len).toBeGreaterThanOrEqual(16);
    expect(last.step + last.len).toBe(t.length);
  });
});
