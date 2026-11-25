import { FIELD_W, TILE, TUNING } from "../constants";
import { isSolid } from "../level";
import type { LevelData } from "../level";
import type { Rng } from "../rng";
import type { BubbleState, EffectState, EnemyState, GameState, PlayerState, SimEvent } from "../types";
import { ENEMY_HALF, startDeath } from "./enemy-common";
import { killTrapped } from "./enemies";
import { moveBody } from "./physics";
import { PLAYER_SIZE } from "./player";
import { addScore, chainScore } from "./scoring";

/*
 * Special bubbles (water, fire, lightning, letters) and the effects their pops create.
 *
 * RNG DISCIPLINE. `state.specialTimer` counts down once per tick in phase "round"; loadRound sets it to
 * TUNING.specialFirstDelayTicks WITHOUT drawing. The rng is drawn only when the timer reaches 0, always in
 * this order (every draw is one `rng.next()` through `rng.int`):
 *
 *   branch                                   draws, in order
 *   ---------------------------------------  ------------------------------------------------------------
 *   timer > 0                                none
 *   timer hit 0, cap (maxSpecialBubbles)     1: next interval = specialIntervalMin + int(max - min)
 *   timer hit 0, element bubble spawned      4: interval, lane y = specialLaneMinY + int(specialLaneSpan),
 *                                               side int(2) (0 = left edge, 1 = right edge),
 *                                               kind int(weight sum) over [water, fire, lightning, letter]
 *                                               (allowed elements weigh specialKindWeight, letter letterWeight)
 *   timer hit 0, letter bubble spawned       5: the four above, then int(letter weight sum) over the six
 *                                               letters (missing for the first alive player: letterMissingWeight, else 1)
 *
 * Effects (`stepEffects`) draw nothing: they are fully determined by their spawn state.
 */

const WATER_HALF = TUNING.waterSize / 2;
const FIRE_HALF = TUNING.fireSize / 2;
const KINDS: readonly EffectState["kind"][] = ["water", "fire", "bolt"];
const LETTER_COUNT = 6;

export interface SpecialSim {
  state: GameState;
  currentLevel: LevelData;
  levels: unknown[];
  rng: Rng;
}

export function newLetters(): boolean[] {
  return [false, false, false, false, false, false];
}

/** Six booleans from anything: a saved or damaged `letters` field. */
export function repairLetters(raw: unknown): boolean[] {
  const out = newLetters();
  if (Array.isArray(raw)) for (let i = 0; i < LETTER_COUNT; i++) out[i] = raw[i] === true;
  return out;
}

/** Half the height of an effect's body. */
export function effectHalfHeight(kind: EffectState["kind"]): number {
  return kind === "water" ? WATER_HALF : kind === "fire" ? FIRE_HALF : TUNING.boltHalfHeight;
}

/** The one place an effect object is built, so live and restored effects share one key order. */
function makeEffect(
  id: number,
  kind: EffectState["kind"],
  owner: 0 | 1,
  x: number,
  y: number,
  dir: 1 | -1,
  reachL: number,
  reachR: number,
): EffectState {
  return { id, kind, owner, x, y, vx: 0, vy: 0, dir, ageTicks: 0, onGround: false, kills: 0, reachL, reachR };
}

function initialReach(kind: EffectState["kind"], x: number, dir: 1 | -1): [number, number] {
  if (kind === "water") return [WATER_HALF, WATER_HALF];
  if (kind === "fire") return [FIRE_HALF, FIRE_HALF];
  return dir > 0 ? [0, Math.max(0, FIELD_W - x)] : [Math.max(0, x), 0];
}

/** Creates an effect with the next shared id and appends it to `state.effects` (ids ascend, so the list stays in id order). */
export function spawnEffect(state: GameState, kind: EffectState["kind"], owner: 0 | 1, x: number, y: number, dir: 1 | -1): EffectState {
  const [l, r] = initialReach(kind, x, dir);
  const e = makeEffect(state.nextId++, kind, owner, x, y, dir, l, r);
  state.effects.push(e);
  return e;
}

