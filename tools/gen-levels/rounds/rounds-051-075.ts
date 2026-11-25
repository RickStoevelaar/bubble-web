import type { EnemyGroup, PlacedEnemyType, RoundDef } from "../types";
import { handArt } from "./hand";

/**
 * Rounds 51-75: counts 9-12 (about 9.5 at the start, 11-12 at the end), every round mixes at least four types and
 * leans on throwers, breathers, bouncers and flyers. Sixteen rounds send their enemies in two to four waves
 * (distinct `delayTicks`, at least two enemies each); the others trickle in. Themes: 51-60 theme 5, 61-70 theme 6,
 * 71-75 theme 7. Rounds 55 and 65 are the quieter "breather" rounds (nine enemies, open layouts). Hand-drawn rounds:
 * 55 (open stage), 60 (the anvil), 70 (twin towers) and 75 (the chandelier). Layout notes sit beside each round.
 */

/** Row of ledges from absolute column ranges (interior columns 2..29), for hand art. */
const row = (...ranges: [number, number][]): string => {
  const cells = Array<string>(28).fill(".");
  for (const [a, b] of ranges) for (let c = a; c <= b; c++) cells[c - 2] = "#";
  return cells.join("");
};

/** A group of `n` enemies; with `wave` they all appear `wave` ticks into the round (no per-member spread, so a wave shares one delay). */
const g = (type: PlacedEnemyType, n: number, wave?: number): EnemyGroup => ({ type, n, ...(wave !== undefined ? { delayTicks: wave, spread: 0 } : {}) });

/** Hand-drawn "open stage" (round 55, a quiet round): three airy tiers and a small crown, lots of room to move. */
const STAGE = handArt([[14, 17]], {
  4: row([12, 19]),
  8: row([4, 9], [22, 27]),
  12: row([10, 21]),
  17: row([2, 8], [23, 29]),
  21: row([11, 20]),
});

/** Hand-drawn "anvil" (round 60, milestone): a pedestal carrying a heavy head, side ledges and a crown. */
const ANVIL = handArt(
  [],
  {
    7: row([9, 22]),
    11: row([2, 6], [25, 29]),
    12: row([10, 21]),
    13: row([10, 21]),
    14: row([12, 19]),
    15: row([14, 17]),
    16: row([3, 9], [14, 17], [22, 28]),
    17: row([14, 17]),
    18: row([14, 17]),
    19: row([14, 17]),
    20: row([14, 17]),
    21: row([2, 8], [14, 17], [23, 29]),
    22: row([14, 17]),
  },
);

/** Hand-drawn "twin towers" (round 70, milestone): two stout towers joined by a bridge, a crown above and inner ledges below. */
const TOWERS = handArt(
  [],
  {
    8: row([2, 6], [12, 19], [25, 29]),
    13: row([8, 13], [18, 23]),
    14: row([8, 11], [20, 23]),
    15: row([8, 11], [20, 23]),
    16: row([8, 11], [20, 23]),
    18: row([8, 11], [20, 23]),
    19: row([8, 11], [20, 23]),
    20: row([8, 11], [20, 23]),
    22: row([8, 11], [20, 23]),
    23: row([8, 11], [20, 23]),
    24: row([8, 11], [20, 23]),
    25: row([8, 11], [20, 23]),
    17: row([5, 11], [16, 19], [20, 26]),
    21: row([2, 4], [8, 11], [12, 15], [20, 23], [27, 29]),
  },
);

/** Hand-drawn "chandelier" (round 75, finale): a long bar with a hanging gem, stepped ledges up both sides and a crown. */
const CHANDELIER = handArt(
  [],
  {
    6: row([2, 6], [11, 20], [25, 29]),
    11: row([8, 23]),
    12: row([11, 20]),
    13: row([12, 19]),
    14: row([13, 18]),
    15: row([14, 17]),
    16: row([2, 9], [22, 29]),
    21: row([2, 6], [12, 19], [25, 29]),
  },
);

