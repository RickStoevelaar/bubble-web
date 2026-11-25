import { describe, expect, it } from "vitest";
import { BTN, FIELD_H, Sim, TEST_LEVEL, TILE, TUNING, validateLevel } from "../src";
import type { EnemyState, GameState, LevelData, SimEvent } from "../src";

const levelWith = (enemies: LevelData["enemies"]): LevelData => ({ ...TEST_LEVEL, enemies });
const L1 = levelWith([{ type: "walker", col: 10, row: 25, delayTicks: 0 }]);
const L2 = levelWith([{ type: "walker", col: 20, row: 25, delayTicks: 0 }]);
const run = (sim: Sim, ticks: number, buttons: [number, number] = [0, 0]): SimEvent[] => {
  const ev: SimEvent[] = [];
  for (let i = 0; i < ticks; i++) ev.push(...sim.step(buttons));
  return ev;
};
/** Kills every real enemy the way a pop does: dead and already landed, so it is removed next step. */
const killAll = (sim: Sim) => {
  for (const e of sim.state.enemies) {
    if (e.type === "hurry") continue;
    e.state = "dead";
    e.onGround = true;
  }
};
const hurryEnemies = (sim: Sim): EnemyState[] => sim.state.enemies.filter((e) => e.type === "hurry");
const toHurry = (sim: Sim) => {
  sim.state.roundTicks = TUNING.hurryUpTicks - 1;
  return sim.step([0, 0]);
};
/** Parks a player so it neither moves nor can be hit. */
const park = (sim: Sim, id: 0 | 1) => {
  const p = sim.state.players[id]!;
  p.state = "dying";
  p.stateTicks = 1_000_000;
};

describe("enemy spawn delay", () => {
  it("an enemy stays spawning until its delay elapses, then becomes active", () => {
    const sim = new Sim([levelWith([{ type: "walker", col: 10, row: 25, delayTicks: 30 }])], 1, 1);
    run(sim, 29);
    expect(sim.state.enemies[0]!.state).toBe("spawning");
    run(sim, 1);
    expect(sim.state.enemies[0]!.state).toBe("active");
  });
});

describe("round clear and advance", () => {
  it("killing the last enemy enters clearing, emits clear, and loads round 2 after clearTicks", () => {
    const sim = new Sim([L1, L2], 1, 1);
    run(sim, 2);
    sim.state.players[0]!.score = 500;
    killAll(sim);
    const ev = run(sim, 1);
    expect(ev.filter((e) => e.kind === "clear")).toHaveLength(1);
    expect(sim.state.phase).toBe("clearing");
    run(sim, TUNING.clearTicks - 1);
    expect(sim.state.phase).toBe("clearing");
    expect(sim.state.round).toBe(1);
    run(sim, 1);
    expect(sim.state.phase).toBe("round");
    expect(sim.state.round).toBe(2);
    expect(sim.state.roundTicks).toBe(0);
    expect(sim.state.players[0]!.score).toBe(500);
    expect(sim.state.enemies).toHaveLength(1);
    expect(sim.state.enemies[0]!.x).toBe(20 * TILE + TILE / 2);
    expect(sim.currentLevel).toBe(L2);
  });

  it("a round whose enemies were removed before any was seen does not auto-clear", () => {
    const sim = new Sim([L1, L2], 1, 1);
    sim.state.enemies = [];
    run(sim, 300);
    expect(sim.state.phase).toBe("round");
    expect(sim.state.round).toBe(1);
  });

  it("does not clear while another enemy is still spawning", () => {
    const sim = new Sim(
      [
        levelWith([
          { type: "walker", col: 10, row: 25, delayTicks: 0 },
          { type: "walker", col: 20, row: 25, delayTicks: 500 },
        ]),
      ],
      1,
      1,
    );
    run(sim, 2);
    sim.state.enemies[0]!.state = "dead";
    sim.state.enemies[0]!.onGround = true;
    run(sim, 5);
    expect(sim.state.enemies).toHaveLength(1);
    expect(sim.state.phase).toBe("round");
  });

  it("clearing: players still move, bubbles keep rising, roundTicks stops", () => {
    const sim = new Sim([L1, L2], 1, 1);
    run(sim, 2);
    killAll(sim);
    run(sim, 1);
    expect(sim.state.phase).toBe("clearing");
    const rt = sim.state.roundTicks;
    const x = sim.state.players[0]!.x;
    sim.state.bubbles.push({
      id: sim.state.nextId++,
      x: 100,
      y: 100,
      vx: 0,
      vy: -TUNING.bubbleRise,
      kind: "normal",
      phase: "float",
      ageTicks: 0,
      owner: 0,
    });
    run(sim, 10, [BTN.R, 0]);
    expect(sim.state.roundTicks).toBe(rt);
    expect(sim.state.bubbles[0]!.y).toBeLessThan(100);
    expect(sim.state.players[0]!.x).toBeGreaterThan(x);
  });

  it("clearing the last level stops safely in phase ending with runOver", () => {
    const sim = new Sim([L1], 1, 1);
    run(sim, 2);
    killAll(sim);
    run(sim, TUNING.clearTicks + 5);
    expect(sim.state.phase).toBe("ending");
    expect(sim.state.runOver).toBe(true);
    expect(sim.state.round).toBe(1);
    const tick = sim.state.tick;
    expect(run(sim, 5)).toEqual([]);
    expect(sim.state.tick).toBe(tick + 5);
  });

  it("loadRound clears bubbles and hurry chasers, resets clocks, keeps lives", () => {
    const sim = new Sim([L1, L2], 1, 1);
    run(sim, 2);
    toHurry(sim);
    sim.state.bubbles.push({
      id: sim.state.nextId++,
      x: 100,
      y: 100,
      vx: 0,
      vy: 0,
      kind: "normal",
      phase: "float",
      ageTicks: 0,
      owner: 0,
    });
    sim.state.players[0]!.lives = 2;
    sim.loadRound(2);
    expect(sim.state.bubbles).toHaveLength(0);
    expect(hurryEnemies(sim)).toHaveLength(0);
    expect(sim.state.hurryActive).toBe(false);
    expect(sim.state.roundTicks).toBe(0);
    expect(sim.state.players[0]!.lives).toBe(2);
  });
});

