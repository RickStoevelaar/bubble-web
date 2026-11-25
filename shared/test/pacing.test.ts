import { describe, expect, it } from "vitest";
import { POWER_TABLE, Sim, TEST_LEVEL, TUNING } from "../src";
import type { GameState, LevelData, PowerId, SimEvent } from "../src";
import { popSpecial, stepSpecialSpawns } from "../src/sim/specials";

const IDS = Object.keys(POWER_TABLE) as PowerId[];
const levels = (n: number): LevelData[] => Array.from({ length: n }, () => TEST_LEVEL);
const run = (sim: Sim, ticks: number): SimEvent[] => {
  const ev: SimEvent[] = [];
  for (let i = 0; i < ticks; i++) ev.push(...sim.step([0, 0]));
  return ev;
};
const powerItems = (sim: Sim) => sim.state.items.filter((i) => i.kind === "power");

describe("power progress counts from the previous power", () => {
  it("a counter that was already high does not make the next power instant", () => {
    const sim = new Sim(levels(1), 1, 1);
    sim.state.enemies = [];
    const p = sim.state.players[0]!;
    // Long walk, no jumps/bubbles yet: boots (jumps) and tonicA (bubbles) come first, then parasolS (distance).
    p.counters = { bubbles: 0, jumps: 0, distance: TUNING.powerThreshold.parasolS * 3 };
    p.counters.jumps = TUNING.powerThreshold.boots;
    run(sim, 1);
    expect(powerItems(sim).map((i) => i.power)).toEqual(["boots"]);
    sim.state.items = [];
    p.counters.bubbles = TUNING.powerThreshold.tonicA;
    run(sim, 1);
    expect(powerItems(sim).map((i) => i.power)).toEqual(["tonicA"]);
    sim.state.items = [];
    // parasolS is next. The distance walked BEFORE tonicA was earned does not count.
    run(sim, 5);
    expect(powerItems(sim)).toHaveLength(0);
    p.counters.distance += TUNING.powerThreshold.parasolS - 1;
    run(sim, 1);
    expect(powerItems(sim)).toHaveLength(0);
    p.counters.distance += 1;
    run(sim, 1);
    expect(powerItems(sim).map((i) => i.power)).toEqual(["parasolS"]);
  });

  it("the snapshot is part of the state and survives a JSON round trip", () => {
    const sim = new Sim(levels(1), 1, 1);
    sim.state.enemies = [];
    const p = sim.state.players[0]!;
    p.counters = { bubbles: 4, jumps: TUNING.powerThreshold.boots, distance: 77 };
    run(sim, 1);
    expect(p.powerStep).toBe(1);
    expect(p.powerBase).toEqual({ bubbles: 4, jumps: TUNING.powerThreshold.boots, distance: 77 });
    const b = Sim.restore(levels(1), JSON.parse(JSON.stringify(sim.state)));
    expect(JSON.stringify(b.state)).toBe(JSON.stringify(sim.state));
  });

  it("an older save without the snapshot restores safely: zeros at step 0, the current counters later", () => {
    const sim = new Sim(levels(1), 1, 2);
    sim.state.enemies = [];
    sim.state.players[0]!.counters = { bubbles: 1, jumps: 2, distance: 3 };
    sim.state.players[1]!.counters = { bubbles: 50, jumps: 60, distance: 9000 };
    sim.state.players[1]!.powerStep = 4;
    const old = JSON.parse(JSON.stringify(sim.state)) as { players: Record<string, unknown>[] };
    for (const p of old.players) delete p["powerBase"];
    const r = Sim.restore(levels(1), old as unknown as GameState);
    expect(r.state.players[0]!.powerBase).toEqual({ bubbles: 0, jumps: 0, distance: 0 });
    expect(r.state.players[1]!.powerBase).toEqual({ bubbles: 50, jumps: 60, distance: 9000 });
    // same key order as a fresh player
    expect(Object.keys(r.state.players[1]!)).toEqual(Object.keys(sim.state.players[1]!));
  });

  it("a damaged snapshot is clamped to the counters", () => {
    const sim = new Sim(levels(1), 1, 1);
    const st = JSON.parse(JSON.stringify(sim.state)) as { players: { powerBase: unknown; counters: object }[] };
    st.players[0]!.counters = { bubbles: 5, jumps: 5, distance: 5 };
    st.players[0]!.powerBase = { bubbles: 999, jumps: "x", distance: -4 };
    const r = Sim.restore(levels(1), st as unknown as GameState);
    expect(r.state.players[0]!.powerBase).toEqual({ bubbles: 5, jumps: 0, distance: 0 });
  });

  it("a continue resets the snapshot with the counters", () => {
    const sim = new Sim(levels(2), 1, 1);
    const p = sim.state.players[0]!;
    p.powerBase = { bubbles: 9, jumps: 9, distance: 9 };
    sim.state.phase = "gameover";
    sim.continueRun();
    expect(p.powerBase).toEqual({ bubbles: 0, jumps: 0, distance: 0 });
  });
});