export const ROUNDS_051_075: RoundDef[] = [
  {
    round: 51, theme: 5, template: "hooks", stagger: 30,
    params: { arm: 17, hook: 2 },
    enemies: [g("walker", 2), g("chaser", 2), g("thrower", 2), g("breather", 1), g("bouncer", 1), g("flyer", 1)],
  },
  {
    round: 52, theme: 5, template: "islands",
    params: { rows: 4, spacing: 5, perRow: 3, w: 7, jitter: 2, gaps: [[7, 10], [21, 24]] },
    flags: { waterBubbles: true },
    enemies: [g("walker", 2, 0), g("chaser", 1, 0), g("thrower", 2, 120), g("breather", 2, 120), g("bouncer", 1, 240), g("flyer", 2, 240)],
  },
  {
    round: 53, theme: 5, template: "canyon",
    params: { steps: 5, h: 2, w0: 2, grow: 2, dir: 1, inner: [[7, 13, 11], [18, 24, 11], [12, 19, 6]] },
    drift: [{ kind: "area", col0: 13, col1: 18, row0: 4, row1: 22, dx: 0, dy: -1 }],
    notes: "updraft up the canyon floor",
    enemies: [g("walker", 1, 0), g("chaser", 2, 0), g("thrower", 2, 150), g("breather", 1, 150), g("bouncer", 2, 300), g("flyer", 1, 300)],
  },
  {
    round: 54, theme: 5, template: "lattice", stagger: 30,
    params: { rows: 5, spacing: 4, maxD: 10, w: 7, centerW: 10 },
    flags: { fireBubbles: true },
    enemies: [g("walker", 2, 0), g("chaser", 2, 0), g("thrower", 2, 120), g("breather", 2, 240), g("bouncer", 1, 360), g("flyer", 1, 360)],
  },
  {
    round: 55, theme: 5, template: "hand", stagger: 30,
    params: {}, tiles: STAGE,
    notes: "quiet round: an open stage with room to move",
    enemies: [g("walker", 2), g("chaser", 2), g("thrower", 2), g("breather", 1), g("bouncer", 1), g("flyer", 1)],
  },
  {
    round: 56, theme: 5, template: "spiral",
    params: {},
    flags: { waterBubbles: true, fireBubbles: true },
    enemies: [g("walker", 2, 0), g("chaser", 1, 0), g("thrower", 2, 120), g("breather", 2, 120), g("bouncer", 1, 240), g("flyer", 2, 240)],
  },
  {
    round: 57, theme: 5, template: "comb", stagger: 30,
    params: { period: 10, toothW: 2, toothH: 2, spineRows: [22, 15, 8], dirs: [1, -1, 1], offsets: [3, 7, 2], holes: [[0, 3, 4], [0, 25, 4], [1, 14, 4], [2, 3, 4], [2, 25, 4]] },
    drift: [{ kind: "area", col0: 4, col1: 27, row0: 17, row1: 19, dx: 1, dy: 0 }],
    flags: { lightningBubbles: true },
    enemies: [g("walker", 1), g("chaser", 2), g("thrower", 2), g("breather", 2), g("bouncer", 2), g("flyer", 1)],
  },
  {
    round: 58, theme: 5, template: "bridges",
    params: {},
    flags: { fireBubbles: true, lightningBubbles: true },
    enemies: [g("walker", 2, 0), g("chaser", 1, 0), g("thrower", 3, 150), g("breather", 2, 150), g("bouncer", 2, 300), g("flyer", 1, 300)],
  },
  {
    round: 59, theme: 5, template: "tiers", stagger: 30,
    params: { tiers: 4, spacing: 5, inset: 2, foot: 2, hole: 4, thick: 2 },
    enemies: [g("walker", 1, 0), g("chaser", 2, 0), g("thrower", 2, 120), g("breather", 2, 120), g("bouncer", 1, 240), g("flyer", 2, 240)],
  },
  {
    round: 60, theme: 5, template: "hand", stagger: 30,
    params: {}, tiles: ANVIL,
    flags: { waterBubbles: true, lightningBubbles: true },
    notes: "milestone: the anvil",
    enemies: [g("walker", 1, 0), g("chaser", 1, 0), g("thrower", 3, 120), g("breather", 3, 240), g("bouncer", 2, 360), g("flyer", 2, 360)],
  },
  {
    round: 61, theme: 6, template: "lanterns", stagger: 30,
    params: {},
    drift: [{ kind: "ring", col0: 6, col1: 25, row0: 4, row1: 22, clockwise: true, width: 1 }],
    enemies: [g("walker", 1), g("chaser", 2), g("thrower", 2), g("breather", 2), g("bouncer", 2), g("flyer", 1)],
  },
  {
    round: 62, theme: 6, template: "rails",
    params: { rails: 4, spacing: 5, exit: 9, period: 4, tooth: 1, phase: 2, startSide: 0 },
    flags: { waterBubbles: true, fireBubbles: true },
    enemies: [g("walker", 1, 0), g("chaser", 1, 0), g("thrower", 3, 150), g("breather", 2, 150), g("bouncer", 2, 300), g("flyer", 2, 300)],
  },
  {
    round: 63, theme: 6, template: "chambers", stagger: 30,
    params: { tiers: 4 },
    enemies: [g("walker", 2), g("chaser", 1), g("thrower", 2), g("breather", 2), g("bouncer", 2), g("flyer", 1)],
  },
  {
    round: 64, theme: 6, template: "zigzag",
    params: { count: 5, spacing: 4, ledgeW: 14, startSide: 0 },
    flags: { fireBubbles: true, lightningBubbles: true },
    enemies: [g("walker", 1, 0), g("chaser", 1, 0), g("thrower", 3, 120), g("breather", 2, 120), g("bouncer", 2, 240), g("flyer", 2, 240)],
  },
  {
    round: 65, theme: 6, template: "courtyard", stagger: 30,
    params: {},
    notes: "quiet round: an open court",
    enemies: [g("walker", 2), g("chaser", 2), g("thrower", 2), g("breather", 1), g("bouncer", 1), g("flyer", 1)],
  },
  {
    round: 66, theme: 6, template: "spiral",
    params: { n: 11, turns: 1.4, rx: 13, ry: 9, cy: 13, shrink: 0.55, segW: 6, a0: 5.2 },
    drift: [{ kind: "ring", col0: 5, col1: 26, row0: 5, row1: 21, clockwise: false, width: 1 }],
    flags: { waterBubbles: true, lightningBubbles: true },
    enemies: [g("walker", 1, 0), g("chaser", 1, 0), g("thrower", 2, 150), g("breather", 3, 150), g("bouncer", 2, 300), g("flyer", 2, 300)],
  },
  {
    round: 67, theme: 6, template: "diamond", stagger: 30,
    params: { cy: 12, step: 5, levels: 2, hx: 12, segW: 6, tip: 5, corners: 1, cornerW: 4 },
    enemies: [g("walker", 1), g("chaser", 1), g("thrower", 2), g("breather", 3), g("bouncer", 2), g("flyer", 2)],
  },
  {
    round: 68, theme: 6, template: "canyon",
    params: { dir: -1, steps: 4, h: 2, w0: 2, grow: 2, inner: [[6, 11, 13], [20, 25, 13], [12, 19, 8]] },
    flags: { waterBubbles: true, fireBubbles: true },
    enemies: [g("walker", 1, 0), g("chaser", 1, 0), g("thrower", 3, 120), g("breather", 3, 120), g("bouncer", 2, 240), g("flyer", 2, 240)],
  },
  {
    round: 69, theme: 6, template: "hooks",
    params: { tiers: 4, spacing: 5, arm: 20, hook: 2, hookW: 3, startSide: 1 },
    drift: [{ kind: "area", col0: 3, col1: 28, row0: 9, row1: 11, dx: -1, dy: 0 }],
    enemies: [g("walker", 2, 0), g("chaser", 1, 0), g("thrower", 2, 150), g("breather", 2, 150), g("bouncer", 2, 300), g("flyer", 2, 300)],
  },
  {
    round: 70, theme: 6, template: "hand",
    params: {}, tiles: TOWERS,
    flags: { fireBubbles: true, lightningBubbles: true },
    notes: "milestone: twin towers",
    enemies: [g("walker", 1, 0), g("chaser", 1, 0), g("thrower", 3, 120), g("breather", 3, 240), g("bouncer", 2, 360), g("flyer", 2, 360)],
  },
  {
    round: 71, theme: 7, template: "bridges", stagger: 30,
    params: { tiers: 3, spacing: 6, len: 16, drop: 4, pier: 3, startSide: 1 },
    enemies: [g("walker", 1), g("chaser", 1), g("thrower", 3), g("breather", 2), g("bouncer", 2), g("flyer", 2)],
  },
  {
    round: 72, theme: 7, template: "lanterns",
    params: { clusters: [[7, 20], [24, 20], [15, 14], [8, 9], [23, 9], [15, 5]], capW: 6, wingW: 3, drop: 3, reach: 4, chain: 0 },
    drift: [{ kind: "ring", col0: 4, col1: 27, row0: 4, row1: 22, clockwise: true, width: 2 }],
    flags: { waterBubbles: true, lightningBubbles: true },
    enemies: [g("walker", 1, 0), g("chaser", 1, 0), g("thrower", 3, 150), g("breather", 3, 150), g("bouncer", 2, 300), g("flyer", 2, 300)],
  },
  {
    round: 73, theme: 7, template: "keep",
    params: { colW: 5, colBottom: 14, tiers: 4, wingW: 6 },
    enemies: [g("walker", 1, 0), g("chaser", 2, 0), g("thrower", 2, 120), g("breather", 2, 120), g("bouncer", 2, 240), g("flyer", 2, 240)],
  },
  {
    round: 74, theme: 7, template: "courtyard", stagger: 30,
    params: { terrace: 4, top: 3, stepW: 2, galleries: [[10, 21, 17], [2, 9, 12], [22, 29, 12], [12, 19, 7]] },
    drift: [{ kind: "area", col0: 11, col1: 20, row0: 6, row1: 22, dx: 0, dy: -1 }],
    flags: { fireBubbles: true, lightningBubbles: true },
    enemies: [g("walker", 1), g("chaser", 1), g("thrower", 3), g("breather", 3), g("bouncer", 2), g("flyer", 2)],
  },
  {
    round: 75, theme: 7, template: "hand",
    params: {}, tiles: CHANDELIER,
    flags: { waterBubbles: true },
    notes: "finale: the chandelier",
    enemies: [g("walker", 1, 0), g("chaser", 1, 0), g("thrower", 3, 120), g("breather", 3, 240), g("bouncer", 2, 360), g("flyer", 2, 360)],
  },
];
