import { describe, expect, it } from "vitest";
import { BOSS_ARENA, GRID_H, GRID_W, TEST_LEVEL, type LevelData } from "@bubble/shared";
import { computeOverlay, enemyLetter, normalizeLevelJson, parseLevelText } from "../level-viewer/overlay";

const CLOSED: string[] = Array.from({ length: GRID_H }, (_, y) =>
  Array.from({ length: GRID_W }, (_, x) => (x < 2 || x >= GRID_W - 2 || y === 0 || y >= GRID_H - 2 ? "#" : ".")).join(""),
);
const set = (rows: string[], row: number, from: number, to: number, ch: string): string[] =>
  rows.map((r, y) => (y === row ? r.slice(0, from) + ch.repeat(to - from + 1) + r.slice(to + 1) : r));
const lvl = (tiles: string[]): LevelData => ({ round: 1, theme: 2, tiles, enemies: [{ type: "walker", col: 10, row: 25, delayTicks: 0 }], drift: [] });

describe("enemyLetter", () => {
  it("maps every type to its one-letter code", () => {
    expect(enemyLetter("walker")).toBe("W");
    expect(enemyLetter("chaser")).toBe("C");
    expect(enemyLetter("thrower")).toBe("T");
    expect(enemyLetter("breather")).toBe("B");
    expect(enemyLetter("bouncer")).toBe("O");
    expect(enemyLetter("flyer")).toBe("F");
    expect(enemyLetter("boss")).toBe("X");
    expect(enemyLetter("hurry")).toBe("?");
  });
});

describe("computeOverlay", () => {
  it("TEST_LEVEL: green nodes sit on tile tops, nothing trapped or unreachable, two player spawns", () => {
    const o = computeOverlay(TEST_LEVEL);
    expect(o.nodes.length).toBe(375);
    expect(o.trapped).toEqual([]);
    expect(o.unreachableRuns).toEqual([]);
    expect(o.wrapColumns).toEqual([]);
    expect(o.spawns).toEqual([{ player: 1, col: 3, row: 25 }, { player: 2, col: 28, row: 25 }]);
    // every node rests on a solid tile somewhere under its 14 px body, with the row above that tile empty
    for (const n of o.nodes) {
      const under = [Math.floor((n.x - 7) / 8), Math.floor((n.x + 6.99) / 8)];
      expect(under.some((c) => TEST_LEVEL.tiles[n.row]![c] === "#")).toBe(true);
      expect(TEST_LEVEL.tiles[n.row - 1]![n.col]).toBe(".");
    }
    expect(o.enemies).toEqual([{ type: "walker", letter: "W", col: 10, row: 25 }]);
    expect(o.stats.standingNodes).toBe(375);
    expect(o.issues).toEqual([]);
  }, 120000);

  it("flags an unreachable platform run in red", () => {
    const o = computeOverlay(lvl(set(CLOSED, 10, 10, 14, "#")));
    expect(o.unreachableRuns).toEqual([{ row: 10, from: 10, to: 14 }]);
    expect(o.issues.some((i) => i.code === "reach-unreachable")).toBe(true);
  }, 120000);

  it("flags a wrap hazard column in orange", () => {
    const tiles = set(set(CLOSED, 26, 14, 17, "."), 27, 14, 17, ".");
    const o = computeOverlay(lvl(tiles));
    expect(o.wrapColumns).toEqual([14, 15, 16, 17]);
  }, 120000);

  it("reports trapped standing positions", () => {
    const rows: string[] = [];
    for (let y = 0; y < GRID_H; y++) {
      const r = Array.from({ length: GRID_W }, (_, x) => (y === 0 || y >= GRID_H - 2 || x < 2 || x >= GRID_W - 2 ? "#" : "."));
      if (y >= 17 && y <= 25) for (const x of [8, 9, 10, 11, 12, 13, 16, 17, 18, 19, 20, 21]) r[x] = "#";
      if (y === 22 || y === 18) for (const x of [2, 3, 4]) r[x] = "#";
      rows.push(r.join(""));
    }
    const o = computeOverlay(lvl(rows), { spawns: [{ col: 4, row: 25 }, { col: 27, row: 25 }] });
    expect(o.trapped.length).toBeGreaterThan(0);
    expect(o.trapped.length).toBeLessThan(o.nodes.length);
  }, 120000);

  it("carries drift cells and boss markers; the boss arena overlay is clean as a boss round", () => {
    const o = computeOverlay({ ...BOSS_ARENA, drift: [{ col: 5, row: 5, dx: 1, dy: -1 }] }, { kind: "boss" });
    expect(o.enemies).toEqual([{ type: "boss", letter: "X", col: 15, row: 8 }]);
    expect(o.drift).toEqual([{ col: 5, row: 5, dx: 1, dy: -1 }]);
    expect(o.issues).toEqual([]);
  }, 120000);

  it("an invalid level gives an empty overlay with a validate error, not a throw", () => {
    const o = computeOverlay({ round: 1, theme: 0, tiles: ["##"], enemies: [], drift: [] });
    expect(o.nodes).toEqual([]);
    expect(o.issues.some((i) => i.code === "validate")).toBe(true);
  });
});

describe("normalizeLevelJson", () => {
  it("prints stable key order, tiles as strings one per line, and a trailing newline", () => {
    const messy = { drift: [], enemies: [{ delayTicks: 0, row: 25, col: 10, type: "walker" }], tiles: CLOSED, theme: 2, round: 7, flags: { fireBubbles: true } };
    const text = normalizeLevelJson(messy as unknown as LevelData);
    expect(text.endsWith("}\n")).toBe(true);
    expect(Object.keys(JSON.parse(text))).toEqual(["round", "theme", "tiles", "enemies", "drift", "flags"]);
    expect(Object.keys(JSON.parse(text).enemies[0])).toEqual(["type", "col", "row", "delayTicks"]);
    expect(JSON.parse(text).tiles).toEqual(CLOSED);
    expect(text).toContain(`    "${CLOSED[0]}",`);
    // idempotent
    expect(normalizeLevelJson(JSON.parse(text))).toBe(text);
  });
  it("omits absent flags", () => {
    expect(Object.keys(JSON.parse(normalizeLevelJson(TEST_LEVEL)))).toEqual(["round", "theme", "tiles", "enemies", "drift"]);
  });
});

describe("parseLevelText", () => {
  it("parses a level", () => {
    const r = parseLevelText(JSON.stringify(TEST_LEVEL));
    expect(r.error).toBeUndefined();
    expect(r.level?.round).toBe(TEST_LEVEL.round);
  });
  it("reports a parse error instead of throwing", () => {
    const r = parseLevelText("{ nope");
    expect(r.level).toBeUndefined();
    expect(r.error).toMatch(/JSON/i);
  });
  it("rejects non-objects", () => {
    expect(parseLevelText("[1,2]").error).toBeDefined();
    expect(parseLevelText("null").error).toBeDefined();
  });
});