describe("hurry-up", () => {
  it("spawns one chaser per player at hurryUpTicks and emits hurry exactly once", () => {
    const sim = new Sim([L1], 1, 2);
    sim.state.roundTicks = TUNING.hurryUpTicks - 2;
    expect(run(sim, 1).filter((e) => e.kind === "hurry")).toHaveLength(0);
    expect(hurryEnemies(sim)).toHaveLength(0);
    const ev = run(sim, 1);
    expect(ev.filter((e) => e.kind === "hurry")).toHaveLength(1);
    expect(sim.state.hurryActive).toBe(true);
    expect(hurryEnemies(sim)).toHaveLength(2);
    park(sim, 0);
    park(sim, 1);
    expect(run(sim, 10).filter((e) => e.kind === "hurry")).toHaveLength(0);
    expect(hurryEnemies(sim)).toHaveLength(2);
  });

  it("spawns no chaser for a player who is gone", () => {
    const sim = new Sim([L1], 1, 2);
    sim.state.players[1]!.state = "gone";
    toHurry(sim);
    expect(hurryEnemies(sim)).toHaveLength(1);
  });

  it("moves toward the nearest alive player along one axis at hurryChaserSpeed", () => {
    const sim = new Sim([L1], 1, 2);
    toHurry(sim);
    const [a, b] = sim.state.players as [GameState["players"][0], GameState["players"][0]];
    a.x = 40;
    a.y = 200;
    b.x = 240;
    b.y = 200;
    const h = hurryEnemies(sim)[0]!;
    h.x = 200;
    h.y = 50;
    run(sim, 1);
    // nearest is b (40 right, 150 down): vertical dominates, so it moves straight down
    expect(h.x).toBe(200);
    expect(h.y).toBeCloseTo(50 + TUNING.hurryChaserSpeed, 9);
    // horizontal dominates now: nearest is a (80 left, 0 vertical)
    h.x = 100;
    h.y = 200;
    run(sim, 1);
    expect(h.y).toBe(200);
    expect(h.x).toBeCloseTo(100 - TUNING.hurryChaserSpeed, 9);
  });

  it("holds still with no alive player, and stays inside the field when chasing out of bounds", () => {
    const sim = new Sim([L1], 1, 1);
    toHurry(sim);
    const h = hurryEnemies(sim)[0]!;
    const p = sim.state.players[0]!;
    park(sim, 0);
    const { x, y } = h;
    run(sim, 5);
    expect([h.x, h.y]).toEqual([x, y]);
    p.state = "alive";
    p.invulnTicks = 1_000_000;
    p.x = -50;
    p.y = 100;
    run(sim, 2000);
    expect(h.x).toBe(TUNING.enemySize / 2);
    expect(h.y).toBeGreaterThanOrEqual(TUNING.enemySize / 2);
    expect(h.y).toBeLessThanOrEqual(FIELD_H - TUNING.enemySize / 2);
  });

  it("kills a vulnerable player on contact", () => {
    const sim = new Sim([L1], 1, 1);
    toHurry(sim);
    const p = sim.state.players[0]!;
    p.invulnTicks = 0;
    const h = hurryEnemies(sim)[0]!;
    h.x = p.x;
    h.y = p.y;
    const ev = run(sim, 1);
    expect(ev.some((e) => e.kind === "die")).toBe(true);
    expect(p.state).toBe("dying");
  });

  it("is untrappable: a launching bubble over it traps nothing", () => {
    const sim = new Sim([L1], 1, 1);
    sim.state.enemies = [];
    toHurry(sim);
    park(sim, 0);
    const h = hurryEnemies(sim)[0]!;
    sim.state.bubbles.push({
      id: sim.state.nextId++,
      x: h.x,
      y: h.y,
      vx: 1,
      vy: 0,
      kind: "normal",
      phase: "launch",
      ageTicks: 0,
      owner: 0,
    });
    run(sim, 3);
    expect(h.state).toBe("active");
    expect(sim.state.bubbles.every((b) => !b.trapped)).toBe(true);
  });

  it("does not count for round-clear: killing all real enemies clears and removes chasers", () => {
    const sim = new Sim([L1, L2], 1, 1);
    run(sim, 2);
    toHurry(sim);
    park(sim, 0);
    expect(hurryEnemies(sim)).toHaveLength(1);
    killAll(sim);
    const ev = run(sim, 1);
    expect(ev.some((e) => e.kind === "clear")).toBe(true);
    expect(hurryEnemies(sim)).toHaveLength(0);
  });

  it("does not count for the last-enemy anger rule", () => {
    // roundTicks stays below roundAngerTicks, so only the "last enemy" rule can anger a walker.
    const sim = new Sim([L1], 1, 1);
    run(sim, 2);
    park(sim, 0);
    sim.state.enemies.push({ ...sim.state.enemies[0]!, id: sim.state.nextId++, type: "hurry", angry: false, x: 20, y: 20 });
    run(sim, 3);
    const walker = sim.state.enemies.find((e) => e.type === "walker")!;
    expect(walker.angry).toBe(true); // lone walker is angry even though a chaser is alive
    expect(hurryEnemies(sim).every((e) => !e.angry)).toBe(true);
  });

  it("validateLevel flags a hurry spawn as invalid", () => {
    const bad = levelWith([{ type: "hurry", col: 10, row: 25, delayTicks: 0 }]);
    expect(validateLevel(bad).some((p) => p.includes("hurry"))).toBe(true);
  });
});

