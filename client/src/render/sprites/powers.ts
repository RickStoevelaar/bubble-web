import { sym, withRows } from "./grid";
import type { PowerName, SpriteDef } from "./names";

/* Ten power-up item sprites, 16x16 each. Every one has a dark outline and its own silhouette:
   winged boots (two boots with wings), tonic bottles (stopper differs), parasols (canopy width
   8/12/16), a gold ring with a sparkle, a bolt in a violet orb, and a round flask of swirling water. */

/** One boot per 8-column half, both facing right; a feathered wing rises from each cuff. */
const BOOT_HALF = [
  "..W.....",
  ".WWW....",
  "WWWwW...",
  "WWwwKK..",
  ".KKKK...",
  ".KYYK...",
  ".KBBK...",
  ".KBBK...",
  ".KBbK...",
  ".KBBKKK.",
  ".KBBBBBK",
  ".KBBBBBK",
  ".KSSSSSK",
  ".KKKKKKK",
  "........",
  "........",
];
const boots = BOOT_HALF.map((r) => r + r);

/** Bottle body shared by the three tonics; `top` replaces rows 1..4 (left halves) with the stopper. */
const BOTTLE_BODY = [
  ".....KGG", // 5 neck
  ".....KGL",
  "...KKKGL", // 7 shoulder
  "..KGGLLL",
  ".KGLLLLL",
  ".KGLhLLL",
  ".KGLhLLL",
  ".KGLLLLl",
  "..KGLLll",
  "...KKKKK",
];
function tonic(top: string[]): string[] {
  return sym(["........", ...top, ...BOTTLE_BODY, "........"]);
}
const tonicA = tonic(["........", "....KKKK", "....KCCC", "....KKKK"]); // flat cork
const tonicB = tonic(["......KK", ".....KSS", ".....KSS", "......KK"]); // round ball stopper
const tonicC = tonic([".......K", "......KC", ".....KCC", "....KKKK"]); // pointed cap

/** Parasol: a canopy (half rows, mirrored) over a two-pixel handle ending in a hook that curls left. */
function parasol(canopy: Record<number, string>, handleEnd: number): string[] {
  const out = sym(Array.from({ length: 16 }, (_, y) => canopy[y] ?? "........"));
  for (let y = 9; y <= handleEnd; y++) out[y] = ".......HH.......";
  out[handleEnd + 1] = "......HHH.......";
  out[handleEnd + 2] = "......H.........";
  return out;
}
const parasolS = parasol({ 3: "......KK", 4: ".....KOO", 5: "....KOhO", 6: "....KOoO", 7: "....KOoO", 8: "....KKOK" }, 12);
const parasolM = parasol({ 2: "......KK", 3: "....KKOO", 4: "...KOOhO", 5: "..KOOOoO", 6: "..KOOOoO", 7: "..KOOOoO", 8: "..KKOKOK" }, 12);
const parasolL = parasol(
  { 1: "......KK", 2: "....KKOO", 3: "..KKOOOh", 4: ".KOOOOhO", 5: ".KOOOooO", 6: "KOOOoOOo", 7: "KOOoOOoO", 8: "KKOKOKOK" },
  12,
);

/** Squared-distance helper for the two procedural shapes. */
const d2 = (x: number, y: number, cx: number, cy: number): number => (x - cx) * (x - cx) + (y - cy) * (y - cy);

function build(fn: (x: number, y: number) => string): string[] {
  return Array.from({ length: 16 }, (_, y) => Array.from({ length: 16 }, (_, x) => fn(x, y)).join(""));
}

const ring = withSparkle(
  build((x, y) => {
    const d = d2(x, y, 7, 9);
    if (d > 38) return ".";
    if (d > 28) return "K";
    if (d > 14) return x + y > 17 ? "g" : "G";
    if (d > 8) return "K";
    return ".";
  }),
);

