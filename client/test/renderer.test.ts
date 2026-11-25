import { describe, expect, it } from "vitest";
import { Sim, TEST_LEVEL, TUNING, type BubbleState, type EnemyState, type GameState } from "@bubble/shared";
import { render } from "../src/render/renderer";
import type { SpriteName, SpriteSheet } from "../src/render/sprites";

interface Rec {
  names: { name: SpriteName; frame: number }[];
  draws: { dw: number; dh: number; dx: number; dy: number }[];
  fills: number;
}

const SMALL = ["tile_", "font_", "icon_"];

function harness() {
  const rec: Rec = { names: [], draws: [], fills: 0 };
  const sheet = {
    canvas: {} as CanvasImageSource,
    rectOf(name: SpriteName, frame: number) {
      rec.names.push({ name, frame });
      const s = SMALL.some((p) => name.startsWith(p)) ? 8 : 16;
      return { sx: 0, sy: 0, w: s, h: s };
    },
  } as unknown as SpriteSheet;
  const noop = () => {};
  const ctx = {
    fillStyle: "",
    globalAlpha: 1,
    fillRect: () => rec.fills++,
    drawImage: (...a: number[]) => rec.draws.push({ dx: a[5]!, dy: a[6]!, dw: a[7]!, dh: a[8]! }),
    save: noop,
    restore: noop,
    translate: noop,
    scale: noop,
    rotate: noop,
  } as unknown as CanvasRenderingContext2D;
  return { rec, sheet, ctx };
}

const solidCount = (lv: { tiles: string[] }) => lv.tiles.join("").split("#").length - 1;
const fontText = (r: Rec) =>
  r.names
    .filter((n) => n.name.startsWith("font_"))
    .map((n) => n.name.slice(5))
    .join("");
const count = (r: Rec, pred: (n: SpriteName) => boolean) => r.names.filter((n) => pred(n.name)).length;

function demoState(): GameState {
  const sim = new Sim([TEST_LEVEL], 1, 2);
  for (let i = 0; i < 30; i++) sim.step([0, 0]);
  return structuredClone(sim.state);
}
const enemy = (o: Partial<EnemyState>): EnemyState => ({
  id: 900,
  type: "walker",
  x: 100,
  y: 100,
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
  x: 120,
  y: 120,
  vx: 0,
  vy: 0,
  kind: "normal",
  phase: "float",
  ageTicks: 0,
  owner: 0,
  ...o,
});

