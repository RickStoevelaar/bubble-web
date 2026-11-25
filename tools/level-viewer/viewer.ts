import { BOSS_ARENA, FIELD_H, FIELD_W, GRID_H, GRID_W, LEVELS, SECRET_ROOMS, TEST_LEVEL, TILE } from "@bubble/shared";
import type { LevelData, LevelKind, LintIssue } from "@bubble/shared";
import { drawLevelBackground } from "../../client/src/render/renderer";
import { buildSheet } from "../../client/src/render/sprites";
import { computeOverlay, normalizeLevelJson, parseLevelText } from "./overlay";
import type { Overlay } from "./overlay";

/** Thin UI shell: all the maths lives in overlay.ts and the shared lint library. */

const S = 3; // pixels per game pixel
const $ = <T extends HTMLElement>(id: string): T => document.getElementById(id) as T;
const canvas = $<HTMLCanvasElement>("view");
const ctx = canvas.getContext("2d")!;
const sheet = buildSheet(document);

const ENEMY_COLOR: Record<string, string> = {
  walker: "#e8b04a",
  chaser: "#e0524a",
  thrower: "#5fa8e8",
  breather: "#e87ab8",
  bouncer: "#9a7ae8",
  flyer: "#4ad0c0",
  boss: "#ff3b3b",
  hurry: "#888888",
};

let levels: LevelData[] = LEVELS.map((l) => structuredClone(l));
let source = "built-in LEVELS";
let index = 0;
let current: LevelData | null = null;
let overlay: Overlay | null = null;
let selected: LintIssue | null = null;
let analyseTimer: number | undefined;

const ui = {
  json: $<HTMLTextAreaElement>("json"),
  err: $("parseError"),
  kind: $<HTMLSelectElement>("kind"),
  sample: $<HTMLSelectElement>("sample"),
  roundNum: $<HTMLInputElement>("roundNum"),
  roundList: $<HTMLSelectElement>("roundList"),
  roundCount: $("roundCount"),
  source: $("source"),
  summary: $("summary"),
  issues: $("issues"),
  stats: $("stats"),
  hover: $("hover"),
  exportBox: $<HTMLTextAreaElement>("exportBox"),
  opt: (id: string): boolean => $<HTMLInputElement>(id).checked,
};

function kindOf(level: LevelData): LevelKind {
  const k = ui.kind.value;
  if (k === "normal" || k === "boss" || k === "secret") return k;
  return level.round === 100 ? "boss" : "normal";
}

/** A pasted secret room is recognised by its tiles so the analysis starts where the real room puts its players. */
function secretSpawns(level: LevelData): { col: number; row: number }[] | undefined {
  const room = SECRET_ROOMS.find((r) => r.level.tiles.join("") === level.tiles?.join?.(""));
  return room ? [...room.spawn] : undefined;
}

function px(v: number): number {
  return v * S;
}

function drawArrow(x: number, y: number, dx: number, dy: number): void {
  const len = 9 * S;
  const ex = x + dx * len;
  const ey = y + dy * len;
  ctx.strokeStyle = "#7df";
  ctx.fillStyle = "#7df";
  ctx.lineWidth = 2;
  ctx.beginPath();
  ctx.moveTo(x, y);
  ctx.lineTo(ex, ey);
  ctx.stroke();
  const mag = Math.sqrt(dx * dx + dy * dy);
  if (mag === 0) {
    ctx.beginPath();
    ctx.arc(x, y, 3, 0, Math.PI * 2);
    ctx.fill();
    return;
  }
  const ux = dx / mag;
  const uy = dy / mag;
  ctx.beginPath();
  ctx.moveTo(ex + ux * 5, ey + uy * 5);
  ctx.lineTo(ex - ux * 3 - uy * 4, ey - uy * 3 + ux * 4);
  ctx.lineTo(ex - ux * 3 + uy * 4, ey - uy * 3 - ux * 4);
  ctx.closePath();
  ctx.fill();
}

