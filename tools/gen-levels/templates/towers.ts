import { FLOOR } from "../grid";
import { clampCol, defineTemplate } from "./util";

/**
 * Floor-standing towers with ledges bridging the gaps between them, then ledges over the towers, and so on.
 * (A jump always lands on the first surface below its apex, so towers are only hoppable while nothing wide hangs
 * over them within a jump: the ledges here are short and sit over the gaps.)
 */
export const towers = defineTemplate(
  "towers",
  "short towers on the floor with alternating ledge tiers above the gaps and above the towers",
  { n: 3, towerW: 2, towerH: 3, tiers: 3, ledgeW: 5, gaps: [] },
  (p, g) => {
    const slot = 28 / p.n;
    const xs: number[] = [];
    for (let i = 0; i < p.n; i++) xs.push(Math.round(2 + slot * (i + 0.5) - p.towerW / 2));
    for (const x of xs) g.rect(x, FLOOR - p.towerH, x + p.towerW - 1, FLOOR - 1);
    for (let k = 0; k < p.tiers; k++) {
      const row = FLOOR - p.towerH - 5 * (k + 1);
      const centres = k % 2 === 0 ? xs.slice(0, -1).map((x, i) => (x + xs[i + 1]! + p.towerW - 1) / 2) : xs.map((x) => x + (p.towerW - 1) / 2);
      for (const c of centres) {
        const c0 = clampCol(Math.round(c - (p.ledgeW - 1) / 2));
        g.ledge(c0, c0 + p.ledgeW - 1, row);
      }
      // Half ledges against the walls on the tiers that sit over towers' outsides.
      if (k % 2 === 0) {
        g.ledge(2, 2 + Math.floor(p.ledgeW / 2) - 1, row);
        g.ledge(30 - Math.floor(p.ledgeW / 2), 29, row);
      }
    }
  },
);
