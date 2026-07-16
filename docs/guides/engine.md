---
title: The audio engine
description: Pleco-Xa's zero-dependency reimplementation of the W3C Web Audio API — 37 interfaces, spec-shaped and verified bit-exact against the browser, running headless in Node. The foundation the Studio skin sits on.
---

`pleco-xa/engine` is Pleco-Xa's own Web Audio API: a ground-up, zero-dependency
reimplementation of the W3C spec — the graph, the render loop, and every node's
DSP — in pure JavaScript. It is not a wrapper around the browser's audio engine;
it *is* an audio engine. You build a graph exactly as you would with Web Audio,
and it renders the same samples — in the browser, and headless in Node with no
`AudioContext` and no audio device.

This guide is the anchor for the whole Web Audio pillar. If you just want to make
sound with pleco's friendlier names, start at the [Studio guide](./studio.md) —
it is a thin renaming of everything here. This page explains the tier underneath:
what the engine is, why it exists, and the model every node guide builds on.

## Why reimplement Web Audio

The browser already has Web Audio. The point of owning it is three things the
browser API cannot give you:

- **Headless rendering.** The entire graph runs in Node — offline analysis,
  CI-tested DSP, server-side bounces — with zero dependencies and no device.
- **Determinism.** The same graph renders the same samples every time. That is
  what makes audio *testable*, and it is what lets the engine be verified.
- **One library.** The audio graph lives next to Pleco-Xa's analysis side, so a
  buffer you render here is the same shape `loop.detect()`, `feature.mfcc()`, and
  the rest consume — no glue, no format conversion, no second dependency.

The engine is spec-shaped on purpose: classes are `Pleco`-prefixed but otherwise
carry the exact W3C member names, so it stays a literal drop-in (swap the import,
get the same samples) and so the conformance verification holds. The
[Studio skin](./studio.md) layers pleco's own vocabulary on top without changing
any behavior.

## The model in one breath

An audio context is three things:

1. **A node graph** — sources, effects, and a destination, wired with `connect()`.
2. **A render loop** — a clock that pulls audio through that graph 128 sample-frames
   at a time (the *render quantum*).
3. **A sink** — the one irreducible seam where finished samples leave for a speaker.

Parts 1 and 2 are pure math pleco owns anywhere. Only part 3 touches hardware, and
it is a thin, swappable adapter — render-to-buffer offline, a device in the browser.
That separation is the whole architecture: the offline and realtime contexts run
*identical* math; only what drives the clock differs.

```js
import { PlecoOfflineAudioContext } from 'pleco-xa/engine'

const ctx = new PlecoOfflineAudioContext({ numberOfChannels: 1, length: 44100, sampleRate: 44100 })
const osc = ctx.createOscillator()          // a source
const gain = ctx.createGain()               // an effect
gain.gain.value = 0.5
osc.connect(gain).connect(ctx.destination)  // wire the graph
osc.start(0)

const buffer = await ctx.startRendering()   // a PlecoAudioBuffer, one second of tone
```

