import { readdirSync, readFileSync, statSync } from "node:fs";
import { join } from "node:path";
import { describe, expect, it } from "vitest";
import { FOOD_BY_ENEMY, GRID_W, POWER_TABLE, Rng, Sim, TEST_LEVEL, TILE, TUNING, addScore, chainScore, isSolid, repairItems } from "../src";
import type { BubbleState, EnemyState, ItemState, LevelData, PowerId, SimEvent } from "../src";
import { killPlayer } from "../src/sim/combat";
import { BTN } from "../src";

const IDS = Object.keys(POWER_TABLE) as PowerId[];
const FLOOR_Y = 26 * TILE - TUNING.enemySize / 2;
const levels = (n: number): LevelData[] => Array.from({ length: n }, () => TEST_LEVEL);
const newSim = (players: 1 | 2 = 1, n = 1) => {
  const sim = new Sim(levels(n), 1, players);
  sim.state.enemies = [];
  return sim;
};
const run = (sim: Sim, ticks: number, b: [number, number] = [0, 0]): SimEvent[] => {
  const ev: SimEvent[] = [];
  for (let i = 0; i < ticks; i++) ev.push(...sim.step(b));
  return ev;
};
const park = (sim: Sim, id: 0 | 1 = 0) => {
  const p = sim.state.players[id]!;
  p.state = "dying";
  p.stateTicks = 1_000_000;
};
const powerItems = (sim: Sim) => sim.state.items.filter((i) => i.kind === "power");
/** A power item sitting on player 0 (collected during the next step). */
const give = (sim: Sim, power: PowerId, over: Partial<ItemState> = {}): ItemState => {
  const p = sim.state.players[0]!;
  const it: ItemState = {
    id: sim.state.nextId++, x: p.x, y: p.y, vx: 0, vy: 0, onGround: false, kind: "power", sprite: 0,
    power, value: 0, despawnTicks: 100_000, ...over,
  };
  sim.state.items.push(it);
  return it;
};
const addEnemy = (sim: Sim, over: Partial<EnemyState>): EnemyState => {
  const e: EnemyState = {
    id: sim.state.nextId++, type: "walker", x: 200, y: FLOOR_Y, vx: 0, vy: 0, dir: 1, state: "active",
    angry: false, spawnDelay: 0, onGround: false, ...over,
  };
  sim.state.enemies.push(e);
  return e;
};
const trapIn = (sim: Sim, e: EnemyState): BubbleState => {
  e.state = "trapped";
  const b: BubbleState = {
    id: sim.state.nextId++, x: e.x, y: e.y, vx: 0, vy: -TUNING.bubbleRise, kind: "normal", phase: "float",
    ageTicks: 0, owner: 0, trapped: { type: e.type, escapeIn: 100_000, enemyId: e.id },
  };
  sim.state.bubbles.push(b);
  return b;
};
const maxCounters = (sim: Sim) => {
  for (const p of sim.state.players) p.counters = { bubbles: 1e9, jumps: 1e9, distance: 1e9 };
};

describe("POWER_TABLE", () => {
  it("covers the ten powers, each with a counter, a positive threshold and a TUNING-backed value", () => {
    expect(IDS).toEqual(["boots", "tonicA", "parasolS", "tonicB", "ring", "spark", "tonicC", "parasolM", "flask", "parasolL"]);
    for (const id of IDS) {
      const row = POWER_TABLE[id];
      expect(["bubbles", "jumps", "distance"]).toContain(row.counter);
      expect(row.threshold).toBe(TUNING.powerThreshold[id]);
      expect(row.threshold).toBeGreaterThan(0);
      expect(row.effect).toBeDefined();
    }
  });
});

