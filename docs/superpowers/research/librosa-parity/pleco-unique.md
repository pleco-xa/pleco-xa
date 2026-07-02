# Pleco-XA vs librosa — Domain: pleco-unique

**Scope:** Modules with no librosa counterpart — the loop-detection family (`xa-loop`, `xa-loop-detection`, `xa-precise-loop`, `loop-analyzer`, `loop-controller`), `live-peak-extractor`, `dynamic-zero-crossing`, `quantum-sequencer`, `algorithmic-sequences`, `DopplerScroll`, `WaveformEditor`, `SpectrumAnalyzer`, `keyboard-controller`, and the `src/core` playground family (`beatGlitcher`, `GibClock`, `loopPlayground`, `vector-rhythm`, `demoSequences`, plus `loopHelpers`).

**Method:** Every file above was read in full from `/Users/cameronbrooks/Developer/pleco-xa`. Uniqueness was checked against the librosa source at `/Users/cameronbrooks/Developer/librosa` (grep for loop APIs in `segment.py`/`beat.py`, read of `core/audio.py:zero_crossings`, confirmed `display.py:specshow`/`waveshow`). Consumers of every module were mapped via grep across `src/`, `tests/`, `scripts/`, and `.astro` components.

---

## 1. Uniqueness verification against librosa

| Claimed-unique pleco capability | Closest librosa function | Verdict |
|---|---|---|
| Loop-point detection (all 5 modules) | *(none)* — `librosa.segment` has recurrence/similarity matrices and `agglomerative` segmentation, but **no function returns loop boundaries**. Grep of `segment.py` and `beat.py` for loop APIs returned nothing. | **Genuinely unique.** Loop detection is pleco's headline feature with zero librosa equivalent. |
| `DynamicZeroCrossing` boundary snapping | `librosa.zero_crossings` (`core/audio.py:1174`) returns a **boolean indicator array**; it does not snap boundaries, rank crossings by amplitude proximity, or produce crossfade specs. | **Unique operation** built on a shared primitive. (The indicator-array port itself lives in `xa-audioio.js` — other domain.) |
| `SpectrumAnalyzer` real-time render | `librosa.display.specshow` (matplotlib, offline) | Different medium; librosa has no real-time/AnalyserNode path. `createSpectrogram` is a loose offline analog — **partial**. |
| `WaveformEditor` interactive canvas | `librosa.display.waveshow` (matplotlib, non-interactive) | Loose analog; drag-to-edit loop markers are unique — **partial/extra**. |
| Live peak/RMS metering (`LivePeakExtractor`) | *(none)* — librosa is offline-only | Unique in kind, but trivially thin over Web Audio `AnalyserNode`. |
| Generative loop-mutation sequencers (playground family, quantum, algorithmic) | *(none)* — closest conceptual neighbor is `librosa.effects.remix` (interval reordering), which is a different operation | Unique. This is a **creative instrument**, not analysis. |
| `DopplerScroll`, `keyboard-controller`, `GibClock` | *(none)* | Unique but not analysis — playback/UI infrastructure. |

**Bottom line:** everything in this domain is verified pleco-unique (status `extra`), with `SpectrumAnalyzer.createSpectrogram` and `WaveformEditor` as loose *visualization analogs* of `specshow`/`waveshow`.

---

## 2. Module-by-module: library material vs demo code

### 2.1 Loop-detection family — LIBRARY (after consolidation)

The repo currently has **five** loop-detection entry points. Consumer map:

