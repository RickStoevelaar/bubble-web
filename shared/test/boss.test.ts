import { readdirSync, readFileSync } from "node:fs";
import { join } from "node:path";
import { describe, expect, it } from "vitest";
import {
  BOSS_ARENA,
  BTN,
  GRID_H,
  GRID_W,
  LEVELS,
  PLAYER_SIZE,
  Rng,
  SECRET_CODE_FRAGMENTS,
  SUPER_CODE,
  Sim,
  TEST_LEVEL,
  TILE,
  TUNING,
  applyPower,
  hurryTicks,
  isBossRound,
  moveBody,
  spawnEffect,
  validateLevel,
  type BubbleState,
  type EnemyState,
  type GameState,
  type LevelData,
  type SimEvent,
  type SimOptions,
} from "../src";

const HALF = TUNING.bossSize / 2;
const FLOOR_TOP = 26 * TILE;
const FOREVER = 1_000_000;

const bossSim = (over: Partial<SimOptions> = {}, seed = 1, levels: LevelData[] = [BOSS_ARENA]): Sim =>
  new Sim(levels, seed, { playerCount: 1, ...over });
const boss = (s: Sim): EnemyState => s.state.enemies.find((e) => e.type === "boss")!;
const run = (sim: Sim, n: number, b: [number, number] = [0, 0]): SimEvent[] => {
  const ev: SimEvent[] = [];
  for (let i = 0; i < n; i++) ev.push(...sim.step(b));
  return ev;
};
/** Players cannot die (long invulnerability) so long runs are not cut short. */
const immortal = (sim: Sim): void => {
  for (const p of sim.state.players) p.invulnTicks = FOREVER;
};
const addShot = (sim: Sim, over: Partial<BubbleState> = {}): BubbleState => {
  const b: BubbleState = {
    id: sim.state.nextId++,
    x: boss(sim).x,
    y: boss(sim).y,
    vx: TUNING.thunderShotSpeed,
    vy: 0,
    kind: "lightning",
    phase: "launch",
    ageTicks: 0,
    owner: 0,
    shot: true,
    ...over,
  };
  sim.state.bubbles.push(b);
  return b;
};
const kinds = (ev: SimEvent[], k: SimEvent["kind"]): SimEvent[] => ev.filter((e) => e.kind === k);
const levelsOf = (n: number): LevelData[] => Array.from({ length: n }, (_, i) => ({ ...TEST_LEVEL, round: i + 1, enemies: [] }));

// ---------------------------------------------------------------------------------------------------------------

describe("boss arena", () => {
  it("validates, has the boss spawn, borders and a full floor", () => {
    expect(validateLevel(BOSS_ARENA)).toEqual([]);
    expect(BOSS_ARENA.tiles).toHaveLength(GRID_H);
    expect(BOSS_ARENA.round).toBe(100);
    expect(BOSS_ARENA.drift).toEqual([]);
    expect(BOSS_ARENA.flags).toBeUndefined();
    expect(typeof BOSS_ARENA.theme).toBe("number");
    expect(BOSS_ARENA.enemies).toHaveLength(1);
    const b = BOSS_ARENA.enemies[0]!;
    expect(b.type).toBe("boss");
    expect(b.delayTicks).toBe(0);
    expect(b.col).toBeGreaterThanOrEqual(12);
    expect(b.col).toBeLessThanOrEqual(19);
    expect(b.row).toBeLessThanOrEqual(10);
    expect(BOSS_ARENA.tiles[26]).toBe("#".repeat(GRID_W));
    expect(BOSS_ARENA.tiles[27]).toBe("#".repeat(GRID_W));
    for (const row of BOSS_ARENA.tiles) {
      expect(row.slice(0, 2)).toBe("##");
      expect(row.slice(-2)).toBe("##");
    }
    const ledges = BOSS_ARENA.tiles.slice(1, 26).filter((r) => r.slice(2, -2).includes("#"));
    expect(ledges.length).toBeGreaterThanOrEqual(2);
    expect(ledges.length).toBeLessThanOrEqual(3);
  });

  it("is a boss round; ordinary levels are not", () => {
    expect(isBossRound(BOSS_ARENA)).toBe(true);
    expect(isBossRound(TEST_LEVEL)).toBe(false);
  });

  it("validateLevel accepts boss spawns and still rejects hurry spawns", () => {
    const base = { ...TEST_LEVEL };
    expect(validateLevel({ ...base, enemies: [{ type: "boss", col: 10, row: 10, delayTicks: 0 }] })).toEqual([]);
    expect(validateLevel({ ...base, enemies: [{ type: "hurry", col: 10, row: 10, delayTicks: 0 }] })).not.toEqual([]);
  });

  it("every standable position is reachable from the spawns and can return (no one-way traps)", () => {
    const starts = [3, 28].map((col) => ({ x: col * TILE + TILE / 2, y: FLOOR_TOP - PLAYER_SIZE / 2 }));
    const g = analyseStands(BOSS_ARENA, starts, TUNING.jumpVel + 0.15);
    expect(g.trapped.slice(0, 10)).toEqual([]);
    // Every ledge top is reachable.
    const ys = new Set([...g.nodes.values()].map((p) => p.y));
    for (const row of [21, 16]) expect(ys.has(row * TILE - PLAYER_SIZE / 2)).toBe(true);
  }, 120000);
});

describe("boss creation", () => {
  it("spawns with hp == maxHp from the formula (1 and 2 players, gone seats do not count)", () => {
    const one = bossSim();
    expect(boss(one).hp).toBe(TUNING.bossHpBase + TUNING.bossHpPerPlayer);
    expect(boss(one).maxHp).toBe(boss(one).hp);
    const two = bossSim({ playerCount: 2 });
    expect(boss(two).hp).toBe(TUNING.bossHpBase + 2 * TUNING.bossHpPerPlayer);
    expect(boss(two).maxHp).toBe(boss(two).hp);
    two.state.players[1]!.state = "gone";
    two.loadRound(1);
    expect(boss(two).hp).toBe(TUNING.bossHpBase + TUNING.bossHpPerPlayer);
  });

  it("starts spawning at the arena spawn with a fixed key order and no other boss fields leaking onto walkers", () => {
    const sim = bossSim();
    const b = boss(sim);
    expect(Object.keys(b)).toEqual([
      "id", "type", "x", "y", "vx", "vy", "dir", "state", "angry", "spawnDelay", "onGround",
      "hp", "maxHp", "stun", "volley", "volleyIndex",
    ]);
    expect(b.stun).toBe(0);
    expect(b.volley).toBe(TUNING.bossVolleyTicks);
    expect(b.volleyIndex).toBe(0);
    expect(b.x).toBe(BOSS_ARENA.enemies[0]!.col * TILE + TILE / 2);
    expect(b.y).toBe((BOSS_ARENA.enemies[0]!.row + 1) * TILE - HALF);
    const w = new Sim([TEST_LEVEL], 1, 1).state.enemies[0]!;
    expect(w.hp).toBeUndefined();
    expect(Object.keys(w)).not.toContain("hp");
  });
});

