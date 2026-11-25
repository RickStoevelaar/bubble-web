import { TILE, TUNING } from "../constants";
import { levelForState } from "../levels/secret-rooms";
import type { LevelData } from "../level";
import { Rng } from "../rng";
import type { GameState, PlayerState, SimEvent } from "../types";
import { stepBubbles } from "./bubbles";
import { newBoss, repairBoss } from "./boss";
import { stepEnemies } from "./enemies";
import { repairItems, stepItems } from "./items";
import { maybeSpawnItem, resolvePendingRound } from "./powers";
import { addScore, nextLifeThreshold } from "./scoring";
import { saneBody } from "./physics";
import { PLAYER_SIZE, stepPlayer } from "./player";
import { stepRound } from "./round";
import { P1_SPAWN_COL, P2_SPAWN_COL, spawnFloorRow } from "./spawn";
import { placeAtSecretSpawn, repairSecret } from "./secret";
import { clearSpecials, newLetters, repairEffects, repairLetters, stepEffects, stepSpecialSpawns } from "./specials";


function newPlayer(id: 0 | 1): PlayerState {
  return {
    id,
    x: 0,
    y: 0,
    vx: 0,
    vy: 0,
    facing: id === 0 ? 1 : -1,
    state: "alive",
    lives: TUNING.startLives,
    score: 0,
    nextLifeAt: TUNING.firstExtraLifeScore,
    fireCooldown: 0,
    invulnTicks: 0,
    stateTicks: 0,
    onGround: true,
    powers: { speed: false, fastBubble: false, longBubble: false, rapidFire: false },
    counters: { bubbles: 0, jumps: 0, distance: 0 },
    powerStep: 0,
    ringTicks: 0,
    letters: newLetters(),
    deathlessSince: 1,
  };
}

const count = (v: unknown): number => (typeof v === "number" && Number.isFinite(v) && v >= 0 ? Math.floor(v) : 0);

/** Fills the power-related fields of a player from an older or damaged save. */
function repairPlayer(p: Partial<PlayerState>): void {
  const c: Partial<PlayerState["counters"]> = p.counters ?? {};
  p.counters = { bubbles: count(c.bubbles), jumps: count(c.jumps), distance: count(c.distance) };
  p.powerStep = count(p.powerStep);
  p.ringTicks = count(p.ringTicks);
  p.letters = repairLetters(p.letters);
  p.deathlessSince = Number.isFinite(p.deathlessSince) ? Math.max(1, Math.floor(p.deathlessSince!)) : 1;
  const w: Partial<PlayerState["powers"]> = p.powers ?? {};
  p.powers = { speed: w.speed === true, fastBubble: w.fastBubble === true, longBubble: w.longBubble === true, rapidFire: w.rapidFire === true };
}

/** Places a player standing on the lowest floor in the spawn column. */
function placeAtSpawn(lv: LevelData, p: PlayerState): void {
  const col = p.id === 0 ? P1_SPAWN_COL : P2_SPAWN_COL;
  const floorRow = spawnFloorRow(lv, col);
  p.x = col * TILE + TILE / 2;
  p.y = floorRow * TILE - PLAYER_SIZE / 2;
  p.vx = 0;
  p.vy = 0;
  p.onGround = true;
}

/**
 * Invulnerability countdown and the dying -> respawning -> alive (or gone)
 * progression. Kept out of stepPlayer, which only moves living players.
 */
function stepPlayerLife(lv: LevelData, p: PlayerState): void {
  if (p.state === "alive") {
    if (p.invulnTicks > 0) p.invulnTicks--;
    return;
  }
  if (p.state !== "dying" && p.state !== "respawning") return;
  if (--p.stateTicks > 0) return;
  if (p.state === "dying") {
    if (p.lives > 0) {
      p.state = "respawning";
      p.stateTicks = TUNING.respawnTicks;
      placeAtSpawn(lv, p);
    } else {
      p.state = "gone";
    }
  } else {
    p.state = "alive";
    p.invulnTicks = TUNING.invulnTicks;
  }
}