describe("trigger counters", () => {
  it("count jumps, bubbles blown and whole pixels walked, and persist across loadRound", () => {
    const sim = newSim();
    const p = sim.state.players[0]!;
    run(sim, 1, [BTN.J | BTN.F, 0]);
    expect(p.counters.jumps).toBe(1);
    expect(p.counters.bubbles).toBe(1);
    run(sim, 20, [BTN.R, 0]);
    expect(p.counters.distance).toBeGreaterThanOrEqual(15);
    expect(Number.isInteger(p.counters.distance)).toBe(true);
    const snapshot = { ...p.counters };
    p.powers.speed = true;
    sim.loadRound(1);
    expect(p.counters).toEqual(snapshot);
    expect(p.powers.speed).toBe(true);
  });
});

describe("power item spawning", () => {
  const spotOk = (it: ItemState) => {
    const tx = Math.floor(it.x / TILE);
    const ty = Math.round((it.y + TUNING.itemSize / 2) / TILE);
    expect(isSolid(TEST_LEVEL, tx, ty)).toBe(true);
    expect(isSolid(TEST_LEVEL, tx, ty - 1)).toBe(false);
    expect(isSolid(TEST_LEVEL, tx, ty - 2)).toBe(false);
    expect(tx).toBeGreaterThanOrEqual(2);
    expect(tx).toBeLessThanOrEqual(GRID_W - 3);
    expect(it.x).toBe(tx * TILE + TILE / 2);
  };

  it("crossing the jump threshold spawns exactly one power item on a valid platform spot, drawing rng once", () => {
    const sim = newSim();
    const p = sim.state.players[0]!;
    p.counters.jumps = POWER_TABLE.boots.threshold - 1;
    run(sim, 1);
    expect(powerItems(sim)).toHaveLength(0);
    const s0 = sim.rng.getState();
    p.counters.jumps = POWER_TABLE.boots.threshold;
    run(sim, 1);
    const [it] = powerItems(sim);
    expect(powerItems(sim)).toHaveLength(1);
    expect(it!.power).toBe("boots");
    expect(it!.despawnTicks).toBe(TUNING.powerItemTtlTicks);
    spotOk(it!);
    const probe = new Rng(0);
    probe.setState(s0);
    probe.int(5);
    expect(sim.rng.getState()).toBe(probe.getState());
  });

  it("each counter kind triggers its own power", () => {
    for (const [id, field] of [["boots", "jumps"], ["tonicA", "bubbles"], ["parasolS", "distance"]] as const) {
      const sim = newSim();
      const p = sim.state.players[0]!;
      p.powerStep = IDS.indexOf(id);
      p.counters[field] = POWER_TABLE[id].threshold;
      run(sim, 1);
      expect(powerItems(sim).map((i) => i.power)).toEqual([id]);
    }
  });

  it("never spawns a second power item while one is alive, and draws no rng when nothing spawns", () => {
    const sim = newSim();
    park(sim);
    sim.state.players[0]!.state = "alive";
    maxCounters(sim);
    run(sim, 1);
    expect(powerItems(sim)).toHaveLength(1);
    const first = powerItems(sim)[0]!.id;
    const s = sim.rng.getState();
    sim.state.players[0]!.x = 20; // keep clear of the item
    sim.state.players[0]!.y = 20;
    run(sim, 30);
    expect(powerItems(sim).map((i) => i.id)).toEqual([first]);
    expect(sim.rng.getState()).toBe(s);
  });

  it("cycles through the table in order across several spawns", () => {
    const sim = newSim();
    maxCounters(sim);
    const seen: PowerId[] = [];
    for (let i = 0; i < 23; i++) {
      run(sim, 1);
      const items = powerItems(sim);
      expect(items).toHaveLength(1);
      seen.push(items[0]!.power!);
      sim.state.items = [];
    }
    expect(seen).toEqual(Array.from({ length: 23 }, (_, i) => IDS[i % IDS.length]));
  });

  it("the second cycle needs proportionally larger counters", () => {
    const sim = newSim();
    const p = sim.state.players[0]!;
    p.powerStep = IDS.length; // cycle 1: boots again, at twice the threshold
    p.counters.jumps = POWER_TABLE.boots.threshold;
    run(sim, 1);
    expect(powerItems(sim)).toHaveLength(0);
    p.counters.jumps = POWER_TABLE.boots.threshold * 2;
    run(sim, 1);
    expect(powerItems(sim)).toHaveLength(1);
  });

  it("does not spawn outside phase round, for dead players, or when no platform spot exists", () => {
    const a = newSim();
    maxCounters(a);
    a.state.phase = "clearing";
    run(a, 3);
    expect(powerItems(a)).toHaveLength(0);

    const b = newSim();
    maxCounters(b);
    b.state.players[0]!.state = "gone";
    run(b, 3);
    expect(powerItems(b)).toHaveLength(0);

    const bare: LevelData = { ...TEST_LEVEL, tiles: TEST_LEVEL.tiles.map(() => "##" + ".".repeat(28) + "##") };
    const c = new Sim([bare], 1, 1);
    c.state.enemies = [];
    maxCounters(c);
    const s = c.rng.getState();
    run(c, 3);
    expect(powerItems(c)).toHaveLength(0);
    expect(c.rng.getState()).toBe(s);
  });

  it("despawns after powerItemTtlTicks when uncollected", () => {
    const sim = newSim();
    sim.state.players[0]!.counters.jumps = POWER_TABLE.boots.threshold;
    run(sim, 1);
    park(sim);
    run(sim, TUNING.powerItemTtlTicks - 1);
    expect(powerItems(sim)).toHaveLength(1);
    run(sim, 1);
    expect(powerItems(sim)).toHaveLength(0);
  });

  it("the spawned item falls to rest on its platform", () => {
    const sim = newSim();
    sim.state.players[0]!.counters.jumps = POWER_TABLE.boots.threshold;
    run(sim, 1);
    const y0 = powerItems(sim)[0]!.y;
    park(sim);
    run(sim, 20);
    expect(Math.abs(powerItems(sim)[0]!.y - y0)).toBeLessThan(1);
  });
});

