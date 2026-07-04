---
title: Utilities
description: Framing, boundary fixing, beat-synchronous aggregation, peak picking, and buffer helpers for building custom analysis pipelines.
---

The utility functions are the connective tissue between raw audio and the
higher-level analyzers: they slice a signal into overlapping frames, snap frame
boundaries to a valid range, aggregate features between beat markers, and pick
peaks out of a detection function. When you assemble your own pipeline — say, a
custom onset detector or a beat-synchronous feature stack — these are the pieces
you reach for.

## Key functions

- `frame(x, { frameLength, hopLength, axis? })` — slice a signal (or a 2-D
  spectrogram) into overlapping frames.
- `fix_frames(frames, x_min?, x_max?, pad?)` — clamp/deduplicate frame indices
  and optionally pad with the boundaries.
- `sync(data, idx, aggregate?, pad?, axis?)` — aggregate a `[features][time]`
  matrix between index boundaries (e.g. beat-synchronous mean/max). `aggregate`
  is a reducer **function** (defaults to mean).
- `peakPick(x, { preMax, postMax, preAvg, postAvg, delta, wait, sparse? })` —
  the `peak_pick` peak-picker used by the canonical onset path.
- `buf_to_float(x, n_bytes?, dtype?)` — convert integer PCM buffers to floats.
- `valid_audio(y, mono?)` — validate a time series, throwing on the wrong shape.

## Example

```js
import { frame, fix_frames, sync } from 'pleco-xa'

// Slice a ramp into 10-sample frames hopping by 5 -> 19 frames of length 10
const x = Float32Array.from({ length: 100 }, (_, i) => i)
const frames = frame(x, { frameLength: 10, hopLength: 5 })
frames.length // 19  (each row is a copied length-10 frame)

// Snap a set of frame indices into [0, 12], padding with the boundaries
fix_frames([3, 7, 9], 0, 12) // [0, 3, 7, 9, 12]

// Beat-synchronous aggregation of a [features][time] matrix.
// aggregate is a reducer function; pass the endpoints (0 and T) yourself.
const feats = [
  Float32Array.from([0, 1, 2, 3, 4, 5]),
  Float32Array.from([10, 10, 10, 20, 20, 20]),
]
const mean = (a) => a.reduce((s, v) => s + v, 0) / a.length
sync(feats, [0, 3, 6], mean) // [[1, 4], [10, 20]]  ([features][segments])
```

## Notes

- **`frame` copies; it does not return a view.** There is no zero-copy strided
  view — every frame is a fresh copy. For a 2-D spectrogram
  the patch layout is `[patch][mel][time]` (the transpose of a
  `(mel, L, n_patches)` layout). Budget the memory: a 33×128×215 patch tensor is
  ~3.6 MB of duplicated floats.
- **`sync` aggregates *between* consecutive boundaries and ignores its `pad`
  flag.** For `pad=true`-style output, pass explicit boundaries
  including the endpoints — `[0, ...beats, T]`. It stores results as
  `Float32Array`, so exactness assertions should compare against
  `Math.fround(mean)`, not the double-precision mean.
- **`peakPick` is the canonical peak-picker.** It is the same `peak_pick` the
  centered `onset_strength` path uses to land beats within ±1 hop of truth —
  distinct from `onsetDetect`'s faster mean-plus-delta heuristic.
- **`fix_frames` is inclusive and sorted.** It clamps into `[x_min, x_max]`,
  removes duplicates, and (with `pad`) prepends/appends the boundaries.
- These are Tier-1 promotions to the curated public surface, fixture-verified
  before shipping.

See the [API reference](/api-by-category/) for full signatures and defaults.