Every method and property here is the Web Audio name. `createOscillator()`,
`connect()`, `.gain.value`, `startRendering()` — if you know Web Audio, you know
this. The [Rosetta table in the Studio guide](./studio.md#coming-from-web-audio--the-rosetta-table)
maps the pleco names for readers who prefer them.

## Two contexts

The engine ships both W3C context types. They share a base
(`PlecoBaseContext`: the graph, the clock, `currentTime`, `sampleRate`,
`destination`, `listener`, `decodeAudioData()`, and every `createXxx()` factory).

### `PlecoOfflineAudioContext` — render to a buffer

Deterministic, faster-than-realtime, headless. It renders the whole graph to a
`PlecoAudioBuffer` and resolves it. This is the workhorse for analysis, tests, and
bounces.

```js
import { PlecoOfflineAudioContext } from 'pleco-xa/engine'
const ctx = new PlecoOfflineAudioContext({ numberOfChannels: 2, length: 88200, sampleRate: 44100 })
// ... build graph ...
const buffer = await ctx.startRendering()   // async, spec-shaped
```

### `PlecoAudioContext` — realtime, through a sink

A realtime context driven by a **sink adapter**. It has the full state machine —
`suspend()`, `resume()`, `close()`, `state`, `onstatechange` — plus
`getOutputTimestamp()`, `outputLatency`, the `setSinkId()` surface,
`AudioSinkInfo`, and `AudioPlaybackStats`. In Node it defaults to a headless sink
so it constructs and runs with no device; in the browser you give it a sink backed
by the platform's audio output.

```js
import { PlecoAudioContext, PlecoNullSink } from 'pleco-xa/engine'
const ctx = new PlecoAudioContext({ sink: new PlecoNullSink() })
await ctx.resume()   // 'suspended' -> 'running'
```

## The sink seam

The sink is the architecture's load-bearing rule, and it is worth understanding
because it is *why* the engine is both real-time-capable and perfectly testable.

After a context opens its sink, **the sink owns the pacing**. Whenever the device
(or a synthetic clock) needs audio, it calls the context's `pull()`, and the
context renders exactly one quantum in response. The context never paces itself —
no timers of any kind. A hardware callback, an AudioWorklet `process()` tick, or a
manually-stepped test loop can each be the clock, and the render math is identical
in every case.

The engine ships two adapters, and the browser device adapter is a drop-in for the
same contract:

| Adapter | Role |
|---|---|
| `PlecoNullSink` | The spec's `'none'` sink — renders on a synthetic cadence you step manually (`step(n)`), discards the audio. Zero timers, deterministic, headless. |
| `PlecoMockSink` | A `PlecoNullSink` that also records every pulled block and can inject the underrun / device-error / open-failure fault paths. The test double for the whole realtime lifecycle. |

Because the contexts are validated end-to-end against these, a real hardware
adapter changes no context code — it just honors `open()` / `close()` / `pull()`.
The full adapter contract lives in the [Audio I/O guide](./engine-io.md).

## The node surface

Every live W3C interface is here. The node guides group them the way you reach for
them:

- **[Sources](./engine-sources.md)** — Oscillator + PeriodicWave, AudioBufferSource
  (loop, playbackRate, detune), ConstantSource.
- **[Effects](./engine-effects.md)** — Gain, Delay (and the feedback-cycle rule),
  BiquadFilter (8 types) + IIRFilter, WaveShaper, DynamicsCompressor.
- **[Spatial & routing](./engine-spatial.md)** — StereoPanner, Panner + Listener,
  ChannelSplitter / ChannelMerger, and the channel up/down-mix model.
- **[Analysis](./engine-analysis.md)** — Analyser (FFT + the four data methods),
  Convolver.
- **[Worklets](./engine-worklet.md)** — the AudioWorklet cluster: your own DSP,
  in-graph, via `addModule()` + a processor + a port.
- **[Audio I/O](./engine-io.md)** — the realtime context and sink adapters, the
  media-node adapters, and `decodeAudioData()`.

Params (`PlecoAudioParam`) are shared across all of them: `.value` plus the seven
automation methods (`setValueAtTime`, `linearRampToValueAtTime`,
`exponentialRampToValueAtTime`, `setTargetAtTime`, `setValueCurveAtTime`,
`cancelScheduledValues`, `cancelAndHoldAtTime`). The
[Effects guide](./engine-effects.md) works an automation example end to end.

## Verified against the browser

The engine's claim is *parity*, and it is not asserted by hand:

- **Behavior is spec-exact.** A browser-bounce corpus renders graphs through a real
  Chrome `OfflineAudioContext` and compares sample-for-sample against
  `PlecoOfflineAudioContext` — bit-exact across the corpus, with two documented
  divergences (oscillator band-limiting and the compressor curve, both places the
  spec delegates the exact shape to the user agent).
- **Conformance is measured.** The web-platform-tests `webaudio/` behavioral suite
  runs against the engine under a WebIDL-shape shim — 100% of the in-scope suite
  passes, guarded in CI.
- **Capability is a superset.** Same behavior, plus headless operation and the
  analysis layer alongside.

The full interface-by-interface parity table and the two documented divergences are
in the [parity reference](./engine-parity.md).

## API reference

The engine follows the W3C Web Audio interface names, `Pleco`-prefixed; full
per-member signatures are generated into the [API reference](../api-by-category.md)
under the `engine` namespace, and the [parity reference](./engine-parity.md) is the
interface-by-interface map.

**See also:** [Studio](./studio.md) for the friendly `offline()` / `live()` names,
or build a graph node by node from [Sources](./engine-sources.md) on down.
