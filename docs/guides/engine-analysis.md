---
title: Analysis nodes — Analyser & Convolver
description: The two analysis-side Web Audio nodes in pleco's engine — AnalyserNode's FFT taps (built on pleco's own FFT kernel) and ConvolverNode's impulse-response reverb — rendered deterministically so you can assert exact spectrum bins headless in Node.
---

Two of the engine's nodes look *into* the signal rather than reshape it:
`PlecoAnalyserNode` taps a running FFT and time-domain window off the graph, and
`PlecoConvolverNode` convolves the input with an impulse response. They are the
bridge between the [audio engine](./engine.md) and Pleco-Xa's analysis pillar —
the Analyser literally reuses the same FFT kernel the rest of the library runs on
(see the [Core DSP guide](./core.md)). And because the engine renders
[offline and deterministically](./engine.md#two-contexts), you can pull a spectrum
in Node and assert its exact bins — something a browser-only `AnalyserNode`, which
only reads *now*, cannot promise.

This is a node guide under the [engine anchor](./engine.md); for the friendly
`s.analyser()` / `s.convolver()` names see [Studio](./studio.md), for the other
in-graph DSP nodes see [Effects](./engine-effects.md), and for the
interface-by-interface conformance table see the [parity reference](./engine-parity.md).

## AnalyserNode — an FFT tap on the graph

An analyser is a **pass-through** with a side effect: the signal leaves its output
byte-for-byte unchanged, while the node keeps a rolling copy of what flowed through
it. Its output may be left unconnected — the node keeps analysing whatever is wired
upstream either way. You read the captured data on demand through four methods, two
frequency-domain and two time-domain.

```js
import { PlecoOfflineAudioContext } from 'pleco-xa/engine'

const sampleRate = 44100
const ctx = new PlecoOfflineAudioContext({ numberOfChannels: 1, length: 8192, sampleRate })

const analyser = ctx.createAnalyser()
analyser.fftSize = 2048          // → frequencyBinCount === 1024

// Land a pure tone exactly on bin 100: f = k · sampleRate / fftSize.
const targetBin = 100
const osc = ctx.createOscillator()
osc.frequency.value = (targetBin * sampleRate) / analyser.fftSize
osc.connect(analyser).connect(ctx.destination)
osc.start(0)

// Read after fftSize frames have been captured. Offline `suspend()` freezes the
// render at a quantum boundary so the read is deterministic (exactly like Web
// Audio's OfflineAudioContext.suspend).
let peakBin = -1
ctx.suspend(analyser.fftSize / sampleRate).then(() => {
  const spectrum = new Float32Array(analyser.frequencyBinCount) // dB
  analyser.getFloatFrequencyData(spectrum)

  let peak = -Infinity
  for (let k = 0; k < spectrum.length; k++) {
    if (spectrum[k] > peak) { peak = spectrum[k]; peakBin = k }
  }
  ctx.resume()
})

await ctx.startRendering()
console.log(peakBin) // 100 — every time, in Node, no browser
```

That last assertion is the whole point of owning the engine: the render is
reproducible, so `peakBin === 100` is a fact you can put in a test, not a
browser-timing coincidence.

### Configuration

Four attributes shape the analysis, each validated synchronously the moment you
set it:

| Attribute | Default | Meaning / constraint |
|---|---|---|
| `fftSize` | `2048` | A power of two in `[32, 32768]`; anything else throws `IndexSizeError`. |
| `frequencyBinCount` | `1024` | Read-only, always `fftSize / 2` — the length to size your frequency arrays. |
| `minDecibels` | `-100` | Floor of the byte-frequency dB range. |
| `maxDecibels` | `-30` | Ceiling of that range; `min ≥ max` (either setter) throws `IndexSizeError`. |
| `smoothingTimeConstant` | `0.8` | Time-averaging factor `τ` in `[0, 1]`; outside throws `IndexSizeError`. |

The three `double` attributes reject non-finite values with a `TypeError` (the
WebIDL restricted-double conversion runs before the range check). Assigning a
**different** `fftSize` resets the smoothing history to zero but deliberately does
*not* clear the time-domain capture — the spec requires the last 32768 frames to
stay available so that growing the FFT sees genuinely older samples.

### The four data methods

Each method fills a caller-supplied typed array (wrong element type is a
`TypeError`) with `min(array.length, frequencyBinCount)` values:

- **`getFloatFrequencyData(Float32Array)`** — magnitude in dB, `Y[k] = 20·log₁₀(X̂[k])`.
  A silent bin is `-Infinity`, honestly, per the formula.
- **`getByteFrequencyData(Uint8Array)`** — the same dB values clipped to
  `[minDecibels, maxDecibels]` and scaled to `0…255`. This is your spectrum-bar
  meter.
- **`getFloatTimeDomainData(Float32Array)`** — the most recent `fftSize` captured
  samples, oldest first, sample-exact.
- **`getByteTimeDomainData(Uint8Array)`** — the same waveform as unsigned bytes,
  `⌊128·(1 + x)⌋` clamped to `0…255`. This is your oscilloscope.

### Windowing, smoothing, and the shared FFT

The frequency path follows the spec's normative algorithm step for step, and the
Fourier transform in the middle is not a private copy — it is **pleco's own FFT
kernel** (`src/scripts/xa-fft.js`, the radix-2 Cooley–Tukey core the analysis
pillar uses; see [Core DSP](./core.md)). The same `e^(−2πikn/N)` math that powers
`feature.mfcc()` and STFT also drives the engine's spectrum tap.

Three behaviors are worth knowing when you read the numbers:

1. **A Blackman window** (`α = 0.16`) is applied before the transform, so single
   tones show the Blackman main-lobe/side-lobe shape rather than a razor spike.
2. **Smoothing over time** blends each new magnitude with the last:
   `X̂[k] = τ·X̂₋₁[k] + (1−τ)·|X[k]|`. Set `smoothingTimeConstant = 0` for the raw,
   unsmoothed magnitude of the current window.
3. **One computation per render quantum.** Reading a frequency method twice inside
   the same 128-frame quantum returns the identical block — the smoothing recursion
   advances exactly once per quantum no matter how often you poll, matching the
   spec and keeping the averaging rate independent of read frequency.

The capture feed is down-mixed to mono under a *fixed* `'max'`/1-channel/`'speakers'`
rule, independent of the analyser's own `channelCount` settings — so what you
analyse is always the summed program, regardless of how you configured the node's
input mixing.

## ConvolverNode — impulse-response reverb

A convolver linearly convolves its input with an impulse response (IR) held in an
`AudioBuffer` — the standard way to apply a real room, a plate, or any measured
reverb. Set the IR on `.buffer`; a short IR is applied as easily as a long one.

```js
import { PlecoOfflineAudioContext } from 'pleco-xa/engine'

const sampleRate = 44100
const ctx = new PlecoOfflineAudioContext({ numberOfChannels: 1, length: sampleRate, sampleRate })

// A tiny synthetic IR: direct hit + one decaying tap 120 ms later.
const ir = ctx.createBuffer(1, Math.round(0.2 * sampleRate), sampleRate)
const irData = ir.getChannelData(0)
irData[0] = 1
irData[Math.round(0.12 * sampleRate)] = 0.6

const conv = ctx.createConvolver()
conv.buffer = ir                 // acquires (snapshots) the IR content here

const osc = ctx.createOscillator()
osc.frequency.value = 220
osc.connect(conv).connect(ctx.destination)
osc.start(0)
osc.stop(0.05)                   // a short blip; the tail rings past it

const out = await ctx.startRendering()
console.log(out.getChannelData(0).length) // 44100
```

### buffer and normalization

`buffer` is a nullable `AudioBuffer` with a few hard rules, all enforced the
instant you assign:

- The IR must have **1, 2, or 4 channels** and a `sampleRate` equal to the
  context's, or the assignment throws `NotSupportedError`. A non-`AudioBuffer`,
  non-`null` value is a `TypeError`.
- Assigning **acquires the content** — pleco snapshots the channel data at set
  time, so mutating the source `AudioBuffer` afterwards never reaches the node.
- Unlike an `AudioBufferSourceNode`, the buffer is **re-assignable** (including
  back to `null`, which renders silence); each new IR restarts the running
  convolution state.

`normalize` (default `true`) rescales the IR to roughly equal-loudness so that
swapping reverbs does not jump the level. Two subtleties from the code:

- It is sampled **only when `.buffer` is set** — toggling `normalize` afterwards
  does not touch the already-acquired IR. Set `normalize` first, then the buffer.
- It is a **strict boolean**: pleco does not truthy-coerce it (a non-boolean is a
  `TypeError`). Set `normalize = false` to convolve with the exact, unscaled IR —
  the right choice when your IR is already calibrated and you want predictable gain.

The normalization factor is the spec's exact `calculateNormalizationScale` (an RMS
power measure over all channels, with the spec's gain-calibration and true-stereo
constants), pre-multiplied into the stored IR — a sanctioned, mathematically
equivalent placement.

Channel routing follows the spec's convolver diagram: a 1-channel IR convolves each
input channel independently, a 2-channel IR gives stereo, and a 4-channel IR is a
true-stereo matrix. The node's `channelCount` is capped at 2 (`'clamped-max'`
mode); pushing it past 2, or setting mode `'max'`, throws `NotSupportedError`.

