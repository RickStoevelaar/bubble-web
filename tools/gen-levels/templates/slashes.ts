import { clampCol, defineTemplate } from "./util";

/**
 * Diagonal slashes: staircases of short ledges that climb to the right or the left. `lines` lists
 * `[startCol, startRow, dir, steps]`; every step is `w` wide, `rise` rows higher and `hop` columns clear of the last.
 */
export const slashes = defineTemplate(
  "slashes",
  "diagonal staircases of short ledges: lines [startCol, startRow, dir, steps], w step width, rise rows per step, hop gap between steps",
  { lines: [[3, 22, 1, 5], [26, 18, -1, 4]] as number[][], w: 4, rise: 3, hop: 2, gaps: [[14, 17]] },
  (p, g) => {
    for (const [c, r, dir, n] of p.lines) {
      for (let s = 0; s < n!; s++) {
        const c0 = dir! > 0 ? c! + s * (p.w + p.hop) : c! - s * (p.w + p.hop) - p.w + 1;
        g.ledge(clampCol(c0), clampCol(c0 + p.w - 1), r! - s * p.rise);
      }
    }
  },
);
