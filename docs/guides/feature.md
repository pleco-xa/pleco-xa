---
title: Feature extraction
description: Mel spectrograms, MFCCs, chroma, and the spectral descriptors — the feature namespace, fixture-verified in CI.
---

The `feature` namespace turns a signal into the compact representations that
downstream analysis and machine learning consume: mel spectrograms, MFCCs,
chroma, and a family of spectral descriptors. Every function here is
fixture-verified — the descriptor math is numerically exact, MFCC lands
within 8.7e-5 on the dB scale, and chroma includes tuning estimation.

Like the rest of the library it is **arrays in, arrays out**: pass a mono
`Float32Array` and a sample rate (or a precomputed spectrogram where a function
accepts one).

## Key functions

- `feature.melspectrogram(y, { sr, n_fft, hop_length, n_mels })` — Slaney-scale
  mel spectrogram (HTK optional). Slaney is the default; this is the
  front end for MFCC and PCEN.
- `feature.mfcc(y, { sr, n_mfcc })` — mel-frequency cepstral coefficients:
  log-power mel → DCT-II → optional liftering. `feature.mfccFromLogMel` runs the
  cepstral core directly on a log-mel matrix.
- `feature.chroma_stft(y, { sr, n_fft, hop_length })` — 12-bin pitch-class energy
  via the Gaussian chroma filterbank, including tuning estimation.
- `feature.spectral_centroid` / `spectral_bandwidth` / `spectral_rolloff` /
  `spectral_flatness` / `spectral_contrast` — the spectral descriptors, each
  accepting a signal or a magnitude spectrogram `S`.
- `feature.rms(y)` / `feature.zero_crossing_rate(y)` — frame-wise energy and
  zero-crossing rate.
- `feature.pitch_tuning` / `feature.estimate_tuning` — deviation from A440 in
  fractional bins; feeds chroma.
- `feature.piptrack_peaks` / `feature.logFrequencySpectrum` — parabolic pitch
  peaks and a log-frequency spectrum (an approximate constant-Q, honestly named —
  it is not a true CQT).

## Example

```js
import { feature } from 'pleco-xa'

// y: mono Float32Array, sr: sample rate
const mel = feature.melspectrogram(y, { sr, n_fft: 2048, hop_length: 512, n_mels: 128 })
const mfcc = feature.mfcc(y, { sr, n_mfcc: 20 })          // [20][n_frames]
const centroid = feature.spectral_centroid(y, { sr })     // brightness, per frame
const chroma = feature.chroma_stft(y, { sr })             // [12][n_frames]
```

## Notes

- **Slaney mel is the default** (HTK is opt-in via `htk: true`) — the single
  biggest lever on mel and MFCC values.
- The MFCC pipeline uses `power_to_db` (not natural log) and a cached DCT-II
  basis, following the standard cepstral definition.
- `logFrequencySpectrum` is an FFT-bin approximation, **not** a true constant-Q
  transform — it is named honestly rather than sold as CQT.
- MFCC deltas: `delta_features` (exported top-level) is a width-9
  Savitzky-Golay slope on interior frames; edges use clamp replication.

See the [API reference](/api-by-category/) for every function's full signature and
per-option defaults.
