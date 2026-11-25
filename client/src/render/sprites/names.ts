import type { EnemyType, PowerId } from "@bubble/shared";

/** Glyphs the HUD font provides (space is handled by the text routine). */
export const FONT_CHARS = [
  ..."ABCDEFGHIJKLMNOPQRSTUVWXYZ0123456789",
  ":",
  "-",
  "x",
  ".",
  "!",
  "+",
] as const;
export type FontChar = (typeof FONT_CHARS)[number];

export const ENEMY_TYPES: readonly EnemyType[] = [
  "walker",
  "chaser",
  "thrower",
  "breather",
  "bouncer",
  "flyer",
  "boss",
  "hurry",
];

export const ITEM_NAMES = [
  "item_plum",
  "item_cake",
  "item_gem",
  "item_crown",
  "item_fish",
  "item_pear",
  "item_potion",
  "item_star",
] as const;

/** Power-up item sprite by PowerId (power items are drawn by `power`, not by the food `sprite` index). */
export const POWER_SPRITES = {
  boots: "power_boots",
  tonicA: "power_tonic_a",
  parasolS: "power_parasol_s",
  tonicB: "power_tonic_b",
  ring: "power_ring",
  spark: "power_spark",
  tonicC: "power_tonic_c",
  parasolM: "power_parasol_m",
  flask: "power_flask",
  parasolL: "power_parasol_l",
} as const satisfies Record<PowerId, string>;
export type PowerName = (typeof POWER_SPRITES)[PowerId];

export type HeroName = "hero_pip" | "hero_pop";
export type EnemyName = `enemy_${EnemyType}` | `enemy_${EnemyType}_angry`;
export type BubbleName = "bubble_normal" | "bubble_water" | "bubble_fire" | "bubble_lightning" | "bubble_letter";
export type ItemName = (typeof ITEM_NAMES)[number];
/** The secret-room door item (kept out of ITEM_NAMES, which food and treasure index by sprite number). */
export type DoorName = "item_door";
export type TileName = `tile_${0 | 1 | 2 | 3 | 4 | 5 | 6 | 7 | 8 | 9}`;
export type IconName = "icon_pip" | "icon_pop" | "icon_arrow";
export type ProjectileName = "icon_rock" | "icon_flame";
export type EffectName = "icon_water" | "icon_bolt";
export type FontName = `font_${FontChar}`;

export type SpriteName = HeroName | EnemyName | BubbleName | ItemName | DoorName | PowerName | TileName | IconName | ProjectileName | EffectName | FontName;

/** Hero frame indices. */
export const HERO_FRAME = { walk0: 0, walk1: 1, jump: 2, fall: 3, blow: 4, death0: 5 } as const;

/**
 * Size class of a template: "char" = 16x16 (characters, items, bubbles);
 * "tile" / "font" / "icon" = 8x8.
 */
export type SizeClass = "char" | "tile" | "font" | "icon";
export const CLASS_SIZE: Record<SizeClass, number> = { char: 16, tile: 8, font: 8, icon: 8 };

export interface SpriteDef {
  cls: SizeClass;
  /** Template char -> CSS colour; '.' is always transparent. */
  palette: Record<string, string>;
  /** Frames, each a rectangular grid of strings. */
  frames: string[][];
}
