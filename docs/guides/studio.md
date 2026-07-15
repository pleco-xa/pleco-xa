---
title: Studio — the plecoized audio engine
description: Pleco-Xa's own audio graph — a zero-dependency, headless reimplementation of the Web Audio API wearing pleco's names. If you know Web Audio, you already know this.
---

`pleco-xa/studio` is Pleco-Xa's audio engine: a graph of source, effect, and
destination nodes you wire together and render to sound. If you have ever
written Web Audio, this is the same model — a context, nodes, `connect()`,
`start()` — with two differences that matter:

1. **It is Pleco-Xa's own code, not the browser's.** The graph, the 128-frame
   render loop, and every node's DSP are reimplemented from the W3C spec in pure
   JavaScript with zero runtime dependencies. It runs in the browser *and*
   headless in Node — the same render, deterministically, with no audio device.
2. **It wears pleco's names.** The Web Audio ceremony — `createGain()`,
   `GainNode`, `OscillatorNode`, `numberOfChannels` — is dropped for the short
   version: `s.gain()`, `Gain`, `Osc`, `channels`. Nothing is invented; the
   names are a thinner skin over the exact same behavior.

There are three ways to reach the engine, from most pleco-idiomatic to most
spec-literal. Pick by taste — they are the same classes underneath:

| You want… | Import | Names |
|---|---|---|
| The friendly pleco surface | `pleco-xa/studio` | `offline()`, `Osc`, `Gain`, `s.filter()` |
| A literal Web Audio drop-in | `pleco-xa/engine` | `PlecoOfflineAudioContext`, `PlecoGainNode` |
| The raw browser API | (built in) | `AudioContext`, `GainNode` |

This guide covers the first. The engine tier is documented for anyone porting
spec-shaped code; the studio tier is what you reach for when writing new pleco
code.

## Hello, tone

Render half a second of a 440 Hz sine through a gain stage — in Node, with no
browser:

```js
import { offline } from 'pleco-xa/studio'

const s = offline({ channels: 1, seconds: 0.5 })   // an offline studio
const osc = s.osc({ frequency: 440, type: 'sine' }) // a source
const gain = s.gain({ gain: 0.5 })                  // an effect

osc.connect(gain).connect(s.out)                    // wire osc -> gain -> output
osc.start(0)

const clip = await s.render()                       // -> a Clip (AudioBuffer)
console.log(clip.getChannelData(0).length)          // 22050
```

