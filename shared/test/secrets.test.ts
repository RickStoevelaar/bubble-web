import { readdirSync, readFileSync } from "node:fs";
import { join } from "node:path";
import { describe, expect, it } from "vitest";
import {
  BTN,
  FIELD_H,
  FIELD_W,
  GRID_H,
  GRID_W,
  PLAYER_SIZE,
  SECRET_CODE_FRAGMENTS,
  SECRET_ROOMS,
  Sim,
  TEST_LEVEL,
  MARGIN_JUMP,
  TILE,
  TREASURE_VALUES,
  TUNING,
  analyseStands,
  isSolid,
  jumpApex,
  levelForState,
  moveBody,
  startsOfTiles,
  validateLevel,
  type GameState,
  type LevelData,
  type SimEvent,
} from "../src";
import { killPlayer } from "../src/sim/combat";

const mkLevels = (n: number): LevelData[] => Array.from({ length: n }, (_, i) => ({ ...TEST_LEVEL, round: i + 1, enemies: [] }));
const run = (sim: Sim, n: number, b: [number, number] = [0, 0]): SimEvent[] => {
  const ev: SimEvent[] = [];
  for (let i = 0; i < n; i++) ev.push(...sim.step(b));
  return ev;
};
const names = ["PIP", "POP", "WEB"] as const;
const DOOR_X = 13 * TILE + TILE / 2;
const DOOR_Y = 26 * TILE - TUNING.itemSize / 2;

/** Jumps to round r with no enemies, then ends the round through the real clearing path. */
function clearRound(sim: Sim, r: number): SimEvent[] {
  sim.loadRound(r);
  sim.state.enemiesSeen = true;
  sim.state.enemies = [];
  return sim.step([0, 0]);
}
const doors = (s: GameState) => s.items.filter((i) => i.kind === "door");
const treasure = (s: GameState) => s.items.filter((i) => i.kind === "treasure");

/** A sim whose round `r` was just cleared and whose player 0 stands on the door. */
function enterRoom(levels: LevelData[], r = 20): Sim {
  const sim = new Sim(levels, 5, 2);
  clearRound(sim, r);
  const d = doors(sim.state)[0]!;
  sim.state.players[0]!.x = d.x;
  sim.state.players[0]!.y = d.y;
  sim.step([0, 0]);
  return sim;
}