| Module | Consumers | Verdict |
|---|---|---|
| `src/scripts/xa-loop.js` (`fastLoopAnalysis`) | `AudioAnalyzer.astro`, `LoopDebugButton.astro`, `PlecoAnalyzer.astro`, `audio-analysis.js`, `workers/analysisWorker.js`, `sync-public-deps.js` | **Canonical pipeline. SHIP.** Widest consumption in the repo. |
| `src/scripts/xa-precise-loop.js` (`findPreciseLoop`) | `xa-loop.js`, `LoopDebugButton.astro`, `audio-analysis.js` | **The crown jewel. SHIP** as internal of xa-loop. Onset-pair candidates scored with true normalized cross-correlation (mean-subtracted, std-normalized — `normalizedCrossCorrelation`, lines 137–169), fade-characteristic penalty, and musical-length bonus. This is real, defensible DSP. O(onsets²)·O(n) correlation cost needs bounding for dense material. |
| `src/scripts/loop-analyzer.js` | `xa-loop.js` header claims to replace it; still used by `tests/loop-analysis.test.js`, `tests/xa-loop-analysis.test.js` | **FOLD/DEPRECATE.** `musicalLoopAnalysis` (bar-length candidates via windowed adjacent-segment correlation) has real content worth folding into xa-loop as a fallback strategy. `loopAnalysis`/`xaLoopAnalysis` have a verified unit bug (below). |
| `src/scripts/xa-loop-detection.js` (`findLoop`) | `AudioAnalyzer.astro`, `sync-public-deps.js` | **DELETE after migration.** Energy-change heuristic + hardcoded `confidence: 0.85`; pasted-in code style (semicolons), `async` with no `await`. Its only unique piece — forward zero-crossing snap — is subsumed by `DynamicZeroCrossing.snap`. Migrate the Astro call site to `fastLoopAnalysis`. |
| `src/scripts/loop-controller.js` (`LoopController`) | npm barrels (`src/index.js`, `src/scripts/index.js`), `pleco-xa.js` | **SHIP.** Clean, pure-state, environment-agnostic, result-object API. Missing `doubleLoop` even though half/double are paired everywhere else (verified: only `halfLoop`, `moveLoopForward`, `resetLoop`, `setLoop`, `getCurrentLoop` exist). |

**Verified defects in this family (read from source, line-accurate):**

- `loop-analyzer.js:287–288` — `xaLoopAnalysis` computes `confidence = loopPoints.confidence * (1 - Math.abs(rms - (-20)))` treating `computeRMS` output as dBFS. `computeRMS` (audio-utils) returns **linear** RMS (~0.05–0.3), so the factor is ≈ `1 - 20.1 = -19.1` → confidence is a large negative number. `loopAnalysis:52` uses the linear convention (`1 - |rms - 0.1|`) — the two functions in the same file disagree about the unit of the same input.
- `xa-loop.js` — ~420 of 652 lines are commented-out dead code (`findDownbeats`, `findLoopCandidates`, `analyzeMusicalStructure`, `selectBestLoop`, `snapToNearestBeat`). Worse: live function `analyzeLoopCandidate` (line 438) calls `analyzeMusicalStructure` (line 484) which is **commented out** (lines 545–569) → guaranteed `ReferenceError` if ever invoked. `crossCorrelation`, `findMainSection`, `smoothArray` are live-defined but unused. `console.time` in production path (line 18).
- `xa-loop.js:75–78` — confidence normalization is `Math.abs(score) * 1000` clamped to [0,1]; but the precise-loop path feeds a *normalized* correlation (already ~0–1), so precise-path confidence saturates to 1.0 for any correlation > 0.001. The magic ×1000 only makes sense for the unnormalized bar-aligned fallback. Two score conventions funneled through one normalizer.
- `xa-precise-loop.js:344` — `findNextStrongAttack` tests `energy > maxEnergy * 1.5` starting from `maxEnergy = 0`, so the first nonzero window always wins and then becomes the baseline; the "attack" found is often just the first window with any energy.
- `xa-loop-detection.js:148,153,158` — lexical declarations inside `switch` cases without braces (lint hazard); `manipulateLoop` duplicates `LoopController` math with no min-duration guard.

### 2.2 `dynamic-zero-crossing.js` — LIBRARY. SHIP.

