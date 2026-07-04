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

- **[Loop detection](/guides/loop/)** — Pleco-Xa's signature capability: one
  entry point, four strategies, and a single honest confidence score.

### Musical timing

- **[Beat & tempo](/guides/beat/)** — the Ellis dynamic-programming beat tracker
  (`beat_track`), tempo estimation (`tempo`), the quick live tier (`quickTempo`),
  tempograms, and the `bpm` stability analyzer.
- **[Onset detection](/guides/onset/)** — the canonical onset envelope
  (`onset_strength`) and the fast heuristic peak-picker (`onsetDetect`).

### Features & structure

- **[Feature extraction](/guides/feature/)** — the `feature` namespace: mel
  spectrograms, MFCCs, chroma, spectral descriptors, and `delta_features`.
- **[Segment](/guides/segment/)** — recurrence and cross-similarity matrices,
  the time-lag shear, and agglomerative / Laplacian structure.
- **[Sequence](/guides/sequence/)** — bit-exact DTW, recurrence quantification
  (RQA), Viterbi decoding, and transition matrices.
- **[Cluster](/guides/cluster/)** — deterministic k-means (Lloyd's algorithm
  with greedy k-means++ seeding).
- **[Linalg](/guides/linalg/)** — a pure-JS symmetric eigensolver (Jacobi) and
  the normalized graph Laplacian the higher-level analyses build on.

### Transformation & separation

- **[Effects](/guides/effects/)** — a real phase vocoder (time-scale, pitch),
  plus trim/split, pre-emphasis, and remix.
- **[Decompose](/guides/decompose/)** — median-filter HPSS, soft masking,
  nearest-neighbour filtering, and pure-DSP vocal separation.

### Primitives

- **[Core DSP & conversions](/guides/core/)** — FFT, STFT/ISTFT, analysis
  windows, and the `convert` namespace (Hz ↔ mel ↔ MIDI ↔ notes, dB scaling,
  frame/time/sample bookkeeping).
- **[Filter banks & windows](/guides/filters/)** — the mel and chroma
  filterbanks and analysis windows feature extraction is built on.
- **[Utilities](/guides/util/)** — framing, boundary fixing, beat-synchronous
  aggregation, peak picking, and buffer helpers.

### Audio I/O, playback & display

- **[Audio I/O](/guides/io/)** — loading audio in the browser via the `audioio`
  namespace, the canonical WAV codec (`encodeWav` / `decodeWav`), and signal
  generators.
- **[Playback](/guides/playback/)** — turning a detected loop into sound:
  seamless loop players and an event-driven transport.
- **[Play](/guides/play/)** — the creative choreography layer that treats a
  detected loop as an instrument (algorithmic live loop mangling).
- **[Display](/guides/display/)** — the canvas-native visualization tier:
  waveforms, spectrograms, colormaps, and live meters.

For the full generated signature reference of every export, see the
[API reference](/api-by-category/).
