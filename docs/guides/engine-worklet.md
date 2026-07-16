---
title: Worklets — your own DSP in the graph
description: The AudioWorklet cluster in pleco-xa/engine — addModule() registers a processor class, AudioWorkletNode instantiates it, and process() runs your sample-level DSP inside the same 128-frame render loop as every built-in node. Headless in Node, no browser.
---

Every node the engine ships — [oscillators](./engine-sources.md),
[filters, compressors](./engine-effects.md) — is DSP pleco wrote. The
AudioWorklet cluster is the seam where *you* write the DSP and drop it into the
same graph. You register a processor class, instantiate it as a node, wire it
with `connect()` like anything else, and your `process()` method runs
sample-by-sample inside the exact same 128-frame render loop the built-ins run
in. This is the engine's extensibility story: [the model](./engine.md) is open
at the bottom.

It runs headless. There is no browser thread, no worklet worker — pleco's engine
is single-threaded, so the whole two-thread AudioWorklet protocol collapses to
synchronous calls against an engine-internal evaluation scope. The observable
ordering the spec promises still holds (registration finishes before
`addModule()` resolves; the processor is constructed *during* node
construction), but everything happens in one realm, in Node, deterministically.

## The model in three moves

```js
import { PlecoOfflineAudioContext, PlecoAudioWorkletNode } from 'pleco-xa/engine'

const ctx = new PlecoOfflineAudioContext({ numberOfChannels: 1, length: 256, sampleRate: 8192 })

// 1. register a processor class by evaluating a module
await ctx.audioWorklet.addModule(moduleURL)

// 2. instantiate it as a node
const node = new PlecoAudioWorkletNode(ctx, 'my-processor')

// 3. wire it like any other node
someSource.connect(node).connect(ctx.destination)
```

`ctx.audioWorklet` is the context's one `PlecoAudioWorklet` (the spec's
`BaseAudioContext.audioWorklet` — no constructor, lazily vended, one per
context). `addModule()` evaluates a module that calls `registerProcessor()` to
populate the name → class map. `new PlecoAudioWorkletNode(ctx, name)` looks that
name up and constructs the paired processor. Three moves, then it is just a node.

## `addModule()` — loading a module, headless

In the browser `addModule(url)` fetches a script over the network. Pleco is
headless, so the accepted URL surface is deliberately narrow and there is **no
silent fallback** — an unsupported URL is a `TypeError`, not a best-effort guess:

- **`data:` URLs** — the body *is* the module source (percent-encoded, or base64
  with `;base64`). This is how you register inline processors in tests and
  scripts.
- **absolute `file://` URLs** — the file's UTF-8 contents are the source. A
  missing/unreadable file rejects with `AbortError`.
- **everything else rejects** — non-strings, relative URLs (headless Node has no
  document base to resolve against), and any other scheme (`http:`, `blob:`) all
  throw `TypeError`.

