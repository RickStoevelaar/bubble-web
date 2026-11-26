import { describe, expect, it } from "vitest";
import { Flow } from "../src/screens/flow";
import { installScoresInput, installTitleStart, isStartKey } from "../src/screens/input";
import type { ConnState } from "../src/net";

type H = (e: never) => void;
function target() {
  const hs = new Map<string, Set<H>>();
  return {
    addEventListener: (t: string, h: H) => void (hs.get(t) ?? hs.set(t, new Set()).get(t)!).add(h),
    removeEventListener: (t: string, h: H) => void hs.get(t)?.delete(h),
    fire: (t: string, e: object = {}) => hs.get(t)?.forEach((h) => (h as (x: object) => void)(e)),
  };
}
const key = (k: string, extra: object = {}) => ({ key: k, preventDefault() {}, ...extra });

class FakeGame {
  resyncs = 0;
  constructor(readonly localPlayer: 0 | 1 = 0) {}
  resync(): void {
    this.resyncs++;
  }
}

function setup() {
  const conn = { connectionState: "closed" as ConnState, closes: 0, close() { this.closes++; this.connectionState = "closed"; } };
  const panel = { log: [] as string[], show() { this.log.push("show"); }, hide() { this.log.push("hide"); } };
  const entered: string[] = [];
  const flow = new Flow<FakeGame>(conn, panel, (prev, to) => entered.push(`${prev}>${to}`));
  /** The glue main.ts does on a successful join. */
  const joinOk = () => {
    flow.beginJoin();
    conn.connectionState = "joined";
    flow.game = new FakeGame();
    flow.go({ t: "joined" });
    flow.connState("joined");
  };
  return { conn, panel, entered, flow, joinOk };
}

describe("Flow: session lifecycle across screens", () => {
  it("join -> scores -> title -> join: no banner, no stale game, the new join works", () => {
    const s = setup();
    s.flow.go({ t: "start" });
    s.joinOk();
    const old = s.flow.game!;
    expect(s.flow.everJoined).toBe(true);

    s.flow.go({ t: "phase", phase: "gameover", runOver: false });
    s.flow.go({ t: "declined" });
    s.flow.go({ t: "phase", phase: "gameover", runOver: true }); // the server's answer: the run is over
    expect(s.flow.screen).toBe("scores");
    s.flow.go({ t: "back" });
    expect(s.flow.screen).toBe("title");
    expect(s.flow.everJoined).toBe(false);
    expect(s.flow.game).toBeNull();

    s.flow.go({ t: "start" });
    expect(s.flow.screen).toBe("join");
    // a stray "reconnecting" state over the join form must not show the banner
    s.conn.connectionState = "reconnecting";
    expect(s.flow.bannerVisible("reconnecting…")).toBe(false);
    s.flow.connState("reconnecting");

    s.joinOk();
    expect(s.flow.screen).toBe("game");
    expect(s.flow.game).not.toBe(old);
    expect(old.resyncs).toBe(0); // the stale game is never resynced
    expect(s.flow.game!.resyncs).toBe(0); // a first join is not a rejoin
  });

  it("the banner shows only while playing", () => {
    const s = setup();
    for (const [ev, shown] of [[{ t: "start" }, false], [{ t: "joined" }, true]] as const) {
      s.flow.go(ev);
      expect(s.flow.bannerVisible("x")).toBe(shown);
    }
    expect(s.flow.bannerVisible(null)).toBe(false);
    s.flow.go({ t: "phase", phase: "ending" });
    expect(s.flow.bannerVisible("x")).toBe(true);
    s.flow.go({ t: "endingDone" });
    expect(s.flow.bannerVisible("x")).toBe(false); // scores
  });

  it("a rejoin of the SAME session resyncs the game (reconnect keeps everJoined)", () => {
    const s = setup();
    s.flow.go({ t: "start" });
    s.joinOk();
    s.conn.connectionState = "reconnecting";
    s.flow.connState("reconnecting");
    expect(s.flow.screen).toBe("game");
    s.conn.connectionState = "joined";
    s.flow.connState("joined");
    expect(s.flow.game!.resyncs).toBe(1);
  });
});

