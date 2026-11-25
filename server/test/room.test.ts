import { BTN, TEST_LEVEL } from "@bubble/shared";
import { describe, expect, it } from "vitest";
import { SUSPEND_AFTER_MS } from "../src/room";
import { RoomManager } from "../src/rooms";
import { FakeSocket, MemPersist, PIN, joinMsg, makeRoom, ticks } from "./helpers";

function seat(h: ReturnType<typeof makeRoom>, extra = {}, ip?: string) {
  const s = new FakeSocket(ip);
  h.room.join(s, joinMsg(extra));
  return s;
}

describe("Room join and snapshots", () => {
  it("good PIN joins as player 0 and gets a snapshot every 3rd tick", () => {
    const h = makeRoom();
    const s = seat(h);
    expect(s.of("joined")[0]).toMatchObject({ t: "joined", playerId: 0, round: 1 });
    expect(s.of("joined")[0]!.rejoinToken).toMatch(/^[0-9a-f]{32}$/);
    ticks(h.room, 2);
    expect(s.of("snap")).toHaveLength(0);
    ticks(h.room, 1);
    expect(s.of("snap")).toHaveLength(1);
    expect(s.of("snap")[0]!.tick).toBe(3);
    ticks(h.room, 6);
    expect(s.of("snap")).toHaveLength(3);
  });

  it("wrong PIN gets badpin and is closed", () => {
    const h = makeRoom();
    const s = seat(h, { pin: "nope" });
    expect(s.errCodes).toEqual(["badpin"]);
    expect(s.closed).toBe(true);
    expect(s.of("joined")).toHaveLength(0);
  });

  it("third concurrent join gets full", () => {
    const h = makeRoom();
    seat(h);
    const b = seat(h);
    const c = seat(h);
    expect(b.of("joined")[0]!.playerId).toBe(1);
    expect(c.errCodes).toEqual(["full"]);
    expect(c.closed).toBe(true);
  });

  it("sends peer messages on join and leave", () => {
    const h = makeRoom();
    const a = seat(h, { name: "Ann" });
    const b = seat(h, { name: "Bea" });
    expect(a.of("peer")).toEqual([{ t: "peer", playerId: 1, name: "Bea", connected: true }]);
    expect(b.of("peer")).toEqual([{ t: "peer", playerId: 0, name: "Ann", connected: true }]);
    b.drop();
    expect(a.last("peer")).toEqual({ t: "peer", playerId: 1, name: "Bea", connected: false });
  });

  it("second player joining mid-run keeps the sim tick and round", () => {
    const h = makeRoom();
    const a = seat(h);
    ticks(h.room, 30);
    const b = seat(h);
    expect(b.of("joined")[0]!.playerId).toBe(1);
    ticks(h.room, 3);
    const snap = b.last("snap");
    expect(snap.tick).toBe(33);
    expect(snap.state.round).toBe(1);
    expect(snap.state.players).toHaveLength(2);
    expect(a.last("snap").state.players).toHaveLength(2);
  });
});

describe("Room input", () => {
  it("input changes player x in later snapshots", () => {
    const h = makeRoom();
    const s = seat(h);
    ticks(h.room, 3);
    const x0 = s.last("snap").state.players[0]!.x;
    s.emit({ t: "input", seq: 1, buttons: BTN.R });
    ticks(h.room, 30);
    expect(s.last("snap").state.players[0]!.x).toBeGreaterThan(x0);
  });

  it("ignores stale or duplicate seq and reports ackSeq", () => {
    const h = makeRoom();
    const s = seat(h);
    s.emit({ t: "input", seq: 5, buttons: BTN.R });
    s.emit({ t: "input", seq: 3, buttons: BTN.L });
    s.emit({ t: "input", seq: 5, buttons: BTN.L });
    ticks(h.room, 3);
    expect(s.last("snap").ackSeq).toBe(5);
    expect(s.last("snap").state.players[0]!.vx).toBeGreaterThan(0);
    expect(s.closed).toBe(false);
  });

  it("ackSeq is per recipient", () => {
    const h = makeRoom();
    const a = seat(h);
    const b = seat(h);
    a.emit({ t: "input", seq: 7, buttons: 0 });
    b.emit({ t: "input", seq: 2, buttons: 0 });
    ticks(h.room, 3);
    expect(a.last("snap").ackSeq).toBe(7);
    expect(b.last("snap").ackSeq).toBe(2);
  });

  it("snapshot events cover every tick since the previous snapshot", () => {
    const h = makeRoom();
    const s = seat(h);
    ticks(h.room, 3);
    s.emit({ t: "input", seq: 1, buttons: BTN.F });
    h.room.tick(); // fire happens here (tick 4)
    s.emit({ t: "input", seq: 2, buttons: 0 });
    ticks(h.room, 2); // snapshot at tick 6
    expect(s.last("snap").tick).toBe(6);
    expect(s.last("snap").events.some((e) => e.kind === "fire")).toBe(true);
    ticks(h.room, 3);
    expect(s.last("snap").events).toEqual([]);
  });

  it("disconnected players stand still while the other keeps the sim running", () => {
    const h = makeRoom();
    const a = seat(h);
    const b = seat(h);
    a.emit({ t: "input", seq: 1, buttons: BTN.R });
    ticks(h.room, 3);
    a.drop();
    ticks(h.room, 30);
    expect(b.last("snap").tick).toBe(33);
    const settled = b.last("snap").state.players[0]!.x;
    ticks(h.room, 30);
    expect(b.last("snap").state.players[0]!.x).toBe(settled);
    expect(b.last("snap").state.players[0]!.vx).toBe(0);
  });
});

