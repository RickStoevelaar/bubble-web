import { BTN } from "@bubble/shared";
import type { InputSource } from "./input";
import type { PadVec, TouchPoint, TouchTracker, TouchZones } from "./touch";

/*
 * Touch Events (not Pointer Events): `event.touches` hands over the COMPLETE current set of
 * touches on every event, which is exactly what TouchTracker.update wants, and non-passive
 * touchstart/touchmove with preventDefault is the long-proven way to stop iOS Safari scrolling,
 * double-tap zoom and long-press selection. Pointer Events would need us to rebuild that set.
 */

export interface TouchInputOptions {
  /** Touches are only handled while this is true (the join form must keep working). */
  isEnabled?: () => boolean;
  /** Haptic tick; defaults to navigator.vibrate when it exists. */
  vibrate?: (ms: number) => void;
  now?: () => number;
  /** Called on the first touch event ever seen (touch-primary detection). */
  onTouch?: () => void;
}

const HAPTIC_MS = 8;
const HAPTIC_MIN_GAP_MS = 30;
const PASSIVE_OFF = { passive: false } as const;

interface TouchLike {
  identifier: number;
  clientX: number;
  clientY: number;
}
interface TouchListLike {
  length: number;
  [i: number]: TouchLike | undefined;
}
interface TouchEventLike {
  touches: TouchListLike;
  changedTouches: TouchListLike;
  preventDefault(): void;
}

type Target = Pick<Window, "addEventListener" | "removeEventListener">;

function toPoints(list: TouchListLike): TouchPoint[] {
  const out: TouchPoint[] = [];
  for (let i = 0; i < list.length; i++) {
    const t = list[i];
    if (t) out.push({ id: t.identifier, x: t.clientX, y: t.clientY });
  }
  return out;
}

/** DOM wiring: turns touch events into a held BTN mask via the tracker. */
export class TouchInput implements InputSource {
  private mask = 0;
  private seenTouch = false;
  private lastHaptic = -Infinity;
  private readonly listeners: [string, EventListener, AddEventListenerOptions | undefined][] = [];
  private readonly enabled: () => boolean;
  private readonly vibrate: ((ms: number) => void) | null;
  private readonly now: () => number;

  constructor(
    private readonly target: Target,
    private readonly tracker: TouchTracker,
    private readonly opts: TouchInputOptions = {},
  ) {
    this.enabled = opts.isEnabled ?? (() => true);
    this.now = opts.now ?? (() => performance.now());
    this.vibrate =
      opts.vibrate ?? (typeof navigator !== "undefined" && "vibrate" in navigator ? (ms) => navigator.vibrate(ms) : null);

    const touch = (type: string, h: (e: TouchEventLike) => void): void =>
      this.on(type, h as unknown as EventListener, PASSIVE_OFF);
    touch("touchstart", (e) => this.onStart(e));
    touch("touchmove", (e) => this.onChange(e));
    touch("touchend", (e) => this.onChange(e));
    touch("touchcancel", () => this.release());
    this.on("blur", () => this.release());
    for (const type of ["contextmenu", "dblclick", "gesturestart", "gesturechange", "gestureend"]) {
      this.on(type, (e) => {
        if (this.enabled()) e.preventDefault();
      });
    }
  }

  private on(type: string, h: EventListener, o?: AddEventListenerOptions): void {
    this.target.addEventListener(type, h, o);
    this.listeners.push([type, h, o]);
  }

  /** Currently pressed buttons (for drawing), including a flick minimum jump hold. */
  get pressed(): number {
    return this.enabled() ? this.tracker.held(this.now()) : 0;
  }

  /** Pad vector of the pad thumb for the knob, or null with no pad touch. */
  get knob(): PadVec | null {
    return this.tracker.knob();
  }

  private onStart(e: TouchEventLike): void {
    if (!this.seenTouch) {
      this.seenTouch = true;
      this.opts.onTouch?.();
    }
    if (!this.guard()) return;
    this.apply(e.touches);
    if (this.anyOwned(e.changedTouches)) e.preventDefault();
  }

  private onChange(e: TouchEventLike): void {
    if (!this.guard()) return;
    const owned = this.anyOwned(e.changedTouches); // before update: ended touches are forgotten by it
    this.apply(e.touches);
    if (owned) e.preventDefault();
  }

  /** False (and everything released) while disabled. */
  private guard(): boolean {
    if (this.enabled()) return true;
    this.release();
    return false;
  }

  private anyOwned(list: TouchListLike): boolean {
    for (let i = 0; i < list.length; i++) {
      const t = list[i];
      if (t && this.tracker.owns(t.identifier)) return true;
    }
    return false;
  }

  private apply(list: TouchListLike): void {
    const next = this.tracker.update(toPoints(list), this.now());
    const fresh = next & ~this.mask & (BTN.J | BTN.F);
    this.mask = next;
    if (fresh && this.vibrate) {
      const t = this.now();
      if (t - this.lastHaptic >= HAPTIC_MIN_GAP_MS) {
        this.lastHaptic = t;
        this.vibrate(HAPTIC_MS);
      }
    }
  }

  /** The zones changed (layout recompute): held touches are released if they moved. */
  setZones(z: TouchZones | null): void {
    if (this.tracker.setZones(z)) this.mask = 0;
  }

  sample(): number {
    if (!this.enabled()) {
      if (this.mask) this.release();
      return 0;
    }
    return this.tracker.held(this.now());
  }

  release(): void {
    this.tracker.release();
    this.mask = 0;
  }

  reset(): void {
    this.release();
  }

  dispose(): void {
    for (const [type, h, o] of this.listeners) this.target.removeEventListener(type, h, o);
    this.listeners.length = 0;
    this.release();
  }
}
