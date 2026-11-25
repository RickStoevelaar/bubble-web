import {
  stepPlayer,
  type BubbleState,
  type GameState,
  type ItemState,
  type LevelData,
  type PlayerState,
  type ServerMsg,
  type SimEvent,
} from "@bubble/shared";

type SnapMsg = Extract<ServerMsg, { t: "snap" }>;

export interface ClientGameOptions {
  levels: LevelData[];
  playerId: 0 | 1;
  /** Clock used to timestamp snapshot arrivals (ms). */
  now?: () => number;
  interpDelayMs?: number;
}

/** Snapshots kept for interpolation. */
const MAX_SNAPSHOTS = 4;
/** Oldest unacknowledged inputs are dropped beyond this many (2 s at 60 Hz). */
const MAX_PENDING = 120;
/** Beyond this per-axis jump an entity is considered teleported (wrap, respawn): no tweening. */
const MAX_TWEEN_DELTA = 64;
/** Extrapolate at most one snapshot interval past the newest snapshot. */
const MAX_TWEEN_T = 2;
/** A predicted/authoritative gap at or below this is invisible; above it we ease. */
const SOFT_CORRECT_MIN_PX = 2;
/** A gap above this is a teleport: snap. */
const SNAP_CORRECT_PX = 24;
/** The visual correction offset halves every this many ms. */
const CORRECTION_HALF_LIFE_MS = 50;

interface Stamped {
  tick: number;
  at: number;
  state: GameState;
}

interface Pending {
  seq: number;
  buttons: number;
}

interface Positioned {
  id: number;
  x: number;
  y: number;
}

/** Items are a placeholder type in shared; they may carry a position. */
interface LooseItem extends ItemState {
  x?: number;
  y?: number;
}

function findById<T extends { id: number }>(list: T[], id: number): T | undefined {
  for (let i = 0; i < list.length; i++) if (list[i]!.id === id) return list[i];
  return undefined;
}

function lerp(a: number, b: number, t: number): number {
  return a + (b - a) * t;
}

/**
 * Client-side view of the match: interpolates server snapshots for every entity and predicts
 * the local player by replaying unacknowledged inputs through the shared `stepPlayer`.
 * Never mutates a snapshot's state.
 */
export class ClientGame {
  private readonly levels: LevelData[];
  private readonly now: () => number;
  private readonly interpDelayMs: number;
  private readonly id: 0 | 1;

  private snaps: Stamped[] = [];
  private resyncNext = false;
  private readonly eventCbs: ((events: SimEvent[]) => void)[] = [];

  private pending: Pending[] = [];
  private lastPushedSeq = 0;
  private ackSeq = 0;
  /** Local player after replaying every pending input over the newest authoritative state. */
  private predicted: PlayerState | null = null;
  /** Scratch context for stepPlayer: bubbles it would spawn land here and are thrown away. */
  private readonly scratch = { currentLevel: undefined as unknown as LevelData, state: { bubbles: [] as BubbleState[], nextId: 0 } };
  /** Visual offset (display - predicted) that decays toward zero. */
  private errX = 0;
  private errY = 0;
  private lastViewMs: number | null = null;

  constructor(opts: ClientGameOptions) {
    this.levels = opts.levels;
    this.id = opts.playerId;
    this.now = opts.now ?? (() => performance.now());
    this.interpDelayMs = opts.interpDelayMs ?? 50;
  }

  get localPlayer(): 0 | 1 {
    return this.id;
  }

  /** Inputs sent but not yet acknowledged (bounded). */
  get pendingCount(): number {
    return this.pending.length;
  }

  onEvents(cb: (events: SimEvent[]) => void): void {
    this.eventCbs.push(cb);
  }

  /** Call after a (re)join: the next snapshot is accepted even if its tick is lower (restored save). */
  resync(): void {
    this.resyncNext = true;
  }

  onSnapshot(msg: SnapMsg): void {
    const newest = this.snaps[this.snaps.length - 1];
    if (!this.resyncNext && newest && msg.tick <= newest.tick) return; // duplicate or stale
    if (this.resyncNext) {
      this.snaps = [];
      this.resyncNext = false;
      this.errX = this.errY = 0;
    }
    this.snaps.push({ tick: msg.tick, at: this.now(), state: msg.state });
    if (this.snaps.length > MAX_SNAPSHOTS) this.snaps.shift();

    if (msg.events.length > 0) {
      for (const cb of this.eventCbs) {
        try {
          cb(msg.events);
        } catch (err) {
          console.error("event listener threw", err);
        }
      }
    }

    this.ackSeq = Math.max(this.ackSeq, msg.ackSeq);
    let drop = 0;
    while (drop < this.pending.length && this.pending[drop]!.seq <= this.ackSeq) drop++;
    if (drop > 0) this.pending.splice(0, drop);
    this.reconcile(msg.state);
  }

  /** Records an input just sent for the next tick (seq strictly increasing) and advances the prediction by it. */
  pushInput(seq: number, buttons: number): void {
    if (seq <= this.lastPushedSeq) return;
    this.lastPushedSeq = seq;
    this.pending.push({ seq, buttons });
    if (this.pending.length > MAX_PENDING) this.pending.shift();
    if (this.predicted) this.stepPredicted(this.predicted, buttons);
  }