describe("Room reconnect", () => {
  it("rejoin with token reclaims the slot without resetting the sim", () => {
    const h = makeRoom();
    const a = seat(h);
    const b = seat(h);
    const token = a.of("joined")[0]!.rejoinToken;
    ticks(h.room, 30);
    a.drop();
    ticks(h.room, 30);
    const a2 = seat(h, { rejoinToken: token });
    expect(a2.of("joined")[0]).toMatchObject({ playerId: 0, rejoinToken: token });
    ticks(h.room, 3);
    expect(a2.last("snap").tick).toBe(63);
    expect(b.last("peer")).toMatchObject({ playerId: 0, connected: true });
  });

  it("a wrong token is treated as a fresh join", () => {
    const h = makeRoom();
    const a = seat(h);
    const token = a.of("joined")[0]!.rejoinToken;
    const x = seat(h, { rejoinToken: "deadbeef" });
    expect(x.of("joined")[0]!.playerId).toBe(1);
    expect(x.of("joined")[0]!.rejoinToken).not.toBe("deadbeef");
    a.drop();
    h.clock.t += SUSPEND_AFTER_MS; // inside the window a's seat stays reserved (see final-fix.test.ts)
    const y = seat(h, { rejoinToken: "wrong" });
    expect(y.of("joined")[0]!.playerId).toBe(0);
    expect(y.of("joined")[0]!.rejoinToken).not.toBe(token);
  });

  it("a rejoin replaces and closes a stale socket still bound to the slot", () => {
    const h = makeRoom();
    const a = seat(h);
    const token = a.of("joined")[0]!.rejoinToken;
    const a2 = seat(h, { rejoinToken: token });
    expect(a.closed).toBe(true);
    expect(a2.of("joined")[0]!.playerId).toBe(0);
    a.drop(); // late close event from the old socket must not disconnect the new one
    ticks(h.room, 3);
    expect(a2.of("snap")).toHaveLength(1);
  });
});

describe("Room malformed input", () => {
  const bad: Array<[string, string]> = [
    ["garbage", "\u0000\u0001not json"],
    ["oversized", JSON.stringify({ t: "input", seq: 1, buttons: 0, pad: "x".repeat(5000) })],
    ["non-object", "5"],
    ["array", "[]"],
    ["null", "null"],
    ["unknown t", JSON.stringify({ t: "launch" })],
    ["join after join", JSON.stringify({ t: "join", room: "ABC", pin: PIN, name: "x" })],
    ["buttons range", JSON.stringify({ t: "input", seq: 1, buttons: 99 })],
    ["fractional seq", JSON.stringify({ t: "input", seq: 1.5, buttons: 1 })],
    ["string buttons", JSON.stringify({ t: "input", seq: 1, buttons: "1" })],
    ["continue non-bool", JSON.stringify({ t: "continue", accept: "yes" })],
  ];
  it.each(bad)("%s -> badmsg, close, room keeps ticking", (_n, payload) => {
    const h = makeRoom();
    const a = seat(h);
    const b = seat(h);
    a.emit(payload);
    expect(a.errCodes).toEqual(["badmsg"]);
    expect(a.closed).toBe(true);
    ticks(h.room, 3);
    expect(b.last("snap").tick).toBe(3);
    expect(b.last("peer")).toMatchObject({ playerId: 0, connected: false });
  });
});

