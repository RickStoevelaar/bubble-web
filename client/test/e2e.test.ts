import { mkdtempSync, rmSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { afterAll, beforeAll, describe, expect, it } from "vitest";
import { BTN, LEVELS } from "@bubble/shared";
import { createServer, type RunningServer } from "../../server/src/index";
import { ClientGame } from "../src/game";
import { Connection, type StorageLike, type WebSocketLike } from "../src/net";

const PIN = "e2e-pin";
const sleep = (ms: number) => new Promise<void>((r) => setTimeout(r, ms));

/**
 * Polls `cond` until it holds. The default deadline is generous on purpose: the suite runs next to many other
 * test files, and a loaded machine can stall the server tick loop, the sockets and this process for seconds.
 * The deadline is a hang guard, never a performance assertion.
 */
async function until(what: string, cond: () => boolean, timeoutMs = 20_000): Promise<void> {
  const deadline = Date.now() + timeoutMs;
  while (!cond()) {
    if (Date.now() > deadline) throw new Error(`timed out after ${timeoutMs} ms waiting for ${what}`);
    await sleep(10);
  }
}

function memoryStorage(): StorageLike {
  const m = new Map<string, string>();
  return { getItem: (k) => m.get(k) ?? null, setItem: (k, v) => void m.set(k, v) };
}

describe("client <-> real server", () => {
  let server: RunningServer;
  let dataDir: string;
  const conns: Connection[] = [];
  const sockets: WebSocketLike[] = [];

  beforeAll(async () => {
    dataDir = mkdtempSync(join(tmpdir(), "bubble-e2e-"));
    server = await createServer({ pin: PIN, port: 0, dataDir });
  });

  afterAll(async () => {
    for (const c of conns) c.close();
    await server.close();
    rmSync(dataDir, { recursive: true, force: true });
  });

  function client() {
    const storage = memoryStorage();
    const conn = new Connection(`ws://127.0.0.1:${server.port}/ws`, {
      storage,
      createSocket: (url) => {
        const s = new WebSocket(url) as unknown as WebSocketLike;
        sockets.push(s);
        return s;
      },
    });
    conns.push(conn);
    return { conn, storage };
  }

  it("two clients share a round; player 0 moves right; a dropped socket reclaims seat 0", async () => {
    const a = client();
    const b = client();
    const joinA = await a.conn.join("e2e", PIN, "Ann");
    const joinB = await b.conn.join("e2e", PIN, "Ben");
    expect(joinA.playerId).toBe(0);
    expect(joinB.playerId).toBe(1);

    const gameA = new ClientGame({ levels: LEVELS, playerId: 0 });
    const gameB = new ClientGame({ levels: LEVELS, playerId: 1 });
    a.conn.onSnap((m) => gameA.onSnapshot(m));
    b.conn.onSnap((m) => gameB.onSnapshot(m));

    await until("first snapshots", () => gameA.viewState(performance.now()) !== null && gameB.viewState(performance.now()) !== null);
    const startX = gameB.viewState(performance.now())!.players[0]!.x;

    // Sends `buttons` for `count` inputs at real 16 ms pacing, through the same path main.ts uses. Inputs are only
    // handed out once the server's ack is known, so a slow first snapshot just delays them (bounded by `until`).
    const press = async (buttons: number, count: number): Promise<void> => {
      let sent = 0;
      await until(`${count} inputs of ${buttons} to be sent`, () => {
        const seq = a.conn.nextInputSeq();
        if (seq !== undefined) {
          a.conn.sendInput(seq, buttons);
          gameA.pushInput(seq, buttons);
          sent++;
        }
        return sent >= count;
      }); // `until` sleeps 10 ms between polls: the pacing is real, never asserted
    };
    await press(BTN.R, 20);

    await until("player 0 to move right on client B", () => gameB.viewState(performance.now())!.players[0]!.x > startX + 5);

    // Release the stick and let both clients SETTLE before comparing them. The old test compared A's predicted x
    // with B's interpolated x while the hero was still walking and the two clients had received different
    // snapshots (it failed once under load: "expected 76 to be >= 77"). A stationary hero has one position.
    await press(0, 3);
    const xs = () => [gameA.viewState(performance.now())!.players[0]!.x, gameB.viewState(performance.now())!.players[0]!.x] as const;
    let last = xs();
    let since = Date.now();
    await until("both clients to agree on a settled position of player 0", () => {
      const cur = xs();
      if (cur[0] !== last[0] || cur[1] !== last[1]) {
        last = cur;
        since = Date.now();
        return false;
      }
      return Date.now() - since >= 400 && Math.abs(cur[0] - cur[1]) <= 1;
    });
    const vb = gameB.viewState(performance.now())!;
    const va = gameA.viewState(performance.now())!;
    expect(vb.players[0]!.x).toBeGreaterThan(startX + 5);
    expect(va.round).toBe(vb.round);
    // settled, player 0's own (predicted) view and what B sees are the same place
    expect(Math.abs(va.players[0]!.x - vb.players[0]!.x)).toBeLessThanOrEqual(1);

    // drop A's socket from the client side: it reconnects and reclaims seat 0 with the stored token
    const states: string[] = [];
    a.conn.onState((s) => states.push(s));
    const tickBefore = gameB.viewState(performance.now())!.tick;
    sockets[0]!.close();
    await until("A to rejoin", () => states.includes("reconnecting") && states[states.length - 1] === "joined");
    expect(a.conn.playerId).toBe(0);
    await until("ticks to advance", () => gameB.viewState(performance.now())!.tick > tickBefore + 6);
    await until("A snapshots after rejoin", () => (a.conn.nextInputSeq() ?? 0) > 0);
  }, 120_000);
});
