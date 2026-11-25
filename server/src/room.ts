import { createHash, randomBytes, randomInt, timingSafeEqual } from "node:crypto";
import { Sim, TICK_RATE, SNAPSHOT_RATE } from "@bubble/shared";
import type { ClientMsg, GameState, LevelData, ServerMsg, SimEvent } from "@bubble/shared";
import type { ScoreEntry } from "./persist";
import { parseClientMsg } from "./validate";

export interface SocketLike {
  send(s: string): void;
  close(): void;
  onMessage(cb: (data: string) => void): void;
  onClose(cb: () => void): void;
  /** Remote address, used only for rate limiting. */
  ip?: string;
}

export interface Persist {
  load(code: string): GameState | undefined;
  save(code: string, state: GameState): void;
  remove(code: string): void;
}

/** Timer functions, injectable so tests need no real time. */
export interface Timers {
  setInterval(fn: () => void, ms: number): unknown;
  clearInterval(handle: unknown): void;
  setTimeout(fn: () => void, ms: number): unknown;
  clearTimeout(handle: unknown): void;
}

export const realTimers: Timers = {
  setInterval: (fn, ms) => setInterval(fn, ms),
  clearInterval: (h) => clearInterval(h as NodeJS.Timeout),
  setTimeout: (fn, ms) => setTimeout(fn, ms),
  clearTimeout: (h) => clearTimeout(h as NodeJS.Timeout),
};

/** Where finished runs are recorded. */
export interface ScoreSink {
  record(entry: ScoreEntry): void;
}

/**
 * Where the Super-mode unlock is recorded (idempotent on the store side). A Room only writes; the manager's
 * Super-room gate also reads, and treats a sink without `isSuperUnlocked` as locked.
 */
export interface UnlockSink {
  unlockSuper(dateIso: string): void;
  isSuperUnlocked?(): boolean;
}

export interface RoomOptions {
  /** High-score table; runs are not recorded when omitted. */
  scores?: ScoreSink;
  /** Told when a run ends in the true ending. */
  unlocks?: UnlockSink;
  /** A NEW run starts in hard mode (a run restored from a save keeps whatever the save says). */
  superMode?: boolean;
  pin: string;
  now?: () => number;
  timers?: Timers;
  /** Fixed seed for the new run (tests); random otherwise. */
  seed?: number;
  /** Shared per-IP failed-PIN limiter; each room makes its own when omitted. */
  limiter?: RateLimiter;
  /** Called after the room went dormant, so a registry can drop it. */
  onSuspend?: (room: Room) => void;
}

export const SUSPEND_AFTER_MS = 10_000;
/** A failed unlock write is retried from the tick loop no sooner than this many ms (injected clock) after the last try. */
export const UNLOCK_RETRY_MS = 5000;
export const PIN_FAIL_LIMIT = 5;
export const PIN_WINDOW_MS = 60_000;
const SNAPSHOT_EVERY = TICK_RATE / SNAPSHOT_RATE;
const PUMP_MS = 8;
const MAX_CATCHUP_TICKS = 10;

export const MAX_TRACKED_IPS = 4096;

/**
 * Rate-limit key: IPv6 addresses collapse to their /64 prefix (a client
 * typically owns a whole /64); IPv4, IPv4-mapped IPv6 and anything unparsable
 * are returned unchanged.
 */
export function limiterKey(ip: string): string {
  if (!ip.includes(":") || /^::ffff:/i.test(ip)) return ip;
  const addr = ip.split("%")[0]!;
  const halves = addr.split("::");
  if (halves.length > 2) return ip;
  const head = halves[0] ? halves[0].split(":") : [];
  const tail = halves[1] ? halves[1].split(":") : [];
  const missing = 8 - head.length - tail.length;
  if ((halves.length === 1 ? missing !== 0 : missing < 1)) return ip;
  const groups = [...head, ...Array<string>(halves.length === 2 ? missing : 0).fill("0"), ...tail];
  const nums = groups.slice(0, 4).map((g) => (/^[0-9a-f]{1,4}$/i.test(g) ? parseInt(g, 16) : NaN));
  if (nums.some(Number.isNaN)) return ip;
  return nums.map((n) => n.toString(16)).join(":");
}

