import { readdirSync, readFileSync, statSync } from "node:fs";
import { join } from "node:path";
import { describe, expect, it } from "vitest";
import { FOOD_BY_ENEMY, Sim, TEST_LEVEL, TILE, TUNING, addScore } from "../src";
import type { BubbleState, EnemyState, GameState, ItemState, SimEvent } from "../src";

const FLOOR_Y = 26 * TILE - TUNING.enemySize / 2;
const newSim = (players: 1 | 2 = 1) => {
  const sim = new Sim([TEST_LEVEL], 1, players);
  sim.state.enemies = [];
  return sim;
};
const run = (sim: Sim, ticks: number, buttons: [number, number] = [0, 0]): SimEvent[] => {
  const ev: SimEvent[] = [];
  for (let i = 0; i < ticks; i++) ev.push(...sim.step(buttons));
  return ev;
};
/** Parks a player where it can neither move, die nor collect anything. */
const park = (sim: Sim, id: 0 | 1 = 0) => {
  const p = sim.state.players[id]!;
  p.state = "dying";
  p.stateTicks = 1_000_000;
};
/** A trapped enemy inside a floating bubble at (x, y). */
const trap = (sim: Sim, x: number, y: number, type: EnemyState["type"] = "walker", over: Partial<BubbleState> = {}) => {
  const e: EnemyState = {
    id: sim.state.nextId++, type, x, y, vx: 0, vy: 0, dir: 1, state: "trapped",
    angry: false, spawnDelay: 0, onGround: false,
  };
  sim.state.enemies.push(e);
  const b: BubbleState = {
    id: sim.state.nextId++, x, y, vx: 0, vy: -TUNING.bubbleRise, kind: "normal", phase: "float",
    ageTicks: 0, owner: 0, trapped: { type, escapeIn: 1000, enemyId: e.id }, ...over,
  };
  sim.state.bubbles.push(b);
  return { e, b };
};
const addFiller = (sim: Sim) =>
  sim.state.enemies.push({
    id: sim.state.nextId++, type: "walker", x: 200, y: FLOOR_Y, vx: 0, vy: 0, dir: 1,
    state: "spawning", angry: false, spawnDelay: 1_000_000, onGround: false,
  });
const addItem = (sim: Sim, over: Partial<ItemState> = {}): ItemState => {
  const it: ItemState = {
    id: sim.state.nextId++, x: 160, y: 60, vx: 0, vy: 0, onGround: false, kind: "food",
    sprite: 0, value: 300, despawnTicks: 100_000, ...over,
  };
  sim.state.items.push(it);
  return it;
};
const pops = (ev: SimEvent[]) => ev.filter((e) => e.kind === "pop");

