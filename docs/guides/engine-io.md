---
title: Audio I/O — realtime, sinks, media, and decode
description: The one seam where pleco's headless audio engine meets the outside world — the realtime PlecoAudioContext, the swappable sink adapter contract, the flagged media-node adapters, and decodeAudioData.
---

Everything in the [engine](./engine.md) is pure math pleco owns: the graph, the
128-frame render loop, every node's DSP. This guide covers the four places that
math touches something it does *not* own — a speaker, a microphone, a
`<video>` element, an encoded file on disk — and how pleco keeps each behind a
thin, swappable, honestly-flagged adapter so the engine stays deterministic and
headless.

Everything here imports from `pleco-xa/engine`; the [Studio guide](./studio.md)
renames it to the friendlier `live()` / `NullSink` surface.

## The realtime context

`PlecoAudioContext` is the same frame-counter engine as
`PlecoOfflineAudioContext` — identical render math — with one difference: it is
paced by a **sink adapter** instead of a `startRendering()` call. Construct it,
`resume()` it, and the sink pulls audio through the graph one quantum at a time.

```js
import { PlecoAudioContext, PlecoMockSink } from 'pleco-xa/engine'

const sink = new PlecoMockSink()
const ctx = new PlecoAudioContext({ sink, sampleRate: 48000 })

ctx.createOscillator().connect(ctx.destination)
ctx.destination // channelCount mutable up to sink.maxChannelCount

await ctx.resume()   // 'suspended' -> 'running'; opens the sink
sink.step(10)        // drive 10 render quanta through the graph
await ctx.suspend()  // 'running' -> 'suspended'; releases the sink
await ctx.close()    // 'closed', forever
```

### Constructor options

`AudioContextOptions`, plus pleco's one extension member, `sink`:

