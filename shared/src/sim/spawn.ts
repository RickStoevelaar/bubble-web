import { GRID_H } from "../constants";
import { isSolid } from "../level";
import type { LevelData } from "../level";

/** Column player 1 (id 0) starts and respawns in. */
export const P1_SPAWN_COL = 3;
/** Column player 2 (id 1) starts and respawns in. */
export const P2_SPAWN_COL = 28;

/**
 * Row of the lowest floor tile in `col`: a solid tile with an empty tile above it. Returns GRID_H when the column
 * has none (a body placed there would hang below the field).
 */
export function spawnFloorRow(lv: LevelData, col: number): number {
  for (let ty = GRID_H - 1; ty >= 0; ty--) {
    if (isSolid(lv, col, ty) && !isSolid(lv, col, ty - 1)) return ty;
  }
  return GRID_H;
}

/**
 * The tiles the two players stand in when a round loads or they respawn: the empty tile above the lowest floor
 * of the spawn column (what `Sim` uses), or null when that column has no floor. Index 0 is player 1.
 */
export function playerSpawnTiles(lv: LevelData): [{ col: number; row: number } | null, { col: number; row: number } | null] {
  const at = (col: number): { col: number; row: number } | null => {
    const floor = spawnFloorRow(lv, col);
    return floor >= GRID_H ? null : { col, row: floor - 1 };
  };
  return [at(P1_SPAWN_COL), at(P2_SPAWN_COL)];
}
