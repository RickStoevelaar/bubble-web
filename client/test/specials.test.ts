import { describe, expect, it } from "vitest";
import { LEVELS, Sim, TEST_LEVEL, TUNING, spawnEffect, type EffectState, type GameState, type ServerMsg } from "@bubble/shared";
import { ClientGame } from "../src/game";
import { render } from "../src/render/renderer";
import { ALL_SPRITE_NAMES, hasSprite, validateTemplates } from "../src/render/sprites";
import { entityEvents, makeHarness } from "./harness";

function state(): GameState {
  const sim = new Sim([TEST_LEVEL], 1, 2);
  for (let i = 0; i < 30; i++) sim.step([0, 0]);
  const s = structuredClone(sim.state);
  s.enemies = [];
  s.bubbles = [];
  return s;
}
const eff = (kind: EffectState["kind"], over: Partial<EffectState> = {}): EffectState => ({
  ...spawnEffect(state(), kind, 0, 100, 100, 1),
  ...over,
});
function draws(s: GameState): string[] {
  const h = makeHarness();
  render(h.ctx, h.sheet, s, [TEST_LEVEL], 0);
  return entityEvents(h.main).filter((e) => e.startsWith("draw"));
}
const named = (log: string[], name: string) => log.filter((l) => l.includes(` ${name}#`));
const coords = (l: string) => l.split(" ").slice(3, 7).map(Number);

describe("effect sprites", () => {
  it("are registered, two frames each, and the templates stay valid", () => {
    expect(validateTemplates()).toEqual([]);
    for (const n of ["icon_water", "icon_bolt"]) {
      expect(ALL_SPRITE_NAMES).toContain(n);
      expect(hasSprite(n, 0)).toBe(true);
      expect(hasSprite(n, 1)).toBe(true);
      expect(hasSprite(n, 2)).toBe(false);
    }
  });
});

describe("rendering effects", () => {
  it("draws water as a row of wave tiles across its width, resting on the effect's bottom", () => {
    const s = state();
    s.effects = [eff("water", { x: 100, y: 100, reachL: 8, reachR: 8, ageTicks: 0 })];
    const w = named(draws(s), "icon_water");
    expect(w.map(coords)).toEqual([
      [92, 100, 8, 8],
      [100, 100, 8, 8],
    ]);
    expect(w[0]).toContain("icon_water#0");
  });

  it("animates water by age", () => {
    const s = state();
    s.effects = [eff("water", { x: 100, y: 100, reachL: 8, reachR: 8, ageTicks: 8 })];
    expect(named(draws(s), "icon_water")[0]).toContain("icon_water#1");
  });

  it("tiles the existing flame sprite along the burning strip", () => {
    const s = state();
    s.effects = [eff("fire", { x: 100, y: 100, reachL: 12, reachR: 20, ageTicks: 0 })];
    const f = named(draws(s), "icon_flame");
    expect(f.map((l) => coords(l)[0])).toEqual([88, 96, 104, 112]);
    expect(new Set(f.map((l) => coords(l)[1]))).toEqual(new Set([96]));
    s.effects[0]!.ageTicks = 4;
    expect(named(draws(s), "icon_flame")[0]).toContain("icon_flame#1");
  });

  it("tiles bolt segments across the bolt's length in a fixed band", () => {
    const s = state();
    s.effects = [eff("bolt", { x: 50, y: 100, reachL: 0, reachR: 40, dir: 1 })];
    const b = named(draws(s), "icon_bolt");
    expect(b.map((l) => coords(l)[0])).toEqual([50, 58, 66, 74, 82]);
    expect(new Set(b.map((l) => coords(l)[1]))).toEqual(new Set([96]));
  });

  it("draws effects after enemies and before the HUD", () => {
    const s = state();
    s.effects = [eff("water", { x: 100, y: 100, reachL: 8, reachR: 8 })];
    const log = draws(s);
    const w = log.findIndex((l) => l.includes("icon_water#"));
    const hud = log.findIndex((l) => l.includes("font_1#"));
    expect(w).toBeGreaterThanOrEqual(0);
    expect(w).toBeLessThan(hud);
  });

  it("skips unknown kinds and non-finite geometry, and tolerates a missing effects field", () => {
    const s = state();
    s.effects = [{ ...eff("water"), kind: "plasma" as never }, eff("water", { x: NaN }), eff("bolt", { reachR: Infinity })];
    expect(() => draws(s)).not.toThrow();
    const log = draws(s);
    expect(named(log, "icon_water")).toHaveLength(0);
    expect(named(log, "icon_bolt")).toHaveLength(0);
    delete (s as Partial<GameState>).effects;
    expect(() => draws(s)).not.toThrow();
  });
});

