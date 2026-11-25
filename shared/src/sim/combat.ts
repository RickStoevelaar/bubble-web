import { TUNING } from "../constants";
import type { PlayerState, SimEvent } from "../types";

/** The one player death path: enemy contact and projectile hits both end up here. */
export function killPlayer(p: PlayerState, events: SimEvent[]): void {
  p.state = "dying";
  p.stateTicks = TUNING.playerDyingTicks;
  p.lives--;
  p.vx = 0;
  p.vy = 0;
  p.powers = { speed: false, fastBubble: false, longBubble: false, rapidFire: false };
  p.ringTicks = 0;
  events.push({ kind: "die", player: p.id, x: p.x, y: p.y });
}
