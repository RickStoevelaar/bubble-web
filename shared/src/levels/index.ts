import type { LevelData } from "../level";
import levelsJson from "./levels.json";
import { TEST_LEVEL } from "./test-level";

/**
 * TEST FIXTURE: a single small level (TEST_LEVEL) that many unit tests build sims on. Production code (server and
 * client) uses `GAME_LEVELS`, never this; a source-scan test in server/test/levels-guard.test.ts enforces that.
 */
export const LEVELS: LevelData[] = [TEST_LEVEL];

/**
 * The real 100 rounds, loaded from levels.json (written by `npm run gen-levels` from tools/gen-levels/rounds; never
 * edit the JSON by hand): rounds 1-99 generated, round 100 the boss arena. The server and client both play this set.
 */
export const GAME_LEVELS: LevelData[] = levelsJson as unknown as LevelData[];
