import { execFileSync } from "node:child_process";
import { mkdtempSync, readdirSync, readFileSync, rmSync, statSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { describe, expect, it } from "vitest";
import { SFX_NAMES } from "../../client/src/audio/sfx";
import { TRACK_NAMES, TRACKS, loopSeconds } from "../../client/src/audio/music";
import { SAMPLE_RATE, encodeWav, parseWav, peak, renderSfx, renderTrack, rms } from "../audio-preview/render-lib";

describe("audio preview renderer", () => {
  it("renders every sound effect non-silent and within full scale", () => {
    for (const n of SFX_NAMES) {
      const s = renderSfx(n);
      expect(s.length, n).toBeGreaterThan(SAMPLE_RATE * 0.03);
      expect(rms(s), n).toBeGreaterThan(0.002);
      expect(peak(s), n).toBeLessThanOrEqual(1);
    }
  });
  it("renders every track one loop long (the ending once, plus its release tail)", () => {
    for (const n of TRACK_NAMES) {
      const t = TRACKS[n];
      const s = renderTrack(n);
      const loop = Math.round(loopSeconds(t) * SAMPLE_RATE);
      if (t.loop) expect(s.length, n).toBe(loop);
      else {
        expect(s.length, n).toBeGreaterThanOrEqual(loop);
        expect(s.length, n).toBeLessThan(loop + SAMPLE_RATE);
      }
      expect(rms(s), n).toBeGreaterThan(0.005);
      expect(peak(s), n).toBeLessThanOrEqual(1);
    }
  });
  it("is deterministic byte for byte", () => {
    expect(encodeWav(renderTrack("boss"), SAMPLE_RATE)).toEqual(encodeWav(renderTrack("boss"), SAMPLE_RATE));
    expect(encodeWav(renderSfx("death"), SAMPLE_RATE)).toEqual(encodeWav(renderSfx("death"), SAMPLE_RATE));
  });
  it("writes a parseable 16-bit mono 44.1 kHz WAV", () => {
    const s = renderSfx("clear");
    const wav = encodeWav(s, SAMPLE_RATE);
    const h = parseWav(wav);
    expect(h).toEqual({ channels: 1, sampleRate: 44100, bits: 16, dataBytes: s.length * 2, samples: s.length });
    expect(wav.length).toBe(44 + s.length * 2);
    expect(String.fromCharCode(...wav.slice(0, 4))).toBe("RIFF");
    expect(String.fromCharCode(...wav.slice(8, 12))).toBe("WAVE");
  });
  it("the CLI writes one WAV per sound and track into --out", () => {
    const dir = mkdtempSync(join(tmpdir(), "bubble-audio-"));
    try {
      execFileSync(process.execPath, [join(__dirname, "..", "audio-preview", "render.mjs"), "--out", dir], { stdio: "pipe" });
      const files = readdirSync(dir).sort();
      expect(files.length).toBe(SFX_NAMES.length + TRACK_NAMES.length);
      expect(files).toContain("music-main.wav");
      expect(files).toContain("sfx-pop1.wav");
      for (const f of files) expect(parseWav(new Uint8Array(readFileSync(join(dir, f)))).sampleRate).toBe(44100);
      expect(statSync(join(dir, "music-ending.wav")).size).toBeGreaterThan(1000);
    } finally {
      rmSync(dir, { recursive: true, force: true });
    }
  }, 60_000);
});
