import { describe, expect, it } from "vitest";
import {
  BTN,
  LEVELS,
  Sim,
  TUNING,
  type EnemyState,
  type GameState,
  type ServerMsg,
  type SimEvent,
} from "@bubble/shared";
import { ClientGame } from "../src/game";

type Snap = Extract<ServerMsg, { t: "snap" }>;

/** A settled two-player state: both players alive and standing on the floor. */
function baseState(): GameState {
  const sim = new Sim(LEVELS, 1, 2);
  for (let i = 0; i < 60; i++) sim.step([0, 0]);
  const s = structuredClone(sim.state);
  s.enemies = [];
  s.bubbles = [];
  return s;
}

const enemy = (o: Partial<EnemyState>): EnemyState => ({
  id: 900,
  type: "walker",
  x: 100,
  y: 100,
  vx: 0,
  vy: 0,
  dir: 1,
  state: "active",
  angry: false,
  spawnDelay: 0,
  onGround: true,
  ...o,
});

const snap = (tick: number, ackSeq: number, state: GameState, events: SimEvent[] = []): Snap => ({
  t: "snap",
  tick,
  ackSeq,
  state: { ...state, tick },
  events,
});

function setup(opts: { interpDelayMs?: number } = {}) {
  let now = 0;
  const game = new ClientGame({ levels: LEVELS, playerId: 0, now: () => now, ...opts });
  return {
    game,
    at(t: number) {
      now = t;
    },
  };
}

