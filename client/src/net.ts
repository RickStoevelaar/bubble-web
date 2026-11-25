import type { ClientMsg, ServerMsg } from "@bubble/shared";

export type SnapMsg = Extract<ServerMsg, { t: "snap" }>;
export type PeerMsg = Extract<ServerMsg, { t: "peer" }>;
export type ErrCode = Extract<ServerMsg, { t: "err" }>["code"];
export type ConnState = "connecting" | "joined" | "reconnecting" | "closed";

/** The subset of the browser WebSocket this module uses. */
export interface WebSocketLike {
  readyState: number;
  send(data: string): void;
  close(code?: number): void;
  onopen: ((ev: unknown) => void) | null;
  onmessage: ((ev: { data: unknown }) => void) | null;
  onclose: ((ev: { code: number }) => void) | null;
  onerror: ((ev: unknown) => void) | null;
}

export interface StorageLike {
  getItem(key: string): string | null;
  setItem(key: string, value: string): void;
}

export interface ConnectionDeps {
  createSocket?: (url: string) => WebSocketLike;
  storage?: StorageLike;
  now?: () => number;
  setTimer?: (fn: () => void, ms: number) => unknown;
  clearTimer?: (handle: unknown) => void;
  /** Uniform [0, 1) source for backoff jitter. */
  random?: () => number;
}

/** Why a join (or the session) failed: a server `err` code, or a client-side condition. */
export class NetError extends Error {
  constructor(public readonly code: ErrCode | "timeout" | "closed") {
    super(`net error: ${code}`);
    this.name = "NetError";
  }
}

const OPEN = 1;
const JOIN_TIMEOUT_MS = 8000;
/** A joined socket that delivers nothing for this long is treated as dead (snapshots come at 20 Hz). */
export const STALL_MS = 3000;
/** A (re)connect attempt that has not reached "joined" within this long is abandoned and retried. */
export const CONNECT_STALL_MS = 8000;
const BACKOFF_BASE_MS = 500;
const BACKOFF_CAP_MS = 8000;
const JITTER = 0.2;
const RATELIMIT_WAIT_MS = 60_000;
const CLOSE_TOO_BIG = 1009;
const TOKEN_KEY_PREFIX = "bubble.rejoin.";

interface JoinParams {
  room: string;
  pin: string;
  name: string;
  startRound?: number;
}

/**
 * The rejoin token lives in sessionStorage, not localStorage: it is per tab and survives a reload,
 * whereas two tabs of one browser (same origin) would share a localStorage token and steal each
 * other's seat. It may be absent or throw (private mode, blocked site data): never let that break play.
 */
function defaultStorage(): StorageLike | undefined {
  try {
    return typeof sessionStorage === "undefined" ? undefined : sessionStorage;
  } catch {
    return undefined;
  }
}

/** Join/rejoin handshake, auto-reconnect with backoff, and input/snapshot plumbing for one room. */
export class Connection {
  private readonly createSocket: (url: string) => WebSocketLike;
  private readonly storage: StorageLike | undefined;
  private readonly setTimer: (fn: () => void, ms: number) => unknown;
  private readonly clearTimer: (handle: unknown) => void;
  private readonly random: () => number;
  private readonly memoryTokens = new Map<string, string>();

  private state: ConnState = "closed";
  private socket: WebSocketLike | null = null;
  private params: JoinParams | null = null;
  private token: string | undefined;
  private seat: 0 | 1 | null = null;
  private attempt = 0;
  private reconnectTimer: unknown = null;
  private joinTimer: unknown = null;
  private watchdog: unknown = null;
  private pending: { resolve: (v: { playerId: 0 | 1; rejoinToken: string }) => void; reject: (e: NetError) => void } | null =
    null;
  /** Next input seq to hand out; only valid once `synced`. */
  private nextSeq = 1;
  private lastAck = 0;
  /** True after the first snapshot of the current (re)join: the server's ack is then known. */
  private synced = false;

  private readonly snapCbs: ((m: SnapMsg) => void)[] = [];
  private readonly errCbs: ((code: ErrCode) => void)[] = [];
  private readonly peerCbs: ((m: PeerMsg) => void)[] = [];
  private readonly joinedCbs: ((playerId: 0 | 1) => void)[] = [];
  private readonly stateCbs: ((s: ConnState) => void)[] = [];

  constructor(
    private readonly url: string,
    deps: ConnectionDeps = {},
  ) {
    this.createSocket = deps.createSocket ?? ((u) => new WebSocket(u) as unknown as WebSocketLike);
    this.storage = deps.storage ?? defaultStorage();
    this.setTimer = deps.setTimer ?? ((fn, ms) => setTimeout(fn, ms));
    this.clearTimer = deps.clearTimer ?? ((h) => clearTimeout(h as ReturnType<typeof setTimeout>));
    this.random = deps.random ?? Math.random;
  }

  /** The seat once joined (stable across reconnects), else null. */
  get playerId(): 0 | 1 | null {
    return this.seat;
  }

