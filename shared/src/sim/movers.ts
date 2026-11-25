import { FIELD_H, GRID_H, TILE, TUNING } from "../constants";
import { isSolid } from "../level";
import type { LevelData } from "../level";
import type { EnemyState } from "../types";
import { ENEMY_HALF, angerScaled, nearestAlivePlayer, type Behavior, type EnemySim } from "./enemy-common";

const EPS = 0.001;

/**
 * A side wall column is solid on every row (the level border). Platforms and
 * floor slabs are not: flying and bouncing bodies pass through them.
 */
function isSideWall(lv: LevelData, tx: number): boolean {
  for (let ty = 0; ty < GRID_H; ty++) if (!isSolid(lv, tx, ty)) return false;
  return true;
}

/**
 * Horizontal move by `dx` that stops only at side wall columns. Returns true
 * if a wall stopped it.
 */
function moveThroughPlatforms(sim: EnemySim, e: EnemyState, dx: number): boolean {
  const lv = sim.currentLevel;
  let nx = e.x + dx;
  let hit = false;
  if (dx > 0) {
    const tx = Math.floor((nx + ENEMY_HALF - EPS) / TILE);
    if (isSideWall(lv, tx)) {
      nx = tx * TILE - ENEMY_HALF;
      hit = true;
    }
  } else if (dx < 0) {
    const tx = Math.floor((nx - ENEMY_HALF) / TILE);
    if (isSideWall(lv, tx)) {
      nx = (tx + 1) * TILE + ENEMY_HALF;
      hit = true;
    }
  }
  e.x = nx;
  return hit;
}

/** Constant diagonal flight through platforms; reflects at wall columns, the ceiling and the floor of the field. */
export const bouncer: Behavior = (sim, e) => {
  if (e.vy === 0) e.vy = sim.rng.next() < 0.5 ? -1 : 1;
  const speed = angerScaled(TUNING.bouncerSpeed, e);
  e.onGround = false;
  e.dropping = false;
  if (moveThroughPlatforms(sim, e, e.dir * speed)) e.dir = e.dir === 1 ? -1 : 1;
  let vy = (e.vy < 0 ? -1 : 1) * speed;
  e.y += vy;
  if (e.y - ENEMY_HALF < 0) {
    e.y = ENEMY_HALF;
    vy = Math.abs(vy);
  } else if (e.y + ENEMY_HALF > FIELD_H) {
    e.y = FIELD_H - ENEMY_HALF;
    vy = -Math.abs(vy);
  }
  e.vx = e.dir * speed;
  e.vy = vy;
};

/**
 * Integer-tick triangle wave in [-amplitude, amplitude]: reproducible bit for
 * bit (no trig), phase-shifted per enemy so a pack does not bob in lockstep.
 */
export function bobOffset(roundTicks: number, id: number): number {
  const period = TUNING.flyerBobPeriod;
  const phase = (roundTicks + id * TUNING.flyerBobIdStride) % period;
  const tri = phase < period / 2 ? phase : period - phase; // 0..period/2
  return (tri / (period / 4) - 1) * TUNING.flyerBobAmplitude;
}

/** Flies straight at the nearest alive player (aimed at a bobbing point), through platforms but not wall columns. */
export const flyer: Behavior = (sim, e) => {
  e.onGround = false;
  e.dropping = false;
  const target = nearestAlivePlayer(sim.state, e);
  if (!target) {
    e.vx = 0;
    e.vy = 0;
    return;
  }
  const dx = target.x - e.x;
  const dy = target.y + bobOffset(sim.state.roundTicks, e.id) - e.y;
  const dist = Math.sqrt(dx * dx + dy * dy);
  const step = Math.min(dist, angerScaled(TUNING.flyerSpeed, e));
  const sx = dist === 0 ? 0 : (dx / dist) * step;
  const sy = dist === 0 ? 0 : (dy / dist) * step;
  moveThroughPlatforms(sim, e, sx);
  e.y = Math.min(FIELD_H - ENEMY_HALF, Math.max(ENEMY_HALF, e.y + sy));
  e.vx = sx;
  e.vy = sy;
  if (sx !== 0) e.dir = sx > 0 ? 1 : -1;
};