describe("collecting lasting powers", () => {
  it("boots set powers.speed, which stays through loadRound and clears on death", () => {
    const sim = newSim();
    give(sim, "boots");
    const ev = run(sim, 1);
    const p = sim.state.players[0]!;
    expect(p.powers.speed).toBe(true);
    expect(ev.filter((e) => e.kind === "collect")).toHaveLength(1);
    expect(powerItems(sim)).toHaveLength(0);
    sim.loadRound(1);
    expect(p.powers.speed).toBe(true);
    p.invulnTicks = 0;
    addEnemy(sim, { x: p.x, y: p.y });
    const ev2 = run(sim, 1);
    expect(ev2.some((e) => e.kind === "die")).toBe(true);
    expect(p.powers).toEqual({ speed: false, fastBubble: false, longBubble: false, rapidFire: false });
  });

  it("the three tonics set rapidFire, fastBubble and longBubble", () => {
    for (const [id, flag] of [["tonicA", "rapidFire"], ["tonicB", "fastBubble"], ["tonicC", "longBubble"]] as const) {
      const sim = newSim();
      give(sim, id);
      run(sim, 1);
      const pw = sim.state.players[0]!.powers;
      expect(pw[flag]).toBe(true);
      expect(Object.values(pw).filter(Boolean)).toHaveLength(1);
    }
  });

  it("killPlayer clears powers and ring; continueRun clears them and resets counters", () => {
    const sim = newSim();
    const p = sim.state.players[0]!;
    p.powers = { speed: true, fastBubble: true, longBubble: true, rapidFire: true };
    p.ringTicks = 50;
    killPlayer(p, []);
    expect(Object.values(p.powers).some(Boolean)).toBe(false);
    expect(p.ringTicks).toBe(0);

    p.powers.speed = true;
    p.ringTicks = 9;
    p.counters = { bubbles: 5, jumps: 6, distance: 7 };
    p.powerStep = 4;
    sim.state.pendingRound = 3;
    sim.state.phase = "gameover";
    sim.continueRun();
    expect(p.powers.speed).toBe(false);
    expect(p.ringTicks).toBe(0);
    expect(p.counters).toEqual({ bubbles: 0, jumps: 0, distance: 0 });
    expect(p.powerStep).toBe(0);
    expect(sim.state.pendingRound).toBe(0);
  });

  it("two players on one power item: the lower id wins", () => {
    const sim = newSim(2);
    const [a, b] = sim.state.players as [never, never];
    (b as { x: number }).x = (a as { x: number }).x;
    (b as { y: number }).y = (a as { y: number }).y;
    give(sim, "boots");
    run(sim, 1);
    expect(sim.state.players[0]!.powers.speed).toBe(true);
    expect(sim.state.players[1]!.powers.speed).toBe(false);
  });

  it("a dying player cannot collect", () => {
    const sim = newSim();
    park(sim);
    give(sim, "boots");
    run(sim, 1);
    expect(sim.state.players[0]!.powers.speed).toBe(false);
    expect(powerItems(sim)).toHaveLength(1);
  });
});

