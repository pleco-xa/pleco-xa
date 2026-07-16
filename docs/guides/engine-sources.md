---
title: Source nodes
description: The engine's four W3C source nodes — Oscillator (+ PeriodicWave), AudioBufferSource, and ConstantSource — the graph's roots, where samples are born rather than transformed.
---

Sources are where audio *enters* the graph. Every other node transforms a signal
that some source produced; a source has no audio input at all (`numberOfInputs`
is 0) and synthesizes or replays its output from scratch. `pleco-xa/engine`
ships the four W3C source interfaces — `PlecoOscillatorNode`,
`PlecoPeriodicWave` (its custom-waveform companion), `PlecoAudioBufferSourceNode`,
and `PlecoConstantSourceNode` — each spec-shaped and rendered by pleco's own DSP,
in the browser and headless in Node.

This guide assumes the model from the [engine anchor](./engine.md): a context, a
128-frame render loop, nodes wired with `connect()`. If you want the friendly
pleco names (`Osc`, `Player`, `Wave`, `Const`), the [Studio guide](./studio.md)
is a thin renaming of everything here. Automation of the params these nodes expose
— `frequency`, `playbackRate`, `offset` — is covered in the
[Effects guide](./engine-effects.md); this page teaches what the
sources *are*.

## The buffer they produce and consume

Two of the four sources deal in `PlecoAudioBuffer` — pleco's `AudioBuffer`. It is
the universal currency of the whole library: a set of per-channel `Float32Array`s
plus a sample rate, nothing more. A buffer you render here is the exact shape
`loop.detect()` and the feature extractors consume, with no conversion.

```js
import { PlecoOfflineAudioContext } from 'pleco-xa/engine'

const ctx = new PlecoOfflineAudioContext({ numberOfChannels: 1, length: 44100, sampleRate: 44100 })

const buf = ctx.createBuffer(1, 44100, 44100) // (numberOfChannels, length, sampleRate)
const data = buf.getChannelData(0)            // the live backing Float32Array — writable
for (let i = 0; i < data.length; i++) data[i] = Math.sin((2 * Math.PI * 220 * i) / 44100)

buf.length        // 44100  (sample-frames)
buf.sampleRate    // 44100
buf.duration      // 1.0     (length / sampleRate, seconds)
buf.numberOfChannels // 1
```

`numberOfChannels`, `length`, `sampleRate`, and `duration` are read-only.
Construction throws `NotSupportedError` for out-of-range dimensions — sample rate
outside `[3000, 768000]` Hz, `length < 1`, or channels outside `[1, 32]`.
`getChannelData(c)` returns the **live** array (mutations are seen by anything
playing it); `copyToChannel` / `copyFromChannel` move frames in or out with the
spec's exact clip-at-the-edge behavior. Unlike the browser, pleco does not fake
"acquire the contents" ArrayBuffer detaching — content ownership is enforced at
the buffer-source `buffer` setter instead (below).

## OscillatorNode — periodic waveforms

`createOscillator()` makes a single-channel (mono) source that generates a
periodic wave. Three knobs shape it:

| Member | Type | Meaning |
|---|---|---|
| `type` | enum | `'sine'` \| `'square'` \| `'sawtooth'` \| `'triangle'` \| `'custom'` |
| `frequency` | a-rate `AudioParam` | fundamental in Hz, default 440, nominal ±Nyquist |
| `detune` | a-rate `AudioParam` | cents offset, default 0, nominal ±153600 |

`frequency` and `detune` combine into one compound parameter, the value actually
synthesized each sample:

```
computedOscFrequency(t) = frequency(t) · 2^(detune(t) / 1200)
```

Because both are AudioParams, either can be automated or driven by another node —
wire an LFO into `detune` for vibrato, or a ramp into `frequency` for a sweep (see
the [Effects guide](./engine-effects.md)).

```js
const osc = ctx.createOscillator()
osc.type = 'sawtooth'
osc.frequency.value = 110
osc.detune.value = -5          // a hair flat
osc.connect(ctx.destination)
osc.start(0)
const buffer = await ctx.startRendering()
```

