import { describe, expect, it } from "vitest";
import { Sim, TEST_LEVEL, type BubbleState, type EnemyState, type GameState, type ItemState } from "@bubble/shared";
import { hasSprite } from "../src/render/sprites";
import { render } from "../src/render/renderer";
import { entityEvents, makeHarness } from "./harness";

function base(): GameState {
  const sim = new Sim([TEST_LEVEL], 1, 2);
  for (let i = 0; i < 10; i++) sim.step([0, 0]);
  const s = structuredClone(sim.state);
  s.enemies = [];
  s.bubbles = [];
  return s;
}

const goodEnemy: EnemyState = {
  id: 1, type: "walker", x: 60, y: 100, vx: 0, vy: 0, dir: 1, state: "active", angry: false, spawnDelay: 0, onGround: true,
};
const goodBubble: BubbleState = {
  id: 2, x: 120, y: 100, vx: 0, vy: 0, kind: "water", phase: "float", ageTicks: 0, owner: 0,
};

const goodItem: ItemState = {
  id: 9, x: 40, y: 150, vx: 0, vy: 0, onGround: true, kind: "food", sprite: 0, value: 100, despawnTicks: 100,
};

function draws(state: GameState): string[] {
  const h = makeHarness();
  expect(() => render(h.ctx, h.sheet, state, [TEST_LEVEL], 0)).not.toThrow();
  return entityEvents(h.main);
}
const has = (log: string[], sprite: string) => log.some((e) => e.includes(` ${sprite}#`));

describe("renderer tolerates server/client version skew", () => {
  it("skips an enemy of unknown type but draws the rest of the frame", () => {
    const s = base();
    s.enemies = [{ ...goodEnemy, type: "dragon" as unknown as EnemyState["type"] }, { ...goodEnemy, id: 3, x: 80 }];
    const log = draws(s);
    expect(has(log, "enemy_walker")).toBe(true);
    expect(log.filter((e) => e.includes("enemy_")).length).toBe(1);
    expect(has(log, "hero_pip")).toBe(true);
  });

  it("skips a bubble of unknown kind but draws the other bubbles and a trapped-enemy bubble's neighbours", () => {
    const s = base();
    s.bubbles = [{ ...goodBubble, id: 4, kind: "plasma" as unknown as BubbleState["kind"] }, goodBubble];
    const log = draws(s);
    expect(has(log, "bubble_water")).toBe(true);
    expect(log.filter((e) => e.includes("bubble_")).length).toBe(1);
    expect(has(log, "hero_pop")).toBe(true);
  });

  it("skips a letter bubble whose index is outside E-X-T-E-N-D", () => {
    const s = base();
    s.bubbles = [
      { ...goodBubble, id: 5, kind: "letter", letter: 9 as unknown as BubbleState["letter"] },
      { ...goodBubble, id: 6, kind: "letter", letter: 3, x: 150 },
    ];
    const log = draws(s);
    expect(log.filter((e) => e.includes("bubble_letter#")).length).toBe(1);
    expect(log.some((e) => e.includes("bubble_letter#3"))).toBe(true);
    expect(has(log, "hero_pip")).toBe(true);
  });

  it("skips a trapped-enemy overlay of unknown type but still draws the bubble", () => {
    const s = base();
    s.bubbles = [{ ...goodBubble, trapped: { type: "dragon" as unknown as EnemyState["type"], escapeIn: 100, enemyId: 77 } }];
    const log = draws(s);
    expect(has(log, "bubble_water")).toBe(true);
    expect(log.some((e) => e.includes("enemy_"))).toBe(false);
  });

  it("skips an item of unknown kind but draws known items", () => {
    const s = base();
    s.items.push(
      { ...goodItem, id: 10, x: 40, kind: "mystery" as ItemState["kind"] },
      { ...goodItem, id: 11, x: 80, kind: "power", power: "ring" },
    );
    const log = draws(s);
    expect(log.filter((e) => e.includes("item_")).length).toBe(0);
    expect(has(log, "power_ring")).toBe(true);
  });

  it("hasSprite is a non-throwing lookup", () => {
    expect(hasSprite("enemy_walker", 0)).toBe(true);
    expect(hasSprite("bubble_letter", 5)).toBe(true);
    expect(hasSprite("bubble_letter", 6)).toBe(false);
    expect(hasSprite("enemy_dragon", 0)).toBe(false);
    expect(hasSprite("bubble_normal", -1)).toBe(false);
    expect(hasSprite("toString", 0)).toBe(false);
  });
});
