import { TEST_LEVEL } from "@bubble/shared";
import { describe, expect, it, vi } from "vitest";
import { createFilePersist } from "../src/persist";
import { SUSPEND_AFTER_MS } from "../src/room";
import type { UnlockSink } from "../src/room";
import { RoomManager } from "../src/rooms";
import { FakeSocket, MemPersist, PIN, joinMsg, makeRoom, ticks } from "./helpers";
import { mkdtempSync, rmSync, writeFileSync, mkdirSync, readdirSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";

/** A suspended run in `persist`: `players` heroes; returns their tokens. */
function suspendedRun(players: 1 | 2, persist = new MemPersist()) {
  const h = makeRoom({}, persist);
  const socks = [new FakeSocket(), new FakeSocket()].slice(0, players);
  socks.forEach((s, i) => h.room.join(s, joinMsg({ name: `P${i}` })));
  ticks(h.room, 30);
  const tokens = socks.map((s) => s.of("joined")[0]!.rejoinToken);
  socks.forEach((s) => s.drop());
  h.clock.t += SUSPEND_AFTER_MS;
  h.room.tick();
  expect(h.room.dormant).toBe(true);
  return { persist, clock: h.clock, tokens };
}

function manager(persist: MemPersist, clock: { t: number }) {
  const h = makeRoom({}, persist, clock);
  return new RoomManager([TEST_LEVEL], persist, { ...h.opts });
}
function mgrJoin(mgr: RoomManager, extra: object = {}) {
  const s = new FakeSocket("1.1.1.1");
  mgr.attach(s);
  s.emit({ t: "join", room: "ABC", pin: PIN, name: "x", ...extra });
  return s;
}

describe("a resumed run through the RoomManager", () => {
  it("a two-player save without tokens: two tokenless joiners get in (even a minute apart), the third gets full", () => {
    const { persist, clock } = suspendedRun(2);
    persist.seatFiles.clear();
    const mgr = manager(persist, clock);
    const a = mgrJoin(mgr);
    expect(a.of("joined")[0]).toMatchObject({ playerId: 0 });
    clock.t += 60_000;
    const b = mgrJoin(mgr);
    expect(b.of("joined")[0]).toMatchObject({ playerId: 1 });
    expect(mgrJoin(mgr).errCodes).toEqual(["full"]);
    mgr.closeAll();
  });

  it("a two-player save with tokens: a tokenless joiner is not locked out, repeated attempts keep working", () => {
    const { persist, clock } = suspendedRun(2);
    const mgr = manager(persist, clock);
    for (let i = 0; i < 4; i++) {
      const s = mgrJoin(mgr);
      expect(s.errCodes).toEqual([]);
      s.drop();
      clock.t += 60_000;
      mgr.rooms.get("ABC")?.suspend();
    }
    mgr.closeAll();
  });

  it("one valid token: that player gets their hero back, the tokenless one gets the other", () => {
    const { persist, clock, tokens } = suspendedRun(2);
    const mgr = manager(persist, clock);
    const b = mgrJoin(mgr, { rejoinToken: tokens[1] });
    expect(b.of("joined")[0]).toMatchObject({ playerId: 1, rejoinToken: tokens[1] });
    const a = mgrJoin(mgr);
    expect(a.of("joined")[0]).toMatchObject({ playerId: 0 });
    mgr.closeAll();
  });

  it("a one-player save resumed by a tokenless player gives hero 1, not a second hero", () => {
    const { persist, clock } = suspendedRun(1);
    const mgr = manager(persist, clock);
    const a = mgrJoin(mgr);
    expect(a.of("joined")[0]).toMatchObject({ playerId: 0 });
    expect(mgr.rooms.get("ABC")!.sim!.state.players).toHaveLength(1);
    mgr.closeAll();
  });

  it("within this process a just-disconnected holder's seat is still reserved", () => {
    const h = makeRoom();
    const a = new FakeSocket();
    const b = new FakeSocket();
    h.room.join(a, joinMsg());
    h.room.join(b, joinMsg());
    b.drop();
    h.clock.t += 1000;
    const c = new FakeSocket();
    h.room.join(c, joinMsg());
    expect(c.errCodes).toEqual(["full"]);
  });
});

describe("a failed unlock write is not lost when a finished run is reset", () => {
  it("is retried before the reset and recorded once with the original date", () => {
    let fail = true;
    const calls: string[] = [];
    const unlocks: UnlockSink = {
      unlockSuper: (d) => {
        if (fail) throw new Error("disk");
        calls.push(d);
      },
    };
    vi.spyOn(console, "error").mockImplementation(() => {});
    const h = makeRoom({ unlocks });
    const a = new FakeSocket();
    h.room.join(a, joinMsg());
    ticks(h.room, 3);
    const st = h.room.sim!.state;
    st.ending = "true";
    st.phase = "ending";
    st.runOver = true;
    ticks(h.room, 3); // write fails
    expect(calls).toEqual([]);
    const firstDate = new Date(h.clock.t).toISOString();
    a.drop();
    h.clock.t += 1000; // inside the retry throttle
    fail = false;
    h.room.join(new FakeSocket(), joinMsg());
    expect(calls).toEqual([firstDate]);
    expect(h.room.sim!.state.runOver).toBe(false);
    vi.restoreAllMocks();
  });
});

describe("file persist remove", () => {
  it("still removes the seats file when unlinking the save fails", () => {
    const dir = mkdtempSync(join(tmpdir(), "bubble-rm-"));
    try {
      const p = createFilePersist(dir);
      mkdirSync(join(dir, "room-ABC.json")); // unlink on a directory: EISDIR/EPERM, not ENOENT
      writeFileSync(join(dir, "room-ABC.seats.json"), "[]");
      expect(() => p.remove("ABC")).toThrow();
      expect(readdirSync(dir)).toEqual(["room-ABC.json"]);
    } finally {
      rmSync(dir, { recursive: true, force: true });
    }
  });
});