describe("Room continue", () => {
  function gameover(h: ReturnType<typeof makeRoom>) {
    const s = seat(h);
    ticks(h.room, 3);
    const st = h.room.sim!.state;
    st.phase = "gameover";
    st.players[0]!.score = 500;
    st.players[0]!.lives = 0;
    return s;
  }

  it("accept=true continues the run with scores reset", () => {
    const h = makeRoom();
    const s = gameover(h);
    s.emit({ t: "continue", accept: true });
    ticks(h.room, 3);
    const snap = s.last("snap");
    expect(snap.state.phase).toBe("round");
    expect(snap.state.players[0]!.score).toBe(0);
    expect(snap.events.some((e) => e.kind === "continue")).toBe(true);
  });

  it("accept=false ends the run; a later answer is ignored", () => {
    const h = makeRoom();
    const s = gameover(h);
    s.emit({ t: "continue", accept: false });
    s.emit({ t: "continue", accept: true });
    ticks(h.room, 3);
    expect(s.last("snap").state.runOver).toBe(true);
    expect(s.closed).toBe(false);
  });

  it("is ignored outside gameover", () => {
    const h = makeRoom();
    const s = seat(h);
    s.emit({ t: "continue", accept: true });
    s.emit({ t: "continue", accept: false });
    ticks(h.room, 3);
    expect(s.last("snap").state.runOver).toBe(false);
    expect(s.closed).toBe(false);
    expect(s.errCodes).toEqual([]);
  });
});

describe("rate limit", () => {
  it("blocks an IP after more than 5 failed PINs in 60 s and recovers", () => {
    const h = makeRoom();
    for (let i = 0; i < 6; i++) expect(seat(h, { pin: "bad" }, "9.9.9.9").errCodes).toEqual(["badpin"]);
    const blocked = seat(h, {}, "9.9.9.9");
    expect(blocked.errCodes).toEqual(["ratelimit"]);
    expect(blocked.closed).toBe(true);
    expect(seat(h, {}, "8.8.8.8").of("joined")).toHaveLength(1);
    h.clock.t += 60_001;
    expect(seat(h, {}, "9.9.9.9").of("joined")).toHaveLength(1);
  });
});

describe("suspend and resume", () => {
  it("suspends after 10 s with nobody connected, then a fresh Room resumes", () => {
    const persist = new MemPersist();
    const h = makeRoom({}, persist);
    const a = seat(h);
    const token = a.of("joined")[0]!.rejoinToken;
    ticks(h.room, 30);
    h.room.sim!.state.players[0]!.score = 1234;
    const round = h.room.sim!.state.round;
    a.drop();
    h.clock.t += 9_999;
    h.room.tick();
    expect(persist.files.size).toBe(0);
    h.clock.t += 1;
    h.room.tick();
    expect(persist.files.has("ABC")).toBe(true);
    expect(h.room.dormant).toBe(true);

    const h2 = makeRoom({}, persist, h.clock);
    const a2 = seat(h2, { rejoinToken: token }); // the seat token is persisted with the save
    expect(a2.of("joined")[0]).toMatchObject({ playerId: 0, round });
    ticks(h2.room, 3);
    const snap = a2.last("snap");
    expect(snap.tick).toBe(33);
    expect(snap.state.round).toBe(round);
    expect(snap.state.players[0]!.score).toBe(1234);
  });

  it("does not step the sim while nobody is connected", () => {
    const h = makeRoom();
    const a = seat(h);
    a.drop();
    ticks(h.room, 10);
    expect(h.room.sim!.state.tick).toBe(0);
  });

  it("falls back to a fresh sim when the persisted state is unusable", () => {
    const persist = new MemPersist();
    persist.files.set("ABC", JSON.stringify({ round: 99, tick: 5, players: [] }));
    const h = makeRoom({}, persist);
    const a = seat(h);
    expect(a.of("joined")[0]!.round).toBe(1);
  });

  it("a finished run is removed from persistence instead of saved", () => {
    const persist = new MemPersist();
    const h = makeRoom({}, persist);
    const a = seat(h);
    h.room.sim!.state.runOver = true;
    a.drop();
    h.clock.t += 10_000;
    h.room.tick();
    expect(persist.files.size).toBe(0);
  });
});

