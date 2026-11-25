import { FLOOR } from "../grid";
import { defineTemplate } from "./util";

/**
 * Sunken courtyard: stepped terraces rise from both walls (one tile per step, `stepW` wide) around a low central
 * court, with galleries `[col0, col1, row]` floating over the court and the terraces.
 */
export const courtyard = defineTemplate(
  "courtyard",
  "stepped terraces from both walls around a low court; terrace height/top width/step width, galleries [col0, col1, row]",
  {
    terrace: 3,
    top: 4,
    stepW: 2,
    galleries: [[9, 22, 18], [2, 10, 13], [21, 29, 13], [11, 20, 8]] as number[][],
    gaps: [],
  },
  (p, g) => {
    for (let h = 1; h <= p.terrace; h++) {
      const w = p.top + (p.terrace - h) * p.stepW;
      g.ledge(2, 1 + w, FLOOR - h);
      g.ledge(30 - w, 29, FLOOR - h);
    }
    for (const [c0, c1, row] of p.galleries) g.ledge(c0!, c1!, row!);
  },
);
