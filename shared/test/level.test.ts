import { describe, expect, test } from "vitest";
import { GRID_H, GRID_W, TILE } from "../src/constants";
import { isSolid, solidAtPixel, validateLevel, type LevelData } from "../src/level";
import { TEST_LEVEL } from "../src/levels/test-level";

const emptyRows = (): string[] => Array.from({ length: GRID_H }, () => ".".repeat(GRID_W));

function levelWith(tiles: string[], enemies: LevelData["enemies"] = []): LevelData {
  return { round: 1, theme: 0, tiles, enemies, drift: [] };
}

describe("isSolid", () => {
  test("true on '#' and false on '.'", () => {
    const tiles = emptyRows();
    tiles[5] = "#" + ".".repeat(GRID_W - 1);
    const lv = levelWith(tiles);
    expect(isSolid(lv, 0, 5)).toBe(true);
    expect(isSolid(lv, 1, 5)).toBe(false);
  });

  test("left and right of the grid are solid", () => {
    const lv = levelWith(emptyRows());
    expect(isSolid(lv, -1, 3)).toBe(true);
    expect(isSolid(lv, GRID_W, 3)).toBe(true);
  });

  test("above the top and below the bottom are open (vertical wrap)", () => {
    const lv = levelWith(emptyRows());
    expect(isSolid(lv, 4, -1)).toBe(false);
    expect(isSolid(lv, 4, GRID_H)).toBe(false);
  });
});

describe("solidAtPixel", () => {
  test("maps pixels to tiles via floor division by TILE", () => {
    const tiles = emptyRows();
    tiles[2] = ".#" + ".".repeat(GRID_W - 2);
    const lv = levelWith(tiles);
    expect(solidAtPixel(lv, TILE + 3, 2 * TILE + 7)).toBe(true);
    expect(solidAtPixel(lv, 3, 2 * TILE + 7)).toBe(false);
  });

  test("negative x is left of the grid and therefore solid", () => {
    expect(solidAtPixel(levelWith(emptyRows()), -1, 0)).toBe(true);
  });
});

describe("validateLevel", () => {
  test("TEST_LEVEL is valid", () => {
    expect(validateLevel(TEST_LEVEL)).toEqual([]);
  });

  test("TEST_LEVEL has the expected shape", () => {
    expect(TEST_LEVEL.round).toBe(1);
    expect(TEST_LEVEL.theme).toBe(0);
    expect(TEST_LEVEL.drift).toEqual([]);
    expect(TEST_LEVEL.flags).toBeUndefined();
    expect(TEST_LEVEL.enemies).toHaveLength(1);
    expect(TEST_LEVEL.enemies[0]!.type).toBe("walker");
  });

  test("flags a row of the wrong length", () => {
    const tiles = emptyRows();
    tiles[10] = ".".repeat(GRID_W - 1);
    const problems = validateLevel(levelWith(tiles));
    expect(problems.length).toBeGreaterThan(0);
    expect(problems.join("\n")).toMatch(/row 10/);
  });

  test("flags a wrong row count", () => {
    const tiles = emptyRows().slice(0, GRID_H - 1);
    expect(validateLevel(levelWith(tiles)).length).toBeGreaterThan(0);
  });

  test("flags illegal characters", () => {
    const tiles = emptyRows();
    tiles[3] = "x" + ".".repeat(GRID_W - 1);
    expect(validateLevel(levelWith(tiles)).length).toBeGreaterThan(0);
  });

  test("flags an enemy spawn inside a wall", () => {
    const tiles = emptyRows();
    tiles[7] = "#" + ".".repeat(GRID_W - 1);
    const problems = validateLevel(
      levelWith(tiles, [{ type: "walker", col: 0, row: 7, delayTicks: 0 }]),
    );
    expect(problems.length).toBeGreaterThan(0);
  });

  test("flags an enemy spawn outside the grid", () => {
    const problems = validateLevel(
      levelWith(emptyRows(), [{ type: "walker", col: GRID_W, row: 0, delayTicks: 0 }]),
    );
    expect(problems.length).toBeGreaterThan(0);
  });
});
