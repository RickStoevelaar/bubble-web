import type { EnemyType } from "./level";

export const BTN = { L: 1, R: 2, J: 4, F: 8 } as const;

/** Placeholder; extended by the enemy task. */
export interface EnemyState {
  id: number;
}
export interface BubbleState {
  id: number;
  x: number;
  y: number;
  vx: number;
  vy: number;
  kind: "normal" | "water" | "fire" | "lightning" | "letter";
  /** Index into E X T E N D; only for kind "letter". */
  letter?: 0 | 1 | 2 | 3 | 4 | 5;
  phase: "launch" | "float";
  ageTicks: number;
  trapped?: { type: EnemyType; escapeIn: number };
  owner: 0 | 1;
}
/** Placeholder; extended by the items task. */
export interface ItemState {
  id: number;
}

/**
 * Player position: (x, y) is the CENTER of the 14x14 body in field pixels.
 * Feet are at y + PLAYER_SIZE / 2.
 */
export interface PlayerState {
  id: 0 | 1;
  x: number;
  y: number;
  vx: number;
  vy: number;
  facing: 1 | -1;
  state: "alive" | "dying" | "respawning" | "gone";
  lives: number;
  score: number;
  fireCooldown: number;
  invulnTicks: number;
  onGround: boolean;
  powers: { speed: boolean; fastBubble: boolean; longBubble: boolean; rapidFire: boolean };
}

export interface GameState {
  tick: number;
  round: number;
  phase: "round" | "clearing" | "gameover" | "ending";
  players: PlayerState[];
  enemies: EnemyState[];
  bubbles: BubbleState[];
  items: ItemState[];
  roundTicks: number;
  hurryActive: boolean;
  /** Next unique entity id (monotonic, survives restore). */
  nextId: number;
}

export type SimEvent = {
  kind: "jump" | "fire" | "pop" | "bounce" | "die" | "collect" | "clear" | "hurry" | "continue";
  player?: 0 | 1;
  x?: number;
  y?: number;
};
