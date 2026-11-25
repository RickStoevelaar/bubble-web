import { readdirSync, readFileSync, statSync } from "node:fs";
import { join } from "node:path";
import { describe, expect, it } from "vitest";
import { BTN, FIELD_W, Sim, TEST_LEVEL, TILE, TUNING, chainScore, spawnEffect } from "../src";
import type { BubbleState, EffectState, EnemyState, LevelData, SimEvent } from "../src";

const FLOOR_Y = 26 * TILE - TUNING.enemySize / 2;
const PLAYER_FLOOR_Y = 26 * TILE - 7;
const ALL: LevelData = { ...TEST_LEVEL, flags: { waterBubbles: true, fireBubbles: true, lightningBubbles: true } };
/** TEST_LEVEL with a solid wall column (col 20, rows 20-25) the bolt must pass through. */
const WALLED: LevelData = {
  ...TEST_LEVEL,
  tiles: TEST_LEVEL.tiles.map((r, i) => (i >= 20 && i <= 25 ? r.slice(0, 20) + "#" + r.slice(21) : r)),
};
const mk = (lv: LevelData, n = 1, players: 1 | 2 = 1, seed = 1): Sim => {
  const sim = new Sim(Array.from({ length: n }, () => lv), seed, players);
  sim.state.enemies = [];
  return sim;
};
const run = (sim: Sim, ticks: number, b: [number, number] = [0, 0]): SimEvent[] => {
  const ev: SimEvent[] = [];
  for (let i = 0; i < ticks; i++) ev.push(...sim.step(b));
  return ev;
};
const addEnemy = (sim: Sim, over: Partial<EnemyState>): EnemyState => {
  const e: EnemyState = {
    id: sim.state.nextId++, type: "walker", x: 200, y: FLOOR_Y, vx: 0, vy: 0, dir: 1, state: "active",
    angry: false, spawnDelay: 0, onGround: false, ...over,
  };
  sim.state.enemies.push(e);
  return e;
};
/** An enemy that never leaves "spawning": keeps the round from clearing. */
const sentinel = (sim: Sim): EnemyState => addEnemy(sim, { x: 40, y: 60, state: "spawning", spawnDelay: 1_000_000 });
const special = (sim: Sim, kind: BubbleState["kind"], x: number, y: number, over: Partial<BubbleState> = {}): BubbleState => {
  const b: BubbleState = {
    id: sim.state.nextId++, x, y, vx: 0, vy: -TUNING.bubbleRise, kind, phase: "float", ageTicks: 0, owner: 0, ...over,
  };
  sim.state.bubbles.push(b);
  return b;
};
const player = (sim: Sim, x: number, y = PLAYER_FLOOR_Y, id: 0 | 1 = 0) => {
  const p = sim.state.players[id]!;
  p.x = x;
  p.y = y;
  p.vx = 0;
  p.vy = 0;
  return p;
};
const pops = (ev: SimEvent[]) => ev.filter((e) => e.kind === "pop");
const countRng = (sim: Sim): { n: number } => {
  const c = { n: 0 };
  const orig = sim.rng.next.bind(sim.rng);
  sim.rng.next = () => {
    c.n++;
    return orig();
  };
  return c;
};