Two behaviors are worth knowing. **Phase is conserved** across a `type` change:
switching `'sine'` → `'square'` mid-render does not reset the waveform to zero.
And when `|computedOscFrequency|` reaches or exceeds Nyquist the output goes
**silent while the phase keeps advancing** — drop back below Nyquist and it
resumes exactly where the running integral would have it, not from zero.

### `type` is an enum, with one trap

Assigning an invalid string to `type` is silently ignored (WebIDL enum-attribute
semantics). But `'custom'` is special: you cannot set it directly — that throws
`InvalidStateError`. The only path to a custom waveform is `setPeriodicWave()`,
which sets `type` to `'custom'` for you. In the constructor an invalid `type`
string is stricter still — it throws `TypeError` — and `{ type: 'custom' }`
without a `periodicWave` throws `InvalidStateError`.

### Band-limited synthesis, and the honest divergence

The four named types are not computed from `Math.sin` and friends per sample.
Each is synthesized from its Fourier series into a **mip-map of band-limited
wavetables** — the standard browser (Blink) anti-aliasing technique. A single
fixed-harmonic table can't be right at every pitch: at a high fundamental its
upper partials climb past Nyquist and alias back down as mirror images; at a low
one, too few partials leaves the tone dull. So the coefficients are rendered into
a set of tables, each keeping fewer partials, indexed by pitch range. Per sample
the oscillator picks the two bracketing tables, reads each with Catmull-Rom cubic
interpolation, and blends them by the fractional pitch range — no zipper artifact
as the pitch sweeps.

The net effect at a fundamental `f` is that every retained partial sits safely
below Nyquist. On the parity corpus this matches Chrome sample-for-sample (the
square-wave bounce at 256 Hz keeps harmonics 1..11, max abs diff ~4e-7).

Be honest about what this is, though: the spec deliberately leaves the
anti-aliasing strategy **implementation-defined** — "care MUST be taken to
discard information higher than Nyquist," but the exact curve is the user agent's
call. Pleco's is spec-faithful and tracks Blink closely, but because the shape is
UA-delegated, oscillator band-limiting is one of the **two documented
divergences** in the [parity reference](./engine-parity.md) (the compressor curve
is the other). If you need bit-exact-against-a-specific-browser output at every
pitch, this is the seam to be aware of.

## PeriodicWave — custom wavetables

A `PlecoPeriodicWave` is an arbitrary periodic waveform defined by Fourier
coefficients, built once and handed to one or more oscillators. It has no public
members beyond its constructor — it is purely an input to `setPeriodicWave()`.

```js
import { PlecoPeriodicWave } from 'pleco-xa/engine'

// A hollow, clarinet-ish tone: odd harmonics only.
const real = new Float32Array([0, 0, 0, 0, 0])       // cosine terms
const imag = new Float32Array([0, 1, 0, 0.5, 0])     // sine terms (harmonics 1 and 3)
const wave = new PlecoPeriodicWave(ctx, { real, imag })

const osc = ctx.createOscillator()
osc.setPeriodicWave(wave)   // type is now 'custom'
osc.frequency.value = 220
osc.connect(ctx.destination)
osc.start(0)
```

`real` and `imag` are the cosine and sine coefficient arrays; index `n` is the
`n`-th harmonic and index 0 (DC) is forced to zero. Both arrays must be the same
length and at least 2 elements — otherwise `IndexSizeError`. You may pass just
one (`{ real }` or `{ imag }`) and the other defaults to zeros; passing neither
gives you a plain sine. The `ctx.createPeriodicWave(real, imag, constraints)`
factory is stricter: it requires **both** arrays.

By default the waveform is **normalized** — scaled so its peak is 1.0, computed
once from the full-resolution table and applied consistently across every
band-limited range table. Set `disableNormalization: true` to keep your
coefficients' raw amplitudes:

```js
const wave = new PlecoPeriodicWave(ctx, { real, imag, disableNormalization: true })
```

A custom wave passes through the same band-limiting mip-map as the built-ins, so
at any playback pitch it aliases exactly as cleanly. (One pleco-strictness note:
non-finite or non-number coefficients throw `TypeError` rather than being coerced
— the constructor rejects junk loudly.)

## AudioBufferSourceNode — replay a buffer