const num = (v: unknown, d: number): number => (typeof v === "number" && Number.isFinite(v) ? v : d);
const count = (v: unknown): number => (typeof v === "number" && Number.isFinite(v) && v >= 0 ? Math.floor(v) : 0);

/** Restores effects from an older or damaged save: unknown kinds and non-finite positions are dropped, the rest defaulted. */
export function repairEffects(raw: unknown): EffectState[] {
  if (!Array.isArray(raw)) return [];
  const out: EffectState[] = [];
  for (const r of raw as Partial<EffectState>[]) {
    if (typeof r !== "object" || r === null) continue;
    if (!KINDS.includes(r.kind as EffectState["kind"])) continue;
    if (!Number.isFinite(r.id) || !Number.isFinite(r.x) || !Number.isFinite(r.y)) continue;
    const dir = (r.dir as number) < 0 ? -1 : 1;
    const [l, rr] = initialReach(r.kind!, r.x!, dir);
    const e = makeEffect(r.id!, r.kind!, r.owner === 1 ? 1 : 0, r.x!, r.y!, dir, Math.max(0, num(r.reachL, l)), Math.max(0, num(r.reachR, rr)));
    e.vx = num(r.vx, 0);
    e.vy = num(r.vy, 0);
    e.ageTicks = count(r.ageTicks);
    e.onGround = r.onGround === true;
    e.kills = count(r.kills);
    out.push(e);
  }
  return out;
}

/** Drops every live effect and special bubble (round load and round clear); normal bubbles stay. */
export function clearSpecials(state: GameState): void {
  state.effects = [];
  state.bubbles = state.bubbles.filter((b) => b.kind === "normal");
}

/** Extra x acceleration of a floating special bubble: toward the middle of the field. */
export function specialInward(b: BubbleState): number {
  if (b.kind === "normal") return 0;
  return b.x < FIELD_W / 2 ? TUNING.specialInwardAccel : -TUNING.specialInwardAccel;
}

// --- spawning ---------------------------------------------------------------

function pickWeighted(rng: Rng, weights: readonly number[]): number {
  let total = 0;
  for (const w of weights) total += w;
  let r = rng.int(total);
  for (let i = 0; i < weights.length; i++) {
    if (r < weights[i]!) return i;
    r -= weights[i]!;
  }
  return weights.length - 1;
}

/** Once per tick in phase "round": counts the timer down and, when it hits 0, may float in a special bubble. */
export function stepSpecialSpawns(sim: SpecialSim): void {
  const state = sim.state;
  if (state.phase !== "round") return;
  if (--state.specialTimer > 0) return;
  const rng = sim.rng;
  state.specialTimer = TUNING.specialIntervalMin + rng.int(TUNING.specialIntervalMax - TUNING.specialIntervalMin);
  if (state.bubbles.filter((b) => b.kind !== "normal").length >= TUNING.maxSpecialBubbles) return;
  const y = TUNING.specialLaneMinY + rng.int(TUNING.specialLaneSpan);
  const x = rng.int(2) === 0 ? TUNING.specialEdgeX : FIELD_W - TUNING.specialEdgeX;
  const flags = sim.currentLevel.flags;
  const kinds: BubbleState["kind"][] = [];
  const weights: number[] = [];
  const add = (k: BubbleState["kind"], w: number, on: boolean | undefined): void => {
    if (on !== true) return;
    kinds.push(k);
    weights.push(w);
  };
  add("water", TUNING.specialKindWeight, flags?.waterBubbles);
  add("fire", TUNING.specialKindWeight, flags?.fireBubbles);
  add("lightning", TUNING.specialKindWeight, flags?.lightningBubbles);
  add("letter", TUNING.letterWeight, true);
  const kind = kinds[pickWeighted(rng, weights)]!;
  const id = state.nextId++;
  if (kind !== "letter") {
    state.bubbles.push({ id, x, y, vx: 0, vy: -TUNING.bubbleRise, kind, phase: "float", ageTicks: 0, owner: 0 });
    return;
  }
  const p = state.players.find((q) => q.state === "alive");
  const lw: number[] = [];
  for (let i = 0; i < LETTER_COUNT; i++) lw.push(p && p.letters[i] !== true ? TUNING.letterMissingWeight : 1);
  const letter = pickWeighted(rng, lw) as 0 | 1 | 2 | 3 | 4 | 5;
  state.bubbles.push({ id, x, y, vx: 0, vy: -TUNING.bubbleRise, kind, letter, phase: "float", ageTicks: 0, owner: 0 });
}