describe("special bubble spawning", () => {
  it("draws nothing from the rng before the first interval elapses", () => {
    const sim = mk(ALL);
    const before = sim.rng.getState();
    expect(sim.state.specialTimer).toBe(TUNING.specialFirstDelayTicks);
    run(sim, TUNING.specialFirstDelayTicks - 1);
    expect(sim.rng.getState()).toBe(before);
    expect(sim.state.bubbles).toHaveLength(0);
    run(sim, 1);
    expect(sim.rng.getState()).not.toBe(before);
    expect(sim.state.bubbles).toHaveLength(1);
  });

  it("draws exactly 4 values for an element bubble and 5 for a letter (interval, lane, side, kind[, letter])", () => {
    const seen = new Set<number>();
    for (let i = 0; i < 80 && seen.size < 2; i++) {
      const sim = mk(ALL, 1, 1, 100 + i);
      sim.state.specialTimer = 1;
      const c = countRng(sim);
      sim.step([0, 0]);
      const b = sim.state.bubbles[0]!;
      expect(c.n).toBe(b.kind === "letter" ? 5 : 4);
      seen.add(c.n);
    }
    expect([...seen].sort()).toEqual([4, 5]);
  });

  it("re-arms with a single draw and spawns nothing at the cap", () => {
    const sim = mk(ALL);
    for (let i = 0; i < TUNING.maxSpecialBubbles; i++) special(sim, "water", 100 + 30 * i, 100);
    sim.state.specialTimer = 1;
    const c = countRng(sim);
    sim.step([0, 0]);
    expect(c.n).toBe(1);
    expect(sim.state.bubbles).toHaveLength(TUNING.maxSpecialBubbles);
    expect(sim.state.specialTimer).toBeGreaterThanOrEqual(TUNING.specialIntervalMin - 1);
    expect(sim.state.specialTimer).toBeLessThan(TUNING.specialIntervalMax);
  });

  const spawnMany = (lv: LevelData, n: number, setup?: (sim: Sim) => void): BubbleState[] => {
    const sim = mk(lv, 1, 1, 7);
    setup?.(sim);
    const out: BubbleState[] = [];
    for (let i = 0; i < n; i++) {
      sim.state.bubbles = [];
      sim.state.specialTimer = 1;
      sim.step([0, 0]);
      out.push(...sim.state.bubbles);
    }
    return out;
  };

  it("gates kinds by the level flags; letters are always allowed", () => {
    expect(new Set(spawnMany(TEST_LEVEL, 60).map((b) => b.kind))).toEqual(new Set(["letter"]));
    const w = spawnMany({ ...TEST_LEVEL, flags: { waterBubbles: true } }, 120);
    expect(new Set(w.map((b) => b.kind))).toEqual(new Set(["water", "letter"]));
    const f = spawnMany({ ...TEST_LEVEL, flags: { fireBubbles: true, lightningBubbles: false } }, 120);
    expect(new Set(f.map((b) => b.kind))).toEqual(new Set(["fire", "letter"]));
  });

  it("letters are rarer than each allowed element kind", () => {
    const all = spawnMany(ALL, 600);
    const n = (k: string) => all.filter((b) => b.kind === k).length;
    for (const k of ["water", "fire", "lightning"]) {
      expect(n("letter")).toBeGreaterThan(0);
      expect(n("letter")).toBeLessThan(n(k));
    }
  });

  it("spawns at an edge inside the border columns, floating, owner 0", () => {
    for (const b of spawnMany(ALL, 80)) {
      expect([3 * TILE, FIELD_W - 3 * TILE]).toContain(b.x);
      expect(b.y).toBeGreaterThanOrEqual(TUNING.specialLaneMinY);
      expect(b.y).toBeLessThan(TUNING.specialLaneMinY + TUNING.specialLaneSpan);
      expect(b.phase).toBe("float");
      expect(b.owner).toBe(0);
      expect(b.trapped).toBeUndefined();
      expect(b.ageTicks).toBe(0);
      expect(b.kind === "letter" ? [0, 1, 2, 3, 4, 5].includes(b.letter!) : b.letter === undefined).toBe(true);
    }
  });

  it("favors letters the first alive player is still missing", () => {
    const all = spawnMany({ ...TEST_LEVEL }, 400, (sim) => {
      sim.state.players[0]!.letters = [true, true, true, true, true, false];
    }).filter((b) => b.kind === "letter");
    const n = (i: number) => all.filter((b) => b.letter === i).length;
    expect(n(5)).toBeGreaterThan(2 * n(1));
    expect(n(5)).toBeGreaterThan(2 * n(3));
  });

  it("drifts inward and lives specialBubbleLifeTicks, then vanishes without effect or score", () => {
    const sim = mk(ALL);
    sentinel(sim);
    sim.state.specialTimer = 1_000_000;
    const b = special(sim, "water", 24, 100);
    run(sim, 40);
    expect(b.x).toBeGreaterThan(24);
    const c = special(sim, "fire", 120, 100, { ageTicks: TUNING.bubbleLifeTicks + 10 });
    expect(sim.state.bubbles).toContain(c);
    c.ageTicks = TUNING.specialBubbleLifeTicks - 1;
    const ev = sim.step([0, 0]);
    expect(sim.state.bubbles).not.toContain(c);
    expect(sim.state.effects).toEqual([]);
    expect(sim.state.players[0]!.score).toBe(0);
    expect(ev.filter((e) => e.kind === "collect")).toEqual([]);
  });

  it("does not trap an enemy it floats through", () => {
    const sim = mk(ALL);
    const e = addEnemy(sim, { x: 120, y: 120 });
    const b = special(sim, "water", 120, 120);
    player(sim, 40);
    run(sim, 5);
    expect(e.state).toBe("active");
    expect(b.trapped).toBeUndefined();
  });
});