describe("ClientGame interpolation", () => {
  it("places an enemy exactly halfway between two snapshots", () => {
    const { game, at } = setup();
    const a = baseState();
    a.enemies = [enemy({ x: 100, y: 100 })];
    const b = baseState();
    b.enemies = [enemy({ x: 110, y: 120 })];
    at(0);
    game.onSnapshot(snap(3, 0, a));
    at(50);
    game.onSnapshot(snap(6, 0, b));
    const v = game.viewState(75)!; // render time 25 ms = halfway
    expect(v.enemies[0]!.x).toBe(105);
    expect(v.enemies[0]!.y).toBe(110);
  });

  it("takes non-position fields from the newer snapshot and never mutates snapshots", () => {
    const { game, at } = setup();
    const a = baseState();
    a.enemies = [enemy({ x: 100, angry: false })];
    const b = baseState();
    b.enemies = [enemy({ x: 110, angry: true })];
    b.roundTicks = 99;
    const aCopy = structuredClone(a);
    const bCopy = structuredClone(b);
    at(0);
    game.onSnapshot(snap(3, 0, a));
    at(50);
    game.onSnapshot(snap(6, 0, b));
    const v = game.viewState(75)!;
    expect(v.enemies[0]!.angry).toBe(true);
    expect(v.roundTicks).toBe(99);
    expect(a).toEqual(aCopy);
    expect(b).toEqual(bCopy);
  });

  it("does not interpolate across a wrap or respawn discontinuity", () => {
    const { game, at } = setup();
    const a = baseState();
    a.enemies = [enemy({ x: 100, y: 20 }), enemy({ id: 901, x: 10, y: 100 })];
    const b = baseState();
    b.enemies = [enemy({ x: 100, y: 200 }), enemy({ id: 901, x: 100, y: 100 })];
    at(0);
    game.onSnapshot(snap(3, 0, a));
    at(50);
    game.onSnapshot(snap(6, 0, b));
    const v = game.viewState(75)!;
    expect(v.enemies[0]!.y).toBe(200); // dy 180 > 64
    expect(v.enemies[1]!.x).toBe(100); // dx 90 > 64
  });

  it("does not interpolate a player whose state changed (respawn)", () => {
    const { game, at } = setup();
    const a = baseState();
    a.players[1]!.state = "respawning";
    a.players[1]!.x = 120;
    const b = baseState();
    b.players[1]!.state = "alive";
    b.players[1]!.x = 130;
    at(0);
    game.onSnapshot(snap(3, 0, a));
    at(50);
    game.onSnapshot(snap(6, 0, b));
    expect(game.viewState(75)!.players[1]!.x).toBe(130);
  });

  it("shows an id missing from the older snapshot at its newer position", () => {
    const { game, at } = setup();
    const a = baseState();
    const b = baseState();
    b.enemies = [enemy({ id: 77, x: 150, y: 90 })];
    at(0);
    game.onSnapshot(snap(3, 0, a));
    at(50);
    game.onSnapshot(snap(6, 0, b));
    const v = game.viewState(75)!;
    expect(v.enemies).toHaveLength(1);
    expect(v.enemies[0]!.x).toBe(150);
  });

  it("drops an id missing from the newer snapshot", () => {
    const { game, at } = setup();
    const a = baseState();
    a.enemies = [enemy({ id: 77 })];
    at(0);
    game.onSnapshot(snap(3, 0, a));
    at(50);
    game.onSnapshot(snap(6, 0, baseState()));
    expect(game.viewState(75)!.enemies).toHaveLength(0);
  });

  it("interpolates bubbles by id and the other player", () => {
    const { game, at } = setup();
    const a = baseState();
    a.bubbles = [{ id: 5, x: 50, y: 60, vx: 0, vy: 0, kind: "normal", phase: "float", ageTicks: 1, owner: 0 }];
    a.players[1]!.x = 100;
    const b = baseState();
    b.bubbles = [{ ...a.bubbles[0]!, x: 60, y: 80, ageTicks: 4 }];
    b.players[1]!.x = 110;
    at(0);
    game.onSnapshot(snap(3, 0, a));
    at(50);
    game.onSnapshot(snap(6, 0, b));
    const v = game.viewState(75)!;
    expect(v.bubbles[0]).toMatchObject({ x: 55, y: 70, ageTicks: 4 });
    expect(v.players[1]!.x).toBe(105);
  });

  it("interpolates falling items by id, and leaves items without positions (older servers) alone", () => {
    const { game, at } = setup();
    const it = (o: object) => ({ id: 70, x: 100, y: 40, vx: 0, vy: 1, onGround: false, kind: "food", sprite: 1, value: 300, despawnTicks: 100, ...o }) as GameState["items"][number];
    const a = baseState();
    a.items = [it({}), it({ id: 71, x: undefined, y: undefined })];
    const b = baseState();
    b.items = [it({ y: 60 }), it({ id: 71, x: undefined, y: undefined }), it({ id: 72, x: 5, y: 5 })];
    at(0);
    game.onSnapshot(snap(3, 0, a));
    at(50);
    game.onSnapshot(snap(6, 0, b));
    const v = game.viewState(75)!;
    expect(v.items[0]).toMatchObject({ id: 70, x: 100, y: 50 });
    expect(v.items[1]!.x).toBeUndefined();
    expect(v.items[2]).toMatchObject({ id: 72, x: 5, y: 5 });
  });

  it("clamps extrapolation to one snapshot interval and never goes before the oldest snapshot", () => {
    const { game, at } = setup();
    const a = baseState();
    a.enemies = [enemy({ x: 100 })];
    const b = baseState();
    b.enemies = [enemy({ x: 110 })];
    at(0);
    game.onSnapshot(snap(3, 0, a));
    at(50);
    game.onSnapshot(snap(6, 0, b));
    expect(game.viewState(125)!.enemies[0]!.x).toBeCloseTo(115, 6); // render 75: 1.5 intervals
    expect(game.viewState(10_000)!.enemies[0]!.x).toBeCloseTo(120, 6); // clamped at 2.0
    expect(game.viewState(0)!.enemies[0]!.x).toBe(100); // before oldest
  });

  it("returns the only snapshot as is, and null before any", () => {
    const { game } = setup();
    expect(game.viewState(0)).toBeNull();
    const a = baseState();
    game.onSnapshot(snap(3, 0, a));
    expect(game.viewState(500)!.tick).toBe(3);
  });

  it("ignores duplicate and stale snapshots", () => {
    const { game, at } = setup();
    const a = baseState();
    a.enemies = [enemy({ x: 100 })];
    const b = baseState();
    b.enemies = [enemy({ x: 110 })];
    at(0);
    game.onSnapshot(snap(6, 0, b));
    at(10);
    game.onSnapshot(snap(3, 0, a)); // late, older
    game.onSnapshot(snap(6, 0, a)); // duplicate tick
    expect(game.viewState(500)!.enemies[0]!.x).toBe(110);
  });

  it("accepts a lower tick after resync() (server restored an older save)", () => {
    const { game, at } = setup();
    at(0);
    game.onSnapshot(snap(600, 0, baseState()));
    game.resync();
    at(100);
    game.onSnapshot(snap(30, 0, baseState()));
    expect(game.viewState(500)!.tick).toBe(30);
  });

  it("resyncs when the tick drops by more than 60 without resync() being called", () => {
    const { game, at } = setup();
    const a = baseState();
    a.enemies = [enemy({ x: 100 })];
    at(0);
    game.onSnapshot(snap(600, 0, a));
    at(50);
    game.onSnapshot(snap(603, 0, a));
    game.pushInput(1, BTN.R);
    const b = baseState();
    b.enemies = [enemy({ x: 50 })];
    at(100);
    game.onSnapshot(snap(30, 0, b)); // 573 behind: server restarted from an older save
    expect(game.viewState(1000)!.tick).toBe(30);
    expect(game.pendingCount).toBe(0);
    // history was dropped, so following snapshots interpolate normally
    const c = baseState();
    c.enemies = [enemy({ x: 60 })];
    at(150);
    game.onSnapshot(snap(33, 0, c));
    expect(game.viewState(175)!.enemies[0]!.x).toBe(55);
  });

  it("still discards small backward steps (duplicates, out of order)", () => {
    const { game, at } = setup();
    at(0);
    game.onSnapshot(snap(600, 0, baseState()));
    at(10);
    game.onSnapshot(snap(540, 0, baseState())); // exactly 60 behind: not a reset
    game.onSnapshot(snap(597, 0, baseState()));
    expect(game.viewState(500)!.tick).toBe(600);
  });

  it("resync() drops pending inputs that were never delivered", () => {
    const { game } = setup();
    const s = baseState();
    const x0 = s.players[0]!.x;
    for (let i = 1; i <= 5; i++) game.pushInput(i, BTN.R);
    game.resync();
    expect(game.pendingCount).toBe(0);
    game.onSnapshot(snap(3, 0, s));
    expect(game.viewState(0)!.players[0]!.x).toBe(x0);
    game.pushInput(6, BTN.R);
    expect(game.viewState(0)!.players[0]!.x).toBeCloseTo(x0 + 1, 9);
  });

  it("uses the same level array and keeps a stable result shape for unknown rounds", () => {
    const { game } = setup();
    const s = baseState();
    s.round = 99;
    game.onSnapshot(snap(3, 0, s));
    game.pushInput(1, BTN.R);
    expect(() => game.viewState(100)).not.toThrow();
  });
});

