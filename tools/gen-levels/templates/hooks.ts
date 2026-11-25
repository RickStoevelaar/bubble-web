import { FLOOR } from "../grid";
import { defineTemplate } from "./util";

/**
 * Interlocking hooks: arms reach in from alternating walls, each ending in a short hook that hangs below it. The
 * arms of consecutive tiers overlap in the middle, so the climb threads between the hooks.
 */
export const hooks = defineTemplate(
  "hooks",
  "alternating wall arms ending in hanging hooks; arm arm length, hook hook depth, hookW hook thickness, startSide first arm side",
  { tiers: 4, spacing: 5, arm: 18, hook: 2, hookW: 2, startSide: 0, gaps: [] },
  (p, g) => {
    for (let k = 0; k < p.tiers; k++) {
      const row = FLOOR - p.spacing * (k + 1);
      const left = (k + p.startSide) % 2 === 0;
      const c0 = left ? 2 : 30 - p.arm;
      const c1 = left ? 1 + p.arm : 29;
      g.ledge(c0, c1, row);
      // A hook never comes lower than two clear rows over whatever stands below.
      // Within ten rows of the floor there are none either: a hook there would wall off the floor.
      const depth = FLOOR - row < 10 ? 0 : Math.max(0, Math.min(p.hook, p.spacing - 3, FLOOR - 3 - row));
      if (depth > 0) g.rect(left ? c1 - p.hookW + 1 : c0, row + 1, left ? c1 : c0 + p.hookW - 1, row + depth);
    }
  },
);
