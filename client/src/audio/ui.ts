import type { Layout } from "../render/layout";
import type { AudioApi } from "./audio";

/** The slice of Document the mute button needs (a test can fake it). */
export interface DocLike {
  createElement(tag: string): HTMLElement;
  body: { appendChild(el: HTMLElement): unknown };
  activeElement: { tagName?: string; isContentEditable?: boolean } | null;
}

export const MUTE_SIZE = 40;
const MARGIN_MIN = MUTE_SIZE + 8;
const GAP = 6;

// Original geometric speaker: a block and a cone, then either two arcs (sound on) or a cross (muted).
const BODY = '<path d="M4 8h4l5-4v14l-5-4H4z" fill="currentColor"/>';
const ICON_ON = `<svg viewBox="0 0 22 22" width="24" height="24" aria-hidden="true">${BODY}<path d="M15 8a4 4 0 0 1 0 6M17 5a8 8 0 0 1 0 12" fill="none" stroke="currentColor" stroke-width="1.8" stroke-linecap="round"/></svg>`;
const ICON_OFF = `<svg viewBox="0 0 22 22" width="24" height="24" aria-hidden="true">${BODY}<path d="M15 8l5 6M20 8l-5 6" fill="none" stroke="currentColor" stroke-width="1.8" stroke-linecap="round"/></svg>`;

const TOUCHES = ["touchstart", "touchmove", "touchend", "touchcancel"] as const;

export interface MuteButton {
  el: HTMLElement;
  /** Re-reads the audio state (aria-pressed and icon). */
  refresh(): void;
  dispose(): void;
}

/** A fixed 40x40 toggle. It swallows only its own touches so the touch deck never sees them. */
export function createMuteButton(doc: DocLike, audio: AudioApi): MuteButton {
  const el = doc.createElement("button");
  el.setAttribute("type", "button");
  el.setAttribute("id", "mute");
  // Never focusable by keyboard and blurred after a click: Space is the jump key and must not toggle mute.
  el.setAttribute("tabindex", "-1");
  el.setAttribute("aria-label", "Mute sound");
  const s = el.style;
  s.position = "fixed";
  s.width = `${MUTE_SIZE}px`;
  s.height = `${MUTE_SIZE}px`;
  s.padding = "0";
  s.display = "flex";
  s.alignItems = "center";
  s.justifyContent = "center";
  s.border = "1px solid rgba(255,255,255,0.35)";
  s.borderRadius = "10px";
  s.background = "rgba(0,0,0,0.55)";
  s.color = "#fff";
  s.zIndex = "10";
  s.touchAction = "manipulation";
  s.left = "0px";
  s.top = "6px";

  const refresh = (): void => {
    const muted = audio.isMuted();
    el.setAttribute("aria-pressed", String(muted));
    el.innerHTML = muted ? ICON_OFF : ICON_ON;
  };
  const stop = (e: Event): void => e.stopPropagation();
  const click = (): void => {
    audio.setMuted(!audio.isMuted());
    refresh();
    el.blur?.();
  };
  for (const t of TOUCHES) el.addEventListener(t, stop);
  el.addEventListener("click", click);
  refresh();
  doc.body.appendChild(el);
  return {
    el,
    refresh,
    dispose: () => {
      for (const t of TOUCHES) el.removeEventListener(t, stop);
      el.removeEventListener("click", click);
      (el as { remove?: () => void }).remove?.();
    },
  };
}

export interface Placement {
  left: number;
  top: number;
  opacity: number;
}

/** In the margin right of the playfield when the layout leaves one, else over the top-right corner at 0.6 alpha. */
export function muteButtonPlacement(l: Pick<Layout, "gameX" | "fieldW">, winW: number): Placement {
  const fieldRight = l.gameX + l.fieldW;
  const margin = winW - fieldRight;
  if (margin >= MARGIN_MIN) return { left: Math.round(fieldRight + (margin - MUTE_SIZE) / 2), top: GAP, opacity: 1 };
  return { left: Math.max(0, winW - MUTE_SIZE - GAP), top: GAP, opacity: 0.6 };
}

export function applyPlacement(el: HTMLElement, p: Placement): void {
  el.style.left = `${p.left}px`;
  el.style.top = `${p.top}px`;
  el.style.opacity = String(p.opacity);
}

/** M toggles mute, except with a modifier held or while a text field has focus (the join form). */
export function installMuteKey(
  win: Pick<Window, "addEventListener" | "removeEventListener">,
  doc: Pick<DocLike, "activeElement">,
  audio: AudioApi,
  onToggle?: () => void,
): () => void {
  const handler = (ev: Event): void => {
    const e = ev as KeyboardEvent;
    if (e.key !== "m" && e.key !== "M") return;
    if (e.repeat) return;
    if (e.ctrlKey || e.metaKey || e.altKey) return;
    const a = doc.activeElement;
    if (a && (a.tagName === "INPUT" || a.tagName === "TEXTAREA" || a.tagName === "SELECT" || a.isContentEditable)) return;
    audio.setMuted(!audio.isMuted());
    onToggle?.();
  };
  win.addEventListener("keydown", handler);
  return () => win.removeEventListener("keydown", handler);
}
