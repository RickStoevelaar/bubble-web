import { describe, expect, it } from "vitest";
import { GAME_LEVELS, lintLevel } from "../../src";
import { memoised } from "./memo";

/** Explicit per-test budget: a level's reach analysis takes about 0.7 s alone, several times that on a loaded box. */
export const LINT_TIMEOUT = 120_000;

/**
 * Registers one test per round `from..to` asserting zero lint errors AND zero warnings. The reach analysis is
 * synchronous and CPU-bound (about 0.7 s per level), so `describe.concurrent` would gain nothing: parallelism
 * comes from vitest running separate test FILES in separate workers, which is why the rounds are split into files of
 * about twelve (levels-lint-001-012.test.ts, ...). A level holding a boss spawn (round 100) is linted as kind
 * "boss", every other as "normal" (the same rule the check-levels CLI applies).
 */
export function describeLevelLint(from: number, to: number): void {
  describe(`lintLevel, rounds ${from}-${to}: zero errors and zero warnings`, () => {
    for (let r = from; r <= to; r++) {
      it(`round ${r}`, { timeout: LINT_TIMEOUT }, () => {
        const level = GAME_LEVELS[r - 1]!;
        const kind = level.enemies.some((e) => e.type === "boss") ? "boss" : "normal";
        expect(memoised(level, "lint", () => lintLevel(level, { kind }))).toEqual([]);
      });
    }
  });
}