function withSparkle(g: string[]): string[] {
  const put = (rows: string[], x: number, y: number, ch: string) => {
    rows[y] = rows[y]!.slice(0, x) + ch + rows[y]!.slice(x + 1);
  };
  const rows = [...g];
  for (const [x, y, ch] of [
    [13, 1, "h"], [13, 2, "h"], [13, 3, "W"], [13, 4, "h"], [13, 5, "h"],
    [11, 3, "h"], [12, 3, "h"], [14, 3, "h"], [15, 3, "h"],
  ] as const) {
    put(rows, x, y, ch);
  }
  return rows;
}

const BOLT: Record<number, [number, number]> = {
  2: [8, 10], 3: [7, 9], 4: [6, 8], 5: [5, 10], 6: [8, 10], 7: [7, 9], 8: [6, 8], 9: [5, 7], 10: [4, 6], 11: [4, 5],
};
const spark = build((x, y) => {
  const d = d2(x, y, 7.5, 7.5);
  const b = BOLT[y];
  if (b && x >= b[0] && x <= b[1] && d <= 50) return x === b[0] || y === 5 ? "Y" : "W";
  if (d > 56) return ".";
  if (d > 46) return "K";
  if (x + y > 17) return "v";
  if (x + y < 10) return "L";
  return "V";
});

const flask = build((x, y) => {
  const neck = x >= 6 && x <= 9 && y >= 1 && y <= 5;
  const d = d2(x, y, 7.5, 10);
  const body = d <= 31;
  if (!body && !neck) return ".";
  const edge = y === 1 || (neck && !body && (x === 6 || x === 9)) || (body && d > 24);
  if (edge) return "K";
  if (body && y >= 9) {
    // swirling water: pale diagonal ripples and a crest line across the dark water
    return (x * 2 + y * 3) % 7 === 0 || (y === 12 && x >= 5 && x <= 9) ? "w" : "A";
  }
  if (body && y === 8) return "w";
  return "G";
});

export function powerDefs(): Record<PowerName, SpriteDef> {
  const c = "char" as const;
  const outline = "#2a1a3a";
  const parasolPalette = (O: string, o: string, h: string, K: string) => ({ O, o, h, K, H: "#7a4a20" });
  const tonicPalette = (L: string, l: string, h: string, S: string) => ({ K: "#2a2a44", G: "#e6f0ff", L, l, h, C: "#b9824a", S });
  return {
    power_boots: { cls: c, palette: { K: outline, B: "#4fcf6a", b: "#2f9a48", Y: "#ffd23f", S: "#8a5a2a", W: "#ffffff", w: "#b8d4ff" }, frames: [boots] },
    power_tonic_a: { cls: c, palette: tonicPalette("#ff5fa2", "#c02a74", "#ffc2dc", "#b9824a"), frames: [tonicA] },
    power_tonic_b: { cls: c, palette: tonicPalette("#3fd8e8", "#1f9ab0", "#c9f6ff", "#d8e0ea"), frames: [tonicB] },
    power_tonic_c: { cls: c, palette: tonicPalette("#ffb02e", "#c47a10", "#ffe6a8", "#8a5a2a"), frames: [tonicC] },
    power_parasol_s: { cls: c, palette: parasolPalette("#ff9a2e", "#d86a10", "#ffd09a", "#5a2a08"), frames: [parasolS] },
    power_parasol_m: { cls: c, palette: parasolPalette("#e8283c", "#a8142a", "#ff9aa6", "#4a0a14"), frames: [parasolM] },
    power_parasol_l: { cls: c, palette: parasolPalette("#9a5af0", "#6a32b8", "#d6b8ff", "#2a1050"), frames: [parasolL] },
    power_ring: { cls: c, palette: { K: "#5a3a08", G: "#ffd23f", g: "#c8921a", h: "#ffffff", W: "#ffffff" }, frames: [ring] },
    power_spark: { cls: c, palette: { K: "#1e0a4a", V: "#7a3cf0", v: "#4a1ea8", L: "#a88af8", Y: "#ffd23f", W: "#fffbe0" }, frames: [spark] },
    power_flask: { cls: c, palette: { K: "#1c3a5a", G: "#e6f4ff", A: "#2f7fff", w: "#bfe4ff" }, frames: [flask] },
  };
}