describe("secret room definitions", () => {
  it("exports three rooms spelling PIP, POP and WEB that validate", () => {
    expect(SECRET_ROOMS.map((r) => r.word)).toEqual(["PIP", "POP", "WEB"]);
    for (const r of SECRET_ROOMS) {
      expect(validateLevel(r.level)).toEqual([]);
      expect(r.level.tiles).toHaveLength(GRID_H);
      expect(r.level.enemies).toEqual([]);
      expect(r.level.drift).toEqual([]);
      expect(r.level.round).toBe(0);
    }
  });

  it("has a full solid floor, solid border columns, distinct themes and fragments", () => {
    for (const r of SECRET_ROOMS) {
      expect(r.level.tiles[GRID_H - 1]).toBe("#".repeat(GRID_W));
      expect(r.level.tiles[GRID_H - 2]).toBe("#".repeat(GRID_W));
      for (const row of r.level.tiles) {
        expect(row.slice(0, 2)).toBe("##");
        expect(row.slice(-2)).toBe("##");
      }
    }
    expect(new Set(SECRET_ROOMS.map((r) => r.level.theme)).size).toBe(3);
    expect(new Set(SECRET_ROOMS.map((r) => r.fragment)).size).toBe(3);
    for (const [i, r] of SECRET_ROOMS.entries()) {
      expect(r.fragment).toMatch(/^[A-Z0-9]{2}$/);
      expect(SECRET_CODE_FRAGMENTS[i]).toBe(r.fragment);
    }
  });

  it("spawn points are empty tiles standing on solid ground", () => {
    for (const r of SECRET_ROOMS) {
      for (const s of r.spawn) {
        expect(isSolid(r.level, s.col, s.row)).toBe(false);
        expect(isSolid(r.level, s.col, s.row - 1)).toBe(false);
        expect(isSolid(r.level, s.col, s.row + 1)).toBe(true);
        // the 14 px body centered on the tile fits without touching a solid tile
        const x0 = s.col * TILE + TILE / 2 - PLAYER_SIZE / 2;
        const x1 = s.col * TILE + TILE / 2 + PLAYER_SIZE / 2 - 0.001;
        for (let tx = Math.floor(x0 / TILE); tx <= Math.floor(x1 / TILE); tx++) {
          expect(isSolid(r.level, tx, s.row)).toBe(false);
          expect(isSolid(r.level, tx, s.row - 1)).toBe(false);
        }
      }
    }
  });

  it("the letters are really there: sane stroke counts, three different layouts", () => {
    const interior = (lv: LevelData) =>
      lv.tiles
        .slice(1, GRID_H - 2)
        .map((row) => row.slice(2, GRID_W - 2))
        .join("\n");
    const counts = SECRET_ROOMS.map((r) => interior(r.level).split("#").length - 1);
    for (const c of counts) {
      expect(c).toBeGreaterThan(80);
      expect(c).toBeLessThan(260);
    }
    expect(new Set(SECRET_ROOMS.map((r) => interior(r.level))).size).toBe(3);
    // each room has strokes at least 8 rows tall in the middle region
    for (const r of SECRET_ROOMS) {
      const rowsWithStroke = r.level.tiles.slice(2, GRID_H - 2).filter((row) => row.slice(2, GRID_W - 2).includes("#")).length;
      expect(rowsWithStroke).toBeGreaterThanOrEqual(8);
    }
  });

  it("levelForState returns the secret layout only when secret is set", () => {
    const levels = mkLevels(3);
    expect(levelForState(levels, { round: 2, secret: null })).toBe(levels[1]);
    expect(levelForState(levels, { round: 99, secret: null })).toBe(levels[0]);
    const secret = { index: 2 as const, returnRound: 2, ticksLeft: 5, leaveTicks: 0 };
    expect(levelForState(levels, { round: 2, secret })).toBe(SECRET_ROOMS[2].level);
  });
});

