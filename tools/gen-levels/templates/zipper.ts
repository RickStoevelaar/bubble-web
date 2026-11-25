import { FLOOR } from "../grid";
import { defineTemplate } from "./util";

/**
 * Two columns of short ledges that interlock like a zipper: the left column's ledges sit `pitch` rows above the
 * right column's neighbours, so the climb alternates sides in small hops. `open` columns stay free between the two
 * columns, `inner` is how far each column reaches toward the middle, `w` is the ledge width.
 */
export const zipper = defineTemplate(
  "zipper",
  "offset ledges of two interlocking columns (zipper): n rungs per column, pitch rows between neighbouring rungs, w ledge width, edge inset from the walls, startSide 0 = left rung lowest",
  { n: 4, pitch: 3, w: 8, edge: 3, base: 4, startSide: 0, gaps: [[14, 17]] },
  (p, g) => {
    for (let k = 0; k < p.n; k++) {
      for (const side of [0, 1]) {
        const row = FLOOR - p.base - 2 * p.pitch * k - (side === p.startSide ? 0 : p.pitch);
        if (row < 3) continue;
        const c0 = side === 0 ? 2 + p.edge : 30 - p.edge - p.w;
        g.ledge(c0, c0 + p.w - 1, row);
      }
    }
  },
);
