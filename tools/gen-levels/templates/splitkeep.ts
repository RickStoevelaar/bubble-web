import { FLOOR, MID } from "../grid";
import { defineTemplate } from "./util";

/**
 * A split keep: a divider hangs from the ceiling in the middle (`hang` rows) over a central stair mound that rises
 * from the floor in steps, and each side holds a staircase of ledges leading up the wall.
 */
export const splitkeep = defineTemplate(
  "splitkeep",
  "divider hanging from the ceiling (dividerW, hang rows) above a stepped central mound (moundW, steps of stepH rows), side ledges climbing both walls",
  { dividerW: 4, hang: 12, moundW: 12, steps: 2, stepH: 3, wingW: 6, wings: [18, 13, 8], gaps: [] },
  (p, g) => {
    const d0 = Math.round(MID - p.dividerW / 2 + 0.5);
    g.rect(d0, 1, d0 + p.dividerW - 1, p.hang);
    for (let s = 0; s < p.steps; s++) {
      const w = p.moundW - 4 * s;
      const c0 = Math.round(MID - w / 2 + 0.5);
      g.rect(c0, FLOOR - p.stepH * (s + 1), c0 + w - 1, FLOOR - 1);
    }
    p.wings.forEach((row, k) => {
      const w = p.wingW + (k % 2);
      g.ledge(2, 2 + w - 1, row);
      g.ledge(30 - w, 29, row);
    });
  },
);
