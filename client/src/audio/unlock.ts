import type { AudioApi } from "./audio";

type Target = Pick<Window, "addEventListener" | "removeEventListener">;

const TYPES = ["pointerdown", "touchend", "keydown", "click"] as const;

/**
 * Unlocks audio from user gestures. The handler calls `audio.unlock()` synchronously, which is what iOS Safari
 * requires (resume() and the silent buffer must run inside the gesture). The passive listeners stay for the page
 * lifetime and act only while the context is not running, so a gesture iOS refuses to count can be followed by one
 * that works, and a later interruption (a phone call) is recovered by the next tap. Returns a disposer.
 */
export function installUnlock(target: Target, audio: AudioApi): () => void {
  let installed = true;
  const handler = (ev: Event): void => {
    // A touch pointerdown is not an activation on iOS; the touchend/click that follows is.
    if (ev.type === "pointerdown" && (ev as PointerEvent).pointerType === "touch") return;
    if (audio.isRunning()) return;
    audio.unlock();
  };
  const remove = (): void => {
    if (!installed) return;
    installed = false;
    for (const t of TYPES) target.removeEventListener(t, handler, true);
  };
  for (const t of TYPES) target.addEventListener(t, handler, { capture: true, passive: true });
  return remove;
}
