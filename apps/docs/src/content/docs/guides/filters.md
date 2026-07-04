---
title: Filter banks & windows
description: The mel and chroma filterbanks and analysis windows that feature extraction is built on — the filters namespace.
---

The `filters` namespace holds the reusable building blocks that the feature layer
composes: the mel filterbank, the chroma filterbank, and the analysis windows.
If `feature` is the "what," `filters` is the "how" — the matrices and window
functions you can pull out and apply yourself when building a custom pipeline.

## Key functions

- `filters.mel_filterbank({ sr, n_fft, n_mels, htk, norm })` — the mel projection
  matrix: continuous Slaney triangular ramps over the FFT frequency grid with
  Slaney area normalization (HTK scale and other norms optional). Multiply it
  against a power spectrogram to get a mel spectrogram.
- `filters.chroma({ sr, n_fft })` — the chroma filterbank: Gaussian pitch-class
  bumps with octave weighting and tuning.
  `feature.chroma_stft` is a matmul of this against the energy spectrum.
- `filters.get_window(type, n)` — a window function (`hann`, `hamming`,
  `blackman`). **Periodic** by convention (`fftbins=True`), matching scipy —
  the correct choice for spectral analysis.

## Example

```js
import { filters, stft } from 'pleco-xa'

// build the mel matrix once, reuse across frames
const melFb = filters.mel_filterbank({ sr: 22050, n_fft: 2048, n_mels: 128 })

// a periodic Hann window for your own STFT framing
const win = filters.get_window('hann', 2048)
```

## Notes

- Windows are **periodic** (`2π·i / n`), not symmetric (`/(n-1)`). This is the
  scipy `fftbins=True` convention; the symmetric form skews every spectrogram bin.
- The mel filterbank defaults to the **Slaney** scale with area normalization.
  Pass `htk: true` for the HTK scale.
- These are the same filterbanks `feature.melspectrogram` and
  `feature.chroma_stft` use internally; exposing them lets you build custom
  feature stacks without re-deriving the matrices.

See the [API reference](/api-by-category/) for full signatures.
