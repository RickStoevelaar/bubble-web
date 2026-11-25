import { describe, expect, it } from "vitest";
import { BOSS_ARENA, GAME_LEVELS, GRID_H, GRID_W, isSolid, lintRamp, playerSpawnTiles, validateLevel } from "../src";
import { BATCHES } from "./support/batches";

// The slow per-level work lives in per-batch files so vitest runs them in parallel workers:
// levels-lint-*.test.ts (lint) and levels-smoke-*.test.ts (sim), about twelve rounds per file, plus levels-doors.test.ts (secret doors).

describe("GAME_LEVELS", () => {
  it("holds every registered batch, contiguous from round 1, and exactly 100 levels (round 100 is the boss arena)", () => {
    expect(GAME_LEVELS.length).toBeGreaterThanOrEqual(BATCHES[BATCHES.length - 1]!.to);
    expect(GAME_LEVELS).toHaveLength(100);
    GAME_LEVELS.forEach((lv, i) => expect(lv.round).toBe(i + 1));
    expect(GAME_LEVELS[99]).toEqual(BOSS_ARENA);
    expect(GAME_LEVELS.filter((lv) => lv.enemies.some((e) => e.type === "boss")).map((lv) => lv.round)).toEqual([100]);
  });

  it("validateLevel is clean and every grid is 32x28", () => {
    for (const lv of GAME_LEVELS) {
      expect(validateLevel(lv), `round ${lv.round}`).toEqual([]);
      expect(lv.tiles).toHaveLength(GRID_H);
      for (const r of lv.tiles) expect(r).toHaveLength(GRID_W);
    }
  });

  it("lintRamp reports nothing", () => {
    expect(lintRamp(GAME_LEVELS)).toEqual([]);
  });

  it("no enemy spawns within 6 tiles of either player spawn point", () => {
    for (const lv of GAME_LEVELS) {
      for (const s of playerSpawnTiles(lv)) {
        if (!s) continue;
        for (const e of lv.enemies) {
          expect(Math.hypot(e.col - s.col, e.row - s.row), `round ${lv.round} ${e.type} at (${e.col},${e.row}) vs spawn (${s.col},${s.row})`).toBeGreaterThan(6);
        }
      }
    }
  });

  it("ground-bound enemies spawn on or just above a platform; every enemy spawns in empty space", () => {
    for (const lv of GAME_LEVELS) {
      for (const e of lv.enemies) {
        expect(isSolid(lv, e.col, e.row)).toBe(false);
        if (["walker", "chaser", "thrower", "breather"].includes(e.type)) expect(isSolid(lv, e.col, e.row + 1), `round ${lv.round} ${e.type}`).toBe(true);
      }
    }
  });
});

describe.each(BATCHES.filter((b) => b.fairness))("fairness of $name", (batch) => {
  const levels = GAME_LEVELS.filter((l) => l.round >= batch.from && l.round <= batch.to);
  const GROUND = ["walker", "chaser", "thrower", "breather"];

  it("covers every round of the batch", () => {
    expect(levels).toHaveLength(batch.to - batch.from + 1);
  });

  it("every enemy is at least 7 tiles (Euclidean) from both player spawn points", () => {
    for (const lv of levels) {
      for (const s of playerSpawnTiles(lv)) {
        if (!s) continue;
        for (const e of lv.enemies) expect(Math.hypot(e.col - s.col, e.row - s.row), `round ${lv.round} ${e.type} (${e.col},${e.row})`).toBeGreaterThanOrEqual(7);
      }
    }
  });

  it("never more than 3 enemies of the same ground-bound type on one platform run", () => {
    for (const lv of levels) {
      const count = new Map<string, number>();
      for (const e of lv.enemies) {
        if (!GROUND.includes(e.type)) continue;
        const y = e.row + 1;
        let a = e.col;
        let b = e.col;
        while (isSolid(lv, a - 1, y) && !isSolid(lv, a - 1, y - 1)) a--;
        while (isSolid(lv, b + 1, y) && !isSolid(lv, b + 1, y - 1)) b++;
        const key = `${e.type}@${y}:${a}-${b}`;
        count.set(key, (count.get(key) ?? 0) + 1);
      }
      for (const [key, n] of count) expect(n, `round ${lv.round} ${key}`).toBeLessThanOrEqual(3);
    }
  });

  it("throwers and breathers keep a lane: at least 3 open tiles to one side on their row", () => {
    for (const lv of levels) {
      for (const e of lv.enemies.filter((x) => x.type === "thrower" || x.type === "breather")) {
        const lane = (dir: number): number => {
          let n = 0;
          while (n < 8 && !isSolid(lv, e.col + dir * (n + 1), e.row)) n++;
          return n;
        };
        expect(Math.max(lane(-1), lane(1)), `round ${lv.round} ${e.type} (${e.col},${e.row})`).toBeGreaterThanOrEqual(3);
      }
    }
  });
});