describe("the door", () => {
  it("round 20 with every player deathless spawns exactly one door, drawing no rng", () => {
    const sim = new Sim(mkLevels(45), 5, 2);
    sim.loadRound(20);
    sim.state.enemiesSeen = true;
    const rngBefore = sim.state.rngState;
    const ev = sim.step([0, 0]);
    expect(ev.some((e) => e.kind === "clear")).toBe(true);
    expect(sim.state.phase).toBe("clearing");
    const d = doors(sim.state);
    expect(d).toHaveLength(1);
    expect(d[0]).toMatchObject({ kind: "door", sprite: 0, value: 0, onGround: true, x: DOOR_X, y: DOOR_Y });
    expect(sim.state.rngState).toBe(rngBefore);
    expect(d[0]!.despawnTicks).toBeGreaterThan(TUNING.secretDoorClearTicks);
  });

  it("the door rests where it was spawned and survives the whole window", () => {
    const sim = new Sim(mkLevels(45), 5, 2);
    clearRound(sim, 20);
    run(sim, TUNING.secretDoorClearTicks - 2);
    expect(sim.state.phase).toBe("clearing");
    expect(doors(sim.state)).toHaveLength(1);
    expect(doors(sim.state)[0]!.y).toBe(DOOR_Y);
  });

  it("rounds 30 and 40 pick rooms 1 and 2; 19 and 21 spawn none", () => {
    for (const [r, idx] of [[30, 1], [40, 2], [20, 0]] as const) {
      const sim = enterRoom(mkLevels(45), r);
      expect(sim.state.secret?.index).toBe(idx);
      expect(sim.state.secret?.returnRound).toBe(r);
    }
    for (const r of [19, 21, 1, 29]) {
      const sim = new Sim(mkLevels(45), 5, 1);
      clearRound(sim, r);
      expect(doors(sim.state)).toHaveLength(0);
    }
  });

  it("a player who died in round 11..19 blocks the door; round 10 does not; gone players do not", () => {
    const blocked = new Sim(mkLevels(45), 5, 2);
    blocked.state.round = 15;
    killPlayer(blocked.state.players[1]!, [], 15);
    expect(blocked.state.players[1]!.deathlessSince).toBe(15);
    clearRound(blocked, 20);
    expect(doors(blocked.state)).toHaveLength(0);

    const edge = new Sim(mkLevels(45), 5, 2);
    edge.state.players[1]!.deathlessSince = 10;
    clearRound(edge, 20);
    expect(doors(edge.state)).toHaveLength(1);

    const gone = new Sim(mkLevels(45), 5, 2);
    gone.state.players[1]!.deathlessSince = 15;
    gone.state.players[1]!.state = "gone";
    clearRound(gone, 20);
    expect(doors(gone.state)).toHaveLength(1);
  });

  it("a real death path (enemy contact) records the round", () => {
    const sim = new Sim(mkLevels(45), 5, 1);
    sim.loadRound(14);
    const p = sim.state.players[0]!;
    sim.state.enemies = [
      { id: 900, type: "walker", x: p.x, y: p.y, vx: 0, vy: 0, dir: 1, state: "active", angry: false, spawnDelay: 0, onGround: true },
    ];
    p.invulnTicks = 0;
    sim.step([0, 0]);
    expect(p.state).toBe("dying");
    expect(p.deathlessSince).toBe(14);
    // not reset by loading another round
    sim.loadRound(15);
    expect(p.deathlessSince).toBe(14);
  });

  it("continueRun resets deathlessSince to the current round", () => {
    const sim = new Sim(mkLevels(45), 5, 2);
    sim.loadRound(25);
    for (const p of sim.state.players) p.state = "gone";
    sim.step([0, 0]);
    expect(sim.state.phase).toBe("gameover");
    sim.continueRun();
    expect(sim.state.players.map((p) => p.deathlessSince)).toEqual([25, 25]);
  });

  it("clearing lasts secretDoorClearTicks with a door and clearTicks without", () => {
    const withDoor = new Sim(mkLevels(45), 5, 1);
    clearRound(withDoor, 20);
    run(withDoor, TUNING.secretDoorClearTicks - 2);
    expect(withDoor.state.round).toBe(20);
    run(withDoor, 2);
    expect(withDoor.state.round).toBe(21);
    expect(withDoor.state.phase).toBe("round");
    expect(doors(withDoor.state)).toHaveLength(0);

    const plain = new Sim(mkLevels(45), 5, 1);
    clearRound(plain, 21);
    run(plain, TUNING.clearTicks - 2);
    expect(plain.state.round).toBe(21);
    run(plain, 2);
    expect(plain.state.round).toBe(22);
  });

  it("a parasol skip past round 20 spawns no door", () => {
    const sim = new Sim(mkLevels(45), 5, 1);
    sim.loadRound(19);
    sim.state.pendingRound = 22;
    sim.step([0, 0]);
    expect(sim.state.round).toBe(22);
    expect(doors(sim.state)).toHaveLength(0);
    run(sim, 5);
    expect(doors(sim.state)).toHaveLength(0);
  });
});

