import { describe, expect, it } from "vitest";
import { BTN } from "@bubble/shared";
import { Sampler, watchLifecycle } from "../src/sampler";

const TICK = 1000 / 60;

function setup() {
  const held = { buttons: BTN.R as number, resets: 0 };
  const sent: [number, number][] = [];
  const pushed: [number, number][] = [];
  let seq = 1;
  let synced = true;
  const sampler = new Sampler({
    input: { sample: () => held.buttons, reset: () => void held.resets++ },
    nextSeq: () => (synced ? seq++ : undefined),
    send: (s, b) => {
      sent.push([s, b]);
      return true;
    },
    push: (s, b) => void pushed.push([s, b]),
  });
  return { sampler, held, sent, pushed, setSynced: (v: boolean) => void (synced = v) };
}

describe("Sampler", () => {
  it("sends one input per 60 Hz tick with monotonic seqs and pushes the same to prediction", () => {
    const { sampler, sent, pushed } = setup();
    sampler.frame(0);
    sampler.frame(TICK * 3 + 1);
    expect(sent).toEqual([[1, BTN.R], [2, BTN.R], [3, BTN.R]]);
    expect(pushed).toEqual(sent);
  });

  it("caps catch-up at 4 ticks after a long stall", () => {
    const { sampler, sent } = setup();
    sampler.frame(0);
    sampler.frame(10_000);
    expect(sent).toHaveLength(4);
  });

  it("skips ticks while the connection is not synced", () => {
    const { sampler, sent, setSynced } = setup();
    setSynced(false);
    sampler.frame(0);
    sampler.frame(TICK * 2 + 1);
    expect(sent).toHaveLength(0);
  });

  it("hide sends exactly one zero input and then no further non-zero input", () => {
    const { sampler, sent, pushed, held } = setup();
    sampler.frame(0);
    sampler.frame(TICK + 0.1);
    sampler.setActive(false);
    sampler.setActive(false); // pagehide + blur + visibilitychange all fire
    expect(sent).toEqual([[1, BTN.R], [2, 0]]);
    expect(pushed).toEqual(sent);
    expect(held.resets).toBeGreaterThan(0);
    sampler.frame(500);
    sampler.frame(1000);
    expect(sent).toHaveLength(2);
  });

  it("a held key plus blur yields zero", () => {
    const { sampler, sent } = setup();
    sampler.frame(0);
    sampler.setActive(false);
    sampler.frame(100);
    sampler.frame(200);
    expect(sent.every(([, b]) => b === 0)).toBe(true);
  });

  it("resume samples normally again, seq continues, no catch-up burst for the hidden time", () => {
    const { sampler, sent } = setup();
    sampler.frame(0);
    sampler.frame(TICK + 0.1);
    sampler.setActive(false);
    sampler.frame(60_000);
    sampler.setActive(true);
    sampler.frame(61_000);
    expect(sent).toHaveLength(2);
    sampler.frame(61_000 + TICK + 0.1);
    expect(sent).toEqual([[1, BTN.R], [2, 0], [3, BTN.R]]);
  });
});

describe("watchLifecycle", () => {
  function targets() {
    const handlers = new Map<string, () => void>();
    const mk = () => ({
      addEventListener: (t: string, h: () => void) => void handlers.set(t, h),
      removeEventListener: (t: string) => void handlers.delete(t),
    });
    const win = mk();
    const doc = { ...mk(), hidden: false };
    return { win, doc, fire: (t: string) => handlers.get(t)?.(), handlers };
  }

  it("goes inactive on hidden, pagehide and blur; active again only when visible and focused", () => {
    const t = targets();
    const states: boolean[] = [];
    const dispose = watchLifecycle(t.win, t.doc, (a) => states.push(a));
    t.doc.hidden = true;
    t.fire("visibilitychange");
    t.doc.hidden = false;
    t.fire("blur");
    t.fire("focus");
    t.fire("pagehide");
    expect(states).toEqual([false, false, true, false]);
    dispose();
    expect(t.handlers.size).toBe(0);
  });

  it("stays inactive when visible again but not focused", () => {
    const t = targets();
    const states: boolean[] = [];
    watchLifecycle(t.win, t.doc, (a) => states.push(a));
    t.fire("blur");
    t.doc.hidden = true;
    t.fire("visibilitychange");
    t.doc.hidden = false;
    t.fire("visibilitychange");
    expect(states[states.length - 1]).toBe(false);
  });
});
