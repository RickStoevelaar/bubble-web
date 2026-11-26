import { describe, expect, it } from "vitest";
import { next, type Screen, type ScreenEvent } from "../src/screens/machine";

const ALL: Screen[] = ["title", "join", "game", "gameover", "ending", "scores"];
const ph = (phase: "round" | "clearing" | "gameover" | "ending", runOver = false): ScreenEvent => ({ t: "phase", phase, runOver });

describe("screen machine: transitions", () => {
  it("title -> join on start; join -> game on joined", () => {
    expect(next("title", { t: "start" })).toBe("join");
    expect(next("join", { t: "joined" })).toBe("game");
  });

  it("join stays on join for a terminal error and goes back to title on back", () => {
    expect(next("join", { t: "joinFailed", err: "badpin" })).toBe("join");
    expect(next("join", { t: "back" })).toBe("title");
  });

  it("game -> gameover -> game around a continue", () => {
    expect(next("game", ph("gameover"))).toBe("gameover");
    expect(next("gameover", { t: "continued" })).toBe("gameover"); // waits for the server's answer
    expect(next("gameover", ph("gameover"))).toBe("gameover");
    expect(next("gameover", ph("round"))).toBe("game");
    expect(next("gameover", ph("clearing"))).toBe("game");
  });

  it("gameover -> scores when the run is over; our own decline alone does not leave (first answer wins)", () => {
    expect(next("gameover", { t: "declined" })).toBe("gameover");
    expect(next("gameover", ph("gameover", true))).toBe("scores");
  });

  it("game or gameover -> ending on phase ending; ending -> scores after endingDone", () => {
    expect(next("game", ph("ending"))).toBe("ending");
    expect(next("gameover", ph("ending"))).toBe("ending");
    expect(next("ending", { t: "endingDone" })).toBe("scores");
    expect(next("ending", ph("ending"))).toBe("ending");
    // a snapshot of a fresh run (server restarted during the ending) means the finished run is over
    expect(next("ending", ph("round"))).toBe("scores");
    expect(next("ending", ph("clearing"))).toBe("scores");
  });

  it("a run that is already over seen from the game screen goes straight to scores", () => {
    expect(next("game", ph("gameover", true))).toBe("scores");
  });

  it("scores -> title on back; scoresShown is a no-op", () => {
    expect(next("scores", { t: "back" })).toBe("title");
    expect(next("scores", { t: "scoresShown" })).toBe("scores");
  });

  it("round/clearing keep the game screen", () => {
    expect(next("game", ph("round"))).toBe("game");
    expect(next("game", ph("clearing"))).toBe("game");
  });

  it("a connection that closed after a join returns to join from the game screens only", () => {
    for (const s of ["game", "gameover", "ending"] as const) expect(next(s, { t: "closedAfterJoin" })).toBe("join");
    for (const s of ["title", "join", "scores"] as const) expect(next(s, { t: "closedAfterJoin" })).toBe(s);
    expect(next("game", { t: "joinFailed", err: "badpin" })).toBe("join");
  });
});

describe("screen machine: stale and illegal events", () => {
  it("ignores phase observations on screens that are not playing (a late snapshot must not leave the title)", () => {
    for (const s of ["title", "join", "scores"] as const) {
      for (const p of ["round", "clearing", "gameover", "ending"] as const) expect(next(s, ph(p))).toBe(s);
    }
    expect(next("title", ph("round"))).toBe("title");
  });

  it("never throws and stays on any illegal event, for every screen x event", () => {
    const events: ScreenEvent[] = [
      { t: "start" },
      { t: "joined" },
      { t: "joinFailed", err: "timeout" },
      { t: "closedAfterJoin" },
      ph("round"),
      ph("gameover"),
      ph("ending"),
      { t: "continued" },
      { t: "declined" },
      { t: "endingDone" },
      { t: "scoresShown" },
      { t: "back" },
    ];
    for (const s of ALL) for (const e of events) expect(ALL).toContain(next(s, e));
    // illegal ones stay
    expect(next("title", { t: "joined" })).toBe("title");
    expect(next("title", { t: "endingDone" })).toBe("title");
    expect(next("game", { t: "start" })).toBe("game");
    expect(next("game", { t: "back" })).toBe("game");
    expect(next("game", { t: "endingDone" })).toBe("game");
    expect(next("scores", { t: "joined" })).toBe("scores");
    expect(next("join", { t: "endingDone" })).toBe("join");
    expect(next("gameover", { t: "start" })).toBe("gameover");
  });

  it("survives garbage (unknown event kinds, bad phases)", () => {
    expect(next("game", { t: "nope" } as unknown as ScreenEvent)).toBe("game");
    expect(next("game", ph("weird" as never))).toBe("game");
    expect(next("zzz" as Screen, { t: "start" })).toBe("zzz");
    expect(next("game", null as unknown as ScreenEvent)).toBe("game");
  });

  it("is pure: the same input always gives the same output", () => {
    for (const s of ALL) expect(next(s, { t: "back" })).toBe(next(s, { t: "back" }));
  });
});
