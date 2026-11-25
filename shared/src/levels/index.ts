import type { LevelData } from "../level";
import levelsJson from "./levels.json";
import { TEST_LEVEL } from "./test-level";

/** The one stable level set shared by server and client. Task 18 swaps in the real rounds. */
export const LEVELS: LevelData[] = [TEST_LEVEL];

/**
 * The real rounds, loaded from levels.json (written by `npm run gen-levels` from tools/gen-levels/rounds; never
 * edit the JSON by hand). Rounds 1-25 so far; later batches add more and Task 21 appends round 100 and switches
 * the server and client over from `LEVELS`.
 */
export const GAME_LEVELS: LevelData[] = levelsJson as unknown as LevelData[];
