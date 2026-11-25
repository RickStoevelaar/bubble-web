import type { RoundDef } from "../types";
import { handArt } from "./hand";

/**
 * Rounds 1-25: the opening stretch. Round 1 is a gentle three-tier tutorial; enemy types arrive in the order
 * walker (1), chaser (5), thrower (9), breather (13), bouncer (17), flyer (21) and then keep appearing in a mix.
 * Themes: floor((round - 1) / 10). Layout notes sit beside each round.
 */

/** Hand-drawn "cathedral": two nave ledges, flanking chunky towers, a roof ledge (round 12). */
const CATHEDRAL = handArt(
  [[14, 17]],
  {
    6: "........############........",
    11: "..########........########..",
    16: "####...##############...####",
    17: "####....................####",
    21: "....########....########....",
  },
);

/** Hand-drawn "window": long lower ledges, floating chunky blocks, a wide landing and two perches (round 19). */
const WINDOW = handArt(
  [[14, 17]],
  {
    6: ".####..................####.",
    11: "......################......",
    16: "....######........######....",
    17: "....######........######....",
    21: "############....############",
  },
);

/** Hand-drawn "fortress": stepped crown over two floor gaps, hanging blocks in the roof (round 25). */
const FORTRESS = handArt(
  [[8, 10], [21, 23]],
  {
    1: "...##..................##...",
    2: "...##..................##...",
    3: "...##..................##...",
    7: ".........##########.........",
    12: "..######............######..",
    17: "####....############....####",
    22: "...######..........######...",
  },
);

