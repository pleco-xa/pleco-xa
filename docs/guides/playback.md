---
title: Playback
description: Turning a detected loop into sound — seamless loop players, an event-driven transport, and pure buffer operations for half/double-speed, gap-closing, and reversal.
---

Detection tells you *where* the loop is. Playback is how you *hear* it. Pleco-Xa
ships two player classes for different needs, a set of pure buffer operations for
transforming loop regions, and a live-speed layer for changing playback rate
mid-flight. Everything here composes with a result from
[`loop.detect()`](./loop.md).

## Two players

### `LoopPlayer` — seamless, simple

`LoopPlayer` wraps a Web Audio `BufferSource` and uses its **native**
`source.loop` for the loop, which is sample-accurate: in live measurement a
2.6122 s golden loop played back at 2.6116 s per cycle — a −0.6 ms drift over
3.4 cycles, with no manual scheduling. When you want a loop to just play
cleanly, this is the one.

```js
import { LoopPlayer, loadAudioFile, loop } from 'pleco-xa'

const { audioBuffer } = await loadAudioFile('/audio/break.wav')
const result = await loop.detect(audioBuffer)

const player = new LoopPlayer(audioBuffer)
player.setLoopPoints(result.loopStart, result.loopEnd) // seconds
await player.play()   // resumes a suspended context automatically
player.setVolume(0.8) // default gain is 0.5
player.stop()
```

Notes worth knowing:

- The constructor creates an `AudioContext` immediately, so instantiation is
  browser-only (importing the class is safe everywhere; `new`-ing it is not).
- There is **no pause** — only `stop()` and `play()`. `play()` internally stops
  any current source first, so calling it again restarts cleanly.
- Loop points are in **seconds**, matching `result.loopStart` / `result.loopEnd`.

### `AudioPlayer` — event-driven transport

`AudioPlayer` is the framework-agnostic transport: an imperative, event-driven
API (in the spirit of GSAP) that you can bind to any UI. Its constructor is
SSR-safe (guarded on `window`), it lazily creates its context, and it exposes a
full transport surface.

```js
import { AudioPlayer } from 'pleco-xa'

const player = new AudioPlayer({ volume: 1.0 })
await player.load('/audio/song.wav')  // URL, or pass an AudioBuffer directly

player.on('timeupdate', (t) => updatePlayhead(t))
player.on('loopchange', (region) => highlight(region))

player.setLoop(10.0, 20.5) // seconds
player.play()
player.seek(12.0)
player.pause()             // AudioPlayer *does* have pause
player.clearLoop()
player.dispose()           // closes the AudioContext
```

The transport methods are `load`, `play`, `pause`, `stop`, `seek`,
`setVolume`, `setLoop`, `clearLoop`, `getCurrentTime`, `on` / `off`, and
`dispose`. One caveat: `AudioPlayer`'s loop restart is JS-driven (via the
source's `onended`), so a small gap at the loop point is possible. If you need a
truly seamless loop, use `LoopPlayer`'s native `source.loop` instead.

**Which player?** Use `LoopPlayer` for gapless looping of a fixed region; use
`AudioPlayer` when you need a scrubbable, event-emitting transport (playhead UI,
pause/seek, loop toggling) and can tolerate a hair of gap at the seam.

## Buffer operations: the `playback` namespace

The `playback` namespace holds the loop-transform operations that used to live
inline in the demo, hoisted verbatim into the library as **pure functions**.
They are the universal-runtime poster child:

- Inputs are AudioBuffer-shaped objects (`{ numberOfChannels, length,
  sampleRate, getChannelData(ch) }`); real `AudioBuffer`s qualify.
- No DOM, no `window`, no `AudioContext`. Output buffers come from an injectable
  `createBuffer(numChannels, length, sampleRate)` factory. The default factory
  returns a plain Float32Array-backed object (Node/worker safe); in the browser,
  pass a factory that mints real `AudioBuffer`s:

  ```js
  import { playback } from 'pleco-xa'

  const opts = { createBuffer: (ch, len, sr) => ctx.createBuffer(ch, len, sr) }
  const stretched = playback.halfSpeedLoop(audioBuffer, { start: 0.25, end: 0.5 }, opts)
  ```

- Loop descriptors are normalized `{ start, end }` with `0 <= start < end <= 1`.
- Invalid input throws immediately — no silent fallbacks.

### Speed transforms

| Function | Effect | Length |
|---|---|---|
| `halfSpeedLoop` | Time-stretch the loop to 2× its length | Buffer grows by one loop length |
| `halfSpeedQuantzLoop` | Half-speed the loop but mask it to the original window | Unchanged |
| `doubleSpeedQuantzLoop` | Compress the loop to 2× speed, close the gap | Shorter; returns `{ buffer, newLoopEnd }` |
| `doubleSpeedUnquantzLoop` | Compress to 2× speed in place (fractal matryoshka fill) | Unchanged |

`halfSpeedLoop` **lengthens** the buffer (the stretched loop needs room);
`halfSpeedQuantzLoop` keeps the track length fixed by only playing the first
half of the source material — the "hidden half" can be surfaced later with the
reveal operations below. `doubleSpeedQuantzLoop` returns the new normalized loop
end alongside the shortened buffer.

### Gaps and reversal

```js
import { playback } from 'pleco-xa'

const loopData = { start: 0.25, end: 0.5 }

// Honest null when there is no qualifying silence — not an error.
const gap = playback.detectGap(audioBuffer, loopData)
if (gap) {
  const { buffer, newLoopEnd, gapSize } = playback.closeGapLeft(audioBuffer, loopData)
}

// Copy-then-reverse a sample range (does NOT mutate the input).
const reversed = playback.reverseSection(audioBuffer, 22579, 116688)
```

`detectGap` finds silence common to all channels after the loop and returns a
sample-indexed `{ start, end, size }` — or `null` when nothing qualifies.
`closeGapLeft` / `closeGapRight` remove it and give back the rescaled loop end.
`reverseSection` reverses a range on a *copy* — unlike the
[Play layer](./play.md)'s `reverse` gesture, which mutates the buffer in
place.

The `revealHiddenHalf` / `revealFirstHalf` pair swaps which half of a
half-speed-quantized loop is audible — the mechanism behind the demo's "nudge"
toggle.

## Live speed control

For changing rate during playback, the live-speed helpers offer two tiers with
different pitch behavior:

```js
import { applyLiveHalfSpeed, applyLiveDoubleSpeed, resetLiveSpeed } from 'pleco-xa'

// Both require the session's context and buffer — they throw without them.
await applyLiveHalfSpeed({ audioContext: ctx, buffer: audioBuffer })   // half tempo
await applyLiveDoubleSpeed({
  audioContext: ctx,
  buffer: audioBuffer,
  preservePitch: true, // resample tier — pitch stays put
})
await resetLiveSpeed() // back to 1×
```

The tier is selected by the `preservePitch` option on those same calls:

- The **`playbackRate` tier** (`preservePitch: false`, the default) shifts
  pitch with speed (the classic turntable effect).
- The **resample tier** (`preservePitch: true`) preserves pitch while changing
  speed.

These operate through a session singleton, `liveSpeedController`, which
`init()` re-binds per session. It currently loops the whole track (its internal
loop stub returns the full range) — pair it with `loop.detect()` bounds and a
`LoopPlayer` when you want live speed changes scoped to a detected loop.

## See it live

The [Gallery](https://plecoxa.com/gallery/) includes the live loop-control demo where the half /
double / move-forward buttons drive a `LoopController` and re-trigger a
`LoopPlayer` on each change — the same wiring described here.
