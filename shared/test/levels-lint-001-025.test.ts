import { BATCHES } from "./support/batches";
import { describeLevelLint } from "./support/levelLint";

describeLevelLint(BATCHES[0]!.from, BATCHES[0]!.to);