describe("game over, continue, end", () => {
  const exhaust = (sim: Sim) => {
    for (const p of sim.state.players) {
      p.lives = 0;
      p.state = "gone";
    }
  };

  it("all players gone sets phase gameover; gameplay stops but the tick still counts", () => {
    const sim = new Sim([L1], 1, 2);
    exhaust(sim);
    run(sim, 1);
    expect(sim.state.phase).toBe("gameover");
    const rt = sim.state.roundTicks;
    const tick = sim.state.tick;
    run(sim, 10);
    expect(sim.state.roundTicks).toBe(rt);
    expect(sim.state.tick).toBe(tick + 10);
  });

  it("one player gone while the other lives is not game over", () => {
    const sim = new Sim([L1], 1, 2);
    sim.state.players[1]!.state = "gone";
    run(sim, 5);
    expect(sim.state.phase).toBe("round");
  });

  it("continueRun zeroes scores, restores lives, keeps the round, emits continue", () => {
    const sim = new Sim([L1, L2], 1, 2);
    sim.loadRound(2);
    sim.state.players[0]!.score = 1234;
    sim.state.players[1]!.score = 99;
    exhaust(sim);
    run(sim, 1);
    expect(sim.state.phase).toBe("gameover");
    expect(sim.continueRun()).toEqual([{ kind: "continue" }]);
    expect(sim.state.phase).toBe("round");
    expect(sim.state.round).toBe(2);
    for (const p of sim.state.players) {
      expect(p.score).toBe(0);
      expect(p.lives).toBe(TUNING.startLives);
      expect(p.state).toBe("alive");
      expect(p.invulnTicks).toBe(TUNING.invulnTicks);
    }
    expect(sim.state.enemies).toHaveLength(1);
    run(sim, 3);
    expect(sim.state.phase).toBe("round");
    expect(sim.state.roundTicks).toBe(3);
  });

  it("endRun sets runOver and a later continueRun throws", () => {
    const sim = new Sim([L1], 1, 1);
    exhaust(sim);
    run(sim, 1);
    sim.endRun();
    expect(sim.state.runOver).toBe(true);
    expect(() => sim.continueRun()).toThrow(/gameover/);
  });

  it("continueRun and endRun throw outside gameover", () => {
    const sim = new Sim([L1], 1, 1);
    expect(() => sim.continueRun()).toThrow(/gameover/);
    expect(() => sim.endRun()).toThrow(/gameover/);
    expect(sim.state.runOver).toBe(false);
  });
});

describe("restore round trip", () => {
  const roundTrip = (sim: Sim): Sim =>
    Sim.restore(sim.levels, JSON.parse(JSON.stringify(sim.state)) as GameState);
  const sameFor = (a: Sim, b: Sim, ticks: number) => {
    for (let i = 0; i < ticks; i++) {
      expect(b.step([0, 0])).toEqual(a.step([0, 0]));
      expect(b.state).toEqual(a.state);
    }
  };

  it("a mid-clearing state continues identically through the round change", () => {
    const sim = new Sim([L1, L2], 7, 1);
    run(sim, 2);
    killAll(sim);
    run(sim, 40);
    expect(sim.state.phase).toBe("clearing");
    const copy = roundTrip(sim);
    sameFor(sim, copy, TUNING.clearTicks + 120);
    expect(copy.state.round).toBe(2);
  });

  it("a hurry-active state continues identically", () => {
    const sim = new Sim([L1], 7, 2);
    run(sim, 2);
    toHurry(sim);
    run(sim, 30);
    sameFor(sim, roundTrip(sim), 200);
    expect(hurryEnemies(sim)).toHaveLength(2);
  });
});
