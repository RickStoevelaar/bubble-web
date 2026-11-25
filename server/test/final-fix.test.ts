import { TEST_LEVEL } from "@bubble/shared";
import { afterEach, describe, expect, it, vi } from "vitest";
import { loadConfig } from "../src/index";
import type { ScoreEntry } from "../src/persist";
import { SUSPEND_AFTER_MS } from "../src/room";
import type { ScoreSink, UnlockSink } from "../src/room";
import { RoomManager } from "../src/rooms";
import { FakeSocket, MemPersist, PIN, joinMsg, makeRoom, ticks } from "./helpers";

function seat(h: ReturnType<typeof makeRoom>, extra = {}, ip?: string) {
  const s = new FakeSocket(ip);
  h.room.join(s, joinMsg(extra));
  return s;
}

function sinks() {
  const scores: ScoreEntry[] = [];
  const unlocks: string[] = [];
  const scoreSink: ScoreSink = { record: (e) => void scores.push(e) };
  const unlockSink: UnlockSink = { unlockSuper: (d) => void unlocks.push(d) };
  return { scores, unlocks, scoreSink, unlockSink };
}

afterEach(() => vi.restoreAllMocks());

describe("I1: rejoining a finished run starts a fresh one", () => {
  it("decline -> leave -> rejoin inside the window gives a new round-1 run; score once, unlock not repeated", () => {
    const k = sinks();
    const h = makeRoom({ scores: k.scoreSink, unlocks: k.unlockSink });
    const a = seat(h);
    ticks(h.room, 3);
    const st = h.room.sim!.state;
    st.phase = "gameover";
    st.players[0]!.score = 500;
    a.emit({ t: "continue", accept: false });
    expect(k.scores).toHaveLength(1);
    a.drop();
    h.clock.t += 2000;

    const a2 = seat(h);
    ticks(h.room, 3);
    expect(a2.of("joined")[0]).toMatchObject({ playerId: 0, round: 1 });
    const snap = a2.last("snap");
    expect(snap.state.runOver).toBe(false);
    expect(snap.state.phase).toBe("round");
    expect(snap.state.players[0]!.score).toBe(0);
    expect(k.scores).toHaveLength(1);

    // The new run ends too: recorded once more, as its own run.
    h.room.sim!.state.phase = "gameover";
    h.room.sim!.state.players[0]!.score = 70;
    a2.emit({ t: "continue", accept: false });
    ticks(h.room, 3);
    expect(k.scores.map((e) => e.score)).toEqual([500, 70]);
  });

  it("a true ending reports the unlock once; the fresh run does not replay the ending or re-report", () => {
    const k = sinks();
    const h = makeRoom({ scores: k.scoreSink, unlocks: k.unlockSink });
    const a = seat(h);
    ticks(h.room, 3);
    const st = h.room.sim!.state;
    st.ending = "true";
    st.phase = "ending";
    st.runOver = true;
    st.players[0]!.score = 900;
    ticks(h.room, 3);
    expect(k.unlocks).toHaveLength(1);
    a.drop();
    h.clock.t += 1000;
    const a2 = seat(h);
    ticks(h.room, 6);
    expect(a2.last("snap").state.ending).toBeNull();
    expect(a2.last("snap").state.phase).toBe("round");
    expect(k.unlocks).toHaveLength(1);
    expect(k.scores).toHaveLength(1);
  });

  it("a partner still connected on the finished run keeps the joiner in that finished room (restart only when the room is empty)", () => {
    const h = makeRoom();
    const a = seat(h);
    const b = seat(h);
    ticks(h.room, 3);
    h.room.sim!.state.phase = "gameover";
    a.emit({ t: "continue", accept: false });
    a.drop();
    h.clock.t += SUSPEND_AFTER_MS; // past a's reservation, so a fresh join may take the seat
    const a2 = seat(h);
    ticks(h.room, 3);
    expect(a2.last("snap").state.runOver).toBe(true); // b is still there: same finished room
    a2.drop();
    b.drop();
    const c = seat(h);
    ticks(h.room, 3);
    expect(c.last("snap").state.runOver).toBe(false); // last one left: next join starts fresh
    expect(c.last("snap").state.players).toHaveLength(1);
  });
});

