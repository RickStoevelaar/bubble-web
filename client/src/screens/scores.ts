import { FIELD_H, FIELD_W } from "@bubble/shared";
import { drawText, textWidth } from "../render/renderer";
import type { SpriteSheet } from "../render/sprites";
import { clip, drawCentered, fontSafe } from "./text";

/** One row of the public table (exactly what GET /scores returns). */
export interface ScoreRow {
  names: string[];
  score: number;
  round: number;
  date: string;
}

export const PER_PAGE = 10;
export const MAX_ROWS = 20;
const NAME_GLYPHS = 18;

export type ScoresData = { status: "loading" } | { status: "failed" } | { status: "ready"; rows: ScoreRow[] };

/** The player's own finished run, when the client knows it (names in seat order). */
export interface OwnRun {
  names?: string[];
  score: number;
  round: number;
}

/**
 * GET /scores. Any failure (network, bad status, bad JSON, wrong shape) is `failed`: the title and the scores
 * screen then just say there are no scores. Entries are re-validated here, the server is not trusted blindly.
 */
export async function fetchScores(fetchFn: typeof fetch = fetch, url = "/scores"): Promise<ScoresData> {
  try {
    const res = await fetchFn(url, { cache: "no-store" });
    if (!res.ok) return { status: "failed" };
    return { status: "ready", rows: parseScores(await res.json()) };
  } catch {
    return { status: "failed" };
  }
}

export function parseScores(body: unknown): ScoreRow[] {
  const list = typeof body === "object" && body !== null ? (body as { scores?: unknown }).scores : undefined;
  if (!Array.isArray(list)) return [];
  const rows: ScoreRow[] = [];
  for (const e of list) {
    if (typeof e !== "object" || e === null) continue;
    const r = e as Partial<ScoreRow>;
    if (!Array.isArray(r.names) || typeof r.score !== "number" || !Number.isFinite(r.score)) continue;
    if (typeof r.round !== "number" || !Number.isFinite(r.round)) continue;
    rows.push({
      names: r.names.filter((n): n is string => typeof n === "string").slice(0, 2),
      score: r.score,
      round: r.round,
      date: typeof r.date === "string" ? r.date : "",
    });
    if (rows.length >= MAX_ROWS) break;
  }
  return rows;
}

export function pageCount(n: number): number {
  return Math.max(1, Math.ceil(n / PER_PAGE));
}

/** Index of the row that is the player's own run, or -1. Names are compared as the font would show them. */
export function matchOwn(rows: readonly ScoreRow[], own: OwnRun | null | undefined): number {
  if (!own) return -1;
  const key = (names: readonly string[]) => names.map(fontSafe).join("&");
  return rows.findIndex(
    (r) => r.score === own.score && r.round === own.round && (own.names === undefined || key(r.names) === key(own.names)),
  );
}

/** Names joined for display, font-safe and clipped; none at all is "PLAYER". The font has no "&", so "+" joins them. */
export function namesText(names: readonly string[]): string {
  const joined = names.map(fontSafe).filter((n) => n.trim() !== "").join("+");
  return clip(joined === "" ? "PLAYER" : joined, NAME_GLYPHS);
}

export function scoreText(n: number): string {
  return String(Math.max(0, Math.floor(n)));
}

// --- input ---------------------------------------------------------------

export const BACK_BOX = { x: 8, y: 200, w: 48, h: 16 };

export type ScoresAction = "back" | "next" | "prev" | null;

/** A tap in game coordinates: the BACK box goes back, anywhere else pages on. */
export function scoresTap(gx: number, gy: number): ScoresAction {
  if (gx >= BACK_BOX.x && gx <= BACK_BOX.x + BACK_BOX.w && gy >= BACK_BOX.y && gy <= BACK_BOX.y + BACK_BOX.h) return "back";
  return "next";
}

export function scoresKey(key: string): ScoresAction {
  switch (key) {
    case "Escape":
    case "Backspace":
    case "Enter":
      return "back";
    case "ArrowRight":
    case "ArrowDown":
    case "PageDown":
    case " ":
      return "next";
    case "ArrowLeft":
    case "ArrowUp":
    case "PageUp":
      return "prev";
    default:
      return null;
  }
}

/** Page after applying a paging action (wraps around). */
export function turnPage(page: number, action: ScoresAction, total: number): number {
  const pages = pageCount(total);
  if (action === "next") return (page + 1) % pages;
  if (action === "prev") return (page + pages - 1) % pages;
  return page;
}

// --- drawing -------------------------------------------------------------

export interface ScoresModel {
  data: ScoresData;
  page: number;
  own?: OwnRun | null;
  /** Milliseconds, drives the blink of the highlighted row. */
  now?: number;
}

export function drawScores(ctx: CanvasRenderingContext2D, sheet: SpriteSheet, m: ScoresModel): void {
  ctx.fillStyle = "#10142a";
  ctx.fillRect(0, 0, FIELD_W, FIELD_H);
  drawCentered(ctx, sheet, "HIGH SCORES", 8);
  ctx.fillStyle = "#3a4a8a";
  ctx.fillRect(8, 20, FIELD_W - 16, 1);

  if (m.data.status === "loading") {
    drawCentered(ctx, sheet, "LOADING", 100);
  } else if (m.data.status === "failed" || m.data.rows.length === 0) {
    drawCentered(ctx, sheet, "NO SCORES YET", 100);
  } else {
    const rows = m.data.rows;
    const pages = pageCount(rows.length);
    const page = Math.min(Math.max(0, m.page), pages - 1);
    const own = matchOwn(rows, m.own);
    drawText(ctx, sheet, "NO", 8, 26);
    drawText(ctx, sheet, "NAMES", 26, 26);
    drawText(ctx, sheet, "SCORE", 142, 26);
    drawText(ctx, sheet, "RD", 212, 26);
    for (let i = 0; i < PER_PAGE; i++) {
      const idx = page * PER_PAGE + i;
      const r = rows[idx];
      if (!r) break;
      const y = 38 + i * 14;
      if (idx === own) {
        ctx.fillStyle = "#3b5bdb";
        ctx.fillRect(4, y - 3, FIELD_W - 8, 13);
      }
      drawText(ctx, sheet, String(idx + 1), 8, y);
      drawText(ctx, sheet, namesText(r.names), 26, y);
      const sc = scoreText(r.score);
      drawText(ctx, sheet, sc, 190 - textWidth(sc), y);
      drawText(ctx, sheet, String(Math.floor(r.round)), 212, y);
    }
    if (pages > 1) drawText(ctx, sheet, `PAGE ${page + 1}-${pages}`, 150, 204);
    if (own >= 0) drawText(ctx, sheet, "YOU", 100, 204);
  }
  // BACK button (tap or Escape)
  ctx.fillStyle = "#3b5bdb";
  ctx.fillRect(BACK_BOX.x, BACK_BOX.y, BACK_BOX.w, BACK_BOX.h);
  ctx.fillStyle = "#10142a";
  ctx.fillRect(BACK_BOX.x + 1, BACK_BOX.y + 1, BACK_BOX.w - 2, BACK_BOX.h - 2);
  drawText(ctx, sheet, "BACK", BACK_BOX.x + 12, BACK_BOX.y + 4);
}
