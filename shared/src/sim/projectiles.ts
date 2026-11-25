import { FIELD_H, TUNING } from "../constants";
import { solidAtPixel } from "../level";
import type { GameState, PlayerState, ProjectileState, SimEvent } from "../types";
import { killPlayer } from "./combat";
import type { EnemySim } from "./enemy-common";
import { PLAYER_SIZE } from "./player";

export function spawnProjectile(
  state: GameState,
  kind: ProjectileState["kind"],
  x: number,
  y: number,
  vx: number,
  vy: number,
): void {
  state.projectiles.push({ id: state.nextId++, x, y, vx, vy, kind, ageTicks: 0 });
}

function hits(p: PlayerState, pr: ProjectileState): boolean {
  const reach = (PLAYER_SIZE + TUNING.projectileSize) / 2;
  return Math.abs(pr.x - p.x) < reach && Math.abs(pr.y - p.y) < reach;
}

/** True when the projectile is spent: it hit a tile, left the field, ran out of range, or killed a player. */
function stepOne(sim: EnemySim, pr: ProjectileState, events: SimEvent[]): boolean {
  pr.ageTicks++;
  if (pr.kind === "rock") pr.vy = Math.min(pr.vy + TUNING.rockGravity, TUNING.rockMaxFall);
  pr.x += pr.vx;
  pr.y += pr.vy;
  if (pr.y - TUNING.projectileSize / 2 >= FIELD_H) return true;
  if (solidAtPixel(sim.currentLevel, pr.x, pr.y)) return true;
  if (pr.kind === "flame" && pr.ageTicks >= TUNING.flameRangeTicks) return true;
  for (const p of sim.state.players) {
    if (p.state !== "alive" || p.invulnTicks > 0) continue;
    if (hits(p, pr)) {
      killPlayer(p, events);
      return true;
    }
  }
  return false;
}

/** Advances every projectile one tick in id (insertion) order; spent ones are removed. */
export function stepProjectiles(sim: EnemySim): SimEvent[] {
  const events: SimEvent[] = [];
  sim.state.projectiles = sim.state.projectiles.filter((pr) => !stepOne(sim, pr, events));
  return events;
}
