---
title: Loop detection
description: Pleco-Xa's signature capability — one entry point, four strategies, and a single honest confidence score for finding the point where audio repeats.
---

Loop detection is the thing Pleco-Xa was built to do. Given a buffer of audio,
it finds the sample-accurate points where the material repeats — the start and
end of a seamless loop — and tells you, on a single honest scale, how sure it
is. This is the library's flagship: everything else (beat tracking, spectral
features, structural segmentation) exists in service of, or alongside, getting a
loop right.

It is also the capability that sets Pleco-Xa apart. Offline analysis tools hand
you onsets, a tempo, and a recurrence matrix, but none of that answers "where
does this clip loop, and how cleanly?" That question is inherently about
playback, and answering it well means combining beat structure,
cross-correlation, recurrence analysis, and zero-crossing alignment into one
decision. Pleco-Xa does that, in the browser, with no dependencies.

## One API

There is exactly one public entry point:

```js
import { loop, loadAudioFile } from 'pleco-xa'

const { audioBuffer } = await loadAudioFile('/audio/break.wav')

const result = await loop.detect(audioBuffer, { strategy: 'fast' })
console.log(result)
// {
//   strategy: 'fast',
//   loopStart: 0.512,        // seconds
//   loopEnd: 2.646,          // seconds
//   loopStartSample: 22579,
//   loopEndSample: 116688,
//   confidence: 0.94,        // unified 0..1 scale (see below)
//   bpm: 120.1,              // present when the strategy used a tempo
//   details: { /* strategy-specific breakdown */ }
// }
```

`loop.detect()` is async, takes an `AudioBuffer` (or any AudioBuffer-like shim
exposing `getChannelData(i)`, `sampleRate`, `length`, and `duration`), and
returns the object above. It runs unchanged in the browser on a real
`AudioBuffer` and in Node on a duck-typed shim — the detection code touches no
DOM and no `AudioContext`.

The full return shape:

| Field | Meaning |
|---|---|
| `strategy` | Which strategy produced the result |
| `loopStart` / `loopEnd` | Loop bounds in **seconds** |
| `loopStartSample` / `loopEndSample` | Loop bounds in **samples** |
| `confidence` | Repetition evidence on the unified `0..1` scale |
| `bpm` | Detected/passed tempo — **only** when the strategy used one |
| `details` | The raw per-strategy analysis object |

## Four strategies

Strategy selection is **always explicit**. There is no silent cross-strategy
fallback: you ask for a strategy, you get that strategy or a diagnostic error.
The available strategies are enumerated on the namespace:

```js
import { loop } from 'pleco-xa'
loop.STRATEGIES // ['fast', 'precise', 'musical', 'recurrence']
```

### `fast` (default)

A beat-tracked pipeline: it tracks the beat, then runs a precise onset-pair
stage, a bar-aligned stage, and a half-buffer heuristic in sequence. This is the
everyday choice — the same engine as the legacy `fastLoopAnalysis`, locked
against golden fixtures in CI.
It reports a `bpm`. Cost is roughly O(onsets²) in its inner search (~7 s for 45 s
of audio in Node with the default hop).

```js
const r = await loop.detect(audioBuffer) // strategy defaults to 'fast'
```

### `precise`

An onset-pair search using true normalized cross-correlation, with a fade
penalty and a musical-length bonus. Use it when you want the tightest possible
boundaries and can afford the O(onsets²) cost. Bound long files with
`minLoopDuration` / `maxLoopDuration` / `searchStart` / `searchEnd`. It needs a
tempo — pass `bpm` or let it beat-track one — and its kick/snare fine-tuning can
shift the start up to ~150 ms (deliberately biased toward later starts). If no
onset pair in the search window is scoreable, it throws.

```js
const r = await loop.detect(audioBuffer, {
  strategy: 'precise',
  bpm: 120,               // optional tempo hint
  minLoopDuration: 0.5,   // seconds
  maxLoopDuration: 4.0,
})
```

### `musical`

Bar-multiple candidates scored by windowed correlation × beat alignment.
Candidates are capped at 12 s and half the buffer duration, and the returned
bounds are snapped forward to the next zero crossing. Confidence here is
`|NCC| × beatAlignment` on the unified scale. Like `precise`, it needs a tempo.

```js
const r = await loop.detect(audioBuffer, { strategy: 'musical', bpm: 128 })
```

### `recurrence`

Chroma recurrence-matrix lag analysis, optionally with RQA path scoring. This
strategy is **tempo-free** — it never invents a BPM, and the result never
carries a `bpm` field. The recurrence matrix is capped at 1500 frames; boundaries
are trimmed to zero crossings by default; and `rqa: true` adds an
RQA-alignment-path lag candidate that competes on audio-validated
cross-correlation confidence. Reach for it when the material has no clear pulse,
or when you specifically do not want a tempo assumption baked into the loop.

