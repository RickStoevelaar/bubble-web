import { existsSync, mkdtempSync, readdirSync, readFileSync, rmSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { TEST_LEVEL } from "@bubble/shared";
import { afterEach, beforeEach, describe, expect, it } from "vitest";
import { HIGHSCORE_CAP, HighScores, insertScore } from "../src/persist";
import type { ScoreEntry } from "../src/persist";
import { Room } from "../src/room";
import { FakeSocket, FakeTimers, MemPersist, PIN, joinMsg, makeRoom, ticks } from "./helpers";

let dir: string;
let file: string;
beforeEach(() => {
  dir = mkdtempSync(join(tmpdir(), "bubble-hs-"));
  file = join(dir, "highscores.json");
});
afterEach(() => rmSync(dir, { recursive: true, force: true }));

const entry = (score: number, date = "2026-01-01T00:00:00.000Z", names = ["A"]): ScoreEntry => ({ names, score, round: 1, date });

describe("insertScore", () => {
  it("keeps the list sorted descending by score", () => {
    let list: ScoreEntry[] = [];
    for (const s of [300, 900, 100, 500]) list = insertScore(list, entry(s), 20);
    expect(list.map((e) => e.score)).toEqual([900, 500, 300, 100]);
  });

  it("puts a tie before older entries (newer first)", () => {
    const older = entry(500, "2026-01-01T00:00:00.000Z", ["old"]);
    const newer = entry(500, "2026-02-01T00:00:00.000Z", ["new"]);
    const list = insertScore([older], newer, 20);
    expect(list.map((e) => e.names[0])).toEqual(["new", "old"]);
  });

  it("caps at the given size, dropping the lowest, and does not mutate its input", () => {
    const base = Array.from({ length: 20 }, (_, i) => entry(1000 - i));
    const frozen = JSON.stringify(base);
    const out = insertScore(base, entry(5000), 20);
    expect(out).toHaveLength(20);
    expect(out[0]!.score).toBe(5000);
    expect(out[19]!.score).toBe(982);
    expect(insertScore(base, entry(1), 20)).toHaveLength(20);
    expect(insertScore(base, entry(1), 20).some((e) => e.score === 1)).toBe(false);
    expect(JSON.stringify(base)).toBe(frozen);
    expect(HIGHSCORE_CAP).toBe(20);
  });
});

describe("HighScores file", () => {
  it("drops malformed entries when reading and tolerates a missing/corrupt file", () => {
    const hs = new HighScores(file);
    expect(hs.list()).toEqual([]);
    writeFileSync(file, "{bad");
    expect(hs.list()).toEqual([]);
    writeFileSync(
      file,
      JSON.stringify([
        entry(10),
        { names: "x", score: 5, round: 1, date: "d" },
        { names: ["a"], score: "5", round: 1, date: "d" },
        null,
        7,
        { names: ["a", 3], score: 5, round: 1, date: "d" },
        entry(20),
      ]),
    );
    expect(hs.list().map((e) => e.score)).toEqual([20, 10]);
  });

  it("records atomically: sorted file, no tmp left behind", () => {
    const hs = new HighScores(file);
    hs.record(entry(100));
    hs.record(entry(300));
    hs.record(entry(200));
    expect(JSON.parse(readFileSync(file, "utf8")).map((e: ScoreEntry) => e.score)).toEqual([300, 200, 100]);
    expect(readdirSync(dir)).toEqual(["highscores.json"]);
  });

  it("two HighScores instances on one file do not clobber each other", () => {
    const a = new HighScores(file);
    const b = new HighScores(file);
    a.record(entry(100, undefined, ["a"]));
    b.record(entry(200, undefined, ["b"]));
    a.record(entry(150, undefined, ["a2"]));
    expect(new HighScores(file).list().map((e) => e.score)).toEqual([200, 150, 100]);
  });
});

/** A room (with injected clock) wired to a high-score file. */
function scoredRoom(code = "ABC", scores = new HighScores(file), clock = { t: Date.UTC(2026, 5, 7, 12, 0, 0) }, persist = new MemPersist()) {
  const timers = new FakeTimers();
  const room = new Room(code, [TEST_LEVEL], persist, { pin: PIN, now: () => clock.t, timers, seed: 42, scores });
  return { room, clock, persist, scores };
}
function join2(room: Room, names: [string, string?]) {
  const a = new FakeSocket();
  room.join(a, joinMsg({ name: names[0] }));
  let b: FakeSocket | undefined;
  if (names[1] !== undefined) {
    b = new FakeSocket();
    room.join(b, joinMsg({ name: names[1] }));
  }
  return { a, b };
}
/** Drives the sim into game over with the given scores. */
function toGameOver(room: Room, scores: number[]) {
  const st = room.sim!.state;
  scores.forEach((s, i) => (st.players[i]!.score = s));
  st.round = 1;
  for (const p of st.players) {
    p.state = "gone";
    p.lives = 0;
  }
  ticks(room, 2);
  expect(st.phase).toBe("gameover");
}

describe("Room high scores", () => {
  it("game over then declining continue writes exactly one entry: summed score, seated names, round, injected-clock date", () => {
    const { room, scores } = scoredRoom();
    const { a } = join2(room, ["  Rick ", "Sam"]);
    toGameOver(room, [1200, 3400]);
    expect(scores.list()).toEqual([]);
    a.emit({ t: "continue", accept: false });
    expect(scores.list()).toEqual([
      { names: ["Rick", "Sam"], score: 4600, round: 1, date: new Date(Date.UTC(2026, 5, 7, 12, 0, 0)).toISOString() },
    ]);
    // A second end signal (another decline, ticks while over) must not write again.
    a.emit({ t: "continue", accept: false });
    ticks(room, 5);
    expect(scores.list()).toHaveLength(1);
  });

  it("accepting continue writes nothing, and the next run's end writes once", () => {
    const { room, scores } = scoredRoom();
    const { a } = join2(room, ["Solo"]);
    toGameOver(room, [900]);
    a.emit({ t: "continue", accept: true });
    expect(scores.list()).toEqual([]);
    toGameOver(room, [2500]);
    a.emit({ t: "continue", accept: false });
    expect(scores.list().map((e) => e.score)).toEqual([2500]);
    expect(scores.list()[0]!.names).toEqual(["Solo"]);
  });

  it("finishing the last round writes one entry with the round reached", () => {
    const { room, scores } = scoredRoom();
    join2(room, ["Ann"]);
    const st = room.sim!.state;
    st.players[0]!.score = 777;
    st.phase = "clearing";
    st.phaseTicks = 1_000_000;
    st.round = 1; // TEST_LEVEL is the only level, so this is the last round
    ticks(room, 3);
    expect(st.runOver).toBe(true);
    expect(st.phase).toBe("ending");
    ticks(room, 10);
    expect(scores.list()).toEqual([{ names: ["Ann"], score: 777, round: 1, date: new Date(Date.UTC(2026, 5, 7, 12, 0, 0)).toISOString() }]);
  });

  it("a run with score 0 is not recorded", () => {
    const { room, scores } = scoredRoom();
    const { a } = join2(room, ["Zed"]);
    toGameOver(room, [0]);
    a.emit({ t: "continue", accept: false });
    expect(scores.list()).toEqual([]);
    expect(existsSync(file)).toBe(false);
  });

  it("a suspended-then-resumed unfinished run writes nothing", () => {
    const persist = new MemPersist();
    const first = scoredRoom("ABC", undefined, undefined, persist);
    join2(first.room, ["Rick"]);
    first.room.sim!.state.players[0]!.score = 5000;
    first.room.suspend();
    expect(first.scores.list()).toEqual([]);
    const second = scoredRoom("ABC", first.scores, undefined, persist);
    const { a } = join2(second.room, ["Rick"]);
    ticks(second.room, 30);
    expect(second.room.sim!.state.players[0]!.score).toBe(5000);
    expect(second.scores.list()).toEqual([]);
    toGameOver(second.room, [5000]);
    a.emit({ t: "continue", accept: false });
    expect(second.scores.list().map((e) => e.score)).toEqual([5000]);
  });

  it("two rooms ending at once do not clobber each other's entries", () => {
    // Separate HighScores instances on one file, as separate rooms/managers might hold.
    const r1 = scoredRoom("AAA", new HighScores(file));
    const r2 = scoredRoom("BBB", new HighScores(file));
    const s1 = join2(r1.room, ["One"]);
    const s2 = join2(r2.room, ["Two"]);
    toGameOver(r1.room, [100]);
    toGameOver(r2.room, [200]);
    s1.a.emit({ t: "continue", accept: false });
    s2.a.emit({ t: "continue", accept: false });
    const list = new HighScores(file).list();
    expect(list.map((e) => e.names[0])).toEqual(["Two", "One"]);
  });

  it("a Room without a score sink still works (makeRoom default)", () => {
    const h = makeRoom();
    const s = new FakeSocket();
    h.room.join(s, joinMsg());
    toGameOver(h.room, [10]);
    expect(() => s.emit({ t: "continue", accept: false })).not.toThrow();
  });
});