describe("boss movement", () => {
  it("moves diagonally at bossSpeed, never rests, stays in the arena and bounces off all four sides", () => {
    const sim = bossSim();
    immortal(sim);
    run(sim, 1); // spawning -> active
    let px = boss(sim).x;
    let py = boss(sim).y;
    const seenDx = new Set<number>();
    const seenDy = new Set<number>();
    for (let i = 0; i < 3000; i++) {
      sim.step([0, 0]);
      const b = boss(sim);
      expect(b.x !== px && b.y !== py, `tick ${i}`).toBe(true);
      expect(Math.abs(b.x - px)).toBeLessThanOrEqual(TUNING.bossSpeed);
      expect(Math.abs(b.y - py)).toBeLessThanOrEqual(TUNING.bossSpeed);
      expect(Math.abs(b.vx)).toBe(TUNING.bossSpeed);
      expect(Math.abs(b.vy)).toBe(TUNING.bossSpeed);
      expect(b.x).toBeGreaterThanOrEqual(2 * TILE + HALF);
      expect(b.x).toBeLessThanOrEqual(30 * TILE - HALF);
      expect(b.y).toBeGreaterThanOrEqual(HALF);
      expect(b.y).toBeLessThanOrEqual(FLOOR_TOP - HALF);
      seenDx.add(Math.sign(b.x - px));
      seenDy.add(Math.sign(b.y - py));
      px = b.x;
      py = b.y;
    }
    expect([...seenDx].sort()).toEqual([-1, 1]);
    expect([...seenDy].sort()).toEqual([-1, 1]);
  });

  it("reaches the walls, the ceiling and the floor exactly", () => {
    const sim = bossSim();
    run(sim, 1);
    const b = boss(sim);
    let minX = Infinity, maxX = -Infinity, minY = Infinity, maxY = -Infinity;
    for (let i = 0; i < 4000; i++) {
      sim.step([0, 0]);
      minX = Math.min(minX, b.x);
      maxX = Math.max(maxX, b.x);
      minY = Math.min(minY, b.y);
      maxY = Math.max(maxY, b.y);
    }
    expect([minX, maxX, minY, maxY]).toEqual([2 * TILE + HALF, 30 * TILE - HALF, HALF, FLOOR_TOP - HALF]);
  });

  it("flips direction at a wall and at the floor", () => {
    const sim = bossSim();
    run(sim, 1);
    const b = boss(sim);
    b.x = 30 * TILE - HALF - 0.5;
    b.dir = 1;
    b.y = 100;
    b.vy = TUNING.bossSpeed;
    sim.step([0, 0]);
    expect(b.x).toBe(30 * TILE - HALF);
    sim.step([0, 0]);
    expect(b.dir).toBe(-1);
    expect(b.x).toBeLessThan(30 * TILE - HALF);
    b.y = FLOOR_TOP - HALF - 0.5;
    b.vy = TUNING.bossSpeed;
    sim.step([0, 0]);
    sim.step([0, 0]);
    expect(b.vy).toBe(-TUNING.bossSpeed);
    expect(b.y).toBeLessThan(FLOOR_TOP - HALF);
  });

  it("passes through ledges unaffected", () => {
    const sim = bossSim();
    run(sim, 1);
    const b = boss(sim);
    b.x = 7 * TILE; // inside ledge A (row 21), body overlaps its tiles
    b.y = 21 * TILE + 4;
    b.vy = TUNING.bossSpeed;
    b.dir = 1;
    run(sim, 10);
    expect(b.y).toBe(21 * TILE + 4 + 10 * TUNING.bossSpeed);
    expect(b.x).toBe(7 * TILE + 10 * TUNING.bossSpeed);
  });

  it("a spawning boss waits out its delay without moving", () => {
    const lv: LevelData = { ...BOSS_ARENA, enemies: [{ type: "boss", col: 15, row: 8, delayTicks: 30 }] };
    const sim = bossSim({}, 1, [lv]);
    const b = boss(sim);
    const x0 = b.x;
    run(sim, 29);
    expect([b.state, b.x]).toEqual(["spawning", x0]);
    run(sim, 3);
    expect(b.state).toBe("active");
    run(sim, 1);
    expect(b.x).not.toBe(x0);
  });

  it("freezes while stunned and resumes with its old direction", () => {
    const sim = bossSim();
    run(sim, 1);
    const b = boss(sim);
    b.stun = 5;
    const x0 = b.x;
    const y0 = b.y;
    run(sim, 5);
    expect([b.x, b.y, b.stun]).toEqual([x0, y0, 0]);
    sim.step([0, 0]);
    expect(b.x).not.toBe(x0);
    expect(b.vx).toBeGreaterThan(0);
    expect(b.vy).toBeGreaterThan(0);
  });
});

