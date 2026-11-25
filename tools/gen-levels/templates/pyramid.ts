import { FLOOR } from "../grid";
import { defineTemplate } from "./util";

/** A stepped solid pyramid rising from the floor, with climbing ledges on both flanks and a bridge on top. */
export const pyramid = defineTemplate(
  "pyramid",
  "stepped pyramid in the middle of the floor with flank ledges and a top bridge",
  { layers: 3, layerH: 3, baseW: 18, inset: 3, sideLedges: 3, sideW: 7, gaps: [] },
  (p, g) => {
    const c0 = 16 - Math.floor(p.baseW / 2);
    for (let j = 0; j < p.layers; j++) {
      g.rect(c0 + j * p.inset, FLOOR - (j + 1) * p.layerH, c0 + p.baseW - 1 - j * p.inset, FLOOR - 1);
    }
    const first = FLOOR - p.layerH - 5;
    for (let k = 0; k < p.sideLedges; k++) {
      const row = first - 5 * k;
      if (k === p.sideLedges - 1 && p.sideLedges > 2) g.ledge(7, 24, row);
      else {
        g.ledge(2, 2 + p.sideW - 1, row);
        g.ledge(30 - p.sideW, 29, row);
      }
    }
  },
);
