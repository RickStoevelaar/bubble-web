import { readFileSync } from "node:fs";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";
import { describe, expect, it } from "vitest";
import { GAME_LEVELS, Sim, levelForState, type GameState } from "@bubble/shared";
import { ClientGame } from "../src/game";
import { render } from "../src/render/renderer";
import { makeHarness } from "./harness";

const here = dirname(fileURLToPath(import.meta.url));

const stateAt = (round: number): GameState => {
  const sim = new Sim(GAME_LEVELS, 1, 2);
  for (let i = 0; i < 30; i++) sim.step([0, 0]);
  return { ...structuredClone(sim.state), round };
};

describe("client on the real 100-round set", () => {
  it("levelForState falls back to round 1 for an out-of-range or fractional-free round", () => {
    expect(GAME_LEVELS).toHaveLength(100);
    expect(levelForState(GAME_LEVELS, { round: 101, secret: null })).toBe(GAME_LEVELS[0]);
    expect(levelForState(GAME_LEVELS, { round: 0, secret: null })).toBe(GAME_LEVELS[0]);
    expect(levelForState(GAME_LEVELS, { round: -5, secret: null })).toBe(GAME_LEVELS[0]);
    expect(levelForState(GAME_LEVELS, { round: 57, secret: null })).toBe(GAME_LEVELS[56]);
    expect(levelForState(GAME_LEVELS, { round: 100, secret: null })).toBe(GAME_LEVELS[99]);
  });

  it("renders and applies a snapshot whose round is out of range without throwing", () => {
    for (const round of [0, -1, 101, 5000]) {
      const h = makeHarness();
      const s = stateAt(round);
      const game = new ClientGame({ levels: GAME_LEVELS, playerId: 0, now: () => 0 });
      game.onSnapshot({ t: "snap", tick: s.tick, ackSeq: 0, state: s, events: [] });
      const view = game.viewState(0);
      expect(view).toBeTruthy();
      expect(() => render(h.ctx, h.sheet, view!, GAME_LEVELS, 0)).not.toThrow();
    }
  });

  it("renders every round of the real set without throwing (round 1, 57 and 100 spot check)", () => {
    for (const round of [1, 57, 100]) {
      const h = makeHarness();
      expect(() => render(h.ctx, h.sheet, stateAt(round), GAME_LEVELS, 0)).not.toThrow();
    }
  });

  it("main.ts renders and plays from GAME_LEVELS with one stable array", () => {
    const src = readFileSync(join(here, "../src/main.ts"), "utf8");
    expect((src.match(/GAME_LEVELS/g) ?? []).length).toBeGreaterThanOrEqual(3);
  });
});
