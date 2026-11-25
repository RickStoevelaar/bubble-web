import { describe, expect, it } from "vitest";
import { FIELD_H, FIELD_W, GAME_LEVELS, TILE, isSolid } from "../src";
import { DOOR_ROUNDS } from "./support/batches";
import { doorReachability } from "./support/door";

// Own file so vitest runs these (reach analysis, memoised per worker) in parallel with the other level files.
describe.each(DOOR_ROUNDS)("secret door round %i", (round) => {
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

  it("has two empty tiles above the door's platform", { timeout: 60_000 }, () => {
    const d = doorReachability(GAME_LEVELS, round)!;
    const lv = GAME_LEVELS[round - 1]!;
    expect(isSolid(lv, d.tile.tx, d.tile.ty - 1)).toBe(false);
    expect(isSolid(lv, d.tile.tx, d.tile.ty - 2)).toBe(false);
  });
});