/** Rolling-window counter of failed PIN attempts per client key, bounded in size. */
export class RateLimiter {
  private fails = new Map<string, number[]>();
  constructor(
    private now: () => number,
    private max = PIN_FAIL_LIMIT,
    private windowMs = PIN_WINDOW_MS,
    private maxTracked = MAX_TRACKED_IPS,
  ) {}

  get size(): number {
    return this.fails.size;
  }

  private recent(key: string): number[] {
    const cutoff = this.now() - this.windowMs;
    const list = (this.fails.get(key) ?? []).filter((t) => t > cutoff);
    if (list.length) this.fails.set(key, list);
    else this.fails.delete(key);
    return list;
  }

  isBlocked(ip: string): boolean {
    return this.recent(limiterKey(ip)).length > this.max;
  }

  fail(ip: string): void {
    const key = limiterKey(ip);
    const list = this.recent(key);
    if (list.length <= this.max) list.push(this.now());
    this.fails.delete(key); // re-insert so Map order is least-recently-failed first
    this.fails.set(key, list);
    // Hard cap: evict the oldest entries (O(1) each, no scan).
    while (this.fails.size > this.maxTracked) this.fails.delete(this.fails.keys().next().value as string);
  }
}

const sha256 = (s: string): Buffer => createHash("sha256").update(s).digest();
/** Constant-time string equality (both sides hashed so lengths always match). */
const safeEqual = (a: string, b: string): boolean => timingSafeEqual(sha256(a), sha256(b));

/**
 * The one PIN decision: blocked clients are told so, a wrong PIN counts toward the limiter, a right one costs nothing.
 * Shared by Room and the manager's Super-room gate so both account for failures identically.
 */
export function verifyPin(limiter: RateLimiter, ip: string, pin: string, expected: string): "ok" | "badpin" | "ratelimit" {
  if (limiter.isBlocked(ip)) return "ratelimit";
  if (!safeEqual(pin, expected)) {
    limiter.fail(ip);
    return "badpin";
  }
  return "ok";
}

interface Seat {
  token: string;
  name: string;
  sock?: SocketLike;
  buttons: number;
  lastSeq: number;
}

function usableState(s: unknown, levels: LevelData[]): s is GameState {
  if (typeof s !== "object" || s === null) return false;
  const g = s as Partial<GameState>;
  return (
    Array.isArray(g.players) &&
    (g.players.length === 1 || g.players.length === 2) &&
    Number.isInteger(g.round) &&
    g.round! >= 1 &&
    g.round! <= levels.length &&
    Number.isFinite(g.tick) &&
    typeof g.phase === "string"
  );
}

export class Room {
  sim?: Sim;
  dormant = false;
  private seats: [Seat?, Seat?] = [];
  private pending: SimEvent[] = [];
  private emptySince?: number;
  /** True once the current run's score entry is written (or the run was already over when loaded). */
  private scoreRecorded = false;
  /** True once this Room instance has reported the true ending (the store itself is idempotent). */
  private unlockReported = false;
  /** ISO date of the first observation of the true ending; retries reuse it. Set once. */
  private unlockDate?: string;
  private unlockLastTry = 0;
  private unlockFailing = false;
  private loop?: unknown;
  private loopStart = 0;
  private loopTicks = 0;
  private readonly now: () => number;
  private readonly timers: Timers;
  private readonly limiter: RateLimiter;

  constructor(
    public code: string,
    private levels: LevelData[],
    private persist: Persist,
    private opts: RoomOptions,
  ) {
    this.now = opts.now ?? Date.now;
    this.timers = opts.timers ?? realTimers;
    this.limiter = opts.limiter ?? new RateLimiter(this.now);
    const saved = persist.load(code);
    if (usableState(saved, levels)) {
      try {
        this.sim = Sim.restore(levels, saved);
        this.scoreRecorded = this.sim.state.runOver;
      } catch {
        this.sim = undefined; // unusable save: start a fresh run instead
      }
    }
  }

  connectedCount(): number {
    return this.seats.filter((s) => s?.sock).length;
  }

  join(sock: SocketLike, msg: ClientMsg): void {
    try {
      this.doJoin(sock, msg);
    } catch (err) {
      console.error(`room ${this.code}: join failed`, err);
      this.reject(sock, "badmsg");
    }
  }

