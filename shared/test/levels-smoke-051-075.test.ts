import { BATCHES } from "./support/batches";
import { describeSmoke } from "./support/smoke";

describeSmoke(BATCHES[2]!.from, BATCHES[2]!.to);
