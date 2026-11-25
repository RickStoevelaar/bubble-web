import { FLOOR } from "../grid";
import { defineTemplate } from "./util";

/**
 * Stepped canyon: solid walls built of `steps` terraces of `h` rows, each `grow` wider than the one below
 * (dir 1: the canyon narrows as it rises) or narrower (dir -1: it widens), with floating ledges `[c0, c1, row]` inside.
 */
export const canyon = defineTemplate(
  "canyon",
  "stepped solid canyon walls: steps terraces of h rows, base width w0 growing by grow per step (dir -1 reverses it), inner ledges [c0, c1, row]",
  { steps: 4, h: 2, w0: 2, grow: 2, dir: 1, inner: [[7, 12, 13], [19, 24, 13], [12, 19, 8]] as number[][], gaps: [] },
  (p, g) => {
    for (let s = 0; s < p.steps; s++) {
      const w = p.dir > 0 ? p.w0 + s * p.grow : p.w0 + (p.steps - 1 - s) * p.grow;
      const r1 = FLOOR - 1 - s * p.h;
      g.rect(2, r1 - p.h + 1, 1 + w, r1);
      g.rect(30 - w, r1 - p.h + 1, 29, r1);
    }
    for (const [c0, c1, row] of p.inner) g.ledge(c0!, c1!, row!);
  },
);
