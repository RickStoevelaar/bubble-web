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

/** The single entry point for every score change; grants extra lives and returns any "oneup" events. */
export function addScore(sim: { state: GameState }, player: 0 | 1, n: number): SimEvent[] {
  const events: SimEvent[] = [];
  const p = sim.state.players[player];
  if (!p) return events;
  p.score += n;
  while (p.score >= p.nextLifeAt) {
    if (p.lives < TUNING.maxLives) p.lives++;
    p.nextLifeAt += TUNING.extraLifeStep;
    events.push({ kind: "oneup", player });
  }
  return events;
}
