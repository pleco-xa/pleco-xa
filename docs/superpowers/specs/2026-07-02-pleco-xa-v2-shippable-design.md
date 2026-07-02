# Pleco-Xa v2 — Shippable Library Design

**Date:** 2026-07-02
**Status:** Approved (Cameron, 2026-07-02)
**Research basis:** 15-agent codebase map + 6-domain librosa parity audit — detailed reports in
`docs/superpowers/research/librosa-parity/` (core-dsp, rhythm, spectral-features, effects-decompose, structure-sequence, pleco-unique). Librosa reference clone: `~/Developer/librosa` (shallow).

---

## 1. Context & Problem

Pleco-Xa is a browser-native JS audio-analysis library (72 modules) with an Astro web demo. The audit found:

- **No working npm artifact.** Local `package.json` has no entry fields; `src/index.js` imports files that don't exist. Published `pleco-xa@1.2.1` is a 44 MB tarball shipping the entire demo site + ~30 MB duplicated audio, and crashes on import in Node (top-level `document.addEventListener`). Published 1.1.1 drags in the full Astro toolchain as dependencies. Release provenance is broken (1.2.1's gitHead is not in this repo).
- **Foundation bugs poison all DSP.** `ifft` discards imaginary components (all resynthesis corrupt); symmetric windows where librosa uses periodic (every spectrogram diverges); `xa-util` rejects `Float32Array`; dead `'./librosa-fft.js'` imports kill mel/MFCC/features at import time; `xa-spectral.js` references ~29 undefined helpers.
- **Fracture:** 4 FFT implementations, 3 WAV encoders (2 corrupt stereo), 6 tempo implementations, 7 loop detectors, 3 modules exporting colliding `beat_track`/`tempo`.
- **Fabricated results:** hardcoded `bpm:120/confidence:50` fallbacks, a `'Jazzy-Drumset'` filename hack, silence-returning `pitch_shift` placeholders, a silent dance-tempo snap list.
- **Demo consumes hand-copied duplicates** (`public/scripts/`, maintained by a stale sync whitelist) instead of the library; ~600 lines of library-grade DSP are inlined in `AudioAnalyzer.astro`; components communicate over a `window.*` global bus.
- **CI has never run the tests** (workflow runs jest; the suite is vitest). 5 of 28 tests fail on main.
- **Genuine strengths:** the lb-migrated Ellis DP BeatTracker is a faithful port; the loop-detection core (normalized cross-correlation + musical-length scoring) is real DSP verified unique vs librosa; MFCC's DCT-II, LPC/Burg, `plimit_intervals`, `spectral_flatness`, `tone`/`clicks`, `power_to_db` are faithful.

Of ~110 graded librosa functions: **10 full parity, ~74 partial, ~30 missing** — a repair-and-consolidate job on a structure that already mirrors librosa's shape.

## 2. Goals & Non-Goals

**Goals**
1. A real, working, installable npm API (`npm install pleco-xa` → it just works, Node + browser).
2. Effective librosa capability parity, machine-verified by a golden-fixture harness; deliberate exceptions documented in a public ledger.
3. Consolidated module taxonomy (72 files → 15 namespaces + `play` subpath).
4. Demo rebuilt as a true consumer of the public API — the rip mechanism structurally eliminated.
5. Docs/marketing layer treated as a first-class deliverable (the library must *get used*).

**Non-Goals (v2.0)**
- WASM/SIMD acceleration (deferred; API designed so a backend can slot in later without breaking changes).
- Full AudioWorklet real-time framework (2.1; wave-2 streaming analyzers are designed worker-safe).
- `librosa.display` equivalence via matplotlib semantics (replaced by canvas-native `display/`).
- Non-WAV codec decode in Node beyond the injectable-decoder hook.

## 3. Positioning (locked)

- **Pleco-Xa is its own library** — never marketed as "a JS librosa port." Librosa-level capability is a *discovered* fact, surfaced on a "Coming from librosa?" docs page auto-generated from parity-harness results. No "port" language anywhere public.
- Identity: full-spectrum audio analysis engine, music-first, browser-native, real-time-leaning — that *also* crushes loop detection (its verified-unique flagship).
- The Echoplex homage (PLECO XA ≈ ECHOPLEX anagram, `xa-` prefix, GibClock) is brand flavor — origin-story material, not scope.