/** Canvas stand-in that resolves translate/save/restore, so each draw reports its final position and alpha. */
function glyphDraws(s: GameState): { name: string; x: number; y: number; alpha: number }[] {
  const out: { name: string; x: number; y: number; alpha: number }[] = [];
  let pending = "";
  let tx = 0;
  let ty = 0;
  const stack: [number, number, number][] = [];
  const ctx = {
    fillStyle: "",
    globalAlpha: 1,
    fillRect: () => {},
    save: () => stack.push([tx, ty, ctx.globalAlpha]),
    restore: () => {
      [tx, ty, ctx.globalAlpha] = stack.pop()!;
    },
    translate: (x: number, y: number) => {
      tx += x;
      ty += y;
    },
    scale: () => {},
    rotate: () => {},
    drawImage: (_s: unknown, _a: number, _b: number, _c: number, _d: number, dx: number, dy: number) =>
      out.push({ name: pending, x: tx + dx, y: ty + dy, alpha: ctx.globalAlpha }),
  } as unknown as CanvasRenderingContext2D;
  const sheet = {
    canvas: {},
    createLayer: () => ({ canvas: {}, ctx }),
    rectOf: (name: string) => {
      pending = name;
      return { sx: 0, sy: 0, w: name.startsWith("font_") ? 8 : 16, h: name.startsWith("font_") ? 8 : 16 };
    },
  } as never;
  render(ctx, sheet, s, [TEST_LEVEL], 0);
  return out;
}

describe("EXTEND letter row", () => {
  const rowOf = (s: GameState, minX = 0, maxX = 256) =>
    glyphDraws(s)
      .filter((d) => /^font_[EXTND]$/.test(d.name) && d.y === 16 && d.x >= minX && d.x < maxX)
      .sort((a, b) => a.x - b.x);

  it("is not drawn while a player has no letters", () => {
    expect(rowOf(state())).toEqual([]);
  });

  it("shows six glyphs under the lives row, bright when collected and dim when missing", () => {
    const s = state();
    s.players[0]!.letters = [true, false, true, false, false, true];
    const row = rowOf(s, 0, 128);
    expect(row.map((d) => d.name.slice(5)).join("")).toBe("EXTEND");
    expect(row.map((d) => d.x)).toEqual([12, 18, 24, 30, 36, 42]);
    expect(row.map((d) => d.alpha === 1)).toEqual([true, false, true, false, false, true]);
    expect(Math.max(...row.filter((d) => d.alpha !== 1).map((d) => d.alpha))).toBeLessThan(0.5);
  });

  it("draws a second player's row aligned with their score", () => {
    const s = state();
    s.players[1]!.letters = [false, false, false, false, false, true];
    const row = rowOf(s, 128);
    expect(row).toHaveLength(6);
    expect(row[0]!.x).toBe(256 - 12 - 6 * 10);
    expect(rowOf(s, 0, 128)).toEqual([]);
  });
});

describe("ClientGame effects", () => {
  type Snap = Extract<ServerMsg, { t: "snap" }>;
  const snap = (tick: number, s: GameState): Snap => ({ t: "snap", tick, ackSeq: 0, state: { ...s, tick }, events: [] });
  const make = () => {
    let now = 0;
    return { game: new ClientGame({ levels: LEVELS, playerId: 0, now: () => now }), at: (t: number) => (now = t) };
  };

  it("interpolates effects by id", () => {
    const { game, at } = make();
    const a = state();
    a.effects = [eff("water", { id: 77, x: 100, y: 100 })];
    const b = state();
    b.effects = [eff("water", { id: 77, x: 110, y: 100 }), eff("fire", { id: 78, x: 30, y: 30 })];
    at(0);
    game.onSnapshot(snap(3, a));
    at(50);
    game.onSnapshot(snap(6, b));
    const v = game.viewState(75)!;
    expect(v.effects[0]!.x).toBe(105);
    expect(v.effects[1]!.x).toBe(30);
  });

  it("tolerates snapshots without effects (older server)", () => {
    const { game, at } = make();
    const a = state();
    const b = state();
    delete (a as Partial<GameState>).effects;
    delete (b as Partial<GameState>).effects;
    at(0);
    game.onSnapshot(snap(3, a));
    at(50);
    game.onSnapshot(snap(6, b));
    expect(() => game.viewState(75)).not.toThrow();
    expect(game.viewState(75)!.effects).toBeUndefined();
  });
});
