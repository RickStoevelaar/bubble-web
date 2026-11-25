import { createHash } from "node:crypto";
import { readFileSync } from "node:fs";
import { describe, expect, it } from "vitest";
import { generateJson, generateLevels } from "../gen-levels/generate";
import { ROUNDS } from "../gen-levels/rounds/index";
import { TEMPLATES } from "../gen-levels/templates/index";

const LEVELS_JSON = new URL("../../shared/src/levels/levels.json", import.meta.url);
/** sha256 of JSON.stringify(levels.slice(0, 25)) of the levels.json committed by Task 18: rounds 1-25 must never change. */
const ROUNDS_1_25_SHA256 = "07978ca81d4970c973421171325bb8ece11dc356a793e9e340cc9a12454e4d69";
const sha = (levels: unknown[]): string => createHash("sha256").update(JSON.stringify(levels.slice(0, 25))).digest("hex");

describe("rounds 1-25 are frozen", () => {
  it("the committed file's first 25 levels hash to the Task 18 value, and so does a fresh run", () => {
    const committed = JSON.parse(readFileSync(LEVELS_JSON, "utf8")) as unknown[];
    expect(committed.length).toBe(50);
    expect(sha(committed)).toBe(ROUNDS_1_25_SHA256);
    expect(sha(JSON.parse(generateJson()) as unknown[])).toBe(ROUNDS_1_25_SHA256);
  });
});

