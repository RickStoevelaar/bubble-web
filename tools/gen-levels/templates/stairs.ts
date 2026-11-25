import { FLOOR } from "../grid";
import { defineTemplate } from "./util";

/** A diagonal staircase of ledges; `both` builds a ziggurat that meets in the middle. */
export const stairs = defineTemplate(
  "stairs",
  "staircase of ledges climbing left-to-right (dir 1) or right-to-left (dir -1), or a double staircase",
  { steps: 5, stepW: 8, rise: 4, dir: 1, both: false, gaps: [[20, 23]] },
  (p, g) => {
    const span = p.both ? 14 : 28;
    const shift = p.steps > 1 ? Math.floor((span - p.stepW) / (p.steps - 1)) : 0;
    for (let k = 0; k < p.steps; k++) {
      const row = FLOOR - p.rise * (k + 1);
      const fromLeft = 2 + k * shift;
      const fromRight = 30 - p.stepW - k * shift;
      if (p.both) {
        g.ledge(fromLeft, fromLeft + p.stepW - 1, row);
        g.ledge(fromRight, fromRight + p.stepW - 1, row);
      } else {
        const c = p.dir >= 0 ? fromLeft : fromRight;
        g.ledge(c, c + p.stepW - 1, row);
      }
    }
  },
);
