import type { EnemyGroup, PlacedEnemyType, RoundDef } from "../types";
import { handArt } from "./hand";

/**
 * Rounds 76-99: the final stretch before the boss. Counts 10-12 (about 10.6 at the start, 12 from round 85 on), every
 * round mixes all six enemy types and the last ten lean hard on the tough ones. Mixes are written as counts per type
 * ([walker, chaser, thrower, breather, bouncer, flyer]); `deal` spreads them over spawn waves. Themes: 76-80 theme 7,
 * 81-90 theme 8, 91-99 theme 9. Hand-drawn: 80 (saltire), 85 (cloister), 90 (the cage), 99 (the citadel).
 * Flags: even rounds carry two flags in a water+fire, fire+lightning, water+lightning cycle; 79, 85 and 93 carry one.
 */

type Mix = [walker: number, chaser: number, thrower: number, breather: number, bouncer: number, flyer: number];
const TYPES: PlacedEnemyType[] = ["walker", "chaser", "thrower", "breather", "bouncer", "flyer"];

/**
 * Turns a mix into enemy groups. Without `waves` the groups trickle in (one group per type, uniform stagger).
 * With `waves` (distinct delays) the enemies are dealt into that many waves: 'asc' sends the light types first,
 * 'desc' the heavy ones first, 'mixed' deals the types round-robin so every wave is varied.
 */
function deal(mix: Mix, waves?: number[], order: "asc" | "desc" | "mixed" = "asc"): EnemyGroup[] {
  const idx = [0, 1, 2, 3, 4, 5];
  if (!waves) return idx.filter((i) => mix[i]! > 0).map((i) => ({ type: TYPES[i]!, n: mix[i]! }));
  const seq: number[] = [];
  const left: number[] = [...mix];
  if (order === "mixed") {
    const rr = [0, 2, 5, 1, 3, 4];
    while (left.some((v) => v > 0)) {
      for (const i of rr) {
        if (left[i]! > 0) {
          seq.push(i);
          left[i]!--;
        }
      }
    }
  } else {
    for (const i of order === "desc" ? [...idx].reverse() : idx) for (let k = 0; k < mix[i]!; k++) seq.push(i);
  }
  const groups: EnemyGroup[] = [];
  const per = seq.length / waves.length;
  waves.forEach((delay, w) => {
    const chunk = seq.slice(Math.round(w * per), Math.round((w + 1) * per));
    const counts = new Map<number, number>();
    for (const i of chunk) counts.set(i, (counts.get(i) ?? 0) + 1);
    for (const [i, n] of counts) groups.push({ type: TYPES[i]!, n, delayTicks: delay, spread: 0 });
  });
  return groups;
}

/** Row of ledges from absolute column ranges (interior columns 2..29), for hand art. */
const row = (...ranges: [number, number][]): string => {
  const cells = Array<string>(28).fill(".");
  for (const [a, b] of ranges) for (let c = a; c <= b; c++) cells[c - 2] = "#";
  return cells.join("");
};

/** Hand-drawn "saltire" (round 80, milestone): two diagonal staircases of ledges crossing on a wide centre bridge. */
const SALTIRE = handArt([], {
  5: row([2, 7], [24, 29]),
  7: row([12, 19]),
  9: row([8, 13], [18, 23]),
  13: row([13, 18]),
  17: row([8, 13], [18, 23]),
  21: row([2, 7], [24, 29]),
});

/** Expands [fromRow, toRow, art] bands into the per-row map `handArt` takes (later bands overwrite earlier ones). */
const bands = (...list: [number, number, string][]): Record<number, string> => {
  const out: Record<number, string> = {};
  for (const [from, to, art] of list) for (let r = from; r <= to; r++) out[r] = art;
  return out;
};

/**
 * Hand-drawn "cloister" (round 85): two walls with floor-level doors and a doorway at row 13-15 split the field into a
 * hall and two corridors; corridor rungs climb in steps of five rows, the hall has a bridge and two perches.
 */
const WALLS = row([9, 10], [21, 22]);
const CLOISTER = handArt(
  [],
  bands(
    [1, 12, WALLS],
    [6, 6, row([2, 6], [9, 10], [14, 17], [21, 22], [25, 29])],
    [11, 11, row([2, 6], [9, 10], [13, 18], [21, 22], [25, 29])],
    [16, 21, WALLS],
    [16, 16, row([2, 6], [9, 22], [25, 29])],
    [21, 21, row([2, 6], [9, 10], [21, 22], [25, 29])],
  ),
);

