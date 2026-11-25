# Audio

All sound is synthesized in the browser with plain WebAudio: no samples, no assets, no runtime dependencies.
Code lives in `client/src/audio/`; the client only listens, so the sim, protocol and server are untouched.

## Architecture

| File | Role |
| --- | --- |
| `sfx.ts` | Sound effects as data (`SFX`: name -> voices) and the pure `sfxForEvent(event, ctx)` mapper. No WebAudio. |
| `music.ts` | Tracks as data (`TRACKS`: tempo, key, length, flat `{step, ch, note, len}` events) and `voiceForNote`. |
| `synth.ts` | `Chip`: pulse (12.5/25/50 % via `PeriodicWave`), triangle, band-passed noise from one shared looping buffer. Every voice is stopped and disconnected after its end time (`sweep`/`onended`). |
| `scheduler.ts` | Plays a track ahead of the audio clock (every 25 ms, 120 ms lookahead). Loops by multiplication (no drift), switches on the next beat, skips (never bursts) notes after a stall. |
| `audio.ts` | `AudioSys`: context, buses -> master (0.5 x volume) -> compressor, unlock, mute/volume (localStorage key `bubble.audio`), polyphony cap (24 voices total, 16 for effects), per-sound rate limit. |
| `select.ts` | `musicFor(state, prevTrack)`: secret > boss alive > hurry > main; clearing keeps the current track; ending; gameover/no state = silence. |
| `unlock.ts`, `ui.ts`, `index.ts` | First-gesture unlock, the 40x40 mute button and the `M` key, and the `createAudio()` factory (silent `NULL_AUDIO` without WebAudio). |

`main.ts` creates one `AudioSys`, feeds it `ClientGame.onEvents` and the per-frame `musicFor`, and suspends it when the page is hidden.

## Event -> sound

| Event | Sound |
| --- | --- |
| jump / fire / bounce | `jump` / `blow` / `boing` |
| pop with a player | `pop1`..`pop8`: pentatonic climb, resets after 400 ms of silence, capped at 8 |
| pop without a player (expiry, escape) | `fizzle`: a very soft hiss; never the victory pop, never advances the chain |
| collect / oneup / continue / hurry | `collect` / `oneup` / `continue` / `hurry` |
| die | `death` for the local player (or unknown), quieter `deathSoft` for the partner |
| clear | `clear` fanfare; a second clear within 1500 ms is dropped (it can fire twice in one tick) |
| join success / phase becomes gameover | `join` / `gameover` (from `main.ts`, not events) |

A burst at one instant is spread into a run (min spacing per sound family) and anything that would wait too long is dropped.

## Music

| Track | Key, tempo | Length | Mood |
| --- | --- | --- | --- |
| `main` | F major, 150 bpm | 16 bars, 25.6 s, loops | bright, bouncy; lead, triangle bass, noise hat |
| `hurry` | F major, 188 bpm | 16 bars, 20.4 s, loops | same harmony 25 % faster, stuttered lead, running bass |
| `boss` | A minor, 138 bpm | 16 bars, 27.8 s, loops | tense; driving 8th bass, chromatic pulse stabs |
| `secret` | C lydian, 140 bpm | 8 bars, 13.7 s, loops | quirky and bubbly |
| `ending` | D major, 96 bpm | 12 bars, 30 s, plays once | warm, triumphant, ends on a long tonic, then silence |

## Listen offline

    node tools/audio-preview/render.mjs --out audio-preview

Renders every effect and track (one loop; the ending once) to 16-bit mono 44.1 kHz WAV with an independent pure-JS synth
that reads the same data tables. The default directory `./audio-preview` is git-ignored.

## Autoplay and iOS

Browsers start the context suspended. `installUnlock` listens (capture, passive) for `pointerdown` (not touch ones),
`touchend`, `keydown` and `click`; the handler calls `unlock()` synchronously, which runs `resume()` and plays a 1-sample
silent buffer, both inside the gesture as iOS requires. Listeners stay until the context is really running. Sounds
requested while locked are dropped; `setMusic` is remembered and starts right after unlock. Hidden page (`visibilitychange`,
`pagehide`): all voices stop and the context is suspended; on return music restarts on a fresh grid, with no catch-up.

## Adding things

- Sound: add its name to `SfxName` and an entry to `SFX` in `sfx.ts` (voices, `gap`, `maxDelay`), then map an event in `sfxForEvent` or call `playSfx`.
- Track: add the name to `TrackName`, write one string per 16-step bar in `music.ts` (`note/steps`, `r` = rest), add it to `TRACKS`, and select it in `select.ts`.
- Check with `npx vitest run client/test/audio tools/test/audio-preview` (data validity, scheduler, renderer) and listen via the preview.