| Option | Meaning |
|---|---|
| `latencyHint` | `'interactive'` (default, 1 quantum), `'balanced'` (2), `'playback'` (4), or a seconds double quantized **up** to whole quanta (min 1). Drives `baseLatency`. |
| `sampleRate` | Hz, default `44100` (the spec queries the device's preferred rate; pleco fixes a documented default rather than hiding a query). |
| `sinkId` | `''` (default device), a device-id string, or `AudioSinkOptions` `{ type: 'none' }` for deviceless rendering. |
| `renderSizeHint` | `'default'` / `'hardware'` / integer — all resolve to pleco's fixed **128**-frame quantum; a valid-but-different integer throws `NotSupportedError` (documented parity gap). |
| `sink` | **pleco extension** — the adapter that services device-bound output (see the contract below). |

There is no silent fallback for a missing device: requesting `''` or a device id
with **no** injected `sink` throws `NotSupportedError` at construction, naming
the gap. To run headless with zero injection, use `sinkId: { type: 'none' }` —
the context builds an internal `PlecoNullSink` and you step it via the
engine-internal `ctx._sink`.

### The state machine

`suspended` / `running` / `closed`, driven by `resume()` / `suspend()` /
`close()` — each a promise that settles in call order (lifecycle work runs on an
internal control-message queue, single-threaded, no timers). `onstatechange`
fires as the visible `state` flips inside the queued message.

- **Construction never auto-starts.** The spec lets a user agent gate the first
  `suspended → running` on user activation; pleco always gates — `resume()` is
  the explicit start.
- **`close()` is terminal.** A closed context never revives; a second `close()`
  rejects `InvalidStateError`. Every asynchronous state revert (a failed
  `resume()`, `setSinkId()`, interruption end) is guarded so a superseding
  `close()` is never clobbered.
- A fourth state, `interrupted`, exists for spec fidelity but its triggers
  (`_beginInterruption()` / `_endInterruption()`) are host-facing primitives
  excluded from the parity surface — headless pleco has no user agent to fire
  them.

### Latency and timing

- `baseLatency` — `latencyQuanta × 128 / sampleRate`, from `latencyHint`.
- `outputLatency` — read **live** from the sink adapter servicing the current
  target (`0` for a `'none'` sink).
- `getOutputTimestamp()` → `{ contextTime, performanceTime }` — both zero until
  the first quantum renders; after that `contextTime` is `currentTime` minus the
  full pipeline latency (clamped at 0), correlated to `performance.now()`.

### The sink surface

- `sinkId` — `''` or a cached `PlecoAudioSinkInfo` (same object after caching);
  `AudioSinkInfo.type` is `'none'`.
- `setSinkId(sinkId)` — a promise-returning swap; argument/validation errors are
  **rejections**, never throws. A non-empty device id is vetted by the adapter's
  optional `validateSinkId()` (absent or `false` → `NotAllowedError`). While
  running, the swap brackets as `statechange('suspended')` → acquire →
  `sinkchange` → `statechange('running')`. `onsinkchange` fires on the swap.
- `playbackStats` → `PlecoAudioPlaybackStats`: `underrunDuration`,
  `underrunEvents`, `totalDuration` (`underrunDuration + currentTime`),
  `averageLatency` / `minimumLatency` / `maximumLatency`, `resetLatency()`, and
  `toJSON()`. Underruns arrive from the sink's `onUnderrun`; one latency sample
  is taken per rendered quantum from the live `outputLatency`. (The spec's
  once-per-second refresh and visibility gating are browser privacy mitigations
  with no headless analogue — pleco updates continuously, documented.)

## The sink adapter contract

The sink is the architecture's load-bearing seam: **the sink owns the pacing.**
After `open()`, whenever the device (or a synthetic clock) needs audio it calls
`pull()`, and the context renders exactly one quantum in response. The context
never paces itself — no timers of any kind. A hardware callback, an
AudioWorklet `process()` tick, and a manually-stepped test loop are all valid
clocks, and the render math is identical for each. That is precisely why a
realtime context stepped N quanta produces bit-identical blocks to an offline
render of the same graph.

A sink adapter is any object with this surface:

| Member | Contract |
|---|---|
| `open(format, callbacks)` | Acquire the output resource. Throwing/rejecting **is** the acquisition-failure signal (maps to `resume()` rejection / `setSinkId()` `InvalidAccessError`). |
| `close()` | Release the resource. **Must be idempotent** — the context may close an already-closed sink. |
| `outputLatency` | Readable seconds; the device latency estimate, read live. May change while open. |
| `maxChannelCount` | Integer ≥ 1; surfaced as `destination.maxChannelCount`. |
| `validateSinkId(id)` | **Optional.** Device-id validation for `setSinkId()`; any return ≠ `true` rejects. Absent → every id validates (a documented permissive default, never a silent fallback). |

`open()` receives:

- **`format`** — `{ sampleRate, numberOfChannels, renderQuantumSize, sinkId }`.
  `numberOfChannels` is `destination.channelCount` **at open time only** — a
  snapshot, not a bound.
- **`callbacks`** — `{ pull(), onUnderrun(frames), onError(error) }`.

**`pull()`** returns `Array<Float32Array>` (one freshly-allocated array per
channel, `renderQuantumSize` frames), or `null` when the context is not running
— on `null` the sink outputs silence and may idle.

Three rules the adapter must honor:

- **Block-buffer ownership.** The channel arrays `pull()` returns become the
  sink's property; the engine never reads them back or re-vends them. Adapters
  may retain, transfer (e.g. `postMessage` to a worklet ring), or mutate them
  freely — but two pulls never share storage.
- **Channel-count renegotiation.** `destination.channelCount` is mutable while
  open (up to `maxChannelCount`); the context does **not** re-open on a change.
  Each pulled block carries the channelCount *at pull time*. Size per-block from
  the returned array's length, never from the `format` snapshot.
- **Fault reporting.** A gap the engine didn't fill in time → `onUnderrun(frames)`
  once per continuous gap. A device failure *after* a successful `open()` →
  `onError(error)` (the context runs the spec's release-suspend-`error` steps).
  Failures *during* `open()` are signalled by throwing, never via `onError`.

A real browser/hardware adapter is a **drop-in**: because the two shipped
adapters below honor this contract and the context is tested end-to-end against
them, the real device adapter changes no context code.

### The two shipped adapters

**`PlecoNullSink`** — the spec's `'none'` sink (`type` `'none'`). No device, no
timers: it renders on a synthetic cadence driven manually by `step(n)`, which
performs `n` pull cycles synchronously and discards the audio, returning the
count of non-null (rendered) blocks. Deterministic and headless by
construction; the context builds one internally for `sinkId: { type: 'none' }`.

```js
import { PlecoAudioContext } from 'pleco-xa/engine'

const ctx = new PlecoAudioContext({ sinkId: { type: 'none' } })
ctx.createOscillator().connect(ctx.destination)

await ctx.resume()
const rendered = ctx._sink.step(100) // 100 quanta; ctx._sink is the internal null sink
console.log(rendered)                // 100 (all rendered while running)
```

**`PlecoMockSink`** — a `PlecoNullSink` (`type` `'mock'`) that also records every
pulled block (deep copies in `.blocks`), counts `openCount` / `closeCount` /
`pullCount`, keeps `.openFormats`, exposes a mutable `outputLatency`, and injects
the async fault paths: `simulateUnderrun(frames)`, `simulateError(error)`, and a
`failOpen` flag that makes `open()` throw. It is the test double for the whole
realtime lifecycle.

```js
import { PlecoAudioContext, PlecoMockSink } from 'pleco-xa/engine'

const sink = new PlecoMockSink({ outputLatency: 0.01 })
const ctx = new PlecoAudioContext({ sink })
ctx.createOscillator().connect(ctx.destination)

await ctx.resume()
sink.step(4)
console.log(sink.blocks.length)        // 4 recorded quanta
sink.simulateUnderrun(128)             // one underrun event of 128 frames
console.log(ctx.playbackStats.underrunEvents) // 1
```

## Decoding audio: `decodeAudioData`

`BaseAudioContext.decodeAudioData(audioData, successCallback?, errorCallback?)`
decodes an encoded `ArrayBuffer` into a `PlecoAudioBuffer` at the context's
sample rate. It is available on both context types (it lives on the shared base).

Supported formats are **explicit and exhaustive** — anything else rejects with
`EncodingError`, never a silent fallback:

- RIFF/WAVE PCM (format 1): 8-bit unsigned, 16/24/32-bit signed LE, mono to 32
  channels.
- RIFF/WAVE IEEE float (format 3): 32-bit LE.

Compressed containers (MP3/OGG/AAC) and `WAVE_FORMAT_EXTENSIBLE` are not
supported and reject. When the file's rate differs from the context's, the
channels are resampled by linear interpolation (the spec's decode step 5.1).

```js
import { PlecoAudioContext } from 'pleco-xa/engine'
import { readFileSync } from 'node:fs'

const ctx = new PlecoAudioContext({ sinkId: { type: 'none' } })
const bytes = readFileSync('break.wav')
const audioData = bytes.buffer.slice(bytes.byteOffset, bytes.byteOffset + bytes.byteLength)

const buffer = await ctx.decodeAudioData(audioData) // -> PlecoAudioBuffer @ ctx.sampleRate
console.log(buffer.numberOfChannels, buffer.length)
// audioData is now DETACHED (byteLength 0) — decode transfers the bytes, per spec
```

The bytes are detached (transfer semantics) before decoding; an already-detached
buffer rejects with `DataCloneError`, a closed context with `InvalidStateError`
(without detaching). Decode failure surfaces through *both* the promise and
`errorCallback`.

## Media-node adapters — flagged, out of spec

`PlecoAudioContext` carries the four media source/destination nodes:
`createMediaElementSource()`, `createMediaStreamSource()`,
`createMediaStreamTrackSource()`, and `createMediaStreamDestination()`. But
`HTMLMediaElement`, `MediaStream`, and `MediaStreamTrack` belong to the **HTML**
and **Media Capture and Streams** specs — *not* Web Audio. Pleco does not
implement them and claims no parity for them.

⚑ **These are adapter shims, honestly flagged.** The media objects enter the
graph only as duck-type shapes, and audio crosses the boundary through one
documented extension seam — `plecoSampleFeed`. A media object *without* a feed is
refused at construction with `NotSupportedError` (the same no-silent-fallback
rule as the missing-sink gate). Real browser objects satisfy the *structural*
half as-is; the browser env adapter that supplies the feed is a separate
deliverable.

The seam is `PlecoMediaSampleFeed` — a FIFO of planar Float32 chunks with
`channelCount`, an optional `sampleRate` (must equal the context rate or
`NotSupportedError`), `read(frames)`, and the push-side `enqueue(channels)`. A
short or `null` read is the underrun signal: the node renders explicit silence
for the shortfall and accounts it on `_underrunFrames` (never fabricated signal).

```js
import { PlecoAudioContext, PlecoMediaElementShim, PlecoMediaSampleFeed } from 'pleco-xa/engine'

const ctx = new PlecoAudioContext({ sinkId: { type: 'none' } })

const feed = new PlecoMediaSampleFeed({ channelCount: 2, sampleRate: ctx.sampleRate })
const element = new PlecoMediaElementShim({ feed })       // element-like duck
const src = ctx.createMediaElementSource(element)
src.connect(ctx.destination)

// push audio in from the host side; the node reads it a quantum at a time
feed.enqueue([new Float32Array(256).fill(0.2), new Float32Array(256).fill(0.2)])
await ctx.resume()
ctx._sink.step(2)
```

The shim family: `PlecoMediaStreamTrackShim` (track-like, `stop()` ends it, pass
`feed: null` for the unfed error path), `PlecoMediaStreamShim` (stream-like,
`getAudioTracks()` filtering), and `PlecoMediaElementShim` above.
`createMediaStreamDestination()` runs the seam in reverse — the node writes its
input mix into its own track's feed for the host to read via `.stream`.

Honest edges, all documented: an `enabled === false` track renders silence
without draining (re-enabling resumes where it left off); an `ended` track
outputs the spec's one channel of silence; CORS muting is host/adapter scope — a
cross-origin resource simply yields no feed here.

## API reference

The realtime context, sink adapters, and media nodes follow the W3C Web Audio
interface names; full per-member signatures are generated into the
[API reference](../api-by-category.md) under the `engine` namespace, and the
[parity reference](./engine-parity.md) is the interface-by-interface map.

**See also:** [the audio engine](./engine.md) for the tier underneath and why the
sink seam exists · [Studio](./studio.md) for the friendly `live()` / `NullSink`
names.
