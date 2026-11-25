import { FLOOR } from "../grid";
import { defineTemplate } from "./util";

/**
 * Chunky bands (two rows thick by default) across the whole field, each cut by one vertical shaft. The shafts
 * wander from band to band (`at` lists the first column of each shaft, cycled), so a climb snakes sideways.
 */
export const shafts = defineTemplate(
  "shafts",
  "full-width chunky bands, each with one shaft; at = first shaft column per band, shaftW its width",
  { bands: 4, spacing: 5, thick: 2, shaftW: 5, at: [5, 21, 9, 18], gaps: [] },
  (p, g) => {
    for (let k = 0; k < p.bands; k++) {
      const row = FLOOR - p.spacing * (k + 1);
      g.ledge(2, 29, row, p.thick);
      const c0 = p.at[k % p.at.length]!;
      g.rect(c0, row, c0 + p.shaftW - 1, row + p.thick - 1, false);
    }
  },
);