describe("Flow: leaving for scores closes the connection once", () => {
  it("game over -> decline -> run over -> scores: one close, later closed states are ignored", () => {
    const s = setup();
    s.flow.go({ t: "start" });
    s.joinOk();
    s.flow.go({ t: "phase", phase: "gameover", runOver: false });
    expect(s.flow.screen).toBe("gameover");
    expect(s.entered).toContain("game>gameover"); // main.ts shows the panel from onEnter
    s.flow.go({ t: "declined" });
    expect(s.conn.closes).toBe(0); // our answer alone does not leave
    s.flow.go({ t: "phase", phase: "gameover", runOver: true });
    expect(s.flow.screen).toBe("scores");
    expect(s.conn.closes).toBe(1);
    s.flow.go({ t: "closedAfterJoin" });
    s.flow.go({ t: "phase", phase: "gameover", runOver: true });
    expect(s.flow.screen).toBe("scores");
    expect(s.conn.closes).toBe(1);
    expect(s.panel.log[s.panel.log.length - 1]).toBe("hide");
  });

  it("the ending also closes once on its way to scores", () => {
    const s = setup();
    s.flow.go({ t: "start" });
    s.joinOk();
    s.flow.go({ t: "phase", phase: "ending" });
    s.flow.go({ t: "endingDone" });
    expect(s.flow.screen).toBe("scores");
    expect(s.conn.closes).toBe(1);
  });

  it("a fresh run's snapshot while on the ending screen (server restarted) goes to scores and closes the connection", () => {
    const s = setup();
    s.flow.go({ t: "start" });
    s.joinOk();
    s.flow.go({ t: "phase", phase: "ending" });
    expect(s.flow.screen).toBe("ending");
    s.flow.go({ t: "phase", phase: "round" });
    expect(s.flow.screen).toBe("scores");
    expect(s.conn.closes).toBe(1);
  });

  it("a continue that wins returns to the game without closing", () => {
    const s = setup();
    s.flow.go({ t: "start" });
    s.joinOk();
    s.flow.go({ t: "phase", phase: "gameover", runOver: false });
    s.flow.go({ t: "continued" });
    s.flow.go({ t: "phase", phase: "round" });
    expect(s.flow.screen).toBe("game");
    expect(s.conn.closes).toBe(0);
  });
});

describe("Flow: a dead socket does not strand the game-over screen", () => {
  it("a reconnect while on game over offers the question again", () => {
    const s = setup();
    s.flow.go({ t: "start" });
    s.joinOk();
    s.flow.go({ t: "phase", phase: "gameover", runOver: false });
    s.flow.go({ t: "declined" }); // answer sent into a socket that then died
    s.panel.log.length = 0;
    s.conn.connectionState = "reconnecting";
    s.flow.connState("reconnecting");
    expect(s.flow.screen).toBe("gameover");
    s.conn.connectionState = "joined";
    s.flow.connState("joined");
    expect(s.panel.log).toEqual(["hide", "show"]);
    expect(s.flow.screen).toBe("gameover");
  });

  it("a session that closes for good goes back to the join form", () => {
    const s = setup();
    s.flow.go({ t: "start" });
    s.joinOk();
    s.flow.go({ t: "phase", phase: "gameover", runOver: false });
    s.conn.connectionState = "closed";
    s.flow.connState("closed");
    expect(s.flow.screen).toBe("join");
    expect(s.panel.log[s.panel.log.length - 1]).toBe("hide");
  });
});

describe("keys: held keys and mute", () => {
  it("M is not a start key and a held key (repeat) never starts the title", () => {
    expect(isStartKey({ key: "m" })).toBe(false);
    expect(isStartKey({ key: "M" })).toBe(false);
    expect(isStartKey({ key: "a" })).toBe(true);
    const t = target();
    let starts = 0;
    installTitleStart(t, () => starts++);
    t.fire("keydown", key("Enter", { repeat: true }));
    t.fire("keydown", key("m"));
    expect(starts).toBe(0);
    t.fire("keydown", key("Enter"));
    expect(starts).toBe(1);
  });

  it("a held Enter on the scores screen does not go back repeatedly", () => {
    const t = target();
    const acts: string[] = [];
    installScoresInput(t, { getBoundingClientRect: () => ({ left: 0, top: 0, width: 256, height: 224 }) }, (a) => acts.push(a));
    t.fire("keydown", key("Enter", { repeat: true }));
    expect(acts).toEqual([]);
    t.fire("keydown", key("Enter"));
    expect(acts).toEqual(["back"]);
  });
});

describe("Flow: a rejoin that seats us as the other hero", () => {
  it("replaces the game with one for the new hero; the same hero keeps the game", () => {
    const s = setup();
    s.flow.go({ t: "start" });
    s.joinOk();
    const first = s.flow.game!;
    const make = (id: 0 | 1) => new FakeGame(id);
    expect(s.flow.reseat(0, make)).toBe(false);
    expect(s.flow.game).toBe(first);
    expect(s.flow.reseat(1, make)).toBe(true);
    expect(s.flow.game).not.toBe(first);
    expect(s.flow.game!.localPlayer).toBe(1);
    expect(s.flow.reseat(1, make)).toBe(false);
  });

  it("does nothing before a game exists (the first join builds it)", () => {
    const s = setup();
    expect(s.flow.reseat(1, (id) => new FakeGame(id))).toBe(false);
    expect(s.flow.game).toBeNull();
  });
});
