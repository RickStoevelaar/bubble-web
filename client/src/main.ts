import { FIELD_H, FIELD_W, GAME_LEVELS, SUPER_CODE } from "@bubble/shared";
import type { GameState } from "@bubble/shared";
import {
  applyPlacement,
  createAudio,
  createMuteButton,
  installMuteKey,
  installUnlock,
  muteButtonPlacement,
  musicFor,
  newMapperState,
  sfxForEvent,
  type TrackName,
} from "./audio";
import { ClientGame } from "./game";
import { GamepadInput } from "./input/gamepad";
import { CombinedInput, KeyboardInput } from "./input/input";
import { TouchDeck, TouchTracker } from "./input/touch";
import { TouchInput } from "./input/touch-dom";
import { DeckView } from "./input/touch-view";
import { Connection, NetError, type ConnState } from "./net";
import { Sampler, watchLifecycle } from "./sampler";
import { viewOf, type ShownError } from "./status";
import { computeLayout } from "./render/layout";
import { render } from "./render/renderer";
import { buildSheet } from "./render/sprites";
import { drawEnding, endingDone, endingKind } from "./screens/ending";
import { CODE_START_TICKS, EndingClock, canSkip } from "./screens/ending-timeline";
import { RememberOnce } from "./screens/super-code";
import { Flow } from "./screens/flow";
import { ContinuePrompt, GameOverPanel, drawGameOver } from "./screens/gameover";
import { installEndingSkip, installScoresInput, installTitleStart, parseDevRound } from "./screens/input";
import { JoinForm } from "./screens/join-form";
import type { Screen } from "./screens/machine";
import { planScreenLayout } from "./screens/plan";
import { drawScores, fetchScores, matchOwn, turnPage, type OwnRun, type ScoresData } from "./screens/scores";
import { drawTitle } from "./screens/title";

function wsUrl(): string {
  return `${location.protocol === "https:" ? "wss" : "ws"}://${location.host}/ws`;
}

/** localStorage can throw (private mode, blocked): the form just will not be remembered then. */
function localStore(): Storage | null {
  try {
    return localStorage;
  } catch {
    return null;
  }
}

/** The server trims, strips control characters and caps names at 16; mirror that to recognise our own score row. */
function serverName(raw: string): string {
  const n = raw.replace(/[\u0000-\u001f\u007f]/g, "").trim().slice(0, 16).trim();
  return n || "Player";
}

const el = <T extends HTMLElement>(id: string): T => document.getElementById(id) as T;

