# The level set

## What it is

The game plays 100 original rounds, committed as `shared/src/levels/levels.json` and exported as `GAME_LEVELS`
(`shared/src/levels/index.ts`). The server (`loadLevels()` in `server/src/index.ts`) and the client
(`client/src/main.ts`) both take their rounds from `GAME_LEVELS`. `LEVELS` (one small `TEST_LEVEL`) still exists as a
unit-test fixture only; `server/test/levels-guard.test.ts` fails if `server/src` or `client/src` ever import it.

Format: `LevelData` (`shared/src/level.ts`): `round`, `theme`, 28 rows of 32 characters (`#` solid, `.` empty),
`enemies` (`type`, `col`, `row`, `delayTicks`), `drift` cells and optional bubble `flags`.

- Rounds 1-99 are generated; round 100 is the boss arena (`BOSS_ARENA`, one boss enemy, thunder shots only).
- Themes: ten tile themes, one per ten rounds (theme 0 = rounds 1-10 ... theme 9 = rounds 91-99); the arena has its own.
- Ramp: 3 enemies in round 1, 5 by round 5, 10 at round 30, 12 (the cap) first at round 60 and in most rounds from 76 on. Six enemy types
  (walker, chaser, thrower, breather, bouncer, flyer) are introduced and kept in rotation; later rounds use more
  spawn waves (distinct `delayTicks`), bubble flags and drift.
- Milestones: rounds 30, 40, 50 (10-11 enemies), 60, 70, 75 (11-12), 80, 90, 99 (11-12).
- Secret doors: after clearing round 20, 30 or 40 a door appears if every present player has gone 10 rounds without
  dying (`TUNING.secretDoorRounds`, `secretDoorDeathlessRounds`). The three secret rooms live in
  `shared/src/levels/secret-rooms.ts`, not in `levels.json`.
- Round 100: boss with `bossHpBase + bossHpPerPlayer * players` hp; no special bubbles, no hurry-up. Defeating it
  ends the run (true ending with two players, bad ending with one).

## How it is produced

Never edit `levels.json` by hand. The generator is `tools/gen-levels`:

- `templates/*.ts`: layout families (`tiers`, `stairs`, `keep`, ...). A template is a pure function of parameters and a
  seeded `Rng` that returns the 28 rows.
- `rounds/rounds-001-025.ts`, `-026-050`, `-051-075`, `-076-099`: one `RoundDef` per round (theme, template, params,
  enemy groups, drift, flags). `rounds/hand.ts` holds the hand-drawn rounds (literal rows), `rounds/boss.ts` round 100,
  and `rounds/index.ts` concatenates them into `ROUNDS`.
- Seeds: a round's layout seed defaults to `round * 1009 + 17` (`generate.ts`), enemy placement uses a second stream
  derived from it. Same data, same output, byte for byte.
- `npm run gen-levels` rebuilds the generator and rewrites `shared/src/levels/levels.json`.
- `tools/test/gen-levels.test.ts` proves the committed JSON is byte-identical to a fresh generator run.
- `shared/test/support/batches.ts` is the registry of batches (1-25, 26-50, 51-75, 76-99). Each entry pins
  `sha256(JSON.stringify(levels.slice(from - 1, to)))`, so a finished batch cannot change silently, plus the batch
  rules (template variety, hand-drawn rounds, enemy-count ramp, milestones, types, waves, flags, drift, fairness).

## The quality gate

```
npm run check-levels -- --strict            # all 100 levels, about 45 s, must print "0 errors, 0 warnings"
npm run check-levels -- --range 20-30       # lint only rounds A..B (ramp checks still see every level)
npm run check-levels -- --json              # machine-readable result
npm run check-levels -- --max-nodes 5000    # cap on standing positions per level (default 20000)
npm run check-levels -- --no-reach          # skip the slow reach analysis (not the real gate)
npm run check-levels -- --file <levels.json>
```

Exit code 0 is clean, 1 lint errors (or warnings with `--strict`), 2 usage or file problems. The lint
(`shared/src/levels/lint.ts`, reach analysis in `reach.ts`) reports these codes:

- `spawn-headroom`, `spawn-sealed`, `spawn-disconnected`: a player spawn has no room or floor, is boxed into a small
  pocket, or the two spawns cannot reach each other.