Genuinely useful loop-support primitive with no librosa equivalent: snaps boundaries to the *lowest-amplitude* crossing in a ±window (`findNearestZeroCrossing` ranks by `min(|y[i]|, |y[i+1]|)`), reports when the snap exceeds 10 samples so callers can crossfade, and generates cosine micro-fade curves. Consumed by `loop-smart.js` (correctly, via `snap()`) and `audio-analysis.js` (**incorrectly** — verified `audio-analysis.js:1014–1027` does `new DynamicZeroCrossing(channel, sr)` then `dzc.findOptimalCrossing(...)`: the class is all-static, has no constructor state and no `findOptimalCrossing` method → `TypeError` at runtime, presumably swallowed by the surrounding try/catch). Minor: `generateMicroCrossfade` doc lists an `audioData` param the signature doesn't take (line 106 vs 110).

**Recommendation:** rename into the `xa-` namespace (e.g. `xa-zero-crossing.js`), export from the npm barrel, and either add the instance API `audio-analysis.js` expects or fix that caller.

### 2.3 `live-peak-extractor.js` — DELETE (or fold into UI package)

**Zero consumers anywhere in the repo** (verified grep). 77 lines that thinly wrap `AnalyserNode` + rAF. Verified bug at line 26: `this.analyser.connect(this.audioContext.destination)` — an analyser needs **no** destination connection to produce data, so attaching the meter re-routes audio to the speakers and double-plays any source already connected elsewhere. `timeDataArray`/`freqDataArray` are implicit fields assigned outside the constructor. Not library material; if live metering is wanted, it belongs beside the SpectrumAnalyzer in a UI/visualization package.

### 2.4 `SpectrumAnalyzer.js` — DEMO/UI package. Fix before shipping anywhere.

Three exports, three different fates:

- `RealtimeSpectrumAnalyzer` — legitimate, framework-agnostic canvas visualizer around `AnalyserNode`. Reasonable UI-package material. Verified geometry bug: `renderBars` (line 184) computes `barWidth` from linear layout but positions bars via `getLogPosition` when `logScale: true` (default), producing overlap/gaps.
- `renderStaticSpectrum` — **broken twice, verified.** (a) Line 445–449 constructs `RealtimeSpectrumAnalyzer(canvas, { sampleRate }, opts)`; the constructor immediately calls `audioContext.createAnalyser()` (line 65) → `TypeError` on the fake context, so the function cannot complete as written. (b) Even if it could, `getByteFrequencyData` after `OfflineAudioContext.startRendering()` reflects only the final analysis block, not a whole-buffer spectrum. Also `timeData` (line 430) is dead.
- `createSpectrogram` — works but computes a naive per-bin DFT (lines 539–551): O(n_fft²) per frame ≈ 4M mults per 2048-pt frame, while `xa-fft.js` sits unused; Hann window reimplemented inline.

**Triplication:** byte-identical copies at `src/scripts/`, `scripts/`, and `public/scripts/` (per git status), and `scripts/sync-public-deps.js` does not manage it — the copies will drift silently. Exported from **both** npm barrels (`src/index.js`, `src/scripts/index.js`) and used by demo pages (`spectrogram-test.astro`, `vocal-separation.astro`).

**Verdict:** visualization, not analysis. Move to a UI subpackage, keep one copy, delete or rewrite `renderStaticSpectrum` (correct approach: STFT-average via `xa-fft.stft`), and back `createSpectrogram` with `xa-fft`.

### 2.5 `WaveformEditor.js` — DEMO/UI package.

Compact interactive loop-region editor (drag markers, click-to-set, `loopChange` CustomEvent). Only consumer is `WaveformEditor.astro`. Loose `waveshow` analog but interactive — fine as demo/UI code, not core library. Verified issues: `draw()` (lines 92–98) does `Math.min(...slice)/Math.max(...slice)` per pixel column — spread over `step`-sized slices; for long files at narrow canvases `step` can reach 10⁵–10⁶ elements → stack-overflow risk (sibling `WaveformRenderer.js` does this correctly with loops). No `mouseleave` handler (drag sticks if mouseup happens off-canvas), no touch events, no listener cleanup. Fourth overlapping waveform renderer in the repo.

