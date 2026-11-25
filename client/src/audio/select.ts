import type { GameState } from "@bubble/shared";
import type { TrackName } from "./music";

type MusicView = Pick<GameState, "phase" | "hurryActive" | "enemies" | "secret">;

/**
 * Which track the game state calls for. `prev` is the track currently playing: while a round is "clearing"
 * it is kept, so the clear fanfare plays over it. Secret room beats boss beats hurry beats main.
 * No allocation: this runs every frame.
 */
export function musicFor(state: MusicView | null, prev: TrackName | null): TrackName | null {
  if (!state) return null;
  switch (state.phase) {
    case "gameover":
      return null;
    case "ending":
      return "ending";
    case "clearing":
      return prev ?? "main";
    case "round":
      if (state.secret) return "secret";
      for (let i = 0; i < state.enemies.length; i++) {
        const e = state.enemies[i]!;
        if (e.type === "boss" && e.state !== "dead") return "boss";
      }
      return state.hurryActive ? "hurry" : "main";
  }
}
