---
title: Onset detection
description: The canonical onset envelope (onset_strength) and the fast heuristic peak-picker (onsetDetect), and how their timing conventions differ.
---

Onset detection answers "where do the events start?" — the note attacks, drum
hits, and transients that a beat tracker or segmentation pass builds on.
Pleco-Xa gives you two tools with different contracts. `onset_strength` is the
canonical onset envelope: a log-power-mel spectral-flux curve, fixture-gated
in CI and used as the front end of the canonical beat engine.
`onsetDetect` is a faster, standalone heuristic that returns picked onset times
directly.

The two differ in timing convention, and it matters. `onset_strength` uses
centered frames (so its frame count is exactly `ceil(len / hop)`), while
`onsetDetect` uses uncentered frames and reads *early*. Pick the tool that
matches your tolerance.

## Key functions

- `onset_strength(y, opts?)` — the canonical onset envelope
  (log-power-mel spectral flux). Returns a `Float32Array` of exactly
  `ceil(len / hop)` frames. Supports `lag` and `max_size` (the superflux knobs).
- `onsetDetect(audioData, sampleRate, { hopLength?, frameLength?, delta?, wait? })`
  — a fast heuristic peak-picker returning onset positions. Good demo params:
  `hopLength: 512`, `delta: 0.07`.

## Example

```js
import { onset_strength, onsetDetect, convert } from 'pleco-xa'

// Canonical onset envelope — feeds the beat tracker, one value per frame
const env = onset_strength(y, { sr, hop_length: 512 })
env.length // ceil(y.length / 512)

// Superflux is just onset_strength with a mel lag and frequency max-filter
const superflux = onset_strength(y, { sr, lag: 2, max_size: 3 })

// Fast standalone detector -> { onsetTimes, onsetStrength, onsetFrames }
const { onsetTimes } = onsetDetect(y, sr, { hopLength: 512, delta: 0.07 })
```

## Notes

- **`onset_strength` is frame-exact.** With `center=true` it returns exactly
  `ceil(len / hop)` frames, and it is fixture-gated
  (`onset_strength.json`). Pair it with `peakPick` from the
  [utilities](/guides/util/) to land beats within ±1 hop (~23 ms) of truth.
- **`onsetDetect` reads early.** Its uncentered STFT reports frame-*start*
  times, so detected onsets land ~48–68 ms (up to one `n_fft` window ≈ 93 ms at
  `sr=22050`) before the true event. Use a ~100 ms tolerance when comparing to
  ground truth, and remember it does not use the centered-frame convention that
  `onset_strength` does.
- **`onsetDetect` uses a different peak rule.** Its threshold is
  `mean + absolute delta`, *not* the `peakPick` rule — it is a fast heuristic,
  not the canonical peak-picker.
- **N clicks → N−1 onsets.** On a click train, `onsetDetect` typically finds one
  fewer onset than there are clicks: the click at `t=0` has no preceding
  low-energy frame to produce a positive spectral-flux rise.
- **Superflux needs high time resolution.** `onset_strength(S = power_to_db(mel),
  lag = 2, max_size = 3)` reproduces the superflux ODF, but a ±30-cent vibrato is
  invisible at the default `hop=512` — use a ~5 ms hop (`sr/200`) for the
  contrast to appear.

See the [API reference](/api/) for full signatures and defaults.
