# Pleco-Xa

> Browser-native audio analysis engine — musical timing, spectral features, and intelligent loop detection. Zero dependencies.

Pleco-Xa brings musical intelligence to any environment that runs JavaScript:
BPM and beat tracking, spectral features (mel, MFCC, chroma, spectral
descriptors), structural segmentation, effects, pitch tracking, and its signature
**loop detection** — with **zero runtime dependencies** and no build step.

It also, you'll discover, covers everything [librosa](https://librosa.org) does —
validated function by function against it via committed fixtures, checked in CI —
while adding real-time and loop-analysis capabilities an offline Python library
structurally cannot.

## Install

```bash
npm install pleco-xa
```

## Quick start

```js
import { beat_track, loop } from 'pleco-xa'

// Browser: decode with Web Audio, then hand samples to the library
const ctx = new AudioContext()
const audioBuffer = await ctx.decodeAudioData(await (await fetch('song.mp3')).arrayBuffer())
const y = audioBuffer.getChannelData(0)

const { bpm, beats } = beat_track(y, audioBuffer.sampleRate)
console.log(`${bpm.toFixed(1)} BPM, ${beats.length} beats`)

// The signature feature: find the best loop point
const best = loop.detect(audioBuffer, { strategy: 'fast' })
console.log(`loop ${best.start.toFixed(2)}s → ${best.end.toFixed(2)}s`)
```

In Node there's no `AudioContext` — decode a WAV with the built-in `decodeWav`
and call the same functions. The analysis API is `(Float32Array, sampleRate)`
everywhere, so the same code runs in browsers, Node, and Web Workers.

## Why Pleco-Xa

- **Zero dependencies** — pure ESM, nothing to install alongside it.
- **librosa-parity** across ~20 domains, fixture-verified in CI (many bit-exact:
  `beat_track`, `dtw`, `pyin`, `pcen`, the spectral descriptors).
- **Loop detection** — intelligent loop-point finding with no librosa equivalent.
  Pleco's signature capability (the name is an Echoplex homage).
- **Real-time** — worker-safe streaming analyzers and a live tempo tier;
  things an offline library can't do.
- **Pure-DSP vocal separation** — surprisingly capable, with no trained model,
  no weights, and no GPU. Runs in a browser tab.
- **Explicit tiers, never silent** — quality is the default; fast/live variants
  are separate named calls; failures throw with diagnostics rather than
  fabricating a number.

## Documentation

Full guides, a per-function API reference, a "Coming from librosa" map, and an
**interactive gallery where every example runs live in your browser on your own
audio** — at **[plecoxa.com](https://plecoxa.com)**.

To run the example gallery locally:

```bash
npm run demos          # serves the examples at http://localhost:5757
```

## Development

This is an npm-workspaces monorepo:

- `packages/pleco-xa` — the library (published to npm)
- `apps/demo` — the Astro demo app
- `apps/docs` — the documentation site
- `examples/` — the proof-of-work demos (also the docs gallery)
- `tools/parity` — the librosa fixture harness that validates every claim

```bash
npm install
npm test               # library test suite
npm run build:lib      # build the library
npm run docs           # docs dev server
```

## License

MIT — _Built with ♪ by Cameron Brooks_. Includes audio-analysis algorithms
ported from librosa (ISC); see [`NOTICE`](NOTICE).
