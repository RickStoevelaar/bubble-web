import { GRID_H, TILE, TUNING } from "../constants";
import { isSolid } from "../level";
import type { LevelData } from "../level";
import { Rng } from "../rng";
import type { GameState, PlayerState, SimEvent } from "../types";
import { stepBubbles } from "./bubbles";
import { PLAYER_SIZE, stepPlayer } from "./player";

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
    fireCooldown: 0,
    invulnTicks: 0,
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
      roundTicks: 0,
      hurryActive: false,
      nextId: 1,
    };
    this.loadRound(1);
  }

  /**
   * Rebuilds a Sim from a serialized state. The RNG stream is not part of the
   * state, so it is reseeded deterministically from the tick.
   */
  static restore(levels: LevelData[], state: GameState): Sim {
    const sim = new Sim(levels, state.tick, state.players.length === 2 ? 2 : 1);
    sim.state = structuredClone(state);
    sim.currentLevel = levels[state.round - 1]!;
    if (!Number.isFinite(sim.state.nextId)) {
      let maxId = 0;
      for (const b of sim.state.bubbles) maxId = Math.max(maxId, b.id);
      for (const e of sim.state.enemies) maxId = Math.max(maxId, e.id);
      for (const i of sim.state.items) maxId = Math.max(maxId, i.id);
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
    this.state.enemies = [];
    this.state.bubbles = [];
    this.state.items = [];
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

  /** One call = one 60 Hz tick. */
  step(buttons: [number, number]): SimEvent[] {
    const events: SimEvent[] = [];
    this.state.tick++;
    for (const p of this.state.players) {
      events.push(...stepPlayer(this, p, buttons[p.id]));
    }
    events.push(...stepBubbles(this, buttons));
    return events;
  }
}
