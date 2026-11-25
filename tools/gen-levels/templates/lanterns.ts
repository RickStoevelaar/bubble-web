import { defineTemplate } from "./util";

/**
 * Lantern clusters: a cap ledge with two small wing ledges hanging lower and wider, topped by a
 * short one-tile finial. `clusters` lists `[centreCol, capRow]`.
 */
export const lanterns = defineTemplate(
  "lanterns",
  "clusters [centreCol, capRow]: cap ledge capW wide, wings wingW wide `drop` rows lower and `reach` columns out, finial `chain` tiles tall on the cap",
  {
    clusters: [[9, 18], [22, 18], [15, 11], [6, 7], [25, 7]] as number[][],
    capW: 4,
    wingW: 3,
    drop: 3,
    reach: 4,
    chain: 2,
    gaps: [[14, 17]],
  },
  (p, g) => {
    for (const [cx, row] of p.clusters) {
      const c0 = cx! - Math.floor(p.capW / 2);
      g.ledge(c0, c0 + p.capW - 1, row!);
      if (p.chain > 0 && row! > 2) g.rect(cx!, Math.max(1, row! - p.chain), cx!, row! - 1);
      for (const side of [-1, 1]) {
        const w0 = side < 0 ? c0 - p.reach - p.wingW + 2 : c0 + p.capW + p.reach - 1;
        g.ledge(w0, w0 + p.wingW - 1, row! + p.drop);
      }
    }
  },
);
