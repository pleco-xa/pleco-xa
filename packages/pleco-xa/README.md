# pleco-xa

> Browser-native audio analysis engine — musical timing, spectral features, and intelligent loop detection.

Pleco-Xa brings musical intelligence to any environment that runs JavaScript:
BPM and beat tracking, spectral features (mel, MFCC, chroma, spectral
descriptors), structural segmentation, effects, and its signature **loop
detection** — with **zero runtime dependencies** and no build step.

Every function is validated against committed reference fixtures, with real-time
and loop-analysis capabilities an offline Python library structurally cannot
match.

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

const { tempo, beats } = beat_track(y, audioBuffer.sampleRate)
const best = await loop.detect(audioBuffer, { strategy: 'fast' })
console.log(tempo, best.loopStart, best.loopEnd)
```

In Node, decode a WAV with the built-in `decodeWav` and call the same functions —
the analysis API is `(Float32Array, sampleRate)` everywhere.

## Highlights

- **Zero dependencies**, pure ESM, runs in browsers, Node, and Web Workers.
- **Fixture-verified** across ~20 domains, checked in CI (many numerically exact).
- **Loop detection** — the signature feature.
- **Real-time** streaming analyzers and a live tempo tier.
- **Pure-DSP vocal separation** — no model, no weights, no GPU.

## Documentation

Full guides, per-function API reference, and an interactive gallery (every
example runs live in your browser) at **[plecoxa.com](https://plecoxa.com)**.

## License

MIT. See `NOTICE` for third-party algorithm attributions.
