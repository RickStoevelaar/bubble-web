import { Sim, TEST_LEVEL, type EnemyState, type GameState } from "@bubble/shared";
import type { SpriteName, SpriteSheet } from "../src/render/sprites";

/** One recorded canvas operation, in call order. */
export type Ev = string;

const SMALL = ["tile_", "font_", "icon_"];

/** Recording stand-ins for a sprite sheet (with a layer-canvas seam) and 2D contexts. */
export function makeHarness() {
  const main: Ev[] = [];
  const layer: Ev[] = [];
  const state = { layersCreated: 0 };
  let pending = "?";

  const makeCtx = (log: Ev[]) => {
    const ctx = {
      fillStyle: "",
      globalAlpha: 1,
      fillRect: (...a: number[]) => log.push(`fill ${String(ctx.fillStyle)} ${a.join(" ")}`),
      drawImage: (src: { id?: string }, ...a: number[]) =>
        { log.push(`draw ${src.id ?? "?"} ${pending} ${a.slice(4).join(" ")} a=${ctx.globalAlpha}`); pending = "?"; },
      save: () => log.push("save"),
      restore: () => log.push("restore"),
      translate: (...a: number[]) => log.push(`translate ${a.join(" ")}`),
      scale: (...a: number[]) => log.push(`scale ${a.join(" ")}`),
      rotate: (a: number) => log.push(`rotate ${a}`),
    };
    return ctx as unknown as CanvasRenderingContext2D;
  };

  const ctx = makeCtx(main);
  const layerCtx = makeCtx(layer);
  const sheet = {
    canvas: { id: "sheet" } as unknown as CanvasImageSource,
    rectOf(name: SpriteName, frame: number) {
      pending = `${name}#${frame}`;
      const s = SMALL.some((p) => name.startsWith(p)) ? 8 : 16;
      return { sx: 0, sy: 0, w: s, h: s };
    },
    createLayer(w: number, h: number) {
      state.layersCreated++;
      void w;
      void h;
      return { canvas: { id: "layer" } as unknown as CanvasImageSource, ctx: layerCtx };
    },
  } as unknown as SpriteSheet;
  return { main, layer, state, ctx, layerCtx, sheet };
}

/** Events that belong to entities and HUD: no wall tiles, no background fill or blit. */
export function entityEvents(log: Ev[]): Ev[] {
  return log.filter((e) => !e.includes("tile_") && !e.startsWith("draw layer") && !e.endsWith(" 0 0 256 224"));
}

const enemy = (o: Partial<EnemyState>): EnemyState => ({
  id: 900, type: "walker", x: 100, y: 100, vx: 0, vy: 0, dir: 1, state: "active", angry: false, spawnDelay: 0, onGround: true, ...o,
});

/** Fixed, rich state used for the before/after output comparison. */
export function goldenState(): GameState {
  const sim = new Sim([TEST_LEVEL], 1, 2);
  for (let i = 0; i < 30; i++) sim.step([i < 15 ? 2 : 0, 0]);
  const s = structuredClone(sim.state);
  s.roundTicks = 10;
  s.hurryActive = true;
  s.round = 3;
  s.players[0]!.score = 4210;
  s.players[1]!.lives = 6;
  s.enemies = [
    enemy({ id: 1, type: "chaser", x: 50, y: 60, angry: true }),
    enemy({ id: 2, type: "boss", x: 90, y: 60, dir: -1 }),
    enemy({ id: 3, type: "walker", state: "trapped", angry: true }),
    enemy({ id: 4, type: "flyer", state: "dead", deadTicks: 7, x: 30, y: 30 }),
    enemy({ id: 5, type: "hurry", state: "spawning", x: 200, y: 40 }),
  ];
  s.bubbles = [
    { id: 10, x: 120, y: 120, vx: 0, vy: 0, kind: "normal", phase: "float", ageTicks: 20, owner: 0, trapped: { type: "walker", escapeIn: 30, enemyId: 3 } },
    { id: 11, x: 60, y: 120, vx: 0, vy: 0, kind: "fire", phase: "float", ageTicks: 3, owner: 1 },
    { id: 12, x: 80, y: 40, vx: 0, vy: 0, kind: "letter", letter: 2, phase: "float", ageTicks: 3, owner: 1 },
  ];
  (s.items as unknown as { id: number; x: number; y: number; kind: string }[]).push(
    { id: 20, x: 100, y: 180, kind: "food" },
    { id: 21, x: 130, y: 180, kind: "power" },
  );
  return s;
}
