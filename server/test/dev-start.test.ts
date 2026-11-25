import { TEST_LEVEL } from "@bubble/shared";
import type { LevelData } from "@bubble/shared";
import { describe, expect, it } from "vitest";
import { RoomManager } from "../src/rooms";
import { parseClientMsg } from "../src/validate";
import { FakeSocket, FakeTimers, MemPersist, PIN } from "./helpers";

const LEVELS: LevelData[] = Array.from({ length: 10 }, () => TEST_LEVEL);

function setup(allowDev: boolean, persist = new MemPersist()) {
  const m = new RoomManager(LEVELS, persist, { pin: PIN, timers: new FakeTimers(), seed: 5, allowDev });
  return { m, persist };
}
function join(m: RoomManager, startRound: unknown, room = "ABC", name = "Bob"): FakeSocket {
  const s = new FakeSocket("1.1.1.1");
  m.attach(s);
  s.emit({ t: "join", room, pin: PIN, name, ...(startRound === undefined ? {} : { startRound }) });
  return s;
}
const roundOf = (m: RoomManager, room = "ABC") => m.rooms.get(room)!.sim!.state.round;

describe("startRound dev shortcut", () => {
  it("is ignored without ALLOW_DEV, silently", () => {
    const { m } = setup(false);
    const s = join(m, 5);
    expect(roundOf(m)).toBe(1);
    expect(s.errCodes).toEqual([]);
    expect(s.last("joined").round).toBe(1);
  });

  it("is honored on a NEW room with ALLOW_DEV", () => {
    const { m } = setup(true);
    const s = join(m, 5);
    expect(roundOf(m)).toBe(5);
    expect(s.last("joined").round).toBe(5);
  });

  it("is ignored when the room is already live", () => {
    const { m } = setup(true);
    join(m, undefined);
    join(m, 7, "ABC", "Cy");
    expect(roundOf(m)).toBe(1);
  });

  it("is ignored when the room resumes from a saved run", () => {
    const { m, persist } = setup(true);
    join(m, 4);
    m.closeAll(); // suspends and saves
    expect(persist.files.has("ABC")).toBe(true);
    const { m: m2 } = setup(true, persist);
    const s = join(m2, 9);
    expect(roundOf(m2)).toBe(4);
    expect(s.last("joined").round).toBe(4);
  });

  it("ignores out-of-range values", () => {
    for (const v of [0, -3, 11, 101]) {
      const { m } = setup(true);
      join(m, v);
      expect(roundOf(m)).toBe(1);
    }
  });

  it("does not let a rejected (bad PIN) join create a room at all", () => {
    const { m } = setup(true);
    const s = new FakeSocket("2.2.2.2");
    m.attach(s);
    s.emit({ t: "join", room: "ABC", pin: "nope", name: "x", startRound: 5 });
    expect(m.rooms.size).toBe(0);
  });
});

describe("startRound validation", () => {
  const j = (extra: object) => JSON.stringify({ t: "join", room: "ABC", pin: "p", name: "n", ...extra });
  it("accepts integers and passes them through", () => {
    expect(parseClientMsg(j({ startRound: 7 }))).toMatchObject({ startRound: 7 });
    expect(parseClientMsg(j({}))).not.toHaveProperty("startRound");
  });
  it("rejects every other type like the other optional fields (badmsg)", () => {
    for (const v of ["7", 1.5, null, true, [1], {}]) expect(parseClientMsg(j({ startRound: v }))).toBeNull();
    expect(parseClientMsg('{"t":"join","room":"ABC","pin":"p","startRound":NaN}')).toBeNull();
    expect(parseClientMsg('{"t":"join","room":"ABC","pin":"p","startRound":1e400}')).toBeNull();
  });
  it("an invalid value is a badmsg through the manager", () => {
    const { m } = setup(true);
    const s = join(m, "7");
    expect(s.errCodes).toEqual(["badmsg"]);
  });
});
