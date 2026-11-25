import { TILE, TUNING } from "../constants";
import { isSolid } from "../level";
import type { LevelData } from "../level";
import type { BubbleState, EnemyState, GameState, SimEvent } from "../types";
import { beginEnding } from "./boss";
import { addScore } from "./scoring";

/*
 * Thunder shots: the bubbles fired in a boss round. A shot flies straight in the launch phase, never floats,
 * never traps and is never popped by a player; it vanishes at a solid tile or at the end of its range, and hurts
 * only the boss. No randomness is drawn here.
 */

const R = TUNING.bubbleRadius;
const BOSS_HALF = TUNING.bossSize / 2;

export interface ThunderSim {
  state: GameState;
  currentLevel: LevelData;
}

function shotRange(state: GameState, b: BubbleState): number {
  const long = state.players[b.owner]?.powers.longBubble === true;
  return Math.round(TUNING.thunderShotTicks * (long ? TUNING.longBubbleMult : 1));
}

/** The boss a shot at (b.x, b.y) hurts: active, not staggered, overlapping its body. */
function bossHitBy(state: GameState, b: BubbleState): EnemyState | undefined {
  return state.enemies.find(
    (e) =>
      e.type === "boss" &&
      e.state === "active" &&
      (e.stun ?? 0) <= 0 &&
      Math.abs(b.x - e.x) < BOSS_HALF + R &&
      Math.abs(b.y - e.y) < BOSS_HALF + R,
  );
}

/** The boss dies: the field is cleared, the last shooter scores, and the run enters its ending. */
function killBoss(sim: ThunderSim, shooter: 0 | 1, events: SimEvent[]): void {
  const state = sim.state;
  state.enemies = [];
  state.projectiles = [];
  state.effects = [];
  state.bubbles = [];
  events.push(...addScore(sim, shooter, TUNING.bossKillScore));
  events.push({ kind: "clear" });
  beginEnding(state);
}

/**
 * Moves every shot one tick in ascending id order (the bubble array is in id order), resolves boss hits and removes
 * spent shots. A hit costs the boss 1 hp and staggers it; a boss at 0 hp dies at once and ends the shot pass.
 */
export function stepShots(sim: ThunderSim, events: SimEvent[]): void {
  const state = sim.state;
  if (state.phase === "ending" || !state.bubbles.some((b) => b.shot)) return;
  const spent = new Set<number>();
  for (const b of state.bubbles) {
    if (!b.shot) continue;
    b.ageTicks++;
    const nx = b.x + b.vx;
    if (isSolid(sim.currentLevel, Math.floor((nx + Math.sign(b.vx) * R) / TILE), Math.floor(b.y / TILE))) {
      spent.add(b.id);
      continue;
    }
    b.x = nx;
    const boss = bossHitBy(state, b);
    if (boss) {
      spent.add(b.id);
      boss.hp = (boss.hp ?? 1) - 1;
      boss.stun = TUNING.bossStunTicks;
      events.push({ kind: "pop", player: b.owner, x: b.x, y: b.y });
      events.push(...addScore(sim, b.owner, TUNING.bossHitScore));
      if (boss.hp <= 0) return killBoss(sim, b.owner, events);
    } else if (b.ageTicks >= shotRange(state, b)) spent.add(b.id);
  }
  if (spent.size > 0) state.bubbles = state.bubbles.filter((b) => !spent.has(b.id));
}