describe("touching special bubbles", () => {
  it("jumping down onto a water bubble bounces and leaves it; touching it pops it", () => {
    const sim = mk(ALL);
    sentinel(sim);
    sim.state.specialTimer = 1_000_000;
    const p = player(sim, 100, 100);
    const b = special(sim, "water", 100, 110);
    p.vy = 1;
    p.onGround = false;
    const ev = sim.step([BTN.J, 0]);
    expect(ev.some((e) => e.kind === "bounce")).toBe(true);
    expect(sim.state.bubbles).toContain(b);
    expect(sim.state.effects).toHaveLength(0);
    const ev2 = sim.step([0, 0]);
    expect(pops(ev2).some((e) => e.player === 0)).toBe(true);
    expect(sim.state.bubbles).not.toContain(b);
    expect(sim.state.effects).toHaveLength(1);
    expect(sim.state.effects[0]!.kind).toBe("water");
    expect(sim.state.effects[0]!.owner).toBe(0);
  });

  it("a letter bubble always collects, even when jumping down onto it", () => {
    const sim = mk(TEST_LEVEL);
    sentinel(sim);
    sim.state.specialTimer = 1_000_000;
    const p = player(sim, 100, 100);
    p.vy = 1;
    p.onGround = false;
    const b = special(sim, "letter", 100, 108, { letter: 2 });
    const ev = sim.step([BTN.J, 0]);
    expect(ev.some((e) => e.kind === "bounce")).toBe(false);
    expect(ev.filter((e) => e.kind === "collect")).toEqual([{ kind: "collect", player: 0, x: b.x, y: b.y }]);
    expect(p.letters).toEqual([false, false, true, false, false, false]);
    expect(sim.state.bubbles).not.toContain(b);
  });
});

