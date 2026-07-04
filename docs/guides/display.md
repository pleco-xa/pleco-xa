---
title: Display
description: Pleco-Xa's canvas-native visualization tier — waveforms, spectrograms, colormaps, and a live spectrum analyzer that draw straight to a canvas in the browser.
---

Pleco-Xa draws to a `<canvas>`. Pleco-Xa's display tier is canvas-native: it
renders waveforms, spectrograms, and colormapped matrices directly in the
browser, and it includes a live analyzer that visualizes audio as it plays.
(There is no figure/axes object model — you hand each renderer a canvas and it
draws.)

Most of this tier is browser-only (it needs `canvas` and `window`). A few
helpers — `cmap`, `analyzeWaveform`, `getWaveformPeaks` — are pure and run in
Node on a duck-typed buffer, which is what makes them testable off-browser.

## Waveforms

### Peaks first

`getWaveformPeaks` reduces an audio buffer to a min/max peak array sized to your
canvas width — the standard way to draw a waveform without plotting every
sample. It accepts an options object (not positional args):

```js
import { getWaveformPeaks, renderWaveform, loadAudioFile } from 'pleco-xa'

const { audioBuffer } = await loadAudioFile('/audio/break.wav')
const peaks = getWaveformPeaks(audioBuffer, { width: 800, normalize: true })

const canvas = document.querySelector('#wave')
renderWaveform(canvas, peaks, { style: 'peaks' }) // 'peaks' | 'bars' | 'line' | 'filled'
```

`getWaveformPeaks` **rounds** its output to `precision` decimals (default 2)
*after* normalization — the values are quantized by design, so pass a higher
`precision` if you need raw floats. It runs fine in Node on any object exposing
`getChannelData`, `length`, `sampleRate`, and `duration`.

`renderWaveform`'s HiDPI handling is idempotent: it sizes the canvas backing
store to `logicalWidth × pixelRatio` exactly once and caches the logical size, so
re-rendering inside a `mousemove` loop is safe and will not grow the canvas each
frame.

### Interactive selection

`createInteractiveRenderer` wraps a canvas with mouse-driven loop selection and
playhead rendering. **Call `setDuration()` first** — until it knows the clip
duration, mouse interaction is a silent no-op (clicks and drags are ignored).

```js
import { createInteractiveRenderer } from 'pleco-xa'

const renderer = createInteractiveRenderer(canvas, { onSelect: (loop) => play(loop) })
renderer.setDuration(audioBuffer.duration)
renderer.render(peaks)
```

`addLoopRegions(canvas, loops, duration)` overlays one or more detected loop
regions on an already-drawn waveform — pair it with
[`loop.detect()`](./loop.md) results to shade the loop you found.

For stereo, `getStereoWaveformPeaks` returns `{ left, right, isMono }` (it
duplicates mono into both channels when handed a single-channel buffer).
`waveshow` and `drawWaveform(audioBuffer, canvasId, loopData?, playbackInfo?)`
are higher-level one-call renderers. `analyzeWaveform` is the non-drawing
companion — it returns `{ peak, rms, dcOffset, dynamicRange, crestFactor,
zeroCrossingRate, length, duration }` and runs anywhere.

## Spectrograms

`createSpectrogram` renders a spectrogram to a canvas. It is STFT-backed (2 s at
44.1 kHz is 169 frames in ~55 ms — no hand-rolled per-frame DFT), and it is
async because it computes the transform:

```js
import { createSpectrogram } from 'pleco-xa'

await createSpectrogram(canvas, audioBuffer, { /* fftSize, etc. */ })
```

For feature matrices you have already computed — a mel spectrogram, a
chromagram — `specshow` draws them, and `cmap` maps a 2-D array to colors:

```js
import { feature, cmap } from 'pleco-xa'

const y = audioBuffer.getChannelData(0)
const mel = feature.melspectrogram(y, audioBuffer.sampleRate) // Array<Float32Array>
const colored = cmap(mel) // robust percentile clipping is on by default
```

`cmap` auto-selects a sensible colormap family from the data range (sequential,
diverging, or boolean). Its arguments are **positional** —
`cmap(data, robust?, ...)` — and `robust` defaults to `true`, clipping to the
2nd/98th percentiles so a few outliers don't wash out the scale; pass
`cmap(data, false)` for the raw range. It
accepts both plain `number[][]` and the `Array<Float32Array>` that the `feature`
modules return, so `cmap(feature.melspectrogram(y, sr))` works directly.

Supported spectrogram axis modes are linear, log, mel, chroma, and time. (There
is no key-spelling or svara notation on the display axes.)

## Live spectrum analyzer

`RealtimeSpectrumAnalyzer` visualizes a live audio stream — bars, line, or
filled, over a grid — by reading a Web Audio `AnalyserNode`. It is the display
tier's real-time centerpiece — live audio in, live pixels out.

```js
import { RealtimeSpectrumAnalyzer } from 'pleco-xa'

const analyzer = new RealtimeSpectrumAnalyzer(canvas, audioContext, {
  fftSize: 2048,
  smoothing: 0.8,
  minDb: -90,
  maxDb: -10,
})
// options map 1:1 onto AnalyserNode; updateOptions() reallocates on fftSize change
```

Because it is driven by a live `AnalyserNode`, it is browser-only and belongs on
the playback path, not on an offline render.

## What runs where

| Helper | Browser | Node |
|---|---|---|
| `cmap`, `analyzeWaveform`, `getWaveformPeaks` | ✅ | ✅ (duck-typed buffer) |
| `renderWaveform`, `createInteractiveRenderer`, `addLoopRegions` | ✅ | — (needs canvas) |
| `createSpectrogram`, `specshow`, `waveshow`, `drawWaveform` | ✅ | — (needs canvas) |
| `RealtimeSpectrumAnalyzer` | ✅ | — (needs AnalyserNode) |

## See it live

The [Gallery](https://plecoxa.com/gallery/) pairs these renderers with the analyzers — the spectrum
analyzer over a playing loop, the interactive waveform with shaded loop regions,
and the spectrogram/chroma displays used throughout the gallery demos.
