import { spawnSync } from "node:child_process";
import { mkdtempSync, rmSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { join, resolve } from "node:path";
import { buildSync } from "esbuild";

export interface Probe {
  stdout: string;
  timedOut: boolean;
  /** status, signal and stderr of the child, for assertion messages when it fails without timing out. */
  why: string;
}

/**
 * A runaway loop cannot be interrupted inside vitest (a sync hang ignores test timeouts), so the probe runs in a
 * child node process with a hard kill timeout. The shared sources are bundled with esbuild (already a dev dependency).
 */
export function runProbe(body: string): Probe {
  const dir = mkdtempSync(join(tmpdir(), "phys-term-"));
  const out = join(dir, "probe.mjs");
  try {
    buildSync({
      stdin: { contents: `import * as S from "./index";\n${body}`, resolveDir: resolve(__dirname, "../../src"), loader: "ts" },
      bundle: true,
      format: "esm",
      platform: "node",
      outfile: out,
      logLevel: "silent",
    });
    writeFileSync(join(dir, "package.json"), '{"type":"module"}');
    const r = spawnSync(process.execPath, [out], { timeout: 8000, encoding: "utf8" });
    return {
      stdout: r.stdout ?? "",
      timedOut: r.error !== undefined && (r.error as NodeJS.ErrnoException).code === "ETIMEDOUT",
      why: `status=${r.status} signal=${r.signal} stderr=${(r.stderr ?? "").slice(0, 600)}`,
    };
  } finally {
    rmSync(dir, { recursive: true, force: true });
  }
}
