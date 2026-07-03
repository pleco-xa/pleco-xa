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
Where Pleco-Xa deliberately matches — or deliberately diverges from — a
well-known reference like librosa, the Notes section says so precisely.

## The guides

- **[Core DSP & conversions](/guides/core/)** — FFT, STFT/ISTFT, analysis
  windows, and the `convert` namespace (Hz ↔ mel ↔ MIDI ↔ notes, dB scaling,
  frame/time/sample bookkeeping).
- **[Audio I/O](/guides/io/)** — loading audio in the browser via the `audioio`
  namespace, the one canonical WAV codec (`encodeWav` / `decodeWav`), signal
  generators, and file/stream helpers.
- **[Utilities](/guides/util/)** — framing, boundary fixing, beat-synchronous
  aggregation, and peak picking (`frame`, `sync`, `fix_frames`, `peakPick`,
  `buf_to_float`, `valid_audio`).
- **[Beat & tempo](/guides/beat/)** — the canonical Ellis dynamic-programming
  beat tracker (`beat_track`), tempo estimation (`tempo`), the quick tier
  (`quickTempo`), tempograms, and the `bpm` stability analyzer.
- **[Onset detection](/guides/onset/)** — the parity onset envelope
  (`onset_strength`) and the fast heuristic peak-picker (`onsetDetect`).
- **[Spectral features](/guides/feature/)** — the `feature` namespace:
  mel spectrogram, MFCC, chroma, spectral descriptors, and `delta_features`.
- **[Filters & windows](/guides/filters/)** — the `filters` namespace:
  `mel_filterbank`, `chroma`, and `get_window`.

For the full generated signature reference of every export, see the
[API reference](/api/).
