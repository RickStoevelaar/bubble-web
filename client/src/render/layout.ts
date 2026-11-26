import { FIELD_H, FIELD_W } from "@bubble/shared";

export interface Rect {
  x: number;
  y: number;
  width: number;
  height: number;
}

export interface Layout {
  /** Integer backing-store scale (canvas.width = FIELD_W * scale); the canvas may be displayed at a fractional size. */
  scale: number;
  /** fieldW / FIELD_W: CSS pixels per game pixel (may be fractional). */
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
 * Portrait: when the best whole-device-pixel scale leaves more than 8% of the width unused, the field is instead fitted
 * to the full width at a fractional scale (the canvas is drawn at ceil(scale) and shown with image-rendering: pixelated,
 * so game pixels are uneven by at most one device pixel; invisible at dpr 2.6+, slightly visible at dpr 1-2, which is
 * judged better than a 65-70% wide field).
 */
export const PORTRAIT_MIN_FILL = 0.92;

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
    let fieldW = (scale * FIELD_W) / ratio;
    let fieldH = fieldHFor(scale);
    let backing = scale;
    if (fieldW < winW * PORTRAIT_MIN_FILL) {
      // Fractional fit: bounded by the width and by the room left for the minimum deck.
      const maxDevW = Math.min(devW, ((winH - top - MIN_DECK_CSS_HEIGHT) * ratio * FIELD_W) / FIELD_H);
      const devFieldW = Math.floor(maxDevW + 1e-9);
      if (devFieldW > scale * FIELD_W && devFieldW >= FIELD_W) {
        fieldW = devFieldW / ratio;
        fieldH = (devFieldW * FIELD_H) / FIELD_W / ratio;
        backing = Math.ceil(devFieldW / FIELD_W);
      }
    }
    const deckY = top + fieldH;
    return {
      scale: backing,
      cssScale: fieldW / FIELD_W,
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
