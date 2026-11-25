import { clampCol, defineTemplate } from "./util";

/** Bands of short ledges whose heights follow a sine wave. */
export const waves = defineTemplate(
  "waves",
  "bands of ledges riding a sine wave (amplitude, period, phase and band rows are parameters)",
  { base: [19, 9], segW: 4, gap: 2, amp: 3, period: 7, phase: 0, gaps: [[14, 17]] },
  (p, g) => {
    p.base.forEach((b, band) => {
      const n = Math.ceil(28 / (p.segW + p.gap));
      for (let i = 0; i < n; i++) {
        const c0 = 2 + i * (p.segW + p.gap);
        const row = b + Math.round(p.amp * Math.sin((2 * Math.PI * i) / p.period + p.phase + band * 1.7));
        const c1 = clampCol(c0 + p.segW - 1);
        if (c1 - c0 >= 2) g.ledge(c0, c1, row);
      }
    });
  },
);
