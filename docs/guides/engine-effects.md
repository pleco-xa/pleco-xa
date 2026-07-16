---
title: Effects & processing nodes
description: Pleco-Xa's engine effect nodes — Gain, Delay (and the feedback-cycle rule), BiquadFilter, IIRFilter, WaveShaper, DynamicsCompressor — plus the AudioParam automation model every one of them is driven by.
---

The effect nodes are the middle of the graph: signal comes in from a
[source](./engine-sources.md), gets multiplied, delayed, filtered, distorted, or
compressed, and heads toward the destination. Each is a spec-shaped W3C interface
reimplemented in pure JavaScript — same member names, same DSP, same samples,
headless in Node. If you have not read the [engine anchor](./engine.md), start
there; this page assumes the graph, the 128-frame render quantum, and the
offline/realtime context split.

What makes these nodes *do* anything over time is the **AudioParam**, so this
guide teaches that first. Every knob you automate — a gain fade, a filter sweep,
a gliding delay — is an `AudioParam`, and the model is identical across all of
them. Learn it once here; every node below just hangs params off it.

## The AudioParam automation model

An `AudioParam` (`PlecoAudioParam`) is a single scalar value *over time*. It has
a plain `.value`, and it has a **timeline** of scheduled events that the engine
evaluates per render quantum to produce the value actually used in the DSP — the
spec's *computedValue*.

### `.value` and the timeline

`.value` is the immediate, un-automated value:

```js
import { PlecoOfflineAudioContext } from 'pleco-xa/engine'

const ctx = new PlecoOfflineAudioContext({ numberOfChannels: 1, length: 44100, sampleRate: 44100 })
const gain = ctx.createGain()
gain.gain.value = 0.5          // reads back 0.5 (float32-rounded)
```

Two things worth knowing, because they are subtle and spec-exact:

- **The getter is unclamped.** `.value` returns the raw stored value even if it
  sits outside `[minValue, maxValue]`. Clamping to the nominal range happens only
  to the *computedValue* at output time — the automation math itself runs
  unclamped.
- **The setter also schedules.** Assigning `.value = v` sets the value *and*
  behaves as `setValueAtTime(v, currentTime)`, so a later ramp anchors to the
  value you just set. This is why constructor options (`createGain({ gain: 0.5 })`
  — or `new PlecoGainNode(ctx, { gain: 0.5 })`) leave `defaultValue` untouched but
  still make subsequent ramps start from `0.5`.

### The seven automation methods

Scheduling builds a timeline of events. Every method returns the param, so calls
chain. All of them clamp their time argument up to `currentTime` (you cannot
schedule in the past), reject non-finite times with `TypeError` and negative
times with `RangeError`, and throw `NotSupportedError` if the time lands inside
an already-scheduled `setValueCurve` window.

| Method | What it schedules |
|---|---|
| `setValueAtTime(v, t)` | A step: value becomes `v` at `t`, held until the next event. |
| `linearRampToValueAtTime(v, t)` | A straight line from the previous event's value to `v`, arriving at `t`. |
| `exponentialRampToValueAtTime(v, t)` | An exponential curve to `v` at `t`. `v` must be non-zero (`RangeError`); if the start value is `0` or the endpoints straddle zero, it holds the start value until `t` (you cannot exponentiate through zero). |
| `setTargetAtTime(target, t, τ)` | An exponential *approach* toward `target` starting at `t` with time constant `τ`. Never exactly arrives (it is `target + (V₀−target)·e^(−(t−t₀)/τ)`); `τ = 0` jumps immediately. Good for ADSR-style decays. |
| `setValueCurveAtTime(values, t, dur)` | Plays a `Float32Array` of ≥2 samples, linearly interpolated, spread across `dur` seconds. An internal copy is taken — mutating your array afterward does nothing. |
| `cancelScheduledValues(t)` | Removes every event at or after `t`. |
| `cancelAndHoldAtTime(t)` | Removes events after `t` but *freezes the curve's value at `t`* first, so an in-flight ramp stops where it is instead of snapping. |

A ramp with no preceding event behaves as if `setValueAtTime(currentValue,
currentTime)` had been scheduled first, so a lone `linearRampToValueAtTime` still
draws a line from wherever the value currently is.

### a-rate vs k-rate

Each param carries an `automationRate`:

- **`a-rate`** — evaluated per sample-frame. The value can move *within* a
  quantum, which is what makes a smooth ramp actually smooth. This is the default
  for `gain`, `delayTime`, and the filter params.
- **`k-rate`** — sampled once at the first frame of the quantum and held flat for
  all 128 frames. Cheaper, block-granular. The `DynamicsCompressor` params are
  k-rate — and *fixed* there: they carry an automation-rate constraint, so
  assigning `automationRate` throws `InvalidStateError`. Assigning an invalid
  rate string (anything but `'a-rate'`/`'k-rate'`) is silently ignored, per the
  WebIDL enum-attribute rule.

### Param inputs — modulating a param with a node

An `AudioParam` is also a connection target. Connect any node's output *to a
param* and its signal is summed into the computedValue every quantum: all
connected outputs are mixed down to one channel, added to the timeline value,
`NaN` sums fall back to `defaultValue`, and only then is the result clamped to
`[minValue, maxValue]`. This is how you build an LFO — a slow oscillator into
`gain.gain` is tremolo; into `filter.frequency` is a filter wobble.

```js
const lfo = ctx.createOscillator()
lfo.frequency.value = 5           // 5 Hz
const depth = ctx.createGain()
depth.gain.value = 0.2            // ± 0.2 modulation depth
lfo.connect(depth).connect(gain.gain)   // node → param, not node → node
lfo.start(0)
```

### One fade, end to end

Putting the timeline to work — a linear fade-in over the first half-second,
then an exponential fade toward silence:

```js
import { PlecoOfflineAudioContext } from 'pleco-xa/engine'

const ctx = new PlecoOfflineAudioContext({ numberOfChannels: 1, length: 44100, sampleRate: 44100 })
const osc = ctx.createOscillator()
const gain = ctx.createGain()
osc.connect(gain).connect(ctx.destination)

gain.gain.setValueAtTime(0.0001, 0)                 // start near-silent
gain.gain.linearRampToValueAtTime(1, 0.5)           // fade up to full by 0.5 s
gain.gain.exponentialRampToValueAtTime(0.0001, 1)   // fade back down by 1.0 s

osc.start(0)
const buffer = await ctx.startRendering()
```

The exponential leg targets `0.0001` rather than `0` because an exponential ramp
cannot reach zero — a real fade-to-silence lands just above it. The rendered
buffer contains the actual per-sample envelope, evaluated a-rate.

## GainNode — the multiplier

`GainNode` is the simplest effect: it multiplies every sample of every channel by
the computedValue of its one `gain` param (default `1`, a-rate). That is the
whole node — but because `gain` is a full AudioParam, it is also the workhorse for
every envelope, de-click ramp, crossfade, and feedback-level control in the
engine. Everything in the automation section above is really a `GainNode`
tutorial.

```js
const gain = ctx.createGain()      // or new PlecoGainNode(ctx, { gain: 0.5 })
gain.gain.value = 0.5
```

## DelayNode — and the cycle rule

`DelayNode` outputs its input delayed by `delayTime(t)` seconds — literally
`output(t) = input(t − delayTime(t))`, with linear interpolation for fractional
sample delays. `delayTime` is a-rate (default `0`, so at zero it is an exact
passthrough) and clamped to `[0, maxDelayTime]`. `maxDelayTime` is fixed at
construction and must be in `(0, 180)` seconds — anything else is a
`NotSupportedError`.

```js
const delay = ctx.createDelay(2.0)   // maxDelayTime 2 s; or new PlecoDelayNode(ctx, { maxDelayTime: 2 })
delay.delayTime.value = 0.25
```

