import { TUNING } from "../constants";
import type { LevelData } from "../level";
import { BTN } from "../types";
import type { BubbleState, PlayerState, SimEvent } from "../types";
import { moveBody } from "./physics";

/** Player body is a square of this many pixels, centered on (x, y). */
export const PLAYER_SIZE = 14;

/**
 * Advances one player by one tick. Depends only on its arguments and
 * `sim.currentLevel`, so client-side prediction can reuse it.
 */
export function stepPlayer(
  sim: { currentLevel: LevelData; state: { bubbles: BubbleState[]; nextId: number } },
  p: PlayerState,
  buttons: number,
): SimEvent[] {
  const events: SimEvent[] = [];
  if (p.state !== "alive") return events;
  const lv = sim.currentLevel;
  const counters = p.counters ?? (p.counters = { bubbles: 0, jumps: 0, distance: 0 });
  const x0 = Math.floor(p.x);
  if (p.fireCooldown > 0) p.fireCooldown--;

  const dir = ((buttons & BTN.R) !== 0 ? 1 : 0) - ((buttons & BTN.L) !== 0 ? 1 : 0);
  const speed = TUNING.walkSpeed * (p.powers.speed ? TUNING.speedPowerMult : 1);
  p.vx = dir * speed;
  if (dir !== 0) p.facing = dir > 0 ? 1 : -1;

  if ((buttons & BTN.J) !== 0 && p.onGround) {
    p.vy = TUNING.jumpVel;
    p.onGround = false;
    counters.jumps++;
    events.push({ kind: "jump", player: p.id, x: p.x, y: p.y });
  }

  if ((buttons & BTN.F) !== 0 && p.fireCooldown === 0) {
    const launch = TUNING.bubbleLaunchSpeed * (p.powers.fastBubble ? TUNING.fastBubbleMult : 1);
    sim.state.bubbles.push({
      id: sim.state.nextId++,
      x: p.x + p.facing * TUNING.bubbleSpawnOffset,
      y: p.y,
      vx: p.facing * launch,
      vy: 0,
      kind: "normal",
      phase: "launch",
      ageTicks: 0,
      owner: p.id,
    });
    p.fireCooldown = Math.round(TUNING.fireCooldownTicks * (p.powers.rapidFire ? 0.5 : 1));
    counters.bubbles++;
    events.push({ kind: "fire", player: p.id, x: p.x, y: p.y });
  }

  moveBody(lv, p, PLAYER_SIZE);
  counters.distance += Math.abs(Math.floor(p.x) - x0);

  return events;
}
