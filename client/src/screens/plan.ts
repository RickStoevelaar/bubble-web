import type { Layout, Rect } from "../render/layout";
import { computeTouchZones, type TouchZones } from "../input/touch";
import { buttonPlacement, type ButtonPlacement } from "./gameover";
import type { Screen } from "./machine";

export interface ScreenPlan {
  /** Touch zones: only the game screen has any (the deck must not show or catch touches anywhere else). */
  zones: TouchZones | null;
  /** Where the deck element goes; null hides it. */
  deckBox: Rect | null;
  deckPassThrough: boolean;
  /** CONTINUE/QUIT row placement, only on the game-over screen. */
  actions: ButtonPlacement | null;
}

/** Everything a layout recompute (resize, rotation, a screen change) has to place for the current screen. */
export function planScreenLayout(
  screen: Screen,
  l: Layout,
  winW: number,
  winH: number,
  touchCapable: boolean,
  safeBottom: number,
  safeLeft = 0,
  safeRight = 0,
): ScreenPlan {
  const zones = screen === "game" ? computeTouchZones(l, winW, winH, touchCapable, safeBottom, safeLeft, safeRight) : null;
  const deckBox = zones ? (l.mode === "portrait" ? l.deckRect : { x: 0, y: 0, width: winW, height: winH }) : null;
  return {
    zones,
    deckBox,
    deckPassThrough: l.mode !== "portrait",
    actions: screen === "gameover" ? buttonPlacement(l, winW, winH, safeBottom) : null,
  };
}
