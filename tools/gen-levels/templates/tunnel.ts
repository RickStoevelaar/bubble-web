import { FLOOR } from "../grid";
import { defineTemplate } from "./util";

/** Thick slabs form tunnels over the floor; each is entered from the open end by short stepping ledges. */
export const tunnel = defineTemplate(
  "tunnel",
  "two thick slabs forming tunnel and chamber, entered from alternating ends; mirror flips left-right",
  { thick: 2, openW: 8, stepW: 4, mirror: false, top: true, gaps: [] },
  (p, g) => {
    const flip = (c0: number, c1: number): [number, number] => (p.mirror ? [31 - c1, 31 - c0] : [c0, c1]);
    const slab0 = FLOOR - 6;
    const slab1 = slab0 - 8;
    const put = (c0: number, c1: number, row: number, t = 1): void => {
      const [a, b] = flip(c0, c1);
      g.ledge(a, b, row, t);
    };
    // Thick slabs are walls: they stay 2 columns off the border so a body squeezed out of one cannot be pushed into it.
    put(4, 29 - p.openW, slab0, p.thick);
    put(30 - p.stepW, 29, FLOOR - 4);
    put(2, 7, slab0 - 4);
    put(2 + p.openW + 1, 27, slab1, p.thick);
    if (p.top) put(30 - p.openW - 4, 29 - 1, slab1 - 4);
  },
);
