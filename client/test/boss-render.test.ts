import { describe, expect, it } from "vitest";
import { Sim, TEST_LEVEL, type BubbleState, type EnemyState, type GameState } from "@bubble/shared";
import { render } from "../src/render/renderer";
import type { SpriteName, SpriteSheet } from "../src/render/sprites";
import { validateTemplates } from "../src/render/sprites";

interface Draw {
  name: SpriteName;
  frame: number;
  w: number;
  cx: number;
  cy: number;
  flip: boolean;
  alpha: number;
}
interface Fill {
  style: string;
  x: number;
  y: number;
  w: number;
  h: number;
}

function harness() {
  const draws: Draw[] = [];
  const fills: Fill[] = [];
  let cur = { name: "" as SpriteName, frame: 0 };
  let tx = 0;
  let ty = 0;
  let sx = 1;
  const stack: [number, number, number, number][] = [];
  const sheet = {
    canvas: {} as CanvasImageSource,
    createLayer: () => ({ canvas: {} as CanvasImageSource, ctx }),
    rectOf(name: SpriteName, frame: number) {
      cur = { name, frame };
      const s = ["tile_", "font_", "icon_"].some((p) => name.startsWith(p)) ? 8 : 16;
      return { sx: 0, sy: 0, w: s, h: s };
    },
  } as unknown as SpriteSheet;
  const ctx: any = {
    fillStyle: "",
    globalAlpha: 1,
    fillRect(this: any, x: number, y: number, w: number, h: number) {
      fills.push({ style: String(this.fillStyle), x, y, w, h });
    },
    drawImage(this: any, ...a: number[]) {
      draws.push({ ...cur, w: a[7]!, cx: tx + sx * (a[5]! + a[7]! / 2), cy: ty + a[6]! + a[8]! / 2, flip: sx < 0, alpha: this.globalAlpha });
    },
    save(this: any) {
      stack.push([tx, ty, sx, this.globalAlpha]);
    },
    restore(this: any) {
      const top = stack.pop()!;
      tx = top[0];
      ty = top[1];
      sx = top[2];
      this.globalAlpha = top[3];
    },
    translate(x: number, y: number) {
      tx += x;
      ty += y;
    },
    scale(x: number) {
      sx *= x;
    },
    rotate() {},
  };
  return { draws, fills, sheet, ctx: ctx as CanvasRenderingContext2D };
}

function base(): GameState {
  const sim = new Sim([TEST_LEVEL], 1, 2);
  for (let i = 0; i < 30; i++) sim.step([0, 0]);
  const s = structuredClone(sim.state);
  s.enemies = [];
  s.bubbles = [];
  s.projectiles = [];
  return s;
}
const boss = (o: Partial<EnemyState> = {}): EnemyState => ({
  id: 700,
  type: "boss",
  x: 128,
  y: 120,
  vx: 0,
  vy: 0,
  dir: 1,
  state: "active",
  angry: false,
  spawnDelay: 0,
  onGround: true,
  ...o,
});
const bubble = (o: Partial<BubbleState>): BubbleState => ({
  id: 800,
  x: 60,
  y: 90,
  vx: 0,
  vy: 0,
  kind: "normal",
  phase: "float",
  ageTicks: 0,
  owner: 0,
  ...o,
});
const isBar = (f: Fill) => f.w <= 122 && f.h <= 8 && f.y > 8 && f.y < 40;
const bossDraws = (d: Draw[]) => d.filter((x) => x.name.startsWith("enemy_boss"));

