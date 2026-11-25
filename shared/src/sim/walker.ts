import { FIELD_H, FIELD_W, TILE, TUNING } from "../constants";
import { isSolid } from "../level";
import type { EnemyState } from "../types";
import { ENEMY_HALF, ENEMY_SIZE, angerScaled, nearestAlivePlayer, type Behavior, type EnemySim } from "./enemy-common";
import { moveBody } from "./physics";

/**
 * Walks in `dir` at `speedMult` times the walker speed, turns at walls, rolls
 * drop-or-turn at ledges, hops toward players above.
 */
export function walkWith(sim: EnemySim, e: EnemyState, speedMult: number): void {
  const lv = sim.currentLevel;
  if (e.onGround) {
    const target = sim.state.players.find(
      (p) =>
        p.state === "alive" &&
        p.onGround &&
        e.y - p.y >= TUNING.enemyHopMinRise &&
        e.y - p.y <= TUNING.enemyHopMaxRise &&
        Math.abs(p.x - e.x) < TUNING.enemyHopReach,
    );
    if (target && sim.rng.next() < TUNING.enemyHopChance) {
      e.vy = TUNING.jumpVel;
      e.onGround = false;
      e.dir = target.x >= e.x ? 1 : -1;
    } else if (!e.dropping) {
      const footRow = Math.floor((e.y + ENEMY_HALF + 1) / TILE);
      const aheadCol = Math.floor((e.x + e.dir * (TILE / 2)) / TILE);
      if (!isSolid(lv, aheadCol, footRow)) {
        if (sim.rng.next() < TUNING.enemyLedgeDropChance) e.dropping = true;
        else e.dir = e.dir === 1 ? -1 : 1;
      }
    }
  }
  e.vx = e.dir * angerScaled(TUNING.enemyWalkSpeed * speedMult, e);
  if (moveBody(lv, e, ENEMY_SIZE)) e.dir = e.dir === 1 ? -1 : 1;
  if (!e.onGround) e.dropping = false;
}

export const walker: Behavior = (sim, e) => walkWith(sim, e, 1);

/**
 * Walker physics, but while grounded on the same platform row as the nearest
 * alive player it keeps its direction toward them (re-aimed every few ticks,
 * staggered by id, so it does not jitter), and it is faster.
 */
export const chaser: Behavior = (sim, e) => {
  if (e.onGround && (sim.state.roundTicks + e.id) % TUNING.chaserRetargetTicks === 0) {
    const t = nearestAlivePlayer(sim.state, e);
    if (t && Math.abs(t.y - e.y) <= TUNING.chaserRowBand && Math.abs(t.x - e.x) > TUNING.chaserDeadZone) {
      e.dir = t.x > e.x ? 1 : -1;
    }
  }
  walkWith(sim, e, TUNING.chaserSpeedMult);
};

/** Hurry-up ghost: pursues the nearest alive player along one axis per tick, through tiles, inside the field. */
export const hurryChaser: Behavior = (sim, e) => {
  const target = nearestAlivePlayer(sim.state, e);
  if (!target) return;
  const dx = target.x - e.x;
  const dy = target.y - e.y;
  const s = TUNING.hurryChaserSpeed;
  if (Math.abs(dx) >= Math.abs(dy)) e.x += Math.min(Math.abs(dx), s) * Math.sign(dx);
  else e.y += Math.min(Math.abs(dy), s) * Math.sign(dy);
  e.x = Math.min(FIELD_W - ENEMY_HALF, Math.max(ENEMY_HALF, e.x));
  e.y = Math.min(FIELD_H - ENEMY_HALF, Math.max(ENEMY_HALF, e.y));
};
