import { mkdirSync, readFileSync, renameSync, statSync, unlinkSync, writeFileSync } from "node:fs";
import { dirname, join } from "node:path";
import type { GameState } from "@bubble/shared";
import type { Persist } from "./room";

/** Reads JSON from `file`; returns `fallback` when it is missing or corrupt. Never throws. */
export function loadJson<T>(file: string, fallback: T): T {
  try {
    return JSON.parse(readFileSync(file, "utf8")) as T;
  } catch {
    return fallback;
  }
}

/** Atomic write: serialize to a tmp file in the same directory, then rename over the target. */
export function saveJson(file: string, data: unknown): void {
  mkdirSync(dirname(file), { recursive: true });
  const tmp = `${file}.${process.pid}.tmp`;
  try {
    writeFileSync(tmp, JSON.stringify(data));
    renameSync(tmp, file);
  } catch (err) {
    try {
      unlinkSync(tmp);
    } catch {
      /* tmp may not exist */
    }
    throw err;
  }
}

export function dataDir(env: NodeJS.ProcessEnv = process.env): string {
  return env.DATA_DIR || "./data";
}

const SAFE_CODE = /^[A-Z0-9]{1,12}$/;

function roomFile(dir: string, code: string): string {
  if (!SAFE_CODE.test(code)) throw new Error(`unsafe room code: ${code}`);
  return join(dir, `room-${code}.json`);
}

/** Room persistence as one JSON file per room code under `dir`. */
export function createFilePersist(dir: string): Persist {
  return {
    load: (code) => loadJson<GameState | undefined>(roomFile(dir, code), undefined),
    save: (code, state) => saveJson(roomFile(dir, code), state),
    remove: (code) => {
      let first: unknown;
      for (const f of [roomFile(dir, code), seatsFile(dir, code)]) {
        try {
          unlinkSync(f);
        } catch (err) {
          // both files are always attempted; the first real failure is rethrown afterwards
          if (!(err instanceof Error) || (err as NodeJS.ErrnoException).code !== "ENOENT") first ??= err;
        }
      }
      if (first !== undefined) throw first;
    },
    loadSeats: (code) => {
      const file = seatsFile(dir, code);
      try {
        if (statSync(file).size > MAX_SEATS_FILE_BYTES) return undefined;
      } catch {
        return undefined;
      }
      return loadJson<unknown>(file, undefined);
    },
    saveSeats: (code, seats) => saveJson(seatsFile(dir, code), seats),
  };
}

/** Seat records are two tokens and two short names; anything bigger is not ours and is ignored unread. */
export const MAX_SEATS_FILE_BYTES = 1024;

function seatsFile(dir: string, code: string): string {
  if (!SAFE_CODE.test(code)) throw new Error(`unsafe room code: ${code}`);
  return join(dir, `room-${code}.seats.json`);
}

/** One finished run: a team score (co-op household game), the round reached and when it ended. */
export interface ScoreEntry {
  names: string[];
  score: number;
  round: number;
  date: string;
}

export const HIGHSCORE_CAP = 20;

function validEntry(e: unknown): e is ScoreEntry {
  if (typeof e !== "object" || e === null) return false;
  const r = e as Partial<ScoreEntry>;
  return (
    Array.isArray(r.names) &&
    r.names.every((n) => typeof n === "string") &&
    typeof r.score === "number" &&
    Number.isFinite(r.score) &&
    typeof r.round === "number" &&
    Number.isFinite(r.round) &&
    typeof r.date === "string"
  );
}

/** Pure: a new list with `entry` inserted, sorted by score descending (ties: newer first), cut to `cap`. */
export function insertScore(list: readonly ScoreEntry[], entry: ScoreEntry, cap: number): ScoreEntry[] {
  // The new entry is the newest by construction, so it goes before existing entries of equal score.
  const out = [...list];
  let i = 0;
  while (i < out.length && out[i]!.score > entry.score) i++;
  out.splice(i, 0, entry);
  return out.slice(0, cap);
}

/**
 * The high-score table in one JSON file. Every record() re-reads the file and rewrites it atomically in
 * one synchronous step, so rooms (even holding separate instances) never overwrite each other's entries.
 */
export class HighScores {
  constructor(
    private file: string,
    private cap = HIGHSCORE_CAP,
  ) {}

  list(): ScoreEntry[] {
    const raw = loadJson<unknown>(this.file, []);
    if (!Array.isArray(raw)) return [];
    // Re-sort in case the file was edited by hand: score descending, ties newer first.
    return raw.filter(validEntry).sort((a, b) => b.score - a.score || (a.date < b.date ? 1 : a.date > b.date ? -1 : 0));
  }

  record(entry: ScoreEntry): void {
    saveJson(this.file, insertScore(this.list(), entry, this.cap));
  }
}

export function highScoresFile(dir: string): string {
  return join(dir, "highscores.json");
}

/** What unlocking records: only that Super mode is open and when. No names, tokens or PIN. */
export interface Unlocks {
  super: boolean;
  date: string;
}

/** Pure: a well-typed record, or the locked state for anything else (missing, corrupt, ill-typed). */
export function parseUnlocks(raw: unknown): Unlocks {
  if (typeof raw === "object" && raw !== null) {
    const r = raw as Partial<Unlocks>;
    if (typeof r.super === "boolean" && typeof r.date === "string") return { super: r.super, date: r.date };
  }
  return { super: false, date: "" };
}

export function unlocksFile(dir: string): string {
  return join(dir, "unlocks.json");
}

/** Unlock flags in one JSON file; reads fresh every time so a hand-edited or externally written file takes effect. */
export class UnlockStore {
  constructor(private file: string) {}

  isSuperUnlocked(): boolean {
    return parseUnlocks(loadJson<unknown>(this.file, undefined)).super;
  }

  /** Idempotent: the first date is kept and a repeat call writes nothing. */
  unlockSuper(dateIso: string): void {
    if (this.isSuperUnlocked()) return;
    saveJson(this.file, { super: true, date: dateIso } satisfies Unlocks);
  }
}
