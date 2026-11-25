import { FLOOR, MID } from "../grid";
import { defineTemplate } from "./util";

/** Full-width tiers, 5 rows apart by default, with holes (centre / sides / alternating) and optional chunky thickness. */
export const tiers = defineTemplate(
  "tiers",
  "full-width tiers with holes; inset staggers the tier ends, foot shortens the lowest tier at both walls",
  { tiers: 4, spacing: 5, inset: 0, foot: 3, hole: 0, holeMode: "alt", thick: 1, gaps: [[14, 17]] },
  (p, g) => {
    for (let k = 0; k < p.tiers; k++) {
      const row = FLOOR - p.spacing * (k + 1);
      // The lowest tier stops short of both walls so each floor half has an opening above it.
      const left = k === 0 ? 2 + p.foot : 2 + (k % 2 === 0 ? 0 : p.inset);
      const right = k === 0 ? 29 - p.foot : 29 - (k % 2 === 0 ? p.inset : 0);
      g.ledge(left, right, row, p.thick);
      if (p.hole > 0) {
        const mode = p.holeMode === "alt" ? (k % 2 === 0 ? "center" : "sides") : p.holeMode;
        const h0 = Math.floor(MID - p.hole / 2 + 1);
        if (mode === "center") g.rect(h0, row, h0 + p.hole - 1, row + p.thick - 1, false);
        if (mode === "sides") {
          const w = Math.max(2, Math.floor(p.hole / 2));
          g.rect(left, row, left + w - 1, row + p.thick - 1, false);
          g.rect(right - w + 1, row, right, row + p.thick - 1, false);
        }
      }
    }
  },
);
