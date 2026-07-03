---
title: Coming from librosa
description: How Pleco-Xa's API maps to librosa, function by function — and where it deliberately differs.
---

Pleco-Xa is its own library, but you'll find it covers everything librosa does —
validated function by function against pinned librosa via committed fixtures,
checked in CI. If you know librosa, here is the map. And where an offline Python
library structurally can't go — real-time analysis, loop-point detection — pleco
does more.

## Function map (fixture-verified)

Every row below is gated in CI against a golden fixture generated from real
librosa. See the [Parity ledger](/reference/parity/) for the fixture sets.

| librosa | pleco-xa | verified against |
|---|---|---|
| `librosa.stft` / `istft` | `stft` / `istft` | round-trip fixture |
| `librosa.fft_frequencies` | `fft_frequencies` | exact |
| `librosa.hz_to_mel` / `mel_to_hz` | `convert.hz_to_mel` / `mel_to_hz` (slaney + htk) | exact |
| `librosa.amplitude_to_db` / `power_to_db` | `convert.amplitude_to_db` / `power_to_db` | exact |
| `librosa.A_weighting` … `D_weighting` | `convert.A_weighting` … `D_weighting` | exact IEC constants |
| `librosa.filters.mel` | `filters.mel` (slaney + htk) | exact |
| `librosa.feature.melspectrogram` | `feature.melspectrogram` | fixture |
| `librosa.feature.mfcc` | `feature.mfcc` | 8.7e-5 (dB scale) |
| `librosa.feature.chroma_stft` | `feature.chroma_stft` | fixture incl. tuning |
| `librosa.feature.spectral_*` | `feature.spectral_centroid` / `bandwidth` / `rolloff` / `flatness` / `contrast` | descriptor math bit-exact |
| `librosa.feature.rms` / `zero_crossing_rate` | `feature.rms` / `zero_crossing_rate` | exact |
| `librosa.onset.onset_strength` | `onset_strength` | log-power-mel, fixture |
| `librosa.feature.tempo` | `tempo` | bit-exact |
| `librosa.beat.beat_track` | `beat_track` | exact frames |
| `librosa.feature.tempogram` / `tempogram_ratio` | `tempogram` / `tempogram_ratio` | fixture |
| `librosa.pyin` | `pyin` | grid-exact (HMM/Viterbi) |
| `librosa.effects.trim` / `split` | `effects.trim` / `split` | exact |
| `librosa.effects.preemphasis` / `deemphasis` | `effects.preemphasis` / `deemphasis` | 5.96e-8 |
| `librosa.phase_vocoder` / `effects.time_stretch` / `pitch_shift` | `effects.phaseVocoder` / `timeStretch` / `pitchShift` | ≤1e-3 of peak |
| `librosa.decompose.hpss` | `decompose.hpss` | 1.6e-5, H+P≈S |
| `librosa.pcen` | `pcen` | bit-exact (9e-8) |
| `librosa.decompose.nn_filter` | `decompose.nn_filter` | REPET-SIM |
| `librosa.sequence.dtw` | `sequence.dtw` | bit-exact cost + path |
| `librosa.sequence.rqa` | `rqa` | exact path |
| `librosa.sequence.viterbi_discriminative` | `sequence.viterbi_discriminative` | exact path |
| `librosa.sequence.transition_*` | `sequence.transition_uniform` / `loop` / `cycle` / `local` | exact |
| `librosa.segment.recurrence_matrix` | `segment.recurrenceMatrix` | exact |
| `librosa.segment.recurrence_to_lag` / `agglomerative` | `segment.recurrenceToLag` / `agglomerative` | exact |
| `librosa.util.match_intervals` / `match_events` | `sequence.matchIntervals` / `matchEvents` | exact |
| `librosa.f0_harmonics` | `f0_harmonics` | exact (scalar + inf-head grids) |

> `beat_track`, `tempo`, `pyin`, `onset_strength`, `rqa`, `pcen`, `decodeWav`
> and `f0_harmonics` are **top-level** exports; the rest live under their
> namespace (`feature.*`, `effects.*`, `segment.*`, `sequence.*`, `convert.*`,
> `decompose.*`, `filters.*`, `loop.*`).

## Deliberate differences (exceptions ledger)

- **`librosa.display.*`** → pleco's `display` namespace is **canvas-native** and
  interactive (it runs in the browser). matplotlib semantics don't apply — this
  is an upgrade, not a gap.
- **`icqt` / `griffinlim_cqt`** → honest not-implemented throws (CQT dual-frame
  inverse). Documented, never faked.
- **Node codec breadth** → the browser's `decodeAudioData` covers most formats;
  Node ships built-in WAV decoding plus an injectable decoder hook for the rest.

## What librosa can't do

- **Real-time streaming** — `createRmsMeter`, `createFluxAnalyzer` are worker-safe
  incremental analyzers.
- **Live tempo** — `quickTempo` gives a ~5–10 s windowed estimate as an explicit tier.
- **The `loop` namespace** — intelligent loop-point detection with no librosa
  equivalent. It is pleco's signature capability.

Pleco-Xa is a music-first, browser-native engine that happens to cover librosa's
ground — not a port of it.