describe("entering and the room", () => {
  it("warps everyone to the spawn points, switches layout and clears the field", () => {
    const sim = new Sim(mkLevels(45), 5, 2);
    clearRound(sim, 20);
    sim.state.bubbles.push({ id: 700, x: 50, y: 50, vx: 0, vy: 0, kind: "normal", phase: "float", ageTicks: 0, owner: 0 });
    sim.state.projectiles.push({ id: 701, x: 60, y: 60, vx: 0, vy: 0, kind: "rock", ageTicks: 0 });
    sim.state.pendingRound = 30;
    const d = doors(sim.state)[0]!;
    sim.state.players[0]!.x = d.x;
    sim.state.players[0]!.y = d.y;
    sim.step([0, 0]);
    const room = SECRET_ROOMS[0];
    expect(sim.state.secret).toEqual({ index: 0, returnRound: 20, ticksLeft: TUNING.secretRoomTicks - 1, leaveTicks: 0 });
    expect(sim.currentLevel).toBe(room.level);
    expect(sim.state.phase).toBe("round");
    expect(sim.state.enemiesSeen).toBe(false);
    expect(sim.state.pendingRound).toBe(0);
    expect(sim.state.enemies).toEqual([]);
    expect(sim.state.bubbles).toEqual([]);
    expect(sim.state.projectiles).toEqual([]);
    expect(sim.state.effects).toEqual([]);
    expect(doors(sim.state)).toHaveLength(0);
    expect(sim.state.items.length).toBe(TUNING.secretTreasureCount);
    expect(TUNING.secretTreasureCount).toBeGreaterThanOrEqual(36);
    sim.state.players.forEach((p, i) => {
      expect(p.x).toBe(room.spawn[i]!.col * TILE + TILE / 2);
      expect(p.y).toBe(room.spawn[i]!.row * TILE + 1);
      expect(p.vx).toBe(0);
    });
    for (const t of treasure(sim.state)) {
      expect(t.value).toBe(TREASURE_VALUES[t.sprite]);
      expect(t.despawnTicks).toBeGreaterThan(TUNING.secretRoomTicks + TUNING.secretLeaveDelayTicks - 5);
    }
    expect(new Set(treasure(sim.state).map((t) => t.sprite)).size).toBe(8);
  });

  it("TREASURE_VALUES are eight escalating values", () => {
    expect(TREASURE_VALUES).toHaveLength(8);
    for (let i = 1; i < 8; i++) expect(TREASURE_VALUES[i]!).toBeGreaterThan(TREASURE_VALUES[i - 1]!);
  });

  it("a dead (non-alive) player cannot enter, but all present players are warped", () => {
    const sim = new Sim(mkLevels(45), 5, 2);
    clearRound(sim, 20);
    const d = doors(sim.state)[0]!;
    sim.state.players[0]!.state = "dying";
    sim.state.players[0]!.stateTicks = 1000;
    sim.state.players[1]!.x = d.x;
    sim.state.players[1]!.y = d.y;
    sim.step([0, 0]);
    expect(sim.state.secret).not.toBeNull();
    expect(sim.state.players[0]!.x).toBe(SECRET_ROOMS[0].spawn[0]!.col * TILE + TILE / 2);
  });

  it("treasure settles inside the field, never in a solid tile", () => {
    for (let i = 0; i < 3; i++) {
      const sim = enterRoom(mkLevels(45), [20, 30, 40][i]!);
      run(sim, 300);
      const lv = SECRET_ROOMS[i]!.level;
      expect(treasure(sim.state).length).toBeGreaterThan(0);
      for (const t of treasure(sim.state)) {
        expect(t.onGround).toBe(true);
        expect(t.x).toBeGreaterThan(2 * TILE);
        expect(t.x).toBeLessThan(FIELD_W - 2 * TILE);
        expect(t.y).toBeGreaterThan(0);
        expect(t.y).toBeLessThan(FIELD_H);
        const h = TUNING.itemSize / 2 - 0.01;
        for (const [dx, dy] of [[-h, -h], [h, -h], [-h, h - 0.5], [h, h - 0.5]] as const) {
          expect(isSolid(lv, Math.floor((t.x + dx) / TILE), Math.floor((t.y + dy) / TILE)), `${i} ${t.x},${t.y}`).toBe(false);
        }
      }
    }
  });

  it("collecting treasure adds exactly its table value and emits collect", () => {
    const sim = enterRoom(mkLevels(45));
    run(sim, 300);
    const p = sim.state.players[0]!;
    const all = treasure(sim.state);
    for (const k of [0, 3, 7]) {
      const t = all.find((x) => x.sprite === k)!;
      sim.state.items = [t];
      const before = p.score;
      p.x = t.x;
      p.y = t.y - 1;
      const ev = sim.step([0, 0]);
      expect(p.score - before).toBe(TREASURE_VALUES[k]);
      expect(ev.some((e) => e.kind === "collect" && e.player === 0)).toBe(true);
    }
  });

  it("treasure can award an extra life through addScore", () => {
    const sim = enterRoom(mkLevels(45));
    run(sim, 300);
    const p = sim.state.players[0]!;
    p.score = TUNING.firstExtraLifeScore - 1;
    const lives = p.lives;
    const t = treasure(sim.state)[0]!;
    p.x = t.x;
    p.y = t.y - 1;
    const ev = sim.step([0, 0]);
    expect(p.lives).toBe(lives + 1);
    expect(ev.some((e) => e.kind === "oneup")).toBe(true);
  });

  it("room rules: no spawns, specialTimer frozen, no clear, no hurry, ticks count down", () => {
    const sim = enterRoom(mkLevels(45));
    const timer = sim.state.specialTimer;
    const rng = sim.state.rngState;
    for (const p of sim.state.players) {
      p.counters.bubbles = 100000;
      p.counters.jumps = 100000;
    }
    const ev = run(sim, 600);
    expect(sim.state.specialTimer).toBe(timer);
    expect(sim.state.enemies).toEqual([]);
    expect(sim.state.items.some((i) => i.kind === "power" || i.kind === "food")).toBe(false);
    expect(sim.state.bubbles.some((b) => b.kind !== "normal")).toBe(false);
    expect(ev.some((e) => e.kind === "clear" || e.kind === "hurry")).toBe(false);
    expect(sim.state.hurryActive).toBe(false);
    expect(sim.state.secret!.ticksLeft).toBe(TUNING.secretRoomTicks - 601);
    expect(sim.state.rngState).toBe(rng);
    expect(sim.state.phase).toBe("round");
  });

  it("players can still move and blow harmless bubbles in the room", () => {
    const sim = enterRoom(mkLevels(45));
    const x = sim.state.players[1]!.x;
    sim.state.players[1]!.y = 60; // open air: a bubble blown on the floor would hit a letter
    run(sim, 10, [0, BTN.F | BTN.L]);
    expect(sim.state.bubbles.length).toBeGreaterThan(0);
    expect(sim.state.players[1]!.x).toBeLessThan(x);
  });

  it("ticksLeft expiry returns to the next round via loadRound with progress kept", () => {
    const sim = enterRoom(mkLevels(45), 30);
    const p = sim.state.players[0]!;
    p.score = 12345;
    p.lives = 4;
    p.powers.speed = true;
    p.letters[2] = true;
    sim.state.secret!.ticksLeft = 3;
    const ev = run(sim, 3);
    expect(ev.filter((e) => e.kind === "clear")).toHaveLength(1);
    expect(sim.state.secret).toBeNull();
    expect(sim.state.round).toBe(31);
    expect(sim.currentLevel).toBe(sim.levels[30]);
    expect(sim.state.phase).toBe("round");
    expect(sim.state.items).toEqual([]);
    expect(p.score).toBe(12345);
    expect(p.lives).toBe(4);
    expect(p.powers.speed).toBe(true);
    expect(p.letters[2]).toBe(true);
    expect(p.y).toBeLessThan(FIELD_H);
  });

  it("collecting everything returns after secretLeaveDelayTicks", () => {
    const sim = enterRoom(mkLevels(45));
    sim.state.items = [];
    // one tick for the item-free check, then the leave delay counts in leaveTicks
    run(sim, 10);
    expect(sim.state.secret!.leaveTicks).toBe(10);
    expect(sim.state.round).toBe(20);
    run(sim, TUNING.secretLeaveDelayTicks - 11);
    expect(sim.state.secret).not.toBeNull();
    run(sim, 1);
    expect(sim.state.secret).toBeNull();
    expect(sim.state.round).toBe(21);
  });

  it("returning after the last level ends the run without crashing", () => {
    const sim = enterRoom(mkLevels(20), 20);
    expect(sim.state.secret).not.toBeNull();
    sim.state.secret!.ticksLeft = 1;
    const ev = run(sim, 1);
    expect(ev.some((e) => e.kind === "clear")).toBe(true);
    expect(sim.state.secret).toBeNull();
    expect(sim.state.phase).toBe("ending");
    expect(sim.state.runOver).toBe(true);
    expect(sim.state.round).toBe(20);
    expect(() => run(sim, 10)).not.toThrow();
  });

  it("loadRound and continueRun leave the room", () => {
    const a = enterRoom(mkLevels(45));
    a.loadRound(5);
    expect(a.state.secret).toBeNull();
    expect(a.currentLevel).toBe(a.levels[4]);

    const b = enterRoom(mkLevels(45));
    for (const p of b.state.players) p.state = "gone";
    b.state.phase = "gameover";
    b.continueRun();
    expect(b.state.secret).toBeNull();
    expect(b.currentLevel).toBe(b.levels[19]);
  });

  it("pendingRound inside the room is ignored", () => {
    const sim = enterRoom(mkLevels(45));
    sim.state.pendingRound = 35;
    sim.step([0, 0]);
    expect(sim.state.pendingRound).toBe(0);
    expect(sim.state.secret).not.toBeNull();
    expect(sim.state.round).toBe(20);
  });

  it("addPlayer mid-room places the new player at a spawn point", () => {
    const sim = new Sim(mkLevels(45), 5, 1);
    clearRound(sim, 20);
    const d = doors(sim.state)[0]!;
    sim.state.players[0]!.x = d.x;
    sim.state.players[0]!.y = d.y;
    sim.step([0, 0]);
    expect(sim.state.secret).not.toBeNull();
    sim.addPlayer();
    const p = sim.state.players[1]!;
    const s = SECRET_ROOMS[0].spawn[1]!;
    expect(p.x).toBe(s.col * TILE + TILE / 2);
    expect(p.y).toBe(s.row * TILE + 1);
    expect(p.deathlessSince).toBe(1);
  });
});