describe("EXTEND letters", () => {
  const collect = (sim: Sim, letter: 0 | 1 | 2 | 3 | 4 | 5, id: 0 | 1 = 0) => {
    const p = sim.state.players[id]!;
    special(sim, "letter", p.x, p.y, { letter });
    return sim.step([0, 0]);
  };

  it("new players start with six false letters", () => {
    const sim = mk(TEST_LEVEL, 1, 2);
    for (const p of sim.state.players) expect(p.letters).toEqual([false, false, false, false, false, false]);
    const sim2 = mk(TEST_LEVEL);
    expect(sim2.addPlayer()).toBe(1);
    expect(sim2.state.players[1]!.letters).toHaveLength(6);
  });

  it("a duplicate changes nothing but removes the bubble and scores", () => {
    const sim = mk(TEST_LEVEL, 2);
    sentinel(sim);
    sim.state.specialTimer = 1_000_000;
    const p = player(sim, 100, 100);
    collect(sim, 0);
    expect(p.letters[0]).toBe(true);
    expect(p.score).toBe(0);
    special(sim, "letter", p.x, p.y, { letter: 0 });
    const ev = sim.step([0, 0]);
    expect(p.letters).toEqual([true, false, false, false, false, false]);
    expect(p.score).toBe(TUNING.duplicateLetterScore);
    expect(sim.state.bubbles).toHaveLength(0);
    expect(ev.filter((e) => e.kind === "collect")).toHaveLength(1);
    expect(sim.state.pendingRound).toBe(0);
  });

  it("the two E's are distinct letters", () => {
    const sim = mk(TEST_LEVEL, 2);
    sentinel(sim);
    sim.state.specialTimer = 1_000_000;
    const p = player(sim, 100, 100);
    collect(sim, 0);
    collect(sim, 3);
    expect(p.letters).toEqual([true, false, false, true, false, false]);
  });

  it("the sixth distinct letter grants one life, one oneup, skips to the next round and resets the letters", () => {
    const sim = mk(TEST_LEVEL, 3);
    sentinel(sim);
    sim.state.specialTimer = 1_000_000;
    const p = player(sim, 100, 100);
    p.letters = [true, true, true, true, true, false];
    const lives = p.lives;
    const ev = collect(sim, 5);
    expect(ev.filter((e) => e.kind === "oneup")).toEqual([{ kind: "oneup", player: 0 }]);
    expect(p.lives).toBe(lives + 1);
    expect(sim.state.round).toBe(2);
    expect(sim.state.pendingRound).toBe(0);
    expect(p.letters).toEqual([false, false, false, false, false, false]);
  });

  it("completing the set caps lives at maxLives and does not advance past the last round", () => {
    const sim = mk(TEST_LEVEL, 1);
    sentinel(sim);
    sim.state.specialTimer = 1_000_000;
    const p = player(sim, 100, 100);
    p.lives = TUNING.maxLives;
    p.letters = [true, true, true, true, true, false];
    const ev = collect(sim, 5);
    expect(p.lives).toBe(TUNING.maxLives);
    expect(ev.filter((e) => e.kind === "oneup")).toHaveLength(1);
    expect(sim.state.round).toBe(1);
    expect(sim.state.pendingRound).toBe(0);
  });

  it("a completing pickup on the same tick as a round clear advances exactly one round", () => {
    const sim = mk(TEST_LEVEL, 4);
    const p = player(sim, 100, 100);
    sim.state.enemiesSeen = true;
    p.letters = [true, true, true, true, true, false];
    special(sim, "letter", p.x, p.y, { letter: 5 });
    sim.step([0, 0]);
    expect(sim.state.round).toBe(2);
    expect(sim.state.phase).toBe("round");
    run(sim, 3);
    expect(sim.state.round).toBe(2);
  });

  it("two players keep separate letters", () => {
    const sim = mk(TEST_LEVEL, 2, 2);
    sentinel(sim);
    sim.state.specialTimer = 1_000_000;
    player(sim, 60, 100, 0);
    player(sim, 180, 100, 1);
    collect(sim, 1, 0);
    collect(sim, 4, 1);
    expect(sim.state.players[0]!.letters).toEqual([false, true, false, false, false, false]);
    expect(sim.state.players[1]!.letters).toEqual([false, false, false, false, true, false]);
  });

  it("letters persist across loadRound and reset on continueRun", () => {
    const sim = mk(TEST_LEVEL, 2);
    sim.state.players[0]!.letters = [true, false, true, false, false, false];
    sim.loadRound(2);
    expect(sim.state.players[0]!.letters).toEqual([true, false, true, false, false, false]);
    sim.state.phase = "gameover";
    sim.continueRun();
    expect(sim.state.players[0]!.letters).toEqual([false, false, false, false, false, false]);
  });
});