function render(): void {
  ctx.setTransform(1, 0, 0, 1, 0, 0);
  ctx.imageSmoothingEnabled = false;
  ctx.fillStyle = "#000";
  ctx.fillRect(0, 0, canvas.width, canvas.height);
  if (!current || !overlay) return;
  let tilesOk = true;
  try {
    ctx.save();
    ctx.scale(S, S);
    drawLevelBackground(ctx, sheet, current);
    ctx.restore();
  } catch {
    tilesOk = false;
  }
  if (!tilesOk) return;
  const T = px(TILE);

  if (ui.opt("optGrid")) {
    ctx.lineWidth = 1;
    for (let c = 0; c <= GRID_W; c++) {
      ctx.strokeStyle = c % 4 === 0 ? "rgba(255,255,255,0.28)" : "rgba(255,255,255,0.10)";
      ctx.beginPath();
      ctx.moveTo(c * T + 0.5, 0);
      ctx.lineTo(c * T + 0.5, canvas.height);
      ctx.stroke();
    }
    for (let r = 0; r <= GRID_H; r++) {
      ctx.strokeStyle = r % 4 === 0 ? "rgba(255,255,255,0.28)" : "rgba(255,255,255,0.10)";
      ctx.beginPath();
      ctx.moveTo(0, r * T + 0.5);
      ctx.lineTo(canvas.width, r * T + 0.5);
      ctx.stroke();
    }
    ctx.fillStyle = "rgba(255,255,255,0.55)";
    ctx.font = "9px Consolas, monospace";
    for (let c = 0; c < GRID_W; c += 4) ctx.fillText(String(c), c * T + 2, 9);
    for (let r = 4; r < GRID_H; r += 4) ctx.fillText(String(r), 2, r * T + 9);
  }

  if (ui.opt("optProblems")) {
    // wrap-hazard columns: the open bottom tile and the solid top tile it wraps into
    ctx.fillStyle = "rgba(255,154,31,0.45)";
    ctx.strokeStyle = "#ff9a1f";
    ctx.lineWidth = 2;
    for (const c of overlay.wrapColumns) {
      ctx.fillRect(c * T, 0, T, T);
      ctx.fillRect(c * T, (GRID_H - 1) * T, T, T);
      ctx.strokeRect(c * T + 1, 1, T - 2, T - 2);
      ctx.strokeRect(c * T + 1, (GRID_H - 1) * T + 1, T - 2, T - 2);
    }
    // platforms nobody can reach
    ctx.fillStyle = "rgba(255,59,59,0.5)";
    ctx.strokeStyle = "#ff3b3b";
    for (const r of overlay.unreachableRuns) {
      ctx.fillRect(r.from * T, r.row * T, (r.to - r.from + 1) * T, T);
      ctx.strokeRect(r.from * T + 1, r.row * T + 1, (r.to - r.from + 1) * T - 2, T - 2);
    }
  }

  if (ui.opt("optNodes")) {
    ctx.fillStyle = "rgba(61,220,132,0.8)";
    for (const n of overlay.nodes) ctx.fillRect(px(n.x) - 2, px(n.y + 7) - 3, 5, 3);
    ctx.fillStyle = "#ff3b3b";
    for (const n of overlay.trapped) ctx.fillRect(px(n.x) - 5, px(n.y + 7) - 8, 10, 8);
  }

  if (ui.opt("optDrift")) {
    for (const d of overlay.drift) {
      if (Number.isFinite(d.col) && Number.isFinite(d.row) && Number.isFinite(d.dx) && Number.isFinite(d.dy)) drawArrow(d.col * T + T / 2, d.row * T + T / 2, d.dx, d.dy);
    }
  }

  if (ui.opt("optSpawns")) {
    for (const s of overlay.spawns) {
      const cx = s.col * T + T / 2;
      const cy = s.row * T + T / 2;
      ctx.fillStyle = s.bad ? "#ff3b3b" : s.player === 1 ? "#4aa8ff" : "#ff6bd0";
      ctx.beginPath();
      ctx.moveTo(cx, cy - 12);
      ctx.lineTo(cx + 12, cy);
      ctx.lineTo(cx, cy + 12);
      ctx.lineTo(cx - 12, cy);
      ctx.closePath();
      ctx.fill();
      ctx.strokeStyle = s.bad ? "#fff" : "#000";
      ctx.lineWidth = s.bad ? 2 : 1;
      ctx.stroke();
      ctx.fillStyle = s.bad ? "#fff" : "#000";
      ctx.font = "bold 10px Consolas, monospace";
      ctx.textAlign = "center";
      ctx.textBaseline = "middle";
      ctx.fillText(`P${s.player}`, cx, cy + 1);
    }
  }

  if (ui.opt("optEnemies")) {
    for (const e of overlay.enemies) {
      const cx = e.col * T + T / 2;
      const cy = e.row * T + T / 2;
      const r = e.type === "boss" ? 16 : 10;
      ctx.fillStyle = ENEMY_COLOR[e.type] ?? "#888";
      ctx.beginPath();
      ctx.arc(cx, cy, r, 0, Math.PI * 2);
      ctx.fill();
      ctx.strokeStyle = "#000";
      ctx.lineWidth = 2;
      ctx.stroke();
      ctx.fillStyle = "#000";
      ctx.font = `bold ${r + 2}px Consolas, monospace`;
      ctx.textAlign = "center";
      ctx.textBaseline = "middle";
      ctx.fillText(e.letter, cx, cy + 1);
    }
  }
  ctx.textAlign = "start";
  ctx.textBaseline = "alphabetic";

  if (selected && selected.col !== undefined && selected.row !== undefined) {
    ctx.strokeStyle = "#ffe14d";
    ctx.lineWidth = 3;
    ctx.strokeRect(selected.col * T - 4, selected.row * T - 4, T + 8, T + 8);
  }
}

