import { describe, expect, it } from "vitest";
import {
  FIELD_H,
  FIELD_W,
  GAME_LEVELS,
  P1_SPAWN_COL,
  P2_SPAWN_COL,
  PLAYER_SIZE,
  Sim,
  TILE,
  TUNING,
  isBossRound,
  levelForState,
  spawnFloorRow,
  type BubbleState,
  type EnemyState,
  type GameState,
  type SimEvent,
} from "../src";
import { killPlayer } from "../src/sim/combat";
import { startDeath } from "../src/sim/enemy-common";

/**
 * The whole campaign on the real 100-round set, no bot: every round is cleared by killing its enemies through the
 * sim death arc (startDeath), so the genuine round-clear / clearing / loadRound logic runs.
 */

const SEED = 1234;
const FOREVER = 1_000_000;
const MAX_ENEMIES = 12;
const MARGIN = TUNING.bossSize;
const none: [number, number] = [0, 0];

const finite = (v: unknown, path: string): void => {
  if (typeof v === "number") {
    if (!Number.isFinite(v)) throw new Error(`non-finite ${path}`);
  } else if (Array.isArray(v)) v.forEach((x, i) => finite(x, `${path}[${i}]`));
  else if (v && typeof v === "object") for (const [k, x] of Object.entries(v)) finite(x, `${path}.${k}`);
};

const real = (s: GameState): EnemyState[] => s.enemies.filter((e) => e.type !== "hurry" && e.state !== "dead");
const doors = (s: GameState) => s.items.filter((i) => i.kind === "door");

/**
 * Cheap invariants that hold on every tick. Players stand idle at their spawn (no bot), so the walking enemies would
 * eventually kill them: living players are kept invulnerable, the one test device, so a deathless campaign is possible.
 */
function light(sim: Sim): void {
  const s = sim.state;
  for (const p of s.players) if (p.state === "alive") p.invulnTicks = FOREVER;
  if (s.enemies.length > MAX_ENEMIES + s.players.length) throw new Error(`round ${s.round}: ${s.enemies.length} enemies`);
  for (const p of s.players) {
    if (!Number.isFinite(p.x) || !Number.isFinite(p.y)) throw new Error(`round ${s.round}: player not finite`);
  }
}

/** Full check, run at round boundaries. */
function deep(sim: Sim, round: number): void {
  const s = sim.state;
  expect(s.round).toBe(round);
  finite(s, `round${round}`);
  expect(sim.currentLevel).toBe(GAME_LEVELS[round - 1]);
  expect(levelForState(GAME_LEVELS, s)).toBe(GAME_LEVELS[round - 1]);
  expect(s.enemies.length).toBeLessThanOrEqual(MAX_ENEMIES);
  expect(s.secret).toBeNull();
  for (const p of s.players) {
    expect(p.lives).toBeGreaterThanOrEqual(0);
    expect(p.lives).toBeLessThanOrEqual(TUNING.startLives + 40);
    expect(p.score).toBeGreaterThanOrEqual(0);
    expect(p.x).toBeGreaterThan(0);
    expect(p.x).toBeLessThan(FIELD_W);
    expect(p.y).toBeGreaterThan(0);
    expect(p.y).toBeLessThan(FIELD_H);
  }
  for (const e of s.enemies) {
    expect(e.x).toBeGreaterThanOrEqual(0);
    expect(e.x).toBeLessThanOrEqual(FIELD_W);
    // bodies may poke above the top or sit just under the bottom while wrapping, never further than one body
    expect(e.y).toBeGreaterThanOrEqual(-MARGIN);
    expect(e.y).toBeLessThanOrEqual(FIELD_H + MARGIN);
  }
}

/** Right after a round loads: both players alive on their spawn tiles, the round enemies all spawning. */
function checkFresh(sim: Sim, round: number): void {
  const s = sim.state;
  const lv = GAME_LEVELS[round - 1]!;
  deep(sim, round);
  expect(s.phase).toBe("round");
  expect(s.roundTicks).toBeLessThanOrEqual(1);
  expect(doors(s)).toHaveLength(0);
  s.players.forEach((p, i) => {
    const col = i === 0 ? P1_SPAWN_COL : P2_SPAWN_COL;
    expect(p.state, `round ${round} player ${i}`).toBe("alive");
    expect(p.x).toBe(col * TILE + TILE / 2);
    expect(p.y).toBeCloseTo(spawnFloorRow(lv, col) * TILE - PLAYER_SIZE / 2, 5);
  });
  expect(s.enemies).toHaveLength(lv.enemies.length);
  expect(s.enemies.map((e) => e.type).sort()).toEqual(lv.enemies.map((e) => e.type).sort());
}

