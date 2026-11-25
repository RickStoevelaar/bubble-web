import { describe, expect, it, vi } from "vitest";
import type { ClientMsg, GameState, ServerMsg } from "@bubble/shared";
import { CONNECT_STALL_MS, Connection, NetError, STALL_MS, type StorageLike, type WebSocketLike } from "../src/net";

class FakeSocket implements WebSocketLike {
  readyState = 0;
  sent: ClientMsg[] = [];
  closedByClient = false;
  onopen: ((ev: unknown) => void) | null = null;
  onmessage: ((ev: { data: unknown }) => void) | null = null;
  onclose: ((ev: { code: number }) => void) | null = null;
  onerror: ((ev: unknown) => void) | null = null;
  constructor(public url: string) {}
  send(data: string): void {
    this.sent.push(JSON.parse(data) as ClientMsg);
  }
  close(): void {
    this.closedByClient = true;
    this.readyState = 3;
  }
  // --- test drivers
  open(): void {
    this.readyState = 1;
    this.onopen?.({});
  }
  recv(m: ServerMsg | string): void {
    this.onmessage?.({ data: typeof m === "string" ? m : JSON.stringify(m) });
  }
  drop(code = 1006): void {
    this.readyState = 3;
    this.onclose?.({ code });
  }
  joins(): Extract<ClientMsg, { t: "join" }>[] {
    return this.sent.filter((m): m is Extract<ClientMsg, { t: "join" }> => m.t === "join");
  }
}

function makeEnv(opts: { storage?: StorageLike; random?: () => number } = {}) {
  const sockets: FakeSocket[] = [];
  let now = 0;
  let nextId = 1;
  const timers = new Map<number, { at: number; fn: () => void }>();
  const store = new Map<string, string>();
  const storage: StorageLike = opts.storage ?? {
    getItem: (k) => store.get(k) ?? null,
    setItem: (k, v) => void store.set(k, v),
  };
  const env = {
    sockets,
    store,
    get last(): FakeSocket {
      return sockets[sockets.length - 1]!;
    },
    timers,
    advance(ms: number): void {
      const end = now + ms;
      for (;;) {
        let best: [number, { at: number; fn: () => void }] | undefined;
        for (const e of timers) if (e[1].at <= end && (!best || e[1].at < best[1].at)) best = e;
        if (!best) break;
        timers.delete(best[0]);
        now = best[1].at;
        best[1].fn();
      }
      now = end;
    },
    deps: {
      createSocket: (url: string) => {
        const s = new FakeSocket(url);
        sockets.push(s);
        return s;
      },
      storage,
      now: () => now,
      setTimer: (fn: () => void, ms: number) => {
        const id = nextId++;
        timers.set(id, { at: now + ms, fn });
        return id;
      },
      clearTimer: (h: unknown) => void timers.delete(h as number),
      random: opts.random ?? (() => 0.5),
    },
  };
  return env;
}

const state0 = { tick: 0 } as unknown as GameState;
const joined = (playerId: 0 | 1 = 0, rejoinToken = "tok1"): ServerMsg => ({ t: "joined", playerId, rejoinToken, round: 1 });
const snap = (tick: number, ackSeq: number): ServerMsg => ({ t: "snap", tick, ackSeq, state: state0, events: [] });

/** Connect and complete the join handshake; returns the connection. */
async function joinedConn(env: ReturnType<typeof makeEnv>, token = "tok1") {
  const c = new Connection("ws://x/ws", env.deps);
  const p = c.join("FAM", "pin", "Rick");
  env.last.open();
  env.last.recv(joined(0, token));
  await p;
  return c;
}

