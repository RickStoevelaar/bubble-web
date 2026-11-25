import type { GameState, SimEvent } from "./types";

/** Messages a client may send. `seq` starts at 1 and must strictly increase. */
export type ClientMsg =
  | { t: "join"; room: string; pin: string; name: string; rejoinToken?: string; startRound?: number }
  | { t: "input"; seq: number; buttons: number }
  | { t: "continue"; accept: boolean };

export type ServerMsg =
  | { t: "joined"; playerId: 0 | 1; rejoinToken: string; round: number }
  | { t: "snap"; tick: number; ackSeq: number; state: GameState; events: SimEvent[] }
  | { t: "peer"; playerId: 0 | 1; name: string; connected: boolean }
  | { t: "err"; code: "badpin" | "full" | "badmsg" | "ratelimit" | "locked" };
