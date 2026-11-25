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
export type ItemKind = "food" | "power" | "treasure";
/** The ten power-up items; see POWER_TABLE for what each one does and what earns it. */
export type PowerId = "boots" | "tonicA" | "tonicB" | "tonicC" | "parasolS" | "parasolM" | "parasolL" | "ring" | "spark" | "flask";
/** The per-player action tallies that earn power items. */
export type CounterKind = "bubbles" | "jumps" | "distance";
/** A collectable; (x, y) is the CENTER of the TUNING.itemSize square body. Falls under gravity, then rests. */
export interface ItemState {
  id: number;
  x: number;
  y: number;
  vx: number;
  vy: number;
  onGround: boolean;
  kind: ItemKind;
  /** Index 0..7 into the eight food/treasure sprites. */
  sprite: number;
  /** Score awarded to the collector. */
  value: number;
  /** Ticks until the item vanishes. */
  despawnTicks: number;
  /** Which power a kind "power" item grants (drawn by this, not by `sprite`). */
  power?: PowerId;
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
  /** Score at which the next extra life is granted. */
  nextLifeAt: number;
  fireCooldown: number;
  invulnTicks: number;
  /** Countdown for the "dying" and "respawning" states. */
  stateTicks: number;
  onGround: boolean;
  powers: { speed: boolean; fastBubble: boolean; longBubble: boolean; rapidFire: boolean };
  /** Lifetime action tallies of this run (bubbles blown, jumps made, whole pixels walked); reset only by a new run/continue. */
  counters: { bubbles: number; jumps: number; distance: number };
  /** Power items earned so far this run; the next one is POWER_ORDER[powerStep % 10], needing (cycle + 1) x its threshold. */
  powerStep: number;
  /** Ticks left of the score ring (every jump scores while > 0). */
  ringTicks: number;
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
  /** Round a parasol asked to jump to (0 = none); resolved at the end of the tick. */
  pendingRound: number;
  /** mulberry32 state of Sim.rng, synced at the end of every step so restore resumes the stream. */
  rngState: number;
}

export type SimEvent = {
  kind: "jump" | "fire" | "pop" | "bounce" | "die" | "collect" | "oneup" | "clear" | "hurry" | "continue";
  player?: 0 | 1;
  x?: number;
  y?: number;
};
