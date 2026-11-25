import { FIELD_W, GRID_H, TILE, TUNING } from "../constants";
import { SECRET_ROOMS, levelForState } from "../levels/secret-rooms";
import type { LevelData } from "../level";
import type { GameState, ItemState, PlayerState, SecretState, SimEvent } from "../types";
import { platformSpots } from "./powers";
import { clearSpecials } from "./specials";

/**
 * Secret rooms: the door that opens after a clear, the warp into the treasure room, its countdown and the
 * return. No randomness is drawn anywhere in here; every position is computed from the layouts.
 */

export interface SecretSim {
  state: GameState;
  currentLevel: LevelData;
  levels: LevelData[];
  loadRound(n: number): void;
}

/** Score of treasure sprites 0..7, escalating. */
export const TREASURE_VALUES = [500, 1000, 2000, 3000, 4000, 5000, 6000, 8000] as const;

const nat = (v: unknown): number => (typeof v === "number" && Number.isFinite(v) && v >= 0 ? Math.floor(v) : 0);

/** The one constructor of SecretState (fresh and restored states share its key order). */
export function makeSecretState(index: 0 | 1 | 2, returnRound: number, ticksLeft: number, leaveTicks: number): SecretState {
  return { index, returnRound, ticksLeft, leaveTicks };
}

/** Restores a SecretState from a save: anything that is not a valid room index (or not an object) means "not in a room". */
export function repairSecret(raw: unknown): SecretState | null {
  if (typeof raw !== "object" || raw === null) return null;
  const r = raw as Record<string, unknown>;
  const index = r.index;
  if (index !== 0 && index !== 1 && index !== 2) return null;
  return makeSecretState(index, Math.max(1, nat(r.returnRound)), nat(r.ticksLeft), nat(r.leaveTicks));
}

/** The one constructor of items made here (same key order as spawnFood and repairItems). */
function makeItem(state: GameState, x: number, y: number, kind: ItemState["kind"], sprite: number, value: number, despawnTicks: number, onGround: boolean): ItemState {
  return { id: state.nextId++, x, y, vx: 0, vy: 0, onGround, kind, sprite, value, despawnTicks };
}

/** Lowest platform tile (two empty tiles above) nearest the field's horizontal center; the floor center if the level has none. */
function doorSpot(lv: LevelData): { tx: number; ty: number } {
  let best: { tx: number; ty: number } | null = null;
  let bestDist = 0;
  for (const s of platformSpots(lv)) {
    const dist = Math.abs(s.tx * TILE + TILE / 2 - FIELD_W / 2);
    if (best === null || s.ty > best.ty || (s.ty === best.ty && dist < bestDist)) {
      best = s;
      bestDist = dist;
    }
  }
  return best ?? { tx: FIELD_W / TILE / 2, ty: GRID_H - 2 };
}

/** Called when a real round clear begins: opens the secret door if this round has one and every present player earned it. */
export function maybeSpawnDoor(sim: Pick<SecretSim, "state" | "currentLevel">): void {
  const state = sim.state;
  const index = TUNING.secretDoorRounds.indexOf(state.round);
  if (index < 0 || state.secret) return;
  const present = state.players.filter((p) => p.state !== "gone");
  if (present.length === 0) return;
  if (!present.every((p) => p.deathlessSince <= state.round - TUNING.secretDoorDeathlessRounds)) return;
  const spot = doorSpot(sim.currentLevel);
  state.items.push(
    makeItem(state, spot.tx * TILE + TILE / 2, spot.ty * TILE - TUNING.itemSize / 2, "door", 0, 0, TUNING.secretDoorClearTicks + 1, true),
  );
}

/** Puts a player on its room spawn point (the body rests on the solid tile below). */
export function placeAtSecretSpawn(secret: SecretState, p: PlayerState): void {
  const s = SECRET_ROOMS[secret.index].spawn[p.id];
  p.x = s.col * TILE + TILE / 2;
  p.y = s.row * TILE + 1;
  p.vx = 0;
  p.vy = 0;
  p.onGround = true;
}

/** The treasure grid: 3 staggered rows near the top, spread evenly across the interior. Falls under item physics. */
function spawnTreasure(state: GameState, ttl: number): void {
  const n = TUNING.secretTreasureCount;
  const perRow = Math.ceil(n / 3);
  const left = 2 * TILE + TUNING.itemSize / 2;
  const span = FIELD_W - 4 * TILE - TUNING.itemSize - 8;
  const stagger = [0, 6, 3];
  for (let i = 0; i < n; i++) {
    const row = i % 3;
    const col = Math.floor(i / 3);
    const x = left + Math.floor((col * span) / Math.max(1, perRow - 1)) + stagger[row]!;
    const y = 2 * TILE + TUNING.itemSize / 2 + row * 16;
    state.items.push(makeItem(state, x, y, "treasure", i % 8, TREASURE_VALUES[i % 8]!, ttl, false));
  }
}

/** Warps everyone into the room picked by the current round's door and rains treasure. */
export function enterSecret(sim: Pick<SecretSim, "state" | "currentLevel">): void {
  const state = sim.state;
  const index = Math.max(0, TUNING.secretDoorRounds.indexOf(state.round)) as 0 | 1 | 2;
  const secret = makeSecretState(index, state.round, TUNING.secretRoomTicks, 0);
  state.secret = secret;
  sim.currentLevel = SECRET_ROOMS[index].level;
  state.enemies = [];
  state.bubbles = [];
  state.projectiles = [];
  state.items = [];
  clearSpecials(state);
  state.roundTicks = 0;
  state.hurryActive = false;
  state.specialTimer = TUNING.specialFirstDelayTicks;
  state.phase = "round";
  state.enemiesSeen = false;
  state.phaseTicks = 0;
  state.pendingRound = 0;
  for (const p of state.players) if (p.state !== "gone") placeAtSecretSpawn(secret, p);
  spawnTreasure(state, TUNING.secretRoomTicks + TUNING.secretLeaveDelayTicks);
}

/** Leaves the room for round returnRound + 1 (or ends the run after the last level, like a normal final clear). */
function leaveSecret(sim: SecretSim, events: SimEvent[]): void {
  const state = sim.state;
  const ret = state.secret!.returnRound;
  state.secret = null;
  events.push({ kind: "clear" });
  if (ret + 1 > sim.levels.length) {
    sim.currentLevel = levelForState(sim.levels, state);
    state.items = [];
    state.bubbles = [];
    state.phase = "ending";
    state.runOver = true;
  } else sim.loadRound(ret + 1);
}

/** One tick inside a room: counts the timer down and ends the room on expiry or after the treasure is gone. */
export function stepSecret(sim: SecretSim, events: SimEvent[]): void {
  const state = sim.state;
  const secret = state.secret!;
  if (--secret.ticksLeft <= 0) return leaveSecret(sim, events);
  if (state.items.some((i) => i.kind === "treasure")) secret.leaveTicks = 0;
  else if (++secret.leaveTicks >= TUNING.secretLeaveDelayTicks) leaveSecret(sim, events);
}