/** Steps until every enemy has left its spawn delay (or fails after `cap` ticks). */
function untilActive(sim: Sim, cap = 3000): void {
  let n = 0;
  while (sim.state.enemies.some((e) => e.state === "spawning")) {
    sim.step(none);
    light(sim);
    if (++n > cap) throw new Error(`round ${sim.state.round}: enemies never became active`);
  }
}

/** Kills every real enemy through the sim death arc. */
function killAll(sim: Sim): void {
  for (const e of sim.state.enemies) if (e.type !== "hurry" && e.type !== "boss") startDeath(e);
}

interface ClearInfo {
  sawClearing: boolean;
  doorSeen: boolean;
  clearEvents: number;
  ticks: number;
}

/**
 * Plays round `r` (already loaded and checked fresh): waits out the spawn delays, kills everything, steps until the
 * next round loads. The phase sequence must be round, then clearing, then the next round.
 */
function playRound(sim: Sim, r: number): ClearInfo {
  const info: ClearInfo = { sawClearing: false, doorSeen: false, clearEvents: 0, ticks: 0 };
  untilActive(sim);
  expect(real(sim.state).length, `round ${r} has enemies`).toBeGreaterThan(0);
  expect(sim.state.phase).toBe("round");
  deep(sim, r);
  killAll(sim);
  let last: GameState["phase"] = "round";
  while (sim.state.round === r) {
    const ev: SimEvent[] = sim.step(none);
    light(sim);
    info.clearEvents += ev.filter((e) => e.kind === "clear").length;
    const ph = sim.state.phase;
    if (sim.state.round === r) {
      if (ph === "clearing" && last === "round") info.sawClearing = true;
      if (!(last === ph || (last === "round" && ph === "clearing"))) throw new Error(`round ${r}: phase ${last} -> ${ph}`);
      if (doors(sim.state).length) info.doorSeen = true;
    }
    last = ph;
    if (++info.ticks > 3000 + TUNING.secretDoorClearTicks) throw new Error(`round ${r} did not clear (phase ${ph}, enemies ${sim.state.enemies.length})`);
  }
  return info;
}

const bossOf = (s: GameState): EnemyState => s.enemies.find((e) => e.type === "boss")!;
const immortal = (sim: Sim): void => {
  for (const p of sim.state.players) p.invulnTicks = FOREVER;
};

/** Lands one thunder shot on the boss (the same harness boss.test.ts uses). */
function hitBoss(sim: Sim): void {
  const b = bossOf(sim.state);
  const shot: BubbleState = {
    id: sim.state.nextId++,
    x: b.x - 5,
    y: b.y,
    vx: 3,
    vy: 0,
    kind: "lightning",
    phase: "launch",
    ageTicks: 0,
    owner: 0,
    shot: true,
  };
  sim.state.bubbles.push(shot);
  sim.step(none);
}

function defeatBoss(sim: Sim): void {
  immortal(sim);
  let guard = 0;
  while (sim.state.phase === "round") {
    if (++guard > 20000) throw new Error("boss never died");
    const b = bossOf(sim.state);
    if (b && !b.stun) hitBoss(sim);
    else sim.step(none);
  }
}

const maxHp = (players: number): number => TUNING.bossHpBase + TUNING.bossHpPerPlayer * players;

