import { GRID_H, GRID_W } from "@bubble/shared";

/** Inclusive column span `[from, to]` of a gap in the floor (and the matching gap in the ceiling). */
export type Gap = [number, number];

/** Mutable 32x28 tile canvas. Coordinates are (col, row); out-of-range writes are ignored. */
export class Grid {
  private readonly cells: boolean[][] = Array.from({ length: GRID_H }, () => Array<boolean>(GRID_W).fill(false));

  get(col: number, row: number): boolean {
    return this.cells[row]?.[col] ?? false;
  }

  set(col: number, row: number, solid = true): void {
    if (col < 0 || col >= GRID_W || row < 0 || row >= GRID_H) return;
    this.cells[row]![col] = solid;
  }

  /** Fills the rectangle cols c0..c1, rows r0..r1 (inclusive). */
  rect(c0: number, r0: number, c1: number, r1: number, solid = true): void {
    for (let r = r0; r <= r1; r++) for (let c = c0; c <= c1; c++) this.set(c, r, solid);
  }

  /** A platform: columns c0..c1 in `row`, `thick` rows thick (growing downward). */
  ledge(c0: number, c1: number, row: number, thick = 1): void {
    this.rect(Math.max(2, c0), row, Math.min(GRID_W - 3, c1), row + thick - 1);
  }

  rows(): string[] {
    return this.cells.map((r) => r.map((s) => (s ? "#" : ".")).join(""));
  }
}

/**
 * The common frame: 2-wide border walls, a ceiling in row 0 and a 2-row floor (rows 26-27). Every gap opens the
 * floor and, to keep the vertical wrap legal, the same columns of the ceiling.
 */
export function frame(gaps: readonly Gap[] = []): Grid {
  const g = new Grid();
  g.rect(0, 0, 1, GRID_H - 1);
  g.rect(GRID_W - 2, 0, GRID_W - 1, GRID_H - 1);
  g.rect(2, 0, GRID_W - 3, 0);
  g.rect(2, GRID_H - 2, GRID_W - 3, GRID_H - 1);
  for (const [a, b] of gaps) {
    g.rect(a, 0, b, 0, false);
    g.rect(a, GRID_H - 2, b, GRID_H - 1, false);
  }
  return g;
}

/** Centre of the playfield in tile columns (between col 15 and col 16). */
export const MID = 15.5;
/** Row of the floor surface (the first floor row). */
export const FLOOR = GRID_H - 2;
