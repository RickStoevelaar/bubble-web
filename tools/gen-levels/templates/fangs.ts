import { FLOOR } from "../grid";
import { defineTemplate } from "./util";

/**
 * Tiers of ledges whose undersides carry rows of short hanging fangs (`fangW` wide, `fangH` tall, one every `pitch`
 * columns from `first`), with a hole in every tier so players can climb through and drop back. Tiers alternate the
 * hole side. The fangs hang over free walking height (spacing - 1 - fangH rows), so nothing blocks a tier.
 */
export const fangs = defineTemplate(
  "fangs",
  "tiers of ledges with hanging fangs on their undersides: tiers, spacing rows apart, fangW/fangH, pitch columns between fangs, first fang column, hole width (alternating sides)",
  { tiers: 4, spacing: 5, fangW: 3, fangH: 2, pitch: 7, first: 9, hole: 5, gaps: [] },
  (p, g) => {
    for (let k = 0; k < p.tiers; k++) {
      const row = FLOOR - p.spacing * (k + 1);
      const left = k % 2 === 0;
      const c0 = left ? 2 + p.hole : 2;
      const c1 = left ? 29 : 29 - p.hole;
      g.ledge(c0, c1, row);
      // fangs keep 4 columns away from the ledge ends so no pocket is too narrow
      for (let c = p.first + (k % 2) * 3; c + p.fangW - 1 <= c1 - 4; c += p.pitch) {
        if (c < c0 + 4) continue;
        g.rect(c, row + 1, c + p.fangW - 1, row + p.fangH);
      }
    }
  },
);