describe("loop", () => {
  it("start() pumps due ticks from the injected clock and stop clears the interval", () => {
    const h = makeRoom();
    seat(h);
    h.room.start();
    expect(h.timers.intervals.size).toBe(1);
    const pump = [...h.timers.intervals.values()][0]!;
    h.clock.t += 100; // 6 ticks at 60 Hz
    pump();
    expect(h.room.sim!.state.tick).toBe(6);
    h.room.stop();
    expect(h.timers.intervals.size).toBe(0);
  });
});

describe("RoomManager", () => {
  const mk = (maxRooms = 2) => {
    const h = makeRoom();
    const persist = new MemPersist();
    const mgr = new RoomManager([TEST_LEVEL], persist, { ...h.opts, maxRooms });
    return { h, persist, mgr };
  };
  const join = (mgr: RoomManager, room: string, pin = PIN) => {
    const s = new FakeSocket("1.1.1.1");
    mgr.attach(s);
    s.emit({ t: "join", room, pin, name: "p" });
    return s;
  };

  it("uppercases the code, shares a room, and caps live rooms", () => {
    const { mgr } = mk(2);
    const a = join(mgr, "abc");
    const b = join(mgr, "ABC");
    expect(a.of("joined")[0]!.playerId).toBe(0);
    expect(b.of("joined")[0]!.playerId).toBe(1);
    expect(join(mgr, "two").of("joined")).toHaveLength(1);
    const c = join(mgr, "three");
    expect(c.errCodes).toEqual(["full"]);
    expect(c.closed).toBe(true);
    expect(mgr.rooms.size).toBe(2);
    mgr.closeAll();
  });

  it("a wrong PIN does not leave a room behind", () => {
    const { mgr } = mk();
    expect(join(mgr, "zzz", "bad").errCodes).toEqual(["badpin"]);
    expect(mgr.rooms.size).toBe(0);
  });

  it.each([
    ["bad code", { t: "join", room: "no spaces!", pin: PIN, name: "x" }],
    ["long code", { t: "join", room: "A".repeat(13), pin: PIN, name: "x" }],
    ["pin type", { t: "join", room: "ABC", pin: 1234, name: "x" }],
    ["input first", { t: "input", seq: 1, buttons: 0 }],
  ])("first message %s -> badmsg + close", (_n, msg) => {
    const { mgr } = mk();
    const s = new FakeSocket();
    mgr.attach(s);
    s.emit(msg);
    expect(s.errCodes).toEqual(["badmsg"]);
    expect(s.closed).toBe(true);
    expect(mgr.rooms.size).toBe(0);
  });

  it("trims the name to 16 chars and defaults it", () => {
    const { mgr } = mk();
    const a = new FakeSocket();
    mgr.attach(a);
    a.emit({ t: "join", room: "ABC", pin: PIN, name: "  " + "n".repeat(30) });
    const b = new FakeSocket();
    mgr.attach(b);
    b.emit({ t: "join", room: "ABC", pin: PIN });
    expect(a.of("peer")[0]!.name).toBe("Player");
    expect(b.of("peer")[0]!.name).toBe("n".repeat(16));
    mgr.closeAll();
  });

  it("closes sockets that never join, via the injected timer", () => {
    const { h, mgr } = mk();
    const s = new FakeSocket();
    mgr.attach(s);
    expect(h.timers.timeouts.size).toBe(1);
    [...h.timers.timeouts.values()][0]!();
    expect(s.closed).toBe(true);
  });

  it("suspends an abandoned room, frees its slot, and resumes it on a later join", () => {
    const { h, persist, mgr } = mk(1);
    const a = join(mgr, "abc");
    const room = mgr.rooms.get("ABC")!;
    ticks(room, 30);
    a.drop();
    h.clock.t += 10_000;
    room.tick();
    expect(mgr.rooms.size).toBe(0);
    expect(persist.files.has("ABC")).toBe(true);
    const again = join(mgr, "abc");
    expect(again.of("joined")).toHaveLength(1);
    expect(mgr.rooms.get("ABC")!.sim!.state.tick).toBe(30);
    mgr.closeAll();
    expect(h.timers.intervals.size).toBe(0);
  });
});
