import { TILE, TUNING } from "../constants";
import { isSolid } from "../level";
import type { LevelData } from "../level";
import type { Rng } from "../rng";
import type { BubbleState, EnemyState, GameState, PlayerState, SimEvent } from "../types";
import { moveBody } from "./physics";
import { PLAYER_SIZE } from "./player";

const SIZE = TUNING.enemySize;
const HALF = SIZE / 2;

export interface EnemySim {
  currentLevel: LevelData;
  state: GameState;
  rng: Rng;
}

type Behavior = (sim: EnemySim, e: EnemyState) => void;

function enemySpeed(e: EnemyState): number {
  return TUNING.enemyWalkSpeed * (e.angry ? TUNING.angerSpeedMult : 1);
}

/** Walks in `dir`, turns at walls, rolls drop-or-turn at ledges, hops toward players above. */
function walker(sim: EnemySim, e: EnemyState): void {
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
      const footRow = Math.floor((e.y + HALF + 1) / TILE);
      const aheadCol = Math.floor((e.x + e.dir * (TILE / 2)) / TILE);
      if (!isSolid(lv, aheadCol, footRow)) {
        if (sim.rng.next() < TUNING.enemyLedgeDropChance) e.dropping = true;
        else e.dir = e.dir === 1 ? -1 : 1;
      }
    }
  }
  e.vx = e.dir * enemySpeed(e);
  if (moveBody(lv, e, SIZE)) e.dir = e.dir === 1 ? -1 : 1;
  if (!e.onGround) e.dropping = false;
}

/** Per-type behavior table. Only the walker exists so far; later tasks fill in the rest. */
export const ENEMY_BEHAVIORS: Record<EnemyState["type"], Behavior> = {
  walker,
  chaser: walker,
  thrower: walker,
  breather: walker,
  bouncer: walker,
  flyer: walker,
  boss: walker,
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
}

/** A player popped the bubble: the enemy dies (arcs away) and the player scores. */
export function killTrapped(state: GameState, b: BubbleState, playerId: 0 | 1): void {
  const e = enemyOf(state, b);
  if (!e || e.state !== "trapped") return;
  e.state = "dead";
  e.x = b.x;
  e.y = b.y;
  e.vx = e.dir * TUNING.enemyDeathSpeed;
  e.vy = TUNING.enemyDeathVel;
  e.onGround = false;
  e.deadTicks = 0;
  const p = state.players[playerId];
  if (p) p.score += TUNING.enemyPopScore;
}

function killPlayer(p: PlayerState, events: SimEvent[]): void {
  p.state = "dying";
  p.stateTicks = TUNING.playerDyingTicks;
  p.lives--;
  p.vx = 0;
  p.vy = 0;
  events.push({ kind: "die", player: p.id, x: p.x, y: p.y });
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
        }
        break;
      }
      case "dead":
        e.deadTicks = (e.deadTicks ?? 0) + 1;
        moveBody(sim.currentLevel, e, SIZE);
        break;
    }
  }
  state.enemies = state.enemies.filter(
    (e) => !(e.state === "dead" && (e.onGround || (e.deadTicks ?? 0) >= TUNING.enemyDeathMaxTicks)),
  );

  const living = state.enemies.filter((e) => e.state !== "dead");
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
  return events;
}