describe("Connection join", () => {
  it("resolves with playerId and token, sends the join message, and stores the token per room", async () => {
    const env = makeEnv();
    const c = new Connection("ws://x/ws", env.deps);
    const p = c.join("FAM", "1234", "Rick");
    expect(env.last.url).toBe("ws://x/ws");
    env.last.open();
    expect(env.last.joins()).toEqual([{ t: "join", room: "FAM", pin: "1234", name: "Rick" }]);
    env.last.recv(joined(1, "abc"));
    await expect(p).resolves.toEqual({ playerId: 1, rejoinToken: "abc" });
    expect(env.store.get("bubble.rejoin.FAM")).toBe("abc");
    c.close();
  });

  it("uses a stored token for a later join of the same room", () => {
    const env = makeEnv();
    env.store.set("bubble.rejoin.FAM", "old");
    const c = new Connection("ws://x/ws", env.deps);
    void c.join("FAM", "1234", "Rick").catch(() => {});
    env.last.open();
    expect(env.last.joins()[0]!.rejoinToken).toBe("old");
    c.close();
  });

  it("does not throw when storage is blocked", async () => {
    const throwing: StorageLike = {
      getItem: () => {
        throw new Error("blocked");
      },
      setItem: () => {
        throw new Error("blocked");
      },
    };
    const env = makeEnv({ storage: throwing });
    const c = new Connection("ws://x/ws", env.deps);
    const p = c.join("FAM", "1234", "Rick");
    env.last.open();
    env.last.recv(joined(0, "mem"));
    await expect(p).resolves.toMatchObject({ rejoinToken: "mem" });
    // still reconnects with the in-memory token
    env.last.drop();
    env.advance(1000);
    env.last.open();
    expect(env.last.joins()[0]!.rejoinToken).toBe("mem");
    c.close();
  });

  it.each(["badpin", "full", "locked"] as const)("rejects with %s and never reconnects", async (code) => {
    const env = makeEnv();
    const c = new Connection("ws://x/ws", env.deps);
    const errors: string[] = [];
    c.onError((e) => errors.push(e));
    const p = c.join("FAM", "bad", "Rick");
    env.last.open();
    env.last.recv({ t: "err", code });
    await expect(p).rejects.toMatchObject({ code });
    await expect(p).rejects.toBeInstanceOf(NetError);
    env.last.drop(1008);
    env.advance(120_000);
    expect(env.sockets.length).toBe(1);
    expect(errors).toEqual([code]);
    expect(env.timers.size).toBe(0);
  });

  it("rejects when the connection times out after about 8 s, and stops", async () => {
    const env = makeEnv();
    const c = new Connection("ws://x/ws", env.deps);
    const caught = c.join("FAM", "1234", "Rick").catch((e: unknown) => e);
    env.advance(7900);
    expect(env.last.closedByClient).toBe(false);
    env.advance(200);
    expect(await caught).toMatchObject({ code: "timeout" });
    expect(env.last.closedByClient).toBe(true);
    env.advance(60_000);
    expect(env.timers.size).toBe(0);
  });

  it("clears the join timeout once joined (only the liveness watchdog remains)", async () => {
    const env = makeEnv();
    const c = await joinedConn(env);
    expect(env.timers.size).toBe(1);
    c.close();
    expect(env.timers.size).toBe(0);
  });
});

describe("Connection onJoined", () => {
  it("reports the seat of every joined message, the first join and each rejoin, before the joined state", async () => {
    const env = makeEnv();
    const c = new Connection("ws://x/ws", env.deps);
    const log: string[] = [];
    c.onJoined((id) => log.push(`seat${id}`));
    c.onState((st) => log.push(st));
    const p = c.join("FAM", "pin", "Rick");
    env.last.open();
    env.last.recv(joined(0, "tokA"));
    await p;
    env.last.drop();
    env.advance(500);
    env.last.open();
    env.last.recv(joined(1, "tokB")); // after a suspend the server may seat us elsewhere
    expect(log).toEqual(["connecting", "seat0", "joined", "reconnecting", "seat1", "joined"]);
    c.close();
  });
});