describe("boss rendering", () => {
  it("draws the boss at 3x centred on the entity, with the hp bar", () => {
    const h = harness();
    const s = base();
    s.enemies = [boss({ hp: 80, maxHp: 100, stun: 0 })];
    render(h.ctx, h.sheet, s, [TEST_LEVEL], 0);
    const b = bossDraws(h.draws);
    expect(b).toHaveLength(1);
    expect(b[0]).toMatchObject({ name: "enemy_boss", w: 48, cx: 128, cy: 120, alpha: 1 });
    expect(h.fills.filter(isBar).length).toBeGreaterThan(0);
  });

  it("a boss without hp fields (no boss-fight server) is drawn plainly: no bar, ordinary size, no crash", () => {
    const h = harness();
    const s = base();
    s.enemies = [boss()];
    render(h.ctx, h.sheet, s, [TEST_LEVEL], 0);
    expect(bossDraws(h.draws)).toHaveLength(1);
    expect(bossDraws(h.draws)[0]!.w).toBe(16);
    expect(h.fills.filter(isBar)).toEqual([]);
  });

  it("uses the angry sprite once hp * 3 <= maxHp, not before", () => {
    for (const [hp, name] of [
      [34, "enemy_boss"],
      [33, "enemy_boss_angry"],
      [10, "enemy_boss_angry"],
    ] as const) {
      const h = harness();
      const s = base();
      s.enemies = [boss({ hp, maxHp: 100, stun: 0 })];
      render(h.ctx, h.sheet, s, [TEST_LEVEL], 0);
      expect(bossDraws(h.draws).map((d) => d.name), String(hp)).toEqual([name]);
    }
  });

  it("blinks while stunned: half alpha on alternate 4-tick windows", () => {
    const alphas = [0, 4].map((rt) => {
      const h = harness();
      const s = base();
      s.roundTicks = rt;
      s.enemies = [boss({ hp: 50, maxHp: 100, stun: 20 })];
      render(h.ctx, h.sheet, s, [TEST_LEVEL], 0);
      return bossDraws(h.draws)[0]!.alpha;
    });
    expect([...alphas].sort()).toEqual([0.5, 1]);
    const h = harness();
    const s = base();
    s.roundTicks = 4;
    s.enemies = [boss({ hp: 50, maxHp: 100, stun: 0 })];
    render(h.ctx, h.sheet, s, [TEST_LEVEL], 0);
    expect(bossDraws(h.draws)[0]!.alpha).toBe(1);
  });

  it("draws a 120x6 hp bar below the HUD only for a boss with finite hp and maxHp > 0", () => {
    const h = harness();
    const s = base();
    s.enemies = [boss({ hp: 70, maxHp: 100 })];
    render(h.ctx, h.sheet, s, [TEST_LEVEL], 0);
    const bar = h.fills.filter(isBar);
    expect(bar.length).toBeGreaterThanOrEqual(2);
    expect(Math.max(...bar.map((f) => f.w))).toBe(120);
    const filled = bar.find((f) => f.w === 83);
    expect(filled).toBeDefined();
    expect(filled!.h).toBeLessThanOrEqual(6);
    expect(Math.min(...bar.map((f) => f.y))).toBeGreaterThanOrEqual(16);
    for (const bad of [{ hp: NaN, maxHp: 100 }, { hp: 5, maxHp: 0 }, { hp: 5 }, { maxHp: 5 }]) {
      const g = harness();
      const t = base();
      t.enemies = [boss(bad)];
      render(g.ctx, g.sheet, t, [TEST_LEVEL], 0);
      expect(g.fills.filter(isBar), JSON.stringify(bad)).toEqual([]);
      expect(bossDraws(g.draws)).toHaveLength(1);
    }
  });

  it("clamps the filled part for out-of-range hp", () => {
    const h = harness();
    const s = base();
    s.enemies = [boss({ hp: -5, maxHp: 100 }), boss({ id: 701, hp: 500, maxHp: 100 })];
    expect(() => render(h.ctx, h.sheet, s, [TEST_LEVEL], 0)).not.toThrow();
    expect(Math.max(...h.fills.filter(isBar).map((f) => f.w))).toBeLessThanOrEqual(120);
  });
});

describe("thunder shots", () => {
  it("draws a shot as the bolt tile, flipped by vx, not as a bubble", () => {
    for (const [vx, flip] of [
      [3, false],
      [-3, true],
    ] as const) {
      const h = harness();
      const s = base();
      s.bubbles = [bubble({ kind: "lightning", phase: "launch", shot: true, vx, ageTicks: 2 })];
      render(h.ctx, h.sheet, s, [TEST_LEVEL], 0);
      const d = h.draws.filter((x) => x.name === "icon_bolt");
      expect(d).toHaveLength(1);
      expect(d[0]).toMatchObject({ w: 8, flip, cx: 60, cy: 90 });
      expect(h.draws.some((x) => x.name === "bubble_lightning")).toBe(false);
    }
  });

  it("alternates the two bolt frames by ageTicks", () => {
    const frames = [0, 2].map((age) => {
      const h = harness();
      const s = base();
      s.bubbles = [bubble({ kind: "lightning", phase: "launch", shot: true, vx: 3, ageTicks: age })];
      render(h.ctx, h.sheet, s, [TEST_LEVEL], 0);
      return h.draws.find((x) => x.name === "icon_bolt")!.frame;
    });
    expect(new Set(frames).size).toBe(2);
  });

  it("an ordinary lightning special bubble keeps its bubble sprite", () => {
    const h = harness();
    const s = base();
    s.bubbles = [bubble({ kind: "lightning" })];
    render(h.ctx, h.sheet, s, [TEST_LEVEL], 0);
    expect(h.draws.some((x) => x.name === "bubble_lightning")).toBe(true);
    expect(h.draws.some((x) => x.name === "icon_bolt")).toBe(false);
  });
});

describe("ending phase", () => {
  it.each(["true", "bad"] as const)("renders the normal scene for ending %s", (ending) => {
    const h = harness();
    const s = base();
    s.phase = "ending";
    s.ending = ending;
    s.endingTicks = 120;
    s.runOver = true;
    expect(() => render(h.ctx, h.sheet, s, [TEST_LEVEL], 0)).not.toThrow();
    expect(h.draws.some((x) => x.name.startsWith("hero_"))).toBe(true);
    expect(h.draws.some((x) => x.name.startsWith("tile_"))).toBe(true);
  });
});

it("sprite templates stay valid", () => {
  expect(validateTemplates()).toEqual([]);
});