  /** The state to draw at `nowMs`, or null before the first snapshot. */
  viewState(nowMs: number): GameState | null {
    if (this.snaps.length === 0) return null;
    const view = this.interpolated(nowMs - this.interpDelayMs);

    const dt = this.lastViewMs === null ? 0 : Math.max(0, nowMs - this.lastViewMs);
    this.lastViewMs = nowMs;
    if (dt > 0 && (this.errX !== 0 || this.errY !== 0)) {
      const k = Math.pow(0.5, dt / CORRECTION_HALF_LIFE_MS);
      this.errX *= k;
      this.errY *= k;
      if (Math.abs(this.errX) < 0.01 && Math.abs(this.errY) < 0.01) this.errX = this.errY = 0;
    }

    const pred = this.predicted;
    if (pred) {
      const i = view.players.findIndex((p) => p.id === this.id);
      if (i >= 0) {
        const players = view.players.slice();
        players[i] = {
          ...view.players[i]!,
          x: pred.x + this.errX,
          y: pred.y + this.errY,
          vx: pred.vx,
          vy: pred.vy,
          facing: pred.facing,
          onGround: pred.onGround,
        };
        view.players = players;
      }
    }
    return view;
  }

  // --- prediction --------------------------------------------------------

  private levelFor(state: GameState): LevelData {
    return this.levels[state.round - 1] ?? this.levels[0]!;
  }

  private stepPredicted(p: PlayerState, buttons: number): void {
    this.scratch.state.bubbles.length = 0;
    stepPlayer(this.scratch, p, buttons);
    this.scratch.state.bubbles.length = 0;
  }

  /** Re-derive the prediction from a new authoritative snapshot and set up the visual correction. */
  private reconcile(state: GameState): void {
    const auth = state.players.find((p) => p.id === this.id);
    const old = this.predicted;
    if (!auth || auth.state !== "alive" || state.phase !== "round") {
      this.predicted = null;
      this.errX = this.errY = 0;
      return;
    }
    const level = this.levelFor(state);
    this.scratch.currentLevel = level;
    const p = structuredClone(auth);
    for (const input of this.pending) this.stepPredicted(p, input.buttons);
    this.predicted = p;

    if (!old) {
      this.errX = this.errY = 0;
      return;
    }
    // Keep what is on screen continuous: display = predicted + err, so err absorbs the jump.
    const ex = old.x + this.errX - p.x;
    const ey = old.y + this.errY - p.y;
    const dist = Math.hypot(ex, ey);
    if (dist <= SOFT_CORRECT_MIN_PX || dist > SNAP_CORRECT_PX) {
      this.errX = this.errY = 0;
    } else {
      this.errX = ex;
      this.errY = ey;
    }
  }

  // --- interpolation -----------------------------------------------------

  /** Interpolated copy of the snapshots around `renderMs`; all non-position fields come from the newer one. */
  private interpolated(renderMs: number): GameState {
    const n = this.snaps.length;
    const b = this.snaps[n - 1]!;
    if (n === 1) return { ...b.state };
    // Find the bracketing pair: the oldest snapshot with arrival >= renderMs is `hi`.
    let hiIdx = n - 1;
    for (let i = 1; i < n; i++) {
      if (this.snaps[i]!.at >= renderMs) {
        hiIdx = i;
        break;
      }
    }
    const lo = this.snaps[hiIdx - 1]!;
    const hi = this.snaps[hiIdx]!;
    const span = hi.at - lo.at;
    let t = span > 0 ? (renderMs - lo.at) / span : 1;
    t = Math.min(MAX_TWEEN_T, Math.max(0, t));
    const s = hi.state;
    const from = lo.state;
    return {
      ...s,
      players: this.tween(from.players, s.players, t, (a, c) => a.state !== c.state),
      enemies: this.tween(from.enemies, s.enemies, t, (a, c) => a.state !== c.state),
      bubbles: this.tween(from.bubbles, s.bubbles, t),
      items: this.tweenItems(from.items, s.items, t),
    };
  }

  private tween<T extends Positioned>(
    from: T[],
    to: T[],
    t: number,
    changed?: (a: T, b: T) => boolean,
  ): T[] {
    if (t === 1) return to;
    return to.map((e) => {
      const a = findById(from, e.id);
      return a && this.canTween(a, e) && !(changed?.(a, e) ?? false) ? { ...e, x: lerp(a.x, e.x, t), y: lerp(a.y, e.y, t) } : e;
    });
  }

  private tweenItems(from: ItemState[], to: ItemState[], t: number): ItemState[] {
    if (t === 1) return to;
    return (to as LooseItem[]).map((e) => {
      const a = findById(from as LooseItem[], e.id);
      if (!a || !Number.isFinite(a.x) || !Number.isFinite(a.y) || !Number.isFinite(e.x) || !Number.isFinite(e.y)) return e;
      if (!this.canTween(a as Positioned, e as Positioned)) return e;
      return { ...e, x: lerp(a.x!, e.x!, t), y: lerp(a.y!, e.y!, t) };
    });
  }

  private canTween(a: Positioned, b: Positioned): boolean {
    return Math.abs(b.x - a.x) <= MAX_TWEEN_DELTA && Math.abs(b.y - a.y) <= MAX_TWEEN_DELTA;
  }
}
