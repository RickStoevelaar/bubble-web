import { GLYPHS_5X7 } from "./font";
import { sym } from "./grid";
import type { BubbleName, ItemName, SpriteDef, TileName } from "./names";

/* ------------------------------------------------------------------ bubbles */

/** A 16x16 soap-bubble ring with a glint; `mark` is an optional 5x7 emblem. */
function bubbleGrid(mark?: string[], alt = false): string[] {
  const rows: string[][] = [];
  for (let y = 0; y < 16; y++) {
    const row: string[] = [];
    for (let x = 0; x < 16; x++) {
      const d = Math.hypot(x - 7.5, y - 7.5);
      row.push(d > 7.9 ? "." : d > 6.6 ? "O" : "F");
    }
    rows.push(row);
  }
  {
    const spots = alt ? ([[11, 11], [10, 12], [12, 10]] as const) : ([[4, 4], [5, 3], [4, 5]] as const);
    for (const [x, y] of spots) {
      rows[y]![x] = "H";
    }
  }
  if (mark) {
    mark.forEach((line, my) => {
      [...line].forEach((ch, mx) => {
        if (ch === "#") rows[4 + my]![5 + mx] = "W";
      });
    });
  }
  return rows.map((r) => r.join(""));
}

const BUBBLE_MARKS = {
  water: [".....", "..#..", "..#..", ".###.", "#####", "#####", ".###."],
  fire: ["..#..", ".##..", ".###.", "#####", "#####", "#####", ".###."],
  lightning: ["...##", "..##.", ".##..", "#####", "..##.", ".##..", ".#..."],
};

const bubblePal = (o: string, f: string, w = "#ffffff"): Record<string, string> => ({
  O: o,
  F: f,
  H: "#ffffff",
  W: w,
});

export function bubbleDefs(): Record<BubbleName, SpriteDef> {
  const two = (mark?: string[]) => [bubbleGrid(mark), bubbleGrid(mark, true)];
  const letters = (["E", "X", "T", "E", "N", "D"] as const).map((ch) => bubbleGrid(GLYPHS_5X7[ch]));
  return {
    bubble_normal: { cls: "char", palette: bubblePal("#bfe9ff", "rgba(150,210,255,0.32)"), frames: two() },
    bubble_water: { cls: "char", palette: bubblePal("#4aa8ff", "rgba(60,140,255,0.40)", "#e8f6ff"), frames: two(BUBBLE_MARKS.water) },
    bubble_fire: { cls: "char", palette: bubblePal("#ff8a3a", "rgba(255,120,40,0.40)", "#fff2a8"), frames: two(BUBBLE_MARKS.fire) },
    bubble_lightning: { cls: "char", palette: bubblePal("#ffe34a", "rgba(255,230,80,0.35)", "#fffbd0"), frames: two(BUBBLE_MARKS.lightning) },
    bubble_letter: { cls: "char", palette: bubblePal("#d8a0ff", "rgba(200,140,255,0.45)", "#ffffff"), frames: letters },
  };
}

/* -------------------------------------------------------------------- items */

