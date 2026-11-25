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

async function until(what: string, cond: () => boolean, timeoutMs = 4000): Promise<void> {
  const deadline = Date.now() + timeoutMs;
  while (!cond()) {
    if (Date.now() > deadline) throw new Error(`timed out waiting for ${what}`);
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

    // 20 ticks of "right" at real 16 ms pacing, through the same path main.ts uses
    let sent = 0;
    while (sent < 20) {
      const seq = a.conn.nextInputSeq();
      if (seq !== undefined) {
        a.conn.sendInput(seq, BTN.R);
        gameA.pushInput(seq, BTN.R);
        sent++;
      }
      await sleep(16);
    }

    await until("player 0 to move right on client B", () => gameB.viewState(performance.now())!.players[0]!.x > startX + 5);
    const vb = gameB.viewState(performance.now())!;
    const va = gameA.viewState(performance.now())!;
    expect(vb.players[0]!.x).toBeGreaterThan(startX + 5);
    expect(va.round).toBe(vb.round);
    // player 0's own view is predicted, so it is at least as far right as what B sees
    expect(va.players[0]!.x).toBeGreaterThanOrEqual(vb.players[0]!.x - 1);

    // drop A's socket from the client side: it reconnects and reclaims seat 0 with the stored token
    const states: string[] = [];
    a.conn.onState((s) => states.push(s));
    const tickBefore = gameB.viewState(performance.now())!.tick;
    sockets[0]!.close();
    await until("A to rejoin", () => states.includes("reconnecting") && states[states.length - 1] === "joined", 6000);
    expect(a.conn.playerId).toBe(0);
    await until("ticks to advance", () => gameB.viewState(performance.now())!.tick > tickBefore + 6);
    await until("A snapshots after rejoin", () => (a.conn.nextInputSeq() ?? 0) > 0);
  }, 20_000);
});