  private doJoin(sock: SocketLike, msg: ClientMsg): void {
    if (msg.t !== "join" || this.dormant) return this.reject(sock, "badmsg");
    const ip = sock.ip ?? "unknown";
    const pin = verifyPin(this.limiter, ip, msg.pin, this.opts.pin);
    if (pin !== "ok") return this.reject(sock, pin);

    let idx = -1;
    let reclaim = false;
    const token = msg.rejoinToken;
    if (typeof token === "string" && token) {
      idx = this.seats.findIndex((s) => s !== undefined && safeEqual(s.token, token));
      reclaim = idx >= 0;
    }
    if (!reclaim) idx = [0, 1].find((i) => !this.seats[i]?.sock) ?? -1;
    if (idx < 0) return this.reject(sock, "full");

    const sim = (this.sim ??= new Sim(this.levels, this.opts.seed ?? randomInt(1, 2 ** 31), {
      playerCount: 1,
      superMode: this.opts.superMode === true,
    }));
    if (idx >= sim.state.players.length) sim.addPlayer();

    const old = this.seats[idx];
    const seat: Seat =
      reclaim && old
        ? old
        : { token: randomBytes(16).toString("hex"), name: msg.name, buttons: 0, lastSeq: 0 };
    const stale = seat.sock;
    seat.sock = sock;
    seat.name = msg.name;
    this.seats[idx] = seat;
    this.emptySince = undefined;
    stale?.close();

    const playerId = idx as 0 | 1;
    sock.onMessage((data) => this.onData(seat, sock, data));
    sock.onClose(() => this.onClose(seat, sock));
    this.send(sock, { t: "joined", playerId, rejoinToken: seat.token, round: sim.state.round });
    this.seats.forEach((other, i) => {
      if (!other || other === seat) return;
      this.send(sock, { t: "peer", playerId: i as 0 | 1, name: other.name, connected: !!other.sock });
      if (other.sock) this.send(other.sock, { t: "peer", playerId, name: seat.name, connected: true });
    });
  }

  private reject(sock: SocketLike, code: "badpin" | "full" | "badmsg" | "ratelimit"): void {
    this.send(sock, { t: "err", code });
    this.closeQuietly(sock);
  }

  private onData(seat: Seat, sock: SocketLike, data: string): void {
    if (seat.sock !== sock) return; // replaced socket
    try {
      const msg = parseClientMsg(data);
      if (!msg || msg.t === "join") return this.kick(seat, sock);
      if (msg.t === "input") {
        if (msg.seq <= seat.lastSeq) return;
        seat.lastSeq = msg.seq;
        seat.buttons = msg.buttons;
      } else {
        this.answerContinue(msg.accept);
      }
    } catch (err) {
      console.error(`room ${this.code}: message handler failed`, err);
      this.kick(seat, sock);
    }
  }

  /** First accepted answer wins; only meaningful at game over. */
  private answerContinue(accept: boolean): void {
    const sim = this.sim;
    if (!sim || sim.state.phase !== "gameover" || sim.state.runOver) return;
    if (accept) {
      this.pending.push(...sim.continueRun());
      this.scoreRecorded = false;
    } else {
      sim.endRun();
      this.recordRun(sim);
    }
  }

  /** Appends this run's team score to the high-score table, once per run. */
  private recordRun(sim: Sim): void {
    if (this.scoreRecorded || !sim.state.runOver) return;
    this.scoreRecorded = true;
    const score = sim.state.players.reduce((sum, p) => sum + p.score, 0);
    if (score <= 0) return;
    const names = this.seats
      .filter((s): s is Seat => s !== undefined)
      .map((s) => s.name.trim())
      .filter((n) => n !== "")
      .slice(0, 2);
    try {
      this.opts.scores?.record({ names, score, round: sim.state.round, date: new Date(this.now()).toISOString() });
    } catch (err) {
      console.error(`room ${this.code}: recording high score failed`, err);
    }
  }

  /**
   * The true ending opens the Super room. The date is fixed at the first observation; the flag is set only once the
   * write succeeded. A failed write is retried every UNLOCK_RETRY_MS (and once more on suspend); never throws.
   */
  private reportUnlock(sim: Sim, final = false): void {
    if (this.unlockReported || sim.state.ending !== "true") return;
    const now = this.now();
    if (this.unlockDate === undefined) this.unlockDate = new Date(now).toISOString();
    else if (!final && now - this.unlockLastTry < UNLOCK_RETRY_MS) return;
    this.unlockLastTry = now;
    try {
      this.opts.unlocks?.unlockSuper(this.unlockDate);
      this.unlockReported = true;
      if (this.unlockFailing) console.error(`room ${this.code}: unlock recorded after earlier errors`);
      this.unlockFailing = false;
    } catch (err) {
      if (!this.unlockFailing) console.error(`room ${this.code}: recording the unlock failed (will retry)`, err);
      this.unlockFailing = true;
    }
  }

