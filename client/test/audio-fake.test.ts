import { describe, expect, it } from "vitest";
import { FakeAudioContext, FakeNode, FakeParam } from "./audio-fake";

describe("the strict fake WebAudio is itself strict", () => {
  it("throws InvalidStateError on stop before start and on a second start", () => {
    const o = new FakeNode("osc");
    expect(() => o.stop(1)).toThrowError(/before start/);
    o.start(0);
    expect(() => o.start(1)).toThrowError(/twice/);
    expect(() => o.stop(1)).not.toThrow();
  });
  it("fires onended once the clock passes the stop time, then allows stop and double disconnect", () => {
    const ctx = new FakeAudioContext("running");
    const o = ctx.createOscillator();
    let ended = 0;
    o.onended = () => ended++;
    o.start(0);
    o.stop(1);
    ctx.currentTime = 0.5;
    expect(ended).toBe(0);
    ctx.currentTime = 1.5;
    expect(ended).toBe(1);
    ctx.currentTime = 2;
    expect(ended).toBe(1);
    expect(() => o.stop(3)).not.toThrow();
    o.disconnect();
    expect(() => o.disconnect()).not.toThrow();
    expect(o.disconnectCalls).toBe(2);
  });
  it("rejects a ramp scheduled before the previous event and an exponential ramp to zero", () => {
    const p = new FakeParam();
    p.setValueAtTime(1, 2);
    expect(() => p.linearRampToValueAtTime(0, 1)).toThrowError(/before the previous event/);
    expect(() => p.exponentialRampToValueAtTime(0, 3)).toThrow();
    p.cancelScheduledValues(0);
    expect(() => p.linearRampToValueAtTime(0, 1)).not.toThrow();
  });
});