describe("parasols skip rounds at the end of the tick", () => {
  it("S/M/L advance 3/5/7 rounds, emitting clear last and not mid-step", () => {
    for (const [id, n] of [["parasolS", 3], ["parasolM", 5], ["parasolL", 7]] as const) {
      const sim = newSim(1, 20);
      const round0 = sim.state.round;
      give(sim, id);
      const ev = run(sim, 1);
      expect(sim.state.round).toBe(round0 + n);
      expect(sim.state.phase).toBe("round");
      expect(sim.state.pendingRound).toBe(0);
      expect(sim.currentLevel).toBe(sim.levels[round0 + n - 1]);
      const kinds = ev.map((e) => e.kind);
      expect(kinds.indexOf("collect")).toBeGreaterThanOrEqual(0);
      expect(kinds.indexOf("clear")).toBeGreaterThan(kinds.indexOf("collect"));
      expect(kinds[kinds.length - 1]).toBe("clear");
      expect(sim.state.items).toHaveLength(0); // fresh round
    }
  });

  it("the round is still current while the step runs (reload only after stepRound)", () => {
    const sim = newSim(1, 20);
    give(sim, "parasolS");
    sim.state.round = 1;
    const seen: number[] = [];
    const orig = sim.loadRound.bind(sim);
    sim.loadRound = (n: number) => {
      seen.push(n);
      orig(n);
    };
    run(sim, 1);
    expect(seen).toEqual([4]);
  });

  it("caps at 99 and at the level list, never moves backwards, and is a no-op at the end", () => {
    const big = newSim(1, 105);
    big.loadRound(98);
    give(big, "parasolM");
    run(big, 1);
    expect(big.state.round).toBe(99);

    const short = newSim(1, 10);
    short.loadRound(8);
    give(short, "parasolL");
    run(short, 1);
    expect(short.state.round).toBe(10);

    const end = newSim(1, 10);
    end.loadRound(10);
    give(end, "parasolS");
    const ev = run(end, 1);
    expect(end.state.round).toBe(10);
    expect(ev.some((e) => e.kind === "clear")).toBe(false);
    expect(end.state.pendingRound).toBe(0);
  });

  it("works while the round is clearing", () => {
    const sim = newSim(1, 20);
    sim.state.phase = "clearing";
    sim.state.phaseTicks = 5;
    give(sim, "parasolS");
    const ev = run(sim, 1);
    expect(sim.state.round).toBe(4);
    expect(sim.state.phase).toBe("round");
    expect(ev[ev.length - 1]!.kind).toBe("clear");
  });
});