function showIssues(): void {
  const o = overlay;
  ui.issues.replaceChildren();
  if (!o) return;
  const errors = o.issues.filter((i) => i.severity === "error").length;
  const warns = o.issues.length - errors;
  ui.summary.textContent = errors > 0 ? `${errors} error(s), ${warns} warning(s)` : warns > 0 ? `clean, ${warns} warning(s)` : "clean: no issues";
  ui.summary.className = errors > 0 ? "bad" : "ok";
  for (const issue of o.issues) {
    const li = document.createElement("li");
    li.className = issue.severity + (issue === selected ? " sel" : "");
    const code = document.createElement("code");
    code.textContent = issue.code;
    li.append(code, ` ${issue.message} `);
    if (issue.col !== undefined || issue.row !== undefined) {
      const loc = document.createElement("span");
      loc.className = "loc";
      loc.textContent = `(col ${issue.col ?? "?"}, row ${issue.row ?? "?"})`;
      li.append(loc);
    }
    li.addEventListener("click", () => {
      selected = selected === issue ? null : issue;
      showIssues();
      render();
    });
    ui.issues.append(li);
  }
}

function showStats(): void {
  ui.stats.replaceChildren();
  const s = overlay?.stats;
  if (!s) return;
  const types = Object.entries(s.enemiesByType)
    .map(([t, n]) => `${t} ${n}`)
    .join(", ");
  const rows: [string, string][] = [
    ["enemies", String(s.enemyCount)],
    ["by type", types || "-"],
    ["platform runs", String(s.platformRuns)],
    ["solid ratio", `${(s.solidRatio * 100).toFixed(1)}%`],
    ["open bottom cols", String(s.openBottomColumns)],
    ["standing nodes", String(s.standingNodes)],
  ];
  for (const [k, v] of rows) {
    const tr = document.createElement("tr");
    const a = document.createElement("td");
    const b = document.createElement("td");
    a.textContent = k;
    b.textContent = v;
    tr.append(a, b);
    ui.stats.append(tr);
  }
}

/** Reparse the textarea now; schedule the (slow) lint overlay shortly after the last keystroke. */
function onEdit(): void {
  const r = parseLevelText(ui.json.value);
  if (r.error || !r.level) {
    ui.err.textContent = r.error ?? "";
    return;
  }
  ui.err.textContent = "";
  current = r.level;
  levels[index] = r.level;
  refreshRoundList();
  selected = null;
  overlay = null;
  ui.summary.textContent = "analysing...";
  ui.summary.className = "";
  render();
  window.clearTimeout(analyseTimer);
  analyseTimer = window.setTimeout(analyse, 150);
}

function analyse(): void {
  if (!current) return;
  const kind = kindOf(current);
  overlay = computeOverlay(current, { kind, ...(kind === "secret" ? { spawns: secretSpawns(current) } : {}) });
  showIssues();
  showStats();
  render();
}

function setText(level: LevelData): void {
  ui.json.value = normalizeLevelJson(level);
  onEdit();
}

