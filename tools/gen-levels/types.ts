import type { EnemyType } from "@bubble/shared";
import type { Rng } from "@bubble/shared";

export type ParamValue = number | boolean | string | number[] | number[][];
export type Params = Record<string, ParamValue>;

/** A layout family: a pure function of parameters and a seeded RNG producing the 28 tile rows. */
export interface Template {
  name: string;
  description: string;
  /** Every parameter with its default; round data overrides any subset. */
  defaults: Params;
  build(params: Params, rng: Rng): string[];
}

export type PlacedEnemyType = Exclude<EnemyType, "boss" | "hurry">;

/** `n` enemies of one type placed automatically (spread over the layout, away from the player spawns). */
export interface EnemyGroup {
  type: PlacedEnemyType;
  n?: number;
  /** Restrict to a band of the field. */
  zone?: "low" | "mid" | "high" | "any";
  side?: "left" | "right" | "any";
  /** Spawn wave: the group appears `delayTicks` (plus `spread` per member) after the round starts, instead of the uniform stagger. */
  delayTicks?: number;
  spread?: number;
}

/** One enemy at an exact tile. */
export interface EnemyFixed {
  type: PlacedEnemyType;
  col: number;
  row: number;
  delayTicks?: number;
}

export type EnemySpec = EnemyGroup | EnemyFixed;

export type DriftSpec =
  /** Rectangle of equal cells, `col0..col1` by `row0..row1`. */
  | { kind: "area"; col0: number; col1: number; row0: number; row1: number; dx: number; dy: number }
  /** Current circulating around the rectangle's outline (open tiles only); `width` cells thick. */
  | { kind: "ring"; col0: number; col1: number; row0: number; row1: number; clockwise?: boolean; width?: number };

export interface RoundDef {
  round: number;
  theme: number;
  /** Template name, or "hand" when `tiles` is given. */
  template: string;
  params: Params;
  seed?: number;
  /** Hand-drawn 32x28 art (used instead of a template). */
  tiles?: string[];
  enemies: EnemySpec[];
  /** Ticks between spawns after the first two (default 60). */
  stagger?: number;
  flags?: { waterBubbles?: boolean; fireBubbles?: boolean; lightningBubbles?: boolean };
  drift?: DriftSpec[];
  notes?: string;
}
