import { mkdtempSync, rmSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { GAME_LEVELS, TEST_LEVEL, type LevelData } from "@bubble/shared";
import { describe, expect, it } from "vitest";
import { createServer, loadLevels, validateLevelSet } from "../src/index";
import { PIN } from "./helpers";

const bad = (round: number): LevelData => ({ ...TEST_LEVEL, round, tiles: TEST_LEVEL.tiles.slice(1) });
const good = (round: number): LevelData => ({ ...TEST_LEVEL, round });

describe("level set validation at startup", () => {
  it("loadLevels is the real 100-round set and validates", () => {
    expect(loadLevels()).toBe(GAME_LEVELS);
    expect(loadLevels()).toHaveLength(100);
    expect(() => validateLevelSet(GAME_LEVELS)).not.toThrow();
  });

  it("rejects an empty set", () => {
    expect(() => validateLevelSet([])).toThrow(/at least one level/);
  });

  it("names the round of a bad level", () => {
    expect(() => validateLevelSet([good(1), good(2), bad(3)])).toThrow(/round 3\b/);
  });

  it("createServer fails fast on a bad override and accepts a small fixture", async () => {
    const dir = mkdtempSync(join(tmpdir(), "bubble-lv-"));
    try {
      await expect(createServer({ pin: PIN, port: 0, dataDir: dir, levels: [good(1), bad(2)] })).rejects.toThrow(/round 2\b/);
      await expect(createServer({ pin: PIN, port: 0, dataDir: dir, levels: [] })).rejects.toThrow(/at least one level/);
      const ok = await createServer({ pin: PIN, port: 0, dataDir: dir, levels: [TEST_LEVEL] });
      await ok.close();
    } finally {
      rmSync(dir, { recursive: true, force: true });
    }
  });
});
