import { describe, expect, it } from "vitest";
import { FIELD_H, FIELD_W, GAME_LEVELS, GRID_H, GRID_W, TILE, isSolid, lintLevel, lintRamp, playerSpawnTiles, validateLevel } from "../src";
import { doorReachability } from "./support/door";

describe("GAME_LEVELS (rounds 1-25 until later batches extend it)", () => {
  it("holds at least rounds 1..25 in order", () => {
    expect(GAME_LEVELS.length).toBeGreaterThanOrEqual(25);
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
    for (let r = 1; r <= 25; r++) {
      it(`round ${r}`, { timeout: 120_000 }, () => {
        expect(lintLevel(GAME_LEVELS[r - 1]!, { kind: "normal" })).toEqual([]);
      });
    }
  });

  describe("secret door round 20", () => {
    it("the door spot is a standing position reachable from the player spawn, inside the field", { timeout: 60_000 }, () => {
      const d = doorReachability(GAME_LEVELS, 20);
      expect(d).not.toBeNull();
      expect(d!.reachable).toBe(true);
      expect(d!.item.x).toBeGreaterThan(2 * TILE);
      expect(d!.item.x).toBeLessThan(FIELD_W - 2 * TILE);
      expect(d!.item.y).toBeGreaterThan(0);
      expect(d!.item.y).toBeLessThan(FIELD_H);
      expect(d!.tile.ty).toBeGreaterThanOrEqual(2);
    });
  });
});
