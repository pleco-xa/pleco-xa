---
title: Guides
description: Narrative, task-oriented guides to each area of the Pleco-Xa API — from FFT primitives to beat tracking and spectral features.
---

Pleco-Xa is a browser-native audio analysis engine. The API is organized into
focused areas, each covering one layer of the pipeline: raw DSP at the bottom,
musical intelligence on top. These guides walk through each area conceptually,
show a runnable snippet, and flag the gotchas worth knowing before you lean on a
function in production.

Every function named here is a real export, verified against the built package.
Where a function has a subtle contract or a sharp edge worth knowing, the Notes
section says so precisely.

## The guides

### Start here

- **[Loop detection](./loop.md)** — Pleco-Xa's signature capability: one
  entry point, four strategies, and a single honest confidence score.

### Audio engine

- **[Studio](./studio.md)** — Pleco-Xa's own audio graph: a zero-dependency,
  headless reimplementation of the Web Audio API wearing pleco's names
  (`offline()`, `Osc`, `Gain`, `s.filter()`). Build and render node graphs in
  the browser or in Node, verified bit-for-bit against the browser.

### Musical timing

- **[Beat & tempo](./beat.md)** — the Ellis dynamic-programming beat tracker
  (`beat_track`), tempo estimation (`tempo`), the quick live tier (`quickTempo`),
  tempograms, and the `bpm` stability analyzer.
- **[Onset detection](./onset.md)** — the canonical onset envelope
  (`onset_strength`) and the fast heuristic peak-picker (`onsetDetect`).

### Features & structure

- **[Feature extraction](./feature.md)** — the `feature` namespace: mel
  spectrograms, MFCCs, chroma, spectral descriptors, and `delta_features`.
- **[Segment](./segment.md)** — recurrence and cross-similarity matrices,
  the time-lag shear, and agglomerative / Laplacian structure.
- **[Sequence](./sequence.md)** — bit-exact DTW, recurrence quantification
  (RQA), Viterbi decoding, and transition matrices.
- **[Cluster](./cluster.md)** — deterministic k-means (Lloyd's algorithm
  with greedy k-means++ seeding).
- **[Linalg](./linalg.md)** — a pure-JS symmetric eigensolver (Jacobi) and
  the normalized graph Laplacian the higher-level analyses build on.

### Transformation & separation

- **[Effects](./effects.md)** — a real phase vocoder (time-scale, pitch),
  plus trim/split, pre-emphasis, and remix.
- **[Decompose](./decompose.md)** — median-filter HPSS, soft masking,
  nearest-neighbour (REPET-SIM-style) filtering, and a supervised stem-guided
  vocal-matching pipeline.

### Primitives

- **[Core DSP & conversions](./core.md)** — FFT, STFT/ISTFT, analysis
  windows, and the `convert` namespace (Hz ↔ mel ↔ MIDI ↔ notes, dB scaling,
  frame/time/sample bookkeeping).
- **[Filter banks & windows](./filters.md)** — the mel and chroma
  filterbanks and analysis windows feature extraction is built on.
- **[Utilities](./util.md)** — framing, boundary fixing, beat-synchronous
  aggregation, peak picking, and buffer helpers.

### Audio I/O, playback & display

- **[Audio I/O](./io.md)** — loading audio in the browser via the `audioio`
  namespace, the canonical WAV codec (`encodeWav` / `decodeWav`), and signal
  generators.
- **[Playback](./playback.md)** — turning a detected loop into sound:
  seamless loop players and an event-driven transport.
- **[Play](./play.md)** — the creative choreography layer that treats a
  detected loop as an instrument (algorithmic live loop mangling).
- **[Display](./display.md)** — the canvas-native visualization tier:
  waveforms, spectrograms, colormaps, and live meters.

For the full generated signature reference of every export, see the
[API reference](../api-by-category.md).
