import type { RoundDef } from "../types";
import { ROUNDS_001_025 } from "./rounds-001-025";
import { ROUNDS_026_050 } from "./rounds-026-050";
import { ROUNDS_051_075 } from "./rounds-051-075";

/**
 * Every round in order. Later batches add a file (rounds-051-075.ts, ...) and append it here; the generator
 * and the sync test pick the new rounds up automatically.
 */
export const ROUNDS: RoundDef[] = [...ROUNDS_001_025, ...ROUNDS_026_050, ...ROUNDS_051_075];
