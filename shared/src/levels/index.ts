import type { LevelData } from "../level";
import { TEST_LEVEL } from "./test-level";

/** The one stable level set shared by server and client. Task 18 swaps in the real rounds. */
export const LEVELS: LevelData[] = [TEST_LEVEL];
