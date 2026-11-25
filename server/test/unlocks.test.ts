import { mkdtempSync, readFileSync, readdirSync, rmSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { BOSS_ARENA, SUPER_CODE, TEST_LEVEL } from "@bubble/shared";
import type { BubbleState, ServerMsg } from "@bubble/shared";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import WebSocket from "ws";
import { createServer } from "../src/index";
import { UnlockStore, parseUnlocks, unlocksFile } from "../src/persist";
import { PIN_FAIL_LIMIT, Room } from "../src/room";
import { RoomManager } from "../src/rooms";
import { FakeSocket, FakeTimers, MemPersist, PIN, joinMsg, makeRoom, ticks } from "./helpers";

let dir: string;
let file: string;
beforeEach(() => {
  dir = mkdtempSync(join(tmpdir(), "bubble-unlock-"));
  file = unlocksFile(dir);
});
afterEach(() => rmSync(dir, { recursive: true, force: true }));

describe("parseUnlocks (pure)", () => {
  it("accepts only a well-typed record and otherwise returns locked", () => {
    expect(parseUnlocks({ super: true, date: "d" })).toEqual({ super: true, date: "d" });
    for (const bad of [undefined, null, 5, "x", [], {}, { super: "yes", date: "d" }, { super: true }, { super: true, date: 3 }]) {
      expect(parseUnlocks(bad)).toEqual({ super: false, date: "" });
    }
  });
});

describe("UnlockStore", () => {
  it("is locked for a missing or corrupt file", () => {
    const s = new UnlockStore(file);
    expect(s.isSuperUnlocked()).toBe(false);
    writeFileSync(file, "{nope");
    expect(s.isSuperUnlocked()).toBe(false);
    writeFileSync(file, JSON.stringify({ super: "true", date: 1 }));
    expect(s.isSuperUnlocked()).toBe(false);
  });

  it("unlocks once, keeps the first date, writes nothing the second time", () => {
    const s = new UnlockStore(file);
    s.unlockSuper("2026-01-01T00:00:00.000Z");
    expect(s.isSuperUnlocked()).toBe(true);
    const first = readFileSync(file, "utf8");
    s.unlockSuper("2027-01-01T00:00:00.000Z");
    expect(readFileSync(file, "utf8")).toBe(first);
    expect(new UnlockStore(file).isSuperUnlocked()).toBe(true);
  });

  it("stores only a boolean and a date, atomically (no tmp file left)", () => {
    new UnlockStore(file).unlockSuper("2026-01-01T00:00:00.000Z");
    expect(JSON.parse(readFileSync(file, "utf8"))).toEqual({ super: true, date: "2026-01-01T00:00:00.000Z" });
    expect(readdirSync(dir)).toEqual(["unlocks.json"]);
  });
});

class MemUnlocks {
  unlocked = false;
  calls: string[] = [];
  isSuperUnlocked(): boolean {
    return this.unlocked;
  }
  unlockSuper(d: string): void {
    this.calls.push(d);
    this.unlocked = true;
  }
}

function bossRoom(unlocks: { unlockSuper(d: string): void }, clock = { t: Date.UTC(2026, 6, 1, 12) }) {
  const room = new Room("ABC", [BOSS_ARENA], new MemPersist(), { pin: PIN, now: () => clock.t, timers: new FakeTimers(), seed: 7, unlocks });
  return { room, clock };
}
const killBoss = (room: Room): void => {
  const sim = room.sim!;
  for (const p of sim.state.players) p.invulnTicks = 1_000_000;
  const boss = sim.state.enemies.find((e) => e.type === "boss")!;
  boss.hp = 1;
  const shot: BubbleState = {
    id: sim.state.nextId++,
    x: boss.x - 10,
    y: boss.y,
    vx: 3,
    vy: 0,
    kind: "lightning",
    phase: "launch",
    ageTicks: 0,
    owner: 0,
    shot: true,
  };
  sim.state.bubbles.push(shot);
  ticks(room, 3);
};

describe("Room unlock sink", () => {
  it("a true ending (two seats) records the unlock exactly once with the injected-clock date", () => {
    const u = new MemUnlocks();
    const { room, clock } = bossRoom(u);
    room.join(new FakeSocket("1"), joinMsg());
    room.join(new FakeSocket("2"), joinMsg({ name: "Amy" }));
    ticks(room, 2);
    killBoss(room);
    expect(room.sim!.state.ending).toBe("true");
    ticks(room, 30);
    clock.t += 5000;
    ticks(room, 30);
    expect(u.calls).toEqual([new Date(Date.UTC(2026, 6, 1, 12)).toISOString()]);
  });

  it("a bad ending (one player) never records", () => {
    const u = new MemUnlocks();
    const { room } = bossRoom(u);
    room.join(new FakeSocket(), joinMsg());
    ticks(room, 2);
    killBoss(room);
    expect(room.sim!.state.ending).toBe("bad");
    ticks(room, 30);
    expect(u.calls).toEqual([]);
  });

  it("a throwing sink does not break the tick loop", () => {
    const log = vi.spyOn(console, "error").mockImplementation(() => {});
    const { room } = bossRoom({
      unlockSuper: () => {
        throw new Error("disk");
      },
    });
    room.join(new FakeSocket("1"), joinMsg());
    room.join(new FakeSocket("2"), joinMsg({ name: "Amy" }));
    ticks(room, 2);
    expect(() => killBoss(room)).not.toThrow();
    expect(log).toHaveBeenCalledTimes(1);
    log.mockRestore();
  });
});

describe("Super room gate", () => {
  function mgr(unlocks: MemUnlocks, persist = new MemPersist()) {
    const h = makeRoom();
    const m = new RoomManager([TEST_LEVEL], persist, { ...h.opts, unlocks });
    return { m, h, persist };
  }
  const code = SUPER_CODE;
  const sj = (sock: FakeSocket, extra = {}) => sock.emit({ t: "join", room: code, pin: PIN, name: "Bob", ...extra });

  it("wrong PIN gets badpin whatever the lock state, and counts toward the rate limit", () => {
    for (const unlocked of [false, true]) {
      const u = new MemUnlocks();
      u.unlocked = unlocked;
      const { m } = mgr(u);
      const socks: FakeSocket[] = [];
      for (let i = 0; i < PIN_FAIL_LIMIT + 2; i++) {
        const s = new FakeSocket("9.9.9.9");
        socks.push(s);
        m.attach(s);
        sj(s, { pin: "wrong" });
      }
      expect(socks[0]!.errCodes).toEqual(["badpin"]);
      expect(socks.at(-1)!.errCodes).toEqual(["ratelimit"]);
      expect(m.rooms.size).toBe(0);
    }
  });

  it("right PIN while locked: locked + close, no room, and it never feeds the rate limiter", () => {
    const { m } = mgr(new MemUnlocks());
    for (let i = 0; i < PIN_FAIL_LIMIT * 3; i++) {
      const s = new FakeSocket("8.8.8.8");
      m.attach(s);
      sj(s);
      expect(s.errCodes).toEqual(["locked"]);
      expect(s.closed).toBe(true);
    }
    expect(m.rooms.size).toBe(0);
    const ok = new FakeSocket("8.8.8.8");
    m.attach(ok);
    ok.emit({ t: "join", room: "ABC", pin: PIN, name: "Bob" });
    expect(ok.errCodes).toEqual([]);
    m.closeAll();
  });

  it("lowercase variants of the code cannot bypass the gate", () => {
    const { m } = mgr(new MemUnlocks());
    const s = new FakeSocket();
    m.attach(s);
    sj(s, { room: code.toLowerCase() });
    expect(s.errCodes).toEqual(["locked"]);
    expect(m.rooms.size).toBe(0);
  });

  it("right PIN once unlocked: a super room whose snapshot says superMode, with angry enemies", () => {
    const u = new MemUnlocks();
    u.unlocked = true;
    const { m } = mgr(u);
    const s = new FakeSocket();
    m.attach(s);
    sj(s);
    expect(s.errCodes).toEqual([]);
    const room = m.rooms.get(code)!;
    ticks(room, 6);
    const snap = s.last("snap");
    expect(snap.state.superMode).toBe(true);
    expect(snap.state.enemies.length).toBeGreaterThan(0);
    expect(snap.state.enemies.every((e) => e.angry)).toBe(true);
    m.closeAll();
  });

  it("ordinary codes are never super, even after the unlock", () => {
    const u = new MemUnlocks();
    u.unlocked = true;
    const { m } = mgr(u);
    const s = new FakeSocket();
    m.attach(s);
    s.emit({ t: "join", room: "ABC", pin: PIN, name: "Bob" });
    expect(m.rooms.get("ABC")!.sim!.state.superMode).toBe(false);
    m.closeAll();
  });

  it("a suspended super room restores with superMode", () => {
    const u = new MemUnlocks();
    u.unlocked = true;
    const { m, persist } = mgr(u);
    const s = new FakeSocket();
    m.attach(s);
    sj(s);
    m.rooms.get(code)!.suspend();
    expect(JSON.parse(persist.files.get(code)!).superMode).toBe(true);
    const s2 = new FakeSocket();
    m.attach(s2);
    sj(s2);
    expect(m.rooms.get(code)!.sim!.state.superMode).toBe(true);
    m.closeAll();
  });

  it("end to end: a true ending writes unlocks.json once and then the super room opens", () => {
    const store = new UnlockStore(file);
    const h = makeRoom();
    const m = new RoomManager([BOSS_ARENA], new MemPersist(), { ...h.opts, unlocks: store });
    for (const [ip, n] of [["1", "A"], ["2", "B"]] as const) {
      const s = new FakeSocket(ip);
      m.attach(s);
      s.emit({ t: "join", room: "BOSS", pin: PIN, name: n });
    }
    const room = m.rooms.get("BOSS")!;
    ticks(room, 2);
    expect(new UnlockStore(file).isSuperUnlocked()).toBe(false);
    killBoss(room);
    expect(room.sim!.state.ending).toBe("true");
    expect(JSON.parse(readFileSync(file, "utf8"))).toEqual({ super: true, date: new Date(h.clock.t).toISOString() });
    const c = new FakeSocket("3");
    m.attach(c);
    c.emit({ t: "join", room: code, pin: PIN, name: "C" });
    expect(c.errCodes).toEqual([]);
    expect(m.rooms.get(code)!.sim!.state.superMode).toBe(true);
    m.closeAll();
  });
});

describe("createServer wiring", () => {
  const talk = (port: number, room: string) =>
    new Promise<ServerMsg[]>((resolve, reject) => {
      const ws = new WebSocket(`ws://127.0.0.1:${port}/ws`);
      const msgs: ServerMsg[] = [];
      const timer = setTimeout(() => reject(new Error("timeout")), 4000);
      ws.on("message", (d) => {
        msgs.push(JSON.parse(d.toString()) as ServerMsg);
        if (msgs.some((m) => m.t === "snap" || m.t === "err")) {
          clearTimeout(timer);
          ws.close();
          resolve(msgs);
        }
      });
      ws.on("open", () => ws.send(JSON.stringify({ t: "join", room, pin: PIN, name: "Zed" })));
      ws.on("error", reject);
    });

  it("answers locked on a fresh data dir and serves a super snapshot after unlocks.json exists", async () => {
    const srv = await createServer({ pin: PIN, port: 0, dataDir: dir, staticRoot: join(dir, "none") });
    try {
      expect(await talk(srv.port, SUPER_CODE)).toEqual([{ t: "err", code: "locked" }]);
      writeFileSync(file, JSON.stringify({ super: true, date: "2026-01-01T00:00:00.000Z" }));
      const msgs = await talk(srv.port, SUPER_CODE);
      const snap = msgs.find((m) => m.t === "snap") as Extract<ServerMsg, { t: "snap" }>;
      expect(snap.state.superMode).toBe(true);
    } finally {
      await srv.close();
    }
  });
});
