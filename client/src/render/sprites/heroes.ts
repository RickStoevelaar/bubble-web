import { mapChars, rotate90, withRows } from "./grid";
import type { IconName, SpriteDef } from "./names";

/*
 * Pip and Pop: chubby newts facing right, with a head crest, three feathery
 * gill fronds (g/G) trailing from each side of the head, and a curled tail
 * at the left.  Chars: K outline, B back, L belly, d belly mark, C crest,
 * T tail tip, G/g gill, E eye white, P pupil, m snout, o open mouth.
 */
const WALK_0 = [
  "................",
  ".........C.C.C..",
  "........CcCcCcC.",
  ".......KBBBBBBK.",
  "....gG.KBBEPBBBK",
  "...gGG.KBBBBBBmK",
  "KTK.gGKBBBBBBKK.",
  "KBKKKKLLLLLLKK..",
  ".KBBBKLLdLLLLK..",
  "KBBBBKLLdLLLLK..",
  "KBBBBBKLLLLLLK..",
  ".KBBBBBKLLLLK...",
  "..KBBBBBBBBBK...",
  "...KKBBKKBBKK...",
  "....KK..KK......",
  "................",
];

const WALK_1 = withRows(WALK_0, {
  13: "...KBBKKKKBBK...",
  14: "...KK......KK...",
});
const JUMP = withRows(WALK_0, {
  4: "....gG.KBBPEBBBK",
  13: "....KKBBBBKK....",
  14: "................",
});
const FALL = withRows(WALK_0, {
  13: "..KBBK....KBBK..",
  14: "..KK........KK..",
});
const BLOW = withRows(WALK_0, {
  5: "...gGG.KBBBBoomK",
  6: "KTK.gGKBBBBBoKK.",
});

const PIP_PALETTE: Record<string, string> = {
  K: "#0f3b3f",
  B: "#33c9b1",
  L: "#d9fff1",
  d: "#7fe0c8",
  C: "#ff7a68",
  c: "#c9463a",
  T: "#ff7a68",
  G: "#ffb8a8",
  g: "#ff7a68",
  E: "#ffffff",
  P: "#0f2a30",
  m: "#ff9bb0",
  o: "#4a1424",
};
const POP_PALETTE: Record<string, string> = {
  ...PIP_PALETTE,
  K: "#2b1a52",
  B: "#8b66d6",
  L: "#f1e8ff",
  d: "#c8aaf4",
  C: "#ffd23f",
  c: "#c1901a",
  T: "#ffd23f",
  G: "#ffe69a",
  g: "#ffd23f",
};

function heroFrames(): string[][] {
  return [WALK_0, WALK_1, JUMP, FALL, BLOW, ...[0, 1, 2, 3].map((n) => spin(FALL, n))];
}
function spin(g: string[], quarter: number): string[] {
  let out = g;
  for (let i = 0; i < quarter; i++) out = rotate90(out);
  return out;
}

/** Pop wears a striped belly instead of Pip's dotted one: same silhouette, different marks. */
const toPop = (g: string[]) => mapChars(g, (ch, x) => (ch === "d" ? "L" : ch === "L" && x % 2 === 1 ? "d" : ch));

export const HERO_DEFS = {
  hero_pip: { cls: "char", palette: PIP_PALETTE, frames: heroFrames() } satisfies SpriteDef,
  hero_pop: { cls: "char", palette: POP_PALETTE, frames: heroFrames().map(toPop) } satisfies SpriteDef,
};

const ICON = [
  "..C.C.C.",
  ".KCCCCCK",
  "KBBBBBBK",
  "KBEPBEPK",
  "gKBBBBKg",
  "gGKmmKGg",
  ".gKKKKg.",
  "........",
];
const ARROW = [
  "..WWWW..",
  "..WWWW..",
  "..WWWW..",
  "WWWWWWWW",
  ".WWWWWW.",
  "..WWWW..",
  "...WW...",
  "........",
];

export const ICON_DEFS: Record<IconName, SpriteDef> = {
  icon_pip: { cls: "icon", palette: PIP_PALETTE, frames: [ICON] },
  icon_pop: { cls: "icon", palette: POP_PALETTE, frames: [ICON] },
  icon_arrow: { cls: "icon", palette: { W: "#ffe45c" }, frames: [ARROW] },
};