describe("boss is neither trapped, killed nor angered", () => {
  it("bubbles pass through it and never trap it", () => {
    const sim = bossSim();
    immortal(sim);
    run(sim, 1);
    const b = boss(sim);
    sim.state.bubbles.push({ id: sim.state.nextId++, x: b.x, y: b.y, vx: 3, vy: 0, kind: "normal", phase: "launch", ageTicks: 0, owner: 0 });
    run(sim, 5);
    expect(b.state).toBe("active");
    expect(sim.state.bubbles.every((x) => x.trapped === undefined)).toBe(true);
  });

  it("power effects, water, fire and bolts never kill it", () => {
    const sim = bossSim({ playerCount: 2 });
    immortal(sim);
    run(sim, 1);
    const b = boss(sim);
    const p = sim.state.players[0]!;
    const ev: SimEvent[] = [];
    applyPower(sim, p, "spark", ev);
    applyPower(sim, p, "flask", ev);
    for (const kind of ["water", "fire", "bolt"] as const) spawnEffect(sim.state, kind, 0, b.x, b.y, 1);
    for (let i = 0; i < 200; i++) {
      b.x = 128;
      b.y = 120;
      sim.step([0, 0]);
    }
    expect(b.state).toBe("active");
    expect(b.hp).toBe(b.maxHp);
    expect(sim.state.enemies).toContain(b);
  });

  it("never becomes angry: not by last-enemy-standing, not by round time", () => {
    const sim = bossSim();
    immortal(sim);
    run(sim, 2000);
    expect(sim.state.roundTicks).toBeGreaterThan(TUNING.roundAngerTicks);
    expect(boss(sim).angry).toBe(false);
  });

  it("enrages exactly at hp <= maxHp / 3 (speed and volley interval change)", () => {
    const edge = Math.floor(TUNING.bossHpBase + TUNING.bossHpPerPlayer);
    const maxHp = edge;
    const speedAt = (hp: number): number => {
      const sim = bossSim();
      immortal(sim);
      run(sim, 1);
      boss(sim).hp = hp;
      sim.step([0, 0]);
      return Math.abs(boss(sim).vx);
    };
    const lastEnraged = Math.floor(maxHp / 3);
    expect(lastEnraged * 3).toBeLessThanOrEqual(maxHp);
    expect((lastEnraged + 1) * 3).toBeGreaterThan(maxHp);
    expect(speedAt(lastEnraged + 1)).toBe(TUNING.bossSpeed);
    expect(speedAt(lastEnraged)).toBe(TUNING.bossSpeed * TUNING.bossEnrageSpeedMult);

    const gapAfterFirstVolley = (hp: number): number => {
      const sim = bossSim();
      immortal(sim);
      run(sim, 1);
      boss(sim).hp = hp;
      boss(sim).volley = 1;
      const ticks: number[] = [];
      let seen = 0;
      for (let i = 0; i < 400 && ticks.length < 2; i++) {
        sim.step([0, 0]);
        if (boss(sim).volleyIndex! > seen) {
          seen = boss(sim).volleyIndex!;
          ticks.push(sim.state.tick);
        }
      }
      return ticks[1]! - ticks[0]!;
    };
    expect(gapAfterFirstVolley(lastEnraged + 1)).toBe(TUNING.bossVolleyTicks);
    expect(gapAfterFirstVolley(lastEnraged)).toBe(Math.floor(TUNING.bossVolleyTicks * TUNING.bossEnrageVolleyMult));
  });
});

describe("boss contact", () => {
  it("kills a player once per contact, with the boss' own size", () => {
    const sim = bossSim();
    run(sim, 1);
    const b = boss(sim);
    b.stun = FOREVER;
    const p = sim.state.players[0]!;
    p.x = b.x + (HALF + PLAYER_SIZE / 2) - 1;
    p.y = b.y;
    p.vy = 0;
    p.onGround = true;
    const lives = p.lives;
    const ev = run(sim, 1);
    expect(p.state).toBe("dying");
    expect(p.lives).toBe(lives - 1);
    expect(kinds(ev, "die")).toHaveLength(1);
    run(sim, 5);
    expect(p.lives).toBe(lives - 1);
  });

  it("does not touch a player just outside its body, or an invulnerable one", () => {
    const sim = bossSim();
    run(sim, 1);
    const b = boss(sim);
    b.stun = FOREVER;
    const p = sim.state.players[0]!;
    // Hover the player (no gravity effect over one tick matters at this distance).
    p.x = b.x + (HALF + PLAYER_SIZE / 2) + 1;
    p.y = b.y;
    sim.step([0, 0]);
    expect(p.state).toBe("alive");
    p.x = b.x;
    p.y = b.y;
    p.invulnTicks = 100;
    sim.step([0, 0]);
    expect(p.state).toBe("alive");
  });
});

describe("boss volleys", () => {
  const setup = (players: 1 | 2 = 1): Sim => {
    const sim = bossSim({ playerCount: players });
    run(sim, 1);
    const b = boss(sim);
    b.x = 128;
    b.y = 60;
    b.vx = 0;
    b.vy = TUNING.bossSpeed;
    b.dir = 1;
    return sim;
  };

  it("the first volley comes bossVolleyTicks active ticks after the fight starts", () => {
    const sim = bossSim();
    immortal(sim);
    sim.state.players[0]!.x = 28;
    let first = 0;
    for (let i = 1; i <= TUNING.bossVolleyTicks + 5 && first === 0; i++) {
      sim.step([0, 0]);
      if (sim.state.projectiles.length > 0) first = sim.state.tick;
    }
    expect(first).toBe(TUNING.bossVolleyTicks + 1);
  });

  it("throws a fan of rocks toward the nearest alive player with fixed offsets", () => {
    const sim = setup();
    const p = sim.state.players[0]!; // spawns on the left at x = 28
    boss(sim).volley = 1;
    run(sim, 1);
    const rocks = sim.state.projectiles.filter((r) => r.kind === "rock");
    expect(rocks).toHaveLength(TUNING.bossVolleySize);
    const toward = p.x < 128 ? -1 : 1;
    const vxs = rocks.map((r) => r.vx).sort((a, b) => a - b);
    const expected = TUNING.bossFanOffsets.slice(0, TUNING.bossVolleySize).map((o) => toward * TUNING.rockSpeedX + o).sort((a, b) => a - b);
    expect(vxs).toEqual(expected);
    for (const r of rocks) {
      expect(r.vy).toBe(TUNING.rockLaunchVy + TUNING.rockGravity);
      expect(r.x).toBe(128 + r.vx);
    }
    expect(boss(sim).volleyIndex).toBe(1);
    expect(boss(sim).volley).toBe(TUNING.bossVolleyTicks);
    expect(sim.state.projectiles.filter((r) => r.kind === "flame")).toHaveLength(0);
    // Ids come from the shared counter in ascending order.
    expect(rocks.map((r) => r.id)).toEqual([...rocks.map((r) => r.id)].sort((a, b) => a - b));
  });

  it("aims at the nearest alive player, not a dead or farther one", () => {
    const sim = setup(2);
    const [a, c] = sim.state.players as [GameState["players"][0], GameState["players"][0]];
    a.x = 20; // far left
    c.x = 200; // nearer, right
    c.y = a.y;
    boss(sim).volley = 1;
    run(sim, 1);
    expect(sim.state.projectiles.filter((r) => r.kind === "rock").every((r) => r.vx > 0)).toBe(true);
    // Now the near one is dying: the far one is targeted.
    const sim2 = setup(2);
    const [a2, c2] = sim2.state.players as [GameState["players"][0], GameState["players"][0]];
    a2.x = 20;
    c2.x = 200;
    c2.y = a2.y;
    c2.state = "dying";
    c2.stateTicks = 50;
    boss(sim2).volley = 1;
    run(sim2, 1);
    expect(sim2.state.projectiles.filter((r) => r.kind === "rock").every((r) => r.vx < 0)).toBe(true);
  });

  it("alternate volleys add a horizontal flame toward the player", () => {
    const sim = setup();
    boss(sim).volleyIndex = 1;
    boss(sim).volley = 1;
    run(sim, 1);
    const flames = sim.state.projectiles.filter((r) => r.kind === "flame");
    expect(flames).toHaveLength(1);
    expect(flames[0]!.vx).toBe(-TUNING.flameSpeed + 0); // player is on the left
    expect(flames[0]!.vy).toBe(0);
    expect(sim.state.projectiles.filter((r) => r.kind === "rock")).toHaveLength(TUNING.bossVolleySize);
    expect(boss(sim).volleyIndex).toBe(2);
  });

  it("no volley while stunned (the countdown also holds) or while no player is alive", () => {
    const sim = setup();
    const b = boss(sim);
    b.volley = 1;
    b.stun = 3;
    run(sim, 3);
    expect(sim.state.projectiles).toHaveLength(0);
    expect(b.volley).toBe(1);
    run(sim, 1);
    expect(sim.state.projectiles.length).toBeGreaterThan(0);

    const sim2 = setup();
    sim2.state.players[0]!.state = "dying";
    sim2.state.players[0]!.stateTicks = 50;
    boss(sim2).volley = 1;
    run(sim2, 10);
    expect(sim2.state.projectiles).toHaveLength(0);
    expect(boss(sim2).volleyIndex).toBe(0);
  });

  it("draws no randomness over 600 ticks with one player", () => {
    const sim = bossSim();
    immortal(sim);
    const before = sim.state.rngState;
    run(sim, 600);
    expect(sim.state.rngState).toBe(before);
    expect(boss(sim).volleyIndex).toBeGreaterThan(0);
  });

  it("draws exactly one value, and only to break an exact distance tie between two alive players", () => {
    const sim = setup(2);
    const [a, c] = sim.state.players as [GameState["players"][0], GameState["players"][0]];
    a.x = 100;
    c.x = 156;
    c.y = a.y;
    const before = sim.rng.getState();
    boss(sim).volley = 1;
    run(sim, 1);
    const r = new Rng(0);
    r.setState(before);
    r.int(2);
    expect(sim.rng.getState()).toBe(r.getState());
    // No tie: no draw.
    const sim2 = setup(2);
    sim2.state.players[0]!.x = 100;
    sim2.state.players[1]!.x = 160;
    sim2.state.players[1]!.y = sim2.state.players[0]!.y;
    const before2 = sim2.rng.getState();
    boss(sim2).volley = 1;
    run(sim2, 1);
    expect(sim2.rng.getState()).toBe(before2);
  });
});

