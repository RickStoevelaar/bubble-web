import { MID } from "../grid";
import { clampCol, defineTemplate } from "./util";

/**
 * A diamond lattice: ledges on the outline of a rhombus (wide at the middle row, a single ledge at the tips) around
 * a hollow centre, with optional corner ledges that frame it.
 */
export const diamond = defineTemplate(
  "diamond",
  "ledges on a diamond outline: cy centre row, step rows between levels, hx half width at the widest, segW ledge width, corners ledges in the field corners",
  { cy: 13, step: 5, levels: 2, hx: 11, segW: 5, tip: 7, corners: 1, cornerW: 5, gaps: [[14, 17]] },
  (p, g) => {
    for (let t = -p.levels; t <= p.levels; t++) {
      const row = p.cy + t * p.step;
      const dx = Math.round((p.hx * (p.levels - Math.abs(t))) / p.levels);
      if (dx === 0) {
        const c0 = Math.round(MID - p.tip / 2 + 0.5);
        g.ledge(c0, c0 + p.tip - 1, row);
      } else {
        for (const sgn of [-1, 1]) {
          const c = Math.round(MID + sgn * dx);
          const c0 = clampCol(Math.round(c - p.segW / 2 + 0.5));
          g.ledge(c0, c0 + p.segW - 1, row);
        }
      }
      if (p.corners > 0 && Math.abs(t) > 0 && Math.abs(t) < p.levels) {
        g.ledge(2, 2 + p.cornerW - 1, row);
        g.ledge(29 - p.cornerW + 1, 29, row);
      }
    }
  },
);