/**
 * Pacing model for the skip umbrellas. Per round (about 35 s = 2100 ticks of play) a pacing bot that walks back and
 * forth, fires every half second and jumps every 1.7 s was measured in the real sim (rounds 1, 5, 20 of the campaign,
 * one player) at 630..1290 px walked, 41..50 bubbles, 9..14 jumps; the boots power (earned first) makes walking 1.5x
 * faster. The model uses the upper part of that: 1350 px, 45 bubbles, 12 jumps per round. Powers are earned strictly in
 * table order, each from the progress since the previous one (cycle 0).
 */
describe("skip umbrellas are a rare reward", () => {
  const PER_ROUND = { bubbles: 45, jumps: 12, distance: 1350 };
  function timeline(): { id: PowerId; playedRounds: number }[] {
    let t = 0;
    return IDS.map((id) => {
      const row = POWER_TABLE[id];
      t += row.threshold / PER_ROUND[row.counter];
      return { id, playedRounds: t };
    });
  }
  const umbrellas = () => timeline().filter((e) => POWER_TABLE[e.id].effect.kind === "skip");

  it("the first (3-round) umbrella comes no earlier than about round 9", () => {
    expect(umbrellas()[0]!.id).toBe("parasolS");
    expect(umbrellas()[0]!.playedRounds).toBeGreaterThanOrEqual(8.5);
  });

  it("two umbrellas are never within 5 rounds (played rounds plus the rounds the earlier one skipped)", () => {
    const u = umbrellas();
    let skipped = 0;
    let prevRound = -Infinity;
    for (const e of u) {
      const fx = POWER_TABLE[e.id].effect;
      const round = e.playedRounds + skipped;
      expect(round - prevRound).toBeGreaterThanOrEqual(5);
      prevRound = round;
      if (fx.kind === "skip") skipped += fx.rounds;
    }
  });

  it("even a walker 50% faster than the model gets its first umbrella no earlier than round 6", () => {
    let t = 0;
    for (const id of IDS) {
      const row = POWER_TABLE[id];
      t += row.threshold / (PER_ROUND[row.counter] * (row.counter === "distance" ? 1.5 : 1));
      if (id === "parasolS") break;
    }
    expect(t).toBeGreaterThanOrEqual(6);
  });
});

describe("EXTEND letters on rounds without element flags", () => {
  /** Perfect collection (the upper bound on how often a full EXTEND can happen): every letter bubble is touched at once. */
  function extendsPer(level: LevelData, ticks: number): number {
    const sim = new Sim([level], 2024, 1);
    sim.state.enemies = [];
    const events: SimEvent[] = [];
    let n = 0;
    for (let t = 0; t < ticks; t++) {
      sim.state.phase = "round";
      sim.state.secret = null;
      stepSpecialSpawns(sim);
      for (const b of [...sim.state.bubbles]) {
        if (b.kind === "normal") continue;
        popSpecial(sim, b, sim.state.players[0]!, new Set(), events);
        sim.state.bubbles = sim.state.bubbles.filter((x) => x !== b);
      }
    }
    for (const e of events) if (e.kind === "oneup") n++;
    return n;
  }
  const ROUND_TICKS = 2100;

  it("a full EXTEND happens no more often than about once per 6 rounds even with perfect collection", () => {
    const rounds = 600;
    const n = extendsPer(TEST_LEVEL, rounds * ROUND_TICKS);
    expect(n).toBeGreaterThan(20); // the reward still exists
    expect(rounds / n).toBeGreaterThanOrEqual(6);
  });

  it("a level with element flags keeps the designed timer", () => {
    const flagged: LevelData = { ...TEST_LEVEL, flags: { waterBubbles: true } };
    const sim = new Sim([flagged], 5, 1);
    sim.state.enemies = [];
    for (let i = 0; i < 40; i++) {
      sim.state.specialTimer = 1;
      stepSpecialSpawns(sim);
      expect(sim.state.specialTimer).toBeGreaterThanOrEqual(TUNING.specialIntervalMin);
      expect(sim.state.specialTimer).toBeLessThan(TUNING.specialIntervalMax);
    }
  });
});
