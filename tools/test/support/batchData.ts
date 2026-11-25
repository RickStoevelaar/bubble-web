import { createHash } from "node:crypto";
import { readFileSync } from "node:fs";
import { describe, expect, it } from "vitest";
import type { LevelData } from "@bubble/shared";
import type { Batch } from "../../../shared/test/support/batches";
import { generateJson, generateLevels } from "../../gen-levels/generate";
import { ROUNDS } from "../../gen-levels/rounds/index";
import { TEMPLATES } from "../../gen-levels/templates/index";
import type { RoundDef } from "../../gen-levels/types";

const LEVELS_JSON = new URL("../../../shared/src/levels/levels.json", import.meta.url);
const TYPES = ["walker", "chaser", "thrower", "breather", "bouncer", "flyer"] as const;
const TOUGH = new Set(["thrower", "breather", "bouncer", "flyer"]);
const FLAGS = ["waterBubbles", "fireBubbles", "lightningBubbles"] as const;
const avg = (a: number[]): number => a.reduce((s, v) => s + v, 0) / a.length;
const flagCount = (lv: LevelData): number => Object.values(lv.flags ?? {}).filter(Boolean).length;
const sha = (levels: unknown[]): string => createHash("sha256").update(JSON.stringify(levels)).digest("hex");

export interface BatchSource {
  /** Every round definition (default: ROUNDS). May be longer than the batch: only `[from, to]` is looked at. */
  rounds?: readonly RoundDef[];
  /** Compare the committed levels.json slice and a fresh run with the pinned hash (default true). */
  checkHash?: boolean;
}

/**
 * Registers the data checks of one batch of rounds, driven by its registry entry (shared/test/support/batches.ts).
 * Every check slices `[from - 1, to)` and asserts `to - from + 1` rounds, so appending later batches never breaks it.
 */
