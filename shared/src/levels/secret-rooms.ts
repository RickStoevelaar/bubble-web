import { GRID_H, GRID_W } from "../constants";
import type { LevelData } from "../level";
import type { GameState } from "../types";

/** A treasure room: its layout, the word its walls spell, its code fragment and where the two players appear. */
export interface SecretRoom {
  level: LevelData;
  word: "PIP" | "POP" | "WEB";
  /** Two characters (A-Z / 0-9) shown in the room; a later task combines the three into the Super-mode code. */
  fragment: string;
  /** The empty tile each player (by id) stands in: the body is centered on the tile and rests on the solid tile below. */
  spawn: [{ col: number; row: number }, { col: number; row: number }];
}

/** Block letters, 9 rows tall, strokes 1-2 tiles thick. Every row of one letter has the same width. */
const GLYPHS: Record<string, string[]> = {
  P: ["#####.", "#####.", "##..##", "##..##", "#####.", "#####.", "##....", "##....", "##...."],
  I: ["######", "######", "..##..", "..##..", "..##..", "..##..", "..##..", "######", "######"],
  O: ["######", "######", "##..##", "##..##", "##..##", "##..##", "##..##", "######", "######"],
  W: ["##...##", "##...##", "##...##", "##...##", "##.#.##", "##.#.##", "##.#.##", "##.#.##", "#######"],
  E: ["#####", "#####", "##...", "##...", "####.", "##...", "##...", "#####", "#####"],
  B: ["#####.", "#####.", "##..##", "##..##", "#####.", "##..##", "##..##", "#####.", "#####."],
};

/** Rows 17..25 hold the letters (they stand on the floor, rows 26-27); the first letter starts at column 5. */
const LETTER_TOP = 17;
const FIRST_COL = 5;
const LETTER_GAP = 2;
/** Stepping ledges: 2 tiles wide in each side margin, one tile clear of the letters, so every letter top is within a jump of the one below. */
const LEDGE_ROWS = [22, 18];

function buildRoom(word: string, theme: number): LevelData {
  const grid: string[][] = Array.from({ length: GRID_H }, (_, y) =>
    Array.from({ length: GRID_W }, (_, x) => (y === 0 || y >= GRID_H - 2 || x < 2 || x >= GRID_W - 2 ? "#" : ".")),
  );
  let col = FIRST_COL;
  for (const ch of word) {
    const g = GLYPHS[ch]!;
    g.forEach((line, r) => {
      for (let c = 0; c < line.length; c++) if (line[c] === "#") grid[LETTER_TOP + r]![col + c] = "#";
    });
    col += g[0]!.length + LETTER_GAP;
  }
  for (const row of LEDGE_ROWS) {
    for (const c of [2, 3, GRID_W - 4, GRID_W - 3]) grid[row]![c] = "#";
  }
  return { round: 0, theme, tiles: grid.map((r) => r.join("")), enemies: [], drift: [] };
}

const SPAWN: SecretRoom["spawn"] = [
  { col: 3, row: GRID_H - 3 },
  { col: GRID_W - 4, row: GRID_H - 3 },
];

/** The three treasure rooms, in door order (rounds 20, 30, 40). */
export const SECRET_ROOMS: readonly [SecretRoom, SecretRoom, SecretRoom] = [
  { level: buildRoom("PIP", 3), word: "PIP", fragment: "7K", spawn: SPAWN },
  { level: buildRoom("POP", 6), word: "POP", fragment: "Q3", spawn: SPAWN },
  { level: buildRoom("WEB", 9), word: "WEB", fragment: "Z8", spawn: SPAWN },
];

/** The three fragments in room order; a later task combines them into the Super-mode code. */
export const SECRET_CODE_FRAGMENTS: readonly [string, string, string] = [
  SECRET_ROOMS[0].fragment,
  SECRET_ROOMS[1].fragment,
  SECRET_ROOMS[2].fragment,
];

/**
 * The layout a state is played on: the secret room while inside one, otherwise the round's level (an
 * out-of-range round falls back to the first). The one level lookup shared by the sim and the client.
 */
export function levelForState(levels: readonly LevelData[], state: Pick<GameState, "round" | "secret">): LevelData {
  const room = state.secret ? SECRET_ROOMS[state.secret.index] : undefined;
  return room ? room.level : (levels[state.round - 1] ?? levels[0]!);
}