describe("water", () => {
  it("a popped water bubble falls, lands, flows the popper's way, kills a walker (chain score to the popper) and carries the player", () => {
    const sim = mk(ALL);
    sentinel(sim);
    sim.state.specialTimer = 1_000_000;
    const p = player(sim, 30);
    p.facing = 1;
    const walker = addEnemy(sim, { x: 65, y: FLOOR_Y });
    special(sim, "water", 31, 190);
    const ev = sim.step([0, 0]);
    const w = sim.state.effects[0]!;
    expect(w.kind).toBe("water");
    expect(w.dir).toBe(1);
    expect(pops(ev).length).toBe(1);
    let landed = false;
    const x0 = p.x;
    for (let i = 0; i < 50; i++) {
      ev.push(...sim.step([0, 0]));
      if (w.onGround) landed = true;
    }
    expect(landed).toBe(true);
    expect(walker.state).toBe("dead");
    expect(p.score).toBe(chainScore(1));
    expect(ev.filter((e) => e.kind === "pop" && e.player === 0 && Math.abs(e.x! - 65) < 20)).toHaveLength(1);
    expect(p.x).toBeGreaterThan(x0 + 10);
    expect(p.y).toBeCloseTo(PLAYER_FLOOR_Y, 0);
    run(sim, 250);
    expect(sim.state.items.some((i) => i.kind === "food" && i.value === 100)).toBe(true);
  });

  it("carries a player along the floor but never into a wall", () => {
    const sim = mk(ALL);
    sentinel(sim);
    sim.state.specialTimer = 1_000_000;
    const p = player(sim, 200);
    spawnEffect(sim.state, "water", 0, 200, 198, 1);
    for (let i = 0; i < TUNING.waterRangeTicks + 30; i++) {
      sim.step([0, 0]);
      expect(p.x).toBeLessThanOrEqual(240 - 7 + 1e-9);
      expect(p.x).toBeGreaterThanOrEqual(16 + 7);
    }
    expect(p.x).toBeGreaterThan(240 - 7 - 6);
    expect(sim.state.effects).toHaveLength(0);
  });

  it("flows leftwards for a left-facing popper and stops after its range", () => {
    const sim = mk(ALL);
    sentinel(sim);
    sim.state.specialTimer = 1_000_000;
    player(sim, 40, 100);
    const w = spawnEffect(sim.state, "water", 0, 220, 198, -1);
    run(sim, 20);
    expect(w.x).toBeLessThan(220);
    run(sim, TUNING.waterRangeTicks + 10);
    expect(sim.state.effects).not.toContain(w);
    expect(sim.state.effects).toHaveLength(0);
  });

  it("falls through a gap and dies below the field without wrapping", () => {
    const sim = mk(ALL);
    sentinel(sim);
    sim.state.specialTimer = 1_000_000;
    player(sim, 40, 100);
    const w = spawnEffect(sim.state, "water", 0, 128, 100, 1);
    let maxY = 0;
    for (let i = 0; i < 150 && sim.state.effects.includes(w); i++) {
      sim.step([0, 0]);
      if (!sim.state.effects.includes(w)) break;
      expect(w.y).toBeGreaterThanOrEqual(100);
      maxY = Math.max(maxY, w.y);
    }
    expect(sim.state.effects).toHaveLength(0);
    expect(maxY).toBeGreaterThan(200);
  });
});

