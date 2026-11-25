import { GRID_H, GRID_W } from "../constants";
import type { LevelData } from "../level";

/**
 * The final boss arena (round 100): border walls (columns 0-1 and 30-31), a solid two-row floor, no ceiling, and
 * three one-tile ledges to dodge on. Every ledge is a 5-tile hop above the surface below it (a jump gains about
 * 6.75 tiles) and a one-way platform, so a player can always drop back down: no spot is a trap.
 */
const LEDGES: readonly { row: number; from: number; to: number }[] = [
  { row: 21, from: 4, to: 10 },
  { row: 21, from: 21, to: 27 },
  { row: 16, from: 12, to: 19 },
];

const tiles = Array.from({ length: GRID_H }, (_, y) =>
  Array.from({ length: GRID_W }, (_, x) => {
    if (x < 2 || x >= GRID_W - 2 || y >= GRID_H - 2) return "#";
    return LEDGES.some((l) => l.row === y && x >= l.from && x <= l.to) ? "#" : ".";
  }).join(""),
);

export const BOSS_ARENA: LevelData = {
  round: 100,
  theme: 11,
  tiles,
  enemies: [{ type: "boss", col: 15, row: 8, delayTicks: 0 }],
  drift: [],
};
