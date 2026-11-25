import { FIELD_H, FIELD_W } from "@bubble/shared";
import type { GameState } from "@bubble/shared";
import type { Layout } from "../render/layout";
import type { SpriteSheet } from "../render/sprites";
import { bigWidth, drawBig } from "./bigtext";
import { drawCentered } from "./text";

/** How long the continue question waits. CLIENT-SIDE UX ONLY: the server never times it out. */
export const CONTINUE_SECONDS = 10;

export interface PromptDeps {
  now: () => number;
  setTimer: (fn: () => void, ms: number) => unknown;
  clearTimer: (h: unknown) => void;
  onAnswer: (accept: boolean) => void;
  seconds?: number;
}

/**
 * The continue countdown and the single answer. The countdown is a client convenience: the server waits for the
 * first answer from either player with no timeout of its own, so when the time runs out THIS client declines
 * (once). `stop()` (leaving the screen) cancels the timer so nothing fires afterwards.
 */
export class ContinuePrompt {
  private active = false;
  private answered = false;
  private deadline = 0;
  private timer: unknown = null;

  constructor(private readonly d: PromptDeps) {}

  get isAnswered(): boolean {
    return this.answered;
  }

  start(): void {
    this.stop();
    this.active = true;
    this.answered = false;
    const ms = (this.d.seconds ?? CONTINUE_SECONDS) * 1000;
    this.deadline = this.d.now() + ms;
    this.timer = this.d.setTimer(() => {
      this.timer = null;
      this.answer(false);
    }, ms);
  }

  stop(): void {
    this.active = false;
    if (this.timer !== null) this.d.clearTimer(this.timer);
    this.timer = null;
  }

  /** Whole seconds left, rounded up, 0 once expired. */
  remainingSeconds(): number {
    if (!this.active) return 0;
    return Math.max(0, Math.ceil((this.deadline - this.d.now()) / 1000));
  }

  /** The first call wins; later calls (a second tap, the timer after a tap) do nothing. */
  answer(accept: boolean): boolean {
    if (!this.active || this.answered) return false;
    this.answered = true;
    if (this.timer !== null) this.d.clearTimer(this.timer);
    this.timer = null;
    this.d.onAnswer(accept);
    return true;
  }
}

/** Minimal shapes of what the panel touches, so tests can use fakes. */
export interface ButtonLike {
  disabled: boolean;
  addEventListener(type: "click", h: () => void): void;
}
export interface BoxLike {
  hidden: boolean;
}
export interface KeyTarget {
  addEventListener(type: "keydown", h: (e: KeyboardEvent) => void): void;
  removeEventListener(type: "keydown", h: (e: KeyboardEvent) => void): void;
}

/** The DOM half of the game-over screen: two big buttons plus the keyboard shortcuts, alive only while shown. */
export class GameOverPanel {
  private shown = false;
  private readonly onKey = (e: KeyboardEvent): void => {
    if (e.ctrlKey || e.metaKey || e.altKey) return;
    if (e.key === "Enter" || e.key === " ") {
      e.preventDefault();
      this.answer(true);
    } else if (e.key === "Escape") {
      e.preventDefault();
      this.answer(false);
    }
  };

  constructor(
    private readonly box: BoxLike,
    private readonly cont: ButtonLike,
    private readonly quit: ButtonLike,
    private readonly keys: KeyTarget,
    readonly prompt: ContinuePrompt,
  ) {
    cont.addEventListener("click", () => this.answer(true));
    quit.addEventListener("click", () => this.answer(false));
  }

  get isShown(): boolean {
    return this.shown;
  }

  /** Answers through the prompt (first wins) and disables both buttons until the phase changes. */
  answer(accept: boolean): void {
    if (!this.shown) return;
    this.prompt.answer(accept);
    this.refresh();
  }

  /** Buttons are disabled once an answer went out (a tap, a key or the countdown). Cheap: call every frame. */
  refresh(): void {
    const locked = this.prompt.isAnswered;
    this.cont.disabled = locked;
    this.quit.disabled = locked;
  }

  show(): void {
    if (this.shown) return;
    this.shown = true;
    this.box.hidden = false;
    this.prompt.start();
    this.refresh();
    this.keys.addEventListener("keydown", this.onKey);
  }

  hide(): void {
    this.prompt.stop();
    this.box.hidden = true;
    if (!this.shown) return;
    this.shown = false;
    this.keys.removeEventListener("keydown", this.onKey);
  }
}

export interface ButtonPlacement {
  left: number;
  top: number;
  width: number;
  height: number;
}

/** Smallest touch target (CSS px). */
export const MIN_BUTTON_H = 44;

/**
 * Where the CONTINUE/QUIT row goes (CSS px): inside the deck area in portrait (the deck itself is hidden on this
 * screen), over the empty bottom of the field when the window is wide. Never below the window's bottom edge
 * (`safeBottom` keeps it above a home indicator).
 */
export function buttonPlacement(l: Layout, winW: number, winH: number, safeBottom = 0): ButtonPlacement {
  if (l.mode === "portrait" && l.deckRect) {
    const d = l.deckRect;
    const height = Math.max(MIN_BUTTON_H, Math.min(72, Math.floor(d.height * 0.3)));
    const left = 16;
    const top = Math.min(d.y + Math.max(12, Math.floor(d.height * 0.12)), winH - safeBottom - height - 8);
    return { left, top, width: Math.max(0, winW - 2 * left), height };
  }
  const width = Math.min(winW - 32, Math.floor(l.fieldW * 0.86));
  const height = Math.max(MIN_BUTTON_H, Math.min(64, Math.floor(l.fieldH * 0.16)));
  const top = Math.min(l.gameY + Math.floor(l.fieldH * 0.76), winH - safeBottom - height - 6);
  return { left: Math.round((winW - width) / 2), top: Math.max(0, top), width, height };
}

/** The canvas half: dimmed field, GAME OVER, both scores, the question and the countdown. */
export function drawGameOver(
  ctx: CanvasRenderingContext2D,
  sheet: SpriteSheet,
  state: Pick<GameState, "players">,
  secondsLeft: number,
  answered: boolean,
): void {
  ctx.fillStyle = "rgba(0,0,0,0.72)";
  ctx.fillRect(0, 0, FIELD_W, FIELD_H);
  const title = "GAME OVER";
  drawBig(ctx, title, Math.round((FIELD_W - bigWidth(title, 3)) / 2), 40, 3, "#ff6b6b");
  let y = 84;
  for (const p of state.players) {
    drawCentered(ctx, sheet, `${p.id === 0 ? "1UP" : "2UP"} ${Math.max(0, Math.floor(p.score))}`, y);
    y += 12;
  }
  drawCentered(ctx, sheet, answered ? "WAITING..." : "CONTINUE?", 124);
  if (!answered) {
    const n = String(secondsLeft);
    drawBig(ctx, n, Math.round((FIELD_W - bigWidth(n, 3)) / 2), 140, 3, "#ffe34a");
  }
}
