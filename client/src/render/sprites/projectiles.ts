import type { EffectName, ProjectileName, SpriteDef } from "./names";

/*
 * Enemy projectiles, 8x8, two frames each.  The rock is a jagged grey-brown
 * pebble that tumbles between frames; the flame is an orange teardrop with a
 * yellow core whose tail flickers.  Drawn facing right (the renderer mirrors it).
 */
const ROCK_A = [
  "..KKK...",
  ".KGLGK..",
  "KGLGGGK.",
  "KGGGGGGK",
  ".KGGKGGK",
  ".KGGGGK.",
  "..KKGK..",
  "....KK..",
];
const ROCK_B = [
  "...KK...",
  "..KGGK..",
  ".KGGLGK.",
  "KGGGLGGK",
  "KGKGGGGK",
  ".KGGGGK.",
  "..KGGK..",
  "...KK...",
];

const FLAME_A = [
  "........",
  "....RR..",
  "..RROOR.",
  "RROOYYOR",
  "RROOYYOR",
  "..RROOR.",
  "....RR..",
  "........",
];
const FLAME_B = [
  "........",
  "...RRR..",
  ".RROOOR.",
  "..ROYYOR",
  "RROOYYOR",
  ".RROOOR.",
  "...RRR..",
  "........",
];

/*
 * Special-bubble effect tiles, 8x8, two frames each, tiled by the renderer.  The water tile is a rippling blue
 * wave whose crests shift between frames; the bolt tile is a yellow zigzag segment with a pale core whose
 * kinks flip between frames.  Both join their own copies edge to edge.
 */
const WATER_A = [
  "........",
  ".WW..WW.",
  "WLLWWLLW",
  "LLLLLLLL",
  "LLBLLLBL",
  "BBBBBBBB",
  "BBBBBBBB",
  "BBBBBBBB",
];
const WATER_B = [
  "........",
  "..WWWW..",
  ".WLLLLW.",
  "LLLLLLLL",
  "BLLLBLLL",
  "BBBBBBBB",
  "BBBBBBBB",
  "BBBBBBBB",
];
const BOLT_A = [
  "........",
  "....YY..",
  "...YWY..",
  "YYYWWYYY",
  "YYYYWWYY",
  "..YWY...",
  "..YY....",
  "........",
];
const BOLT_B = [
  "........",
  "..YY....",
  "..YWY...",
  "YYYWWYYY",
  "YYWWYYYY",
  "...YWY..",
  "....YY..",
  "........",
];

export const PROJECTILE_DEFS: Record<ProjectileName | EffectName, SpriteDef> = {
  icon_water: { cls: "icon", palette: { B: "#1f5fbf", L: "#4aa8ff", W: "#e8f6ff" }, frames: [WATER_A, WATER_B] },
  icon_bolt: { cls: "icon", palette: { Y: "#ffd633", W: "#fffbe0" }, frames: [BOLT_A, BOLT_B] },
  icon_rock: { cls: "icon", palette: { K: "#3a2f28", G: "#8a7a6a", L: "#bfb097" }, frames: [ROCK_A, ROCK_B] },
  icon_flame: { cls: "icon", palette: { R: "#e8481c", O: "#ff9a2e", Y: "#fff08a" }, frames: [FLAME_A, FLAME_B] },
};
