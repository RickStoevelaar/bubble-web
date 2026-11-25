import { describe, expect, it } from "vitest";
import { FIELD_H, FIELD_W, GAME_LEVELS, GRID_H, GRID_W, TILE, isSolid, lintLevel, lintRamp, playerSpawnTiles, validateLevel } from "../src";
import { doorReachability } from "./support/door";

describe("GAME_LEVELS (rounds 1-50)", () => {
  it("holds rounds 1..50 in order", () => {
    expect(GAME_LEVELS.length).toBeGreaterThanOrEqual(50);
    GAME_LEVELS.forEach((lv, i) => expect(lv.round).toBe(i + 1));
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

  // The reach analysis is slow (about 0.7 s per level), so every level is its own concurrent test.
  describe.concurrent("lintLevel (normal): zero errors and zero warnings", () => {
    for (let r = 1; r <= 50; r++) {
      it(`round ${r}`, { timeout: 120_000 }, () => {
        expect(lintLevel(GAME_LEVELS[r - 1]!, { kind: "normal" })).toEqual([]);
      });
    }
  });

  describe.each([20, 30, 40])("secret door round %i", (round) => {
    it("the door spot is a standing position reachable from the player spawn, inside the field and not inside a solid tile", { timeout: 60_000 }, () => {
      const d = doorReachability(GAME_LEVELS, round);
      expect(d).not.toBeNull();
      expect(d!.reachable).toBe(true);
      expect(d!.item.x).toBeGreaterThan(2 * TILE);
      expect(d!.item.x).toBeLessThan(FIELD_W - 2 * TILE);
      expect(d!.item.y).toBeGreaterThan(0);
      expect(d!.item.y).toBeLessThan(FIELD_H);
      expect(d!.tile.ty).toBeGreaterThanOrEqual(2);
      const lv = GAME_LEVELS[round - 1]!;
      expect(isSolid(lv, Math.floor(d!.item.x / TILE), Math.floor(d!.item.y / TILE)), "door centre tile").toBe(false);
      expect(isSolid(lv, Math.floor(d!.item.x / TILE), d!.tile.ty), "tile under the door").toBe(true);
    });
  });

  describe("fairness of rounds 26-50", () => {
    const batch = GAME_LEVELS.filter((l) => l.round >= 26 && l.round <= 50);
    const GROUND = ["walker", "chaser", "thrower", "breather"];

    it("every enemy is at least 7 tiles (Euclidean) from both player spawn points", () => {
      expect(batch).toHaveLength(25);
      for (const lv of batch) {
        for (const s of playerSpawnTiles(lv)) {
          if (!s) continue;
          for (const e of lv.enemies) expect(Math.hypot(e.col - s.col, e.row - s.row), `round ${lv.round} ${e.type} (${e.col},${e.row})`).toBeGreaterThanOrEqual(7);
        }
      }
    });

    it("never more than 3 enemies of the same ground-bound type on one platform run", () => {
      for (const lv of batch) {
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
      for (const lv of batch) {
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

    it("the door spot of rounds 30 and 40 is the floor centre or a platform with two empty tiles above it", () => {
      for (const r of [30, 40]) {
        const d = doorReachability(GAME_LEVELS, r)!;
        const lv = GAME_LEVELS[r - 1]!;
        expect(isSolid(lv, d.tile.tx, d.tile.ty - 1)).toBe(false);
        expect(isSolid(lv, d.tile.tx, d.tile.ty - 2)).toBe(false);
      }
    });
  });
});
