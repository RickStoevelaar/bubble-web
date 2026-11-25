import { describe, expect, it } from "vitest";
import { Sim, TEST_LEVEL, TILE, TUNING } from "../src";
import type { BubbleState, EnemyState, LevelData, SimEvent } from "../src";

const FLOOR_Y = 26 * TILE - TUNING.enemySize / 2; // center y of a body standing on the floor
const newSim = (level: LevelData = TEST_LEVEL) => {
  const sim = new Sim([level], 1, 1);
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
/** An inert second enemy so "last one standing" anger does not apply. */
const addFiller = (sim: Sim) => addEnemy(sim, { state: "spawning", spawnDelay: 1_000_000, x: 200 });
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
const farFromPlayer = (sim: Sim) => {
  const p = sim.state.players[0]!;
  p.x = 40;
  p.y = FLOOR_Y;
  return p;
};

describe("spawning", () => {
  it("loadRound spawns level enemies as spawning, active after delayTicks", () => {
    const lv: LevelData = { ...TEST_LEVEL, enemies: [{ type: "walker", col: 10, row: 25, delayTicks: 5 }] };
    const sim = new Sim([lv], 1, 1);
    expect(sim.state.enemies).toHaveLength(1);
    const e = sim.state.enemies[0]!;
    expect(e.state).toBe("spawning");
    expect(e.spawnDelay).toBe(5);
    expect(e.x).toBe(10 * TILE + TILE / 2);
    expect(e.y).toBe(26 * TILE - TUNING.enemySize / 2);
    run(sim, 4);
    expect(e.state).toBe("spawning");
    run(sim, 1);
    expect(e.state).toBe("active");
  });
  it("uses ids from the shared counter", () => {
    const sim = new Sim([TEST_LEVEL], 1, 1);
    expect(sim.state.enemies[0]!.id).toBe(1);
    expect(sim.state.nextId).toBe(2);
  });
});

describe("walker movement", () => {
  it("patrols at the enemy walk speed", () => {
    const sim = newSim();
    farFromPlayer(sim);
    addFiller(sim);
    const e = addEnemy(sim, { x: 100 });
    run(sim, 10);
    expect(e.x - 100).toBeCloseTo(10 * TUNING.enemyWalkSpeed, 5);
    expect(e.y).toBe(FLOOR_Y);
  });
  it("reverses at a wall", () => {
    const sim = newSim();
    farFromPlayer(sim);
    addFiller(sim);
    const e = addEnemy(sim, { x: 30 * TILE - TUNING.enemySize / 2 - 2 });
    run(sim, 10);
    expect(e.dir).toBe(-1);
    expect(e.x).toBeLessThanOrEqual(30 * TILE - TUNING.enemySize / 2);
    run(sim, 20);
    expect(e.x).toBeLessThan(30 * TILE - TUNING.enemySize / 2 - 5);
  });
  it("at a ledge either drops or reverses, deterministically, and both happen across seeds", () => {
    const outcomes = new Set<string>();
    for (let seed = 1; seed <= 40; seed++) {
      const sim = new Sim([TEST_LEVEL], seed, 1);
      sim.state.enemies = [];
      farFromPlayer(sim);
      addFiller(sim);
      // Row 8 platform spans cols 6-11 (x 48..96), top at y=64.
      const e = addEnemy(sim, { x: 88, y: 8 * TILE - TUNING.enemySize / 2 });
      run(sim, 60);
      outcomes.add(e.y > 8 * TILE ? "drop" : e.dir === -1 ? "reverse" : "other");
    }
    expect(outcomes).toEqual(new Set(["drop", "reverse"]));
  });
  it("hops up when a player stands on a platform above within reach", () => {
    const sim = newSim();
    const p = sim.state.players[0]!;
    // Player on the row 13 platform (cols 18-23, top y=104).
    p.x = 170;
    p.y = 13 * TILE - 7;
    p.onGround = true;
    p.invulnTicks = 1_000_000;
    addFiller(sim);
    // Walker on the row 18 platform (cols 20-25, top y=144).
    const e = addEnemy(sim, { x: 180, y: 18 * TILE - TUNING.enemySize / 2 });
    let minY = e.y;
    for (let i = 0; i < 600; i++) {
      sim.step([0, 0]);
      minY = Math.min(minY, e.y);
    }
    expect(minY).toBeLessThan(18 * TILE - TUNING.enemySize / 2 - 20);
  });
});

describe("trapping", () => {
  it("a launch-phase bubble traps an overlapping active walker", () => {
    const sim = newSim();
    farFromPlayer(sim);
    addFiller(sim);
    const e = addEnemy(sim);
    const b = addBubble(sim, { phase: "launch", x: 90, vx: TUNING.bubbleLaunchSpeed });
    run(sim, 3);
    expect(e.state).toBe("trapped");
    expect(b.trapped).toEqual({ type: "walker", escapeIn: expect.any(Number), enemyId: e.id });
    expect(b.trapped!.escapeIn).toBeLessThanOrEqual(TUNING.bubbleEscapeTicks);
    expect(b.phase).toBe("float");
  });
  it("a float-phase bubble does not trap", () => {
    const sim = newSim();
    farFromPlayer(sim);
    addFiller(sim);
    const e = addEnemy(sim);
    addBubble(sim, { phase: "float", x: 100, y: FLOOR_Y });
    run(sim, 3);
    expect(e.state).toBe("active");
  });
  it("the trapped enemy follows its bubble and does not move on its own", () => {
    const sim = newSim();
    farFromPlayer(sim);
    addFiller(sim);
    const e = addEnemy(sim);
    const b = addBubble(sim, { phase: "launch", x: 100, vx: 1 });
    run(sim, 10);
    expect(e.state).toBe("trapped");
    expect(e.x).toBe(b.x);
    expect(e.y).toBe(b.y);
    expect(b.y).toBeLessThan(FLOOR_Y);
  });
  it("popping the bubble kills the enemy, emits pop and scores for the player", () => {
    const sim = newSim();
    const p = farFromPlayer(sim);
    addFiller(sim);
    const e = addEnemy(sim);
    addBubble(sim, { phase: "launch", x: 100, vx: 1 });
    run(sim, 3);
    expect(e.state).toBe("trapped");
    p.x = e.x;
    p.y = e.y;
    p.invulnTicks = 1_000_000;
    const ev = run(sim, 1);
    expect(ev.some((x) => x.kind === "pop" && x.player === 0)).toBe(true);
    expect(e.state).toBe("dead");
    expect(p.score).toBe(TUNING.enemyPopScore);
    expect(sim.state.bubbles).toHaveLength(0);
    run(sim, TUNING.enemyDeathMaxTicks + 1);
    expect(sim.state.enemies.some((x) => x.id === e.id)).toBe(false);
  });
  it("escapes angry after bubbleEscapeTicks", () => {
    const sim = newSim();
    farFromPlayer(sim);
    addFiller(sim);
    const e = addEnemy(sim);
    addBubble(sim, { phase: "launch", x: 100, vx: 1 });
    run(sim, 3);
    expect(e.state).toBe("trapped");
    run(sim, TUNING.bubbleEscapeTicks + 1);
    expect(e.state).toBe("active");
    expect(e.angry).toBe(true);
    expect(sim.state.bubbles).toHaveLength(0);
    const x0 = e.x;
    const dir = e.dir;
    // Let it land first, then measure the walking speed.
    run(sim, 200);
    const x1 = e.x;
    run(sim, 1);
    expect(Math.abs(e.x - x1)).toBeCloseTo(TUNING.enemyWalkSpeed * TUNING.angerSpeedMult, 5);
    expect(x0).not.toBe(x1);
    expect(dir === 1 || dir === -1).toBe(true);
  });
  it("escapes angry when the bubble expires", () => {
    const sim = newSim();
    farFromPlayer(sim);
    addFiller(sim);
    const e = addEnemy(sim, { state: "trapped" });
    addBubble(sim, {
      x: 100,
      y: 100,
      ageTicks: TUNING.bubbleLifeTicks - 1,
      trapped: { type: "walker", escapeIn: 1000, enemyId: e.id },
    });
    run(sim, 1);
    expect(sim.state.bubbles).toHaveLength(0);
    expect(e.state).toBe("active");
    expect(e.angry).toBe(true);
  });
});

describe("anger", () => {
  it("the last non-dead enemy turns angry", () => {
    const sim = newSim();
    farFromPlayer(sim);
    const a = addEnemy(sim, { x: 100 });
    const b = addEnemy(sim, { x: 150 });
    run(sim, 2);
    expect(a.angry || b.angry).toBe(false);
    b.state = "dead";
    run(sim, 1);
    expect(a.angry).toBe(true);
    expect(b.angry).toBe(false);
  });
  it("all enemies turn angry once roundTicks exceeds roundAngerTicks", () => {
    const sim = newSim();
    farFromPlayer(sim);
    addFiller(sim);
    const e = addEnemy(sim);
    sim.state.roundTicks = TUNING.roundAngerTicks - 1;
    run(sim, 1);
    expect(e.angry).toBe(false);
    run(sim, 1);
    expect(sim.state.roundTicks).toBe(TUNING.roundAngerTicks + 1);
    expect(e.angry).toBe(true);
  });
  it("roundTicks counts up each tick and resets on loadRound", () => {
    const sim = newSim();
    run(sim, 7);
    expect(sim.state.roundTicks).toBe(7);
    sim.loadRound(1);
    expect(sim.state.roundTicks).toBe(0);
  });
});

describe("player death", () => {
  const touching = () => {
    const sim = newSim();
    addFiller(sim);
    const p = sim.state.players[0]!;
    const e = addEnemy(sim, { x: p.x, y: p.y });
    return { sim, p, e };
  };
  it("contact kills the player, decrements lives once, emits die", () => {
    const { sim, p } = touching();
    const ev = run(sim, 1);
    expect(ev.filter((x) => x.kind === "die" && x.player === 0)).toHaveLength(1);
    expect(p.state).toBe("dying");
    expect(p.lives).toBe(TUNING.startLives - 1);
    run(sim, 5);
    expect(p.lives).toBe(TUNING.startLives - 1);
  });
  it("respawns at the spawn point with invulnerability", () => {
    const { sim, p, e } = touching();
    const spawnX = p.x;
    const spawnY = p.y;
    run(sim, 1);
    expect(p.state).toBe("dying");
    e.x = 200; // move the enemy away so it cannot re-kill the respawned player
    p.x = 120; // wandered while dying; respawn resets position
    for (let i = 0; i < TUNING.playerDyingTicks + 1 && p.state === "dying"; i++) run(sim, 1);
    expect(p.state).toBe("respawning");
    expect(p.x).toBe(spawnX);
    expect(p.y).toBe(spawnY);
    for (let i = 0; i < TUNING.respawnTicks + 1 && p.state === "respawning"; i++) run(sim, 1);
    expect(p.state).toBe("alive");
    expect(p.invulnTicks).toBe(TUNING.invulnTicks);
    run(sim, 1);
    expect(p.invulnTicks).toBe(TUNING.invulnTicks - 1);
  });
  it("is gone at zero lives", () => {
    const { sim, p, e } = touching();
    p.lives = 1;
    run(sim, 1);
    e.x = 200;
    expect(p.lives).toBe(0);
    run(sim, TUNING.playerDyingTicks + 5);
    expect(p.state).toBe("gone");
  });
  it("an invulnerable player survives contact", () => {
    const { sim, p } = touching();
    p.invulnTicks = 10;
    const ev = run(sim, 1);
    expect(ev.some((x) => x.kind === "die")).toBe(false);
    expect(p.state).toBe("alive");
    expect(p.lives).toBe(TUNING.startLives);
  });
  it("a trapped enemy does not hurt the player", () => {
    const { sim, p, e } = touching();
    e.state = "trapped";
    addBubble(sim, { x: 5, y: 5, trapped: { type: "walker", escapeIn: 1000, enemyId: e.id } });
    run(sim, 1);
    expect(p.state).toBe("alive");
  });
});