export const ROUNDS_001_025: RoundDef[] = [
  {
    round: 1, theme: 0, template: "tiers",
    params: { tiers: 3, spacing: 5, inset: 3 },
    notes: "tutorial: three wide tiers, nothing but walkers",
    enemies: [{ type: "walker", n: 3 }],
  },
  {
    round: 2, theme: 0, template: "stairs",
    params: { steps: 4, stepW: 10, rise: 4, dir: 1 },
    enemies: [{ type: "walker", n: 3 }],
  },
  {
    round: 3, theme: 0, template: "zigzag",
    params: { count: 4, spacing: 5, ledgeW: 22 },
    enemies: [{ type: "walker", n: 4 }],
  },
  {
    round: 4, theme: 0, template: "islands",
    params: { rows: 3, perRow: 3, w: 7, spacing: 5, jitter: 1 },
    flags: { waterBubbles: true },
    enemies: [{ type: "walker", n: 4 }],
  },
  {
    round: 5, theme: 0, template: "stairs",
    params: { steps: 4, stepW: 6, rise: 4, both: true, gaps: [[14, 17]] },
    notes: "first chaser",
    enemies: [{ type: "walker", n: 4 }, { type: "chaser", n: 1 }],
  },
  {
    round: 6, theme: 0, template: "bowl",
    params: {},
    enemies: [{ type: "walker", n: 3 }, { type: "chaser", n: 2 }],
  },
  {
    round: 7, theme: 0, template: "decker",
    params: { decks: 2 },
    enemies: [{ type: "walker", n: 4 }, { type: "chaser", n: 1 }],
  },
  {
    round: 8, theme: 0, template: "lattice",
    params: {},
    flags: { fireBubbles: true },
    enemies: [{ type: "walker", n: 3 }, { type: "chaser", n: 2 }],
  },
  {
    round: 9, theme: 0, template: "towers",
    params: {},
    notes: "first thrower",
    enemies: [{ type: "walker", n: 2 }, { type: "chaser", n: 1 }, { type: "thrower", n: 2 }],
  },
  {
    round: 10, theme: 0, template: "waves",
    params: {},
    flags: { waterBubbles: true },
    enemies: [{ type: "walker", n: 3 }, { type: "chaser", n: 2 }, { type: "thrower", n: 1 }],
  },
  {
    round: 11, theme: 1, template: "pyramid",
    params: {},
    enemies: [{ type: "walker", n: 4 }, { type: "chaser", n: 2 }],
  },
  {
    round: 12, theme: 1, template: "hand",
    params: {}, tiles: CATHEDRAL,
    flags: { lightningBubbles: true },
    enemies: [{ type: "walker", n: 2 }, { type: "chaser", n: 2 }, { type: "thrower", n: 2 }],
  },
  {
    round: 13, theme: 1, template: "brick",
    stagger: 30,
    params: {},
    notes: "first breather",
    enemies: [{ type: "walker", n: 2 }, { type: "chaser", n: 1 }, { type: "thrower", n: 2 }, { type: "breather", n: 1 }],
  },
  {
    round: 14, theme: 1, template: "keep",
    stagger: 30,
    params: {},
    enemies: [{ type: "walker", n: 3 }, { type: "chaser", n: 1 }, { type: "thrower", n: 1 }, { type: "breather", n: 2 }],
  },
  {
    round: 15, theme: 1, template: "comb",
    stagger: 30,
    params: {},
    flags: { fireBubbles: true },
    enemies: [{ type: "walker", n: 3 }, { type: "chaser", n: 2 }, { type: "breather", n: 1 }],
  },
  {
    round: 16, theme: 1, template: "scatter",
    stagger: 30,
    params: {},
    flags: { waterBubbles: true },
    enemies: [{ type: "walker", n: 2 }, { type: "chaser", n: 2 }, { type: "thrower", n: 1 }, { type: "breather", n: 2 }],
  },
  {
    round: 17, theme: 1, template: "tunnel",
    stagger: 30,
    params: {},
    notes: "first bouncer",
    enemies: [{ type: "walker", n: 2 }, { type: "chaser", n: 1 }, { type: "thrower", n: 1 }, { type: "breather", n: 1 }, { type: "bouncer", n: 2 }],
  },
  {
    round: 18, theme: 1, template: "ring",
    stagger: 30,
    params: {},
    drift: [{ kind: "ring", col0: 6, col1: 25, row0: 8, row1: 20, clockwise: true, width: 1 }],
    enemies: [{ type: "walker", n: 3 }, { type: "chaser", n: 1 }, { type: "thrower", n: 1 }, { type: "bouncer", n: 2 }],
  },
  {
    round: 19, theme: 1, template: "hand",
    stagger: 30,
    params: {}, tiles: WINDOW,
    enemies: [{ type: "walker", n: 2 }, { type: "chaser", n: 2 }, { type: "thrower", n: 1 }, { type: "breather", n: 1 }, { type: "bouncer", n: 2 }],
  },
  {
    round: 20, theme: 1, template: "islands",
    stagger: 30,
    params: { rows: 4, perRow: 4, w: 4, spacing: 5, jitter: 1 },
    notes: "secret-door round: the door sits on the floor tile nearest the centre",
    flags: { lightningBubbles: true },
    enemies: [{ type: "walker", n: 3 }, { type: "chaser", n: 2 }, { type: "breather", n: 1 }, { type: "bouncer", n: 1 }],
  },
  {
    round: 21, theme: 2, template: "tiers",
    stagger: 30,
    params: { tiers: 4, spacing: 5, inset: 6, hole: 6 },
    drift: [{ kind: "area", col0: 14, col1: 17, row0: 3, row1: 24, dx: 0, dy: -1 }],
    notes: "first flyer; updraft through the middle",
    enemies: [{ type: "walker", n: 2 }, { type: "chaser", n: 2 }, { type: "thrower", n: 1 }, { type: "bouncer", n: 1 }, { type: "flyer", n: 2 }],
  },
  {
    round: 22, theme: 2, template: "zigzag",
    stagger: 30,
    params: { count: 5, spacing: 4, ledgeW: 18, startSide: 1 },
    flags: { waterBubbles: true, fireBubbles: true },
    enemies: [{ type: "walker", n: 2 }, { type: "chaser", n: 1 }, { type: "thrower", n: 2 }, { type: "breather", n: 1 }, { type: "flyer", n: 2 }],
  },
  {
    round: 23, theme: 2, template: "waves",
    stagger: 30,
    params: { base: [21, 14, 7], amp: 2, period: 5, segW: 5, gap: 2 },
    enemies: [{ type: "walker", n: 3 }, { type: "chaser", n: 2 }, { type: "breather", n: 1 }, { type: "bouncer", n: 1 }, { type: "flyer", n: 1 }],
  },
  {
    round: 24, theme: 2, template: "lattice",
    stagger: 30,
    params: { maxD: 9, w: 6, gaps: [[14, 17]] },
    enemies: [{ type: "walker", n: 2 }, { type: "chaser", n: 2 }, { type: "thrower", n: 1 }, { type: "breather", n: 1 }, { type: "bouncer", n: 1 }, { type: "flyer", n: 2 }],
  },
  {
    round: 25, theme: 2, template: "hand",
    stagger: 30,
    params: {}, tiles: FORTRESS,
    enemies: [{ type: "walker", n: 2 }, { type: "chaser", n: 1 }, { type: "thrower", n: 1 }, { type: "breather", n: 1 }, { type: "bouncer", n: 1 }, { type: "flyer", n: 2 }],
  },
];
