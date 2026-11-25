import type { RoundDef } from "../types";
import { BOSS_ROUND } from "./boss";
import { ROUNDS_001_025 } from "./rounds-001-025";
import { ROUNDS_026_050 } from "./rounds-026-050";
import { ROUNDS_051_075 } from "./rounds-051-075";
import { ROUNDS_076_099 } from "./rounds-076-099";

/**
 * Every round in order. A later batch adds a file and appends it here; the generator and the sync test pick the new
 * rounds up automatically. Round 100 is the boss arena (a `boss: true` entry, copied from BOSS_ARENA).
 */
export const ROUNDS: RoundDef[] = [...ROUNDS_001_025, ...ROUNDS_026_050, ...ROUNDS_051_075, ...ROUNDS_076_099, BOSS_ROUND];