function boot(): void {
  const canvas = el<HTMLCanvasElement>("game");
  const deck = el<HTMLElement>("deck");
  const maybeCtx = canvas.getContext("2d");
  if (!maybeCtx) throw new Error("2d canvas context unavailable");
  const ctx: CanvasRenderingContext2D = maybeCtx;
  const sheet = buildSheet(document);
  const devRound = parseDevRound(location.search);

  // Audio: one system for the page. Unlocked by the first gesture (iOS needs resume() inside it), muted by the
  // corner button or M, suspended while the page is hidden.
  const audio = createAudio();
  installUnlock(window, audio);
  const muteBtn = createMuteButton(document, audio);
  installMuteKey(window, document, audio, () => muteBtn.refresh());
  document.addEventListener("visibilitychange", () => (document.hidden ? audio.suspend() : audio.resume()));
  window.addEventListener("pagehide", () => audio.suspend());
  window.addEventListener("pageshow", () => {
    if (!document.hidden) audio.resume();
  });
  let track: TrackName | null = null;
  let lastPhase: string | null = null;
  const mapperState = newMapperState();

  // --- the screen flow -----------------------------------------------------
  let screenSince = performance.now();
  let titleScores: ScoresData = { status: "loading" };
  let scoresData: ScoresData = { status: "loading" };
  let scoresPage = 0;
  let ownRun: OwnRun | null = null;
  let lastView: GameState | null = null;
  const seatNames: (string | undefined)[] = [undefined, undefined];
  let ownName: string | undefined;
  const codeMemory = new RememberOnce(localStore(), SUPER_CODE);
  let disposeScreen: (() => void) | null = null;
  /** The ending scene clock: the server's endingTicks, or elapsed client time if that counter stalls. */
  let endingClock = new EndingClock();
  let endingTicksNow = 0;

  // Touch: the tracker/deck exist from boot so every layout recompute can re-zone them, but touches are only
  // handled on the game screen (the form, the buttons and the canvas screens must keep working).
  const deckModel = new TouchDeck(null);
  const tracker = new TouchTracker(deckModel);
  const deckView = new DeckView(deck, deckModel);
  let seenTouch = false;
  const coarse = window.matchMedia("(pointer: coarse)");
  const touch = new TouchInput(window, tracker, {
    isEnabled: () => flow.screen === "game",
    onTouch: () => {
      seenTouch = true;
      layout();
    },
  });
  /** Bottom inset (iOS home indicator) via the #safe probe, whose padding is env(safe-area-inset-bottom). */
  const safeBottom = (): number => parseFloat(getComputedStyle(el("safe")).paddingBottom) || 0;

  const safeSide = (side: "paddingLeft" | "paddingRight"): number => parseFloat(getComputedStyle(el("safe"))[side]) || 0;

  const actionsBox = el<HTMLElement>("gameover-actions");
  const layout = () => {
    const dpr = window.devicePixelRatio || 1;
    const w = window.innerWidth;
    const h = window.innerHeight;
    const l = computeLayout(w, h, dpr);
    canvas.width = FIELD_W * l.scale;
    canvas.height = FIELD_H * l.scale;
    canvas.style.left = `${l.gameX}px`;
    canvas.style.top = `${l.gameY}px`;
    canvas.style.width = `${l.fieldW}px`;
    canvas.style.height = `${l.fieldH}px`;
    ctx.setTransform(l.scale, 0, 0, l.scale, 0, 0);
    ctx.imageSmoothingEnabled = false;
    const plan = planScreenLayout(flow.screen, l, w, h, coarse.matches || seenTouch, safeBottom(), safeSide("paddingLeft"), safeSide("paddingRight"));
    touch.setZones(plan.zones); // releases held touches if the zones moved under them (rotation)
    deckView.setLayout(plan.deckBox, dpr, plan.deckPassThrough);
    if (plan.actions) {
      Object.assign(actionsBox.style, {
        left: `${plan.actions.left}px`,
        top: `${plan.actions.top}px`,
        width: `${plan.actions.width}px`,
        height: `${plan.actions.height}px`,
      });
    }
    applyPlacement(muteBtn.el, muteButtonPlacement(l, w));
  };
  /** Zoom or a move to another monitor changes devicePixelRatio without a resize event. */
  const watchDpr = (): void => {
    const mq = window.matchMedia(`(resolution: ${window.devicePixelRatio || 1}dppx)`);
    mq.addEventListener("change", () => {
      layout();
      watchDpr();
    }, { once: true });
  };
  window.addEventListener("resize", layout);
  window.addEventListener("orientationchange", layout);
  watchDpr();

  // --- join form -----------------------------------------------------------
  const status = el<HTMLElement>("status");
  const conn = new Connection(wsUrl());
  let lastError: ShownError | null = null;

  const join = new JoinForm(
    {
      root: el("join"),
      form: el<HTMLFormElement>("join-form"),
      room: el<HTMLInputElement>("room"),
      pin: el<HTMLInputElement>("pin"),
      name: el<HTMLInputElement>("name"),
      rememberPin: el<HTMLInputElement>("remember-pin"),
      go: el<HTMLButtonElement>("join-go"),
      back: el<HTMLButtonElement>("join-back"),
      error: el("join-error"),
      hint: el("join-hint"),
    },
    localStore(),
    SUPER_CODE,
    (v) => {
      lastError = null;
      join.setError(null);
      flow.beginJoin(); // a fresh session: nothing of an earlier one (game, everJoined) survives
      const p = conn.join(v.room, v.pin, v.name, undefined, devRound ?? undefined);
      join.setConnecting(true);
      p.then(({ playerId }) => {
        join.remember(v);
        ownName = serverName(v.name);
        seatNames.fill(undefined);
        seatNames[playerId] = ownName;
        flow.game = makeGame(playerId);
        audio.playSfx("join");
        ensureSampler();
        join.setConnecting(false);
        flow.go({ t: "joined" });
      }).catch((err: unknown) => {
        lastError = err instanceof NetError ? err.code : "closed";
        join.setConnecting(false);
        applyView();
        flow.go({ t: "joinFailed", err: lastError });
      });
    },
    () => {
      // Back: abandon a join in progress (rejects its promise, which is ignored on the title) and return.
      conn.close();
      lastError = null;
      join.setConnecting(false);
      flow.go({ t: "back" });
    },
  );

  /** The one place that decides the banner text and the form's error line; the screen decides what is shown. */
  const applyView = (): void => {
    const v = viewOf({ state: conn.connectionState, everJoined: flow.everJoined, error: lastError });
    status.hidden = !flow.bannerVisible(v.statusText);
    status.textContent = v.statusText ?? "";
    if (flow.screen === "join") {
      join.setConnecting(conn.connectionState === "connecting");
      if (conn.connectionState !== "connecting") join.setError(v.errorText);
    }
  };

  /** A game for one hero; its sfx mapper is bound to that hero (a different seat means a different game). */
  const makeGame = (playerId: 0 | 1): ClientGame => {
    const g = new ClientGame({ levels: GAME_LEVELS, playerId });
    g.onEvents((events) => {
      const now = performance.now();
      for (const e of events) {
        const sfx = sfxForEvent(e, { localPlayer: g.localPlayer, now, state: mapperState });
        if (sfx) audio.playSfx(sfx);
      }
    });
    return g;
  };
  // After a suspend/restart the server may seat us as the other hero: retarget prediction, marker, sfx and names.
  conn.onJoined((playerId) => {
    if (!flow.reseat(playerId, makeGame)) return;
    seatNames.fill(undefined);
    seatNames[playerId] = ownName; // the partner's name arrives with the peer message that follows `joined`
  });

  conn.onSnap((m) => {
    flow.game?.onSnapshot(m);
    flow.go({ t: "phase", phase: m.state.phase, runOver: m.state.runOver });
  });
  conn.onPeer((m) => {
    seatNames[m.playerId] = serverName(m.name);
  });
  conn.onState((s: ConnState) => {
    if (s === "joined") lastError = null;
    flow.connState(s); // resync on a rejoin, re-offer the game-over question, closed-after-join -> join form
    applyView();
  });
  conn.onError((code) => {
    lastError = code;
    applyView();
  });

  // --- game over -----------------------------------------------------------
  const goCont = el<HTMLButtonElement>("go-continue");
  const goQuit = el<HTMLButtonElement>("go-quit");
  const panel: GameOverPanel = new GameOverPanel(
    actionsBox,
    goCont,
    goQuit,
    window,
    new ContinuePrompt({
      now: () => performance.now(),
      setTimer: (fn, ms) => setTimeout(fn, ms),
      clearTimer: (h) => clearTimeout(h as ReturnType<typeof setTimeout>),
      onAnswer: (accept) => {
        conn.continue(accept);
        flow.go({ t: accept ? "continued" : "declined" });
      },
    }),
  );

  // --- screen transitions --------------------------------------------------
  const flow = new Flow<ClientGame>(conn, panel, (prev, to) => {
    disposeScreen?.();
    disposeScreen = null;
    screenSince = performance.now();
    enter(prev, to);
    layout(); // the deck, the canvas and the buttons follow the new screen
  });

  function enter(prev: Screen, to: Screen): void {
    if (to !== "join") join.hide();
    switch (to) {
      case "title":
        lastPhase = null;
        lastView = null;
        ownRun = null;
        titleScores = { status: "loading" };
        void fetchScores().then((d) => {
          if (flow.screen === "title") titleScores = d;
        });
        disposeScreen = installTitleStart(window, () => flow.go({ t: "start" }));
        break;
      case "join":
        join.resetPin();
        join.show(prev === "title" ? null : viewOf({ state: conn.connectionState, everJoined: flow.everJoined, error: lastError }).errorText);
        break;
      case "game":
        break;
      case "gameover":
        panel.show();
        break;
      case "ending":
        codeMemory.reset();
        endingClock = new EndingClock();
        endingTicksNow = 0;
        disposeScreen = installEndingSkip(
          window,
          () => lastView !== null && canSkip(endingTicksNow, endingKind(lastView)),
          () => flow.go({ t: "endingDone" }),
        );
        break;
      case "scores": {
        if (prev === "gameover" || prev === "ending") {
          ownRun = lastView ? ownRunOf(lastView) : null;
        }
        scoresData = { status: "loading" };
        scoresPage = 0;
        void fetchScores().then((d) => {
          if (flow.screen !== "scores") return;
          scoresData = d;
          if (d.status === "ready") {
            const idx = matchOwn(d.rows, ownRun);
            scoresPage = idx >= 0 ? Math.floor(idx / 10) : 0;
          }
          flow.go({ t: "scoresShown" });
        });
        disposeScreen = installScoresInput(window, canvas, (a) => {
          if (a === "back") flow.go({ t: "back" });
          else if (scoresData.status === "ready") scoresPage = turnPage(scoresPage, a, scoresData.rows.length);
        });
        break;
      }
    }
  }

  function ownRunOf(s: GameState): OwnRun {
    const names = seatNames.filter((n): n is string => n !== undefined);
    return { score: s.players.reduce((sum, p) => sum + p.score, 0), round: s.round, names };
  }

  // --- the loop ------------------------------------------------------------
  let sampler: Sampler | null = null;
  function ensureSampler(): void {
    if (sampler) return;
    const input = new CombinedInput([new KeyboardInput(window), new GamepadInput(), touch]);
    const s = new Sampler({
      input,
      nextSeq: () => conn.nextInputSeq(),
      send: (seq, buttons) => conn.sendInput(seq, buttons),
      push: (seq, buttons) => flow.game?.pushInput(seq, buttons),
    });
    s.setActive(!document.hidden);
    watchLifecycle(window, document, (active) => s.setActive(active));
    sampler = s;
  }

  const frame = (now: number): void => {
    sampler?.frame(now);
    deckView.render(touch.pressed);
    const game = flow.game;
    const screen = flow.screen;
    const playing = screen === "game" || screen === "gameover" || screen === "ending";
    const view = playing ? (game?.viewState(now) ?? null) : null;
    if (view) lastView = view;
    const want = musicFor(view, track);
    if (want !== track) {
      track = want;
      audio.setMusic(want);
    }
    if (view) {
      if (view.phase === "gameover" && lastPhase !== "gameover") audio.playSfx("gameover");
      lastPhase = view.phase;
    }
    switch (screen) {
      case "title":
      case "join":
        drawTitle(ctx, sheet, {
          t: now - screenSince,
          scores: titleScores.status === "ready" ? titleScores.rows : null,
          touch: coarse.matches || seenTouch || "ontouchstart" in window,
          devRound,
        });
        break;
      case "game":
        if (view && game) render(ctx, sheet, view, GAME_LEVELS, game.localPlayer);
        else {
          ctx.fillStyle = "#000";
          ctx.fillRect(0, 0, FIELD_W, FIELD_H);
        }
        break;
      case "gameover":
        if (view && game) {
          render(ctx, sheet, view, GAME_LEVELS, game.localPlayer);
          drawGameOver(ctx, sheet, view, panel.prompt.remainingSeconds(), panel.prompt.isAnswered);
          panel.refresh();
        }
        break;
      case "ending":
        if (view) {
          const kind = endingKind(view);
          endingTicksNow = endingClock.at(view.endingTicks, now);
          drawEnding(ctx, sheet, view, endingTicksNow, kind);
          // the code was on screen: keep it for the join form's hint (a convenience, never required)
          if (kind === "true" && endingTicksNow >= CODE_START_TICKS) codeMemory.touch();
          if (endingDone(endingTicksNow, kind)) flow.go({ t: "endingDone" });
        }
        break;
      case "scores":
        drawScores(ctx, sheet, { data: scoresData, page: scoresPage, own: ownRun, now });
        break;
    }
    requestAnimationFrame(frame);
  };

  layout();
  enter("title", "title");
  layout();
  applyView();
  requestAnimationFrame(frame);
}

boot();