/**
 * Hand-drawn "cage" (round 90, milestone): a box of one-way floor and roof on barred ends with a divider hanging from the
 * roof, standing over a centre step; stacked side perches climb to the roof and a crown.
 */
const CAGE = handArt(
  [],
  bands(
    [6, 6, row([2, 6], [12, 19], [25, 29])],
    [11, 11, row([2, 6], [9, 22], [25, 29])],
    [12, 15, row([9, 10], [21, 22])],
    [12, 13, row([9, 10], [15, 16], [21, 22])],
    [16, 16, row([2, 6], [9, 22], [25, 29])],
    [21, 21, row([2, 6], [11, 20], [25, 29])],
  ),
);

/**
 * Hand-drawn "citadel" (round 99, finale): a massive keep with a floor-level archway, side stairs climbing to its top, a
 * crown bridge hung with a chain from the roof and two high wings.
 */
const CITADEL = handArt(
  [],
  bands(
    [1, 4, row([15, 16])],
    [5, 5, row([2, 7], [24, 29])],
    [9, 9, row([10, 21])],
    [14, 25, row([12, 19])],
    [17, 17, row([8, 11], [12, 19], [20, 23])],
    [21, 21, row([2, 7], [24, 29], [12, 19])],
    [22, 25, row([12, 13], [18, 19])],
  ),
);

