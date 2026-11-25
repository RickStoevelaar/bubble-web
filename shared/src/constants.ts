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
  bubbleEscapeTicks: 60,
  angerSpeedMult: 1.5,
  invulnTicks: 120,
  respawnTicks: 90,
  hurryUpTicks: 3600,
  roundAngerTicks: 1800,
} as const;