describe("thunder shots", () => {
  const fire = (sim: Sim, ticks: number): SimEvent[] => run(sim, ticks, [BTN.F, 0]);

  it("in a boss round every fired bubble is a shot with the usual spawn rules", () => {
    const sim = bossSim();
    const p = sim.state.players[0]!;
    p.facing = 1;
    const ev = fire(sim, 1);
    expect(kinds(ev, "fire")).toHaveLength(1);
    const b = sim.state.bubbles[0]!;
    expect(b.kind).toBe("lightning");
    expect(b.shot).toBe(true);
    expect(b.phase).toBe("launch");
    expect(b.owner).toBe(0);
    expect(b.vx).toBe(TUNING.thunderShotSpeed);
    expect(b.x).toBe(p.x + TUNING.bubbleSpawnOffset + TUNING.thunderShotSpeed);
    expect(Object.keys(b)).toEqual(["id", "x", "y", "vx", "vy", "kind", "phase", "ageTicks", "owner", "shot"]);
    // Cooldown: same number of shots per 100 held ticks as normal bubbles in an ordinary round.
    const norm = new Sim([TEST_LEVEL], 1, 1);
    const shots = kinds(fire(bossSim(), 100), "fire").length;
    expect(kinds(run(norm, 100, [BTN.F, 0]), "fire").length).toBe(shots);
    expect(shots).toBe(Math.ceil(100 / TUNING.fireCooldownTicks));
  });

  it("direction follows facing and fastBubble scales the speed; outside boss rounds bubbles stay normal", () => {
    const sim = bossSim();
    sim.state.players[0]!.powers.fastBubble = true;
    sim.state.players[0]!.facing = -1;
    sim.state.players[0]!.x = 100;
    run(sim, 1, [BTN.F | BTN.L, 0]);
    expect(sim.state.bubbles[0]!.vx).toBe(-TUNING.thunderShotSpeed * TUNING.fastBubbleMult);
    const norm = new Sim([TEST_LEVEL], 1, 1);
    run(norm, 1, [BTN.F, 0]);
    const nb = norm.state.bubbles[0]!;
    expect(nb.kind).toBe("normal");
    expect("shot" in nb).toBe(false);
  });

  it("a shot never traps, floats, pops on a player or becomes an effect; it flies launch-phase until its range ends", () => {
    const lv: LevelData = { ...BOSS_ARENA, enemies: [...BOSS_ARENA.enemies, { type: "walker", col: 10, row: 25, delayTicks: 0 }] };
    const sim = bossSim({}, 1, [lv]);
    immortal(sim);
    run(sim, 2);
    boss(sim).stun = FOREVER;
    const walker = sim.state.enemies.find((e) => e.type === "walker")!;
    const p = sim.state.players[0]!;
    const shot = addShot(sim, { x: walker.x - 4, y: walker.y, vx: 3 });
    let life = 0;
    while (sim.state.bubbles.includes(shot) && life < 200) {
      sim.step([BTN.J, 0]);
      life++;
      expect(shot.phase).toBe("launch");
      expect(shot.trapped).toBeUndefined();
    }
    expect(walker.state).not.toBe("trapped");
    expect(sim.state.effects).toHaveLength(0);
    expect(life).toBe(TUNING.thunderShotTicks);
    // Overlapping a player: no bounce, no pop, shot stays.
    const s2 = addShot(sim, { x: p.x, y: p.y, vx: 0.5 });
    const ev = run(sim, 1, [BTN.J, 0]);
    expect(kinds(ev, "bounce")).toHaveLength(0);
    expect(kinds(ev, "pop")).toHaveLength(0);
    expect(sim.state.bubbles).toContain(s2);
    expect(sim.state.effects).toHaveLength(0);
  });

  it("vanishes at a wall tile", () => {
    const sim = bossSim();
    immortal(sim);
    run(sim, 2);
    boss(sim).stun = FOREVER;
    const shot = addShot(sim, { x: 220, y: 201, vx: 4 });
    let n = 0;
    while (sim.state.bubbles.includes(shot) && n < 50) {
      run(sim, 1);
      n++;
    }
    expect(n).toBeLessThan(10);
    expect(shot.x).toBeLessThan(30 * TILE);
    expect(boss(sim).hp).toBe(boss(sim).maxHp);
  });

  it("hits the boss for exactly 1, staggers it, scores the shooter and pops at the hit position", () => {
    const sim = bossSim({ playerCount: 2 });
    immortal(sim);
    run(sim, 2);
    const b = boss(sim);
    const hp = b.hp!;
    const p1 = sim.state.players[1]!;
    p1.score = TUNING.firstExtraLifeScore - 1;
    const lives = p1.lives;
    const shot = addShot(sim, { x: b.x - 10, y: b.y + 3, vx: 3, owner: 1 });
    const ev = run(sim, 1);
    expect(b.hp).toBe(hp - 1);
    expect(b.stun).toBe(TUNING.bossStunTicks - 1); // the boss' own step already ticked it once
    expect(sim.state.bubbles).not.toContain(shot);
    const pops = kinds(ev, "pop");
    expect(pops).toHaveLength(1);
    expect(pops[0]).toEqual({ kind: "pop", player: 1, x: shot.x, y: shot.y });
    expect(p1.score).toBe(TUNING.firstExtraLifeScore - 1 + TUNING.bossHitScore);
    expect(kinds(ev, "oneup")).toEqual([{ kind: "oneup", player: 1 }]);
    expect(p1.lives).toBe(lives + 1);
    expect(sim.state.players[0]!.score).toBe(0);
  });

  it("shots pass through a stunned boss, and the next hit lands once the stagger has ended", () => {
    const sim = bossSim();
    immortal(sim);
    run(sim, 2);
    const b = boss(sim);
    const hp = b.hp!;
    addShot(sim);
    run(sim, 1);
    expect(b.hp).toBe(hp - 1);
    const through = addShot(sim, { vx: 0.5 });
    run(sim, 1);
    expect(b.hp).toBe(hp - 1);
    expect(sim.state.bubbles).toContain(through);
    while (b.stun! > 0) run(sim, 1);
    sim.state.bubbles = [];
    addShot(sim, { x: b.x });
    run(sim, 1);
    expect(b.hp).toBe(hp - 2);
  });

  it("a shot overlapping a non-boss enemy does nothing", () => {
    const lv: LevelData = { ...BOSS_ARENA, enemies: [...BOSS_ARENA.enemies, { type: "walker", col: 10, row: 25, delayTicks: 0 }] };
    const sim = bossSim({}, 1, [lv]);
    immortal(sim);
    run(sim, 2);
    boss(sim).stun = FOREVER;
    const w = sim.state.enemies.find((e) => e.type === "walker")!;
    addShot(sim, { x: w.x, y: w.y, vx: 0.5 });
    const ev = run(sim, 3);
    expect(w.state).toBe("active");
    expect(kinds(ev, "pop")).toHaveLength(0);
  });

  it("special bubble code ignores shots", () => {
    const sim = bossSim();
    run(sim, 2);
    boss(sim).stun = FOREVER;
    const p = sim.state.players[0]!;
    sim.state.bubbles.push({ id: sim.state.nextId++, x: p.x, y: p.y, vx: 0.2, vy: 0, kind: "lightning", phase: "launch", ageTicks: 0, owner: 0, shot: true });
    const ev = run(sim, 5);
    expect(sim.state.effects).toHaveLength(0);
    expect(kinds(ev, "pop")).toHaveLength(0);
  });

  it("special bubbles do not spawn in a boss round", () => {
    const sim = bossSim();
    immortal(sim);
    run(sim, TUNING.specialFirstDelayTicks + 10);
    expect(sim.state.bubbles).toHaveLength(0);
  });
});

