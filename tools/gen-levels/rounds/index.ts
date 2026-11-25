import type { RoundDef } from "../types";
import { ROUNDS_001_025 } from "./rounds-001-025";
import { ROUNDS_026_050 } from "./rounds-026-050";

/**
 * Every round in order. Later batches add a file (rounds-026-050.ts, ...) and append it here; the generator
 * and the sync test pick the new rounds up automatically.
 */
export const ROUNDS: RoundDef[] = [...ROUNDS_001_025, ...ROUNDS_026_050];