export const ROUNDS_076_099: RoundDef[] = [
  { round: 76, theme: 7, template: "zipper", params: { n: 5, pitch: 3, w: 9, edge: 2, base: 3, startSide: 0 }, flags: { waterBubbles: true, fireBubbles: true }, enemies: deal([2, 2, 2, 1, 1, 2], [0, 150, 300], "asc") },
  { round: 77, theme: 7, template: "bowl", stagger: 45, params: { steps: 4, stepH: 2, stepW: 3 },
    drift: [{ kind: "ring", col0: 6, col1: 25, row0: 5, row1: 22, clockwise: true, width: 1 }], enemies: deal([2, 1, 2, 2, 2, 2]) },
  { round: 78, theme: 7, template: "chimneys", params: {}, flags: { fireBubbles: true, lightningBubbles: true }, enemies: deal([3, 1, 2, 1, 1, 2], [0, 120], "mixed") },
  { round: 79, theme: 7, template: "scatter", stagger: 30, params: { tiers: 5, spacing: 4, perTier: 3, minW: 4, maxW: 7, thickChance: 0.3, gaps: [[14, 17]] }, flags: { fireBubbles: true }, enemies: deal([1, 3, 2, 2, 1, 2]) },
  { round: 80, theme: 7, template: "hand", params: {}, tiles: SALTIRE, flags: { waterBubbles: true, lightningBubbles: true }, notes: "milestone: the saltire", enemies: deal([2, 1, 3, 2, 1, 2], [0, 120, 240, 360], "asc") },
  { round: 81, theme: 8, template: "fortress", params: {}, enemies: deal([2, 2, 2, 2, 2, 1], [0, 90, 180], "mixed") },
  { round: 82, theme: 8, template: "nests", stagger: 60, params: { tiers: 4, spacing: 5, nestW: 8, cradleW: 10, rim: 2, lip: 2 }, drift: [{ kind: "area", col0: 13, col1: 18, row0: 4, row1: 24, dx: 0, dy: -1 }], flags: { waterBubbles: true, fireBubbles: true }, enemies: deal([3, 1, 2, 2, 1, 2]) },
  { round: 83, theme: 8, template: "shafts", params: { bands: 4, spacing: 5, thick: 2, shaftW: 6, at: [4, 22, 10, 17] }, enemies: deal([1, 2, 3, 2, 2, 2], [0, 150, 300], "desc") },
  { round: 84, theme: 8, template: "splitkeep", params: {}, flags: { fireBubbles: true, lightningBubbles: true }, enemies: deal([1, 2, 2, 2, 2, 2], [0, 200], "asc") },
  { round: 85, theme: 8, template: "hand", params: {}, tiles: CLOISTER, flags: { lightningBubbles: true }, notes: "the cloister", enemies: deal([2, 1, 3, 2, 2, 2], [0, 120, 240, 360], "mixed") },
  { round: 86, theme: 8, template: "waves", stagger: 30, params: { base: [21, 14, 7], segW: 5, gap: 2, amp: 2, period: 9, phase: 1 },
    drift: [{ kind: "area", col0: 3, col1: 28, row0: 16, row1: 19, dx: 1, dy: 0 }],
    flags: { waterBubbles: true, lightningBubbles: true }, enemies: deal([2, 2, 2, 3, 1, 2]) },
  { round: 87, theme: 8, template: "towers", params: { n: 3, towerW: 4, towerH: 4, tiers: 4, ledgeW: 5 }, enemies: deal([2, 1, 2, 3, 2, 2], [0, 120], "desc") },
  { round: 88, theme: 8, template: "tunnel", params: { thick: 2, openW: 6, stepW: 4, mirror: true, top: true }, flags: { waterBubbles: true, fireBubbles: true }, enemies: deal([2, 1, 3, 2, 1, 3], [0, 90, 180], "asc") },
  { round: 89, theme: 8, template: "fangs", params: {}, enemies: deal([1, 2, 2, 3, 2, 2], [0, 150, 300], "mixed") },
  { round: 90, theme: 8, template: "hand", params: {}, tiles: CAGE, flags: { fireBubbles: true, lightningBubbles: true }, notes: "milestone: the cage", enemies: deal([1, 1, 3, 3, 2, 2], [0, 120, 240, 360], "asc") },
  { round: 91, theme: 9, template: "ring", params: { n: 12, rx: 12, ry: 9, cy: 13, segW: 4, island: 8, phase: 0 },
    drift: [{ kind: "ring", col0: 4, col1: 27, row0: 4, row1: 22, clockwise: false, width: 2 }], enemies: deal([1, 1, 2, 3, 3, 2], [0, 200], "mixed") },
  { round: 92, theme: 9, template: "slashes", stagger: 30, params: { lines: [[3, 22, 1, 5], [28, 22, -1, 5]], w: 5, rise: 4, hop: 1 }, flags: { waterBubbles: true, lightningBubbles: true }, enemies: deal([1, 1, 3, 2, 2, 3]) },
  { round: 93, theme: 9, template: "splitkeep", params: { dividerW: 6, hang: 9, moundW: 16, steps: 3, stepH: 2, wingW: 5, wings: [19, 14, 9] }, flags: { waterBubbles: true }, enemies: deal([2, 1, 2, 3, 1, 3], [0, 120], "desc") },
  { round: 94, theme: 9, template: "moat", params: { bank: 8, over: 3, tiers: 5, spacing: 4, shrink: 2 }, flags: { waterBubbles: true, fireBubbles: true }, enemies: deal([1, 1, 3, 3, 1, 3], [0, 90, 180], "asc") },
  { round: 95, theme: 9, template: "brick", stagger: 45, params: { rows: 6, period: 8, seg: 5, spacing: 4, shift: 3 },
    drift: [{ kind: "area", col0: 3, col1: 6, row0: 3, row1: 24, dx: 0, dy: 1 }, { kind: "area", col0: 25, col1: 28, row0: 3, row1: 24, dx: 0, dy: 1 }], enemies: deal([2, 1, 3, 2, 3, 1]) },
  { round: 96, theme: 9, template: "lanterns", params: { clusters: [[10, 18], [21, 18], [15, 12], [6, 8], [25, 8]], capW: 6, wingW: 3, drop: 3, reach: 3, chain: 1, gaps: [[14, 17]] }, flags: { fireBubbles: true, lightningBubbles: true }, enemies: deal([1, 1, 3, 3, 3, 1], [0, 150, 300], "mixed") },
  { round: 97, theme: 9, template: "decker", params: {},
    drift: [{ kind: "area", col0: 3, col1: 28, row0: 7, row1: 9, dx: -1, dy: 0 }], enemies: deal([2, 1, 2, 2, 3, 2], [0, 200], "asc") },
  { round: 98, theme: 9, template: "cross", params: { armW: 18, armRow: 12 }, flags: { waterBubbles: true, lightningBubbles: true }, enemies: deal([2, 1, 3, 3, 2, 1], [0, 120, 240, 360], "desc") },
  { round: 99, theme: 9, template: "hand", params: {}, tiles: CITADEL, notes: "finale: the citadel", enemies: deal([1, 1, 3, 2, 3, 2], [0, 120, 240, 360], "mixed") },
];
