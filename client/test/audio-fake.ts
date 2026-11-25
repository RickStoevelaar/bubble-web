/** Hand-written fake WebAudio for the audio tests: records every node and its connect/start/stop/disconnect calls. */
export class InvalidStateError extends Error {
  constructor(m: string) {
    super(m);
    this.name = "InvalidStateError";
  }
}

/** AudioParam with just enough timeline semantics to catch ordering mistakes (ramps before the previous event, exp to <= 0). */
export class FakeParam {
  value = 0;
  calls: unknown[][] = [];
  private last = -Infinity;
  private ev(kind: string, v: number, t: number, ramp: boolean): this {
    if (!Number.isFinite(t) || !Number.isFinite(v)) throw new RangeError(`${kind}: non-finite`);
    if (ramp && t < this.last) throw new InvalidStateError(`${kind} to t=${t} is before the previous event at ${this.last}`);
    this.last = Math.max(this.last, t);
    this.calls.push([kind, v, t]);
    return this;
  }
  setValueAtTime(v: number, t: number): this {
    this.value = v;
    return this.ev("set", v, t, false);
  }
  linearRampToValueAtTime(v: number, t: number): this {
    return this.ev("lin", v, t, true);
  }
  exponentialRampToValueAtTime(v: number, t: number): this {
    if (v <= 0) throw new RangeError("exponential ramp to a value <= 0");
    return this.ev("exp", v, t, true);
  }
  setTargetAtTime(v: number, t: number, k: number): this {
    if (!(k > 0)) throw new RangeError("time constant must be > 0");
    this.value = v;
    return this.ev("target", v, t, false);
  }
  cancelScheduledValues(t: number): this {
    this.last = -Infinity;
    this.calls.push(["cancel", t]);
    return this;
  }
}

export class FakeNode {
  type = "sine";
  loop = false;
  buffer: unknown = null;
  wave: unknown = null;
  startedAt: number | undefined;
  stoppedAt: number | undefined;
  ended = false;
  disconnected = false;
  disconnectCalls = 0;
  connects: FakeNode[] = [];
  onended: (() => void) | null = null;
  frequency = new FakeParam();
  gain = new FakeParam();
  Q = new FakeParam();
  constructor(readonly kind: string) {}
  connect(n: FakeNode): FakeNode {
    this.connects.push(n);
    return n;
  }
  disconnect(): void {
    this.disconnected = true;
    this.disconnectCalls++;
  }
  start(t = 0): void {
    if (this.startedAt !== undefined) throw new InvalidStateError("start() called twice");
    this.startedAt = t;
  }
  stop(t = 0): void {
    if (this.startedAt === undefined) throw new InvalidStateError("stop() before start()");
    if (!this.ended) this.stoppedAt = t; // after the end it is a no-op
  }
  setPeriodicWave(w: unknown): void {
    this.wave = w;
  }
  get isSource(): boolean {
    return this.kind === "osc" || (this.kind === "bufsrc" && this.loop);
  }
}

export class FakeAudioContext {
  static last: FakeAudioContext | undefined;
  private t = 0;
  state: "suspended" | "running" | "interrupted" | "closed" = "suspended";
  /** When true resume() leaves the context as it is (autoplay policy refusing a call outside a gesture). */
  blockResume = false;
  /** Fires onended for every source whose stop time has passed, whenever the clock moves. */
  get currentTime(): number {
    return this.t;
  }
  set currentTime(v: number) {
    this.t = v;
    for (const n of this.nodes) {
      if (n.isSource && !n.ended && n.stoppedAt !== undefined && n.stoppedAt <= v) {
        n.ended = true;
        n.onended?.();
      }
    }
  }
  sampleRate = 44100;
  destination = new FakeNode("destination");
  nodes: FakeNode[] = [];
  resumeCalls = 0;
  suspendCalls = 0;
  onstatechange: (() => void) | null = null;
  constructor(state: "suspended" | "running" = "suspended") {
    this.state = state;
    FakeAudioContext.last = this;
  }
  private mk(kind: string): FakeNode {
    const n = new FakeNode(kind);
    this.nodes.push(n);
    return n;
  }
  createOscillator = () => this.mk("osc");
  createGain = () => this.mk("gain");
  createBufferSource = () => this.mk("bufsrc");
  createBiquadFilter = () => this.mk("filter");
  createDynamicsCompressor = () => this.mk("comp");
  createBuffer(_ch: number, length: number, rate: number) {
    return { length, sampleRate: rate, getChannelData: () => new Float32Array(length) };
  }
  createPeriodicWave(re: Float32Array, im: Float32Array) {
    return { re, im };
  }
  resume(): Promise<void> {
    this.resumeCalls++;
    return Promise.resolve().then(() => {
      if (this.state !== "closed" && !this.blockResume) {
        this.state = "running";
        this.onstatechange?.();
      }
    });
  }
  suspend(): Promise<void> {
    this.suspendCalls++;
    this.state = "suspended";
    return Promise.resolve();
  }
  close(): Promise<void> {
    this.state = "closed";
    return Promise.resolve();
  }
  /** Oscillators and looping noise sources not yet disconnected. */
  liveSources(): FakeNode[] {
    return this.nodes.filter((n) => n.isSource && !n.disconnected);
  }
  allSources(): FakeNode[] {
    return this.nodes.filter((n) => n.isSource);
  }
  liveNodes(): number {
    return this.nodes.filter((n) => !n.disconnected).length;
  }
}

export function fakeTimers() {
  const ivs = new Map<number, { fn: () => void; ms: number }>();
  let id = 0;
  return {
    setInterval: (fn: () => void, ms: number): number => {
      ivs.set(++id, { fn, ms });
      return id;
    },
    clearInterval: (i: unknown): void => void ivs.delete(i as number),
    count: (): number => ivs.size,
    minMs: (): number => Math.min(...[...ivs.values()].map((v) => v.ms)),
    /** Runs every interval once per 25 ms of fake audio time and moves the fake clock with it. */
    advance(ctx: FakeAudioContext, seconds: number): void {
      const steps = Math.round(seconds / 0.025);
      for (let i = 0; i < steps; i++) {
        ctx.currentTime += 0.025;
        for (const v of [...ivs.values()]) v.fn();
      }
    },
  };
}

export function memStorage() {
  const m = new Map<string, string>();
  return {
    getItem: (k: string): string | null => m.get(k) ?? null,
    setItem: (k: string, v: string): void => void m.set(k, v),
    map: m,
  };
}

export const throwingStorage = {
  getItem: (): string | null => {
    throw new Error("blocked");
  },
  setItem: (): void => {
    throw new Error("blocked");
  },
};