## Why headless matters here

Both nodes gain something from running offline that a browser cannot give you.

The Analyser is the sharper case. In a browser the FFT is a live tap you read
whenever the event loop lets you — the frame you get depends on timing. Offline,
the render is deterministic and `suspend(t)` freezes it at an exact quantum, so the
captured window is a known function of the input. You can therefore assert the
*exact peak bin* of a known tone, or diff a full spectrum against a golden array,
in CI — a genuinely stronger test than a browser AnalyserNode admits.

The Convolver is fully deterministic too: the same IR and input render the same
tail every time (uniformly-partitioned overlap-add on the shared FFT kernel, with
float32-rounded products for browser parity), so reverb behavior is
regression-testable without an audio device. Both nodes are held to Chrome
sample-for-sample by the engine's browser-bounce corpus — details in the
[parity reference](./engine-parity.md).

## API reference

These nodes follow the W3C Web Audio interface names; full per-member signatures
are generated into the [API reference](../api-by-category.md) under the `engine`
namespace, and the [parity reference](./engine-parity.md) is the
interface-by-interface map.

**See also:** [Studio](./studio.md) for the friendly `s.analyser()` /
`s.convolver()` names · [Effects](./engine-effects.md) for the reshaping nodes ·
[Core DSP](./core.md) for the shared FFT / STFT kernel these tap into.
