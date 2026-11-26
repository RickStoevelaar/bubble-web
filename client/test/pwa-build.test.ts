import { execFileSync } from "node:child_process";
import { existsSync, readFileSync } from "node:fs";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";
import { beforeAll, describe, expect, it } from "vitest";

const root = join(dirname(fileURLToPath(import.meta.url)), "..");
const dist = join(root, "dist");
const build = () => execFileSync(process.execPath, [join(root, "build.mjs")], { stdio: "pipe" });
const idOf = () => /const BUILD_ID = "([0-9a-f]{12})"/.exec(readFileSync(join(dist, "sw.js"), "utf8"))?.[1];

function pngSize(file: string): [number, number] {
  const b = readFileSync(file);
  expect(b.subarray(0, 8).toString("hex")).toBe("89504e470d0a1a0a");
  expect(b.subarray(12, 16).toString("ascii")).toBe("IHDR");
  return [b.readUInt32BE(16), b.readUInt32BE(20)];
}

describe("client build output (PWA files)", () => {
  // runs the real build, the one the Dockerfile runs
  beforeAll(() => {
    build();
  }, 120_000);

  it("copies manifest, sw.js, icons and index.html into dist", () => {
    for (const f of ["index.html", "main.js", "sw.js", "manifest.webmanifest", "icon.svg", "icon-180.png", "icon-192.png", "icon-512.png", "icon-maskable-512.png"]) {
      expect(existsSync(join(dist, f)), f).toBe(true);
    }
  });

  it("has a valid manifest whose icons exist with the declared sizes", () => {
    const m = JSON.parse(readFileSync(join(dist, "manifest.webmanifest"), "utf8"));
    expect(m).toMatchObject({ name: "Bubble Web", short_name: "Bubble Web", start_url: "/", scope: "/", display: "standalone" });
    expect(m.background_color).toMatch(/^#/);
    expect(m.theme_color).toBe(m.background_color);
    const kinds = new Set<string>();
    for (const icon of m.icons as { src: string; sizes: string; type: string; purpose: string }[]) {
      expect(icon.src.startsWith("/")).toBe(true);
      const file = join(dist, icon.src.slice(1));
      expect(existsSync(file), icon.src).toBe(true);
      if (icon.type === "image/png") {
        const [w, h] = pngSize(file);
        expect(`${w}x${h}`).toBe(icon.sizes);
        kinds.add(`${icon.sizes}:${icon.purpose}`);
      }
    }
    expect(kinds).toContain("192x192:any");
    expect(kinds).toContain("512x512:any");
    expect(kinds).toContain("512x512:maskable");
    expect(pngSize(join(dist, "icon-180.png"))).toEqual([180, 180]);
  });

  it("links the manifest and the iOS meta tags from index.html", () => {
    const html = readFileSync(join(dist, "index.html"), "utf8");
    expect(html).toMatch(/<link rel="manifest" href="\/manifest.webmanifest"/);
    expect(html).toMatch(/<meta name="theme-color" content="#000000"/);
    expect(html).toMatch(/rel="apple-touch-icon" href="\/icon-180.png"/);
    expect(html).toMatch(/apple-mobile-web-app-capable/);
    expect(html).toMatch(/apple-mobile-web-app-title/);
    expect(html).toMatch(/apple-mobile-web-app-status-bar-style" content="black"/);
    expect(html).toContain("viewport-fit=cover");
  });

  it("stamps sw.js with a deterministic build id", () => {
    const sw = readFileSync(join(dist, "sw.js"), "utf8");
    expect(sw).not.toContain("__BUILD_ID__");
    const id = idOf();
    expect(id).toBeTruthy();
    build();
    expect(idOf()).toBe(id);
  }, 120_000);
});
