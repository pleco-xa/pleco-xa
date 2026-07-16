---
title: Spatial & routing nodes
description: The channel-mixing model every node shares, then the four nodes that move sound in space and around the graph — StereoPanner, Panner + Listener, and ChannelSplitter / ChannelMerger. Documented against pleco's own Web Audio engine, honest about where it diverges.
---

This is the [engine](./engine.md) tier's spatial pillar: the nodes that place a
signal in the stereo image or in 3D space, and the two that fan a multichannel
stream apart and back together. But none of them make sense until you know how
the graph decides *how many channels* a signal has and *what happens* when a
2-channel source meets a 6-channel input. So the channel model comes first — it
is shared by every node in the engine, and this is where it's taught.

Imports are the `Pleco`-prefixed spec names from `'pleco-xa/engine'`; the
[Studio skin](./studio.md) exposes the same nodes as `s.pan()`, `s.panner()`,
`s.split()`, `s.merge()`, and `s.listener`.

## The channel model

Every `connect()` in Web Audio is allowed to join ports with mismatched channel
counts — a mono oscillator into a stereo gain, a 5.1 buffer into a mono
destination. The engine resolves those mismatches deterministically, in two
stages: first it computes how many channels the *input* will present, then it
up- or down-mixes every incoming connection to that width and sums them.

Three `AudioNode` attributes govern this, and they mean exactly what the W3C
spec says:

| Attribute | Values | What it decides |
|---|---|---|
| `channelCount` | positive integer | The target width the node wants (default 2). |
| `channelCountMode` | `max` · `clamped-max` · `explicit` | How the *actual* width is derived from the connections. |
| `channelInterpretation` | `speakers` · `discrete` | Which mix rules apply — the psychoacoustic speaker tables, or a plain fill/drop. |

### computedNumberOfChannels

The width an input actually renders at is `computedNumberOfChannels` — a
function of the mode, the node's `channelCount`, and the widest connection
feeding the input (`maxSourceChannels`):

| `channelCountMode` | computedNumberOfChannels |
|---|---|
| `max` | `maxSourceChannels` — `channelCount` is ignored |
| `clamped-max` | `min(channelCount, maxSourceChannels)` |
| `explicit` | exactly `channelCount` |

Once that number is fixed, every connection is mixed to it. Same-width
connections are a straight per-channel sum. Everything else runs the up/down-mix
rules — and mixing always *accumulates*: an input with several connections is
the running sum of each one after it's been mixed to width.

### The speaker mix tables

Under `channelInterpretation: 'speakers'` (the default), the engine implements
the spec's coefficient equations for the four canonical layouts — mono, stereo,
quad, and 5.1. Channel order is fixed: stereo is `L R`; quad is `L R SL SR`; 5.1
is `L R C LFE SL SR`.

**Up-mix** (fewer channels → more):

| From → To | Result |
|---|---|
| mono → stereo | `L = R = in` |
| mono → quad | `L = R = in`; `SL = SR = 0` |
| mono → 5.1 | `C = in`; all others `0` |
| stereo → quad | `L`, `R` pass; `SL = SR = 0` |
| stereo → 5.1 | `L`, `R` pass; `C = LFE = SL = SR = 0` |
| quad → 5.1 | `L R SL SR` pass; `C = LFE = 0` |

**Down-mix** (more channels → fewer), where `√½ = sqrt(1/2)`:

| From → To | Result |
|---|---|
| stereo → mono | `0.5·(L + R)` |
| quad → mono | `0.25·(L + R + SL + SR)` |
| 5.1 → mono | `√½·(L + R) + C + 0.5·(SL + SR)` — LFE dropped |
| quad → stereo | `L = 0.5·(L + SL)`; `R = 0.5·(R + SR)` |
| 5.1 → stereo | `L = L + √½·(C + SL)`; `R = R + √½·(C + SR)` |
| 5.1 → quad | `L = L + √½·C`; `R = R + √½·C`; `SL SR` pass |

Any channel-count pair *not* in this set — anything touching 3, 5, 7+ channels —
falls back to `discrete`, per the spec.

### Discrete mixing

Under `channelInterpretation: 'discrete'`, there is no psychoacoustics: up-mix
fills channels in order until the source runs out and leaves the rest silent;
down-mix fills as many as it can and drops the overflow. It's the honest
"route channel *n* to channel *n*" behavior, and it's what the splitter and
merger below rely on.

