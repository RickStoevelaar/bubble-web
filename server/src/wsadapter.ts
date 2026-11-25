import type { SocketLike, Timers } from "./room";

export const HEARTBEAT_INTERVAL_MS = 10_000;
export const MAX_BUFFERED_BYTES = 1 << 20;

/** The slice of a `ws` WebSocket the server layer uses (fakeable in tests). */
export interface WsLike {
  readonly OPEN: number;
  readyState: number;
  bufferedAmount: number;
  send(s: string): void;
  close(): void;
  ping(): void;
  terminate(): void;
  on(event: "message", cb: (data: { toString(): string }) => void): unknown;
  on(event: "close" | "pong" | "error", cb: () => void): unknown;
}

/** Runs `fn`, swallowing anything it throws: a socket callback must never end the process. */
function guarded(fn: () => void): void {
  try {
    fn();
  } catch (err) {
    console.error("socket callback failed", err);
  }
}

export function wrapSocket(ws: WsLike, ip: string): SocketLike {
  ws.on("error", () => {}); // the close event follows; an unhandled 'error' would crash the process
  return {
    ip,
    send: (s) => {
      if (ws.readyState !== ws.OPEN) return;
      if (ws.bufferedAmount > MAX_BUFFERED_BYTES) return void ws.terminate(); // client is not reading
      ws.send(s);
    },
    close: () => ws.close(),
    onMessage: (cb) => ws.on("message", (data) => guarded(() => cb(data.toString()))),
    onClose: (cb) => ws.on("close", () => guarded(cb)),
  };
}

/**
 * Ping every `intervalMs`; a socket that has not answered the previous ping by
 * the next tick is terminated (half-open connection), which fires its normal
 * close event so the Room sees a disconnect. The timer dies with the socket.
 */
export function startHeartbeat(ws: WsLike, timers: Timers, intervalMs = HEARTBEAT_INTERVAL_MS): void {
  let alive = true;
  const timer = timers.setInterval(() => {
    guarded(() => {
      if (!alive) return ws.terminate();
      alive = false;
      ws.ping();
    });
  }, intervalMs);
  ws.on("pong", () => {
    alive = true;
  });
  ws.on("close", () => timers.clearInterval(timer));
}
