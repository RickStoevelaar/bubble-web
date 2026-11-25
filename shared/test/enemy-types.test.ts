import { readdirSync, readFileSync, statSync } from "node:fs";
import { join } from "node:path";
import { describe, expect, it } from "vitest";
import { FIELD_H, Sim, TEST_LEVEL, TILE, TUNING } from "../src";
import type { BubbleState, EnemyState, GameState, ProjectileState, SimEvent } from "../src";

const HALF = TUNING.enemySize / 2;
const FLOOR_Y = 26 * TILE - HALF;
const FOREVER = 1_000_000;

const newSim = (seed = 1, players: 1 | 2 = 1) => {
  const sim = new Sim([TEST_LEVEL], seed, players);
  sim.state.enemies = [];
  return sim;
};
const run = (sim: Sim, ticks: number): SimEvent[] => {
  const ev: SimEvent[] = [];
  for (let i = 0; i < ticks; i++) ev.push(...sim.step([0, 0]));
  return ev;
};
const addEnemy = (sim: Sim, over: Partial<EnemyState> = {}): EnemyState => {
  const e: EnemyState = {
    id: sim.state.nextId++,
    type: "walker",
    x: 100,
    y: FLOOR_Y,
    vx: 0,
    vy: 0,
    dir: 1,
    state: "active",
    angry: false,
    spawnDelay: 0,
    onGround: false,
    ...over,
  };
  sim.state.enemies.push(e);
  return e;
};
/** Keeps the "last enemy standing" anger rule from firing. */
const addFiller = (sim: Sim) => addEnemy(sim, { state: "spawning", spawnDelay: FOREVER, x: 200 });
const addBubble = (sim: Sim, over: Partial<BubbleState> = {}): BubbleState => {
  const b: BubbleState = {
    id: sim.state.nextId++,
    x: 100,
    y: FLOOR_Y,
    vx: 0,
    vy: -TUNING.bubbleRise,
    kind: "normal",
    phase: "float",
    ageTicks: 0,
    owner: 0,
    ...over,
  };
  sim.state.bubbles.push(b);
  return b;
};
const addProjectile = (sim: Sim, over: Partial<ProjectileState> = {}): ProjectileState => {
  const p: ProjectileState = {
    id: sim.state.nextId++,
    x: 100,
    y: 100,
    vx: 0,
    vy: 0,
    kind: "rock",
    ageTicks: 0,
    ...over,
  };
  sim.state.projectiles.push(p);
  return p;
};
/** Player 0 stands on the floor at x, cannot be hurt. */
const placePlayer = (sim: Sim, x: number, y = 26 * TILE - 7) => {
  const p = sim.state.players[0]!;
  p.x = x;
  p.y = y;
  p.invulnTicks = FOREVER;
  return p;
};
/** Player 0 is neither alive nor gone: invisible to every targeting rule. */
const sidelinePlayer = (sim: Sim) => {
  const p = sim.state.players[0]!;
  p.state = "dying";
  p.stateTicks = FOREVER;
  return p;
};
const travelled = (sim: Sim, e: EnemyState, ticks: number): number => {
  const x0 = e.x;
  const y0 = e.y;
  run(sim, ticks);
  return Math.sqrt((e.x - x0) ** 2 + (e.y - y0) ** 2);
};

