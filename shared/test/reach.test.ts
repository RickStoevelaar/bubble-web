import { describe, expect, it } from "vitest";
import {
  BOSS_ARENA,
  GRID_H,
  GRID_W,
  MARGIN_JUMP,
  PLAYER_SIZE,
  SECRET_ROOMS,
  TEST_LEVEL,
  TILE,
  TUNING,
  analyseStands,
  jumpApex,
  playerSpawnTiles,
  startsOfTiles,
  validateLevel,
  type LevelData,
} from "../src";

const roomStarts = (room: (typeof SECRET_ROOMS)[number]) => startsOfTiles(room.spawn);

describe("reach analyzer (moved from the secrets test)", () => {
  it("MARGIN_JUMP is the real jump weakened by 0.15, and really at least 4 px lower", () => {
    expect(MARGIN_JUMP).toBe(TUNING.jumpVel + 0.15);
    expect(jumpApex(TUNING.jumpVel) - jumpApex(MARGIN_JUMP)).toBeGreaterThanOrEqual(4);
  });

  it("startsOfTiles puts the body centre on the tile with its feet on the floor below", () => {
    expect(startsOfTiles([{ col: 3, row: 25 }])).toEqual([{ x: 3 * TILE + TILE / 2, y: 25 * TILE + 1 }]);
  });

  it("room PIP has exactly 374 standing nodes, none trapped, largest rise 40", () => {
    const g = analyseStands(SECRET_ROOMS[0].level, roomStarts(SECRET_ROOMS[0]), MARGIN_JUMP);
    expect(g.nodes.size).toBe(374);
    expect(g.component.size).toBe(374);
    expect(g.trapped).toEqual([]);
    expect(g.maxRise).toBe(40);
    expect(g.maxRise).toBeLessThanOrEqual(jumpApex(TUNING.jumpVel) - 4);
  }, 120000);

  it("rooms POP and WEB are strongly connected", () => {
    for (const i of [1, 2] as const) {
      const g = analyseStands(SECRET_ROOMS[i].level, roomStarts(SECRET_ROOMS[i]), MARGIN_JUMP);
      expect(g.trapped).toEqual([]);
      expect(g.nodes.size).toBeGreaterThan(200);
    }
  }, 120000);

  it("a wrap fall that lands on a platform does not count as a rise (TEST_LEVEL)", () => {
    const g = analyseStands(TEST_LEVEL, startsOfTiles(playerSpawnTiles(TEST_LEVEL).map((s) => s!)), MARGIN_JUMP);
    expect(g.trapped).toEqual([]);
    expect(g.maxRise).toBeLessThanOrEqual(jumpApex(TUNING.jumpVel) - 4);
  }, 120000);

  it("reaches a letter top but not a platform floating far above everything", () => {
    const room = SECRET_ROOMS[0];
    const tiles = room.level.tiles.map((r, y) => (y === 6 ? r.slice(0, 14) + "####" + r.slice(18) : r));
    const g = analyseStands({ ...room.level, tiles }, roomStarts(room), MARGIN_JUMP);
    const ys = [...g.nodes.values()].map((p) => p.y);
    expect(ys).toContain(17 * TILE - PLAYER_SIZE / 2);
    expect(ys).not.toContain(6 * TILE - PLAYER_SIZE / 2);
  }, 120000);

  it("reports a deep well as a trap (reachable but impossible to leave)", () => {
    const rows: string[] = [];
    for (let y = 0; y < GRID_H; y++) {
      const r = Array.from({ length: GRID_W }, (_, x) => (y === 0 || y >= GRID_H - 2 || x < 2 || x >= GRID_W - 2 ? "#" : "."));
      if (y >= 17 && y <= 25) for (const x of [8, 9, 10, 11, 12, 13, 16, 17, 18, 19, 20, 21]) r[x] = "#";
      if (y === 22 || y === 18) for (const x of [2, 3, 4]) r[x] = "#";
      rows.push(r.join(""));
    }
    const lv: LevelData = { ...SECRET_ROOMS[0].level, tiles: rows };
    expect(validateLevel(lv)).toEqual([]);
    const g = analyseStands(lv, roomStarts(SECRET_ROOMS[0]), MARGIN_JUMP);
    expect(g.trapped.length).toBeGreaterThan(0);
  }, 120000);

  it("regression: the first PIP layout (open channels down to the floor) fails the strong-connectivity check", () => {
    const OLD_PIP = [
      "################################",
      ...Array.from({ length: 16 }, () => "##............................##"),
      "##...#####...######..#####....##",
      "####.#####...######..#####..####",
      "##...##..##....##....##..##...##",
      "##...##..##....##....##..##...##",
      "##...#####.....##....#####....##",
      "####.#####.....##....#####..####",
      "##...##........##....##.......##",
      "##...##......######..##.......##",
      "##...##......######..##.......##",
      "################################",
      "################################",
    ];
    const lv: LevelData = { ...SECRET_ROOMS[0].level, tiles: OLD_PIP };
    expect(validateLevel(lv)).toEqual([]);
    const g = analyseStands(lv, startsOfTiles([{ col: 3, row: 25 }, { col: 28, row: 25 }]), MARGIN_JUMP);
    expect(g.trapped.length).toBeGreaterThan(0);
  }, 120000);
});

describe("analyseStands options", () => {
  const starts = () => startsOfTiles(playerSpawnTiles(TEST_LEVEL).map((s) => s!));
  it("reports per-spawn reach and is not limited by default", () => {
    const g = analyseStands(TEST_LEVEL, starts(), MARGIN_JUMP);
    expect(g.limited).toBe(false);
    expect(g.startKeys).toHaveLength(2);
    expect(g.reachFrom).toHaveLength(2);
    expect(g.reachFrom[0]!.has(g.startKeys[1]!)).toBe(true);
    expect(g.reachFrom[1]!.has(g.startKeys[0]!)).toBe(true);
  }, 120000);
  it("maxNodes stops exploring and flags the partial graph", () => {
    const g = analyseStands(TEST_LEVEL, starts(), MARGIN_JUMP, { maxNodes: 100 });
    expect(g.limited).toBe(true);
    expect(g.nodes.size).toBeLessThanOrEqual(100);
  }, 120000);
});

describe("playerSpawnTiles", () => {
  it("gives P1 column 3 and P2 column 28 standing on the lowest floor", () => {
    expect(playerSpawnTiles(TEST_LEVEL)).toEqual([{ col: 3, row: 25 }, { col: 28, row: 25 }]);
    expect(playerSpawnTiles(BOSS_ARENA)).toEqual([{ col: 3, row: 25 }, { col: 28, row: 25 }]);
  });

  it("returns null for a column with no floor", () => {
    const tiles = TEST_LEVEL.tiles.map((r) => r.slice(0, 3) + "." + r.slice(4));
    const lv: LevelData = { ...TEST_LEVEL, tiles };
    expect(playerSpawnTiles(lv)[0]).toBeNull();
  });
});
