import { FLOOR } from "../grid";
import { defineTemplate } from "./util";

/** Seeded scatter of ledges, one per slot in each tier. Different seeds give different but equally fair layouts. */
export const scatter = defineTemplate(
  "scatter",
  "seeded scatter: perTier ledges per tier with random width and position inside their slot",
  { tiers: 4, spacing: 5, perTier: 3, minW: 4, maxW: 8, thickChance: 0, gaps: [[14, 17]] },
  (p, g, rng) => {
    const slot = 28 / p.perTier;
    for (let k = 0; k < p.tiers; k++) {
      const row = FLOOR - p.spacing * (k + 1);
      for (let i = 0; i < p.perTier; i++) {
        const w = Math.min(p.minW + rng.int(p.maxW - p.minW + 1), Math.floor(slot) - 2);
        const s0 = 2 + Math.floor(slot * i);
        const start = s0 + rng.int(Math.max(1, Math.floor(slot) - w));
        const thick = rng.next() < p.thickChance ? 2 : 1;
        g.ledge(start, start + w - 1, row, thick);
      }
    }
  },
);