**The cycle rule.** The graph is normally a DAG — you cannot connect a node back
into itself, because the render loop needs a resolvable pull order. The one legal
exception: **a feedback cycle is allowed only if it passes through a
`DelayNode`.** The delay is what breaks the loop — it splits into a reader (this
quantum's output, computable from past ring-buffer data alone) and a deferred
writer (flushed after the graph pull). To make that resolvable, a `DelayNode`
inside a cycle has its `delayTime` **clamped to a minimum of one render quantum**
(128 frames ≈ 2.9 ms at 44.1 kHz) — so even `delayTime.value = 0` in a loop
still delays by a quantum. A cycle *without* a delay is rejected; this is not a
pleco quirk but the W3C rule.

The canonical composition is a feedback echo — a delay whose output is scaled by
a gain and fed back into its own input:

```js
const player = ctx.createBufferSource()   // your source buffer
const delay = ctx.createDelay(1.0)
const feedback = ctx.createGain()
delay.delayTime.value = 0.25
feedback.gain.value = 0.5                 // each echo 6 dB quieter

player.connect(ctx.destination)           // dry
player.connect(delay)
delay.connect(feedback)
feedback.connect(delay)                   // the cycle — legal, it contains a Delay
delay.connect(ctx.destination)            // wet

player.start(0)
const buffer = await ctx.startRendering()
```

Each pass around the loop is one 250 ms echo, halved in level — a classic tape
echo. The [Studio guide](./studio.md#a-feedback-echo) shows the same graph in
pleco's friendlier names.

## BiquadFilterNode — the eight types

`BiquadFilterNode` is a second-order IIR filter with a `type` and four a-rate
params: `frequency` (default `350`, `[0, Nyquist]`), `detune` (default `0`), `Q`
(default `1`), and `gain` (default `0` dB). `frequency` and `detune` combine into
the spec's compound parameter `computedFrequency = frequency · 2^(detune/1200)`,
clamped to `[0, Nyquist]`. Coefficients are the normative Audio EQ Cookbook
formulas, computed in double precision and normalized per quantum.

| `type` | Role | `Q` | `gain` |
|---|---|---|---|
| `lowpass` | Passes below cutoff (default) | dB (resonance) | — |
| `highpass` | Passes above cutoff | dB (resonance) | — |
| `bandpass` | Passes a band around center | linear (width) | — |
| `notch` | Rejects a band around center | linear (width) | — |
| `allpass` | Flat magnitude, shifts phase | linear (sharpness) | — |
| `peaking` | Bell boost/cut at center | linear (width) | dB |
| `lowshelf` | Shelf boost/cut below cutoff | — (fixed slope) | dB |
| `highshelf` | Shelf boost/cut above cutoff | — (fixed slope) | dB |

Note the `Q` column: `lowpass`/`highpass` read `Q` in **dB**, the four
bandpass-family types read it **linearly**, and the shelves ignore it entirely
(fixed slope `S = 1`) and use `gain` instead. It is one attribute with a per-type
interpretation.

```js
const filter = ctx.createBiquadFilter()
filter.type = 'lowpass'
filter.frequency.value = 800
filter.Q.value = 6
// sweep the cutoff up over a second
filter.frequency.setValueAtTime(200, 0)
filter.frequency.exponentialRampToValueAtTime(8000, 1)
```

`getFrequencyResponse(frequencyHz, magResponse, phaseResponse)` fills the two
output arrays with the filter's magnitude and phase at each requested frequency.
All three arguments must be `Float32Array`s of the **same length** (else
`InvalidAccessError`); any frequency outside `[0, Nyquist]` yields `NaN` in both
outputs at that index.

One sharp edge: the linear-`Q` types divide by `Q`, so `Q = 0` (or a degenerate
frequency at `0`/Nyquist) would produce non-finite coefficients. Pleco follows
observable browser behavior and substitutes the analytic z-transform *limit*
there — a wire, silence, a sign flip, or a fixed gain by type — rather than
emitting `NaN`. The dB-`Q` and shelf types never divide by `Q` and keep the raw
formula.

## IIRFilterNode — arbitrary coefficients

Where the biquad gives you eight named shapes, `IIRFilterNode` gives you the raw
coefficients of a general IIR filter — `feedforward` (the `b` array) and
`feedback` (the `a` array). Both are **required** at construction, both must have
1–20 coefficients (`NotSupportedError` otherwise), `feedforward` cannot be
all-zero and `feedback[0]` cannot be zero (`InvalidStateError`). The arrays are
normalized by `a₀` and then **fixed** — there is no param surface, no way to
change them after construction.

```js
// a one-pole low-pass: y[n] = 0.15·x[n] + 0.85·y[n-1]
const iir = ctx.createIIRFilter([0.15], [1, -0.85])
//                              feedforward  feedback
```

It exposes the same `getFrequencyResponse(...)` as the biquad, with the same
validation and the same `NaN`-outside-`[0, Nyquist]` rule. An unstable
coefficient set is the caller's responsibility — an unstable filter's `NaN` state
propagates rather than being silently masked.

## WaveShaperNode — non-linear distortion

`WaveShaperNode` maps each input sample through a `curve` (a `Float32Array`
lookup, linearly interpolated) — the engine's distortion, saturation, and
wavefolding primitive. Two things define its behavior:

- **`curve`** is nullable and starts `null`, which means *pass-through* (a true
  copy, not an identity shaping). A curve must have ≥2 elements
  (`InvalidStateError` otherwise). Setting a non-null curve is **one-shot**: once
  set, any further non-null assignment throws `InvalidStateError`, though you may
  always assign `null` to return to pass-through. An internal copy is taken on
  set.
- **`oversample`** is `'none'` | `'2x'` | `'4x'`. Distortion generates harmonics
  above Nyquist that alias back as grunge; oversampling runs the curve at 2× or 4×
  the rate through anti-aliasing filters to suppress them. The spec deliberately
  leaves the resampling filters implementation-defined — pleco's honest choice is
  a 63-tap Blackman-windowed half-band FIR, which introduces a small group delay
  (~31 frames at `'2x'`) that drains naturally through the pull graph.

```js
// a soft-clip tanh curve
const n = 1024
const curve = new Float32Array(n)
for (let i = 0; i < n; i++) {
  const x = (i / (n - 1)) * 2 - 1
  curve[i] = Math.tanh(3 * x)
}
const shaper = ctx.createWaveShaper()
shaper.curve = curve
shaper.oversample = '4x'
```

A curve whose value at `x = 0` is non-zero emits DC even with no input connected —
this falls out of the model naturally (an unconnected input is silence, and
silence shapes to `curve(0)`).

## DynamicsCompressorNode — and an honest divergence

`DynamicsCompressorNode` lowers the level of loud passages. It exposes five
**k-rate, rate-fixed** params — `threshold` (`[-100, 0]`, def `-24` dB), `knee`
(`[0, 40]`, def `30` dB), `ratio` (`[1, 20]`, def `12`), `attack` (`[0, 1]`, def
`0.003` s), `release` (`[0, 1]`, def `0.25` s) — plus a readonly `reduction`
metering attribute (the current gain reduction in dB: `0` at rest, negative while
compressing, updated once per block). Its `channelCount` cannot exceed `2` and
its `channelCountMode` cannot be `'max'` (both `NotSupportedError`). Internally it
is the spec's model exactly: a 6 ms look-ahead delay on the signal path with an
envelope follower driving the gain, so reduction is already in place when a
transient emerges.

```js
const comp = ctx.createDynamicsCompressor()
comp.threshold.value = -30
comp.ratio.value = 8
comp.attack.value = 0.005
comp.release.value = 0.2
// ... process, then read the meter:
console.log(comp.reduction)   // e.g. -4.2 (dB) while compressing
```

**The one documented divergence in the whole engine that is not bit-exact against
Chrome lives here, and it is by construction.** The spec's compression algorithm
explicitly delegates three shapes to the user agent — the soft-knee curve, the
detector curve, and the envelope-rate function — and every browser fills those
freedoms with a *different* private kernel. Chrome interpolates gain across
32-frame sub-blocks with an exponential knee table and an adaptive envelope; on
the parity corpus it compresses roughly 1.8 dB harder than pleco's model.
Firefox differs again; no two browsers match bit-for-bit. Pleco pins itself
step-for-step to the *normative* algorithm with the delegated shapes chosen as
documented readings (a quadratic-spline knee, a constant detector curve, 10-dB
attack/release timing), and keeps the Chrome delta visible in the golden suite as
an honestly-labelled `it.fails` rather than hidden under a loose tolerance. The
non-delegated behavior — identity below threshold, the ratio law, the timing, the
`reduction` formula — is pinned exactly. See the
[parity reference](./engine-parity.md) for the full divergence writeup (the other
is oscillator band-limiting, a source-node concern).

## API reference

These nodes and `AudioParam` follow the W3C Web Audio interface names; full
per-member signatures are generated into the [API reference](../api-by-category.md)
under the `engine` namespace, and the [parity reference](./engine-parity.md) is the
interface-by-interface map (with both documented divergences).

**See also:** [Sources](./engine-sources.md) for the nodes that *make* the signal
these effects process · [Studio](./studio.md) for the friendly `s.gain()` /
`s.delay()` / `s.filter()` names.