describe("ring", () => {
  it("collecting sets ringTicks, and a second pickup refreshes it", () => {
    const sim = newSim();
    const p = sim.state.players[0]!;
    give(sim, "ring");
    run(sim, 1);
    expect(p.ringTicks).toBe(TUNING.ringTicks);
    run(sim, 100);
    expect(p.ringTicks).toBe(TUNING.ringTicks - 100);
    give(sim, "ring");
    run(sim, 1);
    expect(p.ringTicks).toBe(TUNING.ringTicks);
  });

  it("each jump scores ringJumpScore while the ring lasts, then nothing", () => {
    expect(TUNING.ringTicks).toBe(3600);
    const sim = newSim();
    const p = sim.state.players[0]!;
    p.ringTicks = 100;
    const jumpTicks: number[] = [];
    for (let t = 1; t <= 400; t++) {
      for (const e of sim.step([BTN.J, 0])) if (e.kind === "jump") jumpTicks.push(t);
    }
    const within = jumpTicks.filter((t) => t <= 100).length;
    expect(within).toBeGreaterThanOrEqual(1);
    expect(jumpTicks.length).toBeGreaterThan(within);
    expect(p.score).toBe(within * TUNING.ringJumpScore);
    expect(p.ringTicks).toBe(0);
  });

  it("oneup events from ring score are pushed into the tick's events", () => {
    const sim = newSim();
    const p = sim.state.players[0]!;
    p.ringTicks = 100;
    p.score = p.nextLifeAt - 1;
    const lives = p.lives;
    const ev = run(sim, 1, [BTN.J, 0]);
    expect(ev.filter((e) => e.kind === "oneup")).toHaveLength(1);
    expect(p.lives).toBe(lives + 1);
  });

  it("ring is cleared by death", () => {
    const sim = newSim();
    const p = sim.state.players[0]!;
    p.ringTicks = 500;
    p.invulnTicks = 0;
    addEnemy(sim, { x: p.x, y: p.y });
    run(sim, 1);
    expect(p.ringTicks).toBe(0);
  });
});

