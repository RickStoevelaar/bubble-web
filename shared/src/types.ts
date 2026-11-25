import type { EnemyType } from "./level";

export const BTN = { L: 1, R: 2, J: 4, F: 8 } as const;

/** Enemy position: (x, y) is the CENTER of the TUNING.enemySize square body. */
export interface EnemyState {
  id: number;
  type: EnemyType;
  x: number;
  y: number;
  vx: number;
  vy: number;
  dir: 1 | -1;
  state: "spawning" | "active" | "trapped" | "dead";
  angry: boolean;
  /** Ticks until a "spawning" enemy becomes active. */
  spawnDelay: number;
  onGround: boolean;
  /** Set while a walker has chosen to walk off the ledge it is standing at. */
  dropping?: boolean;
  /** Ticks spent in the "dead" arc. */
  deadTicks?: number;
  /** Shooters only: ticks until the next wind-up starts (unset until first active tick, then randomized). */
  cooldown?: number;
  /** Shooters only: ticks of wind-up left (stopped and facing the target); 0/unset when not winding up. */
  windup?: number;
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
  trapped?: { type: EnemyType; escapeIn: number; enemyId: number };
  owner: 0 | 1;
}
/** A rock (arcs under gravity) or flame (straight, limited range) shot by an enemy; (x, y) is its center. */
export interface ProjectileState {
  id: number;
  x: number;
  y: number;
  vx: number;
  vy: number;
  kind: "rock" | "flame";
  ageTicks: number;
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
  /** Countdown for the "dying" and "respawning" states. */
  stateTicks: number;
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
  projectiles: ProjectileState[];
  roundTicks: number;
  hurryActive: boolean;
  /** True once a real (non-hurry) enemy has been alive this round; guards round-clear. */
  enemiesSeen: boolean;
  /** Ticks spent in the current non-round phase (clearing countdown). */
  phaseTicks: number;
  /** True once the run is finished (ended from game over, or last round cleared); gameplay stops. */
  runOver: boolean;
  /** Next unique entity id (monotonic, survives restore). */
  nextId: number;
  /** mulberry32 state of Sim.rng, synced at the end of every step so restore resumes the stream. */
  rngState: number;
}

export type SimEvent = {
  kind: "jump" | "fire" | "pop" | "bounce" | "die" | "collect" | "clear" | "hurry" | "continue";
  player?: 0 | 1;
  x?: number;
  y?: number;
};
