import { FLOOR } from "../grid";
import { defineTemplate } from "./util";

/**
 * A fortress ring standing on the floor: two thick walls with doorways at floor level, a one-way roof and inner
 * steps, ringed by outer ledges. `half` is the ring's half width, `roof` the roof row.
 */
export const fortress = defineTemplate(
  "fortress",
  "hollow fortress standing on the floor: walls (half = half width, wallW thick) with doorways door rows high, roof row, inner steps, outer ledges",
  { half: 8, wallW: 2, roof: 14, door: 3, steps: [[11, 14, 22], [17, 20, 18]], outer: [[2, 5, 21], [26, 29, 21], [2, 5, 10], [26, 29, 10], [12, 19, 8]], gaps: [] },
  (p, g) => {
    const l0 = 16 - p.half;
    const r1 = 15 + p.half;
    g.ledge(l0, r1, p.roof);
    g.rect(l0, p.roof + 1, l0 + p.wallW - 1, FLOOR - 1 - p.door);
    g.rect(r1 - p.wallW + 1, p.roof + 1, r1, FLOOR - 1 - p.door);
    for (const [c0, c1, row] of p.steps) g.ledge(c0!, c1!, row!);
    for (const [c0, c1, row] of p.outer) g.ledge(c0!, c1!, row!);
  },
);
