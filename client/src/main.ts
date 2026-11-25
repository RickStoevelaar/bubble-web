import { FIELD_H, FIELD_W, Sim, TEST_LEVEL, type EnemyState, type GameState } from "@bubble/shared";
import { computeLayout } from "./render/layout";
import { render } from "./render/renderer";
import { buildSheet } from "./render/sprites";

/** Static showcase state until networking lands: heroes, one of each enemy, bubbles, items. */
function demoState(): GameState {
  const sim = new Sim([TEST_LEVEL], 1, 2);
  for (let i = 0; i < 40; i++) sim.step([i < 20 ? 2 : 0, i < 20 ? 0 : 1]);
  const s = structuredClone(sim.state);
  const base = { vx: 0, vy: 0, dir: 1 as const, state: "active" as const, spawnDelay: 0, onGround: true };
  const types = ["chaser", "thrower", "breather", "bouncer", "flyer", "boss", "hurry"] as const;
  types.forEach((type, i) => {
    const e: EnemyState = { id: 100 + i, type, x: 40 + i * 28, y: 187, angry: i % 3 === 2, ...base };
    if (type === "flyer" || type === "hurry") e.y = 150;
    s.enemies.push(e);
  });
  s.enemies.push({ id: 200, type: "walker", x: 100, y: 62, angry: false, ...base, dir: -1 });
  s.enemies.push({ id: 201, type: "walker", x: 150, y: 100, angry: true, ...base, state: "trapped" });
  const bubble = (id: number, x: number, y: number, kind: GameState["bubbles"][number]["kind"], extra = {}) =>
    s.bubbles.push({ id, x, y, vx: 0, vy: 0, kind, phase: "float", ageTicks: id * 7, owner: 0, ...extra });
  bubble(300, 150, 100, "normal", { trapped: { type: "walker", escapeIn: 300, enemyId: 201 } });
  bubble(301, 60, 120, "water");
  bubble(302, 90, 120, "fire");
  bubble(303, 120, 120, "lightning");
  "EXTEND".split("").forEach((_, i) => bubble(310 + i, 40 + i * 20, 40, "letter", { letter: i }));
  (s.items as unknown as { id: number; x: number; y: number; kind: string }[]).push(
    ...["plum", "cake", "gem", "crown", "fish", "pear", "potion", "star"].map((_, i) => ({
      id: 400 + i,
      x: 44 + i * 20,
      y: 164,
      kind: i === 6 ? "power" : i === 2 || i === 3 || i === 7 ? "treasure" : "food",
    })),
  );
  s.hurryActive = true;
  s.roundTicks = 30;
  s.round = 1;
  s.players[0]!.score = 12450;
  s.players[1]!.score = 830;
  return s;
}

function boot(): void {
  const canvas = document.getElementById("game") as HTMLCanvasElement;
  const deck = document.getElementById("deck") as HTMLElement;
  const ctx = canvas.getContext("2d");
  if (!ctx) throw new Error("2d canvas context unavailable");
  const sheet = buildSheet(document);
  const state = demoState();

  const layout = () => {
    const dpr = window.devicePixelRatio || 1;
    const l = computeLayout(window.innerWidth, window.innerHeight, dpr);
    canvas.width = FIELD_W * l.scale;
    canvas.height = FIELD_H * l.scale;
    canvas.style.left = `${l.gameX}px`;
    canvas.style.top = `${l.gameY}px`;
    canvas.style.width = `${l.fieldW}px`;
    canvas.style.height = `${l.fieldH}px`;
    if (l.deckRect) {
      const r = l.deckRect;
      deck.style.display = "block";
      Object.assign(deck.style, { left: `${r.x}px`, top: `${r.y}px`, width: `${r.width}px`, height: `${r.height}px` });
    } else {
      deck.style.display = "none";
    }
    ctx.setTransform(l.scale, 0, 0, l.scale, 0, 0);
    ctx.imageSmoothingEnabled = false;
    render(ctx, sheet, state, [TEST_LEVEL], 0);
  };

  window.addEventListener("resize", layout);
  window.addEventListener("orientationchange", layout);
  layout();
}

boot();