describe("boss death and the endings", () => {
  /** Lands one shot on the boss and returns the events of that tick. */
  const hit = (sim: Sim, owner: 0 | 1 = 0): SimEvent[] => {
    const b = boss(sim);
    addShot(sim, { x: b.x - 5, y: b.y, vx: 3, owner });
    return run(sim, 1);
  };
  const waitStun = (sim: Sim): void => {
    while (boss(sim)?.stun) run(sim, 1);
  };

  it("dies after exactly maxHp landed hits", () => {
    const sim = bossSim();
    immortal(sim);
    run(sim, 2);
    const max = boss(sim).maxHp!;
    for (let i = 1; i < max; i++) {
      hit(sim);
      expect(boss(sim).hp).toBe(max - i);
      expect(sim.state.phase).toBe("round");
      waitStun(sim);
    }
    expect(boss(sim).hp).toBe(1);
    const score = sim.state.players[0]!.score;
    const ev = hit(sim);
    expect(sim.state.phase).toBe("ending");
    expect(sim.state.runOver).toBe(true);
    expect(sim.state.ending).toBe("bad");
    expect(sim.state.enemies).toHaveLength(0);
    expect(sim.state.bubbles).toHaveLength(0);
    expect(sim.state.projectiles).toHaveLength(0);
    expect(sim.state.effects).toHaveLength(0);
    expect(kinds(ev, "clear")).toHaveLength(1);
    expect(sim.state.players[0]!.score).toBe(score + TUNING.bossHitScore + TUNING.bossKillScore);
  });

  it("clears projectiles, bubbles and effects at the kill and awards the kill to the last shooter", () => {
    const sim = bossSim({ playerCount: 2 });
    immortal(sim);
    run(sim, 2);
    boss(sim).hp = 1;
    sim.state.projectiles.push({ id: sim.state.nextId++, x: 50, y: 50, vx: 0, vy: 0, kind: "flame", ageTicks: 0 });
    sim.state.bubbles.push({ id: sim.state.nextId++, x: 60, y: 60, vx: 0, vy: -0.25, kind: "normal", phase: "float", ageTicks: 0, owner: 0 });
    spawnEffect(sim.state, "water", 0, 80, 80, 1);
    const s0 = sim.state.players[0]!.score;
    const s1 = sim.state.players[1]!.score;
    const ev = hit(sim, 1);
    expect([sim.state.projectiles.length, sim.state.bubbles.length, sim.state.effects.length]).toEqual([0, 0, 0]);
    expect(sim.state.players[1]!.score).toBe(s1 + TUNING.bossHitScore + TUNING.bossKillScore);
    expect(sim.state.players[0]!.score).toBe(s0);
    expect(kinds(ev, "clear")).toHaveLength(1);
  });

  it("two shots landing on the same tick resolve the ending once", () => {
    const sim = bossSim({ playerCount: 2 });
    immortal(sim);
    run(sim, 2);
    boss(sim).hp = 1;
    const b = boss(sim);
    addShot(sim, { x: b.x - 5, y: b.y, vx: 3, owner: 1 });
    addShot(sim, { x: b.x - 5, y: b.y, vx: 3, owner: 0 });
    const ev = run(sim, 1);
    expect(kinds(ev, "clear")).toHaveLength(1);
    expect(sim.state.players[1]!.score).toBe(TUNING.bossHitScore + TUNING.bossKillScore);
    expect(sim.state.players[0]!.score).toBe(0);
    expect(sim.state.ending).toBe("true");
  });

  it('the true ending needs two seats, both present: alive, dying and respawning all count', () => {
    for (const mid of ["alive", "dying", "respawning"] as const) {
      const sim = bossSim({ playerCount: 2 });
      immortal(sim);
      run(sim, 2);
      sim.state.players[1]!.state = mid;
      sim.state.players[1]!.stateTicks = 1000;
      boss(sim).hp = 1;
      hit(sim);
      expect(sim.state.phase, mid).toBe("ending");
      expect(sim.state.ending, mid).toBe("true");
    }
  });

  it('is the bad ending with one seat or a gone player', () => {
    const solo = bossSim();
    run(solo, 2);
    boss(solo).hp = 1;
    hit(solo);
    expect(solo.state.ending).toBe("bad");

    const duo = bossSim({ playerCount: 2 });
    immortal(duo);
    run(duo, 2);
    duo.state.players[1]!.state = "gone";
    boss(duo).hp = 1;
    hit(duo);
    expect(duo.state.phase).toBe("ending");
    expect(duo.state.ending).toBe("bad");
  });

  it("endingTicks counts up in the ending phase while everything stays frozen", () => {
    const sim = bossSim({ playerCount: 2 });
    immortal(sim);
    run(sim, 2);
    boss(sim).hp = 1;
    hit(sim);
    expect(sim.state.endingTicks).toBe(0);
    const snap = JSON.stringify({ ...sim.state, tick: 0, endingTicks: 0 });
    const t0 = sim.state.tick;
    for (let i = 1; i <= 120; i++) {
      const ev = sim.step([BTN.L | BTN.F | BTN.J, BTN.R | BTN.F]);
      expect(ev).toEqual([]);
      expect(sim.state.endingTicks).toBe(i);
    }
    expect(sim.state.tick).toBe(t0 + 120);
    expect(JSON.stringify({ ...sim.state, tick: 0, endingTicks: 0 })).toBe(snap);
  });

  it("continueRun and endRun throw in the ending phase", () => {
    const sim = bossSim();
    run(sim, 2);
    boss(sim).hp = 1;
    hit(sim);
    expect(() => sim.continueRun()).toThrow();
    expect(() => sim.endRun()).toThrow();
    expect(sim.state.phase).toBe("ending");
  });

  it("an ending kill tick where every player is gone still ends in the ending phase (not game over)", () => {
    const sim = bossSim();
    run(sim, 2);
    const p = sim.state.players[0]!;
    p.state = "gone";
    boss(sim).hp = 1;
    hit(sim);
    expect(sim.state.phase).toBe("ending");
  });

  it("the ordinary last-round path sets the ending too (true iff two present players)", () => {
    const clearLast = (players: 1 | 2, goneSeat = false): Sim => {
      const levels = levelsOf(2);
      const sim = new Sim(levels, 3, { playerCount: players });
      sim.loadRound(2);
      if (goneSeat) sim.state.players[1]!.state = "gone";
      sim.state.enemiesSeen = true;
      run(sim, 1 + TUNING.clearTicks + 5);
      return sim;
    };
    const two = clearLast(2);
    expect([two.state.phase, two.state.runOver, two.state.ending, two.state.endingTicks > 0]).toEqual(["ending", true, "true", true]);
    expect(clearLast(1).state.ending).toBe("bad");
    expect(clearLast(2, true).state.ending).toBe("bad");
    // Not set before the end.
    const mid = new Sim(levelsOf(2), 3, { playerCount: 2 });
    expect(mid.state.ending).toBeNull();
    expect(mid.state.endingTicks).toBe(0);
  });
});