### 2.6 `keyboard-controller.js` — DEMO app. MOVE.

Pure performance-instrument UI: `document` listeners, hardcoded checkbox ID, `window.currentAudioBuffer`/`window.applyLoop`/`window.phaserParams` conventions, toast UX. Consumed only by `AudioAnalyzer.astro` (+ synced to `public/`). Verified logic bug: `handleKeyDown` adds `'m'` to `keysPressed` (line 103) *before* dispatching `toggleBeat` (line 111), so the sustain-mode branch `if (this.keysPressed.has('m')) startBeat()` (line 255) is always true on keydown — and `handleKeyUp`'s sustain branch (line 127) only handles `['phase','fractal','silence','stutter']`, never `beatToggle`, so **sustain-mode beat release can never stop the beat**. Also: imports `applyQuantumOp` from `../lib/effects/xa-fx.js` while sibling `audio-ops-extended.js` exports a competing `applyQuantumOp` (two implementations, two trees); undo stack clones up to 20 full AudioBuffers; preset display names hardcoded in **two** methods (lines 245, 283) that must stay hand-synchronized with `beat-presets.js` ordering.

### 2.7 `DopplerScroll.js` — DELETE (or demo-experiments folder).

**Zero consumers** (verified grep). Verified from source: despite the name there is **no Doppler effect** — no `playbackRate`/`detune` manipulation anywhere; the two `createStereoPanner()` nodes are created and wired but `.pan` is never set; `tempoData` bpm/beatGrid fields are initialized (lines 72–83) and never used. What remains is a scroll-position crossfade between two loops with a highpass/lowpass sweep — a website scroll toy, not library material. Constructor creates an `AudioContext` at construction time (autoplay-policy suspended without a gesture). Stale header path comment (`src/utils/DopplerScroll.js`).

### 2.8 Quantum/algorithmic sequencers — DEMO-adjacent creative layer; currently dead.

- `quantum-sequencer.js` — **zero consumers** (verified). Composes `vector-rhythm` + `audio-ops-extended.applyQuantumOp` + `beat-presets` into a 128-step generative performance. Note: it imports `applyQuantumOp` from `./audio-ops-extended.js` while `keyboard-controller` imports the same-named function from `../lib/effects/xa-fx.js` — the two consumers of "the" quantum op dispatcher use different implementations. `window.quantumSequenceCount` global; `setTimeout` scheduling (jitter) instead of Web Audio clock.
  - **Correction to the prior mapping pass:** the claim that the timing branches for `'stutter'/'fractal'/'silence'/'phase'` are "likely dead because the seed vocabulary is half/double/move/reverse" is **wrong**. `quantumRhythm → transformRhythm → nearestWord` snaps every op to the nearest of **all nine** `RHYTHM_VOCAB` words, and preset injections (`randomPreset()`) contain `stutter`/`silence`/etc. Those branches are live.
- `algorithmic-sequences.js` — **zero consumers** (verified). Fibonacci/prime/sine/logistic-map op-sequence generators plus a third parallel op dispatcher (`executeOperation`). Verified: `stutterLoop(loop, buffer, repeats)` never reads `buffer`; `phaseShift` modulo-wraps `startSample`/`endSample` independently (line 30–32), so a wrapped end < start loop descriptor can be produced with no downstream handling; `detectLoop`/`moveForward` imported but unused; the `'reverse'` case mutates the buffer in place while the function's shape implies immutability.
- **Verdict:** the *idea* (op-string language + generators) is genuine pleco identity, but as shipped it is unconsumed, tripled-up on dispatch, and untested. Either wire it into the demo as the performance layer or delete; do not ship in the analysis library.

### 2.9 src/core playground family — keep, but as a separate "play" entry, not mixed into the analysis surface

