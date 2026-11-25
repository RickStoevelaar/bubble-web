import { FLOOR, MID } from "../grid";
import { defineTemplate } from "./util";

/** Terraces step the floor up toward both walls, forming a valley with a hole in the middle; ledges arc above it. */
export const bowl = defineTemplate(
  "bowl",
  "terraced valley: the floor climbs toward both walls; arc of ledges above",
  { steps: 3, stepH: 2, stepW: 3, ledges: true, gaps: [[14, 17]] },
  (p, g) => {
    for (let k = 0; k < p.steps; k++) {
      const top = FLOOR - (p.steps - k) * p.stepH;
      const lc0 = 2 + k * p.stepW;
      g.rect(lc0, top, lc0 + p.stepW - 1, FLOOR + 1);
      const rc1 = 29 - k * p.stepW;
      g.rect(rc1 - p.stepW + 1, top, rc1, FLOOR + 1);
    }
    if (p.ledges) {
      const t = FLOOR - p.steps * p.stepH;
      const mid = Math.floor(MID);
      g.ledge(4, 11, t - 3);
      g.ledge(20, 27, t - 3);
      g.ledge(mid - 3, mid + 4, t - 8);
      g.ledge(3, 9, t - 13);
      g.ledge(22, 28, t - 13);
    }
  },
);
