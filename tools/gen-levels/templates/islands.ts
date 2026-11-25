import { FLOOR } from "../grid";
import { clampCol, defineTemplate } from "./util";

/** Rows of floating islands, staggered row to row, with seeded jitter. */
export const islands = defineTemplate(
  "islands",
  "staggered rows of floating islands (width, count per row and jitter are parameters)",
  { rows: 4, spacing: 5, perRow: 3, w: 5, jitter: 1, gaps: [[14, 17]] },
  (p, g, rng) => {
    const slot = 28 / p.perRow;
    for (let k = 0; k < p.rows; k++) {
      const row = FLOOR - p.spacing * (k + 1);
      const centres: number[] = [];
      if (k % 2 === 0) for (let i = 0; i < p.perRow; i++) centres.push(2 + slot * (i + 0.5));
      else for (let i = 1; i < p.perRow; i++) centres.push(2 + slot * i);
      for (const c of centres) {
        const j = p.jitter > 0 ? rng.int(2 * p.jitter + 1) - p.jitter : 0;
        const start = clampCol(Math.round(c - p.w / 2) + j);
        g.ledge(start, Math.min(29, start + p.w - 1), row);
      }
    }
  },
);
