import { describe, expect, it } from "vitest";
import { Sim, TEST_LEVEL } from "../src";

describe("Sim.restore defaults", () => {
  it("fills enemiesSeen, phaseTicks and runOver for older saves", () => {
    const sim = new Sim([TEST_LEVEL], 7, 1);
    const old: Record<string, unknown> = JSON.parse(JSON.stringify(sim.state));
    delete old.enemiesSeen;
    delete old.phaseTicks;
    delete old.runOver;
    const restored = Sim.restore([TEST_LEVEL], old as never);
    expect(restored.state.enemiesSeen).toBe(false);
    expect(restored.state.phaseTicks).toBe(0);
    expect(restored.state.runOver).toBe(false);
    expect(() => restored.step([0, 0])).not.toThrow();
  });
});