- `reach-unreachable`, `reach-trap`, `reach-rise`, `reach-limit`: a platform run no player can reach, a spot that can
  be reached but not left (one-way trap), a jump higher than the real jump allows, or the analysis exceeded `--max-nodes`.
- `enemy-space`: an enemy with no standing position a player can reach within three rows below it, or in sealed space.
- `wrap-ratio`: more than 40% of the bottom row open (warning).
- Ramp checks over the whole set: `ramp-rounds` (rounds 1..N in order), `ramp-theme` (0..9), `ramp-boss` (boss only in
  round 100), `ramp-flags`, `ramp-consecutive` and `ramp-duplicate` (repeated layouts), `ramp-enemies` (enemy count
  dropping by 4 or more against three rounds earlier, warning) and `ramp-types` (a type vanishing for too long, warning).

## Viewer and contact sheets

- Viewer: `npm run viewer -w tools` serves http://localhost:8081/ (rebuilds on change). Page through rounds with the
  arrow keys (PageUp/PageDown jump ten), see lint issues and reach overlays, or load another levels file.
- Contact sheets: `node tools/gen-levels/sheet.mjs <from> <to> <cols> <scale> <out.png> [--overview]`, for example
  `node tools/gen-levels/sheet.mjs 1 100 10 0.6 overview.png --overview`. It renders with the client tile renderer in
  headless Edge (path via the `EDGE` environment variable if not in the default install folders).

## Adding or changing a round safely

1. Edit the round in `tools/gen-levels/rounds/rounds-*.ts` (or `hand.ts` for a drawn one). Never `levels.json`.
2. `npm run gen-levels` to regenerate; look at it in the viewer.
3. `npm run check-levels -- --strict` must stay at 0 errors and 0 warnings.
4. Run the batch tests: `npx vitest run tools/test shared/test/levels-*.test.ts shared/test/campaign.test.ts`.
5. The batch's pinned `sha256` in `shared/test/support/batches.ts` will now fail on purpose. Update it deliberately,
   in the same commit, after reviewing the change, and say why. Pins of untouched batches must not move.
6. Keep the structure: contiguous rounds 1..100, round 100 the boss arena, at most 12 enemies per round, spawn columns
   3 and 28 standable.

## How the tests are organised

- Data and pins per batch: `tools/test/gen-levels-batch-*.test.ts`, `gen-levels-all.test.ts`, `gen-levels.test.ts`.
- Lint and simulation smoke per roughly twelve rounds, so they run in parallel: `shared/test/levels-lint-*.test.ts`,
  `levels-smoke-*.test.ts` (support code in `shared/test/support/`).
- Doors: `shared/test/levels-doors.test.ts` and `secrets.test.ts`.
- Whole campaign: `shared/test/campaign.test.ts` plays rounds 1-99 with two players, clearing each through the sim's
  own death path, checks the secret-door rule, the boss, both endings and save/restore in the middle of rounds.
- Server: `server/test/campaign-server.test.ts` (real server on the default levels, resume at round 57, snapshot
  size), `levels-startup.test.ts`, `levels-guard.test.ts`. Client: `client/test/campaign-levels.test.ts`,
  `bundle.test.ts` (the built bundle really contains the 100 rounds).
- Expected time: the full `npx vitest run` takes about 70 s on a 22-thread machine; `check-levels --strict` about 45 s.

## Using a different level set

The game takes its rounds from `GAME_LEVELS`, which is the compiled-in `levels.json`. A different set must be 100
levels in the same `LevelData` format (rounds 1..100 in order, round 100 holding the boss). To use one:

1. Check it first: `npm run check-levels -- --strict --file <path>`.
2. Replace `shared/src/levels/levels.json` (or change `shared/src/levels/index.ts`). Note that `npm run gen-levels`
   will overwrite that file again from the rounds data, and the hash pins and sync test will fail until you retire them.
3. Rebuild the client (`node client/build.mjs`) and the server (`node server/build.mjs`).

Runtime loading of an external level file (a `LEVELS_FILE` setting) is NOT implemented. Client and server must play
exactly the same set (the sim runs on both), so it would take the server reading and validating the file at startup
(`validateLevelSet` already does the cheap check) and serving it, for example as `/levels.json`, with the client
fetching it before joining and passing it to `ClientGame` and the renderer. Rooms saved on disk also refer to rounds by
number, so changing the set under a saved room changes what that room plays. That is a design decision for the owner.
