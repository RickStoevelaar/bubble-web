import { TILE, TUNING } from "../constants";
import type { EnemyState, PlayerState } from "../types";
import { ENEMY_HALF, ENEMY_SIZE, nearestAlivePlayer, type Behavior, type EnemySim } from "./enemy-common";
import { moveBody } from "./physics";
import { spawnProjectile } from "./projectiles";
import { walkWith } from "./walker";

interface ShooterSpec {
  speedMult: number;
  cooldownTicks: number;
  initialDelayMin: number;
  initialDelayMax: number;
  windupTicks: number;
  /** Whether the target is worth winding up for. */
  inReach(e: EnemyState, target: PlayerState): boolean;
  fire(sim: EnemySim, e: EnemyState): void;
}

const faceToward = (e: EnemyState, t: PlayerState): void => {
  if (t.x !== e.x) e.dir = t.x > e.x ? 1 : -1;
};

/**
 * Walker that periodically stops (wind-up), turns to the nearest alive player
 * and fires. `cooldown` is unset until the first active tick, then drawn from
 * the rng; trapping or escaping clears both timers (see enemies.ts).
 */
function shooter(sim: EnemySim, e: EnemyState, spec: ShooterSpec): void {
  if (e.cooldown === undefined) {
    e.cooldown = spec.initialDelayMin + sim.rng.int(spec.initialDelayMax - spec.initialDelayMin);
  }
  if ((e.windup ?? 0) > 0) {
    e.vx = 0;
    moveBody(sim.currentLevel, e, ENEMY_SIZE);
    if (--e.windup! === 0) {
      const t = nearestAlivePlayer(sim.state, e);
      if (t) faceToward(e, t);
      spec.fire(sim, e);
      e.cooldown = spec.cooldownTicks;
    }
    return;
  }
  if (e.cooldown > 0) e.cooldown--;
  if (e.cooldown === 0 && e.onGround) {
    const t = nearestAlivePlayer(sim.state, e);
    if (t && spec.inReach(e, t)) {
      faceToward(e, t);
      e.windup = spec.windupTicks;
      e.vx = 0;
      moveBody(sim.currentLevel, e, ENEMY_SIZE);
      return;
    }
  }
  walkWith(sim, e, spec.speedMult);
}

const THROWER: ShooterSpec = {
  speedMult: 1,
  cooldownTicks: TUNING.throwerCooldownTicks,
  initialDelayMin: TUNING.throwerInitialDelayMin,
  initialDelayMax: TUNING.throwerInitialDelayMax,
  windupTicks: TUNING.throwWindupTicks,
  inReach: () => true,
  fire(sim, e) {
    spawnProjectile(sim.state, "rock", e.x, e.y, e.dir * TUNING.rockSpeedX, TUNING.rockLaunchVy);
  },
};

const BREATHER: ShooterSpec = {
  speedMult: TUNING.breatherSpeedMult,
  cooldownTicks: TUNING.breatherCooldownTicks,
  initialDelayMin: TUNING.breatherInitialDelayMin,
  initialDelayMax: TUNING.breatherInitialDelayMax,
  windupTicks: TUNING.breatherWindupTicks,
  // Same or an adjacent platform row.
  inReach: (e, t) => Math.abs(t.y - e.y) <= TUNING.flameRowBand,
  fire(sim, e) {
    spawnProjectile(sim.state, "flame", e.x + e.dir * (ENEMY_HALF + TILE / 4), e.y, e.dir * TUNING.flameSpeed, 0);
  },
};

export const thrower: Behavior = (sim, e) => shooter(sim, e, THROWER);
export const breather: Behavior = (sim, e) => shooter(sim, e, BREATHER);

/**
 * Called when a shooter is trapped or escapes: cancels any wind-up and, on
 * release, leaves a full cooldown so it never fires straight out of its bubble.
 */
export function resetShooterTimers(e: EnemyState): void {
  if (e.type !== "thrower" && e.type !== "breather") return;
  e.windup = 0;
  e.cooldown = e.type === "thrower" ? THROWER.cooldownTicks : BREATHER.cooldownTicks;
}
