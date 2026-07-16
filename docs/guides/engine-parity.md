---
title: Engine parity reference
description: The interface-by-interface parity table for pleco-xa's Web Audio engine — 37 of 39 live W3C interfaces implemented, mapped to their Pleco class, with the two documented divergences, the WebIDL-coercion alignment, and the verification story (browser-bounce corpus + web-platform-tests).
---

This is the completeness proof for [`pleco-xa/engine`](./engine.md) and, read the
other direction, the map for anyone arriving from Web Audio: one row per W3C
interface, each pointing at the Pleco class that implements it. The
[engine guide](./engine.md) tells the verification *story*; this page is the
ledger behind it.

"Parity" here means three specific, separable claims:

- **Behavior is spec-exact** — verified, not asserted. The engine renders the
  same samples as a real browser; where it cannot be bit-identical, the spec
  itself delegates the exact shape to the user agent (see
  [Documented divergences](#documented-divergences)).
- **Capability is a superset** — everything Web Audio does, *plus* headless
  operation in Node with zero dependencies and the Pleco-Xa analysis layer
  alongside.
- **Names are plecoized** — classes carry a `Pleco` prefix but otherwise keep the
  exact W3C member names, so the surface stays a literal drop-in. The friendly
  short names live in the [Studio Rosetta table](./studio.md#coming-from-web-audio--the-rosetta-table);
  this page uses the spec-shaped engine names.

**Headline count:** of the 39 interfaces in the W3C Web Audio spec, **37 live
interfaces are implemented** and **2 are deprecated-and-deferred**
(`ScriptProcessorNode` + `AudioProcessingEvent`). No live interface is missing.

## The parity table

Every row is a W3C spec interface. The **pleco class** column is drawn verbatim
from the engine's public export barrel (`packages/pleco-xa/src/engine/index.js`);
only classes exported there are shipped, constructible public surface. **Status**
is one of:

- **implemented** — full spec-shape parity, only deliberate house strictness.
- **implemented ◆** — implemented and rendering, with a behavioral divergence
  documented in [Documented divergences](#documented-divergences).
- **implemented (sub-feature deferred)** — the interface ships; a specific
  sub-feature is deferred, noted in-row and in the
  [Deferred sub-features](#deferred-sub-features) list.
- **deferred (deprecated)** — deprecated in the spec; no build task scheduled.

### Contexts

| W3C interface | pleco class | status | notes |
|---|---|---|---|
| `BaseAudioContext` | `PlecoBaseContext` | implemented | shared base: graph, clock, `currentTime`, `sampleRate`, `destination`, `listener`, `decodeAudioData()`, every `createXxx()` factory |
| `AudioContext` | `PlecoAudioContext` | implemented (sub-feature deferred) | full realtime state machine; `renderSizeHint ≠ 128` throws `NotSupportedError` (fixed render quantum) |
| `OfflineAudioContext` | `PlecoOfflineAudioContext` | implemented (sub-feature deferred) | render-to-buffer via `startRendering()`; shares the fixed-quantum limit |
| `OfflineAudioCompletionEvent` | `PlecoOfflineAudioCompletionEvent` | implemented | carries `renderedBuffer` |
| `AudioSinkInfo` | `PlecoAudioSinkInfo` | implemented | the `setSinkId()` info surface |
| `AudioPlaybackStats` | `PlecoAudioPlaybackStats` | implemented | in-draft `playbackStats` (WICG `playoutStats` deliberately excluded) |

### Node base · buffers · params · wavetables · listener

| W3C interface | pleco class | status | notes |
|---|---|---|---|
| `AudioNode` | `PlecoNode` | implemented | base node: `connect()`/`disconnect()`, channel-count/mode/interpretation |
| `AudioScheduledSourceNode` | `PlecoScheduledSourceNode` | implemented | `start()`/`stop()`/`onended` base for all sources |
| `AudioBuffer` | `PlecoAudioBuffer` | implemented | also exported as the `createPlecoAudioBuffer` factory |
| `AudioParam` | `PlecoAudioParam` | implemented | `.value` + all seven automation methods |
| `PeriodicWave` | `PlecoPeriodicWave` | implemented | custom wavetables for the oscillator |
| `AudioListener` | `PlecoAudioListener` | implemented | deprecated `setPosition`/`setOrientation` kept as param-setting conveniences |

### Source nodes

| W3C interface | pleco class | status | notes |
|---|---|---|---|
| `AudioBufferSourceNode` | `PlecoAudioBufferSourceNode` | implemented | `loop`, `playbackRate`, `detune` |
| `ConstantSourceNode` | `PlecoConstantSourceNode` | implemented | |
| `OscillatorNode` | `PlecoOscillatorNode` | implemented ◆ | built-in waveforms differ from Chrome by band-limiting (spec: UA-defined) |

### Processing nodes

| W3C interface | pleco class | status | notes |
|---|---|---|---|
| `GainNode` | `PlecoGainNode` | implemented | |
| `DelayNode` | `PlecoDelayNode` | implemented | feedback-cycle rule enforced |
| `BiquadFilterNode` | `PlecoBiquadFilterNode` | implemented | all 8 filter types + `getFrequencyResponse()` |
| `IIRFilterNode` | `PlecoIIRFilterNode` | implemented | |
| `WaveShaperNode` | `PlecoWaveShaperNode` | implemented | |
| `DynamicsCompressorNode` | `PlecoDynamicsCompressorNode` | implemented ◆ | curve differs from Chrome (spec model, not a bit-exact clone) |

### Spatial · routing nodes

| W3C interface | pleco class | status | notes |
|---|---|---|---|
| `StereoPannerNode` | `PlecoStereoPannerNode` | implemented | equal-power pan |
| `PannerNode` | `PlecoPannerNode` | implemented (sub-feature deferred) | `equalpower` full; `panningModel = 'HRTF'` accepted but outputs stereo silence (no HRIR dataset) |
| `ChannelSplitterNode` | `PlecoChannelSplitterNode` | implemented | |
| `ChannelMergerNode` | `PlecoChannelMergerNode` | implemented | |
| `AudioDestinationNode` | `PlecoAudioDestinationNode` | implemented | the graph terminus (`ctx.destination`) |

### Analysis nodes

| W3C interface | pleco class | status | notes |
|---|---|---|---|
| `AnalyserNode` | `PlecoAnalyserNode` | implemented | FFT + all four data methods |
| `ConvolverNode` | `PlecoConvolverNode` | implemented | direct convolution; strict `normalize`/`buffer` |

### AudioWorklet cluster

| W3C interface | pleco class | status | notes |
|---|---|---|---|
| `AudioWorkletNode` | `PlecoAudioWorkletNode` | implemented | per-node `port` fully implemented |
| `AudioWorkletProcessor` | `PlecoAudioWorkletProcessor` | implemented | per-node `port` fully implemented |
| `AudioParamMap` | `PlecoAudioParamMap` | implemented | |
| `AudioWorklet` | `PlecoAudioWorklet` | implemented (sub-feature deferred) | `addModule()` works; classic-script eval (no ES modules), scope-level `port` deferred (single-realm) |
| `AudioWorkletGlobalScope` | `PlecoAudioWorkletGlobalScope` | implemented (sub-feature deferred) | scope-level `port` deferred (single-realm N/A) |

`PlecoAudioWorkletGlobalScope` ships alongside `PlecoAudioWorkletProcessor` and
the `PlecoErrorEvent` shim from the worklet module.

### Media nodes + out-of-spec adapters

The four media source/destination *nodes* are in-spec and implemented. Their
input side, however, belongs to **other specifications** (Media Capture and
Streams, HTML) — so pleco feeds them through flagged, out-of-spec **env
adapters** rather than pretending to own those specs. An unfed media node
surfaces a missing-adapter condition; it never renders silent zeros.

| W3C interface | pleco class | status | notes |
|---|---|---|---|
| `MediaElementAudioSourceNode` | `PlecoMediaElementAudioSourceNode` | implemented (needs env adapter) | fed by `PlecoMediaElementShim` |
| `MediaStreamAudioSourceNode` | `PlecoMediaStreamAudioSourceNode` | implemented (needs env adapter) | fed by `PlecoMediaStreamShim` |
| `MediaStreamTrackAudioSourceNode` | `PlecoMediaStreamTrackAudioSourceNode` | implemented (needs env adapter) | fed by `PlecoMediaStreamTrackShim` |
| `MediaStreamAudioDestinationNode` | `PlecoMediaStreamAudioDestinationNode` | implemented (needs env adapter) | drains through `PlecoMediaSampleFeed` |

The adapters themselves — `PlecoMediaSampleFeed`, `PlecoMediaStreamShim`,
`PlecoMediaStreamTrackShim`, `PlecoMediaElementShim` — are exported but are **not
W3C interfaces**; their `pushData()`/`read()` conveniences stay adapter-side and
never appear on a Pleco node class. `getUserMedia` / `navigator.mediaDevices`
and `HTMLMediaElement` are correspondingly out of scope (other specs).

### Sink — the one irreducible seam

The sink is where finished samples leave for a speaker. It is **not a W3C
interface** (the spec's `'none'` sink is a behavior, not a class), so it is
modeled as a swappable adapter contract rather than counted among the 39.

| pleco class | role |
|---|---|
| `PlecoNullSink` | the `'none'` sink — steps on a synthetic cadence (`step(n)`), discards audio; zero timers, deterministic, headless |
| `PlecoMockSink` | a `PlecoNullSink` that records every pulled block and can inject underrun / device-error / open-failure faults |

A real hardware adapter is a drop-in: honor `open()` / `close()` / `pull()` and
no context code changes. See the [Audio I/O guide](./engine-io.md).

### Deferred (deprecated)

| W3C interface | pleco class | status | notes |
|---|---|---|---|
| `ScriptProcessorNode` | — | deferred (deprecated) | deprecated in spec; `AudioWorkletNode` is the shipped replacement |
| `AudioProcessingEvent` | — | deferred (deprecated) | paired with `ScriptProcessorNode`; deferred with it |

`BaseAudioContext.createScriptProcessor()` is deferred with them and is not
counted against factory completeness.

**Tally:** 37 implemented live interfaces (30 clean · 7 carrying a documented
sub-feature gap or divergence) · 2 deferred-deprecated = **39**.

## Documented divergences

Parity is verified bit-for-bit against a real browser wherever the spec is
deterministic. Two interfaces cannot be bit-identical to Chrome — and in both
cases **the spec itself delegates the exact shape to the user agent**, so pleco
is spec-faithful while differing from Chrome bit-for-bit. These are deliberate
and honest, not bugs.

### 1. `OscillatorNode` — built-in waveform band-limiting

Pleco synthesizes the built-in waveforms (`square`, `sawtooth`, `triangle`) from
a single fixed-harmonic wavetable shared across all pitches. Chrome band-limits
per pitch range, keeping only sub-Nyquist partials. In the browser-bounce corpus
a 256 Hz square at SR 8192 keeps partials that alias below Nyquist, producing a
worst-case per-sample deviation of ~1.36e-1 near the waveform's discontinuities.
The spec leaves the anti-aliasing strategy implementation-defined; a single table
cannot band-limit per playback frequency. Tracked red (`it.fails`); flips green
the day per-range band-limited tables land. Sine, and any custom `PeriodicWave`,
are unaffected and render bit-exact.

### 2. `DynamicsCompressorNode` — compression curve

Pleco implements the spec's DynamicsCompressorNode *processing model*, which
describes Chrome's kernel but is not a bit-identical clone of it — Chrome's
adaptive release curve, knee tables, and lookahead rounding all differ in the
details. On a burst, Chrome applies ~1.8 dB more gain reduction with an adaptive
attack dip the spec model lacks (observed per-block RMS error ~81.7% at attack,
decaying to ~17.9% at steady state — same shape, same timing, more reduction in
Chrome). The spec is explicitly a model, not a reference clone. A coarse 2×
block-RMS envelope check passes as a sanity net; the tight 20% parity bar is kept
red via `it.fails`.

### 3. WebIDL-coercion alignment (deliberately matched, not diverged)

The one place pleco's house rules bend *toward* the browser rather than away:
the WebIDL argument-conversion layer. Pleco's default stance is strict — never
fabricate a result, never swallow a diagnosis — but at the binding seam,
**matching the browser is the parity product**, so the coercion behavior is
deliberately aligned to real browsers:

- **Fractional `length` truncates** to `unsigned long` (rather than rejecting).
- **`TypeError` / `IndexSizeError`** are thrown exactly where the IDL mandates.
- **Non-object constructor arguments** coerce to `TypeError` via the shared
  option-coercion path.

This is a scoped, intentional reversal of the strictness rule *at the conversion
layer only* — the DSP and no-silent-fallback rules elsewhere are unchanged. It is
what moved the WPT conformance run from its first pass to a clean sweep of the
in-scope suite.

> **Note on the sub-feature deferrals.** The `renderSizeHint ≠ 128`, HRTF, and
> AudioWorklet scope-`port` items in the table are *deferred sub-features*, not
> behavioral divergences — each surfaces its limitation honestly (a thrown
> `NotSupportedError`, stereo silence, or an absent member) rather than
> fabricating a result. They are listed under
> [Deferred sub-features](#deferred-sub-features).

## Verification

The parity claim is measured, not hand-asserted, by two independent harnesses
that check different things.

### Browser-bounce corpus — bit-exact vs real Chrome

16 identical node graphs are bounced by a shipping Chrome
`OfflineAudioContext.startRendering()` (SR 8192, via chrome-devtools MCP) and
re-rendered sample-for-sample by `PlecoOfflineAudioContext`, then diffed. The
result: **9 fixtures bit-exact, 5 within 1.3e-7, 2 structural gaps** (the
oscillator and compressor divergences above, held red by `it.fails`). Tolerance
tiers follow the nature of the path — `1e-6` for exact/linear paths, `1e-4` for
interpolated/filtered paths (double-precision evaluation-order differences),
`1e-3` for synthesis paths (wavetable size and interp kernel are
implementation-defined). Even the "within 1.3e-7" rows are effectively exact:
the deltas come from Chrome flushing denormals to zero, or FFT-block vs
direct-convolution rounding — not from different math.

### web-platform-tests — spec-shape conformance

The web-platform-tests `webaudio/the-audio-api/**` behavioral suite runs against
the engine under a WebIDL-shape shim (a global mapping of spec names to `Pleco*`
classes + a testharness reimplementation + runner), guarded in CI by
`tests/engine-wpt-conformance.test.js`. **Every executed assertion passes — 100%
of the in-scope suite** (the CI floor is set at 99.9% to leave headroom for
last-ULP float32 drift; current is a clean sweep of ~2100 assertions across the
in-scope files). Whole interface files pass clean (biquad
`getFrequencyResponse` 90/90, k-rate panner connections 93/93, oscillator basic
waveform 33/33, delaynode 136/136, sub-sample 53/53).

Twelve files are **skipped as documented out-of-scope** — not pleco defects:

- Deprecated `ScriptProcessorNode` API (deferred, above).
- `HTMLMediaElement` / `new Audio()` harnesses (other spec — HTML).
- A realtime suspend/resume driver the offline runner cannot provide.
- Secure-context worklet-fetch harnesses.
- `ArrayBuffer` detaching pleco does not emulate.
- Two k-rate-via-input files that diverge only at the ~8th decimal (float32
  summation non-associativity).

The two harnesses are complementary: the browser-bounce corpus proves
**bit-exactness vs Chrome**; WPT proves **spec-shape conformance**. The
[Studio tier](./studio.md#verified-against-the-browser) is in turn asserted to
render identical samples to this engine in CI, so its friendly names inherit the
same fidelity.

## Deferred sub-features

Shipped interfaces with a specific sub-feature deferred. Each surfaces its
limitation honestly rather than faking a result.

- **Configurable render quantum** — the quantum is fixed at 128. A
  `renderSizeHint` integer ≠ 128 throws `NotSupportedError` naming the limitation
  (`'default'`/`'hardware'` resolve to 128). Affects `AudioContext` and
  `OfflineAudioContext`.
- **`PannerNode` HRTF** — `panningModel = 'HRTF'` is accepted as a valid value
  but outputs stereo silence rather than substituting equalpower, because HRTF
  requires a measured head-related impulse-response dataset (another spec's
  dependency). `equalpower` is complete.
- **AudioWorklet module format** — module source evaluates as a *classic* script
  in a per-context `node:vm` scope; static `import`/`export` are unsupported.
- **AudioWorklet scope-level `port`** — the `AudioWorklet.port` ↔
  `AudioWorkletGlobalScope.port` pair is dispositioned out (in a single-realm
  engine it would connect a realm to itself). **Per-node** ports
  (`AudioWorkletNode.port` ↔ `AudioWorkletProcessor.port`) are fully implemented.

## Out of spec — correctly excluded

None of these are Web Audio spec interfaces; each is excluded on purpose:

- **`getUserMedia` / `navigator.mediaDevices`** — Media Capture and Streams;
  audio input enters only as a MediaStream/Track handed to a source node by an
  env adapter.
- **`MediaStream` / `MediaStreamTrack`** — Media Capture and Streams; ship only
  as flagged adapter shims, never on a Pleco node class.
- **`HTMLMediaElement`** — HTML; the media-element node takes an adapter stand-in.
- **`MessagePort` / `EventTarget` / `Event`** — DOM/HTML; use host globals, zero
  vendored implementation.
- **Web MIDI, MediaRecorder, WebCodecs, AudioSession, `enumerateDevices`** —
  separate specs, entirely out of scope. `decodeAudioData` is the only in-spec
  decode path; the `setSinkId` surface stops at
  `AudioSinkInfo`/`AudioSinkOptions` with device binding delegated to the host
  adapter.

## Where to go next

- The verification story in prose → [The audio engine](./engine.md)
- The friendly pleco names → [Studio](./studio.md)
- Build a graph node by node → [Sources](./engine-sources.md) ·
  [Effects](./engine-effects.md) · [Spatial & routing](./engine-spatial.md) ·
  [Analysis](./engine-analysis.md) · [Worklets](./engine-worklet.md) ·
  [Audio I/O](./engine-io.md)
