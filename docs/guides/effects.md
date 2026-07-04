---
title: Effects — time-scale, pitch, and silence
description: Pleco-Xa's effects namespace — a real phase vocoder plus trim/split, pre-emphasis, remix, time-stretch and pitch-shift, all validated against reference fixtures.
---

`effects` is Pleco-Xa's waveform-processing surface: silence trimming, pre/de-emphasis
filtering, interval remixing, and — the centrepiece — a genuine phase vocoder driving
pitch-preserving time-stretch and duration-preserving pitch-shift. Everything here takes
a mono `Float32Array` and a sample rate where one is needed, and returns arrays. There are
no default fallbacks: `time_stretch` and `pitch_shift` either honour their contract or
throw.

The whole namespace was validated against reference fixtures during
development: `trim`/`split` are exact, `preemphasis`/`deemphasis` to
5.96e-8, and the phase vocoder to within 1e-3 of the peak at rates 0.5 and 2.0.

## Key functions

All verified against the built barrel (`effects` namespace):

- **`trim(y, opts)`** → `[y_trimmed, [start, end]]`. Leading/trailing silence removal;
  `y_trimmed === y.slice(start, end)`.
- **`split(y, opts)`** → `Array<[start, end)>`. Non-silent interval sample ranges.
- **`preemphasis(y, opts)`** / **`deemphasis(y, opts)`** — exact inverse pair
  (`deemphasis(preemphasis(x)) === x`); pass `return_zf: true` to chain blocks.
- **`remix(y, intervals, opts)`** — concatenate intervals in **caller order** (reordering
  is the point); boundaries snap to zero crossings by default.
- **`phase_vocoder(D, rate, opts)`** — time-stretch an STFT matrix `[freq][time]` of
  `{real, imag}` bins (the engine under `time_stretch`).
- **`time_stretch(y, rate, opts)`** → length `round(n / rate)`, pitch preserved.
- **`pitch_shift(y, sr, n_steps, opts)`** → same length as `y`, duration preserved.
- **`hpss(y, opts)`** / **`harmonic(y, opts)`** / **`percussive(y, opts)`** —
  waveform-level harmonic/percussive separation (returns time-domain signals; the
  spectrogram-level version lives in [`decompose`](./decompose.md)).

## Example

```js
import { effects } from 'pleco-xa'

// y: Float32Array (mono), sr: sample rate (e.g. from decodeWav or audioio.load)
const [clean, [start, end]] = effects.trim(y, { top_db: 60 })

const slower = effects.time_stretch(clean, 0.5) // 2x longer, same pitch
const up = effects.pitch_shift(clean, sr, 4)    // +4 semitones, same length

// Reverse two beats by remixing intervals out of order:
const swapped = effects.remix(clean, [
  [sr * 1.0, sr * 1.5],
  [sr * 0.5, sr * 1.0],
])
```

## Notes

- **Silence reference is max frame RMS**, not peak sample amplitude — using peak would
  over-trim by 6–15 dB. Good defaults: `top_db: 60`, `frame_length: 2048`,
  `hop_length: 512`.
- **All-silent input to `trim` returns an empty slice `[0, 0]`.**
- **`pitch_shift` resampling uses linear interpolation** (no anti-aliasing filter). Downward
  shifts (upsampling) are clean; upward shifts can alias above `~sr / (2 * rate)`. This is a
  documented fidelity limit of the current resampler, not a silent fallback.
- **The phase vocoder wraps the deviation from the expected phase advance** (Ellis 2002),
  not the raw phase delta, and pads two zero columns at the boundary — that is what buys the
  ≤1e-3 accuracy.
- `rate <= 0` throws in `time_stretch`/`phase_vocoder`; a non-positive-integer
  `bins_per_octave` throws in `pitch_shift`.

## API reference

Full signatures and per-option defaults: [effects namespace](../api-by-category.md)
— e.g. [`time_stretch`](https://plecoxa.com/api/pleco-xa/namespaces/effects/functions/time_stretch/),
[`pitch_shift`](https://plecoxa.com/api/pleco-xa/namespaces/effects/functions/pitch_shift/),
[`trim`](https://plecoxa.com/api/pleco-xa/namespaces/effects/functions/trim/).
