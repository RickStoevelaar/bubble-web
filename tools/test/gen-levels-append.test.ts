import { describe } from "vitest";
import { BATCHES } from "../../shared/test/support/batches";
import { ROUNDS } from "../gen-levels/rounds/index";
import { describeBatchData } from "./support/batchData";

/**
 * Simulates the next task appending rounds 76-100 (in memory only, as clones of rounds 51-75): the data checks of the
 * latest batch (51-75) must still pass when ROUNDS and the level list are longer than the batch, i.e. they never
 * depend on the total length.
 */
const extra = ROUNDS.slice(50, 75).map((r) => ({ ...r, round: r.round + 25, theme: Math.floor((r.round + 24) / 10) }));
describe("simulated append of rounds 76-100", () => {
  describeBatchData(BATCHES[2]!, { rounds: [...ROUNDS, ...extra], checkHash: false });
});