## 4. Architecture

### 4.1 Repo shape (npm workspaces monorepo)

```
pleco-xa/
├── packages/pleco-xa/          # THE library — zero runtime dependencies
│   ├── src/{core,io,util,loop,beat,onset,feature,filters,effects,
│   │        decompose,segment,sequence,playback,display,play}/
│   ├── tests/                  # vitest unit + parity tolerance specs
│   └── package.json            # v2.0.0, exports map, types, files:[dist/], sideEffects:false
├── apps/demo/                  # Astro site; imports 'pleco-xa' like any npm consumer
├── tools/parity/               # Python fixture generator (pinned librosa) + committed fixtures/
└── package.json                # workspace root
```

### 4.2 Package contract

- `exports` map: `.` (analysis surface), `./play`, `./display`; `main`/`module` → built ESM; generated `.d.ts` (`types` field); `files: ["dist/"]`; `sideEffects: false`; `repository`/`keywords`/`homepage`/`bugs`/`engines` filled in.
- `prepublishOnly`: `build:lib && vitest run` (NOT `npm test` — watch mode).
- Publish only from tagged CI (changesets), npm provenance + 2FA.
- After 2.0 ships: `npm deprecate pleco-xa@"<2.0.0"` with a pointer message (both published versions are broken; registry damage compounds daily).

### 4.3 Universal runtime contract

- Core analysis signatures: `(y: Float32Array, sr: number)` — arrays in, arrays out; identical in Node, browser, workers; CI-testable against fixtures.
- Adapters in `io/`: `fromAudioBuffer()`, browser `load()` via `decodeAudioData`, Node `load()` with built-in pure-JS WAV decode + injectable decoder hook for other codecs.
- **No top-level `window`/`document`/`AudioContext` access anywhere in the package.** Environment-specific code is gated behind explicit init or `typeof` guards.

## 5. API Laws (locked)

1. **Arrays in, arrays out.** AudioBuffer is an adapter concern.
2. **Explicit tiers; degradation never silent; results never fabricated.** Quality is the default path. Quick/streaming variants are separately named, caller-chosen (`beat.quickTempo()`, `{tier}` options). Quality-gate failure throws a typed error with diagnostics — never returns a fake value. (Kills: `bpm:120` fallbacks, filename hacks, silent pitch-changing "time stretch," silence-returning placeholders, tempo snap lists.)
3. **Live where honest.** Streaming RMS/onset/spectral-flux analyzers (worker-safe, AudioWorklet-friendly); `quickTempo` = 5–10 s windowed lb-style live BPM; full structural analysis stays offline.
4. **Deterministic by default.** Injectable seeds/clocks (no `Date.now()` module-load seeding).
5. **One debug gate.** All logging routes through `util/debug`; zero raw console output in library code.
6. **Validate at the boundary.** Typed `PlecoError`s with codes; invalid input fails loudly at the public API.

## 6. Target Taxonomy

Namespace ← primary sources (full fold/split/kill tables: `docs/superpowers/research/librosa-parity/pleco-unique.md` + strategist output):

