import { describe } from "vitest";
import { BATCHES } from "../../shared/test/support/batches";
import { ROUNDS } from "../gen-levels/rounds/index";
import { describeBatchData } from "./support/batchData";

/**
 * Length independence: the round list is complete (1-100), so nothing is left to append. This still simulates a longer
 * list in memory (synthetic rounds 101-125 cloned from rounds 51-75, never written anywhere) and runs the data checks of
 * the latest batch (76-99) and the one before it (51-75) against it: they slice their own range and must never depend
 * on how many rounds follow. It guards the batch helper itself, not the committed data.
 */
const extra = ROUNDS.slice(50, 75).map((r) => ({ ...r, round: r.round + 50, theme: Math.floor((r.round + 49) / 10) }));
describe("synthetic rounds 101-125 appended in memory", () => {
  describeBatchData(BATCHES[3]!, { rounds: [...ROUNDS, ...extra], checkHash: false });
  describeBatchData(BATCHES[2]!, { rounds: [...ROUNDS, ...extra], checkHash: false });
});