describe("chain pops", () => {
  it("a single pop scores exactly chainBaseScore, then spawns that enemy's food at the landing spot", () => {
    const sim = newSim();
    addFiller(sim);
    const { e } = trap(sim, 100, 150, "chaser");
    const p = sim.state.players[0]!;
    p.x = 100;
    p.y = 150;
    p.invulnTicks = 1_000_000;
    const ev = run(sim, 1);
    expect(pops(ev)).toHaveLength(1);
    expect(p.score).toBe(1000);
    expect(p.score).toBe(TUNING.chainBaseScore);
    expect(e.state).toBe("dead");
    expect(sim.state.items).toHaveLength(0);
    park(sim);
    let landedX = 0;
    for (let i = 0; i < TUNING.enemyDeathMaxTicks + 2 && sim.state.items.length === 0; i++) {
      landedX = e.x;
      sim.step([0, 0]);
    }
    expect(sim.state.enemies.some((x) => x.id === e.id)).toBe(false);
    expect(sim.state.items).toHaveLength(1);
    const it = sim.state.items[0]!;
    expect(it.kind).toBe("food");
    expect(it.sprite).toBe(FOOD_BY_ENEMY.chaser.sprite);
    expect(it.value).toBe(FOOD_BY_ENEMY.chaser.value);
    expect(it.despawnTicks).toBeLessThanOrEqual(TUNING.foodTtlTicks);
    expect(it.despawnTicks).toBeGreaterThan(TUNING.foodTtlTicks - 3);
    expect(Math.abs(it.x - landedX)).toBeLessThan(1.5);
  });

  it("a triple cascade scores 1000 + 2000 + 4000 for the starter and spawns three foods", () => {
    const sim = newSim();
    addFiller(sim);
    const ids = [100, 114, 128].map((x) => trap(sim, x, 150));
    const p = sim.state.players[0]!;
    p.x = 100;
    p.y = 150;
    p.invulnTicks = 1_000_000;
    const ev = run(sim, 1);
    expect(pops(ev)).toHaveLength(3);
    expect(pops(ev).every((x) => x.player === 0 && typeof x.x === "number" && typeof x.y === "number")).toBe(true);
    expect(p.score).toBe(1000 + 2000 + 4000);
    expect(sim.state.bubbles).toHaveLength(0);
    expect(ids.every(({ e }) => e.state === "dead")).toBe(true);
    park(sim);
    run(sim, TUNING.enemyDeathMaxTicks + 5);
    expect(sim.state.items).toHaveLength(3);
    expect(new Set(sim.state.items.map((i) => i.id)).size).toBe(3);
  });

  it("credits the cascade to the player whose action started it", () => {
    const sim = newSim(2);
    addFiller(sim);
    for (const x of [100, 114, 128]) trap(sim, x, 150);
    const p0 = sim.state.players[0]!;
    const p1 = sim.state.players[1]!;
    p0.x = 30;
    p0.y = FLOOR_Y;
    p1.x = 128;
    p1.y = 150;
    p1.invulnTicks = 1_000_000;
    run(sim, 1);
    expect(p1.score).toBe(7000);
    expect(p0.score).toBe(0);
  });

  it("does not chain a bubble farther than chainRadius from the cluster", () => {
    const sim = newSim();
    addFiller(sim);
    for (const x of [100, 114]) trap(sim, x, 150);
    const far = trap(sim, 114 + TUNING.chainRadius + 6, 150);
    const p = sim.state.players[0]!;
    p.x = 100;
    p.y = 150;
    p.invulnTicks = 1_000_000;
    const ev = run(sim, 1);
    expect(pops(ev)).toHaveLength(2);
    expect(p.score).toBe(3000);
    expect(far.e.state).toBe("trapped");
    expect(sim.state.bubbles.map((b) => b.id)).toEqual([far.b.id]);
  });

  it("caps the per-enemy score at chainMaxScore in a 9-deep cascade", () => {
    const sim = newSim();
    addFiller(sim);
    for (let i = 0; i < 9; i++) trap(sim, 60 + 14 * i, 150);
    const p = sim.state.players[0]!;
    p.x = 60;
    p.y = 150;
    p.invulnTicks = 1_000_000;
    run(sim, 1);
    const expected = [1000, 2000, 4000, 8000, 16000, 32000, 64000, 64000, 64000].reduce((a, b) => a + b, 0);
    expect(TUNING.chainMaxScore).toBe(64000);
    expect(p.score).toBe(expected);
  });

  it("self-expiry and escape pops neither score nor cascade, and release the enemy angry", () => {
    for (const mode of ["expire", "escape"] as const) {
      const sim = newSim();
      addFiller(sim);
      park(sim);
      const a = trap(sim, 100, 150, "walker", mode === "expire" ? { ageTicks: TUNING.bubbleLifeTicks - 1 } : {});
      if (mode === "escape") a.b.trapped!.escapeIn = 1;
      const c = trap(sim, 114, 150);
      const ev = run(sim, 1);
      expect(sim.state.players[0]!.score).toBe(0);
      expect(a.e.state).toBe("active");
      expect(a.e.angry).toBe(true);
      expect(c.e.state).toBe("trapped");
      expect(sim.state.bubbles.map((b) => b.id)).toEqual([c.b.id]);
      expect(pops(ev)).toHaveLength(1);
    }
  });
});

describe("FOOD_BY_ENEMY", () => {
  it("has an in-range entry for every popped enemy type", () => {
    const types = ["walker", "chaser", "thrower", "breather", "bouncer", "flyer", "boss"] as const;
    for (const t of types) {
      const f = FOOD_BY_ENEMY[t];
      expect(f, t).toBeDefined();
      expect(Number.isInteger(f.sprite) && f.sprite >= 0 && f.sprite <= 7).toBe(true);
      expect(f.value).toBeGreaterThanOrEqual(100);
      expect(f.value).toBeLessThanOrEqual(1000);
    }
    expect(FOOD_BY_ENEMY.boss.value).toBe(1000);
    expect(FOOD_BY_ENEMY.walker.value).toBeLessThan(FOOD_BY_ENEMY.flyer.value);
  });
});