  get connectionState(): ConnState {
    return this.state;
  }

  join(room: string, pin: string, name: string, rejoinToken?: string, startRound?: number): Promise<{ playerId: 0 | 1; rejoinToken: string }> {
    this.teardown();
    const stale = this.pending;
    this.pending = null;
    stale?.reject(new NetError("closed"));
    const code = room.trim().toUpperCase();
    this.params = { room: code, pin, name };
    if (startRound !== undefined) this.params.startRound = startRound; // dev shortcut; the server ignores it unless ALLOW_DEV
    this.token = rejoinToken ?? this.loadToken(code);
    this.attempt = 0;
    this.seat = null;
    this.setState("connecting");
    const promise = new Promise<{ playerId: 0 | 1; rejoinToken: string }>((resolve, reject) => {
      this.pending = { resolve, reject };
    });
    this.joinTimer = this.setTimer(() => {
      this.joinTimer = null;
      this.fail(new NetError("timeout"));
    }, JOIN_TIMEOUT_MS);
    this.connect();
    return promise;
  }

  /** Sends one input; false (and nothing sent) if not joined, not synced, or seq is not above the server's ack. */
  sendInput(seq: number, buttons: number): boolean {
    if (!this.synced || this.state !== "joined" || seq <= this.lastAck) return false;
    return this.send({ t: "input", seq, buttons });
  }

  /** Allocates the next input seq, or undefined until the server's ack for this seat is known. */
  nextInputSeq(): number | undefined {
    if (!this.synced || this.state !== "joined") return undefined;
    return this.nextSeq++;
  }

  continue(accept: boolean): void {
    this.send({ t: "continue", accept });
  }

  onSnap(cb: (m: SnapMsg) => void): void {
    this.snapCbs.push(cb);
  }
  onError(cb: (code: ErrCode) => void): void {
    this.errCbs.push(cb);
  }
  onPeer(cb: (m: PeerMsg) => void): void {
    this.peerCbs.push(cb);
  }
  /** Called with the seat of EVERY `joined` message (first join and each rejoin), just before the "joined" state is announced. */
  onJoined(cb: (playerId: 0 | 1) => void): void {
    this.joinedCbs.push(cb);
  }
  onState(cb: (s: ConnState) => void): void {
    this.stateCbs.push(cb);
  }

  /** Ends the session: no further reconnects, no timers left behind. */
  close(): void {
    this.teardown();
    if (this.pending) this.fail(new NetError("closed"));
    else this.setState("closed");
  }

  // --- internals ---------------------------------------------------------

  private connect(): void {
    const params = this.params;
    if (!params) return;
    this.synced = false;
    let sock: WebSocketLike;
    try {
      sock = this.createSocket(this.url);
    } catch {
      this.scheduleReconnect(this.backoffDelay());
      return;
    }
    this.socket = sock;
    this.armWatchdog(CONNECT_STALL_MS);
    sock.onopen = () => {
      if (this.socket !== sock) return;
      const msg: ClientMsg = { t: "join", room: params.room, pin: params.pin, name: params.name };
      if (this.token) msg.rejoinToken = this.token;
      if (params.startRound !== undefined) msg.startRound = params.startRound;
      this.send(msg);
    };
    sock.onmessage = (ev) => {
      if (this.socket !== sock) return;
      this.armWatchdog(this.state === "joined" ? STALL_MS : CONNECT_STALL_MS);
      this.handle(ev.data);
    };
    sock.onerror = () => {
      /* the close event that follows drives reconnect */
    };
    sock.onclose = (ev) => {
      if (this.socket !== sock) return;
      this.socket = null;
      this.synced = false;
      if (this.state === "closed" || this.reconnectTimer !== null) return;
      if (ev.code === CLOSE_TOO_BIG) return this.terminal("badmsg");
      this.scheduleReconnect(this.backoffDelay());
    };
  }

  private handle(data: unknown): void {
    if (typeof data !== "string") return;
    let m: unknown;
    try {
      m = JSON.parse(data);
    } catch {
      return;
    }
    if (typeof m !== "object" || m === null) return;
    const msg = m as Partial<ServerMsg> & { t?: unknown };
    switch (msg.t) {
      case "joined": {
        const j = msg as Extract<ServerMsg, { t: "joined" }>;
        if ((j.playerId !== 0 && j.playerId !== 1) || typeof j.rejoinToken !== "string") return;
        this.seat = j.playerId;
        this.token = j.rejoinToken;
        this.saveToken(j.rejoinToken);
        this.attempt = 0;
        this.synced = false;
        this.clearJoinTimer();
        for (const cb of this.joinedCbs) this.safely(() => cb(j.playerId));
        this.setState("joined");
        this.armWatchdog(STALL_MS);
        const p = this.pending;
        this.pending = null;
        p?.resolve({ playerId: j.playerId, rejoinToken: j.rejoinToken });
        return;
      }
      case "snap": {
        const s = msg as SnapMsg;
        if (typeof s.tick !== "number" || typeof s.ackSeq !== "number" || typeof s.state !== "object" || s.state === null) return;
        if (!Array.isArray(s.events)) return;
        if (this.state !== "joined") return;
        this.lastAck = Math.max(this.lastAck, s.ackSeq);
        if (!this.synced) {
          this.synced = true;
          this.nextSeq = Math.max(this.nextSeq, s.ackSeq + 1);
        }
        for (const cb of this.snapCbs) this.safely(() => cb(s));
        return;
      }
      case "peer": {
        const p = msg as PeerMsg;
        if (typeof p.name !== "string" || (p.playerId !== 0 && p.playerId !== 1)) return;
        for (const cb of this.peerCbs) this.safely(() => cb(p));
        return;
      }
      case "err": {
        const code = (msg as Extract<ServerMsg, { t: "err" }>).code;
        if (code === "ratelimit") return this.rateLimited();
        if (code === "badpin" || code === "full" || code === "badmsg" || code === "locked") return this.terminal(code);
        return;
      }
      default:
        return;
    }
  }