// --- popping and collecting -------------------------------------------------

function collectLetter(sim: SpecialSim, p: PlayerState, b: BubbleState, events: SimEvent[]): void {
  const state = sim.state;
  const i = Number.isInteger(b.letter) && b.letter! >= 0 && b.letter! < LETTER_COUNT ? b.letter! : 0;
  events.push({ kind: "collect", player: p.id, x: b.x, y: b.y });
  if (p.letters[i] === true) {
    events.push(...addScore(sim, p.id, TUNING.duplicateLetterScore));
    return;
  }
  p.letters[i] = true;
  if (!p.letters.every((l) => l)) return;
  if (p.lives < TUNING.maxLives) p.lives++;
  events.push({ kind: "oneup", player: p.id });
  const target = Math.min(state.round + 1, sim.levels.length);
  if (target > state.round) state.pendingRound = Math.max(state.pendingRound, target);
  p.letters = newLetters();
}

/**
 * Player `p` touched special bubble `b` without bouncing (a letter is always collected): the bubble goes into
 * `dead`, a letter is collected, an element bubble releases its effect where it was.
 */
export function popSpecial(sim: SpecialSim, b: BubbleState, p: PlayerState, dead: Set<number>, events: SimEvent[]): void {
  dead.add(b.id);
  if (b.kind === "letter") {
    collectLetter(sim, p, b, events);
    return;
  }
  events.push({ kind: "pop", player: p.id, x: b.x, y: b.y });
  if (b.kind === "lightning") {
    const away = b.x > p.x ? 1 : b.x < p.x ? -1 : p.facing;
    spawnEffect(sim.state, "bolt", p.id, b.x, b.y, away);
  } else if (b.kind === "water" || b.kind === "fire") {
    spawnEffect(sim.state, b.kind, p.id, b.x, b.y, p.facing);
  }
}

// --- effects ----------------------------------------------------------------

function overlapsEffect(e: EffectState, cx: number, cy: number, half: number): boolean {
  const hh = effectHalfHeight(e.kind);
  return cx + half > e.x - e.reachL && cx - half < e.x + e.reachR && cy + half > e.y - hh && cy - half < e.y + hh;
}

const killable = (en: EnemyState): boolean => (en.state === "active" || en.state === "trapped") && en.type !== "hurry" && en.type !== "boss";

/** Kills one enemy as a pop by the effect's owner: the n-th kill of this effect scores chainScore(n). */
function kill(sim: SpecialSim, e: EffectState, en: EnemyState, events: SimEvent[]): void {
  const state = sim.state;
  const bubble = en.state === "trapped" ? state.bubbles.find((b) => b.trapped?.enemyId === en.id) : undefined;
  if (bubble) {
    killTrapped(state, bubble);
    state.bubbles = state.bubbles.filter((b) => b !== bubble);
  } else startDeath(en);
  events.push(...addScore(sim, e.owner, chainScore(++e.kills)));
  events.push({ kind: "pop", player: e.owner, x: bubble ? bubble.x : en.x, y: bubble ? bubble.y : en.y });
}

/** Every killable enemy touching the effect dies, in ascending id order (each exactly once: a dead one is skipped). */
function killTouching(sim: SpecialSim, e: EffectState, events: SimEvent[]): void {
  const hit = sim.state.enemies.filter((en) => killable(en) && overlapsEffect(e, en.x, en.y, ENEMY_HALF)).sort((a, b) => a.id - b.id);
  for (const en of hit) if (killable(en)) kill(sim, e, en, events);
}

