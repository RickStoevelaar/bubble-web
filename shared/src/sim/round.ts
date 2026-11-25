import { FIELD_W, TUNING } from "../constants";
import type { GameState, SimEvent } from "../types";

export interface RoundSim {
  state: GameState;
  levels: unknown[];
  loadRound(n: number): void;
}

/** Spawns one invincible chaser per player that still has lives. */
function spawnHurryChasers(sim: RoundSim): void {
  const state = sim.state;
  for (const p of state.players) {
    if (p.state === "gone") continue;
    state.enemies.push({
      id: state.nextId++,
      type: "hurry",
      x: FIELD_W / 2,
      y: TUNING.enemySize / 2,
      vx: 0,
      vy: 0,
      dir: 1,
      state: "active",
      angry: false,
      spawnDelay: 0,
      onGround: false,
    });
  }
}

/** Hurry-up trigger, round-clear detection, the clearing countdown and game over. Runs after enemies step. */
export function stepRound(sim: RoundSim): SimEvent[] {
  const events: SimEvent[] = [];
  const state = sim.state;

  if (state.players.every((p) => p.state === "gone")) {
    state.phase = "gameover";
    return events;
  }

  if (state.phase === "round") {
    if (!state.hurryActive && state.roundTicks >= TUNING.hurryUpTicks) {
      state.hurryActive = true;
      spawnHurryChasers(sim);
      events.push({ kind: "hurry" });
    }
    const real = state.enemies.filter((e) => e.type !== "hurry" && e.state !== "dead");
    if (real.length > 0) state.enemiesSeen = true;
    else if (state.enemiesSeen) {
      state.phase = "clearing";
      state.phaseTicks = 0;
      state.enemies = state.enemies.filter((e) => e.type !== "hurry");
      events.push({ kind: "clear" });
    }
  } else if (state.phase === "clearing") {
    if (++state.phaseTicks >= TUNING.clearTicks) {
      if (state.round >= sim.levels.length) {
        state.phase = "ending";
        state.runOver = true;
      } else sim.loadRound(state.round + 1);
    }
  }
  return events;
}
