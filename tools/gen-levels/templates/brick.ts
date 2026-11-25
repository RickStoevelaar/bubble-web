import { FLOOR } from "../grid";
import { defineTemplate } from "./util";

/** Rows of dashes like a brick wall: each row is shifted against the one below. */
export const brick = defineTemplate(
  "brick",
  "offset brick rows: period/seg set the dash and the opening, shift the row-to-row offset",
  { rows: 5, period: 10, seg: 7, spacing: 4, shift: 5, firstRow: FLOOR - 4, gaps: [[14, 17]] },
  (p, g) => {
    for (let k = 0; k < p.rows; k++) {
      const row = p.firstRow - p.spacing * k;
      const off = (k % 2) * p.shift;
      let run: number[] = [];
      const flush = (): void => {
        if (run.length >= 3) g.ledge(run[0]!, run[run.length - 1]!, row);
        run = [];
      };
      for (let c = 2; c <= 29; c++) {
        if ((((c - 2 - off) % p.period) + p.period) % p.period < p.seg) run.push(c);
        else flush();
      }
      flush();
    }
  },
);
