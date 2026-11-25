import { defineTemplate, punch } from "./util";

/** Spines with teeth: up-teeth are stepping stones, down-teeth hang like stalactites. */
export const comb = defineTemplate(
  "comb",
  "full-width spines with periodic teeth pointing up (dir 1) or down (dir -1), interleaved between spines; holes are [spine, col, width] triples",
  { period: 8, toothW: 2, toothH: 3, spineRows: [21, 13], dirs: [1, -1], offsets: [4, 8], holes: [[0, 2, 4], [0, 24, 4], [1, 12, 4]], gaps: [[14, 17]] },
  (p, g) => {
    p.spineRows.forEach((row, s) => {
      g.ledge(2, 29, row);
      const mine = p.holes.filter((h) => h[0] === s);
      punch(g, p.holes, s, row);
      const dir = p.dirs[s % p.dirs.length]!;
      const off = p.offsets[s % p.offsets.length]!;
      for (let c = 2 + off; c + p.toothW - 1 <= 27; c += p.period) {
        if (mine.some((h) => c + p.toothW > h[1]! && c <= h[1]! + h[2]! - 1)) continue;
        if (dir > 0) g.rect(c, row - p.toothH, c + p.toothW - 1, row - 1);
        else g.rect(c, row + 1, c + p.toothW - 1, row + p.toothH);
      }
    });
  },
);
