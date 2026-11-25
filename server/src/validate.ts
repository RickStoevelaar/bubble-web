import type { ClientMsg } from "@bubble/shared";

export const MAX_MSG_BYTES = 4096;
export const ROOM_CODE_RE = /^[A-Za-z0-9]{1,12}$/;
export const MAX_NAME = 16;
const DEFAULT_NAME = "Player";
const CONTROL_CHARS = /[\u0000-\u001f\u007f]/g;

/** Parses and validates one raw client message; null means the message is bad. Never throws. */
export function parseClientMsg(data: unknown): ClientMsg | null {
  if (typeof data !== "string" || Buffer.byteLength(data) > MAX_MSG_BYTES) return null;
  let o: unknown;
  try {
    o = JSON.parse(data);
  } catch {
    return null;
  }
  if (typeof o !== "object" || o === null || Array.isArray(o)) return null;
  const m = o as Record<string, unknown>;
  switch (m.t) {
    case "join": {
      if (typeof m.room !== "string" || !ROOM_CODE_RE.test(m.room)) return null;
      if (typeof m.pin !== "string" || m.pin.length > 128) return null;
      if (m.name !== undefined && typeof m.name !== "string") return null;
      if (m.rejoinToken !== undefined && (typeof m.rejoinToken !== "string" || m.rejoinToken.length > 64)) return null;
      const name = (typeof m.name === "string" ? m.name : "").replace(CONTROL_CHARS, "").trim().slice(0, MAX_NAME).trim();
      const msg: ClientMsg = { t: "join", room: m.room.toUpperCase(), pin: m.pin, name: name || DEFAULT_NAME };
      if (m.rejoinToken !== undefined) msg.rejoinToken = m.rejoinToken as string;
      return msg;
    }
    case "input":
      if (typeof m.seq !== "number" || !Number.isSafeInteger(m.seq) || m.seq < 1) return null;
      if (typeof m.buttons !== "number" || !Number.isInteger(m.buttons) || m.buttons < 0 || m.buttons > 15) return null;
      return { t: "input", seq: m.seq, buttons: m.buttons };
    case "continue":
      if (typeof m.accept !== "boolean") return null;
      return { t: "continue", accept: m.accept };
    default:
      return null;
  }
}