- **core/** ← xa-fft (single iterative interleaved FFT; fixed ifft; periodic windows; stft/istft with win_length/pad_mode) + xa-audioio (load/resample/toMono/tone/chirp/clicks/mu-law/LPC — with the chirp-phase, muExpand, and resample-quality fixes) + xa-intervals + new conversions family (frames_to_time etc., amplitude_to_db family).
- **io/** ← one merged WAV codec (from 3 encoders; interleaving fixed) + xa-file's registry/cache/load (DOM-free parts).
- **loop/ (flagship)** ← `detect()` (= fastLoopAnalysis, dead code purged, confidence conventions unified) fronting precise (NCC), musical (downbeat-aware), and recurrence strategies; primitives (zero-crossing snapping, loop ops, musical-timing scoring, LoopController + doubleLoop); DJ similarity layer; **new: ported `sequence.rqa`** upgrading detection.
- **beat/** ← BeatTracker (Ellis DP, canonical engine) + lb-migrated xa-bpm-algorithm (canonical tempo path per CLAUDE.md) + salvaged tempogram/groove; PLP hop-mismatch fixed; genre priors opt-in only. **New: `quickTempo()`** live variant.
- **onset/** ← onset_strength rebuilt on log-power mel; onset_detect; peakPick via util; **new: onset_backtrack**.
- **feature/** ← xa-mel (imports fixed, MFCC awaited/de-async'd, power_to_db, lifter fix) + xa-chroma + consolidated frame features; Slaney-default mel filterbank.
- **filters/** ← single mel + chroma filterbank construction + get_window (periodic default).
- **effects/** ← trim/split (librosa ref semantics) + remix (sort removed) + preemphasis/deemphasis (zi handling) + rewritten phase_vocoder → real time_stretch/pitch_shift + honestly-renamed resample-compress.
- **decompose/** ← one HPSS (mask-faithful, margin support, waveform wrappers) + xa-vocal-separation (pleco-unique flagship; fixed by core ifft repair) + **new: nn_filter (REPET-SIM)** as vocal-separation baseline. NMF `decompose.decompose` explicitly out of scope (exceptions ledger).
- **segment/** ← xa-temporal (shape parameters, real lag shear, working agglomerative) + xa-recurrence matrix layer (stub FFT replaced).
- **sequence/** ← xa-dtw (recorded-step backtracking) + xa-matching (Uint32Array truncation fixed).
- **playback/** ← one loop-aware player (AudioPlayer base + LoopPlayer + speed API; injected AudioContext).
- **display/** ← WaveformData + WaveformRenderer (clipRect/HiDPI fixed) + realtime SpectrumAnalyzer + createSpectrogram on core/fft. Canvas-native; replaces `librosa.display` (exceptions ledger).
- **util/** ← xa-util (typed-array-safe; JSON.stringify cache deleted; tiny() fixed) + debug gate.
- **play/** (subpath `pleco-xa/play`) ← loopPlayground + beatGlitcher + GibClock + vector-rhythm (injectable seed) + quantum-sequencer + algorithmic-sequences + beat-presets (reggaeton typo fixed) + one shared `applyLoopOp` dispatcher replacing 8+ duplicated switches.

**Leaves the library → `apps/demo`:** audio-analysis.js (1,671-line DOM controller), keyboard-controller, WaveformEditor widget, demoSequences, pleco-xa.js facade, ui/ glue, api/upload-audio. `src/workers/analysisWorker.js` (zero consumers) is deleted; the demo hosts its own worker built on the worker-safe core, and an official `pleco-xa/worker` entry is deferred to 2.1 with the AudioWorklet story.

**Deleted (verified dead/broken/superseded):** DopplerScroll, live-peak-extractor, xa-loop-detection, xa-bpm-detection, legacy analysis/BPMDetector.ts + LoopAnalyzer.ts, xa-spectral's unfixable bulk (salvage spectralFlatness + rms only), xa-advanced's placeholder stubs, xa-complete.js, all `public/scripts/` + root `scripts/SpectrumAnalyzer.js` hand-copies, **and `scripts/sync-public-deps.js` itself**.

## 7. Parity Harness (`tools/parity/`) — test-only, never shipped

- `generate.py` + `requirements.txt` (pinned librosa version) runs canonical librosa functions over 3 short fixture clips (click track, real music loop from `public/audio/`, noise+sweep) → compact committed fixtures.
- JS tolerance specs in `packages/pleco-xa/tests/parity/` assert pleco output within per-function tolerances (stft ~1e-5 rel; mel/mfcc looser; documented per spec).
- **A namespace wave is done only when its parity specs pass in CI.**
- Harness results auto-generate the "Coming from librosa?" capability page + parity badge (the discovered claim is machine-verified, never copy).
- `PARITY.md` exceptions ledger records deliberate divergences (display → canvas-native; codec breadth; NMF; anything consciously skipped).
- Pleco-unique APIs (loop suite) get **self-golden regression fixtures** (locked outputs) so refactors can't silently move loop points — also protects demo feel when foundation fixes shift numbers.
- npm tarball contains `dist/` + README + LICENSE only; no Python, no fixtures.

## 8. Demo & Docs

- `apps/demo` imports `'pleco-xa'` workspace-linked; CI builds it as the e2e consumer check.
- `window.*` global bus replaced by one exported session/controller object; AudioAnalyzer's inlined DSP (halfSpeedLoop, quantz variants, gap detect/close, reverse ops) hoists into the library; latent bugs fixed (BPMDetector script 404, GlitchBurstButton server/client split, GlitchPlayground frontmatter refs).
- Docs: identity-led README rewrite (current one claims v1.0.6 and imports that don't exist); TypeDoc API reference; interactive docs — every example runs in-browser on the reader's own audio; Echoplex origin story as flavor; CHANGELOG.
- **Example gallery (proof-of-work):** replicate librosa's advanced-example gallery (`~/Developer/librosa/docs/examples/` — 15 scripts: vocal separation, superflux onsets, music sync, Laplacian segmentation, HPSS, viterbi, chroma, presets, dynamic beat, PCEN streaming, rainbowgram, patch generation, spectral harmonics, display, playback) as pleco-xa interactive pages, each running live in-browser on the reader's own audio. Each replica is a discovered-parity demonstration; where pleco adds a real-time twist librosa can't (streaming PCEN, live beat), showcase it. Lands with Wave 6 docs; each earlier wave should keep its APIs example-gallery-ready.
- Marketing layer is an explicit deliverable with the same weight as DSP.

## 9. Roadmap Waves & 2.0 Cut Line

| Wave | Ships | Done-gate |
|---|---|---|
| 0 | Hygiene: commit untracked flagship files; CI jest→vitest; monorepo restructure; packaging skeleton; NOTICE/ISC librosa attribution; fix 5 failing tests or quarantine with issues | demo builds; CI actually runs tests |
| 1 | Bedrock: unified FFT (ifft fixed) + periodic windows + stft/istft + typed-array-safe util + io/WAV merge + conversions; **parity harness live** | stft/istft round-trip + core fixtures pass |
| 2 | Rhythm: beat/ + onset/ on BeatTracker + log-mel onset_strength; quickTempo + streaming RMS/flux | tempo/beat/onset fixtures |
| 3 | Loop flagship: 7 detectors → `loop.detect()`; RQA port; primitives | self-golden fixtures |
| 4 | Spectral: Slaney mel, MFCC pipeline, chroma filterbank | mel/mfcc/chroma/spectral fixtures |
| 5 | Effects/decompose + segment/sequence repairs | domain fixtures |
| 6 | playback/display/play + demo rebuild + docs site + **2.0 release** + deprecate old versions | demo e2e + full CI green |

**Cut line:** 2.0 requires core/rhythm/loop/spectral verified. effects/segment/sequence may ship flagged `experimental` if lagging. Streaming analyzers are worker-safe from birth; full AudioWorklet story is 2.1; WASM deferred with a no-regrets API note.

## 10. Testing, CI, Release

- CI matrix: `vitest run` (Node) · real-browser lane (jsdom has no Web Audio — required for AudioBuffer paths) · Node import-smoke of built `dist/` (catches top-level-DOM crashes) · demo `astro build` · size-limit bundle budget · benchmark baseline (×-realtime for `loop.detect`/`beat.tempo` on fixed fixtures, regression-gated).
- Release: changesets; tags; CHANGELOG; publish from CI only; npm provenance + 2FA.
- Licensing: MIT retained; NOTICE section attributing librosa (ISC) for ported algorithms; lb/ and LibrosaDemo-PR1 provenance resolved during Wave 0 hygiene.

## 11. Risks (from the completeness critic)

1. Registry damage compounds until deprecation — most time-sensitive item.
2. Expanding exports before the harness exists freezes buggy semantics into the contract (several current modules are dead on import — naive barrel expansion ships ReferenceErrors).
3. Foundation fixes change every downstream number — demo UX was tuned against wrong values; self-golden fixtures + demo e2e land *before* the demo refactor.
4. jsdom-green ≠ working Web Audio; the browser CI lane is non-negotiable.
5. Scope explosion: 100+ audited defects; the cut line exists so 2.0 ships.

## 12. Collaborator Additions (beyond librosa, folded into waves)

Streaming/real-time analyzers (W2) · `quickTempo` (W2) · `onset_backtrack` (W2) · RQA port (W3) · `nn_filter`/REPET-SIM baseline (W5) · `griffinlim` (~30 lines post-ifft-fix, W1/W4) · interactive in-browser docs (W6) · machine-verified parity badge (W1+) · WASM FFT backend (post-2.0).