describe("SUPER_CODE", () => {
  it("is the three secret fragments joined, fits the room code rule", () => {
    expect(SUPER_CODE).toBe(SECRET_CODE_FRAGMENTS[0] + SECRET_CODE_FRAGMENTS[1] + SECRET_CODE_FRAGMENTS[2]);
    expect(SUPER_CODE).toHaveLength(6);
    expect(SUPER_CODE).toMatch(/^[A-Z0-9]{6}$/);
    expect(SUPER_CODE).toMatch(/^[A-Za-z0-9]{1,12}$/);
  });
});

describe("Super mode", () => {
  it("starts every enemy angry, also after a continue and a parasol skip", () => {
    const levels = [TEST_LEVEL, { ...TEST_LEVEL, round: 2 }, { ...TEST_LEVEL, round: 3 }];
    const sim = new Sim(levels, 1, { playerCount: 1, superMode: true });
    expect(sim.state.superMode).toBe(true);
    expect(sim.state.enemies.length).toBeGreaterThan(0);
    expect(sim.state.enemies.every((e) => e.angry)).toBe(true);
    sim.state.phase = "gameover";
    sim.continueRun();
    expect(sim.state.enemies.every((e) => e.angry)).toBe(true);
    sim.state.pendingRound = 3;
    sim.step([0, 0]);
    expect(sim.state.round).toBe(3);
    expect(sim.state.enemies.length).toBeGreaterThan(0);
    expect(sim.state.enemies.every((e) => e.angry)).toBe(true);
    expect(new Sim(levels, 1, 1).state.enemies.some((e) => e.angry)).toBe(false);
  });

  it("halves the hurry-up threshold through hurryTicks", () => {
    const normal = new Sim([TEST_LEVEL], 1, { playerCount: 1 });
    const sup = new Sim([TEST_LEVEL], 1, { playerCount: 1, superMode: true });
    expect(hurryTicks(normal.state)).toBe(TUNING.hurryUpTicks);
    expect(hurryTicks(sup.state)).toBe(Math.floor(TUNING.hurryUpTicks / 2));
    const half = Math.floor(TUNING.hurryUpTicks / 2);
    for (const [sim, fires] of [[normal, false], [sup, true]] as const) {
      immortal(sim);
      sim.state.enemies = [];
      sim.state.enemiesSeen = false;
      sim.state.roundTicks = half - 2;
      expect(kinds(run(sim, 1), "hurry")).toHaveLength(0);
      expect(kinds(run(sim, 3), "hurry")).toHaveLength(fires ? 1 : 0);
      expect(sim.state.hurryActive).toBe(fires);
    }
  });

  it("multiplies the boss hp, but the boss stays un-angry", () => {
    const sim = bossSim({ superMode: true, playerCount: 2 });
    expect(boss(sim).maxHp).toBe((TUNING.bossHpBase + 2 * TUNING.bossHpPerPlayer) * TUNING.bossSuperHpMult);
    expect(boss(sim).hp).toBe(boss(sim).maxHp);
  });

  it("a continue after game over rebuilds the boss for the revived players", () => {
    const sim = bossSim({ playerCount: 2 });
    run(sim, 2);
    for (const p of sim.state.players) p.state = "gone";
    run(sim, 1);
    expect(sim.state.phase).toBe("gameover");
    sim.continueRun();
    expect(boss(sim).maxHp).toBe(TUNING.bossHpBase + 2 * TUNING.bossHpPerPlayer);
    expect(sim.state.players.every((p) => p.state === "alive")).toBe(true);
  });

  it("has no hurry-up in a boss round", () => {
    const sim = bossSim();
    immortal(sim);
    run(sim, TUNING.hurryUpTicks + 5);
    expect(sim.state.hurryActive).toBe(false);
    expect(sim.state.enemies.filter((e) => e.type === "hurry")).toHaveLength(0);
  });
});

