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
  /** Launch phase length: 20 ticks x 3 px = 60 px blown distance (was 10 ticks = 30 px); long-bubble scales it. */
  bubbleLaunchTicks: 20,
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
  /**
   * How long a trapped enemy stays in its bubble (7.5 s), counted from the trap. A trapped bubble is governed by this alone
   * (bubbleLifeTicks only applies to empty bubbles), so it can never pop before the enemy would escape.
   */
  bubbleEscapeTicks: 450,
  /** The trapped enemy flashes during the last bubbleWarnTicks (1.5 s) before it escapes. */
  bubbleWarnTicks: 90,
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
  /** Score of the first enemy popped in a cascade; the n-th scores base * 2^(n-1), capped at chainMaxScore. */
  chainBaseScore: 1000,
  chainMaxScore: 64000,
  /** Trapped bubbles whose centers are within this many px (about two bubble diameters) pop together. */
  chainRadius: 28,
  /** Side length (px) of an item's square body, and how long food lies around before vanishing. */
  itemSize: 12,
  foodTtlTicks: 600,
  /**
   * Power items: lifetime on screen, and the progress (x cycle number) that earns each one. Progress is counted from the
   * moment the previous power was earned (PlayerState.powerBase), not from the start of the run.
   * The three skip umbrellas (parasols) are deliberately a rare reward. Pace measured in the real sim with a pacing bot
   * (about 35 s per round: 630..1290 px walked, 41..50 bubbles, 9..14 jumps; boots make walking 1.5x faster, so ~1350 px,
   * 45 bubbles, 12 jumps per round): the small umbrella (3 rounds) lands around round 10 (never before about 7 even for a
   * fast walker), the medium one (5 rounds) about 25 rounds after it, the large one (7 rounds) about 35 rounds after that,
   * so one run sees two or three umbrellas, never two within 5 rounds (shared/test/pacing.test.ts holds the arithmetic).
   */
  powerItemTtlTicks: 720,
  powerThreshold: {
    boots: 8,
    tonicA: 10,
    parasolS: 12000,
    tonicB: 25,
    ring: 30,
    spark: 40,
    tonicC: 55,
    parasolM: 24000,
    flask: 60,
    parasolL: 40000,
  },
  /** Score ring: how long it lasts (60 s) and what each jump scores meanwhile. */
  ringTicks: 3600,
  ringJumpScore: 100,
  /** Flask: food items rained from the top of the field. */
  floodFoodCount: 8,
  /** A life at this score and again every extraLifeStep after it; lives never exceed maxLives. */
  firstExtraLifeScore: 50000,
  extraLifeStep: 100000,
  maxLives: 9,
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

  /** Special bubbles: ticks before the first one, the random interval (uniform in [min, max)) between spawns, life while floating, and the cap alive at once. */
  specialFirstDelayTicks: 600,
  specialIntervalMin: 480,
  specialIntervalMax: 900,
  specialBubbleLifeTicks: 900,
  maxSpecialBubbles: 2,
  /** Spawn lane: center y is specialLaneMinY + [0, specialLaneSpan); x is specialEdgeX px inside the left or right field edge. */
  specialLaneMinY: 48,
  specialLaneSpan: 112,
  specialEdgeX: 24,
  /** Per-tick inward x acceleration of a floating special bubble (terminal speed is 10x this). */
  specialInwardAccel: 0.01,
  /** Kind weights: each allowed element kind vs the letter (rarer); a letter the first alive player misses weighs letterMissingWeight vs 1. */
  specialKindWeight: 4,
  letterWeight: 2,
  letterMissingWeight: 4,
  /**
   * On a level without any element flag every special bubble is a letter, so the spawn interval is multiplied by this
   * (flagged levels keep the designed interval). A full EXTEND needs ~8.2 collected letters on average (missing letters
   * weigh 4 against 1); at the base interval (avg 11.5 s) that was one EXTEND per ~2.6 rounds of 35 s even for a player
   * who touches every letter; at x2.5 it is ~6.7 rounds for that perfect player and ~8..10 for a realistic one.
   */
  letterOnlyIntervalMult: 2.5,
  /** Score for collecting a letter the player already has. */
  duplicateLetterScore: 500,
  /** Water: body size (px), flow speed (px per tick) and how long it flows after landing. */
  waterSize: 16,
  waterSpeed: 1.5,
  waterRangeTicks: 90,
  /** Fire: body size (px), spread speed per side (px per tick), max reach per side from the landing x (px) and total burn ticks after landing. */
  fireSize: 8,
  fireSpreadSpeed: 1.5,
  fireMaxSpread: 40,
  fireDurationTicks: 120,
  /** Lightning bolt: half the band height (px) and how long its visual stays. */
  boltHalfHeight: 6,
  boltVisualTicks: 20,

  /** Secret rooms: the rounds whose clear may open a door (the index picks the room), the deathless stretch (rounds) every present player needs, and the clearing window while a door waits. */
  secretDoorRounds: [20, 30, 40] as readonly number[],
  secretDoorDeathlessRounds: 10,
  secretDoorClearTicks: 600,
  /** Treasure room: how long it lasts, how many treasure items rain in, and the pause after the last one is taken. */
  secretRoomTicks: 900,
  secretTreasureCount: 40,
  secretLeaveDelayTicks: 60,

  /** Boss: body size (px), hp = base + perPlayer x players present when the round loads (x superHpMult in Super mode), speed per axis, and the enrage (hp <= maxHp / 3) multipliers. */
  bossSize: 48,
  bossHpBase: 60,
  bossHpPerPlayer: 40,
  bossSuperHpMult: 2,
  bossSpeed: 0.5,
  bossEnrageSpeedMult: 1.5,
  bossEnrageVolleyMult: 0.5,
  /** Ticks between volleys, rocks per volley, and the fixed horizontal speed offset of each rock of the fan (indexed by rock). */
  bossVolleyTicks: 120,
  bossVolleySize: 3,
  bossFanOffsets: [-0.6, 0, 0.6] as readonly number[],
  /** Hit stagger: ticks the boss freezes (and cannot be hurt again) after a thunder shot lands. */
  bossStunTicks: 20,
  bossHitScore: 500,
  bossKillScore: 50000,
  /** Thunder shots (every bubble in a boss round): px per tick and ticks of travel. */
  thunderShotSpeed: 4,
  thunderShotTicks: 40,
} as const;
