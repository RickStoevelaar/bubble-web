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
  /** Length of the round-clear celebration window before the next round loads. */
  clearTicks: 180,
  /** Hurry-up chaser speed in px per tick (one axis at a time, ignoring tiles). */
  hurryChaserSpeed: 0.8,
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

  /** Chaser walk speed as a multiple of the walker's. */
  chaserSpeedMult: 1.2,
  /** A chaser re-aims at its target only every N ticks (staggered by id) to avoid jitter. */
  chaserRetargetTicks: 20,
  /** Vertical distance (px) within which a player counts as being on the chaser's platform row. */
  chaserRowBand: 12,
  /** Horizontal distance (px) below which a chaser keeps its current direction. */
  chaserDeadZone: 2,

  /** Thrower: ticks between throws, and the randomized delay (uniform in [min, max)) before the first. */
  throwerCooldownTicks: 150,
  throwerInitialDelayMin: 40,
  throwerInitialDelayMax: 120,
  /** Thrower stands still this long, facing its target, before the rock leaves. */
  throwWindupTicks: 30,
  /** Rock horizontal speed (toward the target's side), launch vy (negative = up), gravity and fall cap. */
  rockSpeedX: 1.2,
  rockLaunchVy: -2.4,
  rockGravity: 0.12,
  rockMaxFall: 3.2,

  /** Breather: walk speed as a multiple of the walker's, shorter cooldown and wind-up than the thrower. */
  breatherSpeedMult: 0.7,
  breatherCooldownTicks: 90,
  breatherInitialDelayMin: 20,
  breatherInitialDelayMax: 70,
  breatherWindupTicks: 18,
  /** Flame horizontal speed, lifetime in ticks (range = speed * ticks) and the vertical reach (px) for a target row. */
  flameSpeed: 1.5,
  flameRangeTicks: 40,
  flameRowBand: 40,
  /** Side length (px) of a projectile's square hitbox. */
  projectileSize: 6,

  /** Bouncer speed per axis (px per tick). */
  bouncerSpeed: 0.8,
  /** Flyer speed (px per tick), bob amplitude (px), bob period (ticks, multiple of 4) and per-id phase offset (ticks). */
  flyerSpeed: 0.6,
  flyerBobAmplitude: 6,
  flyerBobPeriod: 64,
  flyerBobIdStride: 11,
} as const;