  private kick(seat: Seat, sock: SocketLike): void {
    this.send(sock, { t: "err", code: "badmsg" });
    this.closeQuietly(sock);
    this.onClose(seat, sock);
  }

  private closeQuietly(sock: SocketLike): void {
    try {
      sock.close();
    } catch {
      /* already closed */
    }
  }

  private onClose(seat: Seat, sock: SocketLike): void {
    if (seat.sock !== sock) return; // stale socket, slot already reclaimed
    seat.sock = undefined;
    seat.buttons = 0;
    const playerId = this.seats.indexOf(seat) as 0 | 1;
    for (const other of this.seats) {
      if (other?.sock) this.send(other.sock, { t: "peer", playerId, name: seat.name, connected: false });
    }
    if (this.connectedCount() === 0) this.emptySince = this.now();
  }

  private send(sock: SocketLike, msg: ServerMsg): void {
    this.sendRaw(sock, JSON.stringify(msg));
  }

  private sendRaw(sock: SocketLike, s: string): void {
    try {
      sock.send(s);
    } catch {
      /* a dead socket must not break the tick loop; its close event cleans up */
    }
  }

  /** One 60 Hz sim step (or, with nobody connected, the suspend check). */
  tick(): void {
    const sim = this.sim;
    if (this.dormant || !sim) return;
    if (this.connectedCount() === 0) {
      this.emptySince ??= this.now();
      if (this.now() - this.emptySince >= SUSPEND_AFTER_MS) this.suspend();
      return;
    }
    this.pending.push(...sim.step([this.seats[0]?.buttons ?? 0, this.seats[1]?.buttons ?? 0]));
    this.recordRun(sim);
    this.reportUnlock(sim);
    if (sim.state.tick % SNAPSHOT_EVERY === 0) this.broadcastSnapshot(sim);
  }

  private broadcastSnapshot(sim: Sim): void {
    const state = JSON.stringify(sim.state);
    const events = JSON.stringify(this.pending);
    this.pending = [];
    for (const seat of this.seats) {
      if (!seat?.sock) continue;
      this.sendRaw(
        seat.sock,
        `{"t":"snap","tick":${sim.state.tick},"ackSeq":${seat.lastSeq},"state":${state},"events":${events}}`,
      );
    }
  }

  /** Starts the real-time loop. Tick pacing follows the injected clock, so timer jitter does not slow the game. */
  start(): void {
    if (this.loop !== undefined || this.dormant) return;
    this.loopStart = this.now();
    this.loopTicks = 0;
    this.loop = this.timers.setInterval(() => this.pump(), PUMP_MS);
  }

  stop(): void {
    if (this.loop === undefined) return;
    this.timers.clearInterval(this.loop);
    this.loop = undefined;
  }

  private pump(): void {
    const due = Math.floor(((this.now() - this.loopStart) * TICK_RATE) / 1000);
    let n = 0;
    try {
      while (this.loopTicks < due && n < MAX_CATCHUP_TICKS && !this.dormant) {
        this.loopTicks++;
        n++;
        this.tick();
      }
    } catch (err) {
      console.error(`room ${this.code}: tick failed`, err);
    }
    if (this.loopTicks < due) {
      // Fell too far behind (e.g. a stall): drop the backlog instead of fast-forwarding.
      this.loopStart = this.now();
      this.loopTicks = 0;
    }
  }

  /** Persists the run (unless it is over), stops the loop and marks the room dormant. */
  suspend(): void {
    if (this.dormant) return;
    this.stop();
    this.dormant = true;
    if (this.sim) this.reportUnlock(this.sim, true);
    try {
      if (this.sim) {
        if (this.sim.state.runOver) this.persist.remove(this.code);
        else this.persist.save(this.code, this.sim.state);
      }
    } catch (err) {
      console.error(`room ${this.code}: persist failed`, err);
    }
    for (const seat of this.seats) {
      if (seat?.sock) this.closeQuietly(seat.sock);
      if (seat) seat.sock = undefined;
    }
    this.opts.onSuspend?.(this);
  }
}
