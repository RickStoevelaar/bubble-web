import { readdirSync, readFileSync, statSync } from "node:fs";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";
import { describe, expect, it } from "vitest";

const here = dirname(fileURLToPath(import.meta.url));

function sources(dir: string): string[] {
  const out: string[] = [];
  for (const name of readdirSync(dir)) {
    const p = join(dir, name);
    if (statSync(p).isDirectory()) out.push(...sources(p));
    else if (/\.(ts|tsx|mjs|js)$/.test(name)) out.push(p);
  }
  return out;
}

/** Strips comments and string literals in one left-to-right pass so only code identifiers remain. */
const TOKEN = /\/\*[\s\S]*?\*\/|\/\/[^\n]*|"(?:[^"\\\n]|\\.)*"|'(?:[^'\\\n]|\\.)*'|`(?:[^`\\]|\\.)*`/g;
const code = (src: string): string => src.replace(TOKEN, (m) => (m.startsWith("/") ? "" : '""'));

describe("production code uses the real level set", () => {
  it("scanner sanity: it sees LEVELS in code but not in comments, strings or GAME_LEVELS", () => {
    expect(/\bLEVELS\b/.test(code("import { LEVELS } from 'x';"))).toBe(true);
    expect(/\bLEVELS\b/.test(code("const a = LEVELS[0]; // done"))).toBe(true);
    expect(/\bLEVELS\b/.test(code("// LEVELS\n/* LEVELS */ const a = 'LEVELS' + \"LEVELS\";"))).toBe(false);
    expect(/\bLEVELS\b/.test(code("const x = GAME_LEVELS;"))).toBe(false);
  });

  it.each(["server/src", "client/src"])("no file under %s references the test-fixture symbol LEVELS", (rel) => {
    const files = sources(join(here, "../..", rel));
    expect(files.length).toBeGreaterThan(3);
    const offenders = files.filter((f) => /\bLEVELS\b/.test(code(readFileSync(f, "utf8"))));
    expect(offenders).toEqual([]);
  });
});
