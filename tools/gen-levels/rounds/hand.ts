import { GRID_H } from "@bubble/shared";
import { frame } from "../grid";
import type { Gap } from "../grid";

/**
 * Hand-drawn art without the border arithmetic. `rows` maps a row number (1..25) to the 28 interior characters
 * (columns 2..29, '#' solid, '.' open); rows not listed are empty. The frame (2-wide walls, ceiling, floor with
 * `gaps`) is added around it. Several rows may share one drawing via `repeat`.
 */
export function handArt(gaps: readonly Gap[], rows: Record<number, string>, repeat: Record<number, number> = {}): string[] {
  const g = frame(gaps);
  const put = (row: number, art: string): void => {
    if (art.length !== 28 || !/^[#.]+$/.test(art)) throw new Error(`hand art row ${row} must be 28 chars of # and ., got ${art.length}: ${art}`);
    if (row < 1 || row >= GRID_H - 2) throw new Error(`hand art row ${row} is outside 1..25`);
    for (let i = 0; i < 28; i++) g.set(2 + i, row, art[i] === "#");
  };
  for (const [row, art] of Object.entries(rows)) {
    put(Number(row), art);
    for (let k = 1; k < (repeat[Number(row)] ?? 1); k++) put(Number(row) + k, art);
  }
  return g.rows();
}