  /** Ends the session for good, telling the join promise (if pending) and the error listeners. */
  private terminal(code: ErrCode): void {
    if (this.state === "closed") return;
    this.teardown();
    this.reportError(code);
    if (this.pending) this.fail(new NetError(code));
    else this.setState("closed");
  }

  private rateLimited(): void {
    if (this.state === "closed") return;
    if (this.pending) return this.terminal("ratelimit"); // initial join: the caller decides
    this.dropSocket();
    this.reportError("ratelimit");
    this.scheduleReconnect(RATELIMIT_WAIT_MS);
  }

  private backoffDelay(): number {
    const base = Math.min(BACKOFF_BASE_MS * 2 ** this.attempt, BACKOFF_CAP_MS);
    this.attempt++;
    return Math.round(base * (1 + (this.random() * 2 - 1) * JITTER));
  }

  private scheduleReconnect(delayMs: number): void {
    if (this.state === "closed" || this.reconnectTimer !== null) return;
    this.clearWatchdog();
    if (this.state === "joined") this.setState("reconnecting");
    this.reconnectTimer = this.setTimer(() => {
      this.reconnectTimer = null;
      if (this.state !== "closed") this.connect();
    }, delayMs);
  }

  /** Rejects the pending join, closes the session. */
  private fail(err: NetError): void {
    this.teardown();
    const p = this.pending;
    this.pending = null;
    this.setState("closed");
    p?.reject(err);
  }

  /** Stops timers and detaches/closes the socket; leaves callbacks and state alone. */
  private teardown(): void {
    this.clearJoinTimer();
    this.clearWatchdog();
    if (this.reconnectTimer !== null) {
      this.clearTimer(this.reconnectTimer);
      this.reconnectTimer = null;
    }
    this.dropSocket();
    this.synced = false;
  }

  private dropSocket(): void {
    const sock = this.socket;
    this.socket = null;
    if (!sock) return;
    sock.onopen = sock.onmessage = sock.onclose = sock.onerror = null;
    try {
      sock.close();
    } catch {
      /* already closed */
    }
  }

  /** (Re)starts the liveness timer: if it fires, the socket is considered dead and replaced. */
  private armWatchdog(ms: number): void {
    this.clearWatchdog();
    this.watchdog = this.setTimer(() => {
      this.watchdog = null;
      if (this.state === "closed" || this.socket === null) return;
      this.dropSocket();
      this.synced = false;
      this.scheduleReconnect(this.backoffDelay());
    }, ms);
  }

  private clearWatchdog(): void {
    if (this.watchdog !== null) {
      this.clearTimer(this.watchdog);
      this.watchdog = null;
    }
  }

  private clearJoinTimer(): void {
    if (this.joinTimer !== null) {
      this.clearTimer(this.joinTimer);
      this.joinTimer = null;
    }
  }

  private send(msg: ClientMsg): boolean {
    const sock = this.socket;
    if (!sock || sock.readyState !== OPEN) return false;
    try {
      sock.send(JSON.stringify(msg));
      return true;
    } catch {
      return false;
    }
  }

  private setState(s: ConnState): void {
    if (this.state === s) return;
    this.state = s;
    for (const cb of this.stateCbs) this.safely(() => cb(s));
  }

  private reportError(code: ErrCode): void {
    for (const cb of this.errCbs) this.safely(() => cb(code));
  }

  private safely(fn: () => void): void {
    try {
      fn();
    } catch (err) {
      console.error("listener threw", err);
    }
  }

  private loadToken(room: string): string | undefined {
    try {
      const v = this.storage?.getItem(TOKEN_KEY_PREFIX + room);
      if (v) return v;
    } catch {
      /* fall through to memory */
    }
    return this.memoryTokens.get(room);
  }

  private saveToken(token: string): void {
    const room = this.params?.room;
    if (!room) return;
    this.memoryTokens.set(room, token);
    try {
      this.storage?.setItem(TOKEN_KEY_PREFIX + room, token);
    } catch {
      /* memory copy is enough for this page life */
    }
  }
}