describe("restore", () => {
  const compare = (a: Sim, levels: LevelData[], ticks: number): void => {
    const b = Sim.restore(levels, JSON.parse(JSON.stringify(a.state)) as GameState);
    expect(JSON.stringify(b.state)).toBe(JSON.stringify(a.state));
    for (let i = 0; i < ticks; i++) {
      const inp: [number, number] = [[BTN.R, BTN.L | BTN.J, BTN.J | BTN.F, 0][(i >> 4) & 3]!, [BTN.L, BTN.R | BTN.J, 0, BTN.F][(i >> 5) & 3]!];
      const ea = a.step(inp);
      const eb = b.step(inp);
      expect(JSON.stringify(eb)).toBe(JSON.stringify(ea));
      expect(JSON.stringify(b.state)).toBe(JSON.stringify(a.state));
    }
  };

  it("a door in the clearing phase restores identically for 300 ticks", () => {
    const levels = mkLevels(45);
    const sim = new Sim(levels, 5, 2);
    clearRound(sim, 20);
    run(sim, 40);
    expect(doors(sim.state)).toHaveLength(1);
    compare(sim, levels, 300);
  });

  it("inside the room with treasure on the floor and a partly elapsed timer restores identically", () => {
    const levels = mkLevels(45);
    const sim = enterRoom(levels, 30);
    run(sim, 150, [BTN.R | BTN.J, BTN.L]);
    expect(sim.state.secret!.ticksLeft).toBeLessThan(TUNING.secretRoomTicks - 100);
    compare(sim, levels, 300);
  });

  it("the room end (return to the next round) restores identically too", () => {
    const levels = mkLevels(45);
    const sim = enterRoom(levels);
    sim.state.secret!.ticksLeft = 100;
    run(sim, 20);
    compare(sim, levels, 300);
  });

  it("restoring inside a secret room keeps the secret layout", () => {
    const levels = mkLevels(45);
    const sim = enterRoom(levels, 40);
    const r = Sim.restore(levels, JSON.parse(JSON.stringify(sim.state)) as GameState);
    expect(r.currentLevel).toBe(SECRET_ROOMS[2].level);
  });

  it("older saves get secret null and deathlessSince 1", () => {
    const sim = new Sim(mkLevels(3), 5, 2);
    const old = JSON.parse(JSON.stringify(sim.state)) as Record<string, unknown>;
    delete old.secret;
    for (const p of old.players as Record<string, unknown>[]) delete p.deathlessSince;
    const r = Sim.restore(mkLevels(3), old as unknown as GameState);
    expect(r.state.secret).toBeNull();
    expect(r.state.players.map((p) => p.deathlessSince)).toEqual([1, 1]);
    expect(() => run(r, 5)).not.toThrow();
  });

  it("a corrupt secret.index resets secret to null (and the normal layout)", () => {
    const levels = mkLevels(45);
    const sim = enterRoom(levels);
    for (const bad of [3, -1, 1.5, "x", null] as unknown[]) {
      const st = JSON.parse(JSON.stringify(sim.state)) as GameState;
      (st.secret as unknown as Record<string, unknown>).index = bad;
      const r = Sim.restore(levels, st);
      expect(r.state.secret).toBeNull();
      expect(r.currentLevel).toBe(levels[19]);
    }
    const st2 = JSON.parse(JSON.stringify(sim.state)) as Record<string, unknown>;
    st2.secret = "oops";
    expect(Sim.restore(levels, st2 as unknown as GameState).state.secret).toBeNull();
  });

  it("repairs damaged secret counters", () => {
    const levels = mkLevels(45);
    const sim = enterRoom(levels);
    const st = JSON.parse(JSON.stringify(sim.state)) as GameState;
    (st.secret as unknown as Record<string, unknown>).ticksLeft = "bad";
    (st.secret as unknown as Record<string, unknown>).leaveTicks = -4;
    const r = Sim.restore(levels, st);
    expect(r.state.secret).toEqual({ index: 0, returnRound: 20, ticksLeft: 0, leaveTicks: 0 });
  });
});