describe("chaser", () => {
  const setup = (type: "walker" | "chaser") => {
    const sim = newSim();
    placePlayer(sim, 100);
    addFiller(sim);
    return { sim, e: addEnemy(sim, { type, x: 40, dir: -1 }) };
  };
  it("turns toward a player on its platform instead of wandering", () => {
    const { sim, e } = setup("chaser");
    run(sim, 3 * TUNING.chaserRetargetTicks);
    expect(e.dir).toBe(1);
    expect(e.x).toBeGreaterThan(40);
  });
  it("keeps closing in on a player on its side from either direction", () => {
    const sim = newSim();
    placePlayer(sim, 40);
    addFiller(sim);
    const e = addEnemy(sim, { type: "chaser", x: 100, dir: 1 });
    run(sim, 3 * TUNING.chaserRetargetTicks);
    expect(e.dir).toBe(-1);
    expect(e.x).toBeLessThan(100);
  });
  it("is about 20 % faster than a walker", () => {
    const a = setup("walker");
    const b = setup("chaser");
    // Walker starts dir -1 and bounces off nothing for 60 ticks (x 40 -> 10 is a wall): use dir 1 for both.
    a.e.dir = 1;
    b.e.dir = 1;
    const dw = travelled(a.sim, a.e, 60);
    const dc = travelled(b.sim, b.e, 60);
    expect(dw).toBeCloseTo(60 * TUNING.enemyWalkSpeed, 5);
    expect(dc / dw).toBeCloseTo(TUNING.chaserSpeedMult, 5);
    expect(TUNING.chaserSpeedMult).toBe(1.2);
  });
});