describe("spark and flask", () => {
  const setup = (power: PowerId) => {
    const sim = newSim();
    const w = addEnemy(sim, { x: 150, type: "walker" });
    const c = addEnemy(sim, { x: 100, y: 120, type: "chaser" });
    const bub = trapIn(sim, c);
    const f = addEnemy(sim, { x: 180, y: 90, type: "flyer" });
    const spawning = addEnemy(sim, { x: 60, state: "spawning", spawnDelay: 1_000_000 });
    const boss = addEnemy(sim, { x: 220, type: "boss" });
    const hurry = addEnemy(sim, { x: 128, y: 7, type: "hurry" });
    give(sim, power);
    return { sim, w, c, f, bub, spawning, boss, hurry };
  };

  it("spark pops every active or trapped enemy in id order for chain scores, and spares the rest", () => {
    const { sim, w, c, f, bub, spawning, boss, hurry } = setup("spark");
    const ev = run(sim, 1);
    expect(w.state).toBe("dead");
    expect(c.state).toBe("dead");
    expect(f.state).toBe("dead");
    expect(spawning.state).toBe("spawning");
    expect(boss.state).toBe("active");
    expect(hurry.state).toBe("active");
    expect(sim.state.bubbles.some((b) => b.id === bub.id)).toBe(false);
    expect(sim.state.players[0]!.score).toBe(chainScore(1) + chainScore(2) + chainScore(3));
    expect(sim.state.players[0]!.score).toBe(1000 + 2000 + 4000);
    const pops = ev.filter((e) => e.kind === "pop");
    expect(pops).toHaveLength(3);
    expect(pops.every((e) => e.player === 0 && typeof e.x === "number" && typeof e.y === "number")).toBe(true);
    expect(sim.state.items.filter((i) => i.kind === "food")).toHaveLength(0);
    run(sim, TUNING.enemyDeathMaxTicks + 5);
    const foods = sim.state.items.filter((i) => i.kind === "food");
    expect(foods).toHaveLength(3);
    expect(foods.map((i) => i.value).sort((a, b) => a - b)).toEqual(
      [FOOD_BY_ENEMY.walker.value, FOOD_BY_ENEMY.chaser.value, FOOD_BY_ENEMY.flyer.value],
    );
    expect(sim.state.enemies.filter((e) => e.state === "dead")).toHaveLength(0);
  });

  it("flask kills the same enemies and also rains floodFoodCount food items from the top", () => {
    const { sim } = setup("flask");
    const s0 = sim.rng.getState();
    run(sim, 1);
    const food = sim.state.items.filter((i) => i.kind === "food");
    expect(food).toHaveLength(TUNING.floodFoodCount);
    expect(sim.state.players[0]!.score).toBe(7000);
    for (const it of food) {
      expect(it.y).toBeLessThan(40);
      expect(it.x).toBeGreaterThanOrEqual(2 * TILE);
      expect(it.x).toBeLessThanOrEqual(30 * TILE);
    }
    const y0 = food.map((i) => i.y);
    expect(sim.rng.getState()).not.toBe(s0);
    park(sim);
    run(sim, 20);
    const now = sim.state.items.filter((i) => food.some((f) => f.id === i.id));
    expect(now.length).toBe(food.length);
    now.forEach((i, k) => expect(i.y).toBeGreaterThan(y0[k]!));
  });

  it("flask draws exactly floodFoodCount rng values, and works with zero enemies", () => {
    const sim = newSim();
    give(sim, "flask");
    const s0 = sim.rng.getState();
    const ev = run(sim, 1);
    expect(ev.filter((e) => e.kind === "pop")).toHaveLength(0);
    expect(sim.state.items.filter((i) => i.kind === "food")).toHaveLength(TUNING.floodFoodCount);
    const probe = new Rng(0);
    probe.setState(s0);
    for (let i = 0; i < TUNING.floodFoodCount; i++) probe.next();
    expect(sim.rng.getState()).toBe(probe.getState());
    // food kinds cycle through the table values by index
    const values = Object.values(FOOD_BY_ENEMY);
    const foods = sim.state.items.filter((i) => i.kind === "food");
    foods.forEach((it, i) => {
      expect(it.value).toBe(values[i % values.length]!.value);
      expect(it.sprite).toBe(values[i % values.length]!.sprite);
      expect(it.despawnTicks).toBeLessThanOrEqual(TUNING.foodTtlTicks);
    });
  });

  it("spark with zero enemies does nothing, also while clearing", () => {
    const sim = newSim();
    give(sim, "spark");
    const ev = run(sim, 1);
    expect(ev.filter((e) => e.kind === "pop")).toHaveLength(0);
    expect(sim.state.players[0]!.score).toBe(0);

    const c = newSim();
    c.state.phase = "clearing";
    give(c, "flask");
    expect(() => run(c, 1)).not.toThrow();
    expect(c.state.items.filter((i) => i.kind === "food")).toHaveLength(TUNING.floodFoodCount);
  });

  it("two active enemies score through addScore's extra-life path (oneup propagates)", () => {
    const sim = newSim();
    addEnemy(sim, { x: 150 });
    addEnemy(sim, { x: 170 });
    const p = sim.state.players[0]!;
    p.score = p.nextLifeAt - 1;
    give(sim, "spark");
    const ev = run(sim, 1);
    expect(ev.filter((e) => e.kind === "oneup")).toHaveLength(1);
  });
});

