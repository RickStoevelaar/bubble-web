import { FLOOR, MID } from "../grid";
import { defineTemplate } from "./util";

/**
 * Nests: wall-hugging ledges with a raised rim on the outside and a one-tile lip inside, alternating with a
 * central cradle (rimmed at both ends) on the tiers between them.
 */
export const nests = defineTemplate(
  "nests",
  "corner nests with rims on odd tiers, a central rimmed cradle on even tiers; nestW/cradleW ledge widths, rim rim height",
  { tiers: 4, spacing: 5, nestW: 8, cradleW: 10, rim: 2, lip: 1, gaps: [[14, 17]] },
  (p, g) => {
    for (let k = 0; k < p.tiers; k++) {
      const row = FLOOR - p.spacing * (k + 1);
      if (k % 2 === 0) {
        g.ledge(2, 2 + p.nestW - 1, row);
        g.ledge(29 - p.nestW + 1, 29, row);
        g.rect(2, row - p.rim, 3, row - 1);
        g.rect(28, row - p.rim, 29, row - 1);
        if (p.lip > 0) {
          g.rect(2 + p.nestW - 1, row - p.lip, 2 + p.nestW - 1, row - 1);
          g.rect(29 - p.nestW + 1, row - p.lip, 29 - p.nestW + 1, row - 1);
        }
      } else {
        const c0 = Math.round(MID - p.cradleW / 2 + 0.5);
        const c1 = c0 + p.cradleW - 1;
        g.ledge(c0, c1, row);
        // Near the ceiling a tall rim would trap whoever lands in the cradle (the head stops at the field top), so it shrinks.
        const rim = Math.min(p.rim, Math.max(1, row - 7));
        g.rect(c0, row - rim, c0 + 1, row - 1);
        g.rect(c1 - 1, row - rim, c1, row - 1);
      }
    }
  },
);