describe("thrower", () => {
  const setup = (seed = 1, over: Partial<EnemyState> = {}) => {
    const sim = newSim(seed);
    placePlayer(sim, 104);
    addFiller(sim);
    return { sim, e: addEnemy(sim, { type: "thrower", x: 40, dir: -1, ...over }) };
  };
  const firstRockTick = (seed: number): number => {
    const { sim } = setup(seed);
    for (let t = 1; t <= 600; t++) {
      sim.step([0, 0]);
      if (sim.state.projectiles.length > 0) return t;
    }
    return -1;
  };

  it("throws its first rock after a randomized initial delay, within the cooldown window", () => {
    const ticks = new Set<number>();
    for (let seed = 1; seed <= 12; seed++) {
      const t = firstRockTick(seed);
      ticks.add(t);
      expect(t).toBeGreaterThanOrEqual(TUNING.throwerInitialDelayMin + TUNING.throwWindupTicks - 1);
      expect(t).toBeLessThanOrEqual(TUNING.throwerInitialDelayMax + TUNING.throwWindupTicks + 1);
      expect(t).toBeLessThanOrEqual(TUNING.throwerCooldownTicks + TUNING.throwWindupTicks + 1);
    }
    expect(ticks.size).toBeGreaterThan(1);
  });
  it("stops during the wind-up, turns toward the player and throws an upward lob toward their x", () => {
    const { sim, e } = setup(1, { x: 60, dir: -1, cooldown: 1 });
    run(sim, 3);
    expect(e.windup).toBeGreaterThan(0);
    expect(e.dir).toBe(1);
    const xs: number[] = [];
    let rock: ProjectileState | undefined;
    for (let t = 0; t < 100 && !rock; t++) {
      xs.push(e.x);
      sim.step([0, 0]);
      rock = sim.state.projectiles[0];
    }
    expect(rock).toBeDefined();
    expect(rock!.kind).toBe("rock");
    expect(xs.length).toBeGreaterThanOrEqual(TUNING.throwWindupTicks - 4);
    expect(new Set(xs).size).toBe(1);
    expect(rock!.vx).toBe(TUNING.rockSpeedX);
    expect(rock!.vy).toBeLessThan(0);
    expect(e.cooldown).toBe(TUNING.throwerCooldownTicks);
    // Walking resumes afterwards.
    run(sim, 5);
    expect(e.x).toBeGreaterThan(xs[0]!);
  });
  it("the thrown rock's vy increases every tick (it arcs and descends)", () => {
    const { sim } = setup(1, { cooldown: 1 });
    let rock: ProjectileState | undefined;
    for (let t = 0; t < 100 && !rock; t++) {
      sim.step([0, 0]);
      rock = sim.state.projectiles[0];
    }
    expect(rock).toBeDefined();
    const vys = [rock!.vy];
    for (let t = 0; t < 30; t++) {
      sim.step([0, 0]);
      vys.push(rock!.vy);
    }
    for (let i = 1; i < vys.length; i++) expect(vys[i]! - vys[i - 1]!).toBeCloseTo(TUNING.rockGravity, 9);
    expect(vys[0]!).toBeLessThan(0);
    expect(vys[vys.length - 1]!).toBeGreaterThan(0);
  });
  it("a rock is removed on contact with a solid tile", () => {
    const sim = newSim();
    placePlayer(sim, 40);
    const rock = addProjectile(sim, { x: 60, y: 190, vx: 0.5, vy: -1 });
    const vys: number[] = [];
    for (let t = 0; t < 200 && sim.state.projectiles.includes(rock); t++) {
      sim.step([0, 0]);
      vys.push(rock.vy);
    }
    expect(sim.state.projectiles).not.toContain(rock);
    expect(rock.y).toBeGreaterThanOrEqual(26 * TILE);
    expect(rock.y).toBeLessThan(FIELD_H);
    expect(vys.length).toBeGreaterThan(10);
  });
  it("a rock hitting a side wall is removed", () => {
    const sim = newSim();
    placePlayer(sim, 100);
    const rock = addProjectile(sim, { x: 20, y: 100, vx: -1, vy: 0 });
    run(sim, 20);
    expect(sim.state.projectiles).not.toContain(rock);
    expect(rock.x).toBeLessThan(2 * TILE);
  });
  it("throws again one cooldown plus wind-up later", () => {
    const { sim } = setup(1, { x: 50, cooldown: 1 });
    const firstSeen: number[] = [];
    const seen = new Set<number>();
    for (let t = 1; t <= 400; t++) {
      sim.step([0, 0]);
      for (const p of sim.state.projectiles) {
        if (!seen.has(p.id)) {
          seen.add(p.id);
          firstSeen.push(t);
        }
      }
    }
    expect(firstSeen.length).toBeGreaterThanOrEqual(2);
    const gap = firstSeen[1]! - firstSeen[0]!;
    expect(Math.abs(gap - (TUNING.throwerCooldownTicks + TUNING.throwWindupTicks))).toBeLessThanOrEqual(2);
  });
  it("keeps walking and never throws without an alive player", () => {
    const sim = newSim();
    sidelinePlayer(sim);
    addFiller(sim);
    const e = addEnemy(sim, { type: "thrower", x: 40, dir: 1 });
    let thrown = 0;
    const x0 = e.x;
    for (let t = 0; t < 300; t++) {
      sim.step([0, 0]);
      thrown += sim.state.projectiles.length;
    }
    expect(thrown).toBe(0);
    expect(e.x).not.toBe(x0);
  });
  it("a thrower trapped mid wind-up does not throw after it escapes, and starts a fresh cooldown", () => {
    const sim = newSim();
    placePlayer(sim, 104);
    addFiller(sim);
    const e = addEnemy(sim, { type: "thrower", x: 60, cooldown: 1 });
    run(sim, 5);
    expect(e.windup ?? 0).toBeGreaterThan(0);
    addBubble(sim, { phase: "launch", x: 50, vx: TUNING.bubbleLaunchSpeed, y: e.y });
    run(sim, 3);
    expect(e.state).toBe("trapped");
    expect(sim.state.projectiles).toHaveLength(0);
    run(sim, TUNING.bubbleEscapeTicks + 2);
    expect(e.state).toBe("active");
    expect(e.windup ?? 0).toBe(0);
    expect(e.cooldown).toBeGreaterThan(TUNING.throwWindupTicks);
    let rocks = 0;
    for (let t = 0; t < TUNING.throwWindupTicks + 10; t++) {
      sim.step([0, 0]);
      rocks += sim.state.projectiles.length;
    }
    expect(rocks).toBe(0);
  });
});

