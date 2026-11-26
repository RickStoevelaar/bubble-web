/*
 * PWA glue: registers the service worker (served from the site root, see client/static/sw.js) and captures the
 * browser's install prompt for the title screen's INSTALL button. Everything here is optional: any failure is
 * swallowed and the game runs exactly as without it.
 */

interface LocationLike {
  protocol: string;
  hostname: string;
}

/** Service workers need a secure context: https, or localhost for development. */
export function swAllowed(loc: LocationLike): boolean {
  if (loc.protocol === "https:") return true;
  return loc.protocol === "http:" && (loc.hostname === "localhost" || loc.hostname === "127.0.0.1" || loc.hostname === "[::1]");
}

/** Registers /sw.js after the page loaded. Never throws and never blocks the game. */
export function registerServiceWorker(win: Window & typeof globalThis): void {
  try {
    if (!("serviceWorker" in win.navigator) || !swAllowed(win.location)) return;
    const go = (): void => {
      try {
        win.navigator.serviceWorker.register("/sw.js", { scope: "/" }).catch(() => undefined);
      } catch {
        // ignore: the game does not depend on the worker
      }
    };
    if (win.document.readyState === "complete") go();
    else win.addEventListener("load", go, { once: true });
  } catch {
    // ignore
  }
}

interface InstallEvent extends Event {
  prompt(): Promise<unknown>;
}

export interface InstallButton {
  /** Called every frame with "is the title screen showing"; the button also needs the browser's event. */
  setScreenVisible(title: boolean): void;
}

/** Wires `button` to the browser's install prompt (Chromium only; iOS has no such event and never shows it). */
export function installInstallButton(win: Window & typeof globalThis, button: HTMLButtonElement): InstallButton {
  let deferred: InstallEvent | null = null;
  let onTitle = false;
  const refresh = (): void => {
    button.hidden = !(onTitle && deferred !== null);
  };
  try {
    const standalone = win.matchMedia("(display-mode: standalone)").matches || (win.navigator as { standalone?: boolean }).standalone === true;
    if (!standalone) {
      win.addEventListener("beforeinstallprompt", (e) => {
        e.preventDefault();
        deferred = e as InstallEvent;
        refresh();
      });
    }
    win.addEventListener("appinstalled", () => {
      deferred = null;
      refresh();
    });
    button.addEventListener("click", () => {
      const ev = deferred;
      deferred = null; // the event can be used once
      refresh();
      try {
        void ev?.prompt().catch(() => undefined);
      } catch {
        // ignore
      }
    });
  } catch {
    // ignore: the button just stays hidden
  }
  return {
    setScreenVisible(title: boolean): void {
      if (title === onTitle) return;
      onTitle = title;
      refresh();
    },
  };
}
