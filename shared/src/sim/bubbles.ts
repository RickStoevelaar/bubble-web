import { FIELD_H, TILE, TUNING } from "../constants";
import { isSolid } from "../level";
import type { Rng } from "../rng";
import type { LevelData } from "../level";
import { BTN } from "../types";
import type { BubbleState, GameState, SimEvent } from "../types";
import { popCascade } from "./chain";
import { bubbleTouchesEnemy, releaseTrapped, trapEnemy } from "./enemies";
import { PLAYER_SIZE } from "./player";
import { stepShots } from "./thunder";
import { popSpecial, specialInward } from "./specials";

const R = TUNING.bubbleRadius;
const HALF = PLAYER_SIZE / 2;

function driftAt(lv: LevelData, b: BubbleState): { dx: number; dy: number } | undefined {
  const col = Math.floor(b.x / TILE);
  const row = Math.floor(b.y / TILE);
  return lv.drift.find((d) => d.col === col && d.row === row);
}

function launchTicks(state: GameState, b: BubbleState): number {
  const long = state.players[b.owner]?.powers.longBubble === true;
  return Math.round(TUNING.bubbleLaunchTicks * (long ? TUNING.longBubbleMult : 1));
}

function startFloat(b: BubbleState): void {
  b.phase = "float";
  b.vx = 0;
  b.vy = -TUNING.bubbleRise;
}

/** A launch-phase bubble captures the first active enemy it overlaps and starts floating. */
function tryTrap(state: GameState, b: BubbleState): void {
  const e = state.enemies.find((en) => en.state === "active" && en.type !== "hurry" && en.type !== "boss" && bubbleTouchesEnemy(b, en));
  if (!e) return;
  trapEnemy(b, e);
  startFloat(b);
}

/** Keeps a float-phase bubble inside walls and below the ceiling, above floors and inside the field (bubbles never wrap). */
function constrain(lv: LevelData, b: BubbleState): void {
  const left = Math.floor((b.x - R) / TILE);
  if (isSolid(lv, left, Math.floor(b.y / TILE))) b.x = (left + 1) * TILE + R;
  const right = Math.floor((b.x + R) / TILE);
  if (isSolid(lv, right, Math.floor(b.y / TILE))) b.x = right * TILE - R;
  const top = Math.floor((b.y - R) / TILE);
  if (isSolid(lv, Math.floor(b.x / TILE), top)) {
    b.y = (top + 1) * TILE + R;
    if (b.vy < 0) b.vy = 0;
  }
  if (b.vy > 0) {
    const bottom = Math.floor((b.y + R) / TILE);
    if (isSolid(lv, Math.floor(b.x / TILE), bottom)) {
      b.y = bottom * TILE - R;
      b.vy = 0;
    }
  }
  if (b.y > FIELD_H - R) {
    b.y = FIELD_H - R;
    if (b.vy > 0) b.vy = 0;
  }
  if (b.y < R) {
    b.y = R;
    if (b.vy < 0) b.vy = 0;
  }
}

/** Advances all bubbles one tick and resolves player contact. Returns events. */
export function stepBubbles(
  sim: { currentLevel: LevelData; state: GameState; levels: unknown[]; rng: Rng },
  buttons: [number, number] = [0, 0],
): SimEvent[] {
  const events: SimEvent[] = [];
  const lv = sim.currentLevel;
  const state = sim.state;
  const dead = new Set<number>();

  stepShots(sim, events);
  for (const b of state.bubbles) {
    if (b.shot) continue; // thunder shots are stepped (and removed) by stepShots
    b.ageTicks++;
    if (b.ageTicks >= (b.kind === "normal" ? TUNING.bubbleLifeTicks : TUNING.specialBubbleLifeTicks)) {
      dead.add(b.id);
      releaseTrapped(state, b);
      events.push({ kind: "pop", x: b.x, y: b.y });
      continue;
    }
    if (b.trapped && b.phase === "float") {
      b.trapped.escapeIn--;
      if (b.trapped.escapeIn <= 0) {
        dead.add(b.id);
        releaseTrapped(state, b);
        events.push({ kind: "pop", x: b.x, y: b.y });
        continue;
      }
    }
    if (b.phase === "launch") {
      const nx = b.x + b.vx;
      const edge = Math.floor((nx + Math.sign(b.vx) * R) / TILE);
      if (isSolid(lv, edge, Math.floor(b.y / TILE))) {
        startFloat(b);
      } else {
        b.x = nx;
        if (b.ageTicks >= launchTicks(state, b)) startFloat(b);
      }
      if (!b.trapped) tryTrap(state, b);
      continue;
    }
    const d = driftAt(lv, b);
    b.vx = b.vx * TUNING.bubbleDamping + (d ? d.dx * TUNING.bubbleDriftStrength : 0) + specialInward(b);
    b.vy =
      -TUNING.bubbleRise +
      (b.vy + TUNING.bubbleRise) * TUNING.bubbleDamping +
      (d ? d.dy * TUNING.bubbleDriftStrength : 0);
    b.x += b.vx;
    b.y += b.vy;
    constrain(lv, b);
  }

  // Stacking: pairwise separation in id order (the array is kept in id order).
  const floaters = state.bubbles.filter((b) => b.phase === "float" && !dead.has(b.id));
  const diameter = 2 * R;
  for (let i = 0; i < floaters.length; i++) {
    for (let j = i + 1; j < floaters.length; j++) {
      const a = floaters[i]!;
      const c = floaters[j]!;
      let dx = c.x - a.x;
      let dy = c.y - a.y;
      const dist = Math.sqrt(dx * dx + dy * dy);
      if (dist >= diameter) continue;
      if (dist < 1e-6) {
        dx = 1;
        dy = 0;
      } else {
        dx /= dist;
        dy /= dist;
      }
      const push = ((diameter - dist) * TUNING.bubbleStackPush) / 2;
      a.x -= dx * push;
      a.y -= dy * push;
      c.x += dx * push;
      c.y += dy * push;
      constrain(lv, a);
      constrain(lv, c);
    }
  }

  // Player contact: bounce when jump is held while not rising, otherwise pop.
  for (const p of state.players) {
    if (p.state !== "alive") continue;
    const jump = (buttons[p.id] & BTN.J) !== 0;
    for (const b of floaters) {
      if (dead.has(b.id)) continue;
      if (Math.abs(b.x - p.x) >= HALF + R || Math.abs(b.y - p.y) >= HALF + R) continue;
      if (b.kind === "letter") {
        popSpecial(sim, b, p, dead, events);
        continue;
      }
      if (jump && p.vy >= 0) {
        p.vy = TUNING.bubbleBounceVel;
        p.onGround = false;
        events.push({ kind: "bounce", player: p.id, x: b.x, y: b.y });
        break;
      }
      if (b.kind === "normal") popCascade(sim, b, p.id, dead, events);
      else popSpecial(sim, b, p, dead, events);
    }
  }

  if (dead.size > 0) state.bubbles = state.bubbles.filter((b) => !dead.has(b.id));
  return events;
}