const startsOf = (room: (typeof SECRET_ROOMS)[number]) => startsOfTiles(room.spawn);

describe("reachability", () => {
  it("the margin jump really is at least 4 px lower than the real jump", () => {
    expect(jumpApex(TUNING.jumpVel) - jumpApex(MARGIN_JUMP)).toBeGreaterThanOrEqual(4);
  });

  for (const [i, name] of names.entries()) {
    it(`room ${name}: the standing graph is strongly connected and every treasure is collectable`, () => {
      const room = SECRET_ROOMS[i]!;
      const lv = room.level;
      const g = analyseStands(lv, startsOf(room), MARGIN_JUMP);
      expect(g.trapped.slice(0, 10)).toEqual([]);
      expect(g.maxRise).toBeLessThanOrEqual(jumpApex(TUNING.jumpVel) - 4);
      const stands = [...g.component].map((k) => g.nodes.get(k)!);

      // Treasure that has come to rest sits near a standing position of the component.
      const sim = enterRoom(mkLevels(45), [20, 30, 40][i]!);
      run(sim, 300);
      const reach = (TUNING.itemSize + PLAYER_SIZE) / 2;
      const stranded = treasure(sim.state).filter(
        (t) => !stands.some((s) => Math.abs(s.x - t.x) < reach && Math.abs(s.y - t.y) < reach),
      );
      expect(stranded.map((t) => `${t.x},${t.y}`)).toEqual([]);

      // Every standing run (2+ adjacent tile tops with 2 empty rows above) outside sealed pockets is in the component.
      // "Open" = covered by a 2x2 empty block reachable from the top-left through 2x2 blocks (slits and sealed pockets are not).
      const fat = (x: number, y: number): boolean =>
        x >= 2 && x + 1 < GRID_W - 2 && y >= 0 && y + 1 < GRID_H && !isSolid(lv, x, y) && !isSolid(lv, x + 1, y) && !isSolid(lv, x, y + 1) && !isSolid(lv, x + 1, y + 1);
      const seen = new Set<string>();
      const open = new Set<string>();
      const stack: [number, number][] = [[2, 1]];
      while (stack.length > 0) {
        const [x, y] = stack.pop()!;
        if (!fat(x, y) || seen.has(`${x},${y}`)) continue;
        seen.add(`${x},${y}`);
        for (const [cx, cy] of [[x, y], [x + 1, y], [x, y + 1], [x + 1, y + 1]] as const) open.add(`${cx},${cy}`);
        stack.push([x + 1, y], [x - 1, y], [x, y + 1], [x, y - 1]);
      }
      const standable = (tx: number, ty: number): boolean =>
        isSolid(lv, tx, ty) && open.has(`${tx},${ty - 1}`) && open.has(`${tx},${ty - 2}`);
      const missed: string[] = [];
      for (let ty = 2; ty < GRID_H; ty++) {
        for (let tx = 2; tx < GRID_W - 2; tx++) {
          if (!standable(tx, ty) || !(standable(tx + 1, ty) || standable(tx - 1, ty))) continue;
          const standY = ty * TILE - PLAYER_SIZE / 2;
          const ok = stands.some((s) => s.y === standY && s.x > tx * TILE - PLAYER_SIZE / 2 && s.x < (tx + 1) * TILE + PLAYER_SIZE / 2);
          if (!ok) missed.push(`${tx},${ty}`);
        }
      }
      expect(missed).toEqual([]);
    }, 120000);
  }
});

