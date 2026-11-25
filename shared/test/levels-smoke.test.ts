import { describe, expect, it } from "vitest";
import { BTN, FIELD_H, FIELD_W, GAME_LEVELS, Sim, TILE, TUNING, isSolid } from "../src";
import type { GameState } from "../src";

const TICKS = 900;
const FLIERS = new Set(["flyer", "bouncer"]);

function finite(v: unknown, path: string): void {
  if (typeof v === "number") expect(Number.isFinite(v), path).toBe(true);
  else if (Array.isArray(v)) v.forEach((x, i) => finite(x, `${path}[${i}]`));
  else if (v && typeof v === "object") for (const [k, x] of Object.entries(v)) finite(x, `${path}.${k}`);
}

function runLevel(round: number, input: (t: number) => [number, number]): { sim: Sim; maxDelay: number; leftSpawnAt: number } {
  const lv = GAME_LEVELS[round - 1]!;
  const sim = new Sim(GAME_LEVELS, 12345, { playerCount: 2, startRound: round });
  const maxDelay = Math.max(...lv.enemies.map((e) => e.delayTicks));
  let leftSpawnAt = -1;
  for (let t = 0; t < TICKS; t++) {
    sim.step(input(t));
    const s: GameState = sim.state;
    if (s.round !== round) break; // a cleared round moved on: stop checking this level
    expect(s.hurryActive, `round ${round} tick ${t}: hurry before hurryUpTicks`).toBe(false);
    for (const e of s.enemies) {
      expect(e.x, `round ${round} enemy x`).toBeGreaterThanOrEqual(0);
      expect(e.x).toBeLessThanOrEqual(FIELD_W);
      expect(e.y, `round ${round} enemy y`).toBeGreaterThan(-TILE * 3);
      expect(e.y).toBeLessThan(FIELD_H + TILE * 3);
    }
    if (leftSpawnAt < 0 && s.enemies.length > 0 && s.enemies.every((e) => e.state !== "spawning")) leftSpawnAt = t;
  }
  return { sim, maxDelay, leftSpawnAt };
}

describe("every level runs in the sim", () => {
  expect(GAME_LEVELS.length).toBeGreaterThanOrEqual(25);
  for (let round = 1; round <= 25; round++) {
    it(`round ${round}: idle players`, () => {
      const lv = GAME_LEVELS[round - 1]!;
      const { sim, maxDelay, leftSpawnAt } = runLevel(round, () => [0, 0]);
      expect(sim.state.round).toBe(round);
      expect(sim.state.enemies.length).toBeGreaterThan(0);
      expect(leftSpawnAt, "enemies leave the spawning state").toBeGreaterThanOrEqual(0);
      expect(leftSpawnAt).toBeLessThanOrEqual(maxDelay + 120);
      finite(sim.state, "state");
      for (const e of sim.state.enemies) {
        if (e.state === "dead" || FLIERS.has(e.type)) continue;
        expect(isSolid(lv, Math.floor(e.x / TILE), Math.floor(e.y / TILE)), `${e.type} inside a solid tile at (${e.x}, ${e.y})`).toBe(false);
      }
    });

    it(`round ${round}: players walking right and firing`, () => {
      const { sim } = runLevel(round, (t) => {
        const b = BTN.R | (t % 20 === 0 ? BTN.F : 0) | (t % 90 === 0 ? BTN.J : 0);
        return [b, b];
      });
      finite(sim.state, "state");
    });
  }

  it("the hurry-up fires only once hurryUpTicks have passed", () => {
    const sim = new Sim(GAME_LEVELS, 12345, { playerCount: 2, startRound: 1 });
    sim.state.roundTicks = TUNING.hurryUpTicks - 3;
    for (let i = 0; i < 2; i++) sim.step([0, 0]);
    expect(sim.state.hurryActive).toBe(false);
    for (let i = 0; i < 4; i++) sim.step([0, 0]);
    expect(sim.state.hurryActive).toBe(true);
  });
});