describe("Connection reconnect", () => {
  it("goes connecting -> joined -> reconnecting -> joined and rejoins with the token", async () => {
    const env = makeEnv();
    const c = new Connection("ws://x/ws", env.deps);
    const states: string[] = [];
    c.onState((s) => states.push(s));
    const p = c.join("FAM", "pin", "Rick");
    env.last.open();
    env.last.recv(joined(0, "tokA"));
    await p;
    env.last.drop();
    expect(env.sockets.length).toBe(1);
    env.advance(500);
    expect(env.sockets.length).toBe(2);
    env.last.open();
    expect(env.last.joins()).toEqual([{ t: "join", room: "FAM", pin: "pin", name: "Rick", rejoinToken: "tokA" }]);
    env.last.recv(joined(0, "tokA"));
    expect(states).toEqual(["connecting", "joined", "reconnecting", "joined"]);
    c.close();
    expect(states[states.length - 1]).toBe("closed");
  });

  it("backs off 0.5 s doubling to an 8 s cap", async () => {
    const env = makeEnv({ random: () => 0.5 }); // factor 1.0
    const c = await joinedConn(env);
    const delays: number[] = [];
    for (let i = 0; i < 7; i++) {
      const before = env.sockets.length;
      env.last.drop();
      let waited = 0;
      while (env.sockets.length === before && waited < 20_000) {
        env.advance(10);
        waited += 10;
      }
      delays.push(waited);
    }
    expect(delays).toEqual([500, 1000, 2000, 4000, 8000, 8000, 8000]);
    c.close();
  });

  it("applies +-20% jitter", async () => {
    for (const [rnd, expected] of [
      [0, 400],
      [1, 600],
    ] as const) {
      const env = makeEnv({ random: () => rnd });
      const c = await joinedConn(env);
      env.last.drop();
      env.advance(expected - 1);
      expect(env.sockets.length).toBe(1);
      env.advance(2);
      expect(env.sockets.length).toBe(2);
      c.close();
    }
  });

  it("resets the backoff after a successful rejoin", async () => {
    const env = makeEnv();
    const c = await joinedConn(env);
    env.last.drop();
    env.advance(500);
    env.last.drop();
    env.advance(1000);
    env.last.open();
    env.last.recv(joined(0, "tok1"));
    env.last.drop();
    env.advance(499);
    expect(env.sockets.length).toBe(3);
    env.advance(2);
    expect(env.sockets.length).toBe(4);
    c.close();
  });

  it("after close() leaves no timers and never reconnects", async () => {
    const env = makeEnv();
    const c = await joinedConn(env);
    env.last.drop();
    expect(env.timers.size).toBe(1);
    c.close();
    expect(env.timers.size).toBe(0);
    env.advance(60_000);
    expect(env.sockets.length).toBe(1);
    // a late close event from the old socket is ignored
    env.last.drop();
    expect(env.timers.size).toBe(0);
  });

  it("waits 60 s after a ratelimit error before retrying", async () => {
    const env = makeEnv();
    const c = await joinedConn(env);
    const errors: string[] = [];
    c.onError((e) => errors.push(e));
    env.last.drop();
    env.advance(500);
    env.last.open();
    env.last.recv({ t: "err", code: "ratelimit" });
    env.last.drop(1008);
    env.advance(59_000);
    expect(env.sockets.length).toBe(2);
    env.advance(1_001);
    expect(env.sockets.length).toBe(3);
    expect(errors).toEqual(["ratelimit"]);
    c.close();
  });

  it("treats a terminal error on rejoin (badpin) as final", async () => {
    const env = makeEnv();
    const c = await joinedConn(env);
    const errors: string[] = [];
    c.onError((e) => errors.push(e));
    env.last.drop();
    env.advance(500);
    env.last.open();
    env.last.recv({ t: "err", code: "badpin" });
    env.last.drop(1008);
    env.advance(120_000);
    expect(env.sockets.length).toBe(2);
    expect(errors).toEqual(["badpin"]);
  });

  it.each(["close code 1009", "err badmsg"])("reports badmsg for %s and does not retry", async (how) => {
    const env = makeEnv();
    const c = await joinedConn(env);
    const errors: string[] = [];
    const states: string[] = [];
    c.onError((e) => errors.push(e));
    c.onState((s) => states.push(s));
    if (how === "close code 1009") env.last.drop(1009);
    else {
      env.last.recv({ t: "err", code: "badmsg" });
      env.last.drop(1008);
    }
    env.advance(120_000);
    expect(env.sockets.length).toBe(1);
    expect(errors).toEqual(["badmsg"]);
    expect(states[states.length - 1]).toBe("closed");
    expect(env.timers.size).toBe(0);
  });
});