describe("I2: seat tokens survive a suspend", () => {
  function suspended() {
    const persist = new MemPersist();
    const h = makeRoom({}, persist);
    const a = seat(h, { name: "Ann" });
    const b = seat(h, { name: "Bea" });
    const ta = a.of("joined")[0]!.rejoinToken;
    const tb = b.of("joined")[0]!.rejoinToken;
    ticks(h.room, 30);
    a.drop();
    b.drop();
    h.clock.t += SUSPEND_AFTER_MS;
    h.room.tick();
    expect(h.room.dormant).toBe(true);
    return { persist, h, ta, tb };
  }

  it("the second hero reconnecting first still gets hero 2 with its old token", () => {
    const { persist, h, ta, tb } = suspended();
    const h2 = makeRoom({}, persist, h.clock);
    const b2 = seat(h2, { name: "Bea", rejoinToken: tb });
    expect(b2.of("joined")[0]).toMatchObject({ playerId: 1, rejoinToken: tb });
    const a2 = seat(h2, { name: "Ann", rejoinToken: ta });
    expect(a2.of("joined")[0]).toMatchObject({ playerId: 0, rejoinToken: ta });
  });

  it("tokens are never in any message to the other player or in the snapshot", () => {
    const { persist, h, ta, tb } = suspended();
    const h2 = makeRoom({}, persist, h.clock);
    const b2 = seat(h2, { rejoinToken: tb });
    const a2 = seat(h2, { rejoinToken: ta });
    ticks(h2.room, 6);
    expect(JSON.stringify(b2.sent).includes(ta)).toBe(false);
    expect(JSON.stringify(a2.sent).includes(tb)).toBe(false);
  });

  it("a save without seat records still loads (first come, first served)", () => {
    const { persist, h } = suspended();
    persist.seatFiles.clear();
    const h2 = makeRoom({}, persist, h.clock);
    expect(seat(h2).of("joined")[0]).toMatchObject({ playerId: 0 });
  });

  it.each([
    ["not an array", { nope: 1 }],
    ["bad tokens", [{ token: 5, name: "x" }, null]],
    ["too many", Array.from({ length: 50 }, () => ({ token: "a".repeat(32), name: "x" }))],
    ["token too long", [{ token: "a".repeat(5000), name: "x" }]],
  ])("tolerates damaged seat records (%s)", (_n, raw) => {
    const { persist, h } = suspended();
    persist.seatFiles.set("ABC", raw);
    const h2 = makeRoom({}, persist, h.clock);
    expect(seat(h2).of("joined")).toHaveLength(1);
  });

  it("a fresh join cannot take a disconnected player's seat inside the suspend window", () => {
    const h = makeRoom();
    const a = seat(h);
    const b = seat(h);
    const tb = b.of("joined")[0]!.rejoinToken;
    b.drop();
    h.clock.t += 1000;
    const c = seat(h);
    expect(c.errCodes).toEqual(["full"]);
    const b2 = seat(h, { rejoinToken: tb });
    expect(b2.of("joined")[0]).toMatchObject({ playerId: 1, rejoinToken: tb });
    expect(a.closed).toBe(false);
  });

  it("after the window the seat is free to a fresh join", () => {
    const h = makeRoom();
    seat(h);
    const b = seat(h);
    b.drop();
    h.clock.t += SUSPEND_AFTER_MS;
    expect(seat(h).of("joined")[0]).toMatchObject({ playerId: 1 });
  });
});

describe("M1: the PIN comes before any room work", () => {
  function mk(maxRooms = 2) {
    const h = makeRoom();
    const persist = new MemPersist();
    const loads: string[] = [];
    const orig = persist.load.bind(persist);
    persist.load = (c) => {
      loads.push(c);
      return orig(c);
    };
    const mgr = new RoomManager([TEST_LEVEL], persist, { ...h.opts, maxRooms });
    return { h, persist, loads, mgr };
  }
  const join = (mgr: RoomManager, room: string, pin: string, ip = "1.1.1.1") => {
    const s = new FakeSocket(ip);
    mgr.attach(s);
    s.emit({ t: "join", room, pin, name: "p" });
    return s;
  };

  it("a bad PIN neither constructs a room nor reads its save", () => {
    const { mgr, loads, persist } = mk();
    persist.files.set("ZZZ", "{}");
    expect(join(mgr, "zzz", "bad").errCodes).toEqual(["badpin"]);
    expect(loads).toEqual([]);
    expect(mgr.rooms.size).toBe(0);
  });

  it("a blocked IP neither constructs a room nor reads a save, even with the right PIN", () => {
    const { mgr, loads } = mk();
    for (let i = 0; i < 6; i++) join(mgr, "abc", "bad", "9.9.9.9");
    expect(loads).toEqual([]);
    const s = join(mgr, "abc", PIN, "9.9.9.9");
    expect(s.errCodes).toEqual(["ratelimit"]);
    expect(loads).toEqual([]);
  });

  it("`full` is not revealed without the PIN, and a failure counts once", () => {
    const { mgr } = mk(1);
    join(mgr, "one", PIN);
    expect(join(mgr, "two", "bad", "2.2.2.2").errCodes).toEqual(["badpin"]);
    expect(join(mgr, "two", PIN, "2.2.2.2").errCodes).toEqual(["full"]);
    // 6 failures are answered badpin (the 6th trips the block): a double count would block earlier
    for (let i = 0; i < 6; i++) expect(join(mgr, "one", "bad", "3.3.3.3").errCodes).toEqual(["badpin"]);
    expect(join(mgr, "one", "bad", "3.3.3.3").errCodes).toEqual(["ratelimit"]);
  });
});

describe("M3: a short PIN is refused unless ALLOW_DEV=1", () => {
  it("refuses fewer than 8 characters with a clear message", () => {
    expect(() => loadConfig({ PIN: "1234" })).toThrow(/at least 8/);
    expect(() => loadConfig({ PIN: "1234567" })).toThrow(/ALLOW_DEV/);
  });
  it("accepts 8+ characters, or any PIN with ALLOW_DEV=1", () => {
    expect(loadConfig({ PIN: "12345678" }).pin).toBe("12345678");
    expect(loadConfig({ PIN: "1", ALLOW_DEV: "1" }).pin).toBe("1");
  });
});

describe("Task 7: a persistent tick failure does not flood the log", () => {
  it("logs the first failure at once, then one line per 5 s with a suppressed count; keeps running", () => {
    const err = vi.spyOn(console, "error").mockImplementation(() => {});
    const h = makeRoom();
    seat(h);
    h.room.start();
    h.room.sim!.step = () => {
      throw new Error("boom");
    };
    const pump = [...h.timers.intervals.values()][0]!;
    for (let i = 0; i < 20; i++) {
      h.clock.t += 100;
      pump();
    }
    expect(err).toHaveBeenCalledTimes(1);
    h.clock.t += 5000;
    pump();
    expect(err).toHaveBeenCalledTimes(2);
    expect(String(err.mock.calls[1]![0])).toMatch(/suppressed/);
  });
});
