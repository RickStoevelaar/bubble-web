# Bubble Web — Design Document

Date: 2026-11-25
Status: draft, awaiting approval

## Intent

A faithful web recreation of the 1986 arcade game Bubble Bobble — the
full experience: all 100 rounds, the enemy roster and their behaviors,
items and scoring, special bubbles, EXTEND, secret rooms, the boss
fight, and both endings — for the owner's household only. Playable on
phones (touch controls) and desktops (keyboard/gamepad), with two-player
co-op over the network via a small backend hosted on the owner's
existing Hetzner server.

All art, character designs, names, and audio are original. The game
reproduces mechanics and level layouts (functional game design), never
Taito's sprites, character likenesses, names, music, or sounds. The
product must not present itself as "Bubble Bobble"; working title:
**Bubble Web** (builder may propose a better original name).

## Why

Household fun: the owner and family remember the original and want to
play it together on their phones. Not a commercial or public project.

## Goals

- All 100 round layouts, transcribed from reference maps
  (VGMaps full-game map rip, StrategyWiki round images, Adam Dawes'
  mechanics guide) into a JSON tile-data format.
- Core loop: blow bubbles, trap enemies, pop them into food, chain pops
  for multiplied score, clear the round, advance.
- Faithful movement feel: tile-quantized platforming, fall-through
  screen wrap (exit bottom, re-enter top), bubble-jumping, per-level
  bubble drift currents approximating the original's airflow.
- Enemy roster with original designs but the classic behaviors: the
  basic walker, the fast chaser, the projectile thrower (rocks), the
  fire-breather, the bouncing ghost that ignores platforms, the flyer,
  the invincible "hurry up" chaser that spawns when a round takes too
  long, and the final boss (a giant enemy fought with special bubbles).
- Anger state: enemies turn angry (faster, pink-tinted) when they escape
  a bubble, when they're the last one left, or when the round timer
  runs out.
- Special bubbles: water (releases a flowing stream that carries you and
  kills enemies), fire (ground flames), lightning (horizontal bolt),
  plus letter bubbles spelling E-X-T-E-N-D for an extra life and a
  round skip.
- Items/power-ups: the canonical set in spirit — shoe (speed), candies
  (bubble speed/range/rate), umbrellas (skip 3/5/7 rounds), rings and
  crosses (score/screen effects), potions, and the three secret-room
  doors that appear when conditions are met (no-death streaks), with the
  secret rooms' giant-letter layouts and treasure.
- Scoring: food values, chain-pop multipliers (1k/2k/4k/8k...), item
  scores, extra lives at score thresholds.
