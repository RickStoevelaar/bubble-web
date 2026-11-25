import { MID } from "../grid";
import { clampCol, defineTemplate } from "./util";

/** Ledges set on an ellipse around an open middle, with a small island at its centre. */
export const ring = defineTemplate(
  "ring",
  "ring of ledges around an island; n ledges on an ellipse (rx, ry) centred on row cy",
  { n: 10, rx: 11, ry: 8, cy: 14, segW: 5, island: 6, phase: 0.3, gaps: [[14, 17]] },
  (p, g) => {
    for (let i = 0; i < p.n; i++) {
      const a = (2 * Math.PI * i) / p.n + p.phase;
      const c = MID + p.rx * Math.cos(a);
      const row = Math.round(p.cy + p.ry * Math.sin(a));
      const c0 = clampCol(Math.round(c - p.segW / 2));
      g.ledge(c0, c0 + p.segW - 1, row);
    }
    if (p.island > 0) g.ledge(Math.round(MID - p.island / 2 + 0.5), Math.round(MID + p.island / 2 - 0.5), p.cy);
  },
);
