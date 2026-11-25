import type { ProjectileName, SpriteDef } from "./names";

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

export const PROJECTILE_DEFS: Record<ProjectileName, SpriteDef> = {
  icon_rock: { cls: "icon", palette: { K: "#3a2f28", G: "#8a7a6a", L: "#bfb097" }, frames: [ROCK_A, ROCK_B] },
  icon_flame: { cls: "icon", palette: { R: "#e8481c", O: "#ff9a2e", Y: "#fff08a" }, frames: [FLAME_A, FLAME_B] },
};
