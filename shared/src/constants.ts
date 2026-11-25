/** Simulation ticks per second. */
export const TICK_RATE = 60;
/** Snapshots broadcast per second (server to client). */
export const SNAPSHOT_RATE = 20;

/** Playfield size in pixels. */
export const FIELD_W = 256;
export const FIELD_H = 224;
/** Tile size in pixels. */
export const TILE = 8;
/** Grid size in tiles (FIELD_W / TILE by FIELD_H / TILE). */
export const GRID_W = 32;
export const GRID_H = 28;

/**
 * Gameplay tuning values. Speeds are px per tick; tick counts are 60Hz ticks.
 * Initial values are placeholders and will be tuned later.
 */
export const TUNING = {
  walkSpeed: 1.0,
  speedPowerMult: 1.5,
  startLives: 3,
  jumpVel: -3.6,
  gravity: 0.12,
  maxFall: 3.2,
  fireCooldownTicks: 18,
  bubbleLaunchSpeed: 3.0,
  bubbleLaunchTicks: 10,
  bubbleRise: 0.25,
  bubbleLifeTicks: 360,
  bubbleRadius: 7,
  /** Distance from the player center to a freshly blown bubble center. */
  bubbleSpawnOffset: 14,
  fastBubbleMult: 1.5,
  longBubbleMult: 1.5,
  /** Player vy after bouncing on a bubble. */
  bubbleBounceVel: -4.0,
  /** Drift cell dx/dy are multiplied by this and added to bubble velocity each tick. */
  bubbleDriftStrength: 0.05,
  /** Per-tick damping of float-phase velocity back toward the base rise. */
  bubbleDamping: 0.9,
  /** Fraction of overlap resolved per tick when bubbles stack. */
  bubbleStackPush: 0.5,
  bubbleEscapeTicks: 60,
  angerSpeedMult: 1.5,
  invulnTicks: 120,
  respawnTicks: 90,
  hurryUpTicks: 3600,
  roundAngerTicks: 1800,
  /** Enemy body is a square of this many pixels, centered on (x, y). */
  enemySize: 14,
  enemyWalkSpeed: 0.5,
  /** Chance a walker drops off a ledge it reaches (otherwise it turns around). */
  enemyLedgeDropChance: 0.3,
  /** Per-tick chance to hop when a player stands on a reachable platform above. */
  enemyHopChance: 0.02,
  /** Vertical band (px, enemy center to player center) in which a hop is attempted. */
  enemyHopMinRise: 16,
  enemyHopMaxRise: 48,
  /** Horizontal reach (px) within which a player above triggers a hop. */
  enemyHopReach: 48,
  /** Score awarded to the popping player for a trapped enemy (reworked by the scoring task). */
  enemyPopScore: 100,
  /** Initial vy of a dead enemy's arc. */
  enemyDeathVel: -2.5,
  /** Horizontal speed of a dead enemy's arc. */
  enemyDeathSpeed: 1.0,
  /** Hard cap on how long a dead enemy arcs before being removed. */
  enemyDeathMaxTicks: 120,
  /** Ticks a player spends in the dying state before respawning (or being gone). */
  playerDyingTicks: 60,
} as const;
