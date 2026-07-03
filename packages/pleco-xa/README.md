# pleco-xa

> Browser-native audio analysis engine — musical timing, spectral features, and intelligent loop detection.

Pleco-Xa brings musical intelligence to any environment that runs JavaScript:
BPM and beat tracking, spectral features (mel, MFCC, chroma, spectral
descriptors), structural segmentation, effects, and its signature **loop
detection** — with **zero runtime dependencies** and no build step.

It also, you'll discover, covers everything [librosa](https://librosa.org) does —
validated function by function against it via committed fixtures — while adding
real-time and loop-analysis capabilities an offline Python library structurally
cannot.

## Install

```bash
npm install pleco-xa
```

## Example

```js
import { beat_track, loop } from 'pleco-xa'

const ctx = new AudioContext()
const audioBuffer = await ctx.decodeAudioData(await (await fetch('song.mp3')).arrayBuffer())
const y = audioBuffer.getChannelData(0)

const { bpm, beats } = beat_track(y, audioBuffer.sampleRate)
const best = loop.detect(audioBuffer, { strategy: 'fast' })
console.log(bpm, best.start, best.end)
```

In Node, decode a WAV with the built-in `decodeWav` and call the same functions —
the analysis API is `(Float32Array, sampleRate)` everywhere.

## Highlights

- **Zero dependencies**, pure ESM, runs in browsers, Node, and Web Workers.
- **librosa-parity** across ~20 domains, fixture-verified in CI (many bit-exact).
- **Loop detection** with no librosa equivalent — the signature feature.
- **Real-time** streaming analyzers and a live tempo tier.
- **Pure-DSP vocal separation** — no model, no weights, no GPU.

## Documentation

Full guides, per-function API reference, and an interactive gallery (every
example runs live in your browser) at **[plecoxa.com](https://plecoxa.com)**.

## License

MIT. Includes audio-analysis algorithms ported from librosa (ISC) — see `NOTICE`.