describe("Sim constructor options", () => {
  const lv = levelsOf(5);
  it("the numeric form still works", () => {
    const sim = new Sim(lv, 9, 2);
    expect(sim.state.players).toHaveLength(2);
    expect(sim.state.round).toBe(1);
    expect(sim.state.superMode).toBe(false);
    expect(sim.state.ending).toBeNull();
    expect(sim.state.endingTicks).toBe(0);
  });
  it("the options form works", () => {
    expect(new Sim(lv, 9, { playerCount: 2 }).state.players).toHaveLength(2);
    expect(new Sim(lv, 9, { playerCount: 1 }).state.players).toHaveLength(1);
    expect(new Sim(lv, 9, { playerCount: 1, superMode: true }).state.superMode).toBe(true);
  });
  it("startRound loads that round exactly like loadRound and clamps; it draws nothing", () => {
    const sim = new Sim(lv, 9, { playerCount: 1, startRound: 3 });
    expect(sim.state.round).toBe(3);
    expect(sim.currentLevel).toBe(lv[2]);
    const ref = new Sim(lv, 9, 1);
    ref.loadRound(3);
    expect(JSON.stringify(sim.state)).toBe(JSON.stringify(ref.state));
    expect(sim.rng.getState()).toBe(new Rng(9).getState());
    expect(new Sim(lv, 9, { playerCount: 1, startRound: 0 }).state.round).toBe(1);
    expect(new Sim(lv, 9, { playerCount: 1, startRound: -4 }).state.round).toBe(1);
    expect(new Sim(lv, 9, { playerCount: 1, startRound: 99 }).state.round).toBe(5);
    expect(new Sim(lv, 9, { playerCount: 1, startRound: NaN }).state.round).toBe(1);
    expect(new Sim(lv, 9, { playerCount: 1, startRound: 2.7 }).state.round).toBe(2);
  });
  it("startRound can start on the boss arena", () => {
    const levels = [TEST_LEVEL, BOSS_ARENA];
    const sim = new Sim(levels, 1, { playerCount: 2, startRound: 2 });
    expect(boss(sim).maxHp).toBe(TUNING.bossHpBase + 2 * TUNING.bossHpPerPlayer);
    expect(isBossRound(sim.currentLevel)).toBe(true);
  });
  it("LEVELS is untouched by the arena (assembly is a later task)", () => {
    expect(LEVELS.some((l) => l === BOSS_ARENA)).toBe(false);
  });
});

describe("restore", () => {
  const scripted = (t: number): [number, number] => [
    (t % 90 < 45 ? BTN.R : BTN.L) | (t % 7 === 0 ? BTN.F : 0) | (t % 60 === 0 ? BTN.J : 0),
    (t % 80 < 40 ? BTN.L : BTN.R) | (t % 11 === 0 ? BTN.F : 0),
  ];
  const lockstep = (a: Sim, b: Sim, from: number, n: number): void => {
    for (let t = from; t < from + n; t++) {
      const ea = a.step(scripted(t));
      const eb = b.step(scripted(t));
      expect(JSON.stringify(eb), `events @${t}`).toBe(JSON.stringify(ea));
      expect(JSON.stringify(b.state), `state @${t}`).toBe(JSON.stringify(a.state));
    }
  };

  it("mid-fight (volleys, a shot in flight, stun active) replays identically for 300 ticks", () => {
    const sim = bossSim({ playerCount: 2 }, 7);
    for (let t = 0; t < 140; t++) sim.step(scripted(t));
    const b = boss(sim);
    addShot(sim, { x: b.x - 5, y: b.y, vx: 3 });
    sim.step(scripted(140));
    expect(b.stun).toBeGreaterThan(0);
    sim.state.players[0]!.fireCooldown = 0;
    sim.step([BTN.F, 0]);
    expect(sim.state.bubbles.some((x) => x.shot)).toBe(true);
    const copy = Sim.restore([BOSS_ARENA], JSON.parse(JSON.stringify(sim.state)) as GameState);
    expect(JSON.stringify(copy.state)).toBe(JSON.stringify(sim.state));
    const idx0 = b.volleyIndex!;
    lockstep(sim, copy, 142, 300);
    expect(boss(sim).volleyIndex!).toBeGreaterThan(idx0);
  });

  it("the ending phase round-trips and keeps counting", () => {
    const sim = bossSim({ playerCount: 2 });
    run(sim, 2);
    boss(sim).hp = 1;
    addShot(sim);
    run(sim, 1);
    run(sim, 7);
    const copy = Sim.restore([BOSS_ARENA], JSON.parse(JSON.stringify(sim.state)) as GameState);
    expect(copy.state.ending).toBe("true");
    lockstep(sim, copy, 0, 20);
    expect(copy.state.endingTicks).toBe(sim.state.endingTicks);
  });

  it("a super-mode state round-trips", () => {
    const sim = new Sim([TEST_LEVEL], 5, { playerCount: 2, superMode: true });
    for (let t = 0; t < 100; t++) sim.step(scripted(t));
    const copy = Sim.restore([TEST_LEVEL], JSON.parse(JSON.stringify(sim.state)) as GameState);
    expect(copy.state.superMode).toBe(true);
    lockstep(sim, copy, 100, 300);
  });

  it("fills defaults for older saves and repairs corrupt fields", () => {
    const sim = new Sim([TEST_LEVEL], 5, 1);
    const old = JSON.parse(JSON.stringify(sim.state)) as Record<string, unknown>;
    delete old.ending;
    delete old.endingTicks;
    delete old.superMode;
    const r = Sim.restore([TEST_LEVEL], old as unknown as GameState);
    expect([r.state.ending, r.state.endingTicks, r.state.superMode]).toEqual([null, 0, false]);
    for (const bad of ["maybe", 5, {}, true]) {
      const o = JSON.parse(JSON.stringify(sim.state)) as Record<string, unknown>;
      o.ending = bad;
      o.endingTicks = "nope";
      o.superMode = "yes";
      const rr = Sim.restore([TEST_LEVEL], o as unknown as GameState);
      expect(rr.state.ending).toBeNull();
      expect(rr.state.endingTicks).toBe(0);
      expect(rr.state.superMode).toBe(false);
    }
    for (const good of ["bad", "true"] as const) {
      const o = JSON.parse(JSON.stringify(sim.state)) as Record<string, unknown>;
      o.ending = good;
      o.endingTicks = 12.9;
      expect(Sim.restore([TEST_LEVEL], o as unknown as GameState).state).toMatchObject({ ending: good, endingTicks: 12 });
    }
  });

  it("a boss restored without its fields gets them from the formula and the present players", () => {
    const sim = bossSim({ playerCount: 2 });
    run(sim, 3);
    const st = JSON.parse(JSON.stringify(sim.state)) as GameState;
    st.players[1]!.state = "gone";
    const e = st.enemies[0] as unknown as Record<string, unknown>;
    for (const k of ["hp", "maxHp", "stun", "volley", "volleyIndex"]) delete e[k];
    const r = Sim.restore([BOSS_ARENA], st);
    const b = boss(r);
    expect(b.maxHp).toBe(TUNING.bossHpBase + TUNING.bossHpPerPlayer);
    expect(b.hp).toBe(b.maxHp);
    expect([b.stun, b.volley, b.volleyIndex]).toEqual([0, TUNING.bossVolleyTicks, 0]);
    expect(Object.keys(b)).toEqual(Object.keys(boss(sim)));
    // A super save gets the multiplier.
    const st2 = JSON.parse(JSON.stringify(sim.state)) as GameState;
    st2.superMode = true;
    delete (st2.enemies[0] as unknown as Record<string, unknown>).hp;
    delete (st2.enemies[0] as unknown as Record<string, unknown>).maxHp;
    expect(boss(Sim.restore([BOSS_ARENA], st2)).maxHp).toBe((TUNING.bossHpBase + 2 * TUNING.bossHpPerPlayer) * TUNING.bossSuperHpMult);
  });
});