export function describeBatchData(batch: Batch, src: BatchSource = {}): void {
  const all = src.rounds ?? ROUNDS;
  const n = batch.to - batch.from + 1;
  const defs = all.slice(batch.from - 1, batch.to);
  const levels = generateLevels(defs);

  describe(`round data (${batch.name})`, () => {
    it("is contiguous inside a contiguous round list and has the right themes", () => {
      expect(all.length).toBeGreaterThanOrEqual(batch.to);
      all.forEach((r, i) => expect(r.round).toBe(i + 1));
      expect(defs).toHaveLength(n);
      defs.forEach((r, i) => {
        expect(r.round).toBe(batch.from + i);
        expect(r.theme).toBe(Math.floor((r.round - 1) / 10));
      });
    });

    if (src.checkHash !== false) {
      it("is frozen: the committed file and a fresh run both hash to the pinned value", () => {
        const committed = JSON.parse(readFileSync(LEVELS_JSON, "utf8")) as unknown[];
        expect(committed.length).toBeGreaterThanOrEqual(batch.to);
        expect(sha(committed.slice(batch.from - 1, batch.to))).toBe(batch.sha256);
        const fresh = JSON.parse(generateJson(ROUNDS.slice(0, batch.to))) as unknown[];
        expect(sha(fresh.slice(batch.from - 1, batch.to))).toBe(batch.sha256);
      });
    }

    it("names a known template or is hand-drawn", () => {
      for (const r of defs) {
        if (r.tiles) expect(r.template).toBe("hand");
        else expect(Object.keys(TEMPLATES), `round ${r.round}`).toContain(r.template);
      }
    });

    it("enemy counts stay inside the batch limits and ramp up", () => {
      const c = batch.enemyCount;
      const counts = levels.map((l) => l.enemies.length);
      expect(Math.min(...counts)).toBeGreaterThanOrEqual(c.min);
      expect(Math.max(...counts)).toBeLessThanOrEqual(c.max);
      const start = avg(counts.slice(0, 5));
      const mid = avg(counts.slice(10, 15));
      const end = avg(counts.slice(n - 5));
      expect(start).toBeGreaterThanOrEqual(c.startAvg[0]);
      expect(start).toBeLessThanOrEqual(c.startAvg[1]);
      expect(end).toBeGreaterThanOrEqual(c.endAvg[0]);
      expect(end).toBeLessThanOrEqual(c.endAvg[1]);
      expect(start).toBeLessThan(mid);
      expect(mid).toBeLessThan(end);
      for (const r of batch.milestones?.rounds ?? []) {
        expect(counts[r - batch.from], `milestone ${r}`).toBeGreaterThanOrEqual(batch.milestones!.count[0]);
        expect(counts[r - batch.from], `milestone ${r}`).toBeLessThanOrEqual(batch.milestones!.count[1]);
      }
    });

    if (batch.typesPerRound !== undefined) {
      it("every round mixes types and every type appears in enough rounds", () => {
        for (const lv of levels) expect(new Set(lv.enemies.map((e) => e.type)).size, `round ${lv.round}`).toBeGreaterThanOrEqual(batch.typesPerRound!);
        for (const t of TYPES) expect(levels.filter((l) => l.enemies.some((e) => e.type === t)).length, t).toBeGreaterThanOrEqual(batch.typeRounds!);
      });
    }

    if (batch.toughShift) {
      it("shifts toward the tougher types", () => {
        const { early, late, lateMin } = batch.toughShift!;
        const share = (ls: LevelData[]): number => ls.reduce((s, l) => s + l.enemies.filter((e) => TOUGH.has(e.type)).length, 0) / ls.reduce((s, l) => s + l.enemies.length, 0);
        expect(share(levels.slice(0, early))).toBeLessThan(share(levels.slice(n - late)));
        expect(share(levels.slice(n - late))).toBeGreaterThanOrEqual(lateMin);
      });
    }

    if (batch.waves !== undefined) {
      it("enough rounds spawn in two or three waves (2-3 distinct delays, each wave with several enemies)", () => {
        const waves = levels.filter((l) => {
          const by = new Map<number, number>();
          for (const e of l.enemies) by.set(e.delayTicks, (by.get(e.delayTicks) ?? 0) + 1);
          return by.size >= 2 && by.size <= 3 && [...by.values()].every((k) => k >= 2);
        });
        expect(waves.length).toBeGreaterThanOrEqual(batch.waves!);
      });
    }

    if (batch.flags) {
      const f = batch.flags;
      it("follows the flag schedule, including the two-flag rule", () => {
        expect(levels.filter((l) => l.flags === undefined).length).toBeGreaterThanOrEqual(f.noFlag);
        for (const k of FLAGS) {
          const count = levels.filter((l) => l.flags?.[k]).length;
          expect(count, k).toBeGreaterThanOrEqual(f.perFlag[0]);
          expect(count, k).toBeLessThanOrEqual(f.perFlag[1]);
        }
        for (const lv of levels.filter((l) => l.round < f.singleBefore)) expect(flagCount(lv), `round ${lv.round}`).toBeLessThanOrEqual(1);
        expect(levels.filter((l) => l.round >= f.twoFlagFrom && flagCount(l) === 2).length).toBeGreaterThanOrEqual(f.twoFlagMin);
        for (const lv of levels) expect(flagCount(lv), `round ${lv.round}`).toBeLessThanOrEqual(2);
      });
    }

    it("uses gentle drift currents in enough rounds", () => {
      expect(levels.filter((l) => l.drift.length >= batch.drift.cells).length).toBeGreaterThanOrEqual(batch.drift.rounds);
      for (const lv of levels) for (const d of lv.drift) expect(Math.abs(d.dx) <= 1 && Math.abs(d.dy) <= 1).toBe(true);
    });

    it("never repeats a template back to back (also against the round before the batch), mixes templates and hand-drawn rounds", () => {
      const run = all.slice(Math.max(0, batch.from - 2), batch.to);
      for (let i = 1; i < run.length; i++) expect(run[i]!.template, `round ${run[i]!.round}`).not.toBe(run[i - 1]!.template);
      expect(new Set(defs.map((r) => r.template)).size).toBeGreaterThanOrEqual(batch.distinctTemplates);
      expect(defs.filter((r) => r.template === "hand").length).toBeGreaterThanOrEqual(batch.handMin);
      for (const r of batch.handRounds) expect(all[r - 1]!.template).toBe("hand");
    });

    it("uses enough of the batch's own template families (explicit names)", () => {
      for (const t of batch.freshTemplates) expect(Object.keys(TEMPLATES), t).toContain(t);
      const used = new Set(defs.map((r) => r.template));
      expect(batch.freshTemplates.filter((t) => used.has(t)).length).toBeGreaterThanOrEqual(batch.freshUsed);
    });
  });
}