| Module | Verdict | Verified notes |
|---|---|---|
| `loopHelpers.js` | **SHIP** (primitives) | Clean and pure. `detectLoop` is a misleadingly named stub (returns full-buffer range) — rename to `fullBufferLoop`/`defaultLoop` or make it delegate to a real detector. `moveForward` yields negative `startSample` when `maxSamples < len`. Only `reverseBufferSection` has a direct test. |
| `GibClock.js` | **Keep in library core** | Genuinely reusable drift-compensated `setTimeout` metronome (absolute `nextTime` via `performance.now()`, corrected delay). `start(cb)` silently accumulates listeners on repeated calls with different callbacks; `glitchBurst` mutating `clock.intervalMs` mid-flight is an undocumented but load-bearing coupling (line 381 of loopPlayground). Zero tests. |
| `loopPlayground.js` | **Keep in "play" subpackage** | The main glitch engine, exported from core barrel and tested (`random-sequence.test.js`, `random-local.test.js`, `glitchBurst.test.js`). Verified: line 234 `i += Math.min(cocktailOps.length, steps - i - 1)` executes inside the lazily-invoked step closure — the `for` loop has already finished by playback time, so mutating the per-iteration `let i` binding is dead code with a misleading "Skip ahead" comment (line 112's identical statement in the `complexSequence` branch *does* run during the loop and works). `complexSequence` executes its 27 ops eagerly at build time, inconsistent with the lazy closure design. `randomLocal` is a near-verbatim duplicate of `glitchBurst`'s internal `doRandomLocal`, which is itself defined and **never called** (dead). `glitchBurst`'s `ctx` option unused. The op-dispatch switch appears **five times** in this one file. |
| `beatGlitcher.js` | **Keep in "play"** | Tiny bar-synced orchestrator; tested. Verified: `fastBPMDetect` from `BPMDetector.ts` returns a plain number (`return Math.round(bpm*10)/10`), so the `barMs` math is correct — no bug there. The `.ts`-extension import from a `.js` module breaks plain-ESM consumption (bundler-only). `maxOpsPerBar=1` is not actually a bound because step closures can trigger cocktail bursts. |
| `vector-rhythm.js` | **Keep in "play", fix seeding** | Verified: LCG PRNG seeded with `Date.now().toString()` — note `seedrandom(seed)` does `state = seed ? seed : ...` with a **string** seed, so `(a * state + c) % m` coerces via `NaN`… actually `1103515245 * "1719..."` → number coercion succeeds (string numeric), so it works, but only by accident of numeric strings. Non-reproducible across loads; no seed injection; untestable. Vocab includes 5 ops the core helpers don't implement (they exist only in `audio-ops-extended`/`xa-fx`). Not exported from `core/index.js` (reachable only by deep path). |
| `demoSequences.js` | **Demo app** | Scripted choreography. Verified: `moveForward` imported and never used; the identical inline move-forward block is copy-pasted 4× (lines 32–39, 42–49, 60–67); it's exactly what `moveForward(loop, len, buffer.length)` does minus the clamp asymmetry. Pure demo content — belongs with the demo. |

---

## 3. Function-level parity table

Status semantics per instructions: `extra` = pleco functionality with no librosa counterpart (librosaFn = pleco export); `partial` = loose librosa analog exists but diverges.

| # | Pleco export(s) | File | Closest librosa | Status | Notes |
|---|---|---|---|---|---|
| 1 | `fastLoopAnalysis` | src/scripts/xa-loop.js | *(none — librosa has no loop detection)* | extra | Canonical pipeline; ship after purging ~420 commented lines + dead `analyzeLoopCandidate` (ReferenceError trap) |
| 2 | `findPreciseLoop` | src/scripts/xa-precise-loop.js | *(none)* | extra | Best algorithm in the family (true normalized xcorr + fade check + musical bonus); O(onsets²) cost |
| 3 | `findLoop`, `manipulateLoop` | src/scripts/xa-loop-detection.js | *(none)* | extra | 4th duplicate, hardcoded confidence; delete after migrating AudioAnalyzer.astro |
| 4 | `loopAnalysis`, `musicalLoopAnalysis`, `fastOnsetLoopAnalysis`, `analyzeLoopPoints`, `xaLoopAnalysis` | src/scripts/loop-analyzer.js | *(none)* | extra | xaLoopAnalysis confidence unit bug (linear RMS treated as dBFS → negative); fold musicalLoopAnalysis into xa-loop, deprecate rest |
| 5 | `LoopController` | src/scripts/loop-controller.js | *(none)* | extra | Ship; add missing `doubleLoop` for half/double symmetry |
| 6 | `DynamicZeroCrossing` | src/scripts/dynamic-zero-crossing.js | `librosa.zero_crossings` (different op — indicator array vs boundary snap) | extra | Ship as xa- primitive; fix audio-analysis.js phantom `findOptimalCrossing` caller (TypeError) |
| 7 | `LivePeakExtractor` | src/scripts/live-peak-extractor.js | *(none — librosa is offline)* | extra | Zero consumers; analyser→destination double-routing bug; delete or fold into UI pkg |
| 8 | `RealtimeSpectrumAnalyzer` | src/scripts/SpectrumAnalyzer.js | *(none — real-time)* | extra | UI package; logScale bar-width geometry bug |
| 9 | `createSpectrogram` | src/scripts/SpectrumAnalyzer.js | `librosa.display.specshow` + `librosa.stft` | partial | Works but naive O(N²) DFT instead of xa-fft; colormap only, no axes; file triplicated |
| 10 | `renderStaticSpectrum` | src/scripts/SpectrumAnalyzer.js | `librosa.display.specshow` (one-shot) | partial | Broken: fake-context TypeError + final-block-only OfflineAudioContext read; rewrite on xa-fft stft or delete |
| 11 | `WaveformEditor` | src/scripts/WaveformEditor.js | `librosa.display.waveshow` | partial | Interactive canvas editor (waveshow is static matplotlib); spread-over-slice stack risk; demo/UI pkg |
| 12 | `initKeyboardController` | src/scripts/keyboard-controller.js | *(none)* | extra | Pure demo UI; sustain-mode beat-stop bug; duplicate applyQuantumOp source trees |
| 13 | `DopplerScroll` | src/scripts/DopplerScroll.js | *(none)* | extra | Zero consumers; no actual Doppler (no playbackRate/detune); panners never panned; delete |
| 14 | `buildQuantumOpList`, `buildQuantumSequence`, `playQuantumOps` | src/scripts/quantum-sequencer.js | *(none)* | extra | Zero consumers; window-global state; setTimeout scheduling. Prior-pass "dead timing branches" claim disproven — branches are reachable |
| 15 | `stutterLoop`, `fractalSlice`, `phaseShift`, `generateFibonacci`, `generatePrimeRhythm`, `generateWaveform`, `generateChaotic`, `executeOperation` | src/scripts/algorithmic-sequences.js | *(loosely `librosa.effects.remix` in spirit; different op)* | extra | Zero consumers; 3rd parallel op dispatcher; phaseShift wrap can invert loop bounds |
| 16 | `startBeatGlitch` | src/core/beatGlitcher.js | *(none)* | extra | Keep in play pkg; .ts-extension import is bundler-only; maxOpsPerBar not a real bound |
| 17 | `GibClock` | src/core/GibClock.js | *(none)* | extra | Reusable drift-compensated clock; keep; document intervalMs mutation contract; zero tests |
| 18 | `randomSequence`, `randomLocal`, `glitchBurst` | src/core/loopPlayground.js | *(none)* | extra | Play pkg; op-switch duplicated 5×; dead `i +=` in closure (line 234); dead `doRandomLocal`; eager `complexSequence` |
| 19 | `RHYTHM_VOCAB`, `vectorMap`, `transformRhythm`, `quantumRhythm` | src/core/vector-rhythm.js | *(none)* | extra | Date.now() seed → non-reproducible/untestable; not exported from core barrel; 5/9 vocab ops unimplemented by core helpers |
| 20 | `signatureDemo` | src/core/demoSequences.js | *(none)* | extra | Demo choreography; move-forward block copy-pasted 4×; unused `moveForward` import; belongs in demo app |
| 21 | `detectLoop`, `halfLoop`, `doubleLoop`, `moveForward`, `resetLoop`, `reverseBufferSection` | src/core/loopHelpers.js | *(none)* | extra | Ship as primitives; `detectLoop` is a misnamed stub; `moveForward` negative-start edge; only reverseBufferSection tested |

---

## 4. Consolidation plan (recommended package shape)

```
pleco-xa            (analysis library — the librosa-parity + loop-detection surface)
  ├─ xa-loop        fastLoopAnalysis (public), findPreciseLoop + findMusicalLoop (internal)
  ├─ xa-zero-crossing   DynamicZeroCrossing (renamed)
  ├─ LoopController, loopHelpers (with unified applyLoopOp dispatcher)
  └─ GibClock       (timing utility)

pleco-xa/play       (creative/generative instrument layer)
  └─ loopPlayground, beatGlitcher, vector-rhythm (seedable), quantum-sequencer,
     algorithmic-sequences, beat-presets

demo app (Astro site only — not npm)
  └─ keyboard-controller, WaveformEditor, SpectrumAnalyzer renderers,
     demoSequences, DopplerScroll (or delete), audio-analysis.js
```

Delete outright: `xa-loop-detection.js` (after Astro migration), `live-peak-extractor.js`, `DopplerScroll.js` (both zero-consumer), the `scripts/` and `public/scripts/` SpectrumAnalyzer duplicates.

---

## 5. Key verified findings (newly confirmed or corrected in this pass)

1. **CONFIRMED** `audio-analysis.js:1014` — `new DynamicZeroCrossing(channel, sr)` + `dzc.findOptimalCrossing(...)` against an all-static class with no such method → TypeError at runtime.
2. **CONFIRMED** `SpectrumAnalyzer.renderStaticSpectrum` — fake `{ sampleRate }` context passed to a constructor that calls `createAnalyser()` → TypeError; plus final-block-only OfflineAudioContext analyser read.
3. **CONFIRMED** `loop-analyzer.js:287` — dBFS/linear RMS unit clash makes `xaLoopAnalysis` confidence negative.
4. **CONFIRMED** `xa-loop.js` — live `analyzeLoopCandidate` calls commented-out `analyzeMusicalStructure` (ReferenceError trap); ~420 lines commented dead code.
5. **CONFIRMED** `keyboard-controller.js` — sustain-mode beat can be started but never stopped via keyup (control keys absent from keyup handling; keydown pre-populates `keysPressed`).
6. **CONFIRMED** `live-peak-extractor.js:26` — analyser needlessly connected to destination (double-audio hazard); zero consumers.
7. **CONFIRMED** `DopplerScroll.js` — no Doppler implementation, panners never panned, tempoData unused, zero consumers.
8. **CONFIRMED** `loopPlayground.js:234` — `i +=` inside lazily-executed closure is dead (for-loop already complete at playback); the line-112 twin in the eager branch works.
9. **CORRECTED (prior pass wrong):** `quantum-sequencer.js` timing branches for `stutter/fractal/silence/phase` are **reachable** — `quantumRhythm` snaps to all 9 `RHYTHM_VOCAB` words and preset injections include those ops.
10. **CLEARED (no bug):** `beatGlitcher.js` — `fastBPMDetect` (BPMDetector.ts) returns a plain rounded number, so `barMs = (60/bpm)*4*1000` is correct.
11. **CONFIRMED** two different `applyQuantumOp` implementations are in active use: `keyboard-controller` imports from `src/lib/effects/xa-fx.js`, `quantum-sequencer` from `src/scripts/audio-ops-extended.js`.
12. **CONFIRMED** `xa-loop.js:75` double-normalization: precise-path scores (already 0–1 normalized correlation) get ×1000 → confidence pegs at 1.0.