/** The bolt's single victim: the nearest enemy in its band (ties: lower id). */
function strike(sim: SpecialSim, e: EffectState, events: SimEvent[]): void {
  let best: EnemyState | undefined;
  for (const en of sim.state.enemies) {
    if (!killable(en) || !overlapsEffect(e, en.x, en.y, ENEMY_HALF)) continue;
    if (!best || Math.abs(en.x - e.x) < Math.abs(best.x - e.x) || (Math.abs(en.x - e.x) === Math.abs(best.x - e.x) && en.id < best.id)) best = en;
  }
  if (best) kill(sim, e, best, events);
}

/** Moves a player horizontally by `dx` through the normal wall-respecting physics (gravity and y are discarded). */
function shiftPlayer(lv: LevelData, p: PlayerState, dx: number): void {
  const probe = { x: p.x, y: p.y, vx: dx, vy: 0, onGround: false };
  moveBody(lv, probe, PLAYER_SIZE);
  p.x = probe.x;
}

/** True once the body fell out of the bottom (moveBody would have wrapped it to the top). */
function fall(lv: LevelData, e: EffectState, size: number): boolean {
  const y0 = e.y;
  moveBody(lv, e, size);
  return e.y < y0;
}

function stepWater(sim: SpecialSim, e: EffectState, events: SimEvent[]): boolean {
  const lv = sim.currentLevel;
  e.vx = e.ageTicks > 0 ? e.dir * TUNING.waterSpeed : 0;
  const x0 = e.x;
  if (fall(lv, e, TUNING.waterSize)) return false;
  if (e.onGround || e.ageTicks > 0) e.ageTicks++;
  const dx = e.x - x0;
  for (const p of sim.state.players) {
    if (p.state === "alive" && dx !== 0 && overlapsEffect(e, p.x, p.y, PLAYER_SIZE / 2)) shiftPlayer(lv, p, dx);
  }
  killTouching(sim, e, events);
  return e.ageTicks < TUNING.waterRangeTicks;
}

/** One side of a fire strip may only grow over floor tiles, and not into a wall; the strip stops at the tile edge. */
function spreadSide(lv: LevelData, e: EffectState, reach: number, side: 1 | -1): number {
  const want = Math.min(TUNING.fireMaxSpread, reach + TUNING.fireSpreadSpeed);
  const row = Math.round((e.y + FIRE_HALF) / TILE);
  const edge = e.x + side * want;
  const col = Math.floor(edge / TILE);
  if (isSolid(lv, col, row) && !isSolid(lv, col, row - 1)) return want;
  const boundary = side > 0 ? col * TILE - e.x : e.x - (col + 1) * TILE;
  return Math.max(reach, Math.min(want, boundary));
}

function stepFire(sim: SpecialSim, e: EffectState, events: SimEvent[]): boolean {
  const lv = sim.currentLevel;
  if (!e.onGround && e.ageTicks === 0 && fall(lv, e, TUNING.fireSize)) return false;
  if (e.onGround) {
    e.ageTicks++;
    e.reachR = spreadSide(lv, e, e.reachR, 1);
    e.reachL = spreadSide(lv, e, e.reachL, -1);
  }
  killTouching(sim, e, events);
  return e.ageTicks < TUNING.fireDurationTicks;
}

function stepBolt(sim: SpecialSim, e: EffectState, events: SimEvent[]): boolean {
  if (e.ageTicks === 0) strike(sim, e, events);
  e.ageTicks++;
  return e.ageTicks < TUNING.boltVisualTicks;
}

/** Steps every effect in ascending id order and removes the finished ones. Draws no randomness. */
export function stepEffects(sim: SpecialSim): SimEvent[] {
  const events: SimEvent[] = [];
  const state = sim.state;
  if (state.effects.length === 0) return events;
  const keep: EffectState[] = [];
  for (const e of [...state.effects].sort((a, b) => a.id - b.id)) {
    const alive = e.kind === "water" ? stepWater(sim, e, events) : e.kind === "fire" ? stepFire(sim, e, events) : stepBolt(sim, e, events);
    if (alive) keep.push(e);
  }
  state.effects = keep;
  return events;
}