describe("fire", () => {
  it("lands, spreads both ways up to the max, burns the full duration, kills crossing enemies once each, then goes out", () => {
    const sim = mk(ALL);
    sentinel(sim);
    sim.state.specialTimer = 1_000_000;
    player(sim, 40, 100);
    const a = addEnemy(sim, { x: 75, y: FLOOR_Y });
    const b = addEnemy(sim, { x: 95, y: FLOOR_Y });
    const f = spawnEffect(sim.state, "fire", 0, 60, 190, 1);
    const ev: SimEvent[] = [];
    let landedAt = -1;
    for (let i = 1; i < 400 && sim.state.effects.includes(f); i++) {
      ev.push(...sim.step([0, 0]));
      if (landedAt < 0 && f.onGround) landedAt = i;
      if (f.onGround && i === landedAt + TUNING.fireDurationTicks - 3) {
        expect(f.reachL).toBe(TUNING.fireMaxSpread);
        expect(f.reachR).toBe(TUNING.fireMaxSpread);
      }
    }
    expect(landedAt).toBeGreaterThan(0);
    expect(sim.state.effects).toHaveLength(0);
    expect(f.ageTicks).toBe(TUNING.fireDurationTicks);
    expect(a.state).toBe("dead");
    expect(b.state).toBe("dead");
    expect(sim.state.players[0]!.score).toBe(chainScore(1) + chainScore(2));
    expect(pops(ev)).toHaveLength(2);
  });

  it("never kills spawning, dead, hurry or boss enemies", () => {
    const sim = mk(ALL);
    sim.state.specialTimer = 1_000_000;
    player(sim, 40, 100);
    const spawning = addEnemy(sim, { x: 60, y: FLOOR_Y, state: "spawning", spawnDelay: 1_000_000 });
    const boss = addEnemy(sim, { x: 62, y: FLOOR_Y, type: "boss" });
    const hurry = addEnemy(sim, { x: 64, y: FLOOR_Y, type: "hurry" });
    const dead = addEnemy(sim, { x: 66, y: FLOOR_Y, state: "dead", deadTicks: 3 });
    spawnEffect(sim.state, "fire", 0, 63, FLOOR_Y, 1);
    run(sim, 12);
    expect(spawning.state).toBe("spawning");
    expect(boss.state).toBe("active");
    expect(hurry.state).toBe("active");
    expect(dead.deadTicks).toBeGreaterThan(3);
    expect(sim.state.players[0]!.score).toBe(0);
  });

  it("an enemy hit by two effects in the same tick dies once and scores once", () => {
    const sim = mk(ALL);
    sentinel(sim);
    sim.state.specialTimer = 1_000_000;
    player(sim, 40, 100);
    addEnemy(sim, { x: 60, y: FLOOR_Y });
    spawnEffect(sim.state, "fire", 0, 60, FLOOR_Y - 2, 1);
    spawnEffect(sim.state, "fire", 0, 61, FLOOR_Y - 2, 1);
    const ev = run(sim, 20);
    expect(pops(ev)).toHaveLength(1);
    expect(sim.state.players[0]!.score).toBe(chainScore(1));
  });
});

