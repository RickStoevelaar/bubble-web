import { FLOOR, MID } from "../grid";
import { defineTemplate } from "./util";

/**
 * Honeycomb of small chambers: every chamber is a floor ledge and a roof ledge three rows above it (two clear
 * rows inside), closed at one end. One central chamber sits on even tiers (the first stands on the floor), edge chambers on odd tiers.
 */
export const chambers = defineTemplate(
  "chambers",
  "staggered small chambers (floor + roof + one closed end): tiers of pitch 6, edgeW edge chamber width, midW central width, midSide first closed side",
  { tiers: 3, edgeW: 9, midW: 10, midSide: 1, gaps: [[14, 17]] },
  (p, g) => {
    const cell = (c0: number, w: number, floor: number, wall: number): void => {
      if (floor < FLOOR) g.ledge(c0, c0 + w - 1, floor);
      const roof = floor - 3;
      g.ledge(c0, c0 + w - 1, roof);
      if (wall !== 0) {
        const wc = wall < 0 ? c0 : c0 + w - 2;
        g.rect(wc, roof + 1, wc + 1, floor - 1);
      }
    };
    for (let k = 0; k < p.tiers; k++) {
      const floor = FLOOR - 6 * k;
      if (k % 2 === 1) {
        cell(2, p.edgeW, floor, -1);
        cell(30 - p.edgeW, p.edgeW, floor, 1);
      } else {
        const side = (k / 2) % 2 === 0 ? p.midSide : -p.midSide;
        cell(Math.round(MID - p.midW / 2 + 0.5), p.midW, floor, side);
      }
    }
  },
);
