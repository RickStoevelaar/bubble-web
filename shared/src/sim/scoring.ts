import { TUNING } from "../constants";
import type { EnemyType } from "../level";
import type { GameState, SimEvent } from "../types";

/** The food a popped enemy leaves behind: sprite index (0..7) and score value. "hurry" is never popped. */
export const FOOD_BY_ENEMY: Record<Exclude<EnemyType, "hurry">, { sprite: number; value: number }> = {
  walker: { sprite: 0, value: 100 },
  chaser: { sprite: 1, value: 200 },
  bouncer: { sprite: 4, value: 300 },
  thrower: { sprite: 5, value: 400 },
  breather: { sprite: 2, value: 500 },
  flyer: { sprite: 3, value: 700 },
  boss: { sprite: 7, value: 1000 },
};

/** Score of the n-th (1-based) enemy popped in one cascade: base * 2^(n-1), capped. Pure doubling loop. */
export function chainScore(n: number): number {
  let s: number = TUNING.chainBaseScore;
  for (let i = 1; i < n && s < TUNING.chainMaxScore; i++) s *= 2;
  return Math.min(s, TUNING.chainMaxScore);
}

/** First extra-life threshold strictly above `score` (used to repair saves lacking nextLifeAt). */
export function nextLifeThreshold(score: number): number {
  if (score < TUNING.firstExtraLifeScore) return TUNING.firstExtraLifeScore;
  const steps = Math.floor((score - TUNING.firstExtraLifeScore) / TUNING.extraLifeStep) + 1;
  return TUNING.firstExtraLifeScore + steps * TUNING.extraLifeStep;
}

/** Highest score a player can hold (realistic scores stay below 1e9); restore and addScore clamp to it. */
export const MAX_SCORE = 1e12;
/** A single addScore call reports at most this many "oneup" events (ordinary play crosses at most a handful). */
const MAX_ONEUP_EVENTS = 1000;

/**
 * The single entry point for every score change; grants extra lives and returns any "oneup" events.
 * One life (and one event) per threshold crossed, computed arithmetically so it terminates for any numbers: lives stop
 * at maxLives but the threshold still advances past the score. A non-finite or non-positive `nextLifeAt` (a damaged
 * state) is first recomputed from the score without granting anything; the score is capped at MAX_SCORE.
 */
export function addScore(sim: { state: GameState }, player: 0 | 1, n: number): SimEvent[] {
  const events: SimEvent[] = [];
  const p = sim.state.players[player];
  if (!p || !Number.isFinite(n) || n <= 0) return events;
  const base = Number.isFinite(p.score) ? p.score : 0;
  p.score = Math.min(MAX_SCORE, Math.max(0, base) + n);
  if (!Number.isFinite(p.nextLifeAt) || p.nextLifeAt <= 0) p.nextLifeAt = nextLifeThreshold(p.score);
  if (p.score >= p.nextLifeAt) {
    const k = Math.floor((p.score - p.nextLifeAt) / TUNING.extraLifeStep) + 1;
    if (p.lives < TUNING.maxLives) p.lives = Math.min(TUNING.maxLives, p.lives + k);
    p.nextLifeAt += k * TUNING.extraLifeStep;
    for (let i = 0; i < Math.min(k, MAX_ONEUP_EVENTS); i++) events.push({ kind: "oneup", player });
  }
  return events;
}
