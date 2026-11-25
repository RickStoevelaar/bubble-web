import { mkdirSync, writeFileSync } from "node:fs";
import { join, resolve } from "node:path";
import { SAMPLE_RATE, encodeWav, peak, renderAll, rms } from "./render-lib";

/** Renders every sound effect and music track to WAV files in `--out` (default ./audio-preview). */
export function main(argv: string[]): void {
  const i = argv.indexOf("--out");
  const out = resolve(i >= 0 && argv[i + 1] ? argv[i + 1]! : "audio-preview");
  mkdirSync(out, { recursive: true });
  let total = 0;
  for (const { file, samples } of renderAll()) {
    const wav = encodeWav(samples, SAMPLE_RATE);
    writeFileSync(join(out, file), wav);
    total += wav.length;
    console.log(`${file.padEnd(22)} ${(samples.length / SAMPLE_RATE).toFixed(2).padStart(6)} s  ${String(wav.length).padStart(8)} bytes  rms ${rms(samples).toFixed(3)}  peak ${peak(samples).toFixed(2)}`);
  }
  console.log(`wrote ${out} (${total} bytes)`);
}