describe("campaign: all 99 ordinary rounds, two players, no bot", () => {
  const sim = new Sim(GAME_LEVELS, SEED, 2);
  const doorRounds: number[] = [];

  it("clears rounds 1..99 in order through the real round-clear path; doors only after 20, 30, 40", () => {
    checkFresh(sim, 1);
    for (let r = 1; r <= 99; r++) {
      const info = playRound(sim, r);
      expect(info.sawClearing, `round ${r} cleared via the clearing phase`).toBe(true);
      expect(info.clearEvents, `round ${r}`).toBe(1);
      if (info.doorSeen) doorRounds.push(r);
      // The next round loaded: exactly +1, fresh, door gone.
      expect(sim.state.round).toBe(r + 1);
      checkFresh(sim, r + 1);
      for (const p of sim.state.players) {
        expect(p.lives, `round ${r}: nobody lost a life`).toBe(TUNING.startLives);
        expect(p.deathlessSince).toBe(1);
      }
    }
    expect(doorRounds).toEqual([20, 30, 40]);
    expect(sim.state.round).toBe(100);
  }, 60_000);

  it("round 100: the boss spawns for two players, thunder shots only, no specials or hurry for 600 ticks", () => {
    expect(sim.state.round).toBe(100); // continues the run above
    const s = sim.state;
    expect(isBossRound(sim.currentLevel)).toBe(true);
    expect(sim.currentLevel).toBe(GAME_LEVELS[99]);
    expect(s.enemies).toHaveLength(1);
    expect(bossOf(s).type).toBe("boss");
    expect(bossOf(s).maxHp).toBe(maxHp(2));
    expect(bossOf(s).hp).toBe(maxHp(2));
    immortal(sim);
    for (let i = 0; i < 600; i++) {
      sim.step(none);
      for (const b of sim.state.bubbles) {
        expect(b.shot === true && b.kind === "lightning", `bubble kind ${b.kind}`).toBe(true);
      }
      expect(sim.state.enemies.some((e) => e.type === "hurry")).toBe(false);
      expect(sim.state.effects).toHaveLength(0);
    }
    expect(sim.state.hurryActive).toBe(false);
    expect(sim.state.phase).toBe("round");
    finite(sim.state, "boss");
  }, 30_000);

  it("defeating the boss with two players gives the true ending, serializes and restores", () => {
    defeatBoss(sim);
    const s = sim.state;
    expect(s.phase).toBe("ending");
    expect(s.runOver).toBe(true);
    expect(s.ending).toBe("true");
    finite(s, "ending");
    const copy = JSON.parse(JSON.stringify(s)) as GameState;
    expect(copy).toEqual(s);
    const restored = Sim.restore(GAME_LEVELS, copy);
    for (let i = 0; i < 60; i++) {
      sim.step(none);
      restored.step(none);
      expect(JSON.stringify(restored.state)).toBe(JSON.stringify(sim.state));
    }
    expect(sim.state.endingTicks).toBeGreaterThan(0);
  }, 30_000);
});

describe("campaign: single player", () => {
  it("round 99 then the boss gives the bad ending", () => {
    const sim = new Sim(GAME_LEVELS, SEED, { playerCount: 1, startRound: 99 });
    checkFresh(sim, 99);
    playRound(sim, 99);
    checkFresh(sim, 100);
    expect(bossOf(sim.state).maxHp).toBe(maxHp(1));
    defeatBoss(sim);
    expect(sim.state).toMatchObject({ phase: "ending", runOver: true, ending: "bad" });
  }, 30_000);
});

describe("campaign: the secret door needs ten deathless rounds", () => {
  const run = (killIn: number | null): number[] => {
    const sim = new Sim(GAME_LEVELS, SEED, { playerCount: 2, startRound: 12 });
    const seen: number[] = [];
    for (let r = 12; r <= 21; r++) {
      checkFresh(sim, r);
      if (r === killIn) {
        // a real death through the sim killPlayer, then the respawn countdown runs out
        killPlayer(sim.state.players[1]!, [], r);
        for (let i = 0; i < 400; i++) sim.step(none);
        expect(sim.state.players[1]!.state).toBe("alive");
        expect(sim.state.players[1]!.deathlessSince).toBe(r);
      }
      const info = playRound(sim, r);
      if (info.doorSeen) seen.push(r);
    }
    return seen;
  };

  it("control: nobody dies, the door appears after round 20", () => {
    expect(run(null)).toEqual([20]);
  }, 30_000);

  it("one player dies in round 15: no door after round 20", () => {
    expect(run(15)).toEqual([]);
  }, 30_000);
});

describe("campaign: restore in the middle of a round", () => {
  it.each([20, 50, 100])("a sim saved mid-round %i and restored stays identical for 300 ticks", (round) => {
    const live = new Sim(GAME_LEVELS, SEED, { playerCount: 2, startRound: round });
    const pad = (i: number): [number, number] => [(i * 7) % 16, (i * 5 + 3) % 16];
    for (let i = 0; i < 200; i++) live.step(pad(i));
    expect(live.state.round).toBe(round);
    const restored = Sim.restore(GAME_LEVELS, JSON.parse(JSON.stringify(live.state)) as GameState);
    expect(restored.currentLevel).toBe(GAME_LEVELS[round - 1]);
    for (let i = 200; i < 500; i++) {
      live.step(pad(i));
      restored.step(pad(i));
      if (JSON.stringify(restored.state) !== JSON.stringify(live.state)) throw new Error(`diverged at tick ${i}`);
    }
    finite(live.state, `restore${round}`);
  }, 30_000);
});