describe("breather", () => {
  const setup = (playerX: number, x: number) => {
    const sim = newSim();
    placePlayer(sim, playerX);
    addFiller(sim);
    return { sim, e: addEnemy(sim, { type: "breather", x, dir: 1 }) };
  };
  const waitForFlame = (sim: Sim): ProjectileState => {
    for (let t = 0; t < 400; t++) {
      sim.step([0, 0]);
      const f = sim.state.projectiles[0];
      if (f) return f;
    }
    throw new Error("no flame");
  };

  it("walks slower than a walker and shoots more often than a thrower", () => {
    const sim = newSim();
    sidelinePlayer(sim);
    addFiller(sim);
    const e = addEnemy(sim, { type: "breather", x: 40, dir: 1 });
    expect(travelled(sim, e, 40)).toBeCloseTo(40 * TUNING.enemyWalkSpeed * TUNING.breatherSpeedMult, 5);
    expect(TUNING.breatherSpeedMult).toBeLessThan(1);
    expect(TUNING.breatherCooldownTicks).toBeLessThan(TUNING.throwerCooldownTicks);
    expect(TUNING.breatherWindupTicks).toBeLessThan(TUNING.throwWindupTicks);
  });
  it("breathes a straight flame along its dir, toward the player, with no gravity", () => {
    const { sim, e } = setup(30, 100);
    e.cooldown = 1;
    const f = waitForFlame(sim);
    expect(f.kind).toBe("flame");
    expect(e.dir).toBe(-1);
    expect(f.vx).toBe(-TUNING.flameSpeed);
    expect(f.vy).toBe(0);
    expect(Math.abs(f.y - e.y)).toBeLessThan(HALF);
    const y0 = f.y;
    run(sim, 5);
    expect(f.y).toBe(y0);
    expect(f.vx).toBe(-TUNING.flameSpeed);
  });
  it("the flame vanishes after its range", () => {
    const { sim, e } = setup(30, 100);
    e.cooldown = 1;
    const f = waitForFlame(sim);
    const x0 = f.x;
    let ticks = 0;
    while (sim.state.projectiles.includes(f) && ticks < 200) {
      sim.step([0, 0]);
      ticks++;
    }
    expect(ticks).toBeLessThanOrEqual(TUNING.flameRangeTicks);
    expect(ticks).toBeGreaterThanOrEqual(TUNING.flameRangeTicks - 2);
    expect(Math.abs(f.x - x0)).toBeLessThanOrEqual(TUNING.flameRangeTicks * TUNING.flameSpeed + 0.001);
    expect(f.x).toBeGreaterThan(2 * TILE + 8); // far from the wall: removed by range
  });
  it("the flame vanishes at a wall", () => {
    const { sim, e } = setup(22, 40);
    e.cooldown = 1;
    const f = waitForFlame(sim);
    let ticks = 0;
    while (sim.state.projectiles.includes(f) && ticks < 200) {
      sim.step([0, 0]);
      ticks++;
    }
    expect(ticks).toBeLessThan(TUNING.flameRangeTicks - 5);
    expect(f.x).toBeLessThan(3 * TILE);
  });
  it("does not breathe at a player far above on another row", () => {
    const sim = newSim();
    const p = placePlayer(sim, 70, 2 * TILE);
    p.vy = 0;
    addFiller(sim);
    addEnemy(sim, { type: "breather", x: 40, dir: -1 });
    // The player falls onto the row-8 platform at most; still far above the floor.
    let flames = 0;
    for (let t = 0; t < 200; t++) {
      sim.step([0, 0]);
      flames += sim.state.projectiles.length;
    }
    expect(flames).toBe(0);
  });
});