## StereoPannerNode — the stereo image

`PlecoStereoPannerNode` positions a signal left-to-right with the spec's
low-cost equal-power pan law. One `a-rate` param, `pan`, ranges over `[-1, 1]`
(−1 hard left, +1 hard right, 0 centered); values outside are clamped to the
nominal range. The output is always stereo.

```js
import { PlecoOfflineAudioContext } from 'pleco-xa/engine'

const ctx = new PlecoOfflineAudioContext({ numberOfChannels: 2, length: 44100, sampleRate: 44100 })
const osc = ctx.createOscillator()
const panner = ctx.createStereoPanner()
panner.pan.value = -0.5                       // halfway left
osc.connect(panner).connect(ctx.destination)
osc.start(0)
const buffer = await ctx.startRendering()
```

The pan law differs by input width. For a **mono** input, with `x = (pan+1)/2`:

```
outL = in · cos(x · π/2)
outR = in · sin(x · π/2)
```

so at center each side gets `cos(π/4) ≈ 0.707` — equal power, not equal
amplitude. A **stereo** input keeps its channels but bleeds one side toward the
other: panning right leaks L into R, panning left leaks R into L, and `pan = 0`
is the identity (the residual leak sits below float32 resolution). Because `pan`
is `a-rate`, it reads a fresh value every sample-frame — automate it with the
same `PlecoAudioParam` methods as any other param (see [Effects](./engine-effects.md)).

The node is channel-constrained: `channelCount` above 2, or `channelCountMode`
set to `'max'`, throws `NotSupportedError` — on assignment and through the
constructor options.

## PannerNode + AudioListener — 3D space

`PlecoPannerNode` spatializes a mono or stereo source in 3D relative to the
context's single `AudioListener`. It carries six `a-rate` params —
`positionX/Y/Z` (default `0,0,0`) and `orientationX/Y/Z` (default `1,0,0`) — and
a set of scalar distance/cone attributes. The output is always stereo.

```js
const ctx = new PlecoOfflineAudioContext({ numberOfChannels: 2, length: 44100, sampleRate: 44100 })
const src = ctx.createBufferSource()          // your mono clip
const panner = ctx.createPanner()

panner.panningModel = 'equalpower'
panner.distanceModel = 'inverse'
panner.positionX.value = 3                     // 3 m to the right
panner.positionZ.value = -2                    // and in front

// the listener is the context's — one per context
ctx.listener.positionX.value = 0
ctx.listener.forwardZ.value = -1               // facing -Z (the default)

src.connect(panner).connect(ctx.destination)
```

The engine computes the **azimuth** from the source-minus-listener vector and
the listener's forward/up basis, clamps it to `[-180, 180]` and folds it into
`[-90, 90]`, then runs the same equal-power gains as the stereo panner. That
result is scaled by two more gains — cone and distance.

### Distance models

`distanceModel` (default `inverse`) chooses how gain falls off with distance
`d`. `refDistance` (`ref`), `maxDistance` (`max`), and `rolloffFactor` (`f`)
parameterize it:

| Model | Gain |
|---|---|
| `linear` | `1 − f'·(clamp(d, ref', max') − ref') / (max' − ref')`, with `ref' = min(ref,max)`, `max' = max(ref,max)`, `f' = min(f, 1)`; degenerate `ref' = max'` → `1 − f'` |
| `inverse` | `ref / (ref + f·(max(d, ref) − ref))`; `ref = 0` → `0` |
| `exponential` | `(max(d, ref) / ref)^(−f)`; `ref = 0` → `0` |

The `linear` model clamps `rolloffFactor` to `[0, 1]` *at processing time* — the
attribute still reports whatever you set. Setter constraints are strict:
`refDistance` negative and `rolloffFactor` negative both throw `RangeError`,
`maxDistance` non-positive throws `RangeError`, and `coneOuterGain` outside
`[0, 1]` throws `InvalidStateError`.

### Sound cones

If the source's `orientation` is nonzero and the cone isn't wide open
(`coneInnerAngle` and `coneOuterAngle` both 360°), directionality kicks in:
inside the inner half-angle the gain is 1, past the outer half-angle it's
`coneOuterGain`, and it interpolates linearly between. A source pointed straight
at the listener is loudest.

> **Documented divergence.** The spec's cone *pseudocode* measures the
> source→listener direction, but its prose, diagram, the audiojs reference, and
> shipping browsers all use listener→source — a source "pointing directly at the
> listener" should be louder. Pleco follows the browsers and uses the
> listener→source direction. A source sitting exactly on the listener has no
> defined direction, so cone gain is unity there.

