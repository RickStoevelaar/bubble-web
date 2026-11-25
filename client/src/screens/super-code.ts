/** The Super-room code seen in the true ending is remembered here (a convenience only, never required). */
export const SUPER_CODE_KEY = "bubbleweb.superCode";

export interface CodeStore {
  getItem(k: string): string | null;
  setItem(k: string, v: string): void;
}

/** Saves `code`; storage can be missing, full or blocked, so every failure is swallowed. */
export function rememberSuperCode(store: CodeStore | null, code: string): void {
  try {
    store?.setItem(SUPER_CODE_KEY, code);
  } catch {
    /* not remembered: the player has read it on screen */
  }
}

/** The remembered code, only if it is exactly the real one (so nothing else can ever reach the page). */
export function readSuperCode(store: Pick<CodeStore, "getItem"> | null, real: string): string | null {
  try {
    const v = store?.getItem(SUPER_CODE_KEY);
    return typeof v === "string" && real !== "" && v === real ? v : null;
  } catch {
    return null;
  }
}
