import { FLOOR } from "../grid";
import { defineTemplate } from "./util";

/** Switchback ledges anchored alternately to the left and right wall, leaving an opening on the far side. */
export const zigzag = defineTemplate(
  "zigzag",
  "long ledges alternately attached to the left and right wall (switchbacks)",
  { count: 5, spacing: 4, ledgeW: 21, startSide: 0, foot: 3, gaps: [[14, 17]] },
  (p, g) => {
    for (let k = 0; k < p.count; k++) {
      const row = FLOOR - p.spacing * (k + 1);
      const inset = k === 0 ? p.foot : 0; // the lowest ledge leaves its wall side open too
      if ((k + p.startSide) % 2 === 0) g.ledge(2 + inset, 2 + inset + p.ledgeW - 1, row);
      else g.ledge(30 - inset - p.ledgeW, 29 - inset, row);
    }
  },
);
