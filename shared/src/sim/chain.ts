import { TUNING } from "../constants";
import type { BubbleState, GameState, SimEvent } from "../types";
import { killTrapped } from "./enemies";
import { addScore, chainScore } from "./scoring";

/**
 * A player popped `start`. If it holds an enemy, every trapped bubble linked to it (centers within
 * chainRadius, breadth-first, candidates in ascending id order) pops in the same tick; the n-th enemy
 * scores chainScore(n) for the starter. `popped` collects every bubble id removed. Empty bubbles pop alone.
 */
export function popCascade(
  sim: { state: GameState },
  start: BubbleState,
  playerId: 0 | 1,
  popped: Set<number>,
  events: SimEvent[],
): void {
  const state = sim.state;
  const r2 = TUNING.chainRadius * TUNING.chainRadius;
  const candidates = state.bubbles.filter((b) => b.trapped && b.phase === "float" && !popped.has(b.id));
  candidates.sort((a, b) => a.id - b.id);
  const queue: BubbleState[] = [start];
  const seen = new Set<number>([start.id]);
  let n = 0;
  for (let i = 0; i < queue.length; i++) {
    const b = queue[i]!;
    popped.add(b.id);
    if (killTrapped(state, b)) events.push(...addScore(sim, playerId, chainScore(++n)));
    events.push({ kind: "pop", player: playerId, x: b.x, y: b.y });
    if (!start.trapped) continue;
    for (const c of candidates) {
      if (seen.has(c.id)) continue;
      const dx = c.x - b.x;
      const dy = c.y - b.y;
      if (dx * dx + dy * dy <= r2) {
        seen.add(c.id);
        queue.push(c);
      }
    }
  }
}
