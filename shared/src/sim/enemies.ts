import { TUNING } from "../constants";
import type { BubbleState, EnemyState, GameState, SimEvent } from "../types";
import { killPlayer } from "./combat";
import { ENEMY_HALF as HALF, ENEMY_SIZE as SIZE, type Behavior, type EnemySim } from "./enemy-common";
import { spawnFood } from "./items";
import { bouncer, flyer } from "./movers";
import { moveBody } from "./physics";
import { PLAYER_SIZE } from "./player";
import { stepProjectiles } from "./projectiles";
import { breather, resetShooterTimers, thrower } from "./shooters";
import { chaser, hurryChaser, walker } from "./walker";

export type { EnemySim } from "./enemy-common";

/** Per-type behavior table. `boss` stays a walker until its own task. */
export const ENEMY_BEHAVIORS: Record<EnemyState["type"], Behavior> = {
  walker,
  chaser,
  thrower,
  breather,
  bouncer,
  flyer,
  boss: walker,
  hurry: hurryChaser,
};

function enemyOf(state: GameState, b: BubbleState): EnemyState | undefined {
  return b.trapped ? state.enemies.find((e) => e.id === b.trapped!.enemyId) : undefined;
}

/** True if the bubble overlaps the enemy's body. */
export function bubbleTouchesEnemy(b: BubbleState, e: EnemyState): boolean {
  const reach = HALF + TUNING.bubbleRadius;
  return Math.abs(b.x - e.x) < reach && Math.abs(b.y - e.y) < reach;
}

/** Captures an enemy in a bubble. */
export function trapEnemy(b: BubbleState, e: EnemyState): void {
  e.state = "trapped";
  e.vx = 0;
  e.vy = 0;
  resetShooterTimers(e);
  b.trapped = { type: e.type, escapeIn: TUNING.bubbleEscapeTicks, enemyId: e.id };
}

/** The bubble is gone without a player pop: the enemy breaks out, angry. */
export function releaseTrapped(state: GameState, b: BubbleState): void {
  const e = enemyOf(state, b);
  if (!e || e.state !== "trapped") return;
  e.state = "active";
  e.angry = true;
  e.x = b.x;
  e.y = b.y;
  e.vx = 0;
  e.vy = 0;
  e.onGround = false;
  e.dropping = false;
  resetShooterTimers(e);
}

/** A player popped the bubble: the enemy dies (arcs away). Returns whether an enemy was killed (scoring is the caller's). */
export function killTrapped(state: GameState, b: BubbleState): boolean {
  const e = enemyOf(state, b);
  if (!e || e.state !== "trapped") return false;
  e.state = "dead";
  e.x = b.x;
  e.y = b.y;
  e.vx = e.dir * TUNING.enemyDeathSpeed;
  e.vy = TUNING.enemyDeathVel;
  e.onGround = false;
  e.deadTicks = 0;
  return true;
}

/** Advances every enemy one tick, applies anger rules and enemy-player contact. */
export function stepEnemies(sim: EnemySim): SimEvent[] {
  const events: SimEvent[] = [];
  const state = sim.state;

  for (const e of state.enemies) {
    switch (e.state) {
      case "spawning":
        if (e.spawnDelay > 0) e.spawnDelay--;
        if (e.spawnDelay === 0) e.state = "active";
        break;
      case "active":
        ENEMY_BEHAVIORS[e.type](sim, e);
        break;
      case "trapped": {
        const b = state.bubbles.find((x) => x.trapped?.enemyId === e.id);
        if (b) {
          e.x = b.x;
          e.y = b.y;
        } else {
          e.state = "active";
          e.angry = true;
          resetShooterTimers(e);
        }
        break;
      }
      case "dead":
        e.deadTicks = (e.deadTicks ?? 0) + 1;
        moveBody(sim.currentLevel, e, SIZE);
        break;
    }
  }
  // A dead enemy leaves once its arc ends; each one becomes exactly one food item (array order = id order).
  state.enemies = state.enemies.filter((e) => {
    if (e.state !== "dead" || !(e.onGround || (e.deadTicks ?? 0) >= TUNING.enemyDeathMaxTicks)) return true;
    spawnFood(state, e);
    return false;
  });

  const living = state.enemies.filter((e) => e.state !== "dead" && e.type !== "hurry");
  const roundLate = state.roundTicks > TUNING.roundAngerTicks;
  for (const e of living) if (living.length === 1 || roundLate) e.angry = true;

  const reach = (SIZE + PLAYER_SIZE) / 2;
  for (const p of state.players) {
    if (p.state !== "alive" || p.invulnTicks > 0) continue;
    for (const e of state.enemies) {
      if (e.state !== "active") continue;
      if (Math.abs(e.x - p.x) < reach && Math.abs(e.y - p.y) < reach) {
        killPlayer(p, events);
        break;
      }
    }
  }
  events.push(...stepProjectiles(sim));
  return events;
}
