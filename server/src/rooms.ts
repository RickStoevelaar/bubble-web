import type { ClientMsg, LevelData } from "@bubble/shared";
import { RateLimiter, Room, realTimers } from "./room";
import type { Persist, RoomOptions, SocketLike } from "./room";
import { parseClientMsg } from "./validate";

export const MAX_LIVE_ROOMS = 20;
export const JOIN_TIMEOUT_MS = 10_000;

export interface ManagerOptions extends RoomOptions {
  maxRooms?: number;
  joinTimeoutMs?: number;
}

/** Registry of live rooms: routes first messages, enforces the room cap, resumes dormant rooms. */
export class RoomManager {
  readonly rooms = new Map<string, Room>();
  private readonly limiter: RateLimiter;
  private readonly maxRooms: number;

  constructor(
    private levels: LevelData[],
    private persist: Persist,
    private opts: ManagerOptions,
  ) {
    this.limiter = opts.limiter ?? new RateLimiter(opts.now ?? Date.now);
    this.maxRooms = opts.maxRooms ?? MAX_LIVE_ROOMS;
  }

  /** Takes over a fresh connection: its first message must be a valid join. */
  attach(sock: SocketLike): void {
    const timers = this.opts.timers ?? realTimers;
    let joined = false;
    const timer = timers.setTimeout(() => {
      if (!joined) this.closeQuietly(sock);
    }, this.opts.joinTimeoutMs ?? JOIN_TIMEOUT_MS);
    sock.onClose(() => timers.clearTimeout(timer));
    sock.onMessage((data) => {
      if (joined) return;
      joined = true;
      timers.clearTimeout(timer);
      try {
        const msg = parseClientMsg(data);
        if (msg?.t !== "join") return this.badMsg(sock);
        this.join(sock, msg);
      } catch (err) {
        console.error("join routing failed", err);
        this.badMsg(sock);
      }
    });
  }

  join(sock: SocketLike, msg: Extract<ClientMsg, { t: "join" }>): void {
    let room = this.rooms.get(msg.room);
    const created = !room;
    if (!room) {
      if (this.rooms.size >= this.maxRooms) {
        sock.send(JSON.stringify({ t: "err", code: "full" }));
        this.closeQuietly(sock);
        return;
      }
      room = new Room(msg.room, this.levels, this.persist, {
        ...this.opts,
        limiter: this.limiter,
        onSuspend: (r) => {
          if (this.rooms.get(r.code) === r) this.rooms.delete(r.code);
        },
      });
      this.rooms.set(msg.room, room);
    }
    room.join(sock, msg);
    // A rejected first join (bad PIN etc.) must not leave an empty room occupying a slot.
    if (created && room.connectedCount() === 0) this.rooms.delete(msg.room);
    else if (created) room.start();
  }

  closeAll(): void {
    for (const room of [...this.rooms.values()]) room.suspend();
    this.rooms.clear();
  }

  private badMsg(sock: SocketLike): void {
    try {
      sock.send(JSON.stringify({ t: "err", code: "badmsg" }));
    } catch {
      /* ignore */
    }
    this.closeQuietly(sock);
  }

  private closeQuietly(sock: SocketLike): void {
    try {
      sock.close();
    } catch {
      /* ignore */
    }
  }
}
