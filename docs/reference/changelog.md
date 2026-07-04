---
title: Changelog
description: Release history for Pleco-Xa.
---

## 2.0

The 2.0 line is the release where Pleco-Xa became a complete, verifiable audio
engine rather than a collection of scripts. The through-line of the development
arc: **prove every claim.** Function after function was validated against
numerical reference fixtures, and the CI suite grew to 27 test files
(237 tests) that run on every push — so "correct" stopped being a marketing
word and became a build-breaking test.

### Fixture-verified correctness across domains

Validation during the 2.0 arc ran against reference fixtures spanning the
whole analysis surface:

- **Core DSP** — windows (hann/hamming/blackman), STFT magnitude and istft
  round-trip, fft/ifft, and the full family of frequency/time/sample
  conversions, all bit-exact.
- **Spectral & features** — mel filterbank and melspectrogram, MFCC (full
  pipeline), chroma with tuning estimation, and the spectral descriptors
  (centroid, bandwidth, rolloff, flatness, contrast, RMS, ZCR).
- **Rhythm** — `onset_strength`, bit-exact `tempo`, and `beat_track` with exact
  frame agreement.
- **Effects & decompose** — trim/split, preemphasis/deemphasis, phase vocoder,
  time-stretch, pitch-shift, and HPSS (with margin; H+P ≈ S at margin 1).
- **Structure & sequence** — DTW (bit-exact cost, exact path), recurrence
  matrix and recurrence↔lag, agglomerative segmentation, RQA, and the Viterbi
  family (`viterbi_discriminative`, transition matrices).
- **Missing-pieces wave** — symmetric eigendecomposition (`eigh`), normalized
  graph Laplacian, k-means, PCEN (bit-exact, 9e-8), and full McFee-Ellis
  **Laplacian segmentation** built from those primitives.

### Loop detection: the flagship

The signature capability was consolidated into a single public API,
[`loop.detect()`](/guides/loop/), over four explicit strategies — `fast`,
`precise`, `musical`, and `recurrence` — with:

- A **unified `0..1` confidence** convention derived from real cross-correlation
  measurement, replacing two legacy ad-hoc scales. Confidence is never
  fabricated; strategies that can't measure anything throw.
- **No silent cross-strategy fallback.** Failed quality gates throw diagnostic
  errors that name the gate and suggest an alternative.
- A **±10 ms golden gate** in CI (`loop_goldens.json`), so loop regressions
  break the build.
- Exposed primitives — `LoopController` (pure normalized loop state) and
  `DynamicZeroCrossing` (boundary snapping + micro-crossfades).

### Real-time, in the browser, zero dependencies

Live, in-browser capabilities:

- `RealtimeSpectrumAnalyzer` and the streaming analyzers for live visualization
  and metering.
- The canvas-native [display tier](/guides/display/) (waveforms, spectrograms,
  colormaps) drawing straight to `<canvas>`.
- Seamless loop playback (`LoopPlayer`, native sample-accurate looping) and an
  event-driven transport (`AudioPlayer`).
- The [Play layer](/guides/play/) — the Echoplex-homage creative instruments
  (loop playground, beat glitcher, quantum sequencer) driven by a
  self-correcting `GibClock`.

Pleco-Xa ships with **zero runtime dependencies** and no build step: the same
code runs in the browser on a real `AudioBuffer` and in Node on a duck-typed
shim.

### Also landed

- `pyin` / `yin` pitch tracking, DTW-based sequence alignment and matching, and
  structural segmentation promoted onto the curated public surface.
- Universal-runtime `playback` operations (half/double-speed, gap detection and
  closing, reversal) hoisted from the demo into the library as pure functions
  with an injectable buffer factory.

> **Versioning note.** The current release line is **2.0.x** (latest `2.0.3`),
> published on npm as `pleco-xa`. The loop-point golden gate and the full
> 27-suite test run are enforced in CI on every push.