describe("reachability checker sanity", () => {
  it("reaches a letter top but not a platform floating far above everything", () => {
    const room = SECRET_ROOMS[0];
    const tiles = room.level.tiles.map((r, y) => (y === 6 ? r.slice(0, 14) + "####" + r.slice(18) : r));
    const g = analyseStands({ ...room.level, tiles }, startsOf(room), MARGIN_JUMP);
    const ys = [...g.nodes.values()].map((p) => p.y);
    expect(ys).toContain(17 * TILE - PLAYER_SIZE / 2);
    expect(ys).not.toContain(6 * TILE - PLAYER_SIZE / 2);
  }, 120000);

  it("reports a deep well as a trap (reachable but impossible to leave)", () => {
    // Two 9-tile towers with a 2-wide channel between them; the left side has stepping ledges up.
    const rows: string[] = [];
    for (let y = 0; y < GRID_H; y++) {
      const r = Array.from({ length: GRID_W }, (_, x) => (y === 0 || y >= GRID_H - 2 || x < 2 || x >= GRID_W - 2 ? "#" : "."));
      if (y >= 17 && y <= 25) for (const x of [8, 9, 10, 11, 12, 13, 16, 17, 18, 19, 20, 21]) r[x] = "#";
      if (y === 22 || y === 18) for (const x of [2, 3, 4]) r[x] = "#";
      rows.push(r.join(""));
    }
    const lv: LevelData = { ...SECRET_ROOMS[0].level, tiles: rows };
    expect(validateLevel(lv)).toEqual([]);
    const g = analyseStands(lv, startsOf(SECRET_ROOMS[0]), MARGIN_JUMP);
    expect(g.trapped.length).toBeGreaterThan(0);
  }, 120000);

  it("regression: the first PIP layout (open channels down to the floor) fails the strong-connectivity check", () => {
    const OLD_PIP = [
      "################################",
      ...Array.from({ length: 16 }, () => "##............................##"),
      "##...#####...######..#####....##",
      "####.#####...######..#####..####",
      "##...##..##....##....##..##...##",
      "##...##..##....##....##..##...##",
      "##...#####.....##....#####....##",
      "####.#####.....##....#####..####",
      "##...##........##....##.......##",
      "##...##......######..##.......##",
      "##...##......######..##.......##",
      "################################",
      "################################",
    ];
    const lv: LevelData = { ...SECRET_ROOMS[0].level, tiles: OLD_PIP };
    expect(validateLevel(lv)).toEqual([]);
    const oldSpawns = [{ x: 3 * TILE + TILE / 2, y: 25 * TILE + 1 }, { x: 28 * TILE + TILE / 2, y: 25 * TILE + 1 }];
    const g = analyseStands(lv, oldSpawns, MARGIN_JUMP);
    expect(g.trapped.length).toBeGreaterThan(0);
  }, 120000);
});

describe("source hygiene", () => {
  const files = (dir: string): string[] =>
    readdirSync(dir, { withFileTypes: true }).flatMap((e) => (e.isDirectory() ? files(join(dir, e.name)) : e.name.endsWith(".ts") ? [join(dir, e.name)] : []));
  const src = files(join(__dirname, "..", "src"));

  it("uses no engine-approximated Math functions, randomness or clocks", () => {
    for (const f of src) {
      const text = readFileSync(f, "utf8");
      expect(text, f).not.toMatch(/Math\.(hypot|sin|cos|tan|atan2?|pow|exp|log\w*|random)\b|Date\./);
    }
  });

  it("the new secret code writes no score directly and draws no rng", () => {
    const text = readFileSync(join(__dirname, "..", "src", "sim", "secret.ts"), "utf8");
    expect(text).not.toMatch(/\.score\s*[+\-]?=/);
    expect(text).not.toMatch(/rng\./);
  });
});

