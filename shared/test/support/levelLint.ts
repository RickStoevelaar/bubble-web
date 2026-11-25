import { describe, expect, it } from "vitest";
import { GAME_LEVELS, lintLevel } from "../../src";
import { memoised } from "./memo";

/**
 * Registers one test per round `from..to` asserting zero lint errors AND zero warnings. The reach analysis is
 * synchronous and CPU-bound (about 0.7 s per level), so `describe.concurrent` would gain nothing: parallelism
 * comes from vitest running separate test FILES in separate workers, which is why each batch has its own
 * one-line file (levels-lint-001-025.test.ts, ...).
 */
export function describeLevelLint(from: number, to: number): void {
  describe(`lintLevel (normal), rounds ${from}-${to}: zero errors and zero warnings`, () => {
    for (let r = from; r <= to; r++) {
      it(`round ${r}`, { timeout: 120_000 }, () => {
        const level = GAME_LEVELS[r - 1]!;
        expect(memoised(level, "lint", () => lintLevel(level, { kind: "normal" }))).toEqual([]);
      });
    }
  });
}
