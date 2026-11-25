import { BATCHES } from "./support/batches";
import { describeLevelLint } from "./support/levelLint";

describeLevelLint(BATCHES[1]!.from, BATCHES[1]!.to);
