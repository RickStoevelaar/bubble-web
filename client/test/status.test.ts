import { describe, expect, it } from "vitest";
import { ERROR_TEXT, viewOf } from "../src/status";

describe("viewOf", () => {
  it("shows only the join form before the first join", () => {
    expect(viewOf({ state: "closed", everJoined: false, error: null })).toEqual({ showJoin: true, statusText: null, errorText: null });
  });

  it("shows a failed first join's error on the form", () => {
    expect(viewOf({ state: "closed", everJoined: false, error: "badpin" })).toEqual({
      showJoin: true,
      statusText: null,
      errorText: ERROR_TEXT.badpin,
    });
  });

  it("shows the game with no text while joined", () => {
    expect(viewOf({ state: "joined", everJoined: true, error: null })).toEqual({ showJoin: false, statusText: null, errorText: null });
  });

  it("shows the reconnecting banner, never an error, while reconnecting", () => {
    const v = viewOf({ state: "reconnecting", everJoined: true, error: null });
    expect(v).toEqual({ showJoin: false, statusText: "reconnecting…", errorText: null });
  });

  it("says why when a reconnect is waiting out a rate limit", () => {
    const v = viewOf({ state: "reconnecting", everJoined: true, error: "ratelimit" });
    expect(v.showJoin).toBe(false);
    expect(v.statusText).toBe(ERROR_TEXT.ratelimit);
    expect(v.errorText).toBeNull();
  });

  it.each(["full", "badpin", "badmsg", "locked"] as const)("re-shows the join form with the %s error when closed mid-session", (code) => {
    const v = viewOf({ state: "closed", everJoined: true, error: code });
    expect(v).toEqual({ showJoin: true, statusText: null, errorText: ERROR_TEXT[code] });
  });

  it("explains a plain close after a session", () => {
    const v = viewOf({ state: "closed", everJoined: true, error: null });
    expect(v.showJoin).toBe(true);
    expect(v.errorText).toBe(ERROR_TEXT.closed);
  });

  it("keeps the form up (no error) while a new join is connecting", () => {
    expect(viewOf({ state: "connecting", everJoined: true, error: null })).toEqual({ showJoin: true, statusText: null, errorText: null });
  });

  it("explains the locked Super room", () => {
    expect(ERROR_TEXT.locked).toBe("That room opens after you beat the game together.");
  });

  it("uses the friendlier full-room wording", () => {
    expect(ERROR_TEXT.full).toBe("The room is full — if you were just disconnected, try again in a few seconds.");
  });
});
