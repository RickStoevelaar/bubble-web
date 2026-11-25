import { FIELD_H, FIELD_W } from "@bubble/shared";
import { scoresKey, scoresTap, type ScoresAction } from "./scores";

// eslint-disable-next-line @typescript-eslint/no-explicit-any -- window.addEventListener overloads need a lenient handler type
type Handler = (e: any) => void;
export interface EventTargetLike {
  addEventListener(type: string, h: Handler, o?: unknown): void;
  removeEventListener(type: string, h: Handler, o?: unknown): void;
}

/** `?round=N` (dev shortcut): a whole number from 1 to 999, else null. Anything else is not a dev round. */
export function parseDevRound(search: string): number | null {
  const v = new URLSearchParams(search).get("round");
  if (v === null || !/^\d{1,3}$/.test(v)) return null;
  const n = Number(v);
  return n >= 1 ? n : null;
}

const MODIFIER_KEYS = new Set(["Shift", "Control", "Alt", "Meta", "CapsLock", "NumLock", "ScrollLock", "Dead", "Unidentified"]);

/** Any real key starts the game; modifiers alone, browser shortcuts (Ctrl/Alt/Meta + key) and F-keys do not. */
export function isStartKey(e: { key: string; ctrlKey?: boolean; altKey?: boolean; metaKey?: boolean }): boolean {
  if (e.ctrlKey || e.altKey || e.metaKey) return false;
  if (MODIFIER_KEYS.has(e.key) || /^F\d{1,2}$/.test(e.key)) return false;
  if (e.key === "m" || e.key === "M") return false; // the mute key
  return true;
}

/** True when the event came from a button/link/field (the mute button must not start the game). */
function fromControl(e: { target?: unknown }): boolean {
  const t = e.target as { closest?: (s: string) => unknown } | null | undefined;
  return typeof t?.closest === "function" && t.closest("button, a, input, select, textarea") !== null;
}

/**
 * Title: a pointer press or a key calls `onStart` once. This is also the user gesture that unlocks audio (the
 * page-wide unlock listeners see the same event). Returns a disposer; nothing stays registered after it.
 */
export function installTitleStart(target: EventTargetLike, onStart: () => void): () => void {
  let done = false;
  const fire = (): void => {
    if (done) return;
    done = true;
    onStart();
  };
  const onPointer = (e: { target?: unknown }): void => {
    if (!fromControl(e)) fire();
  };
  const onKey = (e: KeyboardEvent): void => {
    if (e.repeat || !isStartKey(e) || fromControl(e)) return;
    e.preventDefault(); // the key must not also be typed into the form that is about to appear
    fire();
  };
  target.addEventListener("pointerdown", onPointer as Handler);
  target.addEventListener("keydown", onKey as Handler);
  return () => {
    done = true;
    target.removeEventListener("pointerdown", onPointer as Handler);
    target.removeEventListener("keydown", onKey as Handler);
  };
}

/** Client coordinates -> game coordinates (256x224) for a canvas whose CSS box is `rect`. */
export function toGame(rect: { left: number; top: number; width: number; height: number }, cx: number, cy: number): { x: number; y: number } {
  const w = rect.width > 0 ? rect.width : 1;
  const h = rect.height > 0 ? rect.height : 1;
  return { x: ((cx - rect.left) / w) * FIELD_W, y: ((cy - rect.top) / h) * FIELD_H };
}

/** Scores screen: taps (BACK box or "next page") and keys, reported as one action. Returns a disposer. */
export function installScoresInput(
  win: EventTargetLike,
  canvas: { getBoundingClientRect(): { left: number; top: number; width: number; height: number } },
  onAction: (a: Exclude<ScoresAction, null>) => void,
): () => void {
  const onPointer = (e: { clientX: number; clientY: number; target?: unknown }): void => {
    if (fromControl(e)) return;
    const g = toGame(canvas.getBoundingClientRect(), e.clientX, e.clientY);
    const a = scoresTap(g.x, g.y);
    if (a) onAction(a);
  };
  const onKey = (e: KeyboardEvent): void => {
    if (e.repeat || e.ctrlKey || e.altKey || e.metaKey) return; // a held key must not bounce through screens
    const a = scoresKey(e.key);
    if (!a) return;
    e.preventDefault();
    onAction(a);
  };
  win.addEventListener("pointerdown", onPointer as Handler);
  win.addEventListener("keydown", onKey as Handler);
  return () => {
    win.removeEventListener("pointerdown", onPointer as Handler);
    win.removeEventListener("keydown", onKey as Handler);
  };
}

const SKIP_KEYS = new Set(["Enter", "Escape", " ", "Spacebar"]);

/**
 * Ending screen: a tap or Enter/Escape/Space calls `onSkip` once, but only while `canSkip()` holds (the caller
 * decides from the scene clock). Key repeat is ignored. Returns a disposer; nothing stays registered after it.
 */
export function installEndingSkip(target: EventTargetLike, canSkip: () => boolean, onSkip: () => void): () => void {
  let done = false;
  const fire = (): boolean => {
    if (done || !canSkip()) return false;
    done = true;
    onSkip();
    return true;
  };
  const onPointer = (e: { target?: unknown }): void => {
    if (!fromControl(e)) fire();
  };
  const onKey = (e: KeyboardEvent): void => {
    if (e.repeat || e.ctrlKey || e.altKey || e.metaKey || !SKIP_KEYS.has(e.key)) return;
    if (fire()) e.preventDefault();
  };
  target.addEventListener("pointerdown", onPointer as Handler);
  target.addEventListener("keydown", onKey as Handler);
  return () => {
    done = true;
    target.removeEventListener("pointerdown", onPointer as Handler);
    target.removeEventListener("keydown", onKey as Handler);
  };
}
