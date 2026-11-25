import { FIELD_H, FIELD_W } from "@bubble/shared";

export interface Rect {
  x: number;
  y: number;
  width: number;
  height: number;
}

export interface Layout {
  /** Integer device pixels per game pixel. */
  scale: number;
  /** scale / dpr: CSS pixels per game pixel (may be fractional). */
  cssScale: number;
  /** CSS px of the field's top-left corner. */
  gameX: number;
  gameY: number;
  /** Field size in CSS px. */
  fieldW: number;
  fieldH: number;
  /** Control-deck area in CSS px (portrait only). */
  deckRect: Rect | null;
  mode: "portrait" | "wide";
}

/** Smallest control deck (CSS px) a portrait layout tries to leave below the field. */
export const MIN_DECK_CSS_HEIGHT = 200;
/** Gap above the field in portrait mode (CSS px). */
export const PORTRAIT_TOP_MARGIN = 4;

/**
 * Pure layout: the scale is an integer in DEVICE pixels so the field stays
 * crisp, even when that makes the CSS scale fractional on hidpi screens.
 */
export function computeLayout(winW: number, winH: number, dpr: number = 1): Layout {
  const ratio = dpr > 0 && Number.isFinite(dpr) ? dpr : 1;
  // Floor to a device pixel so the field never pokes past the far edge.
  const snap = (css: number) => Math.floor(css * ratio + 1e-9) / ratio;
  const devW = winW * ratio;
  const maxByWidth = Math.floor(devW / FIELD_W);

  if (winH > winW) {
    const top = snap(PORTRAIT_TOP_MARGIN);
    const fieldHFor = (s: number) => (s * FIELD_H) / ratio;
    let scale = 0;
    for (let s = maxByWidth; s >= 1; s--) {
      if (winH - top - fieldHFor(s) >= MIN_DECK_CSS_HEIGHT) {
        scale = s;
        break;
      }
    }
    if (scale === 0) {
      scale = 1;
      for (let s = maxByWidth; s > 1; s--) {
        if (top + fieldHFor(s) <= winH) {
          scale = s;
          break;
        }
      }
    }
    const fieldW = (scale * FIELD_W) / ratio;
    const fieldH = fieldHFor(scale);
    const deckY = top + fieldH;
    return {
      scale,
      cssScale: scale / ratio,
      gameX: snap((winW - fieldW) / 2),
      gameY: top,
      fieldW,
      fieldH,
      deckRect: { x: 0, y: deckY, width: winW, height: Math.max(0, winH - deckY) },
      mode: "portrait",
    };
  }

  const scale = Math.max(1, Math.min(maxByWidth, Math.floor((winH * ratio) / FIELD_H)));
  const fieldW = (scale * FIELD_W) / ratio;
  const fieldH = (scale * FIELD_H) / ratio;
  return {
    scale,
    cssScale: scale / ratio,
    gameX: snap((winW - fieldW) / 2),
    gameY: snap((winH - fieldH) / 2),
    fieldW,
    fieldH,
    deckRect: null,
    mode: "wide",
  };
}