describe("food items", () => {
  it("falls, lands on a platform and rests", () => {
    const sim = newSim();
    park(sim);
    const it = addItem(sim, { x: 160, y: 60 });
    run(sim, 120);
    const platformTop = 13 * TILE;
    expect(it.onGround).toBe(true);
    expect(it.y).toBe(platformTop - TUNING.itemSize / 2);
    run(sim, 30);
    expect(it.y).toBe(platformTop - TUNING.itemSize / 2);
    expect(it.vy).toBe(0);
  });

  it("wraps from the bottom back to the top like a player", () => {
    const sim = newSim();
    park(sim);
    const it = addItem(sim, { x: 130, y: 200 });
    let wrapped = false;
    let prev = it.y;
    for (let i = 0; i < 80; i++) {
      sim.step([0, 0]);
      if (it.y < prev - 100) wrapped = true;
      prev = it.y;
    }
    expect(wrapped).toBe(true);
  });

  it("collecting adds the value, emits collect and removes the item (also while invulnerable)", () => {
    const sim = newSim();
    const p = sim.state.players[0]!;
    p.invulnTicks = 1000;
    p.x = 100;
    p.y = 100;
    addItem(sim, { x: 100, y: 100, value: 700 });
    const ev = run(sim, 1);
    expect(p.score).toBe(700);
    expect(sim.state.items).toHaveLength(0);
    const c = ev.filter((e) => e.kind === "collect");
    expect(c).toHaveLength(1);
    expect(c[0]!.player).toBe(0);
    expect(typeof c[0]!.x).toBe("number");
  });

  it("a non-alive player does not collect", () => {
    const sim = newSim();
    const p = sim.state.players[0]!;
    p.x = 100;
    p.y = 100;
    park(sim);
    addItem(sim, { x: 100, y: 100 });
    run(sim, 1);
    expect(p.score).toBe(0);
    expect(sim.state.items).toHaveLength(1);
  });

  it("can be collected during the clearing phase", () => {
    const sim = newSim();
    sim.state.phase = "clearing";
    sim.state.phaseTicks = 0;
    const p = sim.state.players[0]!;
    p.x = 100;
    p.y = 100;
    addItem(sim, { x: 100, y: 100, value: 500 });
    run(sim, 1);
    expect(p.score).toBe(500);
    expect(sim.state.items).toHaveLength(0);
  });

  it("two players on one item: the lower id wins", () => {
    const sim = newSim(2);
    for (const p of sim.state.players) {
      p.x = 100;
      p.y = 100;
    }
    addItem(sim, { x: 100, y: 100, value: 400 });
    const ev = run(sim, 1);
    expect(sim.state.players[0]!.score).toBe(400);
    expect(sim.state.players[1]!.score).toBe(0);
    expect(ev.filter((e) => e.kind === "collect")).toHaveLength(1);
  });

  it("despawns after its TTL", () => {
    const sim = newSim();
    park(sim);
    addItem(sim, { despawnTicks: 3 });
    run(sim, 2);
    expect(sim.state.items).toHaveLength(1);
    run(sim, 1);
    expect(sim.state.items).toHaveLength(0);
  });

  it("items are cleared when the next round loads", () => {
    const sim = newSim();
    addItem(sim);
    sim.loadRound(1);
    expect(sim.state.items).toHaveLength(0);
  });
});

describe("addScore and extra lives", () => {
  it("grants exactly one life and one oneup at 50,000, then another at 150,000", () => {
    const sim = newSim();
    const p = sim.state.players[0]!;
    expect(p.nextLifeAt).toBe(TUNING.firstExtraLifeScore);
    expect(addScore(sim, 0, 49_999)).toEqual([]);
    expect(p.lives).toBe(3);
    const ev = addScore(sim, 0, 1);
    expect(ev).toEqual([{ kind: "oneup", player: 0 }]);
    expect(p.lives).toBe(4);
    expect(p.nextLifeAt).toBe(150_000);
    expect(addScore(sim, 0, 99_999)).toEqual([]);
    expect(addScore(sim, 0, 1)).toEqual([{ kind: "oneup", player: 0 }]);
    expect(p.lives).toBe(5);
    expect(p.nextLifeAt).toBe(250_000);
  });

  it("one huge addition crossing two thresholds grants two lives", () => {
    const sim = newSim();
    const p = sim.state.players[0]!;
    const ev = addScore(sim, 0, 160_000);
    expect(ev.filter((e) => e.kind === "oneup")).toHaveLength(2);
    expect(p.lives).toBe(5);
    expect(p.nextLifeAt).toBe(250_000);
  });

  it("caps lives at maxLives but still advances the threshold", () => {
    const sim = newSim();
    const p = sim.state.players[0]!;
    p.lives = 8;
    const ev = addScore(sim, 0, 260_000);
    expect(p.lives).toBe(TUNING.maxLives);
    expect(p.nextLifeAt).toBe(350_000);
    expect(ev.filter((e) => e.kind === "oneup").length).toBeGreaterThanOrEqual(1);
  });

  it("a pop that crosses 50,000 surfaces the oneup in the step events", () => {
    const sim = newSim();
    addFiller(sim);
    const p = sim.state.players[0]!;
    p.score = 49_500;
    trap(sim, 100, 150);
    p.x = 100;
    p.y = 150;
    p.invulnTicks = 1000;
    const ev = run(sim, 1);
    expect(ev.filter((e) => e.kind === "oneup")).toEqual([{ kind: "oneup", player: 0 }]);
    expect(p.lives).toBe(4);
  });

  it("continueRun resets score and the extra-life threshold", () => {
    const sim = newSim();
    addScore(sim, 0, 200_000);
    expect(sim.state.players[0]!.nextLifeAt).toBe(250_000);
    sim.state.phase = "gameover";
    sim.continueRun();
    expect(sim.state.players[0]!.score).toBe(0);
    expect(sim.state.players[0]!.nextLifeAt).toBe(TUNING.firstExtraLifeScore);
  });

  it("addPlayer starts the second player with the first threshold", () => {
    const sim = newSim(1);
    sim.addPlayer();
    expect(sim.state.players[1]!.nextLifeAt).toBe(TUNING.firstExtraLifeScore);
  });
});