describe("determinism guards", () => {
  const files = (dir: string): string[] =>
    readdirSync(dir, { withFileTypes: true }).flatMap((e) => (e.isDirectory() ? files(join(dir, e.name)) : e.name.endsWith(".ts") ? [join(dir, e.name)] : []));
  it("shared/src uses no Math.random, Date or banned Math functions", () => {
    for (const f of files(join(__dirname, "..", "src"))) {
      expect(readFileSync(f, "utf8"), f).not.toMatch(/Math\.(hypot|sin|cos|tan|atan2?|pow|exp|log\w*|random)\b|Date\./);
    }
  });
  it("only the documented tie-break draws from the rng in the boss module", () => {
    const text = readFileSync(join(__dirname, "..", "src", "sim", "boss.ts"), "utf8");
    expect(text.match(/rng\.(next|int)\(/g)).toHaveLength(1);
    expect(readFileSync(join(__dirname, "..", "src", "sim", "thunder.ts"), "utf8")).not.toMatch(/rng\./);
  });
});

// --- standing-position graph (adapted from the secret-room tests) ---------------------------------------------

interface StandGraph {
  nodes: Map<string, { x: number; y: number }>;
  trapped: string[];
}

/** Positions where a body rests, reachable from the starts by real physics; `trapped` = reachable but unable to return. */
function analyseStands(lv: LevelData, starts: { x: number; y: number }[], jumpVel: number): StandGraph {
  const nodes = new Map<string, { x: number; y: number }>();
  const out = new Map<string, Set<string>>();
  const queue: string[] = [];
  const key = (x: number, y: number): string => `${x},${y}`;
  const add = (x: number, y: number, from?: string): void => {
    const k = key(x, y);
    if (!nodes.has(k)) {
      nodes.set(k, { x, y });
      queue.push(k);
    }
    if (from !== undefined && from !== k) {
      let set = out.get(from);
      if (!set) out.set(from, (set = new Set()));
      set.add(k);
    }
  };
  const startKeys = starts.map((s) => key(s.x, s.y));
  for (const s of starts) add(s.x, s.y);
  const dirs = [-1, 0, 1];
  const t1s = [0, 2, 4, 6, 8, 10, 12, 14, 16, 20, 30, 40, 50];
  const body = { x: 0, y: 0, vx: 0, vy: 0, onGround: true };
  const simulate = (from: string, x: number, y: number, jump: boolean, d1: number, t1: number, d2: number, total: number): void => {
    body.x = x;
    body.y = y;
    body.vx = 0;
    body.vy = 0;
    body.onGround = true;
    for (let t = 0; t < total; t++) {
      body.vx = (t < t1 ? d1 : d2) * TUNING.walkSpeed;
      if (jump && t === 0) {
        body.vy = jumpVel;
        body.onGround = false;
      }
      moveBody(lv, body, PLAYER_SIZE);
      if (body.onGround) {
        add(Math.round(body.x), body.y, from);
        if (jump) return;
      }
    }
  };
  for (let i = 0; i < queue.length; i++) {
    const k = queue[i]!;
    const s = nodes.get(k)!;
    for (const d of dirs) simulate(k, s.x, s.y, false, d, 200, d, 200);
    for (const d1 of dirs) for (const d2 of dirs) for (const t1 of t1s) simulate(k, s.x, s.y, true, d1, t1, d2, 160);
  }
  const back = new Map<string, string[]>();
  for (const [from, tos] of out) for (const to of tos) (back.get(to) ?? back.set(to, []).get(to)!).push(from);
  const component = new Set<string>(startKeys);
  const stack = [...startKeys];
  while (stack.length > 0) {
    for (const prev of back.get(stack.pop()!) ?? []) {
      if (!component.has(prev)) {
        component.add(prev);
        stack.push(prev);
      }
    }
  }
  return { nodes, trapped: [...nodes.keys()].filter((k) => !component.has(k)) };
}