- Two endings: the "bad" ending when finishing single-player, the true
  ending when round 100 is cleared in two-player mode (with the original
  structure: rescue scene, and a code revealed at the true ending that
  unlocks a hidden "Super" mode — in v1 a hard-mode replay with faster,
  angrier enemies; owner's decision, see Non-goals).
- Two-player networked co-op: both players on phones or desktops,
  anywhere, joining a shared room served by the backend. Single-player
  works too.
- Mobile-first presentation: portrait layout, playfield on top,
  touch control deck at the bottom; also landscape and desktop layouts.
- Original pixel art (two original dragon-like heroes, original enemy
  designs) and original synthesized chiptune-style music and SFX via
  WebAudio.
- Deployable on the owner's shared Hetzner box behind the existing
  Caddy reverse proxy.

## Non-goals

- Emulation-level, frame-exact accuracy. We match documented behavior
  and feel, not the ROM cycle-for-cycle.
- Public deployment, accounts, matchmaking, leaderboards beyond a local
  high-score table.
- More than 2 simultaneous players in a game (spectators are out of
  scope too).
- The arcade's attract mode, coin mechanics, DIP-switch options.
- A faithful Super mode (the original's rearranged enemy placements,
  altered visuals, and second secret ending). Owner chose a simpler v1:
  the unlock code enables a hard-mode replay. The faithful version is a
  possible follow-up project.
- Offline play. Owner chose server-only: single-player runs through the
  server as a room of one. No internet (or server down) means no game.

## Anti-goals (failure even if it works)

- Using any ripped Taito assets (sprites, sound, music, fonts, names).
- Controls that feel mushy on a phone — if touch play isn't fun, the
  main point is lost.
- Breaking the other six apps on the shared server. **The live Caddyfile
  on the box must be read before any routing edit** (standing rule for
  this server).

## Constraints

- Client: TypeScript, HTML5 Canvas 2D, no game framework, no runtime
  dependencies. Builds to static files.
- Server: Node.js + WebSocket (the `ws` package or similar minimal
  dependency), runs the authoritative simulation. Low resource use —
  it shares a box with six other apps.
- One shared codebase for simulation logic (the sim runs on the server;
  the client runs the same code for prediction/rendering), so TypeScript
  on both sides.
- Internal resolution 256×224 (the arcade's), integer-scaled to fit the
  device, pixelated rendering (no smoothing).
- Must run well on mid-range phones in the browser (60fps target,
  Safari iOS and Chrome Android).
- Household latency: server in Hetzner (DE), players mostly in NL —
  ~20–30 ms RTT expected; design for up to ~100 ms gracefully.

## Approaches considered

### Client engine
1. **Custom TypeScript + Canvas 2D engine — CHOSEN.** Bubble Bobble's
   physics are tile-quantized and idiosyncratic (bubble wind currents,
   ledge-hopping AI, bottom-wrap). A purpose-built engine matches it
   exactly, has zero dependencies, and ships as a static page.
2. Phaser 3 — rejected: its arcade physics doesn't fit; the core logic
   would be custom anyway, so the framework only adds weight.
3. Adapt an open-source clone — rejected: existing clones bundle ripped
   assets we can't use, and we'd inherit a foreign architecture.

The owner picked approach 1 in conversation.

### Multiplayer architecture (builder-facing decision, owner informed)
1. **Server-authoritative simulation — CHOSEN.** The Node server runs
   the game at 60 Hz ticks; clients send inputs, server broadcasts
   compact state snapshots (~20/s) which clients render with
   interpolation plus local input prediction for your own character.
   Simple, robust, works from anywhere, no NAT issues.
2. Peer-to-peer WebRTC with one phone as host — rejected: NAT traversal
   complexity, host phone battery/lag, and the owner already has a
   server he wants to use.
3. Lockstep (both clients simulate, exchange inputs) — rejected: one
   late packet stalls both players; bad fit for phones on WiFi/4G.

## Decided in conversation

- Full experience (all 100 rounds, items, secrets, endings), not a
  subset.
- Original art and audio; same mechanics and layouts. The owner was told
  side-by-side it will feel like the same game wearing a different skin.
- Playable on phones; two-player over the network; backend on the
  owner's server.
- Touch controls (owner approved as a starting default, explicit
  "tune later"): portrait layout; bottom control deck; left thumb
  left/right slide zone; right thumb two large buttons (jump, bubble);
  full multi-touch; gamepad and keyboard also supported. Final tuning
  happens with real devices once playable.
- Single-player is server-only (a room of one); no offline mode.
- Super mode in v1 is a hard-mode replay unlock, not the original's
  rearranged levels; faithful Super mode is a possible follow-up.

## Builder's calls (made here, owner can veto)

- **Level data pipeline:** transcribe each round from reference map
  images into a text/JSON format (32×25 tile grid of the big 16×16
  blocks at 256×224... precisely: the arcade field is 32×28 tiles of
  8×8; levels use 2×2-tile blocks). Store per round: tile grid, tile
  theme (wall/decoration style + palette), enemy spawn list (type,
  position, delay), bubble drift current map, and special flags (e.g.
  rounds where water bubbles spawn). Transcription is manual-assisted:
  build a tiny level editor/viewer page early so layouts can be checked
  visually against the reference maps, ten at a time.
- **Networking protocol:** JSON messages during development, switching
  to a compact binary format only if measurements show it's needed.
  Rooms identified by a short code; the household just shares the code.
- **Continues & resume:** no coins. On game over the players get a free
  continue: score resets to zero (matching the arcade's continue
  behavior), the round is kept. Rooms persist on the server when all
  sockets drop; a run can be resumed later via its room code, so a
  100-round run survives phone sleep, battery, and dinner.
- **Mid-game join:** player 2 may join a run in progress (the arcade's
  coin-in join). The true ending requires both players present in the
  game at the moment the boss is defeated.
- **Access control:** no accounts. The server requires a single shared
  household PIN on join (configured server-side) plus the room code;
  basic rate limiting on join attempts. The URL itself follows the box's
  public sslip.io convention.
- **Persistence:** high scores, unlocks (Super mode), and suspended
  in-progress runs in small JSON files on the server; no database.
- **Deployment:** a Docker Compose project joined to the external `web`
  network behind the box's containerized Caddy, following the server's
  standing convention (like the other apps on the box). Static client
  files served by Caddy or the Node container; WebSocket proxied.
  Exact routing written only after reading the live Caddyfile.
- **Audio:** WebAudio-synthesized chiptune (square/triangle/noise
  channels), original compositions evoking the era but not copying the
  original melody.
- **Repo:** new git repository at `c:\dev\bubble-web`, plain npm
  workspace with `client/`, `server/`, `shared/` (simulation), and
  `tools/` (level transcription aids).

## Left to the builder

- Sprite designs and palette (original characters; hero must read
  clearly at 16×16).
- Exact tuning constants (walk speed, jump arc, bubble lifetimes,
  anger timers) — start from documented values in the Dawes guide and
  tune by feel against reference gameplay video.
- Snapshot/interpolation details, reconnect handling mid-round.
- File/module layout, build tooling (esbuild or similar), test strategy.
- Order of level transcription batches and the editor tool's shape.

## Milestones (sketch, for sizing)

1. Engine core + round 1 playable single-player locally (keyboard).
2. Touch controls + mobile layout; playable on a phone.
3. Networked co-op via local server; two phones in one room.
4. Enemy roster complete; items, special bubbles, scoring, EXTEND.
5. All 100 rounds transcribed; secrets, boss, endings, Super mode.
6. Audio, polish, deploy to Hetzner behind Caddy.

Done means: two household phones can join a room from anywhere, play
from round 1 to 100 co-op, see the true ending, and it feels like the
game they remember.
