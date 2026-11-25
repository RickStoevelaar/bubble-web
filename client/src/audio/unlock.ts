import type { AudioApi } from "./audio";

type Target = Pick<Window, "addEventListener" | "removeEventListener">;

const TYPES = ["pointerdown", "touchend", "keydown", "click"] as const;

/**
 * Unlocks audio from the first valid user gesture. The handler calls `audio.unlock()` synchronously, which is what
 * iOS Safari requires (resume() and the silent buffer must run inside the gesture). The listeners go away once the
 * context is really running, not merely after the first event, so a gesture iOS refuses to count (a touch
 * pointerdown, a touchstart) can be followed by one that works. Returns a disposer.
 */
export function installUnlock(target: Target, audio: AudioApi): () => void {
  let installed = true;
  const handler = (ev: Event): void => {
    // A touch pointerdown is not an activation on iOS; the touchend/click that follows is.
    if (ev.type === "pointerdown" && (ev as PointerEvent).pointerType === "touch") return;
    audio.unlock();
  };
  const remove = (): void => {
    if (!installed) return;
    installed = false;
    for (const t of TYPES) target.removeEventListener(t, handler, true);
  };
  for (const t of TYPES) target.addEventListener(t, handler, { capture: true, passive: true });
  audio.onUnlocked(remove);
  return remove;
}
