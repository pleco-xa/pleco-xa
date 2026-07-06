<p align="center">
  <a href="https://plecoxa.com"><img src="apps/docs/public/brand/banner-dark.jpg" alt="Pleco-Xa" width="720" /></a>
</p>

[![npm version](https://img.shields.io/npm/v/pleco-xa.svg)](https://www.npmjs.com/package/pleco-xa)
[![CI](https://github.com/pleco-xa/pleco-xa/actions/workflows/test.yml/badge.svg)](https://github.com/pleco-xa/pleco-xa/actions/workflows/test.yml)
[![min+gzip ~89 kB](https://img.shields.io/badge/min%2Bgzip-~89_kB-blue.svg)](https://github.com/pleco-xa/pleco-xa/blob/main/VERIFICATION.md)
[![zero dependencies](https://img.shields.io/badge/dependencies-0-brightgreen.svg)](https://www.npmjs.com/package/pleco-xa?activeTab=dependencies)
[![types included](https://img.shields.io/npm/types/pleco-xa.svg)](https://www.npmjs.com/package/pleco-xa)
[![license: MIT](https://img.shields.io/npm/l/pleco-xa.svg)](LICENSE)

> Browser-native audio analysis engine — musical timing, spectral features, and intelligent loop detection. Zero dependencies.

Pleco-Xa brings musical intelligence to any environment that runs JavaScript:
BPM and beat tracking, spectral features (mel, MFCC, chroma, spectral
descriptors), structural segmentation, effects, pitch tracking, and its signature
**loop detection** — with **zero runtime dependencies** and no build step.

47 CI-gated test suites (420 tests) run on every push, with loop detection
locked against committed golden fixtures on real audio. The live path is
first-class: streaming analyzers and sample-accurate loop playback run in
real time in the browser.

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

const { tempo, beats } = beat_track(y, audioBuffer.sampleRate)
console.log(`${tempo.toFixed(1)} BPM, ${beats.length} beats`)

// The signature feature: find the best loop point
const best = await loop.detect(audioBuffer, { strategy: 'fast' })
console.log(`loop ${best.loopStart.toFixed(2)}s → ${best.loopEnd.toFixed(2)}s`)
```

In Node there's no `AudioContext` — decode a WAV with the built-in `decodeWav`
and call the same functions. The analysis API is `(Float32Array, sampleRate)`
everywhere, so the same code runs in browsers, Node, and Web Workers.

## Why Pleco-Xa

- **Zero dependencies** — pure ESM, nothing to install alongside it.
- **Small** — ~89 kB min+gzip for the entire engine; importing just
  `pleco-xa/feature` costs under 8 kB. No WASM, no model download.
- **Public verification ledger** — [`VERIFICATION.md`](VERIFICATION.md)
  declares every numerical tolerance: 47 CI-gated test suites (420 tests), 21
  of them replaying committed reference fixtures across the whole analysis
  surface, with loop points locked on real audio behind a ±10 ms gate.
- **Loop detection** — intelligent loop-point finding, Pleco's signature
  capability (the name is an Echoplex homage).
- **Real-time** — worker-safe streaming analyzers and a live tempo tier,
  analyzing audio as it plays in the browser.
- **Pure-DSP vocal separation** — surprisingly capable, with no trained model,
  no weights, and no GPU. Runs in a browser tab.
- **Explicit tiers, never silent** — quality is the default; fast/live variants
  are separate named calls; failures throw with diagnostics rather than
  fabricating a number.

## For AI agents

A machine-readable capability map ships with this package: [`llms.txt`](llms.txt) — the
full function index, per-task routing, contracts, and verified recipes in one
skim. The complete guides also ship inside the npm package under `docs/`.
Also served at [plecoxa.com/llms.txt](https://plecoxa.com/llms.txt).

## Documentation

Full guides, a per-function API reference, and an **interactive gallery where
every example runs live in your browser on your own audio** — at
**[plecoxa.com](https://plecoxa.com)**.

To run the example gallery locally:

```bash
npm run demos          # serves the examples at http://localhost:5757
```

## Development

This is an npm-workspaces monorepo:

- `packages/pleco-xa` — the library (published to npm)
- `docs/` — the hand-written documentation content, browsable directly on GitHub (the single tracked source)
- `apps/demo` — the Astro demo app
- `apps/docs` — the documentation site builder; mirrors `docs/` into Starlight and appends the generated API reference
- `examples/` — the proof-of-work demos (also the docs gallery)
- `tools/goldens` — committed reference fixtures that pin numerical output

```bash
npm install
npm test               # library test suite
npm run build:lib      # build the library
npm run docs           # docs dev server
```

## Contributing

Contributions are welcome — see [`CONTRIBUTING.md`](CONTRIBUTING.md) for the repo
map, setup, and how to validate numerical work against reference fixtures.
Project direction and decision-making are documented in
[`GOVERNANCE.md`](GOVERNANCE.md). Please also read the
[Code of Conduct](CODE_OF_CONDUCT.md). Release notes live in
the [changelog](packages/pleco-xa/CHANGELOG.md); security reports go through
[`SECURITY.md`](SECURITY.md).

## License

MIT — _Built with ♪ by Cameron Brooks_. See [`NOTICE`](NOTICE) for third-party
algorithm attributions.
