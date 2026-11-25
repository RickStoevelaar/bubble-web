import { MID } from "../grid";
import { clampCol, defineTemplate } from "./util";

/**
 * Broken spiral: ledges set along an elliptical spiral that winds inward (`shrink` of the radius is lost over the
 * whole climb), so the route circles the field and tightens as it rises.
 */
export const spiral = defineTemplate(
  "spiral",
  "ledges along an inward elliptical spiral: n ledges, turns of rotation, radii rx/ry around row cy, shrink fraction lost, segW width, a0 start angle",
  { n: 10, turns: 1.1, rx: 12, ry: 9, cy: 14, shrink: 0.45, segW: 5, a0: 2.4, gaps: [[14, 17]] },
  (p, g) => {
    for (let i = 0; i < p.n; i++) {
      const t = i / Math.max(1, p.n - 1);
      const a = p.a0 + 2 * Math.PI * p.turns * t;
      const f = 1 - p.shrink * t;
      const c = MID + p.rx * f * Math.cos(a);
      const row = Math.round(p.cy + p.ry * f * Math.sin(a));
      const c0 = clampCol(Math.round(c - p.segW / 2));
      g.ledge(c0, c0 + p.segW - 1, Math.max(3, Math.min(23, row)));
    }
  },
);
