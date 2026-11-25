import { GRID_H, TILE, TUNING } from "../constants";
import { isSolid } from "../level";
import type { LevelData } from "../level";
import { Rng } from "../rng";
import type { GameState, PlayerState, SimEvent } from "../types";
import { stepBubbles } from "./bubbles";
import { stepEnemies } from "./enemies";
import { repairItems, stepItems } from "./items";
import { nextLifeThreshold } from "./scoring";
import { PLAYER_SIZE, stepPlayer } from "./player";
import { stepRound } from "./round";

const P1_SPAWN_COL = 3;
const P2_SPAWN_COL = 28;

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
  };
}

/** Places a player standing on the lowest floor in the spawn column. */
function placeAtSpawn(lv: LevelData, p: PlayerState): void {
  const col = p.id === 0 ? P1_SPAWN_COL : P2_SPAWN_COL;
  let floorRow = GRID_H;
  for (let ty = GRID_H - 1; ty >= 0; ty--) {
    if (isSolid(lv, col, ty) && !isSolid(lv, col, ty - 1)) {
      floorRow = ty;
      break;
    }
  }
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

export class Sim {
  state: GameState;
  currentLevel: LevelData;
  rng: Rng;

  constructor(
    public levels: LevelData[],
    seed: number,
    playerCount: 1 | 2,
  ) {
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
      roundTicks: 0,
      hurryActive: false,
      enemiesSeen: false,
      phaseTicks: 0,
      runOver: false,
      nextId: 1,
      rngState: this.rng.getState(),
    };
    this.loadRound(1);
  }

  /**
   * Rebuilds a Sim from a serialized state. The RNG stream is restored from
   * `state.rngState`; seeding from the tick is only a fallback for older saves.
   */
  static restore(levels: LevelData[], state: GameState): Sim {
    const sim = new Sim(levels, state.tick, state.players.length === 2 ? 2 : 1);
    sim.state = structuredClone(state);
    sim.currentLevel = levels[state.round - 1]!;
    // Defaults for fields that older saves may lack.
    const s = sim.state as Partial<GameState>;
    if (typeof s.enemiesSeen !== "boolean") sim.state.enemiesSeen = false;
    if (!Number.isFinite(s.phaseTicks)) sim.state.phaseTicks = 0;
    if (typeof s.runOver !== "boolean") sim.state.runOver = false;
    if (!Array.isArray(s.projectiles)) sim.state.projectiles = [];
    sim.state.items = repairItems(s.items);
    for (const p of sim.state.players as Partial<PlayerState>[]) {
      if (!Number.isFinite(p.nextLifeAt)) p.nextLifeAt = nextLifeThreshold(p.score ?? 0);
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
    this.state.phase = "round";
    this.state.roundTicks = 0;
    this.state.hurryActive = false;
    this.state.enemiesSeen = false;
    this.state.phaseTicks = 0;
    this.state.enemies = lv.enemies.map((s) => ({
      id: this.state.nextId++,
      type: s.type,
      x: s.col * TILE + TILE / 2,
      y: (s.row + 1) * TILE - TUNING.enemySize / 2,
      vx: 0,
      vy: 0,
      dir: 1,
      state: "spawning",
      angry: false,
      spawnDelay: s.delayTicks,
      onGround: false,
    }));
    this.state.bubbles = [];
    this.state.items = [];
    this.state.projectiles = [];
    for (const p of this.state.players) placeAtSpawn(lv, p);
  }

  /** Spawns the second player mid-run; returns its id. */
  addPlayer(): 0 | 1 {
    if (this.state.players.length >= 2) throw new Error("already two players");
    const p = newPlayer(1);
    placeAtSpawn(this.currentLevel, p);
    this.state.players.push(p);
    return 1;
  }

  /** Free continue after game over: scores reset, lives restored, same round reloaded. Throws outside "gameover". */
  continueRun(): SimEvent[] {
    if (this.state.phase !== "gameover" || this.state.runOver) throw new Error("continueRun is only valid in phase gameover");
    this.loadRound(this.state.round);
    for (const p of this.state.players) {
      p.score = 0;
      p.nextLifeAt = TUNING.firstExtraLifeScore;
      p.lives = TUNING.startLives;
      p.state = "alive";
      p.stateTicks = 0;
      p.invulnTicks = TUNING.invulnTicks;
    }
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
    if (this.state.runOver || this.state.phase === "gameover" || this.state.phase === "ending") return events;
    if (this.state.phase === "round") this.state.roundTicks++;
    for (const p of this.state.players) {
      stepPlayerLife(this.currentLevel, p);
      events.push(...stepPlayer(this, p, buttons[p.id]));
    }
    events.push(...stepBubbles(this, buttons));
    events.push(...stepEnemies(this));
    events.push(...stepItems(this));
    events.push(...stepRound(this));
    this.state.rngState = this.rng.getState();
    return events;
  }
}
