import { describe, expect, it } from "vitest";
import { MAX_SCORE, Sim, TEST_LEVEL, TUNING, addScore, nextLifeThreshold } from "../src";
import type { SimEvent } from "../src";
import { runProbe } from "./support/probe";

describe("addScore and restore terminate for damaged scores (child process, hard kill)", () => {
  it("restored or live players with absurd score / nextLifeAt gain score and step 100 ticks", () => {
    const r = runProbe(`
const cases = [
  [1e17, 50000], [1e9, 50000], [1e300, 50000], [Number.MAX_VALUE, 50000], [NaN, 50000], [-1e17, 50000],
  [100, -1e-300], [100, -5], [100, 0], [100, NaN], [1e17, 1e-300], [5e4, 150000], [1e17, 1e17],
];
let n = 0;
for (const [score, nextLifeAt] of cases) {
  for (const live of [false, true]) {
    const sim = new S.Sim([S.TEST_LEVEL], 1, 1);
    const st = structuredClone(sim.state);
    st.players[0].score = score;
    st.players[0].nextLifeAt = nextLifeAt;
    const rs = S.Sim.restore([S.TEST_LEVEL], st);
    const p = rs.state.players[0];
    if (live) { p.score = score; p.nextLifeAt = nextLifeAt; }
    S.addScore(rs, 0, 100);
    for (let i = 0; i < 100; i++) rs.step([S.BTN.R, 0]);
    if (!Number.isFinite(p.score) || !Number.isFinite(p.nextLifeAt) || p.score > S.MAX_SCORE) throw new Error("bad " + score + "/" + nextLifeAt + " " + p.score + " " + p.nextLifeAt);
    n++;
  }
}
console.log("ok " + n);`);
    expect(r.timedOut, "addScore / restore hung").toBe(false);
    expect(r.stdout.trim(), r.why).toMatch(/^ok \d+$/);
  }, 60000);
});

/** The previous implementation, verbatim. */
function oldAddScore(p: { score: number; lives: number; nextLifeAt: number }, player: 0 | 1, n: number): SimEvent[] {
  const events: SimEvent[] = [];
  if (!Number.isFinite(n) || n <= 0) return events;
  p.score += n;
  while (p.score >= p.nextLifeAt) {
    if (p.lives < TUNING.maxLives) p.lives++;
    p.nextLifeAt += TUNING.extraLifeStep;
    events.push({ kind: "oneup", player });
  }
  return events;
}

const fresh = (score: number, lives: number, nextLifeAt: number) => {
  const sim = new Sim([TEST_LEVEL], 1, 1);
  const p = sim.state.players[0]!;
  p.score = score;
  p.lives = lives;
  p.nextLifeAt = nextLifeAt;
  return { sim, p };
};

describe("addScore is identical to the old loop for ordinary values", () => {
  it("matches lives, nextLifeAt, score and oneup events over thousands of combinations", () => {
    let seed = 12345;
    const rnd = (m: number) => {
      seed = (Math.imul(seed, 1103515245) + 12345) >>> 0;
      return seed % m;
    };
    let crossings = 0;
    let capped = 0;
    for (let i = 0; i < 20000; i++) {
      const lives = rnd(10);
      const th = TUNING.firstExtraLifeScore + TUNING.extraLifeStep * rnd(60);
      const nextLifeAt = i % 7 === 0 ? TUNING.firstExtraLifeScore : th;
      const score = Math.max(0, nextLifeAt - 1 - rnd(i % 3 === 0 ? 5 : 90000));
      const add = [1, 99, 1000, 49999, 100000, 250000, 999999, rnd(1_000_000) + 1][rnd(8)]!;
      const a = { score, lives, nextLifeAt };
      const { sim, p } = fresh(score, lives, nextLifeAt);
      const eo = oldAddScore(a, 0, add);
      const en = addScore(sim, 0, add);
      expect([p.score, p.lives, p.nextLifeAt, en.length]).toEqual([a.score, a.lives, a.nextLifeAt, eo.length]);
      expect(en).toEqual(eo);
      if (eo.length > 0) crossings++;
      if (eo.length > 0 && lives >= TUNING.maxLives) capped++;
    }
    expect(crossings).toBeGreaterThan(1000);
    expect(capped).toBeGreaterThan(100);
  });
});

describe("extra life boundaries", () => {
  it("reaching the threshold exactly grants one life and advances by the step", () => {
    const { sim, p } = fresh(0, 3, TUNING.firstExtraLifeScore);
    expect(addScore(sim, 0, TUNING.firstExtraLifeScore - 1)).toEqual([]);
    expect(addScore(sim, 0, 1)).toEqual([{ kind: "oneup", player: 0 }]);
    expect([p.lives, p.nextLifeAt]).toEqual([4, TUNING.firstExtraLifeScore + TUNING.extraLifeStep]);
  });
  it("crossing two thresholds at once grants two lives and two events", () => {
    const { sim, p } = fresh(49_999, 3, 50_000);
    const ev = addScore(sim, 0, 100_001);
    expect(ev).toHaveLength(2);
    expect([p.lives, p.nextLifeAt]).toEqual([5, 250_000]);
  });
  it("at the lives cap the thresholds still advance past the score and events still fire", () => {
    const { sim, p } = fresh(49_999, 8, 50_000);
    const ev = addScore(sim, 0, 450_001); // crosses 50k, 150k, 250k, 350k, 450k
    expect(ev).toHaveLength(5);
    expect(p.lives).toBe(TUNING.maxLives);
    expect(p.nextLifeAt).toBe(550_000);
    expect(p.nextLifeAt).toBeGreaterThan(p.score);
  });
  it("NaN, negative and infinite amounts are no-ops", () => {
    const { sim, p } = fresh(10, 3, 50_000);
    for (const n of [NaN, -5, 0, Infinity, -Infinity]) expect(addScore(sim, 0, n)).toEqual([]);
    expect([p.score, p.lives, p.nextLifeAt]).toEqual([10, 3, 50_000]);
  });
});

describe("score clamp", () => {
  it("never triggers below MAX_SCORE and caps at MAX_SCORE", () => {
    expect(MAX_SCORE).toBe(1e12);
    const { sim, p } = fresh(MAX_SCORE - 1000, 3, nextLifeThreshold(MAX_SCORE - 1000));
    addScore(sim, 0, 999);
    expect(p.score).toBe(MAX_SCORE - 1);
    addScore(sim, 0, 5000);
    expect(p.score).toBe(MAX_SCORE);
    expect(p.nextLifeAt).toBeGreaterThan(p.score);
  });
  it("restore clamps score into [0, MAX_SCORE], NaN to 0, and repairs a bad nextLifeAt", () => {
    const base = new Sim([TEST_LEVEL], 1, 1);
    for (const [score, next, wantScore] of [
      [1e17, 50000, MAX_SCORE],
      [-5, 50000, 0],
      [NaN, 50000, 0],
      [120_000, NaN, 120_000],
      [120_000, -1, 120_000],
      [120_000, 100_000, 120_000],
      [120_000, 150_000, 120_000],
    ] as const) {
      const st = structuredClone(base.state);
      st.players[0]!.score = score;
      st.players[0]!.nextLifeAt = next;
      const p = Sim.restore([TEST_LEVEL], st).state.players[0]!;
      expect(p.score).toBe(wantScore);
      expect(p.nextLifeAt).toBeGreaterThan(p.score);
      if (next === 150_000) expect(p.nextLifeAt).toBe(150_000); // a valid threshold is kept untouched
    }
  });
});