`connect()` returns its destination, so you can chain a whole line in one
expression. `s.out` is the output (Web Audio's `destination`). `s.render()`
runs the graph and resolves the rendered `Clip`.

## Two studios

A studio is a rendering context. There are two kinds, matching Web Audio's two
context types:

### `offline({ channels, seconds })` — render to a Clip

Deterministic, faster-than-realtime, headless. It renders the whole graph to a
buffer and hands it back. This is the one you use for analysis, tests, bounce
exports, and anything that does not need to play as it computes.

```js
import { offline } from 'pleco-xa/studio'

// size it in seconds (sugar) or in frames (the spec's `length`)
const a = offline({ channels: 2, seconds: 2 })        // 2 s stereo @ 44100
const b = offline({ channels: 1, length: 88200 })     // exactly 88200 frames
const clip = await a.render()
```

`channels` aliases Web Audio's `numberOfChannels`; `sampleRate` defaults to
`44100`. Give it `seconds` and it computes `length = round(seconds * sampleRate)`
for you; give it `length` and that wins.

### `live({ sink, sampleRate })` — real-time output

A real-time context driven by a **swappable sink** — the one irreducible piece,
the thing that actually pushes samples to hardware. In the browser you hand it a
sink backed by the platform audio device; in Node it defaults to a
`NullSink` so it constructs and runs headless (useful for tests and for driving
a graph you will capture rather than hear).

```js
import { live } from 'pleco-xa/studio'

const s = live({ sampleRate: 48000 })  // headless by default (NullSink)
s.osc({ frequency: 220 }).connect(s.out)
await s.resume()                       // suspended -> running, exactly like Web Audio
// ... later
await s.suspend()
await s.close()
```

`resume()` / `suspend()` / `close()` drive it with the same state machine as a
Web Audio `AudioContext`.

## Building a graph

Every node is available two ways, and they are identical:

```js
import { offline, Osc, Gain } from 'pleco-xa/studio'
const s = offline({ channels: 1, seconds: 1 })

const a = s.osc({ frequency: 440 })      // factory sugar on the studio
const b = new Osc(s, { frequency: 440 }) // the class constructor, spec-style
// a and b are the same kind of node, bound to the same studio
```

The factory methods on a studio — `s.osc()`, `s.gain()`, `s.delay()`,
`s.filter()`, `s.shaper()`, `s.compressor()`, `s.pan()`, `s.panner()`,
`s.convolver()`, `s.analyser()`, `s.split()`, `s.merge()`, `s.constant()`,
`s.player()`, `s.wave()` — are thin wrappers over `new PlecoXxxNode(this, opts)`.
They exist to save keystrokes; the class form is there when you prefer it or want
`instanceof`.

`s.clip({ channels, seconds })` allocates an empty `Clip` (an `AudioBuffer`) at
the studio's sample rate — the plecoized `createBuffer()`.

### A feedback echo

The same graph you would build in Web Audio — a delay in a gain-scaled feedback
loop — reads a little cleaner:

```js
import { offline } from 'pleco-xa/studio'

const s = offline({ channels: 1, seconds: 2 })

const player = s.player()          // your source Clip goes here
const delay = s.delay({ delayTime: 0.25 })
const feedback = s.gain({ gain: 0.5 })

player.connect(s.out)
player.connect(delay)
delay.connect(feedback)
feedback.connect(delay)            // the loop — legal because it contains a Delay
delay.connect(s.out)

player.start(0)
const clip = await s.render()
```

## Coming from Web Audio — the Rosetta table

Every pleco name maps to exactly one Web Audio interface. Learning the skin is
learning this table; the behavior on either side is the same verified engine.

| Web Audio | pleco-xa/studio | Notes |
|---|---|---|
| `new AudioContext()` | `live({ sink })` | real-time; sink is the output device |
| `new OfflineAudioContext(ch, len, sr)` | `offline({ channels, length, sampleRate })` | `seconds` sugar allowed |
| `ctx.destination` | `s.out` | the output node |
| `ctx.startRendering()` | `s.render()` | offline only |
| `ctx.createBuffer(ch, len, sr)` | `s.clip({ channels, length, sampleRate })` | `seconds` sugar allowed |
| `AudioBuffer` | `Clip` | |
| `GainNode` / `createGain()` | `Gain` / `s.gain()` | |
| `OscillatorNode` / `createOscillator()` | `Osc` / `s.osc()` | |
| `DelayNode` / `createDelay()` | `Delay` / `s.delay()` | |
| `BiquadFilterNode` / `createBiquadFilter()` | `Filter` / `s.filter()` | |
| `IIRFilterNode` | `IIR` | |
| `WaveShaperNode` | `Shaper` / `s.shaper()` | |
| `DynamicsCompressorNode` | `Compressor` / `s.compressor()` | |
| `StereoPannerNode` | `Pan` / `s.pan()` | |
| `PannerNode` | `Panner` / `s.panner()` | 3D / HRTF panning |
| `ConvolverNode` | `Convolver` / `s.convolver()` | |
| `AnalyserNode` | `Analyser` / `s.analyser()` | |
| `ChannelSplitterNode` | `Split` / `s.split()` | |
| `ChannelMergerNode` | `Merge` / `s.merge()` | |
| `ConstantSourceNode` | `Const` / `s.constant()` | |
| `AudioBufferSourceNode` | `Player` / `s.player()` | plays a `Clip` |
| `PeriodicWave` | `Wave` / `s.wave()` | |
| `AudioListener` | `Listener` | `s.listener` |
| `AudioWorkletNode` | `Processor` | via `s.audioWorklet.addModule()` |
| `AudioParam` | `Param` | `.value`, `setValueAtTime()`, `linearRampToValueAtTime()`, … |

Methods that are already terse in Web Audio keep their names: `connect()`,
`disconnect()`, `start()`, `stop()`, and every `AudioParam` automation method
(`setValueAtTime`, `linearRampToValueAtTime`, `exponentialRampToValueAtTime`,
`setTargetAtTime`, `setValueCurveAtTime`, `cancelScheduledValues`,
`cancelAndHoldAtTime`) are unchanged.

## Why a reimplementation

The point is not to wrap Web Audio — it is to *be* Web Audio, in Pleco-Xa's
hands, everywhere JavaScript runs. That buys three things the browser API alone
cannot:

- **Headless rendering.** The full graph runs in Node with no `AudioContext` and
  no device. Offline analysis, CI-tested DSP, and server-side bounces all work.
- **Determinism.** The same graph renders the same samples every time, which is
  what makes it testable. The studio output is verified bit-for-bit against the
  `pleco-xa/engine` tier, which is in turn verified against Chrome's Web Audio
  implementation and the web-platform-tests conformance suite.
- **One library.** The audio graph lives next to Pleco-Xa's analysis side, so a
  `Clip` you render here is the same buffer shape `loop.detect()`,
  `feature.mfcc()`, and the rest consume — no glue, no format conversion.

## Verified against the browser

The studio tier is a renaming of `pleco-xa/engine`, and the two are asserted to
render identical samples in CI. The engine tier is held to the spec by a
browser-bounce corpus (bit-exact against Chrome) and by the web-platform-tests
`webaudio/` behavioral suite. When you build on `studio`, you are building on
that verification — the friendly names do not cost you any fidelity.