/** Constructor options (a bare 1 or 2 means just the player count). */
export interface SimOptions {
  playerCount: 1 | 2;
  /** Hard mode: enemies start angry, hurry-up at half time, the boss has more hp. */
  superMode?: boolean;
  /** Round to load at construction (default 1, clamped into 1..levels.length). */
  startRound?: number;
}

export class Sim {
  state: GameState;
  currentLevel: LevelData;
  rng: Rng;

  constructor(
    public levels: LevelData[],
    seed: number,
    options: 1 | 2 | SimOptions,
  ) {
    const opts: SimOptions = typeof options === "number" ? { playerCount: options } : options;
    const playerCount = opts.playerCount;
    const start = Number.isFinite(opts.startRound) ? Math.min(levels.length, Math.max(1, Math.floor(opts.startRound!))) : 1;
    this.rng = new Rng(seed);
    this.currentLevel = levels[0]!;
    this.state = {
      tick: 0,
      round: 1,
      phase: "round",
      players: playerCount === 2 ? [newPlayer(0), newPlayer(1)] : [newPlayer(0)],
      enemies: [],
      bubbles: [],
      items: [],
      projectiles: [],
      effects: [],
      specialTimer: TUNING.specialFirstDelayTicks,
      roundTicks: 0,
      hurryActive: false,
      enemiesSeen: false,
      phaseTicks: 0,
      runOver: false,
      pendingRound: 0,
      secret: null,
      ending: null,
      endingTicks: 0,
      superMode: opts.superMode === true,
      nextId: 1,
      rngState: this.rng.getState(),
    };
    this.loadRound(start);
  }

  /**
   * Rebuilds a Sim from a serialized state. The RNG stream is restored from
   * `state.rngState`; seeding from the tick is only a fallback for older saves.
   */
  static restore(levels: LevelData[], state: GameState): Sim {
    const sim = new Sim(levels, state.tick, state.players.length === 2 ? 2 : 1);
    sim.state = structuredClone(state);
    // Defaults for fields that older saves may lack.
    const s = sim.state as Partial<GameState>;
    if (typeof s.enemiesSeen !== "boolean") sim.state.enemiesSeen = false;
    if (!Number.isFinite(s.phaseTicks)) sim.state.phaseTicks = 0;
    if (typeof s.runOver !== "boolean") sim.state.runOver = false;
    if (!Array.isArray(s.projectiles)) sim.state.projectiles = [];
    sim.state.items = repairItems(s.items);
    sim.state.effects = repairEffects(s.effects);
    sim.state.specialTimer = Number.isFinite(s.specialTimer) ? Math.floor(s.specialTimer!) : TUNING.specialFirstDelayTicks;
    sim.state.pendingRound = count(s.pendingRound);
    sim.state.secret = repairSecret(s.secret);
    sim.state.superMode = s.superMode === true;
    sim.state.ending = s.ending === "bad" || s.ending === "true" ? s.ending : null;
    sim.state.endingTicks = count(s.endingTicks);
    sim.state.enemies = sim.state.enemies.map((e) => (e.type === "boss" ? repairBoss(e, sim.state) : e));
    sim.currentLevel = levelForState(levels, sim.state);
    for (const p of sim.state.players as Partial<PlayerState>[]) {
      if (!Number.isFinite(p.nextLifeAt)) p.nextLifeAt = nextLifeThreshold(p.score ?? 0);
      repairPlayer(p);
    }
    // A damaged save may carry absurd finite coordinates or speeds: clamp every entity into a sane range.
    for (const list of [sim.state.players, sim.state.enemies, sim.state.bubbles, sim.state.projectiles, sim.state.items, sim.state.effects]) {
      for (const o of list) saneBody(o);
    }
    // Older saves have no rngState; keep the tick-seeded stream from the constructor.
    if (Number.isFinite(sim.state.rngState)) sim.rng.setState(sim.state.rngState);
    else sim.state.rngState = sim.rng.getState();
    if (!Number.isFinite(sim.state.nextId)) {
      let maxId = 0;
      for (const b of sim.state.bubbles) maxId = Math.max(maxId, b.id);
      for (const e of sim.state.enemies) maxId = Math.max(maxId, e.id);
      for (const i of sim.state.items) maxId = Math.max(maxId, i.id);
      for (const pr of sim.state.projectiles) maxId = Math.max(maxId, pr.id);
      sim.state.nextId = maxId + 1;
    }
    return sim;
  }