### The listener

The `AudioListener` is not constructible on its own — it exists only as
`ctx.listener`, one per context, shared by every panner. It holds nine `a-rate`
params: `positionX/Y/Z` (default `0,0,0`), `forwardX/Y/Z` (default `0,0,-1`),
and `upX/Y/Z` (default `0,1,0`). Every panner spatializes against these; the
engine renders all nine once per quantum and hands the same block set to every
panner in the graph, so moving the listener moves the whole scene at once.

Both `PannerNode` and `AudioListener` ship the deprecated `setPosition()` /
`setOrientation()` conveniences — equivalent to writing the params' `.value` —
which throw `NotSupportedError` if any touched param has an active
`setValueCurveAtTime` automation, checked atomically before any write.

### The HRTF gap — honest silence

`panningModel` accepts both spec values, `'equalpower'` and `'HRTF'`, but only
`equalpower` is implemented. HRTF rendering requires convolution with a measured
head-related impulse-response dataset, which pleco (like the audiojs reference)
does not ship. Rather than silently substitute equalpower — fabricating a result
you didn't ask for — **a panner in `'HRTF'` mode outputs stereo silence.** It's
an explicit, documented parity gap, not a fallback. See the
[parity reference](./engine-parity.md) for the full divergence list.

## ChannelSplitter / ChannelMerger — routing

These two nodes don't change the sound; they change its *wiring*. The splitter
fans one multichannel input out to N mono outputs; the merger collects N mono
inputs into one multichannel output. Their whole job is to give you per-channel
access, and their attributes are locked to make that reliable.

`PlecoChannelSplitterNode` has `numberOfOutputs` outputs (default 6, must be
`[1, 32]`). Output *k* is a mono stream carrying input channel *k*; outputs past
the input's channel count are silence. Its `channelCount` is locked to
`numberOfOutputs`, `channelCountMode` to `'explicit'`, and
`channelInterpretation` to `'discrete'` — any attempt to change them throws
`InvalidStateError`. Those locks are what guarantee channel *k* in equals output
*k* out, with no speaker-mixing in the way.

`PlecoChannelMergerNode` is the inverse: `numberOfInputs` inputs (default 6,
`[1, 32]`), one output that many channels wide. Each input is down-mixed to mono
and laid into output channel *i*; an unconnected input is one silent channel.
Its `channelCount` is locked to 1 and `channelCountMode` to `'explicit'`.

### Pattern: swap L and R

The cleanest split/merge job needs no arithmetic — just crossed wires. Split a
stereo signal, then merge it with the outputs swapped:

```js
const split = ctx.createChannelSplitter(2)
const merge = ctx.createChannelMerger(2)

source.connect(split)
split.connect(merge, 0, 1)   // input L (output 0) → merger input 1 (R)
split.connect(merge, 1, 0)   // input R (output 1) → merger input 0 (L)
merge.connect(ctx.destination)
```

The `connect(dest, outputIndex, inputIndex)` form is what selects which mono
stream goes where.

### Pattern: mid/side

Mid/side needs sums and differences, so it pairs the splitter and merger with
gain nodes. Mid is `L + R`; side is `L − R` (a `-1` gain inverts one leg, and
connections into a shared node accumulate):

```js
const split = ctx.createChannelSplitter(2)
const mid = ctx.createGain()          // L + R
const side = ctx.createGain()         // L − R
const invert = ctx.createGain()
invert.gain.value = -1

source.connect(split)
split.connect(mid, 0)                 // L
split.connect(mid, 1)                 // + R  (summed at mid's input)
split.connect(side, 0)                // L
split.connect(invert, 1)              // R
invert.connect(side)                  // − R  (summed at side's input)
// mid and side are now mono; process, then matrix back to L/R with a merger.
```

Scale each leg by `0.5` if you want the energy-preserving convention. Decoding
back to L/R is the same trick in reverse — `L = M + S`, `R = M − S` — through a
merger.

## Where to go next

- The channel model in action across every node → back to [the engine anchor](./engine.md)
- The friendlier names for all of this → [Studio](./studio.md)
- Gain, delay, filters, and param automation → [Effects](./engine-effects.md)
- The HRTF gap and the full interface-by-interface divergence list → [Parity reference](./engine-parity.md)
