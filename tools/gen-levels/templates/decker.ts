import { FLOOR } from "../grid";
import { defineTemplate, punch } from "./util";

/** Chunky 2-thick decks, each punched with one hole, with a crown of ledges on top. */
export const decker = defineTemplate(
  "decker",
  "thick full-width decks; holes are [deck, col, width] triples; optional crown ledges",
  { decks: 3, thick: 2, spacing: 5, holes: [[0, 4, 5], [0, 24, 5], [1, 14, 5], [2, 6, 5], [2, 22, 5], [3, 14, 5]], crown: true, gaps: [[14, 17]] },
  (p, g) => {
    for (let k = 0; k < p.decks; k++) {
      const row = FLOOR - p.spacing * (k + 1);
      g.ledge(2, 29, row, p.thick);
      punch(g, p.holes, k, row, p.thick);
    }
    if (p.crown) {
      const row = FLOOR - p.spacing * (p.decks + 1);
      g.ledge(5, 11, row);
      g.ledge(20, 26, row);
    }
  },
);
