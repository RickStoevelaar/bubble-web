import { FLOOR } from "../grid";
import { defineTemplate } from "./util";

/**
 * Overlapping bridges: on every tier a long bridge reaches in from one wall, a pier rises from its end to a second
 * bridge from the other wall that overlaps it from above; tiers alternate sides.
 */
export const bridges = defineTemplate(
  "bridges",
  "pairs of overlapping bridges joined by a pier: len bridge length, lane open columns at the end of the upper bridge, drop height of the upper bridge, pier width, spacing between pairs",
  { tiers: 3, spacing: 7, len: 18, drop: 3, pier: 2, lane: 4, startSide: 0, gaps: [] },
  (p, g) => {
    for (let k = 0; k < p.tiers; k++) {
      const low = FLOOR - 4 - p.spacing * k;
      const left = (k + p.startSide) % 2 === 0;
      const lowC0 = left ? 2 : 30 - p.len;
      const lowC1 = left ? 1 + p.len : 29;
      // The upper bridge stops `lane` columns short of the far wall: that is where the climber drops back down.
      const upC0 = left ? 30 - p.len : 2 + p.lane;
      const upC1 = left ? 29 - p.lane : 1 + p.len;
      g.ledge(lowC0, lowC1, low);
      g.ledge(upC0, upC1, low - p.drop);
      // The pier stands on the lower bridge's inner end and carries the upper bridge.
      const pc0 = left ? lowC1 - p.pier + 1 : lowC0;
      g.rect(pc0, low - p.drop, pc0 + p.pier - 1, low - 1);
    }
  },
);