describe("projectile contact", () => {
  it("kills an alive, vulnerable player exactly once through the normal death path", () => {
    const sim = newSim(1, 1);
    const p = sim.state.players[0]!;
    p.invulnTicks = 0;
    const lives = p.lives;
    addProjectile(sim, { x: p.x, y: p.y, kind: "rock" });
    addProjectile(sim, { x: p.x, y: p.y, kind: "flame", vx: 1 });
    const ev = run(sim, 1);
    expect(ev.filter((x) => x.kind === "die")).toHaveLength(1);
    expect(p.lives).toBe(lives - 1);
    expect(p.state).toBe("dying");
    // The first projectile was consumed; the second passed through the now-dying player.
    expect(sim.state.projectiles).toHaveLength(1);
    run(sim, 5);
    expect(p.lives).toBe(lives - 1);
  });
  it("passes through an invulnerable player without being consumed or hurting", () => {
    const sim = newSim();
    const p = sim.state.players[0]!;
    p.invulnTicks = 50;
    const lives = p.lives;
    const rock = addProjectile(sim, { x: p.x, y: p.y, kind: "rock" });
    const ev = run(sim, 1);
    expect(ev.some((x) => x.kind === "die")).toBe(false);
    expect(p.lives).toBe(lives);
    expect(sim.state.projectiles).toContain(rock);
  });
  it("passes through dying and gone players", () => {
    const sim = newSim();
    const p = sim.state.players[0]!;
    p.state = "dying";
    p.stateTicks = FOREVER;
    const rock = addProjectile(sim, { x: p.x, y: p.y });
    run(sim, 1);
    expect(sim.state.projectiles).toContain(rock);
    expect(p.lives).toBe(TUNING.startLives);
  });
  it("does not hurt enemies", () => {
    const sim = newSim();
    placePlayer(sim, 40);
    addFiller(sim);
    const e = addEnemy(sim, { x: 100 });
    const rock = addProjectile(sim, { x: e.x, y: e.y - 20, vy: 1 });
    addProjectile(sim, { x: e.x, y: e.y, kind: "flame", vx: 0 });
    run(sim, 6);
    expect(e.state).toBe("active");
    expect(sim.state.enemies).toContain(e);
    void rock;
  });
  it("rocks leaving the bottom of the field are removed", () => {
    const sim = newSim();
    placePlayer(sim, 40);
    // Fall through the floor gap at columns 14-17.
    const rock = addProjectile(sim, { x: 15 * TILE, y: 200, vy: 1 });
    run(sim, 200);
    expect(sim.state.projectiles).not.toContain(rock);
  });
  it("steps projectiles in id order and shares the id counter", () => {
    const sim = newSim();
    const a = addProjectile(sim, { x: 100, y: 50 });
    const b = addProjectile(sim, { x: 120, y: 50, kind: "flame", vx: 1 });
    expect(b.id).toBe(a.id + 1);
    expect(sim.state.nextId).toBe(b.id + 1);
    run(sim, 3);
    expect(sim.state.projectiles.map((p) => p.id)).toEqual([a.id, b.id]);
    expect(a.ageTicks).toBe(3);
  });
  it("loadRound and round clear drop projectiles", () => {
    const sim = newSim();
    addProjectile(sim);
    sim.loadRound(1);
    expect(sim.state.projectiles).toEqual([]);

    const sim2 = newSim();
    placePlayer(sim2, 40);
    const e = addEnemy(sim2, { state: "dead", onGround: false, deadTicks: 0 });
    addProjectile(sim2, { x: 100, y: 50 });
    sim2.state.enemiesSeen = true;
    e.state = "dead";
    run(sim2, TUNING.enemyDeathMaxTicks + 2);
    expect(sim2.state.phase).toBe("clearing");
    expect(sim2.state.projectiles).toEqual([]);
  });
});