function refreshRoundList(): void {
  ui.roundList.replaceChildren();
  levels.forEach((l, i) => {
    const o = document.createElement("option");
    const n = Array.isArray(l?.enemies) ? l.enemies.length : 0;
    o.value = String(i);
    o.textContent = `round ${l?.round ?? i + 1} - ${n} enem${n === 1 ? "y" : "ies"}`;
    ui.roundList.append(o);
  });
  ui.roundList.value = String(index);
  ui.roundCount.textContent = `of ${levels.length}`;
  ui.roundNum.max = String(levels.length);
  ui.roundNum.value = String(index + 1);
  ui.source.textContent = `source: ${source}`;
}

function goto(i: number): void {
  if (levels.length === 0) return;
  index = Math.max(0, Math.min(levels.length - 1, Math.floor(i)));
  refreshRoundList();
  const lv = levels[index];
  if (lv && typeof lv === "object") setText(lv);
}

function loadLevels(list: unknown, name: string): boolean {
  if (!Array.isArray(list) || list.length === 0) return false;
  levels = list as LevelData[];
  source = name;
  goto(0);
  return true;
}

// --- wiring ---
ui.json.addEventListener("input", onEdit);
ui.kind.addEventListener("change", analyse);
for (const id of ["optGrid", "optNodes", "optProblems", "optEnemies", "optDrift", "optSpawns"]) $(id).addEventListener("change", render);
$("prev").addEventListener("click", () => goto(index - 1));
$("next").addEventListener("click", () => goto(index + 1));
ui.roundNum.addEventListener("change", () => goto(Number(ui.roundNum.value) - 1));
ui.roundList.addEventListener("change", () => goto(Number(ui.roundList.value)));
ui.sample.addEventListener("change", () => {
  const v = ui.sample.value;
  const level = v === "test" ? TEST_LEVEL : v === "boss" ? BOSS_ARENA : SECRET_ROOMS.find((r) => r.word === v)?.level;
  if (level) {
    ui.kind.value = v === "boss" ? "boss" : v === "test" ? "normal" : "secret";
    setText(structuredClone(level));
  }
});
$("exportBtn").addEventListener("click", () => {
  const r = parseLevelText(ui.json.value);
  ui.exportBox.value = r.level ? normalizeLevelJson(r.level) : `/* ${r.error} */\n`;
});
$("copyBtn").addEventListener("click", () => {
  ui.exportBox.select();
  const text = ui.exportBox.value;
  if (navigator.clipboard) void navigator.clipboard.writeText(text).catch(() => document.execCommand("copy"));
  else document.execCommand("copy");
});
$<HTMLInputElement>("importFile").addEventListener("change", (ev) => {
  const f = (ev.target as HTMLInputElement).files?.[0];
  if (!f) return;
  void f.text().then((text) => {
    try {
      const data: unknown = JSON.parse(text);
      if (!loadLevels(Array.isArray(data) ? data : [data], f.name)) ui.err.textContent = "That file holds no levels";
    } catch (e) {
      ui.err.textContent = `Invalid JSON in ${f.name}: ${e instanceof Error ? e.message : String(e)}`;
    }
  });
});
window.addEventListener("keydown", (ev) => {
  const t = ev.target as HTMLElement | null;
  if (t && (t.tagName === "TEXTAREA" || (t.tagName === "INPUT" && (t as HTMLInputElement).type !== "checkbox") || t.tagName === "SELECT")) return;
  if (ev.key === "ArrowLeft") goto(index - 1);
  else if (ev.key === "ArrowRight") goto(index + 1);
  else if (ev.key === "PageUp") goto(index - 10);
  else if (ev.key === "PageDown") goto(index + 10);
  else return;
  ev.preventDefault();
});
canvas.addEventListener("mousemove", (ev) => {
  const b = canvas.getBoundingClientRect();
  const col = Math.floor(((ev.clientX - b.left) * (FIELD_W / b.width)) / TILE);
  const row = Math.floor(((ev.clientY - b.top) * (FIELD_H / b.height)) / TILE);
  const ch = current?.tiles?.[row]?.[col];
  ui.hover.textContent = col >= 0 && col < GRID_W && row >= 0 && row < GRID_H ? `col ${col}, row ${row}  ${ch === "#" ? "solid" : "empty"}` : "";
});

// Start with the batch served next to the page, falling back to the built-in levels.
refreshRoundList();
goto(0);
void fetch("./levels.json")
  .then((r) => (r.ok ? r.json() : Promise.reject(new Error(String(r.status)))))
  .then((data: unknown) => void loadLevels(data, "levels.json"))
  .catch(() => undefined);