describe("Connection input and snapshots", () => {
  it("does not issue input seqs until the first snapshot, then continues above the server ack", async () => {
    const env = makeEnv();
    const c = await joinedConn(env);
    expect(c.nextInputSeq()).toBeUndefined();
    expect(c.sendInput(1, 2)).toBe(false);
    env.last.recv(snap(3, 500)); // server remembers seq 500 from a previous page life
    expect(c.nextInputSeq()).toBe(501);
    expect(c.nextInputSeq()).toBe(502);
    expect(c.sendInput(502, 2)).toBe(true);
    expect(env.last.sent.filter((m) => m.t === "input")).toEqual([{ t: "input", seq: 502, buttons: 2 }]);
    // never send a seq at or below the known ack
    expect(c.sendInput(500, 2)).toBe(false);
    c.close();
  });

  it("after a rejoin, seqs stay above both the local counter and the new ack", async () => {
    const env = makeEnv();
    const c = await joinedConn(env);
    env.last.recv(snap(1, 0));
    for (let i = 0; i < 10; i++) c.nextInputSeq();
    env.last.drop();
    env.advance(500);
    env.last.open();
    env.last.recv(joined());
    expect(c.nextInputSeq()).toBeUndefined(); // wait for the first post-rejoin snapshot
    env.last.recv(snap(9, 4));
    expect(c.nextInputSeq()).toBe(11);
    env.last.drop();
    env.advance(1000);
    env.last.open();
    env.last.recv(joined());
    env.last.recv(snap(20, 80));
    expect(c.nextInputSeq()).toBe(81);
    c.close();
  });

  it("delivers snapshots and peers to listeners, in order", async () => {
    const env = makeEnv();
    const c = await joinedConn(env);
    const ticks: number[] = [];
    const peers: unknown[] = [];
    c.onSnap((m) => ticks.push(m.tick));
    c.onPeer((m) => peers.push(m));
    env.last.recv(snap(3, 0));
    env.last.recv({ t: "peer", playerId: 1, name: "Ann", connected: true });
    env.last.recv(snap(6, 0));
    expect(ticks).toEqual([3, 6]);
    expect(peers).toEqual([{ t: "peer", playerId: 1, name: "Ann", connected: true }]);
    c.close();
  });

  it("ignores garbage and unknown messages without throwing", async () => {
    const env = makeEnv();
    const c = await joinedConn(env);
    const ticks: number[] = [];
    c.onSnap((m) => ticks.push(m.tick));
    const junk = ["not json", "null", "42", "[]", '{"t":"zzz"}', '{"t":"snap"}', '{"t":"snap","tick":"x"}', "{}"];
    for (const j of junk) expect(() => env.last.recv(j)).not.toThrow();
    expect(() => env.last.onmessage?.({ data: new ArrayBuffer(4) })).not.toThrow();
    expect(ticks).toEqual([]);
    env.last.recv(snap(3, 0));
    expect(ticks).toEqual([3]);
    c.close();
  });

  it("a throwing listener does not break the others", async () => {
    const env = makeEnv();
    const c = await joinedConn(env);
    const got: number[] = [];
    const quiet = vi.spyOn(console, "error").mockImplementation(() => {});
    c.onSnap(() => {
      throw new Error("boom");
    });
    c.onSnap((m) => got.push(m.tick));
    expect(() => env.last.recv(snap(3, 0))).not.toThrow();
    expect(got).toEqual([3]);
    expect(quiet).toHaveBeenCalled();
    quiet.mockRestore();
    c.close();
  });

  it("sends continue", async () => {
    const env = makeEnv();
    const c = await joinedConn(env);
    c.continue(true);
    expect(env.last.sent.at(-1)).toEqual({ t: "continue", accept: true });
    c.close();
  });
});

