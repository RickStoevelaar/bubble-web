import type { ConnState } from "../net";
import { next, type Screen, type ScreenEvent } from "./machine";

export interface FlowConn {
  readonly connectionState: ConnState;
  close(): void;
}
export interface FlowPanel {
  show(): void;
  hide(): void;
}

/**
 * The glue between the pure screen machine and the session: which screen is up, whether a session was ever
 * joined, the current game object, and the connection side effects of screen changes. Kept free of the DOM so it
 * can be tested with fakes; main.ts supplies the visual part through `onEnter`.
 */
export class Flow<G extends { resync(): void }> {
  screen: Screen = "title";
  /** True once a join succeeded in the CURRENT session; reset by a fresh join and on the title. */
  everJoined = false;
  game: G | null = null;

  constructor(
    private readonly conn: FlowConn,
    private readonly panel: FlowPanel,
    private readonly onEnter: (prev: Screen, to: Screen) => void,
  ) {}

  go(ev: ScreenEvent): void {
    const prev = this.screen;
    const to = next(prev, ev);
    if (to === prev) return;
    this.screen = to; // before any side effect: the conn.close() below reports "closed" back into connState()
    if (to !== "gameover") this.panel.hide();
    if (to === "title") this.resetSession();
    if (to === "scores" && (prev === "gameover" || prev === "ending")) {
      // INVARIANT: we only get here after the server has the run recorded. The game-over -> scores path needs a
      // snapshot with runOver === true, and the room records the score in the same tick that sets runOver, before
      // it broadcasts that snapshot (room.ts: answerContinue -> endRun -> recordRun). The ending path starts after
      // the run is over too. So closing the socket now cannot lose the high-score entry, and /scores (fetched right
      // after) sees it. The resulting "closed" state is ignored by the machine because we are on "scores".
      this.conn.close();
    }
    this.onEnter(prev, to);
  }

  /** A fresh join attempt starts a new session: nothing of the old one (game, rejoin bookkeeping) survives. */
  beginJoin(): void {
    this.resetSession();
  }

  /** The connection state changed. */
  connState(s: ConnState): void {
    if (s === "joined") {
      if (this.everJoined) this.game?.resync(); // rejoin of the same session: the tick may have gone back
      this.everJoined = true;
      // An answer sent into a dead socket is lost: offer the question again after a reconnect.
      if (this.screen === "gameover") {
        this.panel.hide();
        this.panel.show();
      }
    } else if (s === "closed" && this.everJoined) {
      this.go({ t: "closedAfterJoin" }); // ignored everywhere except the playing screens
    }
  }

  /** The status banner (reconnecting...) is only for the playing screens, never over the form or the canvas screens. */
  bannerVisible(text: string | null): boolean {
    return text !== null && (this.screen === "game" || this.screen === "gameover" || this.screen === "ending");
  }

  private resetSession(): void {
    this.everJoined = false;
    this.game = null;
  }
}
