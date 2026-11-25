import { FIELD_H, FIELD_W, GAME_LEVELS, TILE } from "@bubble/shared";
import { drawLevelBackground } from "../../client/src/render/renderer";
import { buildSheet } from "../../client/src/render/sprites";

/**
 * Contact sheet page: renders levels `from..to` (query ?from=1&to=13&cols=5&s=1.6) with the client's real tile
 * renderer, plus enemy discs, drift arrows, flags and the round number. Driven by tools/gen-levels/sheet.mjs.
 * `&overview=1` draws small thumbnails with just the round number (and a coloured theme stripe) for a whole-set overview.
 */
const q = new URLSearchParams(location.search);
const from = Number(q.get("from") ?? 1);
const to = Number(q.get("to") ?? GAME_LEVELS.length);
const cols = Number(q.get("cols") ?? 4);
const S = Number(q.get("s") ?? 2);
const overview = q.get("overview") === "1";
const names = (q.get("names") ?? "").split(",");
const COLOR: Record<string, string> = { walker: "#e8b04a", chaser: "#e0524a", thrower: "#5fa8e8", breather: "#e87ab8", bouncer: "#9a7ae8", flyer: "#4ad0c0" };
const LETTER: Record<string, string> = { walker: "W", chaser: "C", thrower: "T", breather: "B", bouncer: "O", flyer: "F" };

const sheet = buildSheet(document);
const list = GAME_LEVELS.filter((l) => l.round >= from && l.round <= to);
const cw = Math.round(FIELD_W * S);
const ch = Math.round(FIELD_H * S);
const pad = overview ? 4 : 10;
const head = overview ? 14 : 22;
const rows = Math.ceil(list.length / cols);
const canvas = document.createElement("canvas");
canvas.width = cols * (cw + pad) + pad;
canvas.height = rows * (ch + head + pad) + pad;
document.body.style.margin = "0";
document.body.style.background = "#14161c";
document.body.append(canvas);
const ctx = canvas.getContext("2d")!;
ctx.imageSmoothingEnabled = false;
ctx.fillStyle = "#14161c";
ctx.fillRect(0, 0, canvas.width, canvas.height);

list.forEach((lv, i) => {
  const x0 = pad + (i % cols) * (cw + pad);
  const y0 = pad + Math.floor(i / cols) * (ch + head + pad);
  ctx.save();
  ctx.translate(x0, y0 + head);
  ctx.scale(S, S);
  drawLevelBackground(ctx, sheet, lv);
  for (const d of lv.drift) {
    ctx.strokeStyle = "rgba(255,255,255,0.55)";
    ctx.lineWidth = 0.7;
    const cx = d.col * TILE + TILE / 2;
    const cy = d.row * TILE + TILE / 2;
    ctx.beginPath();
    ctx.moveTo(cx - d.dx * 2.5, cy - d.dy * 2.5);
    ctx.lineTo(cx + d.dx * 2.5, cy + d.dy * 2.5);
    ctx.stroke();
  }
  for (const e of lv.enemies) {
    const cx = e.col * TILE + TILE / 2;
    const cy = e.row * TILE + TILE / 2;
    ctx.fillStyle = COLOR[e.type] ?? "#fff";
    ctx.beginPath();
    ctx.arc(cx, cy, overview ? 3 : 4.2, 0, Math.PI * 2);
    ctx.fill();
    if (overview) continue;
    ctx.fillStyle = "#000";
    ctx.font = "bold 6px sans-serif";
    ctx.textAlign = "center";
    ctx.textBaseline = "middle";
    ctx.fillText(LETTER[e.type] ?? "?", cx, cy + 0.5);
  }
  ctx.restore();
  ctx.fillStyle = "#dfe3ec";
  ctx.font = overview ? "bold 11px system-ui, sans-serif" : "bold 15px system-ui, sans-serif";
  ctx.textAlign = "left";
  ctx.textBaseline = "middle";
  const flags = lv.flags ? ` [${[lv.flags.waterBubbles ? "water" : "", lv.flags.fireBubbles ? "fire" : "", lv.flags.lightningBubbles ? "lightning" : ""].filter(Boolean).join("+")}]` : "";
  if (overview) {
    ctx.fillText(`${lv.round}  ${names[lv.round - 1] ?? ""}${flags}`, x0, y0 + head / 2);
    return;
  }
  ctx.fillText(`Round ${lv.round}  theme ${lv.theme}  ${names[lv.round - 1] ?? ""}  (${lv.enemies.length} enemies)${flags}`, x0, y0 + head / 2);
});
document.title = "sheet-ready";
