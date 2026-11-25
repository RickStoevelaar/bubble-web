import { FLOOR, MID } from "../grid";
import { clampCol, defineTemplate } from "./util";

/** Ledge pairs fan out from the centre and close again, outlining a diamond. */
export const lattice = defineTemplate(
  "lattice",
  "diamond: ledge pairs spread to maxD columns from the centre by the middle row and close up again",
  { rows: 5, spacing: 4, maxD: 11, w: 5, centerW: 8, gaps: [[7, 9], [22, 24]] },
  (p, g) => {
    for (let k = 0; k < p.rows; k++) {
      const row = FLOOR - p.spacing * (k + 1);
      const t = p.rows > 1 ? 1 - Math.abs((2 * k) / (p.rows - 1) - 1) : 0;
      const d = Math.round(p.maxD * t);
      if (d === 0) {
        const c0 = clampCol(Math.round(MID - p.centerW / 2 + 0.5));
        g.ledge(c0, c0 + p.centerW - 1, row);
      } else {
        const l0 = clampCol(Math.round(MID - d - p.w / 2 + 0.5));
        g.ledge(l0, l0 + p.w - 1, row);
        const r1 = Math.min(29, Math.round(MID + d + p.w / 2 - 0.5));
        g.ledge(r1 - p.w + 1, r1, row);
      }
    }
  },
);