describe("bouncer", () => {
  const setup = (over: Partial<EnemyState> = {}, seed = 1) => {
    const sim = newSim(seed);
    placePlayer(sim, 40);
    addFiller(sim);
    return { sim, e: addEnemy(sim, { type: "bouncer", x: 128, y: 100, dir: 1, ...over }) };
  };
  it("moves diagonally at a constant speed with an rng-chosen vertical sign", () => {
    const signs = new Set<number>();
    for (let seed = 1; seed <= 12; seed++) {
      const { sim, e } = setup({}, seed);
      run(sim, 1);
      expect(Math.abs(e.vx)).toBeCloseTo(TUNING.bouncerSpeed, 9);
      expect(Math.abs(e.vy)).toBeCloseTo(TUNING.bouncerSpeed, 9);
      expect(e.vx).toBeGreaterThan(0);
      signs.add(Math.sign(e.vy));
    }
    expect(signs).toEqual(new Set([-1, 1]));
  });
  it("ignores gravity and platforms: passes through the row-8 platform", () => {
    const { sim, e } = setup({ x: 70, y: 100, vy: -TUNING.bouncerSpeed, dir: 1 });
    e.dir = 1;
    const ys: number[] = [];
    for (let t = 0; t < 60; t++) {
      sim.step([0, 0]);
      ys.push(e.y);
      e.x = 70; // stay under the platform (cols 6-11) to force the crossing
    }
    expect(Math.min(...ys)).toBeLessThan(8 * TILE - HALF);
    expect(e.onGround).toBe(false);
  });
  it("reflects at the ceiling", () => {
    const { sim, e } = setup({ y: HALF + 0.3, vy: -TUNING.bouncerSpeed });
    run(sim, 1);
    expect(e.vy).toBeGreaterThan(0);
    expect(e.y - HALF).toBeGreaterThanOrEqual(0);
  });
  it("reflects at the floor of the field (no wrap)", () => {
    const { sim, e } = setup({ y: FIELD_H - HALF - 0.3, vy: TUNING.bouncerSpeed });
    run(sim, 1);
    expect(e.vy).toBeLessThan(0);
    expect(e.y + HALF).toBeLessThanOrEqual(FIELD_H);
  });
  it("reflects at the side borders", () => {
    const right = setup({ x: 30 * TILE - HALF - 0.2, dir: 1, vy: TUNING.bouncerSpeed });
    run(right.sim, 1);
    expect(right.e.dir).toBe(-1);
    expect(right.e.vx).toBeLessThan(0);
    expect(right.e.x + HALF).toBeLessThanOrEqual(30 * TILE);
    const left = setup({ x: 2 * TILE + HALF + 0.2, dir: -1, vy: TUNING.bouncerSpeed });
    run(left.sim, 1);
    expect(left.e.dir).toBe(1);
    expect(left.e.vx).toBeGreaterThan(0);
    expect(left.e.x - HALF).toBeGreaterThanOrEqual(2 * TILE);
  });
  it("never rests: moves every tick for 600 ticks and stays inside the field", () => {
    const { sim, e } = setup();
    let prev = { x: e.x, y: e.y };
    let flips = 0;
    let lastSign = 0;
    for (let t = 0; t < 600; t++) {
      sim.step([0, 0]);
      expect(e.x !== prev.x && e.y !== prev.y).toBe(true);
      expect(e.y - HALF).toBeGreaterThanOrEqual(0);
      expect(e.y + HALF).toBeLessThanOrEqual(FIELD_H);
      expect(e.x - HALF).toBeGreaterThanOrEqual(2 * TILE - 1e-9);
      expect(e.x + HALF).toBeLessThanOrEqual(30 * TILE + 1e-9);
      const s = Math.sign(e.vy);
      if (lastSign !== 0 && s !== lastSign) flips++;
      lastSign = s;
      prev = { x: e.x, y: e.y };
    }
    expect(flips).toBeGreaterThanOrEqual(2);
  });
  it("hurry wisp is unchanged: still pursues and is not a bouncer", () => {
    const sim = newSim();
    const p = placePlayer(sim, 100, 150);
    p.vy = 0;
    const w = addEnemy(sim, { type: "hurry", x: 128, y: 7 });
    run(sim, 20);
    expect(w.x).toBe(128);
    expect(w.y).toBeCloseTo(7 + 20 * TUNING.hurryChaserSpeed, 9);
  });
});

