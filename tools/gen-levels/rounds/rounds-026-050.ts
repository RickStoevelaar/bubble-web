import type { EnemyGroup, PlacedEnemyType, RoundDef } from "../types";
import { handArt } from "./hand";

/**
 * Rounds 26-50: every enemy type is in play, so each round is a mix. Counts climb from 8 to 11, the mix leans on
 * throwers, breathers, bouncers and flyers, and many rounds send their enemies in two or three waves (`delayTicks`
 * per group) instead of a steady trickle. Themes: 26-30 theme 2, 31-40 theme 3, 41-50 theme 4. Milestone rounds 30,
 * 40 and 50 (and round 35) are hand-drawn. Layout notes sit beside each round.
 */

/** Row of ledges from absolute column ranges (interior columns 2..29), for hand art. */
const row = (...ranges: [number, number][]): string => {
  const cells = Array<string>(28).fill(".");
  for (const [a, b] of ranges) for (let c = a; c <= b; c++) cells[c - 2] = "#";
  return cells.join("");
};

/** A group of `n` enemies; with `wave` they all appear `wave` ticks into the round, `spread` ticks apart. */
const g = (type: PlacedEnemyType, n: number, wave?: number, spread = 0): EnemyGroup => ({ type, n, ...(wave !== undefined ? { delayTicks: wave, spread } : {}) });

/** Hand-drawn "citadel" (round 30): a symmetric stepped keep, crowned by a bridge. The floor centre stays open for the secret door. */
const CITADEL = handArt(
  [[9, 10], [21, 22]],
  {
    3: row([13, 18]),
    6: row([5, 12], [19, 26]),
    11: row([2, 8], [14, 17], [23, 29]),
    16: row([5, 11], [13, 18], [20, 26]),
    21: row([2, 7], [12, 19], [24, 29]),
  },
);

/** Hand-drawn "hourglass" (round 35): wide ledges narrow to a thick neck in the middle and widen again. */
const HOURGLASS = handArt(
  [],
  {
    3: row([2, 10], [21, 29]),
    6: row([6, 13], [18, 25]),
    11: row([12, 19]),
    12: row([12, 19]),
    16: row([6, 13], [18, 25]),
    21: row([2, 10], [13, 18], [21, 29]),
  },
);

/** Hand-drawn "hanging spires" (round 40): stalactites from the ceiling over staggered ledges. The floor is solid. */
const SPIRES = handArt(
  [],
  {
    1: row([8, 11], [20, 23], [15, 16]),
    4: row([8, 11], [20, 23]),
    7: row([8, 14], [17, 23]),
    8: row([8, 11], [20, 23]),
    12: row([2, 9], [13, 18], [22, 29]),
    16: row([8, 23]),
    21: row([2, 12], [19, 29]),
  },
  { 1: 3, 4: 3 },
);

/** Hand-drawn "grand hall" (round 50): a moat crossed by a bridge, chunky galleries and a crown. */
const HALL = handArt(
  [[12, 19]],
  {
    3: row([13, 18]),
    7: row([10, 21]),
    12: row([2, 12], [19, 29]),
    13: row([2, 12], [19, 29]),
    17: row([8, 23]),
    22: row([2, 8], [23, 29]),
  },
);

