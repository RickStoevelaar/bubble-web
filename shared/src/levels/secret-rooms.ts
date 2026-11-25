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

/** Rows 17..25 hold the letters (they stand on the floor, rows 26-27). */
const LETTER_TOP = 17;
/** One empty slit column (too narrow to enter) on each side, then the letters with CHANNEL-wide channels between them. */
const FIRST_COL = 3;
const CHANNEL = 4;
/**
 * Each channel gets two single-tile stepping ledges on opposite sides, leaving a 2-tile-wide lane between them so a
 * player can always drop back down to the floor (a ledge that spans a channel would trap whoever stands on it).
 * The first ledge is 4 tiles above the floor and the second 3 tiles higher, so every letter top is within a jump.
 */
const LOW_LEDGE_ROW = 22;
const HIGH_LEDGE_ROW = 19;

function buildRoom(word: string, theme: number): { level: LevelData; channels: number[] } {
  const grid: string[][] = Array.from({ length: GRID_H }, (_, y) =>
    Array.from({ length: GRID_W }, (_, x) => (y === 0 || y >= GRID_H - 2 || x < 2 || x >= GRID_W - 2 ? "#" : ".")),
  );
  let col = FIRST_COL;
  const channels: number[] = [];
  [...word].forEach((ch, i) => {
    const g = GLYPHS[ch]!;
    g.forEach((line, r) => {
      for (let c = 0; c < line.length; c++) if (line[c] === "#") grid[LETTER_TOP + r]![col + c] = "#";
    });
    col += g[0]!.length;
    if (i < word.length - 1) {
      channels.push(col);
      const left = i % 2 === 0;
      grid[LOW_LEDGE_ROW]![left ? col : col + CHANNEL - 1] = "#";
      grid[HIGH_LEDGE_ROW]![left ? col + CHANNEL - 1 : col] = "#";
      col += CHANNEL;
    }
  });
  return { level: { round: 0, theme, tiles: grid.map((r) => r.join("")), enemies: [], drift: [] }, channels };
}

const PIP = buildRoom("PIP", 3);
const POP = buildRoom("POP", 6);
const WEB = buildRoom("WEB", 9);

/** Players start on the floor in the lane of each channel (one per channel). */
const spawnsOf = (channels: number[]): SecretRoom["spawn"] => [
  { col: channels[0]! + 1, row: GRID_H - 3 },
  { col: channels[1]! + 2, row: GRID_H - 3 },
];

/** The three treasure rooms, in door order (rounds 20, 30, 40). */
export const SECRET_ROOMS: readonly [SecretRoom, SecretRoom, SecretRoom] = [
  { level: PIP.level, word: "PIP", fragment: "7K", spawn: spawnsOf(PIP.channels) },
  { level: POP.level, word: "POP", fragment: "Q3", spawn: spawnsOf(POP.channels) },
  { level: WEB.level, word: "WEB", fragment: "Z8", spawn: spawnsOf(WEB.channels) },
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
