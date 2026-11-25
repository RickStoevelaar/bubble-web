import type { GameState } from "@bubble/shared";
import type { ShownError } from "../status";

/** Which full-window scene the player is looking at. */
export type Screen = "title" | "join" | "game" | "gameover" | "ending" | "scores";

export type Phase = GameState["phase"];

export type ScreenEvent =
  | { t: "start" } // tap or key on the title
  | { t: "joined" }
  | { t: "joinFailed"; err: ShownError } // a terminal join error: back on the form (the caller shows the text)
  | { t: "closedAfterJoin" } // the session ended for good after a successful join
  | { t: "phase"; phase: Phase; runOver?: boolean } // an observation of the newest snapshot
  | { t: "continued" } // our CONTINUE answer was sent
  | { t: "declined" } // our QUIT answer (or the countdown) was sent
  | { t: "endingDone" }
  | { t: "scoresShown" } // the table finished loading (no screen change)
  | { t: "back" };

const PLAYING: readonly Screen[] = ["game", "gameover", "ending"];

/**
 * The whole screen flow as one pure, total function: it never throws and an event that makes no sense on the
 * current screen leaves it unchanged.
 *
 *   title    --start-->                join
 *   join     --joined-->               game        --back--> title
 *   game     --phase gameover-->       gameover    (runOver already: scores)
 *   game     --phase ending-->         ending
 *   gameover --phase round|clearing--> game        (a continue was accepted)
 *   gameover --phase gameover+runOver--> scores    (the run is over)
 *   gameover --phase ending-->         ending
 *   ending   --endingDone-->           scores
 *   scores   --back-->                 title
 *   game|gameover|ending --closedAfterJoin | joinFailed--> join
 *
 * Phase observations are honoured only on the playing screens, so a late snapshot (a phase "round" arriving
 * while the title is up) is ignored. While reconnecting the screen stays "game": the banner comes from status.ts.
 * Our own continue/decline answers do not leave "gameover" by themselves: the server takes the FIRST answer from
 * either player, so the screen follows what the next snapshot says (round -> game, runOver -> scores).
 */
export function next(screen: Screen, ev: ScreenEvent): Screen {
  if (typeof ev !== "object" || ev === null) return screen;
  switch (ev.t) {
    case "start":
      return screen === "title" ? "join" : screen;
    case "joined":
      return screen === "join" ? "game" : screen;
    case "joinFailed":
    case "closedAfterJoin":
      return PLAYING.includes(screen) || (ev.t === "joinFailed" && screen === "join") ? "join" : screen;
    case "phase":
      return onPhase(screen, ev.phase, ev.runOver === true);
    case "endingDone":
      return screen === "ending" ? "scores" : screen;
    case "back":
      return screen === "scores" || screen === "join" ? "title" : screen;
    case "continued":
    case "declined":
    case "scoresShown":
      return screen;
    default:
      return screen;
  }
}

function onPhase(screen: Screen, phase: Phase, runOver: boolean): Screen {
  if (screen !== "game" && screen !== "gameover") return screen; // title/join/scores/ending: stale or irrelevant
  switch (phase) {
    case "ending":
      return "ending";
    case "gameover":
      return runOver ? "scores" : "gameover";
    case "round":
    case "clearing":
      return "game";
    default:
      return screen;
  }
}