export const ROUNDS_026_050: RoundDef[] = [
  {
    round: 26, theme: 2, template: "shafts", stagger: 30,
    params: { bands: 4, spacing: 5, thick: 2, shaftW: 6, at: [13, 4, 21, 10] },
    enemies: [g("walker", 3), g("chaser", 2), g("thrower", 1), g("breather", 1), g("flyer", 1)],
  },
  {
    round: 27, theme: 2, template: "diamond",
    params: {},
    drift: [{ kind: "area", col0: 14, col1: 17, row0: 4, row1: 22, dx: 0, dy: -1 }],
    notes: "updraft through the hollow centre",
    enemies: [g("walker", 2, 0), g("chaser", 1, 0), g("thrower", 2, 150), g("breather", 1, 150), g("bouncer", 1, 300), g("flyer", 1, 300)],
  },
  {
    round: 28, theme: 2, template: "comb", stagger: 30,
    params: { period: 9, toothW: 3, toothH: 2, spineRows: [21, 12], dirs: [-1, 1], offsets: [2, 6], holes: [[0, 3, 4], [0, 25, 4], [1, 14, 4]] },
    flags: { waterBubbles: true },
    enemies: [g("walker", 2), g("chaser", 2), g("thrower", 2), g("breather", 1), g("bouncer", 1), g("flyer", 1)],
  },
  {
    round: 29, theme: 2, template: "nests",
    params: { tiers: 4, spacing: 5, nestW: 8, cradleW: 12, rim: 2, lip: 0 },
    flags: { fireBubbles: true },
    enemies: [g("walker", 2, 0), g("chaser", 1, 0), g("thrower", 2, 120), g("breather", 1, 120), g("bouncer", 1, 240), g("flyer", 1, 240)],
  },
  {
    round: 30, theme: 2, template: "hand", stagger: 30,
    params: {}, tiles: CITADEL,
    flags: { lightningBubbles: true },
    notes: "milestone and secret-door round: the door rests on the floor at the centre, under the middle ledge",
    enemies: [g("walker", 2), g("chaser", 1), g("thrower", 2), g("breather", 2), g("bouncer", 1), g("flyer", 2)],
  },
  {
    round: 31, theme: 3, template: "rails",
    params: { rails: 4, spacing: 5, exit: 7, period: 5, tooth: 1, phase: 1, startSide: 1 },
    drift: [{ kind: "area", col0: 10, col1: 28, row0: 10, row1: 10, dx: 1, dy: 0 }],
    notes: "a draft along the middle rail",
    enemies: [g("walker", 1, 0), g("chaser", 2, 0), g("thrower", 2, 150), g("breather", 2, 150), g("bouncer", 1, 300), g("flyer", 1, 300)],
  },
  {
    round: 32, theme: 3, template: "ring", stagger: 30,
    params: { n: 8, rx: 10, ry: 9, cy: 13, segW: 6, island: 8, phase: 0 },
    drift: [{ kind: "ring", col0: 6, col1: 25, row0: 6, row1: 20, clockwise: false, width: 1 }],
    flags: { waterBubbles: true, fireBubbles: true },
    enemies: [g("walker", 2), g("chaser", 1), g("thrower", 2), g("breather", 1), g("bouncer", 2), g("flyer", 1)],
  },
  {
    round: 33, theme: 3, template: "moat",
    params: { bank: 7, over: 2, tiers: 4, spacing: 5, shrink: 2, gaps: [[10, 21]] },
    enemies: [g("walker", 1, 0), g("chaser", 1, 0), g("thrower", 2, 150), g("breather", 2, 150), g("bouncer", 2, 300), g("flyer", 1, 300)],
  },
  {
    round: 34, theme: 3, template: "scatter", stagger: 30, seed: 3407,
    params: { tiers: 4, spacing: 5, perTier: 3, minW: 5, maxW: 9, thickChance: 0 },
    enemies: [g("walker", 2), g("chaser", 1), g("thrower", 2), g("breather", 2), g("bouncer", 1), g("flyer", 2)],
  },
  {
    round: 35, theme: 3, template: "hand", stagger: 30,
    params: {}, tiles: HOURGLASS,
    flags: { lightningBubbles: true, waterBubbles: true },
    enemies: [g("walker", 1), g("chaser", 2), g("thrower", 2), g("breather", 2), g("bouncer", 1), g("flyer", 2)],
  },
  {
    round: 36, theme: 3, template: "slashes",
    params: { lines: [[3, 22, 1, 5], [28, 22, -1, 5]], w: 4, rise: 3, hop: 2 },
    flags: { fireBubbles: true },
    enemies: [g("walker", 1, 0), g("chaser", 1, 0), g("thrower", 3, 150), g("breather", 2, 150), g("bouncer", 1, 300), g("flyer", 2, 300)],
  },
  {
    round: 37, theme: 3, template: "keep", stagger: 30,
    params: { colW: 6, colBottom: 15, tiers: 3, wingW: 7 },
    enemies: [g("walker", 2), g("chaser", 1), g("thrower", 2), g("breather", 2), g("bouncer", 2), g("flyer", 1)],
  },
  {
    round: 38, theme: 3, template: "waves",
    params: { base: [20, 12, 5], segW: 6, gap: 3, amp: 2, period: 6, phase: 2 },
    flags: { waterBubbles: true, lightningBubbles: true },
    enemies: [g("walker", 1, 0), g("chaser", 1, 0), g("thrower", 2, 120), g("breather", 2, 120), g("bouncer", 2, 240), g("flyer", 2, 240)],
  },
  {
    round: 39, theme: 3, template: "shafts", stagger: 30,
    params: { bands: 4, spacing: 5, thick: 1, shaftW: 4, at: [6, 22, 14, 3] },
    enemies: [g("walker", 1), g("chaser", 2), g("thrower", 2), g("breather", 2), g("bouncer", 1), g("flyer", 2)],
  },
  {
    round: 40, theme: 3, template: "hand", stagger: 30,
    params: {}, tiles: SPIRES,
    flags: { fireBubbles: true, lightningBubbles: true },
    notes: "milestone and secret-door round: solid floor, the door rests at its centre",
    enemies: [g("walker", 1), g("chaser", 1), g("thrower", 3), g("breather", 2), g("bouncer", 2), g("flyer", 2)],
  },
  {
    round: 41, theme: 4, template: "islands",
    params: { rows: 4, spacing: 5, perRow: 3, w: 6, jitter: 2, gaps: [[13, 18]] },
    drift: [{ kind: "area", col0: 3, col1: 28, row0: 14, row1: 16, dx: -1, dy: 0 }],
    enemies: [g("walker", 1, 0), g("chaser", 1, 0), g("thrower", 2, 150), g("breather", 2, 150), g("bouncer", 2, 300), g("flyer", 2, 300)],
  },
  {
    round: 42, theme: 4, template: "nests", stagger: 30,
    params: { tiers: 3, spacing: 6, nestW: 6, cradleW: 12, rim: 2, lip: 0 },
    enemies: [g("walker", 2), g("chaser", 1), g("thrower", 2), g("breather", 1), g("bouncer", 2), g("flyer", 2)],
  },
  {
    round: 43, theme: 4, template: "lattice",
    params: { rows: 5, spacing: 4, maxD: 12, w: 4, centerW: 6 },
    flags: { fireBubbles: true, waterBubbles: true },
    enemies: [g("walker", 1, 0), g("chaser", 1, 0), g("thrower", 2, 150), g("breather", 3, 150), g("bouncer", 2, 300), g("flyer", 2, 300)],
  },
  {
    round: 44, theme: 4, template: "diamond", stagger: 30,
    params: { cy: 12, step: 5, levels: 2, hx: 13, segW: 4, tip: 6, corners: 0 },
    drift: [{ kind: "ring", col0: 8, col1: 23, row0: 7, row1: 17, clockwise: true, width: 1 }],
    flags: { lightningBubbles: true },
    enemies: [g("walker", 1), g("chaser", 1), g("thrower", 3), g("breather", 2), g("bouncer", 1), g("flyer", 2)],
  },
  {
    round: 45, theme: 4, template: "tunnel",
    params: { thick: 2, openW: 7, stepW: 5, mirror: true, top: false },
    enemies: [g("walker", 1, 0), g("chaser", 1, 0), g("thrower", 3, 150), g("breather", 2, 150), g("bouncer", 2, 300), g("flyer", 2, 300)],
  },
  {
    round: 46, theme: 4, template: "rails", stagger: 30,
    params: { rails: 5, spacing: 4, exit: 5, period: 7, tooth: 2, phase: 0, startSide: 1 },
    flags: { waterBubbles: true, fireBubbles: true },
    enemies: [g("walker", 1), g("chaser", 2), g("thrower", 2), g("breather", 2), g("bouncer", 2), g("flyer", 2)],
  },
  {
    round: 47, theme: 4, template: "slashes",
    params: { lines: [[3, 12, 1, 3], [28, 23, -1, 5]], w: 5, rise: 3, hop: 2 },
    enemies: [g("walker", 1, 0), g("chaser", 1, 0), g("thrower", 2, 150), g("breather", 2, 150), g("bouncer", 2, 300), g("flyer", 2, 300)],
  },
  {
    round: 48, theme: 4, template: "decker", stagger: 30,
    params: { decks: 3, thick: 2, spacing: 5, crown: false, holes: [[0, 4, 5], [0, 24, 5], [1, 10, 5], [2, 18, 5]] },
    enemies: [g("walker", 2), g("chaser", 1), g("thrower", 2), g("breather", 2), g("bouncer", 2), g("flyer", 2)],
  },
  {
    round: 49, theme: 4, template: "moat",
    params: { bank: 5, over: 4, tiers: 5, spacing: 4, shrink: 2, gaps: [[12, 19]] },
    flags: { fireBubbles: true, lightningBubbles: true },
    enemies: [g("walker", 1, 0), g("chaser", 1, 0), g("thrower", 3, 150), g("breather", 2, 150), g("bouncer", 2, 300), g("flyer", 2, 300)],
  },
  {
    round: 50, theme: 4, template: "hand",
    params: {}, tiles: HALL,
    flags: { waterBubbles: true, lightningBubbles: true },
    notes: "finale: moat, bridge, galleries, crown",
    enemies: [g("walker", 1, 0), g("chaser", 1, 0), g("thrower", 3, 150), g("breather", 2, 150), g("bouncer", 2, 300), g("flyer", 2, 300)],
  },
];
