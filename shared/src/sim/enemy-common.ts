import { TUNING } from "../constants";
import type { LevelData } from "../level";
import type { Rng } from "../rng";
import type { EnemyState, GameState, PlayerState } from "../types";

export const ENEMY_SIZE = TUNING.enemySize;
export const ENEMY_HALF = ENEMY_SIZE / 2;

export interface EnemySim {
  currentLevel: LevelData;
  state: GameState;
  rng: Rng;
}

export type Behavior = (sim: EnemySim, e: EnemyState) => void;

/** Walk/fly speed with the anger multiplier applied. */
export function angerScaled(base: number, e: EnemyState): number {
  return base * (e.angry ? TUNING.angerSpeedMult : 1);
}

/** Nearest alive player by Manhattan distance (first in id order on ties), or undefined. */
export function nearestAlivePlayer(state: GameState, e: EnemyState): PlayerState | undefined {
  let target: PlayerState | undefined;
  let best = Infinity;
  for (const p of state.players) {
    if (p.state !== "alive") continue;
    const d = Math.abs(p.x - e.x) + Math.abs(p.y - e.y);
    if (d < best) {
      best = d;
      target = p;
    }
  }
  return target;
}

/** Starts the death arc of an enemy that a player (or a power) popped; its food spawns when the arc ends. */
export function startDeath(e: EnemyState): void {
  e.state = "dead";
  e.vx = e.dir * TUNING.enemyDeathSpeed;
  e.vy = TUNING.enemyDeathVel;
  e.onGround = false;
  e.deadTicks = 0;
}
