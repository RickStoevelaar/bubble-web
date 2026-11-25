import { describe, expect, it } from "vitest";
import type { SimEvent } from "@bubble/shared";
import { SFX, SFX_NAMES, newMapperState, sfxForEvent, type EventContext, type SfxName } from "../src/audio/sfx";

function mk(localPlayer: 0 | 1 = 0) {
  const state = newMapperState();
  let now = 1000;
  const ctx = (): EventContext => ({ localPlayer, now, state });
  return {
    at: (t: number) => void (now = t),
    map: (e: SimEvent): SfxName | null => sfxForEvent(e, ctx()),
  };
}

describe("sfxForEvent mapping", () => {
  it("maps every event kind", () => {
    const m = mk(0);
    expect(m.map({ kind: "jump", player: 0 })).toBe("jump");
    expect(m.map({ kind: "fire", player: 1 })).toBe("blow");
    expect(m.map({ kind: "bounce" })).toBe("boing");
    expect(m.map({ kind: "collect", player: 0 })).toBe("collect");
    expect(m.map({ kind: "oneup", player: 0 })).toBe("oneup");
    expect(m.map({ kind: "hurry" })).toBe("hurry");
    expect(m.map({ kind: "continue" })).toBe("continue");
    expect(m.map({ kind: "clear" })).toBe("clear");
    expect(m.map({ kind: "pop", player: 0 })).toBe("pop1");
  });
  it("drops a second clear within 1500 ms and allows one after", () => {
    const m = mk();
    m.at(5000);
    expect(m.map({ kind: "clear" })).toBe("clear");
    expect(m.map({ kind: "clear" })).toBeNull(); // same tick: letter completion + round clear
    m.at(6400);
    expect(m.map({ kind: "clear" })).toBeNull();
    m.at(6600);
    expect(m.map({ kind: "clear" })).toBe("clear");
  });
  it("a player-less pop is the soft fizzle, never the victory pop", () => {
    const m = mk();
    expect(m.map({ kind: "pop" })).toBe("fizzle");
    const f = SFX.fizzle.voices.reduce((a, v) => a + v.vol, 0);
    const p = SFX.pop1.voices.reduce((a, v) => a + v.vol, 0);
    expect(f).toBeLessThan(p / 2);
  });
  it("a fizzle does not advance the pop chain", () => {
    const m = mk();
    m.at(1000);
    expect(m.map({ kind: "pop", player: 0 })).toBe("pop1");
    expect(m.map({ kind: "pop" })).toBe("fizzle");
    expect(m.map({ kind: "pop", player: 1 })).toBe("pop2");
  });
  it("the pop chain climbs, caps at 8 steps and resets after 400 ms of silence", () => {
    const m = mk();
    m.at(1000);
    const seq = Array.from({ length: 10 }, () => m.map({ kind: "pop", player: 0 }));
    expect(seq).toEqual(["pop1", "pop2", "pop3", "pop4", "pop5", "pop6", "pop7", "pop8", "pop8", "pop8"]);
    m.at(1300); // gap 300 ms since the last pop at 1000: still the same chain
    expect(m.map({ kind: "pop", player: 0 })).toBe("pop8");
    m.at(1800); // 500 ms later: reset
    expect(m.map({ kind: "pop", player: 0 })).toBe("pop1");
  });
  it("pop pitches strictly rise along the chain", () => {
    const f = (n: SfxName) => SFX[n].voices.find((v) => v.wave !== "noise")!.freq;
    for (let i = 1; i < 8; i++) expect(f(`pop${i + 1}` as SfxName)).toBeGreaterThan(f(`pop${i}` as SfxName));
  });
  it("death differs for the local player and the partner, and is quieter for the partner", () => {
    const m = mk(0);
    const mine = m.map({ kind: "die", player: 0 });
    const theirs = m.map({ kind: "die", player: 1 });
    expect(mine).toBe("death");
    expect(theirs).toBe("deathSoft");
    expect(m.map({ kind: "die" })).toBe("death");
    const vol = (n: SfxName) => SFX[n].voices.reduce((a, v) => a + v.vol, 0);
    expect(vol("deathSoft")).toBeLessThan(vol("death"));
    expect(mk(1).map({ kind: "die", player: 1 })).toBe("death");
  });
  it("every mapped name has a definition", () => {
    for (const n of SFX_NAMES) expect(SFX[n]).toBeDefined();
  });
});

describe("SFX data validity", () => {
  it("every voice has finite positive frequency and duration and sane volume", () => {
    for (const name of SFX_NAMES) {
      const def = SFX[name];
      expect(def.voices.length, name).toBeGreaterThan(0);
      expect(def.voices.length, name).toBeLessThanOrEqual(6);
      expect(def.gap, name).toBeGreaterThan(0);
      for (const v of def.voices) {
        expect(Number.isFinite(v.freq) && v.freq > 0, `${name} freq`).toBe(true);
        expect(Number.isFinite(v.dur) && v.dur > 0 && v.dur <= 1.5, `${name} dur`).toBe(true);
        expect(v.vol > 0 && v.vol <= 0.8, `${name} vol`).toBe(true);
        expect(v.delay ?? 0, name).toBeGreaterThanOrEqual(0);
        if (v.slideTo !== undefined) expect(v.slideTo > 0 && Number.isFinite(v.slideTo), `${name} slide`).toBe(true);
      }
    }
  });
  it("no sound is a sustained tone: each ends within 2 seconds", () => {
    for (const name of SFX_NAMES) {
      const end = Math.max(...SFX[name].voices.map((v) => (v.delay ?? 0) + v.dur));
      expect(end, name).toBeLessThan(2);
    }
  });
});
