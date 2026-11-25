import { describe } from "vitest";
import { BATCHES } from "../../shared/test/support/batches";
import { ROUNDS } from "../gen-levels/rounds/index";
import { describeBatchData } from "./support/batchData";

/**
 * Simulates Task 20 appending rounds 51-75 (in memory only): the batch 26-50 data checks must still pass when
 * ROUNDS and the level list are longer than the batch, i.e. they never depend on the total length.
 */
const extra = ROUNDS.slice(25, 50).map((r) => ({ ...r, round: r.round + 25, theme: Math.floor((r.round + 24) / 10) }));
describe("simulated append of rounds 51-75", () => {
  describeBatchData(BATCHES[1]!, { rounds: [...ROUNDS, ...extra], checkHash: false });
});
