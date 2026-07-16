# Web Audio pillar — documentation + demo catalogue design

**Date:** 2026-07-15
**Branch:** `arturia-parity`
**Status:** design (best-judgment defaults taken while author away; flagged forks below)

## Goal

Pleco-Xa's Web Audio pillar shipped as code (37 interfaces, two importable tiers:
`pleco-xa/engine` spec-shaped, `pleco-xa/studio` plecoized skin) but is
under-documented and has **zero demos**. The rest of the library sets the bar:
20 per-area narrative guides + a corpus of 52 web / 68 node demos (~50 gallery
cards), each asserting real results. This design brings the Web Audio pillar to
that bar, in the order Cameron specified:

1. **First — documentation, extensively.** A comprehensive guide set for the new
   functionality.
2. **Then — a demo set**, one relevant demo per capability, matching the existing
   per-function pattern, derived from the engine surface.

## Open forks (Cameron's calls — defaults taken to keep moving)

| # | Decision | Default taken | Why safe / reversible |
|---|---|---|---|
| Q1 | Doc depth | **Clustered guides (~8)** — not per-interface pages | Clustered guides stand even if per-interface pages are added later (additive). Generated `api-by-category` already owns per-symbol signatures. |
| Q2 | Demo granularity | **Per node/capability (~20)** | The library's actual convention (clusters already bundle members: effects.html = 7 ops). Catalogue lives on paper here until confirmed. |
| Q3 | Web-demo parity A/B | **Yes — live parity badge** | Each web demo A/Bs pleco vs native browser Web Audio; "sample-identical" where bit-exact, honest "UA-curve differs" for the 2 known-divergent nodes. The pillar's strongest flex. |
| Q4 | Execution vehicle | **Deferred** — needs opt-in | Workflow fan-out is the proven method but multi-agent execution is opt-in. Docs (low-risk) proceed inline now; demo-file build waits on Q2/Q3 confirmation. |

## Phase 1 — Documentation architecture

Guides live in `docs/guides/` (root `docs/` is the sole source; the build mirrors
into `packages/pleco-xa/docs/` via `tools/generate-llms.mjs`). Registered in
`docs/guides/index.md` under a new **"Audio engine"** section (already seeded with
studio.md).

Principle: **guides teach + link; the generated `api-by-category` reference owns
signatures.** No guide re-enumerates every member (avoids two-sources-of-truth
drift).

| Guide | Covers | Status |
|---|---|---|
| `studio.md` | The plecoized skin: offline()/live(), node aliases, Rosetta table | ✓ done |
| `engine.md` | **Anchor.** Why the engine exists (headless, deterministic, verified), the context·node·param model, the 128-frame render loop, the swappable sink seam, the two-tier surface, the verification story (browser-bounce + WPT) | new |
| `engine-sources.md` | Oscillator + PeriodicWave (band-limited wavetable), AudioBufferSource (loop + playbackRate/detune), ConstantSource | new |
| `engine-effects.md` | Gain, Delay (+ the cycle rule), BiquadFilter (8 types) + IIRFilter, WaveShaper, DynamicsCompressor | new |
| `engine-spatial.md` | StereoPanner, Panner + Listener (3D), ChannelSplitter/Merger, the channel up/down-mix model | new |
| `engine-analysis.md` | Analyser (fftSize + 4 data methods, pleco FFT kernel), Convolver | new |
| `engine-worklet.md` | AudioWorklet cluster: addModule, AudioWorkletNode (AudioParamMap, port), AudioWorkletProcessor, custom-DSP extensibility | new |
| `engine-io.md` | Realtime AudioContext + sink adapters (Null/Mock), media-node adapters (MediaElement/MediaStream), decodeAudioData | new |
| `engine-parity.md` | **Reference.** The 37-interface × member parity table + coming-from-Web-Audio map; the completeness proof and the 2 documented divergences | new |