const plum = sym([
  "........",
  "......sl",
  "...KKKKs",
  "..KPPPPP",
  ".KPPhPPP",
  ".KPhPPPP",
  "KPPPPPPP",
  "KPPPPPPP",
  "KPPPPPPp",
  "KPPPPPpp",
  ".KPPPPpp",
  ".KPPPppp",
  "..KKPPpp",
  "....KKKK",
  "........",
  "........",
]);
const cake = sym([
  "........",
  ".......R",
  "......RR",
  ".....KKK",
  "...KKFFF",
  "..KFFFFF",
  "..KFSFSF",
  ".KFFFFFF",
  ".KKKKKKK",
  ".KWwWwWw",
  "..KWwWwW",
  "..KWwWwW",
  "..KWwWwW",
  "...KKKKK",
  "........",
  "........",
]);
const gem = sym([
  "........",
  "........",
  "...KKKKK",
  "..KhhAAA",
  ".KhAAAAA",
  "KKKKKKKK",
  "KhAAAaaa",
  ".KhAAaaa",
  ".KhAAaaa",
  "..KhAaaa",
  "...KhAaa",
  "....KhAa",
  ".....KKA",
  "......KK",
  "........",
  "........",
]);
const crown = sym([
  "........",
  "........",
  "Y..Y..YY",
  "YY.YY.YY",
  "YYYYYYYY",
  "YyYYYYYY",
  "YYYRYYYB",
  "YYYYYYYY",
  "KKKKKKKK",
  "........",
  "........",
  "........",
  "........",
  "........",
  "........",
  "........",
]);
const fish = [
  "................",
  "................",
  "................",
  "................",
  "....KKKKK.......",
  "..K.KBBBBKK.....",
  ".KKKBBBBBBBK....",
  "KBBKBbBBBBBBK...",
  "KBBBBBbBBBEPBK..",
  "KBBKBBBBBBBBKK..",
  ".KKKBbBBBBBK....",
  "..K.KBBBBKK.....",
  "....KKKKK.......",
  "................",
  "................",
  "................",
];
const pear = sym([
  "........",
  ".......s",
  "......KK",
  ".....KPP",
  ".....KPP",
  "....KPhP",
  "....KPPP",
  "...KPPPP",
  "..KPhPPP",
  ".KPPPPPP",
  ".KPPPPpp",
  ".KPPPppp",
  "..KPPppp",
  "...KKKKK",
  "........",
  "........",
]);
const potion = sym([
  "........",
  "......CC",
  "......KK",
  ".....KGG",
  ".....KGG",
  "....KGGG",
  "...KGLLL",
  "..KGLLLL",
  ".KGLLLLL",
  ".KGLLhLL",
  ".KGLLLLL",
  ".KGLLLLl",
  "..KGLLLL",
  "...KKKKK",
  "........",
  "........",
]);
const star = sym([
  "........",
  ".......Y",
  ".......Y",
  "......YY",
  "KKKKKYYY",
  ".YYYYYYY",
  "..YYYYYh",
  "...YYYYY",
  "...YYYYY",
  "..YYYYYY",
  "..YYKKYY",
  ".YYK...K",
  ".YK.....",
  "........",
  "........",
  "........",
]);

export function itemDefs(): Record<ItemName, SpriteDef> {
  const c = "char" as const;
  return {
    item_plum: { cls: c, palette: { K: "#2a1040", P: "#7a3fc0", p: "#55288f", h: "#c79cf2", s: "#6b4a20", l: "#4fbf5a" }, frames: [plum] },
    item_cake: { cls: c, palette: { K: "#4a2230", F: "#ffc2dc", S: "#7ad0ff", R: "#e8283c", W: "#ffd37a", w: "#e9a64a" }, frames: [cake] },
    item_gem: { cls: c, palette: { K: "#0c2a40", A: "#34d0f0", a: "#1a8fc0", h: "#c9f6ff" }, frames: [gem] },
    item_crown: { cls: c, palette: { Y: "#ffd23f", y: "#c8921a", R: "#e8283c", B: "#3a8cff", K: "#6a4410" }, frames: [crown] },
    item_fish: { cls: c, palette: { K: "#1a3040", B: "#ff9a4a", b: "#ffd08a", E: "#ffffff", P: "#1a1020" }, frames: [fish] },
    item_pear: { cls: c, palette: { K: "#3a4a10", P: "#c8e05a", p: "#97b83a", h: "#f2ffb0", s: "#6b4a20" }, frames: [pear] },
    item_potion: { cls: c, palette: { K: "#2a2a44", G: "#dbe9ff", L: "#ff4f8a", l: "#c02a64", h: "#ffc2da", C: "#b9824a" }, frames: [potion] },
    item_star: { cls: c, palette: { K: "#7a5a10", Y: "#ffe45c", h: "#fff8c0" }, frames: [star] },
  };
}

/* -------------------------------------------------------------------- tiles */