describe("round data (batch 2: rounds 26-50)", () => {
  const defs = ROUNDS.slice(25);
  const levels = generateLevels().slice(25);
  const TYPES = ["walker", "chaser", "thrower", "breather", "bouncer", "flyer"] as const;
  const TOUGH = new Set(["thrower", "breather", "bouncer", "flyer"]);
  const FLAGS = ["waterBubbles", "fireBubbles", "lightningBubbles"] as const;
  const avg = (a: number[]): number => a.reduce((s, v) => s + v, 0) / a.length;
  const flagCount = (lv: (typeof levels)[number]): number => Object.values(lv.flags ?? {}).filter(Boolean).length;

  it("has 25 contiguous rounds 26..50 and themes floor((round - 1) / 10)", () => {
    expect(defs).toHaveLength(25);
    defs.forEach((r, i) => {
      expect(r.round).toBe(26 + i);
      expect(r.theme).toBe(Math.floor((r.round - 1) / 10));
    });
    expect([defs[0]!.theme, defs[5]!.theme, defs[15]!.theme]).toEqual([2, 3, 4]);
  });

  it("enemy counts stay within 7..12, ramp from about 8 to about 11, and milestones carry 10-11", () => {
    const counts = levels.map((l) => l.enemies.length);
    expect(Math.min(...counts)).toBeGreaterThanOrEqual(7);
    expect(Math.max(...counts)).toBeLessThanOrEqual(12);
    expect(avg(counts.slice(0, 5))).toBeGreaterThanOrEqual(7.5);
    expect(avg(counts.slice(0, 5))).toBeLessThanOrEqual(9);
    expect(avg(counts.slice(20))).toBeGreaterThanOrEqual(10);
    expect(avg(counts.slice(20))).toBeLessThanOrEqual(11.5);
    expect(avg(counts.slice(0, 5))).toBeLessThan(avg(counts.slice(10, 15)));
    expect(avg(counts.slice(10, 15))).toBeLessThan(avg(counts.slice(20)));
    for (const r of [30, 40, 50]) {
      expect(counts[r - 26]).toBeGreaterThanOrEqual(10);
      expect(counts[r - 26]).toBeLessThanOrEqual(11);
    }
  });

  it("every round mixes types (never a single-type round) and every type appears in at least 8 rounds", () => {
    for (const lv of levels) expect(new Set(lv.enemies.map((e) => e.type)).size, `round ${lv.round}`).toBeGreaterThanOrEqual(3);
    for (const t of TYPES) expect(levels.filter((l) => l.enemies.some((e) => e.type === t)).length, t).toBeGreaterThanOrEqual(8);
  });

  it("shifts toward the tougher types while walkers and chasers become filler", () => {
    const share = (ls: typeof levels): number => ls.reduce((s, l) => s + l.enemies.filter((e) => TOUGH.has(e.type)).length, 0) / ls.reduce((s, l) => s + l.enemies.length, 0);
    expect(share(levels.slice(0, 8))).toBeLessThan(share(levels.slice(17)));
    expect(share(levels.slice(17))).toBeGreaterThanOrEqual(0.55);
  });

  it("at least 8 rounds spawn in two or three waves (2-3 distinct delay values, each with several enemies)", () => {
    const waves = levels.filter((l) => {
      const by = new Map<number, number>();
      for (const e of l.enemies) by.set(e.delayTicks, (by.get(e.delayTicks) ?? 0) + 1);
      return by.size >= 2 && by.size <= 3 && [...by.values()].every((n) => n >= 2);
    });
    expect(waves.length).toBeGreaterThanOrEqual(8);
  });

  it("follows the flag schedule: >= 8 flag-free rounds, every flag 3..7 times, two flags in at least every third round from 31", () => {
    expect(levels.filter((l) => l.flags === undefined).length).toBeGreaterThanOrEqual(8);
    for (const k of FLAGS) {
      const n = levels.filter((l) => l.flags?.[k]).length;
      expect(n, k).toBeGreaterThanOrEqual(3);
      expect(n, k).toBeLessThanOrEqual(7);
    }
    for (const lv of levels.filter((l) => l.round < 31)) expect(flagCount(lv), `round ${lv.round}`).toBeLessThanOrEqual(1);
    expect(levels.filter((l) => l.round >= 31 && flagCount(l) === 2).length).toBeGreaterThanOrEqual(6);
    for (const lv of levels) expect(flagCount(lv), `round ${lv.round}`).toBeLessThanOrEqual(2);
  });

  it("at least 4 rounds use drift currents in a meaningful pattern (at least 8 cells, gentle)", () => {
    expect(levels.filter((l) => l.drift.length >= 8).length).toBeGreaterThanOrEqual(4);
    for (const lv of levels) for (const d of lv.drift) expect(Math.abs(d.dx) <= 1 && Math.abs(d.dy) <= 1).toBe(true);
  });

  it("no two consecutive rounds share a template (round 25 included); at least 12 distinct templates; at least 4 hand-drawn incl. 30, 40, 50", () => {
    for (let i = 25; i < ROUNDS.length; i++) expect(ROUNDS[i]!.template, `round ${i + 1}`).not.toBe(ROUNDS[i - 1]!.template);
    expect(new Set(defs.map((r) => r.template)).size).toBeGreaterThanOrEqual(12);
    expect(defs.filter((r) => r.template === "hand").length).toBeGreaterThanOrEqual(4);
    for (const r of [30, 40, 50]) expect(ROUNDS[r - 1]!.template).toBe("hand");
  });

  it("uses at least 6 of the new template families", () => {
    const old = new Set(Object.keys(TEMPLATES).slice(0, 16));
    const fresh = new Set(defs.map((r) => r.template).filter((t) => t !== "hand" && !old.has(t)));
    expect(fresh.size).toBeGreaterThanOrEqual(6);
  });

  it("no duplicate tile grids in 1-50, and no round repeats an earlier template with the same parameters", () => {
    expect(new Set(generateLevels().map((l) => l.tiles.join("\n"))).size).toBe(50);
    const keys = new Set<string>();
    for (const r of ROUNDS) {
      if (r.template === "hand") continue;
      const k = JSON.stringify([r.template, r.params, r.seed ?? null]);
      expect(keys.has(k), `round ${r.round} repeats ${r.template} with identical params`).toBe(false);
      keys.add(k);
    }
  });
});
