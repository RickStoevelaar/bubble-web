import { FLOOR, MID } from "../grid";
import { defineTemplate } from "./util";

/**
 * A solid plus in the middle of the field: a vertical bar `barW` wide from row `top` to row `bottom` and a
 * horizontal arm `armW` wide (2 rows thick) at row `armRow`. Side ledges (`side` = [[c0, c1, row], ...]) give the
 * four quarters something to stand on.
 */
export const cross = defineTemplate(
  "cross",
  "solid plus-shaped centre (vertical bar barW wide from top to bottom, 2-row arm armW long at armRow) with ledges in the four quarters",
  { barW: 4, top: 7, bottom: 19, armW: 16, armRow: 12, side: [[2, 7, 21], [24, 29, 21], [2, 7, 16], [24, 29, 16], [2, 7, 9], [24, 29, 9]], gaps: [[14, 17]] },
  (p, g) => {
    const b0 = Math.round(MID - p.barW / 2 + 0.5);
    g.rect(b0, p.top, b0 + p.barW - 1, p.bottom);
    const a0 = Math.round(MID - p.armW / 2 + 0.5);
    g.rect(a0, p.armRow, a0 + p.armW - 1, p.armRow + 1);
    for (const [c0, c1, row] of p.side) if (row! < FLOOR) g.ledge(c0!, c1!, row!);
  },
);