const stripes = Array.from({ length: 8 }, (_, y) =>
  Array.from({ length: 8 }, (_, x) => "abcb"[(x + y) % 4]).join(""),
);

/** Ten wall themes: palette + 8x8 pattern (a = base, b = second tone, c = highlight, d = shadow). */
const TILES: { palette: Record<string, string>; grid: string[] }[] = [
  {
    // 0: mossy brick
    palette: { a: "#8a5a44", b: "#4a3028", m: "#5f9a4a" },
    grid: ["bbbbbbbb", "aaabaaam", "aamabaaa", "aaabaaaa", "bbbbbbbb", "aaaaaaab", "maaaaaab", "aaaamaab"],
  },
  {
    // 1: ice blocks
    palette: { a: "#bfe6ff", b: "#6aa6d8", c: "#ffffff" },
    grid: ["cccccccc", "caaaaaab", "caacaaab", "caaacaab", "caaaaaab", "caaaaacb", "caaaaaab", "bbbbbbbb"],
  },
  {
    // 2: sandstone strata
    palette: { a: "#e6c88a", b: "#b8905a", c: "#f7e6b8" },
    grid: ["aaaaaaaa", "aaacaaaa", "bbbaabbb", "aaaaaaca", "aaaaaaaa", "acaaaaaa", "bbaabbbb", "aaaaaaaa"],
  },
  {
    // 3: circuit board
    palette: { a: "#10301f", b: "#2fbf7a", c: "#b8ffd8" },
    grid: ["aaaaaaaa", "acbbbbba", "aaaaaaba", "bbbbabca", "aaaaabaa", "abcbbbaa", "abaaaaaa", "abbbbbcb"],
  },
  {
    // 4: honeycomb
    palette: { a: "#5a3400", b: "#e0a020", c: "#ffd860" },
    grid: ["aabbbbaa", "abccccba", "bccccccb", "bccccccb", "abccccba", "aabbbbaa", "aaaaaaaa", "aaaaaaaa"],
  },
  {
    // 5: fish scales
    palette: { a: "#1f6f7a", b: "#35b0b8", c: "#9ff0e8", d: "#124650" },
    grid: ["dccccccd", "cbbbbbbc", "bbaaaabb", "bddddddb", "ccbbbbcc", "cbaaaabc", "baddddab", "dbbbbbbd"],
  },
  {
    // 6: cracked obsidian
    palette: { a: "#241830", b: "#3c2a52", c: "#ff6a2a" },
    grid: ["aaaaabaa", "abaaacaa", "aaaacaaa", "aabcaaba", "aaacaaaa", "baaaccaa", "aaabaacc", "abaaaaaa"],
  },
  {
    // 7: wooden planks
    palette: { a: "#b87a3a", b: "#8a5528", c: "#d9a064", d: "#3a2210" },
    grid: ["abbbabbb", "abcbabbb", "abbbabcb", "abbbabbb", "abbcabbb", "abbbabbc", "adbbabdb", "abbbabbb"],
  },
  {
    // 8: candy stripes
    palette: { a: "#ff6fa8", b: "#ffffff", c: "#7fd8ff" },
    grid: stripes,
  },
  {
    // 9: moonrock with stars
    palette: { a: "#2a3060", b: "#3c4488", c: "#f4f0b0" },
    grid: ["aaaaaaaa", "aacaabaa", "abbaaaaa", "aaaabbaa", "aaaaaaca", "abaaaaaa", "aabbaaba", "acaaaaaa"],
  },
];

export function tileDefs(): Record<TileName, SpriteDef> {
  const out = {} as Record<TileName, SpriteDef>;
  TILES.forEach((t, i) => {
    out[`tile_${i}` as TileName] = { cls: "tile", palette: t.palette, frames: [t.grid] };
  });
  return out;
}

/** Background fill behind the walls for each theme. */
export const THEME_BG: readonly string[] = [
  "#0c0a16",
  "#0a1424",
  "#1a1208",
  "#04100a",
  "#140c02",
  "#04161a",
  "#120a14",
  "#140c06",
  "#1a0a16",
  "#06081a",
];
