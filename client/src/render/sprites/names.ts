import type { EnemyType } from "@bubble/shared";

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

export type HeroName = "hero_pip" | "hero_pop";
export type EnemyName = `enemy_${EnemyType}` | `enemy_${EnemyType}_angry`;
export type BubbleName = "bubble_normal" | "bubble_water" | "bubble_fire" | "bubble_lightning" | "bubble_letter";
export type ItemName = (typeof ITEM_NAMES)[number];
export type TileName = `tile_${0 | 1 | 2 | 3 | 4 | 5 | 6 | 7 | 8 | 9}`;
export type IconName = "icon_pip" | "icon_pop" | "icon_arrow";
export type FontName = `font_${FontChar}`;

export type SpriteName = HeroName | EnemyName | BubbleName | ItemName | TileName | IconName | FontName;

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
