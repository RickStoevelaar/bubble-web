import { TICK_RATE } from "@bubble/shared";
import type { InputSource } from "./input";

const TICK_MS = 1000 / TICK_RATE;
/** After a stall run at most this many catch-up ticks instead of a burst. */
export const MAX_CATCHUP_TICKS = 4;

export interface SamplerDeps {
  input: InputSource;
  /** Next input seq, or undefined while not joined / waiting for the first post-join snapshot. */
  nextSeq(): number | undefined;
  /** Sends one input; false if it was not sent. */
  send(seq: number, buttons: number): boolean;
  /** Informs prediction of an input that was sent. */
  push(seq: number, buttons: number): void;
}

/**
 * Fixed 60 Hz input sampler driven by frame timestamps. While inactive (page hidden or blurred)
 * it samples nothing: it sends one zero-buttons input on the way out so the server does not keep
 * applying the last held buttons while the page is dark.
 */
export class Sampler {
  private active = true;
  private last: number | null = null;
  private acc = 0;

  constructor(private readonly deps: SamplerDeps) {}

  setActive(active: boolean): void {
    if (active === this.active) return;
    this.active = active;
    this.last = null; // never count the dark time
    this.acc = 0;
    if (!active) {
      this.deps.input.reset?.();
      this.emit(0);
    }
  }

  /** Call once per animation frame with a monotonic ms timestamp. */
  frame(nowMs: number): void {
    const last = this.last;
    this.last = nowMs;
    if (!this.active || last === null) return;
    this.acc = Math.min(this.acc + (nowMs - last), TICK_MS * MAX_CATCHUP_TICKS);
    while (this.acc >= TICK_MS - 1e-6) {
      this.emit(this.deps.input.sample());
      this.acc -= TICK_MS;
    }
  }

  private emit(buttons: number): void {
    const seq = this.deps.nextSeq();
    if (seq === undefined) return;
    if (this.deps.send(seq, buttons)) this.deps.push(seq, buttons);
  }
}

interface Target {
  addEventListener(type: string, handler: () => void): void;
  removeEventListener(type: string, handler: () => void): void;
}

/** Reports whether the page is visible and focused on every relevant event; returns a disposer. */
export function watchLifecycle(
  win: Target,
  doc: Target & { hidden: boolean },
  onActive: (active: boolean) => void,
): () => void {
  let focused = true;
  const report = (): void => onActive(!doc.hidden && focused);
  const onBlur = (): void => {
    focused = false;
    report();
  };
  const onFocus = (): void => {
    focused = true;
    report();
  };
  const onPageHide = (): void => onActive(false);
  doc.addEventListener("visibilitychange", report);
  win.addEventListener("blur", onBlur);
  win.addEventListener("focus", onFocus);
  win.addEventListener("pagehide", onPageHide);
  return () => {
    doc.removeEventListener("visibilitychange", report);
    win.removeEventListener("blur", onBlur);
    win.removeEventListener("focus", onFocus);
    win.removeEventListener("pagehide", onPageHide);
  };
}
