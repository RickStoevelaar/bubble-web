import { TUNING } from "../constants";
import type { EnemyState, GameState, ItemState, SimEvent } from "../types";
import { moveBody } from "./physics";
import { PLAYER_SIZE } from "./player";
import { applyPower, isPowerId, type PowerSim } from "./powers";
import { FOOD_BY_ENEMY, addScore } from "./scoring";

/** Drops the food of a popped enemy where its death arc ended (bottoms aligned, since items are smaller). */
export function spawnFood(state: GameState, e: EnemyState): void {
  if (e.type === "hurry") return;
  const food = FOOD_BY_ENEMY[e.type];
  state.items.push({
    id: state.nextId++,
    x: e.x,
    y: e.y + (TUNING.enemySize - TUNING.itemSize) / 2,
    vx: 0,
    vy: 0,
    onGround: false,
    kind: "food",
    sprite: food.sprite,
    value: food.value,
    despawnTicks: TUNING.foodTtlTicks,
  });
}

/**
 * Falls, ages and collects every item in id (array) order; the lower player id wins a shared item.
 * A collected power may add items (the flask's food rain): those join after the loop and start next tick.
 */
export function stepItems(sim: PowerSim): SimEvent[] {
  const events: SimEvent[] = [];
  const state = sim.state;
  const reach = (TUNING.itemSize + PLAYER_SIZE) / 2;
  const current = [...state.items];
  const kept: ItemState[] = [];
  for (const it of current) {
    if (--it.despawnTicks <= 0) continue;
    moveBody(sim.currentLevel, it, TUNING.itemSize);
    const p = state.players.find(
      (q) => q.state === "alive" && Math.abs(q.x - it.x) < reach && Math.abs(q.y - it.y) < reach,
    );
    if (!p) {
      kept.push(it);
      continue;
    }
    events.push({ kind: "collect", player: p.id, x: it.x, y: it.y }, ...addScore(sim, p.id, it.value));
    if (it.kind === "power" && it.power) applyPower(sim, p, it.power, events);
  }
  state.items = kept.concat(state.items.slice(current.length));
  return events;
}

const KINDS: readonly string[] = ["food", "power", "treasure"];
const num = (v: unknown, d: number): number => (typeof v === "number" && Number.isFinite(v) ? v : d);

/**
 * Restores items from an older or damaged save: unpositioned ones are dropped, missing fields get food
 * defaults, counts are clamped, and a power item without a valid power is dropped.
 */
export function repairItems(raw: unknown): ItemState[] {
  if (!Array.isArray(raw)) return [];
  const out: ItemState[] = [];
  for (const r of raw as Partial<ItemState>[]) {
    if (typeof r !== "object" || r === null) continue;
    if (!Number.isFinite(r.id) || !Number.isFinite(r.x) || !Number.isFinite(r.y)) continue;
    const kind = KINDS.includes(r.kind as string) ? r.kind! : "food";
    if (kind === "power" && !isPowerId(r.power)) continue;
    const item: ItemState = {
      id: r.id!,
      x: r.x!,
      y: r.y!,
      vx: num(r.vx, 0),
      vy: num(r.vy, 0),
      onGround: r.onGround === true,
      kind,
      sprite: Number.isInteger(r.sprite) && r.sprite! >= 0 && r.sprite! <= 7 ? r.sprite! : 0,
      // Same key order as a freshly spawned power item, so a restored state serializes byte-identically.
      ...(kind === "power" ? { power: r.power } : {}),
      value: Math.max(0, num(r.value, 100)),
      despawnTicks: Math.max(1, num(r.despawnTicks, TUNING.foodTtlTicks)),
    };
    out.push(item);
  }
  return out;
}
