import { BATCHES } from "./support/batches";
import { describeLevelLint } from "./support/levelLint";

describeLevelLint(BATCHES[2]!.from, BATCHES[2]!.to);