describe("render", () => {
  it("draws one wall tile per solid tile of the round's level, in the level theme", () => {
    const { rec, sheet, ctx } = harness();
    const lv = { ...TEST_LEVEL, theme: 13 };
    render(ctx, sheet, { ...demoState(), enemies: [] }, [lv], 0);
    const tiles = rec.names.filter((n) => n.name.startsWith("tile_"));
    expect(tiles.length).toBe(solidCount(lv));
    expect(new Set(tiles.map((t) => t.name))).toEqual(new Set(["tile_3"]));
  });

  it("falls back to level 0 for an out-of-range round", () => {
    const { rec, sheet, ctx } = harness();
    const s = demoState();
    s.round = 99;
    expect(() => render(ctx, sheet, s, [TEST_LEVEL], 0)).not.toThrow();
    expect(count(rec, (n) => n.startsWith("tile_"))).toBe(solidCount(TEST_LEVEL));
    s.round = 0;
    expect(() => render(ctx, sheet, s, [TEST_LEVEL], 0)).not.toThrow();
  });

  it("draws a trapped enemy scaled down inside its bubble", () => {
    const { rec, sheet, ctx } = harness();
    const s = demoState();
    s.enemies = [enemy({ id: 5, state: "trapped" })];
    s.bubbles = [bubble({ trapped: { type: "walker", escapeIn: 200, enemyId: 5 } })];
    render(ctx, sheet, s, [TEST_LEVEL], 0);
    const names = rec.names.map((n) => n.name);
    const bi = names.indexOf("bubble_normal");
    const ei = names.indexOf("enemy_walker");
    expect(bi).toBeGreaterThanOrEqual(0);
    expect(ei).toBeGreaterThan(bi);
    expect(names.filter((n) => n === "enemy_walker").length).toBe(1);
    const inset = rec.draws.filter((d) => d.dw < 16 && d.dw > 8);
    expect(inset.length).toBe(1);
  });

  it("selects the angry variant", () => {
    const { rec, sheet, ctx } = harness();
    const s = demoState();
    s.enemies = [enemy({ angry: false }), enemy({ id: 901, type: "flyer", angry: true })];
    render(ctx, sheet, s, [TEST_LEVEL], 0);
    const names = rec.names.map((n) => n.name);
    expect(names).toContain("enemy_walker");
    expect(names).toContain("enemy_flyer_angry");
    expect(names).not.toContain("enemy_walker_angry");
  });

  it("draws bubbles by kind, letter bubbles with their glyph frame", () => {
    const { rec, sheet, ctx } = harness();
    const s = demoState();
    s.bubbles = [bubble({ kind: "water" }), bubble({ id: 801, kind: "letter", letter: 4 })];
    render(ctx, sheet, s, [TEST_LEVEL], 0);
    expect(rec.names.some((n) => n.name === "bubble_water")).toBe(true);
    expect(rec.names).toContainEqual({ name: "bubble_letter", frame: 4 });
  });

  it("blinks the player during invulnerability", () => {
    const shown: number[] = [];
    for (const inv of [0, 4, 5, 8]) {
      const { rec, sheet, ctx } = harness();
      const s = demoState();
      s.players = [{ ...s.players[0]!, invulnTicks: inv }];
      render(ctx, sheet, s, [TEST_LEVEL], 0);
      shown.push(count(rec, (n) => n === "hero_pip"));
    }
    expect(shown[0]).toBe(1);
    expect(new Set(shown).size).toBe(2);
  });

  it("draws the death spin for dying players and nothing for gone players", () => {
    const { rec, sheet, ctx } = harness();
    const s = demoState();
    s.players = [{ ...s.players[0]!, state: "dying", stateTicks: 30 }, { ...s.players[1]!, state: "gone" }];
    render(ctx, sheet, s, [TEST_LEVEL], 0);
    const hero = rec.names.filter((n) => n.name.startsWith("hero_"));
    expect(hero.length).toBe(1);
    expect(hero[0]!.name).toBe("hero_pip");
    expect(hero[0]!.frame).toBeGreaterThanOrEqual(5);
    expect(count(rec, (n) => n === "hero_pop")).toBe(0);
  });

  it("uses the blow frame right after firing", () => {
    const { rec, sheet, ctx } = harness();
    const s = demoState();
    s.players = [{ ...s.players[0]!, fireCooldown: TUNING.fireCooldownTicks }];
    render(ctx, sheet, s, [TEST_LEVEL], 0);
    expect(rec.names).toContainEqual({ name: "hero_pip", frame: 4 });
  });

  it("HUD shows both scores and the round number", () => {
    const { rec, sheet, ctx } = harness();
    const s = demoState();
    s.round = 12;
    s.players[0]!.score = 1234;
    s.players[1]!.score = 56;
    render(ctx, sheet, s, [TEST_LEVEL], 0);
    const text = fontText(rec);
    expect(text).toContain("1UP001234");
    expect(text).toContain("2UP000056");
    expect(text).toContain("ROUND12");
    expect(count(rec, (n) => n === "icon_pip")).toBeGreaterThanOrEqual(1);
    expect(count(rec, (n) => n === "icon_pop")).toBeGreaterThanOrEqual(1);
  });

  it("HUD omits the second player when absent, and flashes HURRY", () => {
    const { rec, sheet, ctx } = harness();
    const s = demoState();
    s.players = [s.players[0]!];
    s.hurryActive = true;
    s.roundTicks = 0;
    render(ctx, sheet, s, [TEST_LEVEL], 0);
    expect(fontText(rec)).not.toContain("2UP");
    expect(fontText(rec)).toContain("HURRY!");
  });

  it("shows the local-player marker only early in the round", () => {
    const a = harness();
    const s = demoState();
    s.roundTicks = 10;
    render(a.ctx, a.sheet, s, [TEST_LEVEL], 1);
    expect(count(a.rec, (n) => n === "icon_arrow")).toBe(1);
    const b = harness();
    s.roundTicks = 600;
    render(b.ctx, b.sheet, s, [TEST_LEVEL], 1);
    expect(count(b.rec, (n) => n === "icon_arrow")).toBe(0);
  });

  it("never mutates the state", () => {
    const { sheet, ctx } = harness();
    const s = demoState();
    s.enemies = [enemy({ state: "dead", deadTicks: 10 }), enemy({ id: 902, type: "hurry" })];
    s.bubbles = [bubble({ kind: "letter", letter: 1 })];
    const before = structuredClone(s);
    render(ctx, sheet, s, [TEST_LEVEL], 0, 5);
    expect(s).toEqual(before);
  });
});
