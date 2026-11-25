import { TRACKS, type TrackName } from "./music";
import { Scheduler, TICK_MS } from "./scheduler";
import { MIX, SFX, type SfxName } from "./sfx";
import { Chip } from "./synth";

/** Live oscillator/noise voices, all sources together. */
export const MAX_TOTAL_VOICES = 24;
/** Live voices sound effects may occupy (the rest is left for the music). */
export const MAX_SFX_VOICES = 16;
export const STORAGE_KEY = "bubble.audio";

/** The surface the rest of the client uses; `NULL_AUDIO` implements it with no-ops. */
export interface AudioApi {
  /** Call from inside a user gesture: resumes the context and plays a silent buffer (iOS). Safe to repeat. */
  unlock(): void;
  /** True once the context is actually running. */
  isRunning(): boolean;
  /** Calls `cb` (once) as soon as the context is running; immediately if it already is. */
  onUnlocked(cb: () => void): void;
  playSfx(name: SfxName): void;
  /** The track that should play; remembered while locked and started after unlock. null = silence. */
  setMusic(track: TrackName | null): void;
  setMuted(m: boolean): void;
  isMuted(): boolean;
  setVolume(v: number): void;
  getVolume(): number;
  /** Page hidden: stop all voices and suspend the context. */
  suspend(): void;
  /** Page visible again (only does anything once unlocked). */
  resume(): void;
  dispose(): void;
}

export interface Timers {
  setInterval(fn: () => void, ms: number): unknown;
  clearInterval(id: unknown): void;
}

export interface AudioDeps {
  /** `null` forces "no WebAudio"; undefined uses the global (or webkit-prefixed) constructor. */
  AudioContextCtor?: (new () => AudioContext) | null;
  timers?: Timers;
  storage?: Pick<Storage, "getItem" | "setItem">;
  /** Clock for the unlock debounce (ms). */
  now?: () => number;
}

/** Rapid gestures inside this window share one resume() call. */
const UNLOCK_DEBOUNCE_MS = 250;

function defaultCtor(): (new () => AudioContext) | null {
  const g = globalThis as unknown as { AudioContext?: new () => AudioContext; webkitAudioContext?: new () => AudioContext };
  return g.AudioContext ?? g.webkitAudioContext ?? null;
}

function defaultStorage(): Pick<Storage, "getItem" | "setItem"> | undefined {
  try {
    return globalThis.localStorage;
  } catch {
    return undefined;
  }
}

export class AudioSys implements AudioApi {
  private readonly sfx: Chip;
  private readonly music: Chip;
  private readonly master: GainNode;
  private readonly sched: Scheduler;
  private readonly lastStart = new Map<string, number>();
  private readonly waiters: (() => void)[] = [];
  private timer: unknown = null;
  private lastResumeAt = -Infinity;
  private unlocked = false;
  private hidden = false;
  private muted = false;
  private volume: number = MIX.defaultVolume;
  private desired: TrackName | null = null;
  /** A play-once track that already played: do not restart it on unmute/unlock. */
  private playedOnce: TrackName | null = null;
  private disposed = false;

  /** null when WebAudio is unavailable or the context cannot be built. */
  static create(deps: AudioDeps = {}): AudioSys | null {
    const Ctor = deps.AudioContextCtor === undefined ? defaultCtor() : deps.AudioContextCtor;
    if (!Ctor) return null;
    let ctx: AudioContext;
    try {
      ctx = new Ctor();
    } catch {
      return null;
    }
    try {
      return new AudioSys(ctx, deps);
    } catch {
      return null;
    }
  }

  private constructor(
    private readonly ctx: AudioContext,
    private readonly deps: AudioDeps,
  ) {
    this.timers = deps.timers ?? { setInterval: (f, ms) => globalThis.setInterval(f, ms), clearInterval: (i) => globalThis.clearInterval(i as never) };
    this.storage = deps.storage ?? defaultStorage();
    this.nowMs = deps.now ?? (() => Date.now());
    this.loadPrefs();

    this.master = ctx.createGain();
    const comp = ctx.createDynamicsCompressor();
    this.master.connect(comp);
    comp.connect(ctx.destination);
    const sfxBus = ctx.createGain();
    sfxBus.gain.value = MIX.sfx;
    sfxBus.connect(this.master);
    const musicBus = ctx.createGain();
    musicBus.gain.value = MIX.music;
    musicBus.connect(this.master);
    this.sfx = new Chip(ctx, sfxBus);
    this.music = new Chip(ctx, musicBus);
    this.sched = new Scheduler({ play: (s, t) => this.music.play(s, t), stopAll: () => this.music.stopAll() }, ctx);
    this.applyGain();
    ctx.onstatechange = () => this.sync();
  }

  private readonly timers: Timers;
  private readonly storage: Pick<Storage, "getItem" | "setItem"> | undefined;
  private readonly nowMs: () => number;

  // --- AudioApi ---------------------------------------------------------------------------------

  unlock(): void {
    if (this.disposed) return;
    this.unlocked = true;
    const ctx = this.ctx;
    if (ctx.state === "running") {
      this.sync();
      return;
    }
    const now = this.nowMs();
    if (now - this.lastResumeAt < UNLOCK_DEBOUNCE_MS) return;
    this.lastResumeAt = now;
    // Inside the gesture: resume, and play a one-sample silent buffer (what finally unlocks iOS Safari).
    try {
      const p = ctx.resume();
      void p?.then(() => this.sync(), () => undefined);
    } catch {
      /* stays locked */
    }
    try {
      const src = ctx.createBufferSource();
      src.buffer = ctx.createBuffer(1, 1, 22050);
      src.connect(ctx.destination);
      src.onended = () => src.disconnect();
      src.start(0);
    } catch {
      /* best effort */
    }
  }