Public surface being documented (from `src/engine/index.js`): contexts
(`PlecoBaseContext`, `PlecoAudioContext` + `PlecoAudioSinkInfo` +
`PlecoAudioPlaybackStats`, `PlecoOfflineAudioContext` + completion event);
`PlecoAudioBuffer`, `PlecoAudioParam`, `PlecoPeriodicWave`, `PlecoAudioListener`;
`PlecoNode`/`PlecoScheduledSourceNode`; 18 node classes; the AudioWorklet cluster
(`PlecoAudioWorklet`, `PlecoAudioWorkletProcessor`, `PlecoAudioWorkletGlobalScope`,
`PlecoAudioWorkletNode`, `PlecoAudioParamMap`, `PlecoErrorEvent`); 4 media nodes +
4 adapter shims; `PlecoNullSink`/`PlecoMockSink`; `RENDER_QUANTUM`.

## Phase 2 — Demo catalogue (~20 capabilities)

Each capability gets a **node `.mjs`** (offline render, sample-exact assertions —
the strongest proof tier in the library, unique to this headless engine) and, where
audible/interactive value exists, a **web `.html`** (plays through a live sink AND
A/Bs against native Web Audio with a parity badge). New gallery section:
**"Web Audio engine."**

| # | Capability | Node proof (sample-exact) | Web (audible + native A/B) |
|---|---|---|---|
| 1 | Oscillator + PeriodicWave | 4 waveforms + custom wave; peak-bin + band-limit | spectrum + A/B (honest: UA band-limit differs) |
| 2 | AudioBufferSource | loop/loopStart/loopEnd exact repeat | varispeed player |
| 3 | ConstantSource | DC offset drives a param | control-signal demo |
| 4 | Gain automation | setValueAtTime/linear/exp/setTarget curves exact | fade console |
| 5 | Delay + cycle rule | feedback echo decays 0.5^(n-1) @128-frame | echo pedal |
| 6 | BiquadFilter (8 types) | getFrequencyResponse per type | sweep + A/B |
| 7 | IIRFilter | coefficients → response | — |
| 8 | WaveShaper | curve + oversample exact | distortion + A/B |
| 9 | DynamicsCompressor | reduction on a loud signal | comp meter (honest: UA curve differs) |
| 10 | StereoPanner | pan law L↔R exact | pan sweep + A/B |
| 11 | Panner + Listener | distance/cone gains | 3D mover |
| 12 | Channel splitter/merger | L/R swap, mid/side exact | routing demo |
| 13 | Analyser | FFT bins vs known tone | live spectrum |
| 14 | Convolver | IR convolution exact | reverb + A/B |
| 15 | AudioWorklet | custom processor (ring-mod/bitcrush) exact | live worklet + port |
| 16 | Offline render | build graph → render → assert samples | (node-native story) |
| 17 | Live context | resume/suspend/state + sink | (web-native story) |
| 18 | Media adapters | MediaStream feed → graph | mic/element into pleco |
| 19 | Echoplex looper (flagship) | feedback+overdub+varispeed compose | interactive looper |
| 20 | Coming-from-Web-Audio A/B | same graph pleco vs native, identical | side-by-side |

## Sequencing — docs-led, demo-anchored

The existing guides cite demos as proof (`Proof: examples/node/x.mjs`). To avoid
citing vapor, build a **thin node proof per node alongside its guide** in Phase 1,
then Phase 2 elaborates those into full interactive web demos + gallery cards. So
Phase 1 ships guides + ~18 node proofs; Phase 2 ships ~16 web demos + cards + the 2
integration showcases.

## Verification / correctness guards

- **FM1 doc drift** — guides teach & link, never re-list signatures.
- **FM2 demo explosion** — per-node granularity (Q2), not per-member.
- **FM3 parity-badge fragility** — "sample-identical" only where proven bit-exact;
  honest "spec-faithful, UA-curve differs" for oscillator band-limit vs Chrome and
  the compressor curve (matches the caveat-sweep decisions).
- **FM4 scope** — phased; demo fan-out is a Workflow candidate (Q4, opt-in).

## Out of scope

Shipping decisions (merge/version/publish/un-gitignore parity docs) remain
Cameron's outward calls. This design covers docs + demos only.