```js
const r = await loop.detect(audioBuffer, {
  strategy: 'recurrence',
  hopLength: 512,
  rqa: true,
})
// result.bpm === undefined  — recurrence never fabricates a tempo
```

### Choosing a strategy

| If you want… | Use |
|---|---|
| A good loop with one call, no tuning | `fast` |
| The tightest boundaries on percussive/onset-rich material | `precise` |
| Bar-locked loops that respect meter | `musical` |
| No tempo assumption at all (ambient, rubato, drones) | `recurrence` |

## Confidence: one honest scale

Every strategy reports confidence on the **same** `0..1` convention, and it
means something concrete. The value is derived from a real measurement — the
normalized cross-correlation (mean-subtracted, std-normalized) between the
candidate loop segment and the audio that immediately follows it — optionally
weighted by strategy-specific quality factors (fade characteristics, beat
alignment) that are themselves in `[0, 1]`.

- **`0`** — no measurable repetition evidence.
- **`1`** — the loop segment repeats verbatim.

Two rules make this trustworthy:

1. **Confidence is never fabricated.** A strategy that cannot measure anything
   throws a diagnostic error instead of inventing a number. `confidence: 0` from
   a returned result is itself a real measurement (for example, `precise` may
   legitimately return `0` when there is too little trailing audio — under 25% of
   the loop length — to correlate against).
2. **Failed quality gates throw**, and the error names the gate that failed and
   suggests an alternative. There is no silent downgrade to a worse answer.

```js
try {
  await loop.detect(shortClip, { strategy: 'precise' })
} catch (err) {
  // "precise: candidate gate failed — no onset pair inside the search window
  //  produced a scoreable loop ... Try strategy 'fast' or 'musical'."
  console.warn(err.message)
}
```

You can also measure confidence directly for an arbitrary `[start, end)` region
with the same math the strategies use:

```js
import { loop } from 'pleco-xa'

const y = audioBuffer.getChannelData(0)
const c = loop.measureLoopConfidence(y, audioBuffer.sampleRate, 0.5, 2.5)
// 0..1 ; returns 0 when trailing audio < 25% of the loop length
```

The scoring helpers — `measureLoopConfidence`, `normalizedCrossCorrelation`,
`clamp01` — are all exported on the `loop` namespace if you want to build your
own scoring on top of them.

## Loop primitives

Two lower-level building blocks back the strategies and are exported for direct
use.

### `LoopController` — loop state as pure data

A dependency-free state machine for a loop expressed in **normalized `0..1`
positions** over the buffer. No audio engine is attached; it is pure state you
can drive from a UI, a sequencer, or a test. Every mutator returns a result
object (`{ success, loop, reason? }`) rather than throwing.

```js
import { loop } from 'pleco-xa'

const controller = new loop.LoopController({ minLoopDuration: 0.05 }) // 50 ms floor
controller.setAudioBuffer(audioBuffer)
controller.setLoop(0.25, 0.75)

controller.halfLoop()        // { success: true, loop: { start: 0.25, end: 0.5 }, ... }
controller.moveLoopForward() // slides the window forward by its own length
controller.doubleLoop()      // symmetric to halfLoop, clamps end to 1.0
controller.resetLoop()       // back to { start: 0, end: 1 }
```

This is the same half / double / move-forward vocabulary the demo's live loop
controls are built on — see the [Playback guide](./playback.md) for wiring
it to actual sound, and the [Play guide](./play.md) for driving it
algorithmically.

### `DynamicZeroCrossing` — clean boundaries

Snapping a musically-correct loop point to the nearest zero crossing removes the
click at the seam without moving the boundary audibly. `DynamicZeroCrossing` is
an all-static utility for exactly that, plus micro-crossfade generation for the
cases where the nearest crossing is too far to snap silently.

```js
import { loop } from 'pleco-xa'

const y = audioBuffer.getChannelData(0)
const [snapStart, snapEnd] = loop.DynamicZeroCrossing.snap(y, 22579, 116688)
// default search window is ±441 samples (~10 ms @ 44.1 kHz)
```

The convenience function `loop.snapToZeroCrossings(y, start, end, window?)`
wraps the same call for callers who prefer a plain function over a static method.

## Verified in CI

Loop detection is not just asserted by hand. `loop.detect()` is fixture-gated in
CI against `loop_goldens.json` with a **±10 ms** tolerance on the returned loop
points, so regressions in any strategy break the build.

## See it live

The [Gallery](https://plecoxa.com/gallery/) hosts the interactive loop demos — the four-strategy
shootout on the same clip, the tempo-free recurrence heatmap, and the DJ-style
loop comparison crate — where you can hear each strategy's boundaries and watch
the confidence numbers move as you swap material.