  isRunning(): boolean {
    return !this.disposed && this.ctx.state === "running";
  }

  onUnlocked(cb: () => void): void {
    if (this.isRunning()) cb();
    else this.waiters.push(cb);
  }

  playSfx(name: SfxName): void {
    if (!this.ready()) return;
    const def = SFX[name];
    if (!def) return;
    const n = def.voices.length;
    if (this.sfx.count + n > MAX_SFX_VOICES || this.sfx.count + this.music.count + n > MAX_TOTAL_VOICES) return;
    const now = this.ctx.currentTime;
    const key = def.group ?? name;
    const t = Math.max(now + 0.005, (this.lastStart.get(key) ?? -Infinity) + def.gap);
    if (t - now > def.maxDelay) return;
    this.lastStart.set(key, t);
    for (const v of def.voices) this.sfx.play(v, t);
    this.ensureTimer();
  }

  setMusic(track: TrackName | null): void {
    if (this.disposed) return;
    if (track === this.desired) return;
    this.desired = track;
    this.playedOnce = null;
    this.sync();
  }

  setMuted(m: boolean): void {
    if (this.disposed || m === this.muted) return;
    this.muted = m;
    this.savePrefs();
    this.applyGain();
    if (m) {
      this.sched.stop();
      this.music.stopAll();
      this.sfx.stopAll();
    }
    this.sync();
  }

  isMuted(): boolean {
    return this.muted;
  }

  setVolume(v: number): void {
    this.volume = Math.min(1, Math.max(0, Number.isFinite(v) ? v : MIX.defaultVolume));
    this.savePrefs();
    this.applyGain();
  }

  getVolume(): number {
    return this.volume;
  }

  suspend(): void {
    if (this.disposed) return;
    this.hidden = true;
    this.silence();
    this.stopTimer();
    try {
      void this.ctx.suspend()?.catch(() => undefined);
    } catch {
      /* ignore */
    }
  }

  resume(): void {
    if (this.disposed) return;
    this.hidden = false;
    if (!this.unlocked) return;
    try {
      void this.ctx.resume()?.then(() => this.sync(), () => undefined);
    } catch {
      /* ignore */
    }
  }

  dispose(): void {
    if (this.disposed) return;
    this.silence();
    this.stopTimer();
    this.disposed = true;
    this.waiters.length = 0;
    this.ctx.onstatechange = null;
    try {
      void this.ctx.close()?.catch(() => undefined);
    } catch {
      /* ignore */
    }
  }

  // --- internals --------------------------------------------------------------------------------

  /** Number of live voices (music + sound effects). */
  liveVoices(): number {
    return this.sfx.count + this.music.count;
  }

  private ready(): boolean {
    return !this.disposed && this.unlocked && !this.muted && !this.hidden && this.ctx.state === "running";
  }

  private silence(): void {
    this.sched.stop();
    this.music.stopAll(0, true);
    this.sfx.stopAll(0, true);
  }

  /** Brings the scheduler in line with (desired track, ready) and wakes unlock waiters. */
  private sync(): void {
    if (this.disposed) return;
    if (this.ctx.state === "running" && this.waiters.length > 0) {
      for (const w of this.waiters.splice(0)) w();
    }
    if (!this.ready()) return;
    const want = this.desired;
    if (want === null) {
      if (this.sched.track) this.sched.stop();
    } else if (this.sched.track?.name !== want && this.playedOnce !== want) {
      this.sched.start(TRACKS[want]);
      this.ensureTimer();
    }
  }

  private applyGain(): void {
    const g = this.muted ? 0 : MIX.master * this.volume;
    this.master.gain.setTargetAtTime(g, this.ctx.currentTime, 0.01);
  }

  private ensureTimer(): void {
    if (this.timer === null) this.timer = this.timers.setInterval(() => this.tick(), TICK_MS);
  }

  private stopTimer(): void {
    if (this.timer !== null) {
      this.timers.clearInterval(this.timer);
      this.timer = null;
    }
  }

  private tick(): void {
    this.sfx.sweep();
    this.music.sweep();
    if (this.ready()) this.sched.tick();
    if (this.sched.finished && this.sched.track) {
      this.playedOnce = this.sched.track.name;
    }
    if (!this.sched.playing && this.sfx.count + this.music.count === 0) this.stopTimer();
  }

  private loadPrefs(): void {
    try {
      const raw = this.storage?.getItem(STORAGE_KEY);
      if (!raw) return;
      const p = JSON.parse(raw) as { muted?: unknown; volume?: unknown };
      if (typeof p.muted === "boolean") this.muted = p.muted;
      if (typeof p.volume === "number" && Number.isFinite(p.volume)) this.volume = Math.min(1, Math.max(0, p.volume));
    } catch {
      /* defaults */
    }
  }

  private savePrefs(): void {
    try {
      this.storage?.setItem(STORAGE_KEY, JSON.stringify({ muted: this.muted, volume: this.volume }));
    } catch {
      /* not remembered */
    }
  }
}
