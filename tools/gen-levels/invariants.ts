import { GRID_H, GRID_W } from "@bubble/shared";

/**
 * Throws a descriptive error unless `rows` is a 32x28 grid of '#' and '.', has solid 2-wide border columns (0-1 and
 * 30-31) on every row, and respects the wrap rule (every column open in the bottom row is open in the top row).
 * Generators must fail loudly rather than patch a broken layout.
 */
export function assertGrid(rows: readonly string[], label: string): void {
  const fail = (msg: string): never => {
    throw new Error(`${label}: ${msg}`);
  };
  if (rows.length !== GRID_H) fail(`grid must be ${GRID_W}x${GRID_H}, got ${rows.length} rows`);
  rows.forEach((r, y) => {
    if (r.length !== GRID_W) fail(`grid must be ${GRID_W}x${GRID_H}, row ${y} has ${r.length} columns`);
    if (!/^[#.]+$/.test(r)) fail(`row ${y} may contain only '#' and '.'`);
    for (const c of [0, 1, GRID_W - 2, GRID_W - 1]) {
      if (r[c] !== "#") fail(`border column ${c} is open at row ${y} (the 2-wide border walls must be solid on every row)`);
    }
  });
  for (let c = 0; c < GRID_W; c++) {
    if (rows[GRID_H - 1]![c] === "." && rows[0]![c] === "#") fail(`wrap rule broken: column ${c} is open in the bottom row but closed in the top row`);
  }
}