describe("ClientGame prediction", () => {
  it("applies 3 pending inputs on top of the snapshot: exactly 3 ticks of walkSpeed ahead", () => {
    const { game } = setup();
    const s = baseState();
    expect(s.players[0]!.state).toBe("alive");
    const x0 = s.players[0]!.x;
    game.pushInput(1, BTN.R);
    game.pushInput(2, BTN.R);
    game.pushInput(3, BTN.R);
    game.onSnapshot(snap(3, 0, s));
    const v = game.viewState(100)!;
    expect(v.players[0]!.x).toBeCloseTo(x0 + 3 * TUNING.walkSpeed, 9);
    expect(v.players[0]!.facing).toBe(1);
    // the snapshot's own player was not mutated
    expect(s.players[0]!.x).toBe(x0);
  });

  it("keeps stepping as inputs are pushed between snapshots", () => {
    const { game } = setup();
    const s = baseState();
    const x0 = s.players[0]!.x;
    game.onSnapshot(snap(3, 0, s));
    for (let i = 1; i <= 5; i++) game.pushInput(i, BTN.R);
    expect(game.viewState(0)!.players[0]!.x).toBeCloseTo(x0 + 5 * TUNING.walkSpeed, 9);
  });

  it("drops inputs with seq <= ackSeq and replays only the rest, with no double application", () => {
    const { game } = setup();
    const s = baseState();
    const x0 = s.players[0]!.x;
    for (let i = 1; i <= 5; i++) game.pushInput(i, BTN.R);
    // the server already applied 1 and 2: its state is 2 ticks ahead
    const auth = baseState();
    auth.players[0]!.x = x0 + 2 * TUNING.walkSpeed;
    game.onSnapshot(snap(6, 2, auth));
    expect(game.pendingCount).toBe(3);
    expect(game.viewState(0)!.players[0]!.x).toBeCloseTo(x0 + 5 * TUNING.walkSpeed, 9);
    // everything acked -> exactly the authoritative position
    game.onSnapshot(snap(9, 5, { ...auth, players: auth.players.map((p) => ({ ...p, x: x0 + 5 })) }));
    expect(game.pendingCount).toBe(0);
    expect(game.viewState(0)!.players[0]!.x).toBeCloseTo(x0 + 5, 9);
  });

  it("ignores pushInput with a non-increasing seq", () => {
    const { game } = setup();
    const s = baseState();
    const x0 = s.players[0]!.x;
    game.onSnapshot(snap(3, 0, s));
    game.pushInput(1, BTN.R);
    game.pushInput(1, BTN.R);
    game.pushInput(0, BTN.R);
    expect(game.pendingCount).toBe(1);
    expect(game.viewState(0)!.players[0]!.x).toBeCloseTo(x0 + 1, 9);
  });

  it("predicted fire does not add phantom bubbles to the view", () => {
    const { game } = setup();
    const s = baseState();
    game.onSnapshot(snap(3, 0, s));
    game.pushInput(1, BTN.F);
    game.pushInput(2, BTN.F | BTN.R);
    const v = game.viewState(0)!;
    expect(v.bubbles).toHaveLength(0);
    expect(s.bubbles).toHaveLength(0);
    expect(s.nextId).toBe(baseState().nextId);
  });

  it("does not predict a player who is not alive", () => {
    const { game } = setup();
    const s = baseState();
    s.players[0]!.state = "dying";
    const x0 = s.players[0]!.x;
    game.onSnapshot(snap(3, 0, s));
    game.pushInput(1, BTN.R);
    game.pushInput(2, BTN.R);
    expect(game.viewState(0)!.players[0]!.x).toBe(x0);
  });

  it("does not predict outside the round phase", () => {
    const { game } = setup();
    const s = baseState();
    s.phase = "clearing";
    const x0 = s.players[0]!.x;
    game.onSnapshot(snap(3, 0, s));
    game.pushInput(1, BTN.R);
    expect(game.viewState(0)!.players[0]!.x).toBe(x0);
  });

  it("eases a small (5 px) misprediction instead of jumping", () => {
    const { game } = setup();
    const s = baseState();
    const x0 = s.players[0]!.x;
    game.pushInput(1, BTN.R);
    game.pushInput(2, BTN.R);
    game.pushInput(3, BTN.R);
    game.onSnapshot(snap(3, 0, s));
    expect(game.viewState(1000)!.players[0]!.x).toBeCloseTo(x0 + 3, 9);
    // server disagrees: acks all three but ends 5 px further right than predicted
    const auth = baseState();
    auth.players[0]!.x = x0 + 3 + 5;
    game.onSnapshot(snap(6, 3, auth));
    const target = x0 + 8;
    const first = game.viewState(1000)!.players[0]!.x; // same instant: no visible jump
    expect(first).toBeCloseTo(x0 + 3, 6);
    const mid = game.viewState(1050)!.players[0]!.x;
    expect(mid).toBeGreaterThan(first);
    expect(mid).toBeLessThan(target);
    const later = game.viewState(1600)!.players[0]!.x;
    expect(Math.abs(later - target)).toBeLessThan(0.5);
    expect(game.viewState(5000)!.players[0]!.x).toBeCloseTo(target, 9);
  });

  it("snaps instantly when the error exceeds 24 px", () => {
    const { game } = setup();
    const s = baseState();
    const x0 = s.players[0]!.x;
    game.pushInput(1, BTN.R);
    game.onSnapshot(snap(3, 0, s));
    game.viewState(1000);
    const auth = baseState();
    auth.players[0]!.x = x0 + 1 + 40;
    game.onSnapshot(snap(6, 1, auth));
    expect(game.viewState(1000)!.players[0]!.x).toBeCloseTo(x0 + 41, 9);
  });

  it("treats an error of 2 px or less as noise and snaps to the authoritative result", () => {
    const { game } = setup();
    const s = baseState();
    const x0 = s.players[0]!.x;
    game.pushInput(1, BTN.R);
    game.onSnapshot(snap(3, 0, s));
    game.viewState(1000);
    const auth = baseState();
    auth.players[0]!.x = x0 + 1 + 1.5;
    game.onSnapshot(snap(6, 1, auth));
    expect(game.viewState(1000)!.players[0]!.x).toBeCloseTo(x0 + 2.5, 9);
  });

  it("bounds the pending-input buffer", () => {
    const { game } = setup();
    game.onSnapshot(snap(3, 0, baseState()));
    for (let i = 1; i <= 500; i++) game.pushInput(i, 0);
    expect(game.pendingCount).toBeLessThanOrEqual(120);
    expect(game.pendingCount).toBeGreaterThan(0);
  });

  it("exposes the local player id", () => {
    expect(setup().game.localPlayer).toBe(0);
  });
});

describe("ClientGame events", () => {
  it("delivers each event exactly once and in order", () => {
    const { game } = setup();
    const got: SimEvent[] = [];
    game.onEvents((e) => got.push(...e));
    const a: SimEvent[] = [{ kind: "jump", player: 0 }, { kind: "fire", player: 1 }];
    const b: SimEvent[] = [{ kind: "pop" }];
    game.onSnapshot(snap(3, 0, baseState(), a));
    game.onSnapshot(snap(6, 0, baseState(), b));
    game.onSnapshot(snap(6, 0, baseState(), b)); // duplicate
    game.onSnapshot(snap(3, 0, baseState(), a)); // stale
    expect(got).toEqual([...a, ...b]);
  });

  it("does not call listeners for empty event lists", () => {
    const { game } = setup();
    let calls = 0;
    game.onEvents(() => calls++);
    game.onSnapshot(snap(3, 0, baseState()));
    expect(calls).toBe(0);
  });
});
