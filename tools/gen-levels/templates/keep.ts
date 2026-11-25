import { FLOOR } from "../grid";
import { defineTemplate } from "./util";

/** A column hanging from the ceiling in the middle with wings: outer-anchored and column-anchored alternately. */
export const keep = defineTemplate(
  "keep",
  "central column hanging from the ceiling with side wings on both flanks",
  { colW: 4, colBottom: 17, tiers: 4, wingW: 8, gaps: [] },
  (p, g) => {
    const cl = 16 - Math.floor(p.colW / 2);
    const cr = cl + p.colW - 1;
    g.rect(cl, 1, cr, p.colBottom);
    for (let k = 0; k < p.tiers; k++) {
      const row = FLOOR - 5 * (k + 1);
      if (k % 2 === 0) {
        g.ledge(2, 2 + p.wingW - 1, row);
        g.ledge(30 - p.wingW, 29, row);
      } else {
        g.ledge(cl - p.wingW, cl - 1, row);
        g.ledge(cr + 1, cr + p.wingW, row);
      }
    }
  },
);
