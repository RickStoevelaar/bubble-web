# Screen flow, `/scores` and the dev round shortcut (task 23a)

## Screens

`client/src/screens/machine.ts` is the pure reducer `next(screen, event)`:

| screen | event | next |
| --- | --- | --- |
| title | start | join |
| join | joined | game |
| join | joinFailed | join (the error text comes from `status.ts`) |
| join | back | title |
| game | phase gameover | gameover (run already over: scores) |
| game | phase ending | ending |
| game / gameover | phase round or clearing | game |
| gameover | phase gameover + runOver | scores |
| gameover | phase ending | ending |
| gameover | continued / declined | gameover (the server takes the FIRST answer from either player; the next snapshot decides) |
| ending | endingDone | scores |
| scores | back | title |
| game / gameover / ending | closedAfterJoin, joinFailed | join |

Everything else leaves the screen unchanged and never throws. Phase observations are honoured only on
game/gameover, so a late snapshot on the title is ignored. Reconnecting stays on "game" (banner from `status.ts`).

The game-over countdown (10 s) is client-side UX: the server has no timeout, so the client declines once when it
runs out. The ending is a placeholder text card: `drawEnding(ctx, sheet, state, endingTicks, kind)` in
`screens/ending.ts` is the extension point for the real ending scenes.

## `GET /scores`

`{ "scores": [{ names, score, round, date }] }`, top 20, `Cache-Control: no-store`. GET/HEAD only (405 otherwise).
Read failures give `{"scores":[]}`. Only those four fields are ever copied out of `highscores.json`.

## Dev round shortcut

Start the server with `ALLOW_DEV=1` and open the page as `/?round=N`. The join message carries an optional integer
`startRound`. It is honoured only when the server runs with `ALLOW_DEV=1` AND the join creates a brand-new room
(not a live room, not one restored from a save) AND the value is in `1..levels.length`; otherwise it is silently
ignored. A `startRound` that is not an integer is a `badmsg` like any other ill-typed optional field.