const alive = (env: ReturnType<typeof makeEnv>) => env.sockets.filter((s) => s.readyState !== 3).length;

describe("Connection liveness watchdog", () => {
  it("treats 3 s without any server message as a dead socket and rejoins with the token", async () => {
    const env = makeEnv();
    const c = await joinedConn(env, "tokW");
    const states: string[] = [];
    c.onState((s) => states.push(s));
    env.advance(STALL_MS - 1);
    expect(env.sockets.length).toBe(1);
    expect(states).toEqual([]);
    env.advance(1);
    expect(states).toEqual(["reconnecting"]);
    expect(env.sockets[0]!.closedByClient).toBe(true);
    expect(alive(env)).toBe(0);
    env.advance(500);
    expect(env.sockets.length).toBe(2);
    expect(alive(env)).toBe(1);
    env.last.open();
    expect(env.last.joins()[0]!.rejoinToken).toBe("tokW");
    env.last.recv(joined(0, "tokW"));
    expect(states).toEqual(["reconnecting", "joined"]);
    c.close();
    expect(env.timers.size).toBe(0);
  });

  it("stays alive while snapshots keep arriving", async () => {
    const env = makeEnv();
    const c = await joinedConn(env);
    for (let i = 0; i < 200; i++) {
      env.last.recv(snap(i, 0));
      env.advance(50);
    }
    expect(env.sockets.length).toBe(1);
    expect(c.connectionState).toBe("joined");
    c.close();
  });

  it("drops a reconnect socket that opens but never answers joined, then retries with backoff", async () => {
    const env = makeEnv();
    const c = await joinedConn(env);
    env.last.drop();
    env.advance(500);
    expect(env.sockets.length).toBe(2);
    env.last.open();
    env.advance(CONNECT_STALL_MS - 1);
    expect(env.sockets[1]!.closedByClient).toBe(false);
    env.advance(1);
    expect(env.sockets[1]!.closedByClient).toBe(true);
    expect(alive(env)).toBe(0);
    env.advance(999);
    expect(env.sockets.length).toBe(2);
    env.advance(1); // second backoff step: 1 s
    expect(env.sockets.length).toBe(3);
    expect(alive(env)).toBe(1);
    env.last.open();
    expect(env.last.joins()[0]!.rejoinToken).toBe("tok1");
    c.close();
    expect(env.timers.size).toBe(0);
  });

  it("any inbound message resets the connect budget", async () => {
    const env = makeEnv();
    const c = await joinedConn(env);
    env.last.drop();
    env.advance(500);
    env.last.open();
    env.advance(7000);
    env.last.recv("junk");
    env.advance(7999);
    expect(env.sockets[1]!.closedByClient).toBe(false);
    env.advance(1);
    expect(env.sockets[1]!.closedByClient).toBe(true);
    c.close();
  });

  it("never has two live sockets across repeated stalls", async () => {
    const env = makeEnv();
    const c = await joinedConn(env);
    for (let i = 0; i < 20; i++) {
      env.advance(500);
      expect(alive(env)).toBeLessThanOrEqual(1);
      env.advance(2000);
      expect(alive(env)).toBeLessThanOrEqual(1);
    }
    c.close();
    expect(env.timers.size).toBe(0);
  });

  it("close() during connecting leaves no timers", async () => {
    const env = makeEnv();
    const c = new Connection("ws://x/ws", env.deps);
    const caught = c.join("FAM", "pin", "Rick").catch((e: unknown) => e);
    env.last.open();
    c.close();
    expect(await caught).toMatchObject({ code: "closed" });
    expect(env.timers.size).toBe(0);
    env.advance(60_000);
    expect(env.sockets.length).toBe(1);
  });

  it("close() during a reconnect attempt leaves no timers", async () => {
    const env = makeEnv();
    const c = await joinedConn(env);
    env.last.drop();
    env.advance(500);
    expect(env.sockets.length).toBe(2);
    c.close();
    expect(env.timers.size).toBe(0);
  });
});
