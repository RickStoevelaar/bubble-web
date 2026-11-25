import { EventEmitter } from "node:events";
import { TEST_LEVEL } from "@bubble/shared";
import { BTN } from "@bubble/shared";
import { describe, expect, it } from "vitest";
import { startHeartbeat, wrapSocket } from "../src/wsadapter";
import type { WsLike } from "../src/wsadapter";
import { RoomManager } from "../src/rooms";
import { FakeTimers, MemPersist, PIN, makeRoom } from "./helpers";

class FakeWs extends EventEmitter implements WsLike {
  OPEN = 1;
  readyState = 1;
  bufferedAmount = 0;
  pings = 0;
  terminated = false;
  sent: string[] = [];
  send(s: string) {
    this.sent.push(s);
  }
  close() {}
  ping() {
    this.pings++;
  }
  terminate() {
    this.terminated = true;
    this.readyState = 3;
    this.emit("close");
  }
  /** Simulates the browser answering a ping. */
  pong() {
    this.emit("pong");
  }
}

describe("heartbeat", () => {
  it("keeps a socket that pongs and terminates one that does not, before the next ping", () => {
    const timers = new FakeTimers();
    const live = new FakeWs();
    const dead = new FakeWs();
    startHeartbeat(live, timers, 10_000);
    startHeartbeat(dead, timers, 10_000);
    const fns = [...timers.intervals.values()];
    fns.forEach((f) => f()); // ping #1
    live.pong();
    fns.forEach((f) => f()); // dead never answered
    expect(live.pings).toBe(2);
    expect(live.terminated).toBe(false);
    expect(dead.pings).toBe(1);
    expect(dead.terminated).toBe(true);
    expect(timers.intervals.size).toBe(1); // dead one's timer cleared via close
    live.emit("close");
    expect(timers.intervals.size).toBe(0);
  });

  it("a terminated half-open socket zeroes input and, with both seats dead, suspends after 10 s", () => {
    const timers = new FakeTimers(); // room loop
    const hbTimers = new FakeTimers(); // heartbeats
    const persist = new MemPersist();
    const h = makeRoom({ timers }, persist);
    const mgr = new RoomManager([TEST_LEVEL], persist, h.opts);
    const wss: FakeWs[] = [];
    const join = () => {
      const ws = new FakeWs();
      wss.push(ws);
      startHeartbeat(ws, hbTimers, 10_000);
      mgr.attach(wrapSocket(ws, "1.1.1.1"));
      ws.emit("message", Buffer.from(JSON.stringify({ t: "join", room: "ABC", pin: PIN, name: "p" })));
      return ws;
    };
    const a = join();
    const b = join();
    const room = mgr.rooms.get("ABC")!;
    a.emit("message", Buffer.from(JSON.stringify({ t: "input", seq: 1, buttons: BTN.R })));
    for (let i = 0; i < 6; i++) room.tick();
    expect(room.sim!.state.players[0]!.vx).toBeGreaterThan(0);
    const hb = [...hbTimers.intervals.values()];
    hb.forEach((f) => f());
    b.pong(); // b stays alive, a is half-open
    hb.forEach((f) => f());
    expect(a.terminated).toBe(true);
    expect(b.terminated).toBe(false);
    for (let i = 0; i < 60; i++) room.tick();
    expect(room.sim!.state.players[0]!.vx).toBe(0);
    // now b dies too
    const rest = [...hbTimers.intervals.values()];
    rest.forEach((f) => f());
    rest.forEach((f) => f());
    expect(b.terminated).toBe(true);
    h.clock.t += 10_000;
    room.tick();
    expect(persist.files.has("ABC")).toBe(true);
    expect(mgr.rooms.size).toBe(0);
    expect(timers.intervals.size).toBe(0);
    expect(hbTimers.intervals.size).toBe(0);
  });
});
