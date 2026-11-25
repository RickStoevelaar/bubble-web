import { describe, expect, it } from "vitest";
import { BATCHES } from "../../shared/test/support/batches";
import { generateLevels } from "../gen-levels/generate";
import { ROUNDS } from "../gen-levels/rounds/index";

describe("all rounds", () => {
  it("are contiguous from 1 and cover every registered batch (the batches tile 1..N without gaps or overlap)", () => {
    expect(ROUNDS.length).toBeGreaterThanOrEqual(BATCHES[BATCHES.length - 1]!.to);
    ROUNDS.forEach((r, i) => expect(r.round).toBe(i + 1));
    BATCHES.forEach((b, i) => expect(b.from).toBe(i === 0 ? 1 : BATCHES[i - 1]!.to + 1));
  });

  it("have no duplicate tile grids, and no round repeats an earlier template with the same parameters", () => {
    const levels = generateLevels();
    expect(new Set(levels.map((l) => l.tiles.join("\n"))).size).toBe(levels.length);
    const keys = new Set<string>();
    for (const r of ROUNDS) {
      if (r.template === "hand") continue;
      const k = JSON.stringify([r.template, r.params, r.seed ?? null]);
      expect(keys.has(k), `round ${r.round} repeats ${r.template} with identical params`).toBe(false);
      keys.add(k);
    }
  });
});