`createBufferSource()` plays a `PlecoAudioBuffer` through the graph via a
fractional playhead with linear interpolation. It is the sampler, the looper's
replay voice, the one-shot trigger.

```js
const player = ctx.createBufferSource()
player.buffer = someClip          // assign the buffer
player.loop = true
player.loopStart = 0.5            // seconds
player.loopEnd = 2.5
player.playbackRate.value = 1.0
player.connect(ctx.destination)
player.start(0)
```

### `buffer` is set-once

Assigning a non-null `buffer` is a **one-shot** operation (the spec's
`[[buffer set]]` slot): a second non-null assignment throws `InvalidStateError`.
Assigning `null` is always allowed and does not reopen the slot. One sharp edge:
if you `start()` a source whose `buffer` is still null and a quantum renders
before you assign one, the source is force-stopped for all time and fires its
`ended` event — assign the buffer *before* the next block renders and it plays
normally.

### `start(when, offset, duration)`

`start()` takes up to three arguments, all in seconds:

| Arg | Meaning |
|---|---|
| `when` | context time to begin (0 = immediately) |
| `offset` | playhead position **into the buffer** to start from, sub-sample precise, clamped to `[0, buffer.duration]` |
| `duration` | seconds of **buffer content** to play (independent of `playbackRate`; whole loop iterations count), `Infinity` when omitted |

Negative values throw `RangeError`; non-finite values throw `TypeError`; calling
`start()` twice throws `InvalidStateError`. `stop(when)` and the `ended` event
come from the shared scheduled-source base — a source ends on `stop()`, on
`duration` reached, or on content exhausted.

```js
// Play half a second of the buffer, starting one second in, at the default rate.
player.start(0, 1.0, 0.5)
```

### Varispeed: `playbackRate` and `detune`

Both are AudioParams, and like the oscillator they combine into one compound
value:

```
computedPlaybackRate = playbackRate · 2^(detune / 1200)
```

This scales the playhead step. `2.0` plays an octave up and twice as fast; `0.5`
drops an octave and halves the speed; **negative rates play backward** (and loop
direction respects the sign); a rate of `0` is sample-and-hold. Unlike the
oscillator's a-rate params, these two are **k-rate with a fixed automation rate**
— they are sampled once per render quantum, and trying to switch their
`automationRate` throws `InvalidStateError`. All the loop attributes (`loop`,
`loopStart`, `loopEnd`) are likewise sampled once per quantum, so mid-flight
changes land on the next block, not the next sample.

The output channel count tracks the **buffer's** content, not the `channelCount`
attribute (which stays at the interface default of 2): a stereo buffer produces a
stereo block; a null or ended source produces one channel of silence.

## ConstantSourceNode — a constant as a signal

`createConstantSource()` outputs the value of its single `offset` AudioParam on
one mono channel. On its own that is a DC signal. Its real use is as a
**control-signal source you can fan out**: automate `offset` once, connect it to
several AudioParams, and drive them all from one timeline.

```js
const dc = ctx.createConstantSource()
dc.offset.value = 0

const a = ctx.createGain()
const b = ctx.createGain()

dc.connect(a.gain)   // one source...
dc.connect(b.gain)   // ...drives two params in lockstep
dc.start(0)

// Automate the source, and both gains follow:
dc.offset.setValueAtTime(0, 0)
dc.offset.linearRampToValueAtTime(1, 2)
```

`offset` defaults to 1, is a-rate, and — because it is an AudioParam — accepts
node connections itself, so a `ConstantSource` composes as a summing junction in
a modulation chain. Its output is computed in double precision and crosses the
float32 boundary exactly once, at the store into the render block, so the control
signal it emits is as clean as the automation timeline behind it.

## API reference

These nodes follow the W3C Web Audio interface names; full per-member signatures
are generated into the [API reference](../api-by-category.md) under the `engine`
namespace, and the [parity reference](./engine-parity.md) is the
interface-by-interface map (with the two documented divergences).

**See also:** [Effects](./engine-effects.md) to automate `frequency` /
`playbackRate` / `offset` end to end · [Studio](./studio.md) for the friendly
`Osc` / `Player` / `Wave` / `Const` names · [the audio engine](./engine.md) for
the model every node builds on.
