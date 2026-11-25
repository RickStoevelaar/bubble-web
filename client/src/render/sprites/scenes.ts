import { withRows } from "./grid";
import type { SceneName, SpriteDef } from "./names";

/*
 * Ending-scene sprites (original).  The tiny friend is a round, peach-coloured fluff-newt with a leaf sprout,
 * rosy cheeks and little feet; frame 1 is the squashed hop.  The star twinkles between a cross and a dot, the
 * heart floats up when everyone is reunited.  Chars: K outline, Y body, L belly, R cheek, E eye white, P pupil,
 * m mouth, S sprout.
 */
const FRIEND_A = [
  "................",
  ".......SS.......",
  "......SSS.......",
  ".....KKKKKK.....",
  "...KKYYYYYYKK...",
  "..KYYYYYYYYYYK..",
  "..KYYEEYYEEYYK..",
  ".KYYYEPYYEPYYYK.",
  ".KYYYYYYYYYYYYK.",
  ".KYRRYYmmYYRRYK.",
  ".KYRRYYYYYYRRYK.",
  ".KYYYLLLLLLYYYK.",
  "..KYYLLLLLLYYK..",
  "..KKYYYYYYYYKK..",
  "...KK.KKKK.KK...",
  "................",
];
const FRIEND_B = withRows(FRIEND_A, {
  1: "................",
  2: ".......SS.......",
  3: "......SSS.......",
  14: "..KK........KK..",
});

const STAR_A = ["...Y....", "...Y....", "..YWY...", "YYWWWYY.", "..YWY...", "...Y....", "...Y....", "........"];
const STAR_B = ["........", "...Y....", "..YYY...", "..YWY...", "..YYY...", "...Y....", "........", "........"];
const HEART = ["........", ".RR..RR.", "RLRRRRRR", "RRRRRRRR", ".RRRRRR.", "..RRRR..", "...RR...", "........"];

export const SCENE_DEFS: Record<SceneName, SpriteDef> = {
  npc_friend: {
    cls: "char",
    palette: { K: "#5a3a1e", Y: "#ffd9a0", L: "#fff3dc", R: "#ff9f8a", E: "#ffffff", P: "#2b1a12", m: "#a8463a", S: "#5ccf6a" },
    frames: [FRIEND_A, FRIEND_B],
  },
  icon_star: { cls: "icon", palette: { Y: "#ffe45c", W: "#ffffff" }, frames: [STAR_A, STAR_B] },
  icon_heart: { cls: "icon", palette: { R: "#ff6b8a", L: "#ffd0dc" }, frames: [HEART] },
};
