import { describe, expect, it } from "vitest";
import { BOSS_ARENA, lintLevel, lintRamp } from "@bubble/shared";
import { BATCHES } from "../../shared/test/support/batches";
import { buildLevel, generateLevels, serializeLevels } from "../gen-levels/generate";
import { ROUNDS } from "../gen-levels/rounds/index";

describe("all rounds", () => {
  it("are contiguous from 1 to 100 and cover every registered batch (the batches tile 1..99 without gaps or overlap, round 100 is the boss)", () => {
    expect(ROUNDS).toHaveLength(100);
    ROUNDS.forEach((r, i) => expect(r.round).toBe(i + 1));
    BATCHES.forEach((b, i) => expect(b.from).toBe(i === 0 ? 1 : BATCHES[i - 1]!.to + 1));
    expect(BATCHES[BATCHES.length - 1]!.to).toBe(99);
    expect(ROUNDS.filter((r) => r.boss).map((r) => r.round)).toEqual([100]);
  });

  it("have no duplicate tile grids, and no round repeats an earlier template with the same parameters", () => {
    const levels = generateLevels();
    expect(levels).toHaveLength(100);
    expect(new Set(levels.map((l) => l.tiles.join(String.fromCharCode(10)))).size).toBe(levels.length);
    const keys = new Set<string>();
    for (const r of ROUNDS) {
      if (r.template === "hand") continue;
      const k = JSON.stringify([r.template, r.params, r.seed ?? null]);
      expect(keys.has(k), `round ${r.round} repeats ${r.template} with identical params`).toBe(false);
      keys.add(k);
    }
  });
});

describe("round 100 (the boss arena)", () => {
  const levels = generateLevels();

  it("is the shared BOSS_ARENA, normalised like every other level (same key order and JSON format)", () => {
    expect(levels[99]).toEqual(BOSS_ARENA);
    expect(JSON.stringify(levels[99])).toBe(JSON.stringify(BOSS_ARENA));
    expect(levels[99]!.round).toBe(100);
    expect(levels[99]!.enemies.map((e) => e.type)).toEqual(["boss"]);
    const arr = JSON.parse(serializeLevels(levels)) as unknown[];
    expect(arr).toHaveLength(100);
    expect(arr[99]).toEqual(JSON.parse(JSON.stringify(BOSS_ARENA)));
    expect(Object.keys(arr[99] as object)).toEqual(["round", "theme", "tiles", "enemies", "drift"]);
  });

  it("is a copy: changing the generated level never touches BOSS_ARENA", () => {
    const a = buildLevel(ROUNDS[99]!);
    a.tiles[5] = "#".repeat(32);
    a.enemies[0]!.col = 3;
    expect(buildLevel(ROUNDS[99]!)).toEqual(BOSS_ARENA);
    expect(BOSS_ARENA.tiles[5]).not.toBe("#".repeat(32));
    expect(BOSS_ARENA.enemies[0]!.col).toBe(15);
  });

  it("lints clean as kind boss (zero errors and zero warnings), and the whole 100-level set passes the ramp checks", () => {
    expect(lintLevel(levels[99]!, { kind: "boss" })).toEqual([]);
    expect(lintRamp(levels).filter((i) => i.severity === "error")).toEqual([]);
    expect(lintRamp(levels)).toEqual([]);
  });
});