The source is evaluated as a **classic script**, so `import`/`export` are
unsupported (a documented parity gap — real worklet scripts are module scripts).
Inside that scope the `AudioWorkletGlobalScope` surface is exposed as bare
identifiers: `registerProcessor`, `AudioWorkletProcessor`, `sampleRate`,
`renderQuantumSize`, and the live-reading `currentTime` / `currentFrame` (so code
inside `process()` reads the advancing clock). The same URL evaluates **at most
once** — a repeat `addModule(sameURL)` resolves without re-running. Errors thrown
by the module (including `registerProcessor`'s validation) propagate as the
rejection *as thrown*, because swallowing a diagnosis helps no one.

The everyday headless pattern is a `data:text/javascript,` URL built from an
inline source string:

```js
const src = `
  registerProcessor('gain-param', class extends AudioWorkletProcessor {
    static get parameterDescriptors() {
      return [{ name: 'gain', defaultValue: 1, minValue: 0, maxValue: 4, automationRate: 'a-rate' }]
    }
    process(inputs, outputs, parameters) {
      const input = inputs[0], output = outputs[0], g = parameters.gain
      for (let c = 0; c < output.length; c++) {
        const inCh = input[c] || new Float32Array(output[c].length)
        for (let i = 0; i < output[c].length; i++) {
          output[c][i] = inCh[i] * (g.length === 1 ? g[0] : g[i])
        }
      }
      return true
    }
  })
`
await ctx.audioWorklet.addModule('data:text/javascript,' + encodeURIComponent(src))
```

## Writing a processor

A processor is a class registered under a name. It optionally extends
`AudioWorkletProcessor` (the base gives you `this.port`), optionally declares
`static parameterDescriptors`, and defines a `process()` method. Only
`registerProcessor(name, class)` is required — the spec does not force the class
to extend the base, and pleco follows the spec.

### The `process()` contract

`process(inputs, outputs, parameters)` is called once per **render quantum** —
exactly 128 sample-frames, always, the same clock tick every built-in node
renders on. The three arguments:

- **`inputs`** — a frozen array of inputs, each a frozen array of `Float32Array`
  channels. Input *n* is `[]` (zero channels) when nothing live feeds it, so
  guard with `inputs[0]?.[0]` or an `|| new Float32Array(128)` fallback, exactly
  as the example does.
- **`outputs`** — zero-filled `Float32Array` channels you write *into*. They
  **are** the node's output blocks — no copy — so writing them is producing
  audio.
- **`parameters`** — a frozen map of name → `Float32Array` holding each declared
  param's per-sample values. A `k-rate` param is always length 1; an `a-rate`
  param that is constant this quantum is also length 1 (the spec's MAY);
  otherwise it is a full 128-frame block. That is why real code checks
  `g.length === 1 ? g[0] : g[i]`.

**Return `true` to stay alive.** The return value is coerced to a boolean and
becomes the processor's active-source flag. `true` keeps `process()` running
every quantum even with nothing connected — the VU-meter / analysis shape relies
on this. Return `false` (or nothing) and, once no input is live either, the node
goes silent and `process()` stops being called — but a later live input
**revives** it. Returning false does not permanently kill the node.

If `process()` throws or is not callable, the node fires `processorerror`
(subscribe via `node.onprocessorerror`) exactly once and outputs silence for the
rest of its life. That path is one-way and honest: no partial audio, no retry.

## The node — params and the port

`new PlecoAudioWorkletNode(ctx, name, options)` defaults to **1 input / 1
output**; `options.numberOfInputs` / `numberOfOutputs` override, and
`options.outputChannelCount`, `channelCount`, and the usual `AudioNode` options
apply. Two surfaces make a worklet node more than a black box:

**`node.parameters`** is a read-only `AudioParamMap` (`get`, `has`, `keys`,
`values`, `entries`, `forEach`, `size`) built from the class's
`parameterDescriptors`. Each entry is a full `PlecoAudioParam` — `.value` plus
every automation method — so you can automate your custom DSP's knobs exactly
like a built-in's:

```js
const node = new PlecoAudioWorkletNode(ctx, 'gain-param', { parameterData: { gain: 2 } })
const gain = node.parameters.get('gain')
gain.setValueAtTime(2, 0)
gain.linearRampToValueAtTime(0, 0.5)   // fade the custom gain over half a second
```

`options.parameterData` sets initial param values; `options.processorOptions` is
structured-cloned and handed to the processor constructor.

**`node.port`** is one end of a `MessagePort` pair; `this.port` inside the
processor is the other. `postMessage()` / `onmessage` carry data both ways —
config down to the processor, captured audio or analysis back up. This is how you
build a recorder, a meter, or a parameter you would rather send as a message than
wire as an `AudioParam`.

## A complete worked example

Registering the `gain-param` processor above, driving it with a constant source,
automating its `gain`, and reading a value the processor posts back — end to end,
in Node:

```js
import { PlecoOfflineAudioContext, PlecoAudioWorkletNode } from 'pleco-xa/engine'

const ctx = new PlecoOfflineAudioContext({ numberOfChannels: 1, length: 256, sampleRate: 8192 })

// a processor that scales its input by the `gain` param AND posts each quantum's peak back
const src = `
  registerProcessor('gain-meter', class extends AudioWorkletProcessor {
    static get parameterDescriptors() {
      return [{ name: 'gain', defaultValue: 1, minValue: 0, maxValue: 4 }]
    }
    process(inputs, outputs, parameters) {
      const input = inputs[0], output = outputs[0], g = parameters.gain
      let peak = 0
      for (let c = 0; c < output.length; c++) {
        const inCh = input[c] || new Float32Array(output[c].length)
        for (let i = 0; i < output[c].length; i++) {
          const v = inCh[i] * (g.length === 1 ? g[0] : g[i])
          output[c][i] = v
          if (Math.abs(v) > peak) peak = Math.abs(v)
        }
      }
      this.port.postMessage(peak)   // send the block peak up to the main scope
      return true
    }
  })
`
await ctx.audioWorklet.addModule('data:text/javascript,' + encodeURIComponent(src))

const dc = ctx.createConstantSource()
dc.offset.value = 0.5
dc.start(0)

const node = new PlecoAudioWorkletNode(ctx, 'gain-meter', { parameterData: { gain: 2 } })
const peaks = []
node.port.onmessage = (e) => peaks.push(e.data)

dc.connect(node).connect(ctx.destination)

const buffer = ctx.renderSync()               // 256 frames = 2 quanta
await new Promise((r) => setTimeout(r, 0))    // let queued port messages deliver

console.log(buffer.getChannelData(0)[0])      // 1.0  (0.5 * gain 2)
console.log(peaks)                            // [1, 1] — one peak per quantum
```

Note the **macrotask flush**. `renderSync()` runs the graph synchronously, but
`port.postMessage` deliveries are queued (the single-thread analogue of the
control-thread hop) and fire on the next macrotask — so an `await setTimeout`
after the render is what lets `onmessage` run. Miss it and `peaks` reads empty
not because nothing was sent, but because the messages have not been dispatched
yet. (`await ctx.startRendering()` works the same way for the async offline
path.)

## Honest edges

- **Classic-script only.** Module source is evaluated as a classic script;
  `import`/`export` are unsupported. Inline everything, or split shared code
  across `addModule()` calls (state written to the scope by one module persists
  for later ones — wavetables, lookup tables).
- **The scope-level port is dispositioned out.** The spec draft's
  `AudioWorklet.port` ↔ `AudioWorkletGlobalScope.port` channel is not
  implemented (in a single realm it would connect the realm to itself). The
  **per-node** `AudioWorkletNode.port` ↔ processor `port` pair — the one you
  actually reach for — is fully there.
- **Silence has a shape.** A processor that returns false with no live input, or
  one that has hit the error path, outputs silence at its configured channel
  count rather than a single silent channel. Silent channels are sum-neutral, so
  this is inaudible — but it is a documented divergence, catalogued in the
  [parity reference](./engine-parity.md).

## Where to go next

- The tier this builds on, and the render loop your `process()` runs in →
  [The audio engine](./engine.md)
- The friendly `studio` names (`Processor`, `s.audioWorklet.addModule()`) →
  [Studio](./studio.md)
- The full interface-by-interface conformance and the documented divergences →
  [Parity reference](./engine-parity.md)