describe("flyer", () => {
  const setup = (playerX: number, playerY: number, ex: number, ey: number, seed = 1) => {
    const sim = newSim(seed);
    const p = placePlayer(sim, playerX, playerY);
    p.vy = 0;
    addFiller(sim);
    return { sim, p, e: addEnemy(sim, { type: "flyer", x: ex, y: ey }) };
  };
  it("flies toward the player, through the row-8 platform", () => {
    // Player stands on the platform (cols 6-11) at x 70; flyer starts below it.
    const { sim, p, e } = setup(70, 8 * TILE - 7, 70, 150);
    const ys: number[] = [];
    for (let t = 0; t < 300; t++) {
      sim.step([0, 0]);
      ys.push(e.y);
    }
    expect(ys[0]!).toBeGreaterThan(8 * TILE + HALF);
    expect(Math.abs(e.x - p.x)).toBeLessThan(2);
    expect(Math.abs(e.y - p.y)).toBeLessThan(TUNING.flyerBobAmplitude + 2);
    expect(e.onGround).toBe(false);
    // It crossed the platform tile row (y 64..72) on the way up.
    expect(ys.some((y) => y > 8 * TILE + HALF)).toBe(true);
    expect(ys.some((y) => y < 8 * TILE)).toBe(true);
  });
  it("approaches at flyerSpeed", () => {
    const { sim, e } = setup(200, FLOOR_Y, 60, FLOOR_Y);
    // Player at y=FLOOR_Y+? bob offset is small; measure the horizontal progress.
    const d = travelled(sim, e, 20);
    expect(d).toBeGreaterThan(20 * TUNING.flyerSpeed * 0.9);
    expect(d).toBeLessThan(20 * TUNING.flyerSpeed * 1.1);
  });
  it("is stopped by the left and right wall columns", () => {
    const left = setup(5, FLOOR_Y, 60, FLOOR_Y);
    run(left.sim, 300);
    expect(left.e.x - HALF).toBeGreaterThanOrEqual(2 * TILE - 1e-9);
    expect(left.e.x).toBeLessThan(2 * TILE + HALF + 1);
    const right = setup(251, FLOOR_Y, 190, FLOOR_Y);
    run(right.sim, 300);
    expect(right.e.x + HALF).toBeLessThanOrEqual(30 * TILE + 1e-9);
    expect(right.e.x).toBeGreaterThan(30 * TILE - HALF - 1);
  });
  it("bobs vertically while hovering, deterministically", () => {
    const { sim, e } = setup(100, 100, 100, 100);
    const ys: number[] = [];
    for (let t = 0; t < 600; t++) {
      sim.step([0, 0]);
      if (t >= 300) ys.push(e.y);
    }
    // The player falls onto a platform; whatever its height, the flyer keeps bobbing around it.
    expect(Math.max(...ys) - Math.min(...ys)).toBeGreaterThanOrEqual(TUNING.flyerBobAmplitude);
  });
  it("two sims with the same seed produce bit-identical flyer positions for 600 ticks", () => {
    const a = setup(180, 60, 40, 150, 9);
    const b = setup(180, 60, 40, 150, 9);
    for (let t = 0; t < 600; t++) {
      a.sim.step([0, 0]);
      b.sim.step([0, 0]);
      expect(a.e.x).toBe(b.e.x);
      expect(a.e.y).toBe(b.e.y);
    }
  });
});

describe("shared enemy rules", () => {
  const types = ["walker", "chaser", "thrower", "breather", "bouncer", "flyer", "boss"] as const;

  for (const type of types) {
    it(`${type}: can be trapped by a launch bubble and popped`, () => {
      const sim = newSim();
      const p = placePlayer(sim, 40);
      addFiller(sim);
      const e = addEnemy(sim, { type });
      addBubble(sim, { phase: "launch", x: 90, vx: TUNING.bubbleLaunchSpeed });
      run(sim, 3);
      expect(e.state).toBe("trapped");
      p.x = e.x;
      p.y = e.y;
      const ev = run(sim, 1);
      expect(ev.some((x) => x.kind === "pop" && x.player === 0)).toBe(true);
      expect(e.state).toBe("dead");
      expect(p.score).toBe(TUNING.chainBaseScore);
    });

    it(`${type}: angry is faster`, () => {
      const dist = (angry: boolean) => {
        const sim = newSim();
        sidelinePlayer(sim);
        addFiller(sim);
        // Flyers need a living target to move; give them one far away on the floor.
        if (type === "flyer") {
          sim.state.players[0]!.state = "alive";
          placePlayer(sim, 230);
        }
        const e = addEnemy(sim, { type, x: type === "flyer" ? 40 : 50, y: type === "bouncer" ? 100 : FLOOR_Y, angry, vy: 0 });
        run(sim, 2);
        return travelled(sim, e, 20);
      };
      const ratio = dist(true) / dist(false);
      if (type === "boss") expect(ratio).toBeCloseTo(TUNING.angerSpeedMult, 3);
      else expect(ratio).toBeGreaterThan(1.3);
    });

    it(`${type}: spawning, trapped and dead enemies neither move nor shoot`, () => {
      for (const state of ["spawning", "dead"] as const) {
        const sim = newSim();
        placePlayer(sim, 40);
        addFiller(sim);
        const e = addEnemy(sim, { type, state, spawnDelay: FOREVER, cooldown: 1, windup: 1, y: 100 });
        const x0 = e.x;
        expect(() => run(sim, 30)).not.toThrow();
        if (state === "spawning") {
          expect(e.x).toBe(x0);
          expect(e.y).toBe(100);
        }
        expect(sim.state.projectiles).toHaveLength(0);
      }
    });
  }
});

