import { FLOOR } from "../grid";
import { defineTemplate } from "./util";

/**
 * A wide moat cut through the floor (and the ceiling, so falling in wraps to the top) crossed by a stack of
 * bridges that narrow as they rise; the banks carry ledges of their own on the tiers in between.
 */
export const moat = defineTemplate(
  "moat",
  "central moat in the floor with bridges above it and bank ledges; bank sets the bank ledge length, over the overlap of the first bridge",
  { bank: 6, over: 3, tiers: 4, spacing: 5, shrink: 3, gaps: [[11, 20]] },
  (p, g) => {
    const [g0, g1] = p.gaps[0]! as [number, number];
    for (let k = 0; k < p.tiers; k++) {
      const row = FLOOR - p.spacing * (k + 1);
      if (k % 2 === 0) {
        // Bridge over the moat, narrower every time it repeats.
        const cut = p.shrink * (k / 2);
        g.ledge(g0 - p.over + cut, g1 + p.over - cut, row);
      } else {
        g.ledge(2, 2 + p.bank - 1, row);
        g.ledge(29 - p.bank + 1, 29, row);
      }
    }
  },
);
