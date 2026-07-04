# Pleco-Xa documentation

This folder is the source of the pleco-xa documentation — rendered at
[https://plecoxa.com](https://plecoxa.com).

Most pages here are plain markdown and read fine right on GitHub. A note on the
`.mdx` files: they are site pages, best viewed rendered. In particular,
[`index.mdx`](index.mdx) (the site landing page) and
[`gallery/index.mdx`](gallery/index.mdx) (the demo gallery) are built with
Astro components and appear as raw JSX on GitHub — view those two on the live
site instead: [plecoxa.com](https://plecoxa.com) and
[plecoxa.com/gallery](https://plecoxa.com/gallery/).

## Getting started

- [Installation](start/install.md) — npm, CDN, and the `(Float32Array, sr)` core
- [Quickstart](start/quickstart.mdx) — load audio, track tempo, find a loop

## Guides

Overview: [the guides index](guides/index.md)

**Start here**

- [Loop detection](guides/loop.md) — the signature capability: one entry point, four strategies, one honest confidence score

**Musical timing**

- [Beat & tempo](guides/beat.md) — the Ellis DP beat tracker, tempo estimation, the quick live tier
- [Onset detection](guides/onset.md) — the canonical onset envelope and the fast heuristic picker

**Features & structure**

- [Feature extraction](guides/feature.md) — mel spectrograms, MFCCs, chroma, spectral descriptors
- [Segment](guides/segment.md) — recurrence matrices, time-lag shear, Laplacian structure
- [Sequence](guides/sequence.md) — DTW, RQA, Viterbi, transition matrices
- [Cluster](guides/cluster.md) — deterministic k-means
- [Linalg](guides/linalg.md) — symmetric eigensolver and graph Laplacian

**Transformation & separation**

- [Effects](guides/effects.md) — phase vocoder time-stretch/pitch-shift, trim/split, remix
- [Decompose](guides/decompose.md) — HPSS, soft masking, pure-DSP vocal separation

**Primitives**

- [Core DSP & conversions](guides/core.md) — FFT, STFT/ISTFT, windows, the `convert` namespace
- [Filter banks & windows](guides/filters.md) — mel and chroma filterbanks
- [Utilities](guides/util.md) — framing, boundary fixing, peak picking

**Audio I/O, playback & display**

- [Audio I/O](guides/io.md) — loading audio, the WAV codec, signal generators
- [Playback](guides/playback.md) — loop players, transport, pure buffer operations
- [Play](guides/play.md) — the creative choreography layer (loop as instrument)
- [Display](guides/display.md) — canvas-native waveforms, spectrograms, meters

## Reference

- [API reference by category](api-by-category.md) — every public function, grouped by task
- [Changelog](reference/changelog.md)
- [Glossary](reference/glossary.md)

## Live site

- **API reference:** [https://plecoxa.com/api-by-category/](https://plecoxa.com/api-by-category/) — full generated signatures for every export
- **Gallery:** [https://plecoxa.com/gallery/](https://plecoxa.com/gallery/) — fifty live demos running the real npm bundle in your browser
