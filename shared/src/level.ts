import { GRID_H, GRID_W, TILE } from "./constants";

export type EnemyType = "walker" | "chaser" | "thrower" | "breather" | "bouncer" | "flyer" | "boss" | "hurry";

export interface EnemySpawn {
  type: EnemyType;
  col: number;
  row: number;
  delayTicks: number;
}

/** Sparse bubble-current override: bubbles on this tile drift by (dx, dy). */
export interface DriftCell {
  col: number;
  row: number;
  dx: number;
  dy: number;
}

export interface LevelData {
  round: number;
  /** Indexes a palette and wall style in the renderer. */
  theme: number;
  /** GRID_H strings of GRID_W chars: '#' = solid, '.' = empty. */
  tiles: string[];
  enemies: EnemySpawn[];
  drift: DriftCell[];
  flags?: { waterBubbles?: boolean; fireBubbles?: boolean; lightningBubbles?: boolean };
}

/**
 * Left and right of the grid are solid; above the top and below the bottom
 * are open because the playfield wraps vertically.
 */
export function isSolid(lv: LevelData, tx: number, ty: number): boolean {
  if (tx < 0 || tx >= GRID_W) return true;
  if (ty < 0 || ty >= GRID_H) return false;
  return lv.tiles[ty]![tx] === "#";
}

export function solidAtPixel(lv: LevelData, px: number, py: number): boolean {
  return isSolid(lv, Math.floor(px / TILE), Math.floor(py / TILE));
}

/** Returns [] when the level is valid, otherwise human-readable problems. */
export function validateLevel(lv: LevelData): string[] {
  const problems: string[] = [];

  if (lv.tiles.length !== GRID_H) {
    problems.push(`expected ${GRID_H} rows, got ${lv.tiles.length}`);
  }
  lv.tiles.forEach((row, y) => {
    if (row.length !== GRID_W) {
      problems.push(`row ${y} has length ${row.length}, expected ${GRID_W}`);
    }
    if (!/^[#.]*$/.test(row)) {
      problems.push(`row ${y} contains illegal characters (only '#' and '.' allowed)`);
    }
  });

  for (const e of lv.enemies) {
    const where = `enemy ${e.type} at (${e.col}, ${e.row})`;
    if (e.type === "hurry") problems.push(`${where} is runtime-only and cannot be placed in a level`);
    if (e.col < 0 || e.col >= GRID_W || e.row < 0 || e.row >= GRID_H) {
      problems.push(`${where} is outside the grid`);
    } else if (lv.tiles[e.row]?.[e.col] === "#") {
      problems.push(`${where} is inside a solid tile`);
    }
  }

  return problems;
}