describe("lightning", () => {
  const bolt = (sim: Sim, popper: number, at: number, y = FLOOR_Y): SimEvent[] => {
    player(sim, popper);
    special(sim, "lightning", at, y);
    return sim.step([0, 0]);
  };

  it("kills only the first enemy in the band, nearest first, away from the popper", () => {
    const sim = mk(ALL);
    sentinel(sim);
    sim.state.specialTimer = 1_000_000;
    const far = addEnemy(sim, { x: 200, y: FLOOR_Y });
    const near = addEnemy(sim, { x: 150, y: FLOOR_Y });
    const behind = addEnemy(sim, { x: 40, y: FLOOR_Y });
    const ev = bolt(sim, 100, 108);
    expect(near.state).toBe("dead");
    expect(far.state).toBe("active");
    expect(behind.state).toBe("active");
    expect(pops(ev).filter((e) => e.player === 0)).toHaveLength(2); // the bubble itself + one kill
    expect(sim.state.players[0]!.score).toBe(chainScore(1));
    expect(sim.state.effects[0]!.kind).toBe("bolt");
    expect(sim.state.effects[0]!.dir).toBe(1);
  });

  it("goes left when the bubble is left of the popper", () => {
    const sim = mk(ALL);
    sentinel(sim);
    sim.state.specialTimer = 1_000_000;
    const right = addEnemy(sim, { x: 200, y: FLOOR_Y });
    const left = addEnemy(sim, { x: 40, y: FLOOR_Y });
    bolt(sim, 108, 100);
    expect(left.state).toBe("dead");
    expect(right.state).toBe("active");
    expect(sim.state.effects[0]!.dir).toBe(-1);
  });

  it("passes through walls", () => {
    const sim = mk({ ...WALLED, flags: ALL.flags });
    sentinel(sim);
    sim.state.specialTimer = 1_000_000;
    const e = addEnemy(sim, { x: 200, y: FLOOR_Y });
    bolt(sim, 100, 108);
    expect(e.state).toBe("dead");
  });

  it("hits nothing when no enemy is in the band", () => {
    const sim = mk(ALL);
    sentinel(sim);
    sim.state.specialTimer = 1_000_000;
    const e = addEnemy(sim, { x: 150, y: 120 });
    bolt(sim, 100, 108);
    expect(e.state).toBe("active");
    expect(sim.state.players[0]!.score).toBe(0);
  });

  it("lingers for boltVisualTicks as a visual effect", () => {
    const sim = mk(ALL);
    sentinel(sim);
    sim.state.specialTimer = 1_000_000;
    bolt(sim, 100, 108);
    run(sim, TUNING.boltVisualTicks - 2);
    expect(sim.state.effects).toHaveLength(1);
    run(sim, 1);
    expect(sim.state.effects).toHaveLength(0);
  });

  it("kills an enemy trapped in a bubble from the bubble's position and removes the bubble", () => {
    const sim = mk(ALL);
    sentinel(sim);
    sim.state.specialTimer = 1_000_000;
    const e = addEnemy(sim, { x: 150, y: 100, state: "trapped" });
    const b: BubbleState = {
      id: sim.state.nextId++, x: 150, y: 100, vx: 0, vy: -TUNING.bubbleRise, kind: "normal", phase: "float",
      ageTicks: 0, owner: 0, trapped: { type: "walker", escapeIn: 100_000, enemyId: e.id },
    };
    sim.state.bubbles.push(b);
    player(sim, 40);
    const ev: SimEvent[] = [];
    spawnEffect(sim.state, "bolt", 0, 100, 100, 1);
    ev.push(...sim.step([0, 0]));
    expect(e.state).toBe("dead");
    expect(sim.state.bubbles).not.toContain(b);
    expect(Math.abs(e.x - 150)).toBeLessThan(3);
    expect(Math.abs(e.y - 100)).toBeLessThan(3);
    const p = pops(ev)[0]!;
    expect(Math.abs(p.x! - 150)).toBeLessThan(3);
    expect(p.player).toBe(0);
  });
});

