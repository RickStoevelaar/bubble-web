import type { ConnState, ErrCode } from "./net";

export type ShownError = ErrCode | "timeout" | "closed";

export const ERROR_TEXT: Record<ShownError, string> = {
  badpin: "That PIN is not right.",
  full: "The room is full — if you were just disconnected, try again in a few seconds.",
  ratelimit: "Too many tries. Wait a minute and try again.",
  locked: "That room opens after you beat the game together.",
  badmsg: "The server did not understand the game. Please reload the page.",
  timeout: "Could not reach the server. Check your connection and try again.",
  closed: "The connection was closed.",
};

export interface StatusInput {
  state: ConnState;
  /** True once any join has succeeded in this page life. */
  everJoined: boolean;
  /** The most recent error since the last successful join, if any. */
  error: ShownError | null;
}

export interface StatusView {
  showJoin: boolean;
  statusText: string | null;
  errorText: string | null;
}

/** The single decision about what the player sees: join form, banner, or neither. */
export function viewOf(i: StatusInput): StatusView {
  switch (i.state) {
    case "joined":
      return { showJoin: false, statusText: null, errorText: null };
    case "reconnecting":
      return {
        showJoin: false,
        statusText: i.error === "ratelimit" ? ERROR_TEXT.ratelimit : "reconnecting…",
        errorText: null,
      };
    case "connecting":
      return { showJoin: true, statusText: null, errorText: null };
    case "closed":
      return {
        showJoin: true,
        statusText: null,
        errorText: i.error ? ERROR_TEXT[i.error] : i.everJoined ? ERROR_TEXT.closed : null,
      };
  }
}
