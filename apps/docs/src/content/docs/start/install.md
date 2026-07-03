---
title: Installation
description: Install Pleco-Xa from npm or a CDN. Zero-dependency ES modules that run unchanged in Node and the browser, with a (Float32Array, sr) core and native audio decoding.
---

Pleco-Xa ships as a single, zero-dependency ES module. There is nothing to
compile and nothing to pull in behind it: the entire library — BPM and beat
tracking, spectral features, structural analysis, and its signature loop
detection — is plain JavaScript that runs the same in Node and in the browser.

## npm

```sh
npm install pleco-xa
```

```js
import { beat_track, loop, feature } from 'pleco-xa'
```

The package is pure ESM (`"type": "module"`) and has **no runtime
dependencies** — installing it adds exactly one entry to your tree. It works with
any modern bundler (Vite, esbuild, Rollup, webpack) and with Node's native ESM
loader; no plugin or loader configuration is required.

## CDN

Because it is native ESM, you can import Pleco-Xa straight from a CDN with no
build step — a bare `<script type="module">` is enough.

```html
<script type="module">
  import { beat_track, loop } from 'https://cdn.jsdelivr.net/npm/pleco-xa@2.0.0-alpha.0/dist/pleco-xa.js'
  // ...
</script>
```

The unpkg mirror works the same way, and a minified build is available beside
the main bundle:

```js
// unpkg
import * as pleco from 'https://unpkg.com/pleco-xa@2.0.0-alpha.0/dist/pleco-xa.js'

// minified build (either CDN)
import * as pleco from 'https://cdn.jsdelivr.net/npm/pleco-xa@2.0.0-alpha.0/dist/pleco-xa.min.js'
```

:::tip
Pin the version in production URLs (as above) so a new release can't change
behaviour under you. Drop the `@version` for the latest published build while
prototyping.
:::

## One import, two runtimes

The core analysis functions are deliberately runtime-blind. They take a mono
signal as a `Float32Array` (a plain `number[]` works too) plus a sample rate,
and return plain arrays or typed arrays — arrays in, arrays out. There is no
`AudioContext`, no DOM, and no `window` on that path:

```js
import { beat_track, feature } from 'pleco-xa'

// y: Float32Array of mono samples, sr: sample rate in Hz
const { tempo, beats } = beat_track(y, sr)
const mel = feature.melspectrogram(y, sr)   // Array<Float32Array>, [freq][time]
```

The exact same import line and the exact same call run in Node and in the
browser — that is the point. Where a function genuinely needs the host (playing
sound, reading a `File`, drawing to a `<canvas>`), it lives in a browser-facing
namespace and says so.

## Loading audio in the browser

`beat_track` and friends want samples, not files. To turn a URL or a `File` into
a signal, use one of the decoding entry points:

- **`loadAudioFile(url)`** — fetches and decodes to a real `AudioBuffer` via the
  Web Audio API. Returns `{ audioBuffer, audioContext, arrayBuffer }`. This is
  the buffer the [`loop`](/guides/loop/) namespace consumes directly.
- **`audioio.load(url, { sr, mono })`** — fetches and decodes to
  `{ y, sr }` (a `Float32Array` and its sample rate), resampling to `sr` if you
  ask. This is the fast path to the `(y, sr)` core.
- **`decodeWav(arrayBuffer)`** — pure-JS WAV decoder (PCM 16/24/32-bit int and
  32-bit float). Returns `{ channels, sampleRate }` and runs identically in
  Node, the browser, and workers — no `AudioContext` required.

```js
import { loadAudioFile, beat_track, loop } from 'pleco-xa'

const { audioBuffer } = await loadAudioFile('/audio/break.wav')
const y = audioBuffer.getChannelData(0)
const sr = audioBuffer.sampleRate

const { tempo } = beat_track(y, sr)          // (Float32Array, sr) core
const result = await loop.detect(audioBuffer) // AudioBuffer-like in
```

In Node, `decodeWav` covers WAV out of the box; for other codecs, decode with a
library of your choice and hand the resulting samples to the `(y, sr)` core.

## Requirements

**Node.** Version **18 or newer** (declared in `engines`). Nothing else — no
native add-ons, no `node-gyp`, no system libraries.

**Browsers.** Any evergreen browser with ES module support and, for the audio
I/O and playback layers, the Web Audio API:

| Browser | Notes |
|---|---|
| Chrome / Edge | Full support (desktop and Android) |
| Firefox | Full support |
| Safari | Full support (macOS and iOS) |

The pure `(y, sr)` analysis core needs only ES modules, so it runs anywhere
modern JavaScript does — including Web Workers and audio worklets. The
`AudioContext`-backed helpers (`loadAudioFile`, `audioio.play`, `LoopPlayer`,
the canvas display layer) require a browser.

## Next steps

With the package installed, head to the [Quickstart](/start/quickstart/) to load
a clip, track its tempo, and find its loop in a dozen lines — or, if you are
arriving from Python, jump to [Coming from librosa](/start/coming-from-librosa/)
for a function-by-function map.
