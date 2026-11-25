import { BATCHES } from "./support/batches";
import { describeHurry, describeSmoke } from "./support/smoke";

describeSmoke(BATCHES[0]!.from, BATCHES[0]!.to);
describeHurry();
