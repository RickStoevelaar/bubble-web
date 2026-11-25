import { BOSS_ARENA } from "@bubble/shared";
import type { RoundDef } from "../types";

/**
 * Round 100: the final boss arena. Nothing here is generated; the generator copies `BOSS_ARENA` from the shared
 * package (see `buildLevel`), so the committed level can never drift from the arena the sim and lint know.
 */
export const BOSS_ROUND: RoundDef = { round: BOSS_ARENA.round, theme: BOSS_ARENA.theme, template: "boss", params: {}, enemies: [], boss: true };
