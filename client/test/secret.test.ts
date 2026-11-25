import { describe, expect, it } from "vitest";
import { BTN, LEVELS, SECRET_ROOMS, Sim, TILE, type GameState, type ItemState, type ServerMsg } from "@bubble/shared";
import { ClientGame } from "../src/game";
import { render } from "../src/render/renderer";
import { ALL_SPRITE_NAMES, validateTemplates } from "../src/render/sprites";
import { makeHarness } from "./harness";

const base = (): GameState => {
  const sim = new Sim(LEVELS, 1, 2);
  for (let i = 0; i < 30; i++) sim.step([0, 0]);
  return structuredClone(sim.state);
};
const secretState = (index: 0 | 1 | 2 = 1, ticksLeft = 123): GameState => ({
  ...base(),
  enemies: [],
  secret: { index, returnRound: 20, ticksLeft, leaveTicks: 0 },
});
const door = (o: Partial<ItemState> = {}): ItemState => ({
  id: 800, x: 100, y: 200, vx: 0, vy: 0, onGround: true, kind: "door", sprite: 0, value: 0, despawnTicks: 600, ...o,
});

const solidCount = (tiles: string[]) => tiles.join("").split("#").length - 1;
const tileDraws = (layer: string[], theme: number) => layer.filter((e) => e.includes(` tile_${theme}#0 `)).length;
/** [glyph, drawn size] of every font draw on the main canvas, in order. */
const fontDraws = (main: string[]) =>
  main
    .filter((e) => e.includes(" font_"))
    .map((e) => {
      const p = e.split(" ");
      return { ch: p[2]!.slice(5, -2), size: Number(p[5]) };
    });
const text = (main: string[], size: number) => fontDraws(main).filter((f) => f.size === size).map((f) => f.ch).join("");

describe("renderer in a secret room", () => {
  it("uses the secret level's tiles and a different cache entry than the normal level", () => {
    const h = makeHarness();
    const room = SECRET_ROOMS[1];
    render(h.ctx, h.sheet, secretState(1), LEVELS, 0);
    expect(tileDraws(h.layer, room.level.theme)).toBe(solidCount(room.level.tiles));
    const afterSecret = h.layer.length;
    render(h.ctx, h.sheet, secretState(1), LEVELS, 0);
    expect(h.layer.length).toBe(afterSecret); // cached by level identity
    const normal = { ...secretState(1), secret: null };
    render(h.ctx, h.sheet, normal, LEVELS, 0);
    expect(h.layer.length).toBeGreaterThan(afterSecret);
    expect(tileDraws(h.layer.slice(afterSecret), LEVELS[0]!.theme)).toBe(solidCount(LEVELS[0]!.tiles));
    render(h.ctx, h.sheet, secretState(1), LEVELS, 0);
    expect(tileDraws(h.layer.slice(afterSecret), room.level.theme)).toBe(solidCount(room.level.tiles));
  });

  it("draws SECRET, the seconds left and the 3x fragment only in a secret state", () => {
    const h = makeHarness();
    render(h.ctx, h.sheet, secretState(2, 123), LEVELS, 0);
    expect(text(h.main, 8)).toContain("SECRET3");
    expect(text(h.main, 24)).toBe(SECRET_ROOMS[2].fragment);
    const n = makeHarness();
    render(n.ctx, n.sheet, { ...base(), secret: null }, LEVELS, 0);
    expect(text(n.main, 8)).not.toContain("SECRET");
    expect(text(n.main, 24)).toBe("");
    const old = makeHarness();
    const s = { ...base() } as Partial<GameState>;
    delete s.secret;
    expect(() => render(old.ctx, old.sheet, s as GameState, LEVELS, 0)).not.toThrow();
    expect(text(old.main, 24)).toBe("");
  });

  it("rounds the remaining time up to whole seconds", () => {
    const h = makeHarness();
    render(h.ctx, h.sheet, secretState(0, 60), LEVELS, 0);
    expect(text(h.main, 8)).toContain("SECRET1");
    const g = makeHarness();
    render(g.ctx, g.sheet, secretState(0, 61), LEVELS, 0);
    expect(text(g.main, 8)).toContain("SECRET2");
  });
});

describe("door sprite", () => {
  it("is a valid registered 16x16 template", () => {
    expect(ALL_SPRITE_NAMES).toContain("item_door");
    expect(validateTemplates()).toEqual([]);
  });

  it("is drawn for kind door; unknown kinds are still skipped", () => {
    const h = makeHarness();
    const s = { ...base(), items: [door(), door({ id: 801, kind: "mystery" as never, x: 50 })] };
    expect(() => render(h.ctx, h.sheet, s, LEVELS, 0)).not.toThrow();
    expect(h.main.filter((e) => e.includes(" item_door#0 "))).toHaveLength(1);
    expect(h.main.some((e) => e.includes(" item_door#0 92 192 "))).toBe(true);
  });
});

describe("prediction in a secret room", () => {
  it("steps the local player against the secret layout, not the round's level", () => {
    let now = 0;
    const game = new ClientGame({ levels: LEVELS, playerId: 0, now: () => now });
    const st = secretState(0);
    const standY = 26 * TILE - 7;
    // x = 124 is over the gap in the normal level's floor (cols 14-17) but solid floor in the secret room.
    st.players[0]!.x = 124;
    st.players[0]!.y = standY;
    st.players[0]!.vy = 0;
    st.players[0]!.onGround = true;
    const msg: Extract<ServerMsg, { t: "snap" }> = { t: "snap", tick: 5, ackSeq: 0, state: { ...st, tick: 5 }, events: [] };
    game.onSnapshot(msg);
    for (let i = 1; i <= 30; i++) game.pushInput(i, 0);
    now = 100;
    const v = game.viewState(1000)!;
    expect(v.players[0]!.y).toBe(standY);
    void BTN;
  });
});