describe("addScore guards and repairItems", () => {
  it("addScore ignores NaN, Infinity, zero and negative amounts", () => {
    const sim = newSim();
    for (const n of [NaN, Infinity, -Infinity, 0, -5]) {
      expect(addScore(sim, 0, n)).toEqual([]);
      expect(sim.state.players[0]!.score).toBe(0);
    }
    addScore(sim, 0, 10);
    expect(sim.state.players[0]!.score).toBe(10);
  });

  it("repairItems clamps value and despawnTicks, drops non-finite positions, validates power", () => {
    const out = repairItems([
      { id: 1, x: 1, y: 1, kind: "food", value: -5, despawnTicks: 0 },
      { id: 2, x: NaN, y: 1 },
      { id: 3, x: Infinity, y: 1 },
      { id: 4, x: 5, y: 5, kind: "power", power: "boots", despawnTicks: -9, value: 0 },
      { id: 5, x: 5, y: 5, kind: "power", power: "nonsense" },
      { id: 6, x: 5, y: 5, kind: "power" },
      { id: 7, x: 5, y: 5, kind: "food", power: "boots" },
    ]);
    expect(out.map((i) => i.id)).toEqual([1, 4, 7]);
    expect(out[0]!.value).toBe(0);
    expect(out[0]!.despawnTicks).toBe(1);
    expect(out[1]!.power).toBe("boots");
    expect(out[1]!.despawnTicks).toBe(1);
    expect(out[2]!.power).toBeUndefined();
  });
});

describe("restore", () => {
  it("fills defaults for older saves", () => {
    const sim = newSim(2);
    const old = JSON.parse(JSON.stringify(sim.state)) as Record<string, unknown>;
    delete old["pendingRound"];
    for (const p of old["players"] as Record<string, unknown>[]) {
      delete p["counters"];
      delete p["ringTicks"];
      delete p["powerStep"];
      p["powers"] = undefined;
    }
    const r = Sim.restore(levels(1), old as never);
    expect(r.state.pendingRound).toBe(0);
    for (const p of r.state.players) {
      expect(p.counters).toEqual({ bubbles: 0, jumps: 0, distance: 0 });
      expect(p.ringTicks).toBe(0);
      expect(p.powerStep).toBe(0);
      expect(p.powers).toEqual({ speed: false, fastBubble: false, longBubble: false, rapidFire: false });
    }
    expect(() => run(r, 5)).not.toThrow();
  });

  it("JSON round trip with live power items, an active ring and a pending round continues identically for 300 ticks", () => {
    const a = new Sim(levels(12), 99, 2);
    run(a, 40, [BTN.R | BTN.J | BTN.F, BTN.L | BTN.F]);
    a.state.items.push({
      id: a.state.nextId++, x: 120, y: 60, vx: 0, vy: 0, onGround: false, kind: "power", sprite: 0,
      power: "flask", value: 0, despawnTicks: 500,
    });
    const pl = a.state.players[1]!;
    pl.ringTicks = 400;
    pl.powers.speed = true;
    pl.counters = { bubbles: 3, jumps: 4, distance: 5 };
    pl.powerStep = 3;
    a.state.pendingRound = 3;
    const b = Sim.restore(levels(12), JSON.parse(JSON.stringify(a.state)));
    for (let t = 0; t < 300; t++) {
      const btn: [number, number] = [(t * 7) % 16, (t * 5 + 3) % 16];
      expect(JSON.stringify(b.step(btn))).toBe(JSON.stringify(a.step(btn)));
    }
    expect(JSON.stringify(b.state)).toBe(JSON.stringify(a.state));
    expect(a.state.round).toBeGreaterThanOrEqual(3);
  });
});

describe("determinism source guards", () => {
  const files = (dir: string): string[] =>
    readdirSync(dir).flatMap((n) => {
      const f = join(dir, n);
      return statSync(f).isDirectory() ? files(f) : f.endsWith(".ts") ? [f] : [];
    });
  it("shared/src uses no Math.random, Date or banned Math functions", () => {
    for (const f of files(join(__dirname, "..", "src"))) {
      const text = readFileSync(f, "utf8").replace(/\/\*[\s\S]*?\*\//g, "").replace(/\/\/.*$/gm, "");
      expect(text, f).not.toMatch(/Math\.random|Date\.now|new Date|performance\.now/);
      expect(text, f).not.toMatch(/Math\.(hypot|sin|cos|tan|atan2?|pow|exp|log\w*)\b/);
    }
  });
});
