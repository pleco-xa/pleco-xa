# pleco-xa

[![npm version](https://img.shields.io/npm/v/pleco-xa.svg)](https://www.npmjs.com/package/pleco-xa)
[![minzipped size](https://img.shields.io/bundlephobia/minzip/pleco-xa.svg)](https://bundlephobia.com/package/pleco-xa)
[![zero dependencies](https://img.shields.io/badge/dependencies-0-brightgreen.svg)](https://www.npmjs.com/package/pleco-xa?activeTab=dependencies)
[![types included](https://img.shields.io/npm/types/pleco-xa.svg)](https://www.npmjs.com/package/pleco-xa)
[![license: MIT](https://img.shields.io/npm/l/pleco-xa.svg)](https://github.com/pleco-xa/pleco-xa/blob/main/LICENSE)

> Browser-native audio analysis for JavaScript — BPM & beat tracking, spectral
> features, structural segmentation, and intelligent loop detection.
> **Zero dependencies. TypeScript declarations included.**

pleco-xa brings musical intelligence to anything that runs JavaScript — the
browser, Node, Web Workers, the edge. Tempo and beat tracking; mel / MFCC /
chroma / spectral descriptors; structural segmentation; DTW & sequence
alignment; effects; pitch tracking; pure-DSP vocal separation; and its
signature **loop detection** — with **zero runtime dependencies** and no build
step required. 27 CI-gated test suites (237 tests) run on every push, with
loop detection locked against committed golden fixtures on real audio.

## Install

```bash
npm install pleco-xa
```

## Two ways to import

**The barrel** — everything, tree-shakeable:

```js
import { beat_track, loop, stft, feature } from 'pleco-xa'
```

**Per-namespace subpaths** — pull only the domain you need:

```js
import { mfcc, chroma_stft, spectral_centroid } from 'pleco-xa/feature'
import { detect } from 'pleco-xa/loop'
import { hz_to_note, hz_to_midi } from 'pleco-xa/convert'
import { dtw, viterbi } from 'pleco-xa/sequence'
```

TypeScript declarations ship for the barrel and all 19 subpaths — editor
autocomplete works out of the box, no `@types/…` package needed.

## Quickstart

```js
import { beat_track, loop } from 'pleco-xa'

const ctx = new AudioContext()
const audio = await ctx.decodeAudioData(await (await fetch('song.mp3')).arrayBuffer())
const y = audio.getChannelData(0)

const { tempo, beats } = beat_track(y, audio.sampleRate)
const best = await loop.detect(audio, { strategy: 'fast' })
console.log(tempo, best.loopStart, best.loopEnd)
```

In Node, decode a WAV with the built-in `decodeWav` and call the same functions —
the analysis API is `(Float32Array, sampleRate)` everywhere.

## Subpaths

| Import from | What it gives you |
| --- | --- |
| `pleco-xa/feature` | mfcc, chroma, melspectrogram, spectral centroid / bandwidth / rolloff / contrast / flatness, rms, zcr |
| `pleco-xa/loop` | loop detection — one entry point, four strategies, one honest confidence |
| `pleco-xa/convert` | hz ↔ midi ↔ note, time ↔ frames ↔ samples, hz ↔ mel, amplitude ↔ dB |
| `pleco-xa/segment` | recurrence matrix, agglomerative & Laplacian segmentation |
| `pleco-xa/sequence` | DTW, Viterbi, RQA, event/interval matching |
| `pleco-xa/decompose` | HPSS, nn_filter, softmask, fingerprint vocal separation |
| `pleco-xa/effects` | time-stretch, pitch-shift, remix, trim, split |
| `pleco-xa/filters` | mel & chroma filter banks |
| `pleco-xa/bpm` | tempo engine |
| `pleco-xa/notation` | note / key / interval / svara notation |
| `pleco-xa/recurrence` · `pleco-xa/linalg` · `pleco-xa/cluster` · `pleco-xa/intervals` · `pleco-xa/playback` · `pleco-xa/audioio` · `pleco-xa/file` · `pleco-xa/fileio` · `pleco-xa/io` | recurrence, eigensolvers, k-means, interval theory, playback controllers, codecs, streaming readers, WAV I/O |

## Highlights

- **Zero dependencies**, pure ESM — runs in browsers, Node, and Web Workers.
- **~89 kB min+gzip** for the entire engine — the `feature` subpath alone under
  8 kB. No WASM, no model download.
- **TypeScript declarations** for the barrel and all 19 subpaths.
- **27 CI-gated test suites** (237 tests) — loop points locked against
  committed golden fixtures on real audio (±10 ms).
- **Loop detection** — the signature feature.
- **Real-time** streaming analyzers and a live tempo tier.
- **Pure-DSP vocal separation** — no model, no weights, no GPU.

## Documentation

Full guides, a per-function API reference, and an interactive gallery where every
one of 50 demos runs live in your browser: **[plecoxa.com](https://plecoxa.com)**.

## License

MIT. See `NOTICE` for third-party algorithm attributions.
