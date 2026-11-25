import type { ClientMsg, GameState, ServerMsg } from "@bubble/shared";
import { TEST_LEVEL } from "@bubble/shared";
import type { Persist, RoomOptions, SocketLike, Timers } from "../src/room";
import { Room } from "../src/room";

export const PIN = "4321";

export class FakeSocket implements SocketLike {
  sent: ServerMsg[] = [];
  closed = false;
  private msgCb?: (d: string) => void;
  private closeCb?: () => void;
  constructor(public ip?: string) {}
  send(s: string): void {
    this.sent.push(JSON.parse(s) as ServerMsg);
  }
  close(): void {
    this.closed = true;
  }
  onMessage(cb: (d: string) => void): void {
    this.msgCb = cb;
  }
  onClose(cb: () => void): void {
    this.closeCb = cb;
  }
  /** Client -> server. Objects are JSON-encoded; strings go as-is. */
  emit(m: object | string): void {
    this.msgCb?.(typeof m === "string" ? m : JSON.stringify(m));
  }
  drop(): void {
    this.closeCb?.();
  }
  of<T extends ServerMsg["t"]>(t: T): Extract<ServerMsg, { t: T }>[] {
    return this.sent.filter((m) => m.t === t) as Extract<ServerMsg, { t: T }>[];
  }
  last<T extends ServerMsg["t"]>(t: T): Extract<ServerMsg, { t: T }> {
    const all = this.of(t);
    return all[all.length - 1]!;
  }
  get errCodes(): string[] {
    return this.of("err").map((e) => e.code);
  }
}

export class MemPersist implements Persist {
  files = new Map<string, string>();
  load(code: string): GameState | undefined {
    const raw = this.files.get(code);
    return raw === undefined ? undefined : (JSON.parse(raw) as GameState);
  }
  save(code: string, state: GameState): void {
    this.files.set(code, JSON.stringify(state));
  }
  remove(code: string): void {
    this.files.delete(code);
    this.seatFiles.delete(code);
  }
  /** Raw seat records (any shape, so tests can plant garbage). */
  seatFiles = new Map<string, unknown>();
  loadSeats(code: string): unknown {
    return this.seatFiles.get(code);
  }
  saveSeats(code: string, seats: unknown): void {
    this.seatFiles.set(code, JSON.parse(JSON.stringify(seats)));
  }
}

export class FakeTimers implements Timers {
  intervals = new Map<number, () => void>();
  timeouts = new Map<number, () => void>();
  private n = 0;
  setInterval(fn: () => void): unknown {
    this.intervals.set(++this.n, fn);
    return this.n;
  }
  clearInterval(h: unknown): void {
    this.intervals.delete(h as number);
  }
  setTimeout(fn: () => void): unknown {
    this.timeouts.set(++this.n, fn);
    return this.n;
  }
  clearTimeout(h: unknown): void {
    this.timeouts.delete(h as number);
  }
}

export interface Harness {
  clock: { t: number };
  persist: MemPersist;
  timers: FakeTimers;
  opts: RoomOptions;
  room: Room;
}

export function makeRoom(over: Partial<RoomOptions> = {}, persist = new MemPersist(), clock = { t: 1_000_000 }): Harness {
  const timers = new FakeTimers();
  const opts: RoomOptions = { pin: PIN, now: () => clock.t, timers, seed: 42, ...over };
  const room = new Room("ABC", [TEST_LEVEL], persist, opts);
  return { clock, persist, timers, opts, room };
}

export const joinMsg = (extra: Partial<Extract<ClientMsg, { t: "join" }>> = {}): ClientMsg => ({
  t: "join",
  room: "ABC",
  pin: PIN,
  name: "Bob",
  ...extra,
});

export function ticks(room: Room, n: number): void {
  for (let i = 0; i < n; i++) room.tick();
}
