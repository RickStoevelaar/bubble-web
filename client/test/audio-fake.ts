/** Hand-written fake WebAudio for the audio tests: records every node and its connect/start/stop/disconnect calls. */
export class FakeParam {
  value = 0;
  calls: unknown[][] = [];
  setValueAtTime(v: number, t: number): this {
    this.value = v;
    this.calls.push(["set", v, t]);
    return this;
  }
  linearRampToValueAtTime(v: number, t: number): this {
    this.calls.push(["lin", v, t]);
    return this;
  }
  exponentialRampToValueAtTime(v: number, t: number): this {
    this.calls.push(["exp", v, t]);
    return this;
  }
  setTargetAtTime(v: number, t: number, k: number): this {
    this.value = v;
    this.calls.push(["target", v, t, k]);
    return this;
  }
  cancelScheduledValues(t: number): this {
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
  disconnected = false;
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
  }
  start(t = 0): void {
    this.startedAt = t;
  }
  stop(t = 0): void {
    this.stoppedAt = t;
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
  currentTime = 0;
  state: "suspended" | "running" | "closed" = "suspended";
  sampleRate = 44100;
  destination = new FakeNode("destination");
  nodes: FakeNode[] = [];
  resumeCalls = 0;
  suspendCalls = 0;
  onstatechange: (() => void) | null = null;
  constructor() {
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
      if (this.state !== "closed") {
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