describe("clearing and restore", () => {
  it("loadRound clears effects and specials and re-arms the timer without drawing", () => {
    const sim = mk(ALL, 2);
    spawnEffect(sim.state, "fire", 0, 60, 100, 1);
    special(sim, "water", 100, 100);
    sim.state.specialTimer = 5;
    const rng = sim.rng.getState();
    sim.loadRound(2);
    expect(sim.state.effects).toEqual([]);
    expect(sim.state.bubbles).toEqual([]);
    expect(sim.state.specialTimer).toBe(TUNING.specialFirstDelayTicks);
    expect(sim.rng.getState()).toBe(rng);
  });

  it("round clear removes live effects and special bubbles", () => {
    const sim = mk(ALL, 2);
    sim.state.enemiesSeen = true;
    player(sim, 40, 100);
    spawnEffect(sim.state, "fire", 0, 120, 100, 1);
    special(sim, "water", 200, 100);
    sim.step([0, 0]);
    expect(sim.state.phase).toBe("clearing");
    expect(sim.state.effects).toEqual([]);
    expect(sim.state.bubbles.filter((b) => b.kind !== "normal")).toEqual([]);
  });

  const setupLive = (sim: Sim) => {
    sim.state.players[0]!.letters = [true, false, true, false, false, false];
    player(sim, 40, PLAYER_FLOOR_Y);
    addEnemy(sim, { x: 150, y: FLOOR_Y });
    addEnemy(sim, { x: 200, y: FLOOR_Y, type: "chaser" });
    sentinel(sim);
    special(sim, "water", 60, 100);
    special(sim, "letter", 190, 90, { letter: 3 });
    special(sim, "lightning", 120, 60);
    spawnEffect(sim.state, "water", 0, 80, 150, 1);
    spawnEffect(sim.state, "fire", 1, 180, 150, -1);
    spawnEffect(sim.state, "bolt", 0, 30, 130, 1);
    sim.state.specialTimer = 30;
  };
  const inputs = (i: number): [number, number] => [(i % 50 < 25 ? BTN.R : BTN.L) | (i % 37 === 0 ? BTN.J : 0) | (i % 41 === 0 ? BTN.F : 0), 0];

  it("a JSON round-trip with live specials and effects continues identically for 300 ticks", () => {
    const sim = mk(ALL, 1, 2, 5);
    setupLive(sim);
    run(sim, 3);
    expect(new Set(sim.state.effects.map((e) => e.kind))).toEqual(new Set(["water", "fire", "bolt"]));
    const restored = Sim.restore([ALL], JSON.parse(JSON.stringify(sim.state)));
    expect(JSON.stringify(restored.state)).toBe(JSON.stringify(sim.state));
    for (let i = 0; i < 300; i++) {
      const a = sim.step(inputs(i));
      const b = restored.step(inputs(i));
      expect(JSON.stringify(b)).toBe(JSON.stringify(a));
      expect(JSON.stringify(restored.state)).toBe(JSON.stringify(sim.state));
    }
  });

  it("older saves get defaults and malformed effects are repaired", () => {
    const sim = mk(ALL);
    const old: Record<string, unknown> = JSON.parse(JSON.stringify(sim.state));
    delete old.specialTimer;
    delete old.effects;
    for (const p of old.players as Record<string, unknown>[]) delete p.letters;
    const r = Sim.restore([ALL], old as never);
    expect(Number.isFinite(r.state.specialTimer)).toBe(true);
    expect(r.state.effects).toEqual([]);
    expect(r.state.players[0]!.letters).toEqual([false, false, false, false, false, false]);
    expect(() => r.step([0, 0])).not.toThrow();

    const dmg: Record<string, unknown> = JSON.parse(JSON.stringify(sim.state));
    dmg.effects = [
      { id: 1, kind: "nope", x: 1, y: 1 },
      { id: 2, kind: "water", x: NaN, y: 1 },
      { id: 3, kind: "water", x: 10, y: Infinity },
      { id: 4, kind: "fire", x: 50, y: 100, dir: 7 },
      null,
    ];
    (dmg.players as Record<string, unknown>[])[0]!.letters = [true, "x", 1];
    const r2 = Sim.restore([ALL], dmg as never);
    expect(r2.state.effects.map((e: EffectState) => e.id)).toEqual([4]);
    expect(r2.state.effects[0]!.kind).toBe("fire");
    expect(r2.state.effects[0]!.dir).toBe(1);
    expect(Object.keys(r2.state.effects[0]!)).toEqual(Object.keys(spawnEffect(sim.state, "fire", 0, 1, 1, 1)));
    expect(r2.state.players[0]!.letters).toEqual([true, false, false, false, false, false]);
  });
});

describe("source guards", () => {
  it("specials.ts uses no banned Math functions, exponentiation or non-sim randomness", () => {
    const f = join(__dirname, "..", "src", "sim", "specials.ts");
    expect(statSync(f).isFile()).toBe(true);
    const text = readFileSync(f, "utf8").replace(/\/\*[\s\S]*?\*\//g, "").replace(/\/\/.*$/gm, "");
    expect(text).not.toMatch(/Math\.(hypot|sin|cos|tan|atan2?|pow|exp|log\w*|random)\b|\*\*|Date/);
    expect(readdirSync(join(__dirname, "..", "src", "sim"))).toContain("specials.ts");
  });
});
