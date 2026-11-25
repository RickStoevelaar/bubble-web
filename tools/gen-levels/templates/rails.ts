import { FLOOR } from "../grid";
import { defineTemplate } from "./util";

/**
 * Rail and sleepers: long rails between the walls, each leaving an exit at one end (alternating) and hung with
 * short sleepers below every `period` columns.
 */
export const rails = defineTemplate(
  "rails",
  "long rails with alternating end exits and sleepers (teeth) hanging below; period/tooth/phase shape the sleepers, exit the gap width",
  { rails: 4, spacing: 5, exit: 6, period: 6, tooth: 2, phase: 3, startSide: 0, gaps: [] },
  (p, g) => {
    for (let k = 0; k < p.rails; k++) {
      const row = FLOOR - p.spacing * (k + 1);
      const left = (k + p.startSide) % 2 === 0;
      const c0 = left ? 2 + p.exit : 2;
      const c1 = left ? 29 : 29 - p.exit;
      g.ledge(c0, c1, row);
      // Sleepers never come lower than two clear rows over whatever stands below (the floor or the next rail).
      const tooth = Math.max(0, Math.min(p.tooth, p.spacing - 3, FLOOR - 3 - row));
      for (let c = c0 + ((p.phase + 2 * k) % p.period); c <= c1; c += p.period) {
        if (tooth > 0) g.rect(c, row + 1, c, row + tooth);
      }
    }
  },
);