  loadRound(n: number): void {
    const lv = this.levels[n - 1];
    if (!lv) throw new Error(`no level for round ${n}`);
    this.currentLevel = lv;
    this.state.round = n;
    this.state.secret = null;
    this.state.phase = "round";
    this.state.roundTicks = 0;
    this.state.hurryActive = false;
    this.state.enemiesSeen = false;
    this.state.phaseTicks = 0;
    this.state.enemies = lv.enemies.map((s) => {
      if (s.type === "boss") return newBoss(this.state, s);
      return {
        id: this.state.nextId++,
        type: s.type,
        x: s.col * TILE + TILE / 2,
        y: (s.row + 1) * TILE - TUNING.enemySize / 2,
        vx: 0,
        vy: 0,
        dir: 1,
        state: "spawning" as const,
        angry: this.state.superMode, // Super mode: everything starts angry
        spawnDelay: s.delayTicks,
        onGround: false,
      };
    });
    this.state.bubbles = [];
    this.state.items = [];
    this.state.projectiles = [];
    clearSpecials(this.state);
    this.state.specialTimer = TUNING.specialFirstDelayTicks;
    for (const p of this.state.players) placeAtSpawn(lv, p);
  }

  /** Spawns the second player mid-run; returns its id. */
  addPlayer(): 0 | 1 {
    if (this.state.players.length >= 2) throw new Error("already two players");
    const p = newPlayer(1);
    if (this.state.secret) placeAtSecretSpawn(this.state.secret, p);
    else placeAtSpawn(this.currentLevel, p);
    this.state.players.push(p);
    return 1;
  }

  /** Free continue after game over: scores reset, lives restored, same round reloaded. Throws outside "gameover". */
  continueRun(): SimEvent[] {
    if (this.state.phase !== "gameover" || this.state.runOver) throw new Error("continueRun is only valid in phase gameover");
    for (const p of this.state.players) {
      p.score = 0;
      p.nextLifeAt = TUNING.firstExtraLifeScore;
      p.lives = TUNING.startLives;
      p.state = "alive";
      p.stateTicks = 0;
      p.invulnTicks = TUNING.invulnTicks;
      p.powers = { speed: false, fastBubble: false, longBubble: false, rapidFire: false };
      p.counters = { bubbles: 0, jumps: 0, distance: 0 };
      p.powerStep = 0;
      p.ringTicks = 0;
      p.letters = newLetters();
      p.deathlessSince = this.state.round;
    }
    this.loadRound(this.state.round); // after the revival: the boss's hp counts the players present
    this.state.pendingRound = 0;
    return [{ kind: "continue" }];
  }

  /** Declines the continue: the run is over and gameplay stops. Throws outside "gameover". */
  endRun(): void {
    if (this.state.phase !== "gameover") throw new Error("endRun is only valid in phase gameover");
    this.state.runOver = true;
  }

  /** One call = one 60 Hz tick. */
  step(buttons: [number, number]): SimEvent[] {
    const events: SimEvent[] = [];
    this.state.tick++;
    if (this.state.phase === "ending") this.state.endingTicks++; // the cutscene clock runs while everything else is frozen
    if (this.state.runOver || this.state.phase === "gameover" || this.state.phase === "ending") return events;
    if (this.state.phase === "round" && !this.state.secret) this.state.roundTicks++;
    for (const p of this.state.players) {
      stepPlayerLife(this.currentLevel, p);
      const own = stepPlayer(this, p, buttons[p.id]);
      events.push(...own);
      if (p.ringTicks > 0) {
        for (const e of own) if (e.kind === "jump") events.push(...addScore(this, p.id, TUNING.ringJumpScore));
        p.ringTicks--;
      }
    }
    events.push(...stepBubbles(this, buttons));
    events.push(...stepEnemies(this));
    events.push(...stepEffects(this));
    stepSpecialSpawns(this);
    events.push(...stepItems(this));
    maybeSpawnItem(this);
    events.push(...stepRound(this));
    resolvePendingRound(this, events);
    this.state.rngState = this.rng.getState();
    return events;
  }
}
