import { mkdtempSync, rmSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import {
  BTN,
  GAME_LEVELS,
  P1_SPAWN_COL,
  PLAYER_SIZE,
  Sim,
  TILE,
  spawnEffect,
  spawnFloorRow,
  type GameState,
  type ServerMsg,
} from "@bubble/shared";
import { afterAll, beforeAll, describe, expect, it } from "vitest";
import WebSocket from "ws";
import { createServer } from "../src/index";
import type { RunningServer } from "../src/index";
import { PIN } from "./helpers";

type Snap = Extract<ServerMsg, { t: "snap" }>;

let dir: string;
let srv: RunningServer;

beforeAll(async () => {
  dir = mkdtempSync(join(tmpdir(), "bubble-campaign-"));
  // No `levels` override: the production default.
  srv = await createServer({ pin: PIN, port: 0, dataDir: dir, staticRoot: join(dir, "none") });
});
afterAll(async () => {
  await srv.close();
  rmSync(dir, { recursive: true, force: true });
});

const open = () =>
  new Promise<{ ws: WebSocket; msgs: ServerMsg[] }>((resolve, reject) => {
    const ws = new WebSocket(`ws://127.0.0.1:${srv.port}/ws`);
    const msgs: ServerMsg[] = [];
    ws.on("message", (d) => msgs.push(JSON.parse(d.toString()) as ServerMsg));
    ws.on("open", () => resolve({ ws, msgs }));
    ws.on("error", reject);
  });
const until = async (fn: () => boolean, ms = 4000) => {
  const end = Date.now() + ms;
  while (!fn()) {
    if (Date.now() > end) throw new Error("timeout");
    await new Promise((r) => setTimeout(r, 10));
  }
};
const sendJoin = (ws: WebSocket, room: string) => ws.send(JSON.stringify({ t: "join", room, pin: PIN, name: "Zed" }));
const firstSnap = (msgs: ServerMsg[]): Snap => msgs.find((m): m is Snap => m.t === "snap")!;

describe("server on the default (real) level set", () => {
  it("a new room starts at round 1 of the real set, enemies and spawn from GAME_LEVELS[0]", async () => {
    const { ws, msgs } = await open();
    sendJoin(ws, "CAMPAIGN");
    await until(() => msgs.some((m) => m.t === "snap"));
    const s = firstSnap(msgs).state;
    expect(msgs[0]).toMatchObject({ t: "joined", playerId: 0, round: 1 });
    expect(s.round).toBe(1);
    expect(s.enemies).toHaveLength(GAME_LEVELS[0]!.enemies.length);
    expect(GAME_LEVELS[0]!.enemies.length).toBeGreaterThan(0);
    const p = s.players[0]!;
    expect(p.x).toBe(P1_SPAWN_COL * TILE + TILE / 2);
    expect(p.y).toBeCloseTo(spawnFloorRow(GAME_LEVELS[0]!, P1_SPAWN_COL) * TILE - PLAYER_SIZE / 2, 0);
    ws.close();
  });

  it("resumes a persisted room at round 57 on the right level", async () => {
    const sim = new Sim(GAME_LEVELS, 9, 1);
    sim.loadRound(57);
    for (let i = 0; i < 10; i++) sim.step([0, 0]);
    writeFileSync(join(dir, "room-RESUME57.json"), JSON.stringify(sim.state));
    const { ws, msgs } = await open();
    sendJoin(ws, "RESUME57");
    await until(() => msgs.some((m) => m.t === "snap"));
    const s = firstSnap(msgs).state;
    expect(msgs[0]).toMatchObject({ t: "joined", round: 57 });
    expect(s.round).toBe(57);
    expect(s.enemies).toHaveLength(GAME_LEVELS[56]!.enemies.length);
    expect(s.enemies.map((e) => e.type).sort()).toEqual(GAME_LEVELS[56]!.enemies.map((e) => e.type).sort());
    ws.close();
  });
});

describe("snapshot size on the real set", () => {
  it("a busy mid-game snapshot stays small enough for 20 Hz to two clients", () => {
    const busy = GAME_LEVELS.findIndex((l) => l.enemies.length >= 12);
    const sim = new Sim(GAME_LEVELS, 3, 2);
    sim.loadRound(busy >= 0 ? busy + 1 : 50);
    for (let i = 0; i < 400; i++) sim.step([i % 20 < 10 ? BTN.F | BTN.R : BTN.F | BTN.L, BTN.F | BTN.J]);
    const s: GameState = structuredClone(sim.state);
    const pad = <T extends { id: number }>(list: T[], n: number): void => {
      const seed = list.slice();
      if (seed.length === 0) return;
      for (let i = 0; list.length < n; i++) list.push({ ...structuredClone(seed[i % seed.length]!), id: s.nextId++ });
    };
    pad(s.enemies, 12);
    pad(s.bubbles, 12);
    for (let i = 0; i < 10; i++) {
      s.items.push({ id: s.nextId++, x: 40 + i * 20, y: 200, vx: 0, vy: 0, onGround: true, kind: i % 3 === 0 ? "power" : "food", sprite: i % 8, value: 500, despawnTicks: 400, power: "boots" });
    }
    for (let i = 0; i < 8; i++) {
      s.projectiles.push({ id: s.nextId++, x: 30 + i * 25, y: 90, vx: 1.5, vy: 0, kind: i % 2 ? "rock" : "flame", ageTicks: i });
    }
    for (let i = 0; i < 6; i++) spawnEffect(s, "water", 0, 100 + i * 40, 300, 1);
    const bytes = Buffer.byteLength(JSON.stringify({ t: "snap", tick: s.tick, ackSeq: 0, state: s, events: [] }));
    const perSecond = bytes * 20 * 2;
    console.log(
      `busy snapshot: ${bytes} bytes (enemies ${s.enemies.length}, bubbles ${s.bubbles.length}, items ${s.items.length}, ` +
        `projectiles ${s.projectiles.length}, effects ${s.effects.length}); 20 Hz x 2 clients = ${(perSecond / 1024).toFixed(0)} KiB/s`,
    );
    expect(s.enemies.length).toBeLessThanOrEqual(12);
    expect(bytes).toBeLessThan(24 * 1024);
  });
});
