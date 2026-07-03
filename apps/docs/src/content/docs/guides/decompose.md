---
title: Decompose — HPSS, masks, and vocal separation
description: pleco-xa's decompose namespace — one canonical median-filter HPSS, soft masking, nearest-neighbour filtering, and the pure-DSP vocal-separation flagship.
---

`decompose` operates on spectrograms. It carries pleco-xa's single canonical
harmonic/percussive source separation (HPSS), the soft-mask primitive underneath it,
nearest-neighbour filtering for REPET-SIM-style repetition removal, and pleco's own
**vocal-separation flagship** — a multi-scale spectral fingerprinting pipeline that pulls a
vocal out of a mix using nothing but DSP. There is no machine-learning model anywhere in
this namespace: zero weights, zero inference runtime, no ONNX, just median filters, masks,
and gradient-optimised EQ curves.

The HPSS/softmask core is fixture-gated in CI (`hpss.json`, including
`margin=2`); harmonic + percussive ≈ the input at `margin=1`.

## Key functions

Verified against the built barrel (`decompose` namespace):

- **`hpss(S, opts)`** → `{ harmonic, percussive }` spectrograms. Default (`mask: false`)
  returns the **masked components** `S · mask`, so `harmonic + percussive ≈ S` at
  `margin=1`. Accepts magnitude rows or complex `{real, imag}` bins (phase is reapplied).
- **`softmask(X, X_ref, opts)`** → mask matrix `X^p / (X^p + X_ref^p)` with
  rescale-by-max stabilisation; `power: Infinity` gives a hard mask (`X > X_ref`).
- **`nn_filter(S, opts)`** — replace each frame by an aggregate of its nearest neighbours in
  a recurrence graph. `aggregate: 'median'` + `metric: 'cosine'` + a width band is the
  REPET-SIM configuration.
- **`processAudioToFingerprints(audioBuffer, nFft?, hopLength?)`** — the vocal-separation
  entry point: multi-scale spectral fingerprints from an `AudioBuffer`-shaped input.
- **`optimizeEqCurves(vocalFps, mixtureFps, mixtureMag, numWindows, sr, ...)`** — gradient
  descent for the per-window EQ curves that isolate the vocal.
- **`reconstructVocal(mixtureStft, eqCurves, sr, nFft?, hopLength?)`** → `Float32Array` of
  the reconstructed vocal.

> **Two HPSS entry points, on purpose.** `decompose.hpss(S, …)` takes a **spectrogram** and
> returns spectrograms. [`effects.hpss(y, …)`](/api/pleco-xa/namespaces/effects/functions/hpss/)
> takes a **waveform**, runs this same core, and inverts back to time-domain signals.

## Example

```js
import { decompose, stft } from 'pleco-xa'

// y: Float32Array (mono)
const D = stft(y, 2048, 512) // [freq][time] complex bins

const { harmonic, percussive } = decompose.hpss(D, { margin: 1 })
// harmonic + percussive ≈ D (masked components) at margin=1

// REPET-SIM-style repetition suppression on a magnitude spectrogram S:
const foreground = decompose.nn_filter(S, {
  aggregate: 'median',
  metric: 'cosine',
  width: 3,
})
```

## Notes

- **`hpss` default is masked components, not raw median filters.** The legacy pleco copies
  returned the bare median-filtered spectrograms; this canonical version applies the soft
  masks so the components sum back to the input. `kernel_size` default is 31; margins must be
  `>= 1`.
- **Vocal separation input only needs `{ getChannelData, sampleRate }`** — it runs in Node
  against a structural mock, no browser required. Note `optimizeEqCurves`/`reconstructVocal`
  print console banners as they iterate; the flagship's exact multi-stage wiring
  (fingerprints → mixture magnitude → EQ curves → reconstruction) is shown end-to-end in the
  vocal-separation demo.
- **`nn_filter` builds its recurrence graph from
  [`segment.recurrenceMatrix`](/api/pleco-xa/namespaces/segment/functions/recurrenceMatrix/)**;
  frames with no neighbours pass through unchanged. Supported `aggregate` values are `'mean'`,
  `'median'`, `'average'` (weighted by the graph), or a custom `(values, weights) => number`.
- **NMF decomposition is deliberately out of scope** (the merged marathon NMF converges
  incorrectly and is not exported) — see the exceptions ledger.

## API reference

Full signatures: [decompose namespace](/api/pleco-xa/namespaces/decompose/readme/) — e.g.
[`hpss`](/api/pleco-xa/namespaces/decompose/functions/hpss/),
[`softmask`](/api/pleco-xa/namespaces/decompose/functions/softmask/),
[`nn_filter`](/api/pleco-xa/namespaces/decompose/functions/nn_filter/),
[`processAudioToFingerprints`](/api/pleco-xa/namespaces/decompose/functions/processAudioToFingerprints/).
