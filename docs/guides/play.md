---
title: Play
description: The creative choreography layer — treating a detected loop as an instrument. Algorithmic loop sequences, beat-locked glitching, a self-correcting clock, and a quantum op-language, in the Echoplex homage tradition.
---

This is the part of Pleco-Xa that isn't strictly analysis. Once you have a loop,
you can *play with it* — halve it, double it, slide it forward, reverse it, and
chain those gestures into evolving sequences clocked to the beat. That
vocabulary — half / double / move-forward / reverse / reset applied live to a
running loop — is the gesture set of hardware live-loopers like the Echoplex
Digital Pro, and this layer is Pleco-Xa's homage to it. It's the library's
artistic identity: the loop as an instrument, not just a measurement.

Everything here composes over a [`loop.detect()`](./loop.md) result and the
[`playback`](./playback.md) operations. The loop descriptor these functions
use is `{ startSample, endSample }` in samples (the algorithmic-sequence
convention), which sits alongside the normalized `{ start, end }` used by
`LoopController` and the `playback` namespace.

## Loop Playground — algorithmic sequences

`randomSequence` builds a choreography: it takes a buffer and returns an array of
**step functions**, each of which, when called, applies the next gesture and
returns `{ buffer, loop, op }`. It starts wide and narrows in during a warmup,
then wanders through the weighted op vocabulary, injecting "cocktail"
sub-sequences when the loop hits full or half width.

```js
import { randomSequence } from 'pleco-xa'

const steps = randomSequence(audioBuffer, {
  steps: 16,
  minMs: 100,
  rng: mySeededRng, // inject a seeded RNG for reproducibility
})

for (const step of steps) {
  const { buffer, loop, op } = step()
  render(buffer, loop, op)
}
```

Two things to internalize:

- **Seed the RNG.** `rng` is injectable and defaults to `Math.random`. Always
  pass a seeded generator in demos and tests so a sequence is reproducible.
- **Op count ≠ step count.** A single `step()` can eagerly execute a whole
  cocktail or complex sub-sequence and skip the step index ahead, so the array
  length is an upper bound on distinct gestures, not an exact count.
- **`reverse` mutates the buffer in place.** If you re-run a sequence, reload the
  buffer first, or the second pass plays reversed-reversed audio.

`randomLocal(buffer, loop, opts)` applies a short burst of local gestures to an
existing loop and returns `{ buffer, loop, op, subOps }`.

## Beat Glitcher — locked to the bar

`glitchBurst` runs a time-boxed stream of gestures; `startBeatGlitch` locks that
stream to the *bar*. It detects tempo with the quick-tier BPM detector, derives a
bar duration, and fires up to `maxOpsPerBar` gestures on each downbeat. Both
return a `stop()` disposer.

```js
import { startBeatGlitch } from 'pleco-xa'

const stop = startBeatGlitch(audioBuffer, {
  maxOpsPerBar: 1,
  onUpdate: ({ buffer, loop, op }) => render(buffer, loop, op),
})
// ...later
stop()
```

```js
import { glitchBurst } from 'pleco-xa'

const stop = glitchBurst(audioBuffer, {
  durationMs: 8000,
  minMs: 100,
  onUpdate: (buffer, loop, op, subOps) => render(buffer, loop, op),
})
```

## GibClock — a scheduler that doesn't drift

The timing under all of this is `GibClock`: a self-correcting, absolute-time
scheduler. Instead of `setInterval` (which accumulates drift), it computes each
next tick against an absolute target time and sleeps the remaining delay, so the
long-run rate stays true. Its `intervalMs` is mutable mid-flight — the glitchers
exploit that to swing the timing — and it runs in Node, since `performance.now`
is global.

```js
import { GibClock } from 'pleco-xa'

const clock = new GibClock(500)      // 500 ms interval
clock.onTick(() => tick())           // multiple listeners allowed
clock.start()                        // start(cb) also registers cb
clock.intervalMs = 250               // retime on the fly
clock.stop()
```

## Quantum Sequencer — the op-language

The quantum sequencer treats the gesture vocabulary as a small language.
`buildQuantumOpList` and `buildQuantumSequence` construct an op list — splicing
in verbatim 8-op preset bars and applying per-op timing modulation (stutter
0.5×, fractal 1.5×, silence 0.3×, phase 0.8×, plus a sine "quantum"
oscillation). **List construction is Node-safe**; you can generate and inspect a
sequence anywhere.

```js
import { buildQuantumSequence, RHYTHM_VOCAB, allPresets } from 'pleco-xa'

const seq = buildQuantumSequence(/* ... */)
RHYTHM_VOCAB // ['half','double','move','reverse','reset','stutter','phase','fractal', ...]
allPresets   // array of preset op-bars
```

**`playQuantumOps` drives its own sequence.**
`playQuantumOps(buffer, ctx, applyLoop, beatMs)` generates a fresh 128-op list
internally (with four preset injections) and steps through it with adaptive
timing — it does not accept a prebuilt list from `buildQuantumOpList` /
`buildQuantumSequence`. Use `buildQuantumSequence` when you want to construct
and step a sequence yourself, and `playQuantumOps` when you want the
self-driving stream. State is local to each invocation, and `phase` ops take
their parameters as an explicit options argument — no globals are involved.

## Algorithmic generators — deterministic patterns

Three pure, deterministic pattern generators feed the sequencer:

```js
import { generateFibonacci, generatePrimeRhythm, generateChaotic } from 'pleco-xa'

const fib = generateFibonacci(/* ... */)
const prime = generatePrimeRhythm(/* ... */)
const chaos = generateChaotic(/* ... */) // logistic map, fixed seed (x0=0.5, r=3.99)
```

They are deterministic by construction — `generateChaotic` uses a fixed-seed
logistic map — so the same call yields the same pattern every time.
`executeOperation` extends the core op vocabulary with parameterized variants
(`stutterN`, `fractalN`, `phaseX`). One caution: `executeOperation`'s raw output
can reach degenerate loop states (zero-width loops, or `end < start` from modulo
wrap) on tiny loops — clamp to a minimum width and forbid wrap before feeding it
to a player.

## Where the identity lives

Pleco-Xa's analysis half measures audio rigorously; this half treats the result
as an instrument: a loop is a playable object, and choreographing it — in the
browser, in real time, clocked to the beat — is a legitimate creative act. The
[Gallery](https://plecoxa.com/gallery/) hosts the live instruments built on this layer: the loop
playground, the beat glitcher, and the quantum sequencer.