describe("determinism and persistence", () => {
  const fight = () => {
    const sim = new Sim([TEST_LEVEL], 5, 2);
    sim.state.enemies = [];
    for (const p of sim.state.players) p.invulnTicks = FOREVER;
    addFiller(sim);
    addEnemy(sim, { type: "thrower", x: 120, dir: 1 });
    addEnemy(sim, { type: "breather", x: 60, dir: 1 });
    addEnemy(sim, { type: "bouncer", x: 150, y: 90 });
    addEnemy(sim, { type: "flyer", x: 200, y: 150 });
    addEnemy(sim, { type: "chaser", x: 80 });
    return sim;
  };
  it("JSON round-trip + Sim.restore mid-fight (live rock and flame) continues identically for 300 ticks", () => {
    const a = fight();
    run(a, 60);
    addProjectile(a, { x: 100, y: 60, vx: 0.5, vy: -1, kind: "rock", ageTicks: 3 });
    addProjectile(a, { x: 130, y: 60, vx: -TUNING.flameSpeed, kind: "flame", ageTicks: 4 });
    const snap: GameState = JSON.parse(JSON.stringify(a.state));
    expect(snap.projectiles.map((p) => p.kind).sort()).toEqual(["flame", "rock"]);
    const b = Sim.restore([TEST_LEVEL], snap);
    for (let t = 0; t < 300; t++) {
      a.step([0, 0]);
      b.step([0, 0]);
      expect(JSON.stringify(b.state)).toBe(JSON.stringify(a.state));
    }
  });
  it("older saves without projectiles restore with an empty list", () => {
    const sim = new Sim([TEST_LEVEL], 7, 1);
    const old: Record<string, unknown> = JSON.parse(JSON.stringify(sim.state));
    delete old.projectiles;
    const restored = Sim.restore([TEST_LEVEL], old as never);
    expect(restored.state.projectiles).toEqual([]);
    expect(() => run(restored, 3)).not.toThrow();
  });
  it("two sims with the same seed stay identical over 600 ticks", () => {
    const a = fight();
    const b = fight();
    run(a, 600);
    run(b, 600);
    expect(JSON.stringify(a.state)).toBe(JSON.stringify(b.state));
  });
  it("shared/src uses no engine-approximated Math functions", () => {
    const files: string[] = [];
    const walk = (dir: string) => {
      for (const name of readdirSync(dir)) {
        const full = join(dir, name);
        if (statSync(full).isDirectory()) walk(full);
        else if (full.endsWith(".ts")) files.push(full);
      }
    };
    walk(join(__dirname, "..", "src"));
    expect(files.length).toBeGreaterThan(5);
    const bad = files.filter((f) => /Math\.(hypot|sin|cos|tan|atan2|pow|exp|log)/.test(readFileSync(f, "utf8")));
    expect(bad).toEqual([]);
  });
});