describe("serialization", () => {
  const busyState = (): GameState => {
    const sim = newSim();
    addFiller(sim);
    for (const x of [100, 114]) trap(sim, x, 150);
    addItem(sim, { x: 150, y: 40, vx: 0.3 });
    addItem(sim, { x: 60, y: 120, sprite: 3, value: 600 });
    const p = sim.state.players[0]!;
    p.x = 100;
    p.y = 150;
    run(sim, 20);
    return sim.state;
  };

  it("JSON round-trip + Sim.restore with live items continues identically for 300 ticks", () => {
    const a = new Sim([TEST_LEVEL], 1, 1);
    a.state = busyState();
    expect(a.state.items.length).toBeGreaterThan(0);
    const b = Sim.restore([TEST_LEVEL], JSON.parse(JSON.stringify(a.state)) as GameState);
    for (let i = 0; i < 300; i++) {
      const bt: [number, number] = [i % 40 < 20 ? 1 : 2, 0];
      expect(b.step(bt)).toEqual(a.step(bt));
    }
    expect(b.state).toEqual(a.state);
  });

  it("restore repairs items lacking fields and players lacking nextLifeAt", () => {
    const sim = newSim(2);
    const st = JSON.parse(JSON.stringify(sim.state)) as Record<string, unknown>;
    const players = st.players as Record<string, unknown>[];
    delete players[0]!.nextLifeAt;
    delete players[1]!.nextLifeAt;
    players[0]!.score = 120_000;
    players[1]!.score = 49_999;
    st.items = [
      { id: 90 },
      { id: 91, x: 50, y: 60 },
      { id: 92, x: 70, y: 60, kind: "food", sprite: 2, value: 300, despawnTicks: 50, vx: 0, vy: 0, onGround: true },
    ];
    const r = Sim.restore([TEST_LEVEL], st as unknown as GameState);
    expect(r.state.players[0]!.nextLifeAt).toBe(150_000);
    expect(r.state.players[1]!.nextLifeAt).toBe(50_000);
    expect(r.state.items.map((i) => i.id)).toEqual([91, 92]);
    for (const it of r.state.items) {
      expect(it.kind).toBe("food");
      for (const k of ["x", "y", "vx", "vy", "sprite", "value", "despawnTicks"] as const) {
        expect(Number.isFinite(it[k])).toBe(true);
      }
      expect(typeof it.onGround).toBe("boolean");
    }
    expect(r.state.items[1]!.sprite).toBe(2);
    run(r, 5);
  });
});

describe("determinism guards (source scan)", () => {
  const files = (dir: string): string[] =>
    readdirSync(dir).flatMap((n) => {
      const f = join(dir, n);
      return statSync(f).isDirectory() ? files(f) : f.endsWith(".ts") ? [f] : [];
    });
  const src = files(join(__dirname, "..", "src")).map((f) => ({
    f,
    text: readFileSync(f, "utf8")
      .replace(/\/\*[\s\S]*?\*\//g, "")
      .replace(/\/\/.*$/gm, ""),
  }));

  it("no score is added outside addScore", () => {
    for (const { f, text } of src) {
      if (f.endsWith("scoring.ts")) continue;
      expect(text, f).not.toMatch(/\bscore\s*(\+=|-=|\+\+)|\+\+\s*\w*\.?score\b/);
    }
  });

  it("uses no engine-approximated Math functions or exponentiation", () => {
    for (const { f, text } of src) {
      expect(text, f).not.toMatch(/Math\.(hypot|sin|cos|tan|atan2?|asin|acos|pow|exp|log\w*|cbrt)\b/);
      expect(text, f).not.toMatch(/\*\*/);
    }
  });
});
