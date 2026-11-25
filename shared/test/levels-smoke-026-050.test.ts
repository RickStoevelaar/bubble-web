import { BATCHES } from "./support/batches";
import { describeSmoke } from "./support/smoke";

describeSmoke(BATCHES[1]!.from, BATCHES[1]!.to);
