import { describe, expect, it } from "vitest";
import { BTN, FIELD_H, FIELD_W, GAME_LEVELS, Sim, TILE, TUNING, bossMaxHp, isSolid } from "../../src";
import type { GameState } from "../../src";

const TICKS = 900;
/** Each smoke test takes ~0.3 s; the explicit budget keeps a loaded CI box from tripping the 5 s default. */
export const SMOKE_TIMEOUT = 30_000;
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
      if (e.type === "boss") {
        // The boss flies inside the field (it reflects off the walls, the field top and the floor) and never loses its hp by itself.
        expect(e.x, `round ${round} tick ${t}: boss x`).toBeGreaterThan(0);
        expect(e.x).toBeLessThan(FIELD_W);
        expect(e.y, `round ${round} tick ${t}: boss y`).toBeGreaterThan(0);
        expect(e.y).toBeLessThan(FIELD_H);
        expect(e.hp, `round ${round} tick ${t}: boss hp`).toBeGreaterThan(0);
        expect(e.hp).toBeLessThanOrEqual(e.maxHp ?? 0);
      }
      expect(e.x, `round ${round} enemy x`).toBeGreaterThanOrEqual(0);
      expect(e.x).toBeLessThanOrEqual(FIELD_W);
      expect(e.y, `round ${round} enemy y`).toBeGreaterThan(-TILE * 3);
      expect(e.y).toBeLessThan(FIELD_H + TILE * 3);
    }
    if (leftSpawnAt < 0 && s.enemies.length > 0 && s.enemies.every((e) => e.state !== "spawning")) leftSpawnAt = t;
  }
  return { sim, maxDelay, leftSpawnAt };
}

/**
 * Registers the sim smoke tests (idle players, then players walking right and firing) for rounds `from..to`.
 * About twelve rounds per file (levels-smoke-001-012.test.ts, ...) so vitest runs the files in parallel workers; round 100 (the boss round) has its own small file.
 */
export function describeSmoke(from: number, to: number): void {
  describe(`rounds ${from}-${to} run in the sim`, () => {
    it("exist in GAME_LEVELS", () => expect(GAME_LEVELS.length).toBeGreaterThanOrEqual(to));
    for (let round = from; round <= to; round++) {
      if (GAME_LEVELS[round - 1]?.enemies.some((e) => e.type === "boss")) {
        bossSmoke(round);
        continue;
      }
      it(`round ${round}: idle players`, { timeout: SMOKE_TIMEOUT }, () => {
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

      it(`round ${round}: players walking right and firing`, { timeout: SMOKE_TIMEOUT }, () => {
        const { sim } = runLevel(round, (t) => {
          const b = BTN.R | (t % 20 === 0 ? BTN.F : 0) | (t % 90 === 0 ? BTN.J : 0);
          return [b, b];
        });
        finite(sim.state, "state");
      });
    }
  });
}

/**
 * The boss round: the boss spawns at once (delay 0, so the "enemies leave spawning" rule does not apply) and flies
 * forever. Idle players, then players that walk right and fire (they may well die, which is fine): no exception, every
 * number finite, the boss inside the field with hp in 1..maxHp and maxHp exactly what the sim computes for two players.
 */
function bossSmoke(round: number): void {
  const checkBoss = (sim: Sim): void => {
    const boss = sim.state.enemies.find((e) => e.type === "boss");
    expect(boss, "the boss is still in the arena").toBeDefined();
    expect(boss!.maxHp).toBe(bossMaxHp(2, false));
    expect(boss!.hp).toBeGreaterThan(0);
    expect(boss!.hp).toBeLessThanOrEqual(boss!.maxHp!);
    finite(sim.state, "state");
  };
  it(`round ${round} (boss): idle players`, { timeout: SMOKE_TIMEOUT }, () => {
    const lv = GAME_LEVELS[round - 1]!;
    expect(Math.max(...lv.enemies.map((e) => e.delayTicks))).toBe(0);
    const { sim } = runLevel(round, () => [0, 0]);
    expect(sim.state.round).toBe(round);
    checkBoss(sim);
  });
  it(`round ${round} (boss): players idle, then walking right and firing`, { timeout: SMOKE_TIMEOUT }, () => {
    const { sim } = runLevel(round, (t) => {
      if (t < 200) return [0, 0];
      const b = BTN.R | (t % 20 === 0 ? BTN.F : 0) | (t % 90 === 0 ? BTN.J : 0);
      return [b, b];
    });
    checkBoss(sim);
  });
}

export function describeHurry(): void {
  describe("hurry-up", () => {
    it("the hurry-up fires only once hurryUpTicks have passed", { timeout: SMOKE_TIMEOUT }, () => {
      const sim = new Sim(GAME_LEVELS, 12345, { playerCount: 2, startRound: 1 });
      sim.state.roundTicks = TUNING.hurryUpTicks - 3;
      for (let i = 0; i < 2; i++) sim.step([0, 0]);
      expect(sim.state.hurryActive).toBe(false);
      for (let i = 0; i < 4; i++) sim.step([0, 0]);
      expect(sim.state.hurryActive).toBe(true);
    });
  });
}
