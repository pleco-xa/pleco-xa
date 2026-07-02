# Pleco-XA vs Librosa Parity Report — Domain: Rhythm

**Scope:** beat tracking, tempo/BPM estimation, onset detection, downbeat detection.
**Librosa sources read:** `librosa/beat.py` (699 loc), `librosa/onset.py` (641 loc), `librosa/feature/rhythm.py` (655 loc).
**Pleco sources read (full):** `src/scripts/xa-onset.js`, `xa-beat.js`, `xa-beat-tracker.js`, `xa-tempo.js`, `xa-rhythm.js`, `xa-downbeat.js`, `xa-bpm-algorithm.js`, `xa-bpm-detection.js`, `kick-snare-detector.js`, `musical-timing.js`, `beat-presets.js`, `analysis/BPMDetector.ts`.

---

## 1. Executive summary

Pleco-xa covers the *shape* of librosa's rhythm stack — onset strength → tempo estimation → DP beat tracking → (Fourier) tempogram → PLP — but no single pleco module is numerically faithful, and the surface is fractured across **at least six competing tempo/BPM implementations** and **three modules that all export `beat_track` and `tempo`** with incompatible signatures.

The single most consequential fidelity gap is upstream of everything: **every pleco onset-strength implementation computes rectified spectral flux on a linear-magnitude STFT**, while librosa computes flux on a **log-power mel spectrogram** (`power_to_db(melspectrogram)`), with optional local-max reference (superflux), lag control, and center compensation. Since `beat_track`, `tempo`, `tempogram`, and `plp` all consume this envelope, every downstream number in pleco diverges from librosa even where the downstream algorithm is a faithful port.

Two confirmed hard bugs in this domain:

1. **`xa-tempo.js:332` — `dp_beat_track` backtracking is dead.** `backlink.indexOf(Math.max(...cumulative_score))` searches for the max *cumulative score* (a float) inside the *backlink* Int32Array (frame indices). A non-integer float can never match an Int32Array entry, so `indexOf` returns `-1`, the `while (current >= 0)` loop never runs, and `dp_beat_track` returns an **empty beats array essentially always**. `xa-tempo.beat_track()` is functionally dead.
2. **`xa-beat-tracker.js` PLP hop mismatch.** `fourierTempogram()` frames the onset envelope with `hopFrames = winLength/4` (line 451), but `plp()` inverts it with `this._istft(ftgram, 1, ...)` (line 311) — hop 1, exactly as librosa does *for a hop-1 tempogram*. The analysis/synthesis hops disagree by 96×, so the pulse curve's time base is wrong and the output cannot align with the onset envelope.

### The legacy-vs-migrated duplication (explicit flag)

Per project `CLAUDE.md`: *"dont use bpm_detector.js because we have librose-tempo now."* The repo currently ships BOTH generations, and the wiring is backwards:

| Path | Generation | Status |
|---|---|---|
| `src/scripts/analysis/BPMDetector.ts` (`detectBPM`, `fastBPMDetect`, `BPMDetector` class) | **Legacy** (energy-diff onsets, raw autocorr argmax) | **Exported from the npm entry barrel `src/scripts/index.js` line 8** — this is the *public* BPM API today |
| `src/scripts/xa-bpm-detection.js` (`detectBPM`) | **Legacy demo-grade** (first-10s energy peaks, hardcoded 120 BPM for filenames containing `"Jazzy-Drumset"`, fabricated 0.5/0.7/0.8 confidences) | Imported by `audio-analysis.js` demo |
| `src/scripts/xa-beat.js` (`fastBPMDetect`) | Mid-generation | Used by `loop-analyzer.js`, `core/beatGlitcher.js` |
| `src/scripts/xa-bpm-algorithm.js` (`analyzeWithProgress` — **the migrated lb/librosa-style path**, commit 05836a4) | **New / canonical per CLAUDE.md** | **Not exported from any barrel**; only reachable by direct path import; `audio-analysis.js` re-inlines a copy of it instead of importing it |
| `src/scripts/xa-tempo.js` (`tempo`) | librosa-styled | Used by `dj-loop-analyzer.js` |
| `src/scripts/xa-beat-tracker.js` (`BeatTracker`) | librosa-styled (closest DP port) | Not exported from either barrel |

So the declared-canonical migrated algorithm is unreachable from the package entry, while the legacy detector the CLAUDE.md deprecates is the one publicly exported. `audio-analysis.js` additionally contains a third, *inlined* copy of the lb pipeline (~spectral-flux + autocorr + Fourier tempogram + windowed stability), duplicating `xa-bpm-algorithm.js` line-for-line in spirit.

---

## 2. Function-by-function parity table

### 2.1 `librosa.beat`

| librosa | pleco equivalent(s) | status | fidelity notes |
|---|---|---|---|
| `beat.beat_track` | `xa-beat-tracker.js` `BeatTracker.beatTrack` / `beat_track` (best); `xa-beat.js` `beatTrack`/`beat_track`; `xa-tempo.js` `beat_track` | **partial** | See §3.1. BeatTracker mirrors the Ellis DP structure closely; xa-beat is a grid-snap, not DP; xa-tempo's is dead (bug #1). |
| `beat.plp` | `xa-beat-tracker.js` `BeatTracker.plp`; `xa-rhythm.js` `predominantLocalPulse` | **partial** | BeatTracker.plp is structurally librosa-shaped but broken by the hop mismatch (bug #2). `predominantLocalPulse` *claims* to be a plp port but is a phase histogram — a completely different (and simpler) algorithm. |
| `beat.tempo` | — | (deprecated alias) | Canonical home is `feature.tempo`; see below. |

### 2.2 `librosa.feature` (rhythm)

| librosa | pleco equivalent(s) | status | fidelity notes |
|---|---|---|---|
| `feature.tempo` | `xa-tempo.js` `tempo` (+ `quick_tempo`); competing: `xa-beat.js` `estimateTempo`/`tempo`, `xa-beat-tracker.js` `tempoEstimation`/`tempo`, `xa-bpm-algorithm.js` `estimateGlobalTempo`, `BPMDetector.ts`, `xa-bpm-detection.js` | **partial** | See §3.2. None uses librosa's localized tempogram + log-normal prior + `tempo_frequencies` argmax. |
| `feature.tempogram` | `xa-tempo.js` `compute_tempogram` | **partial** | Pleco computes a **1-D global autocorrelation** over lags (`corr/count` per lag). Librosa's tempogram is **2-D and localized**: frame the envelope (`win_length=384`, hop=1, centered with linear-ramp padding), window (hann), autocorrelate per frame, normalize (`norm=inf`). Pleco's is closer to `librosa.autocorrelate(oenv)` than to `feature.tempogram`. No window, no center, no norm, no time axis. |
| `feature.fourier_tempogram` | `xa-beat-tracker.js` `fourierTempogram`; `xa-bpm-algorithm.js` `computeFourierTempogram` | **partial** | Librosa: `stft(onset_envelope, n_fft=win_length, hop_length=1, center=True)` — complex output, hop **1**. Pleco BeatTracker: hop = `win/4`; lb version: `win=384`, hop=96, and stores **magnitudes only** (`computeSimpleFFT` returns `sqrt(re²+im²)`) via O(N²) DFT — phase is discarded, so it could never drive a PLP inversion. Neither is center-padded. |
| `feature.tempogram_ratio` | — | **missing** | No pleco equivalent (metrical-multiple energy summary / Peeters spectral rhythm patterns). |

### 2.3 `librosa.onset`

| librosa | pleco equivalent(s) | status | fidelity notes |
|---|---|---|---|
| `onset.onset_strength` | `xa-onset.js` `onset_strength` / `computeSpectralFlux`; also reimplemented in `xa-beat-tracker.js` `onsetStrength`, `xa-bpm-algorithm.js` `computeOnsetStrength`, `BPMDetector.ts` `calculateOnsetStrength`, `audio-analysis.js` (inline), `loop-smart.js` (inline RMS-diff) | **partial** | See §3.3. Linear-magnitude flux vs librosa's log-power mel flux; no `lag`, `max_size` (superflux ref), `aggregate`, `detrend`, `center` shift, or `ref`. Six parallel implementations. |
| `onset.onset_detect` | `xa-onset.js` `onsetDetect` | **partial** | See §3.4. Peak picking uses a *global* mean+delta threshold instead of librosa's local adaptive `peak_pick`; `wait=20` frames (~464 ms at sr=22050/hop=512) vs librosa's ~1 frame (30 ms); no [0,1] normalization; no `backtrack`, `units`, `sparse`, `energy`. |
| `onset.onset_strength_multi` | `xa-rhythm.js` `onsetStrengthMulti` | **partial** | Ironically the **only** pleco onset implementation that uses a mel filterbank (128 mels, triangular filters) — but it then **aggregates all bands into a single envelope**, so it implements neither librosa's `channels` semantics (per-band envelopes) nor the log compression (`power_to_db`). No `lag`/`max_size`/`center`. Misnamed relative to librosa: it is closer to (an un-logged) `onset_strength` than to `onset_strength_multi`. |
| `onset.onset_backtrack` | — | **missing** | No pleco equivalent (roll detections back to preceding energy minimum — 12 lines in librosa, high value for pleco's loop-slicing use case). `kick-snare-detector.js` does the *opposite* (shifts the point **forward** +20 ms onto the transient peak). |

### 2.4 Pleco extras with no librosa counterpart (`status: extra`)

| pleco export(s) | file | notes |
|---|---|---|
| `findDownbeatPhase`, `findFirstDownbeat`, `findMusicalLoop` | `xa-downbeat.js` | Librosa has **no** downbeat tracking (that's madmom/BeatNet territory), so this is legitimately pleco-unique. Hardcoded 4/4; `Math.round(beatsSinceStart % 4)` can yield phase 4 which is silently dropped; unnormalized cross-correlation loop scoring favors loud sections. |
| `findKickSnareHit` | `kick-snare-detector.js` | Downbeat refinement heuristic. `checkFrequencySpread` returns binary 1.0/2.0 from absolute (non-adaptive) energy thresholds; requires `loop.duration` that not all callers provide. |
| `refineBeatsAndDownbeats`, `viterbiBeats` | `xa-rhythm.js` | `viterbiBeats` claims to port `librosa.sequence.viterbi` but builds a full O(frames·states²) DP table **and then ignores it** — beats are emitted purely by `frame % round(beatPeriod)` modular arithmetic (confirmed lines 238-249). Expensive dead computation; fractional beat periods drift. |
| `analyze_groove`, `detect_tempo_multiples`, `apply_tempo_prior` | `xa-tempo.js` | Swing/groove metrics are a genuine pleco extra. `detect_tempo_multiples` compares ratio-space differences against `tolerance/base_tempo` (BPM-space) — ~0.025 tolerance at 120 BPM, so multiples are almost never detected. `apply_tempo_prior` is a hand-tuned dance-genre boost table, not a statistical prior. |
| `calculateBeatAlignment` | `musical-timing.js` | Loop-length-to-beat-grid scoring; clean, pure, tested. Fine as a pleco-unique utility. |
| `hipHop` … `randomPreset` | `beat-presets.js` | **Not rhythm analysis at all** — 8-step op-string patterns for the quantum sequencer. Should not be counted toward librosa parity. `regaeton` typo. |
| `detectBPM`, `fastBPMDetect`, `BPMDetector`, `detectBPMWindow`, `analyzeTempoVariations` | `analysis/BPMDetector.ts` | **Legacy** stack, still the publicly exported BPM API (npm barrel). Energy-based "onset strength" (not spectral), raw autocorr argmax, no prior. |
| `detectBPM` | `xa-bpm-detection.js` | **Legacy demo hack**: hardcoded 120 BPM for `"Jazzy-Drumset"` filenames; two conflicting octave-folding policies in one function; fabricated confidences. |
| `analyzeWithProgress`, `computeOnsetStrength`, `estimateGlobalTempo`, `computeFourierTempogram`, `estimateConstrainedTempo` | `xa-bpm-algorithm.js` | **The migrated lb path** (CLAUDE.md-canonical). Windowed `estimateConstrainedTempo` (±50 BPM around global) is a rough analog of librosa `feature.tempo(aggregate=None)`. Normalized (zero-mean, energy-normalized) autocorrelation is the best-conditioned tempo autocorr in the repo. But: O(N²) decimated DFTs, `setTimeout` yielding in hot loops, magnitudes-only tempogram, not exported from any barrel. |
| `quickBeatTrack`, `dynamicBeatTrack`, `BeatTracker.estimateDynamicTempo`, `BeatTrackingUI` | `xa-beat-tracker.js` | Convenience wrappers + click-track/browser playback helpers (UI code living in a DSP module). `estimateDynamicTempo` is a sliding-window analog of `feature.tempo(aggregate=None)`. |

---

## 3. Detailed algorithm comparisons

### 3.1 `beat_track` — three pleco implementations vs Ellis DP

**Librosa** (`beat.py` `__beat_tracker` + helpers): onset envelope (median-aggregated log-mel flux) → std-normalize (`ddof=1`) → Gaussian-smoothed local score (window `exp(-0.5·(t·32/fpb)²)`, same-mode convolution; supports time-varying fpb) → DP with search window `[i − round(fpb/2), i − 2·fpb]`, transition cost `−tightness·(log(i−loc) − log(fpb))²`, first-beat gate at `0.01·max(localscore)` → tail = last local max of cumscore ≥ 0.5·median(local maxima) → backtrack → trim leading/trailing beats below `0.5·RMS(hann-smoothed beat scores)`.

**Pleco `xa-beat-tracker.js` (BeatTracker)** — the good one:
- `_normalizeOnsets`: std with `n−1` divisor + `1e-10` tiny — **matches**.
- `_beatLocalScore`: Gaussian window `exp(-0.5·((i·32.0)/fpb)²)`, static and time-varying branches — **matches** librosa's kernel and structure.
- `_beatTrackDP`: cost `cumScore[loc] − tightness·(log(interval) − log(fpb))²` with `0.01·max` first-beat gating — **matches**, except search window is `[i − 2.5·fpb, i − 0.5·fpb]` vs librosa's `[i − 2·fpb, i − fpb/2]` (extra 0.5·fpb of look-back), and logs are clamped `Math.max(1,·)`.
- `_lastBeat` / `_trimBeats`: median-of-local-maxima ×0.5 tail selection matches; trim uses RMS of raw beat scores (librosa first smooths with a 5-point hann) — minor.
- **Divergences that matter numerically:** onset envelope is linear-magnitude flux, not median-aggregated log-mel (librosa passes `aggregate=np.median` here specifically); tempo default range in the `beat_track` wrapper is 70–180 BPM (librosa: log-normal prior around `start_bpm=120`, `max_tempo=320`); `tempoEstimation` snaps to a hardcoded dance list `[120,128,140,174,100,85]` within ±5 BPM — silent quantization librosa does not do. Constructor spawns an `AudioContext` (browser-only noise) the DSP never uses.
- **Verdict: partial — the strongest librosa-fidelity beat tracker in the repo; fix the envelope + prior and it is close to `full`.**

**Pleco `xa-beat.js` (`beatTrack`/`trackBeats`)**: doc says "dynamic programming" but `trackBeats` lays a fixed grid `beat·beatPeriod` and snaps each gridpoint to the strongest onset within ±20% — no cumulative score, no backtracking. Default `startBpm = 0` means the no-peaks fallback returns 0 BPM → `beatPeriod = Infinity` → `[0]`. Ad hoc half/double-time correction. **Verdict: partial (structurally divergent).**

**Pleco `xa-tempo.js` (`beat_track`/`dp_beat_track`)**: DP forward pass exists (with the oddity that the "local" reward is `onset_env[i]`, the *current* frame, added inside the predecessor loop — harmless to argmax but not Ellis), but backtracking is **dead** (bug #1, line 332): `Int32Array.indexOf(float)` → `-1` → empty beats. Also all three `onset_strength(y, sr, hop_length)` call sites (lines 36, 263, 446) pass positional args into a `(y_or_stft, opts)` signature — `sr` lands where `opts` goes, destructuring a number yields defaults, so hop is silently pinned to 512 regardless of the caller's `hop_length`; correct only by coincidence when callers use the default. **Verdict: broken.**

### 3.2 `feature.tempo`

**Librosa**: localized tempogram (win = `time_to_frames(ac_size=8s)`) → aggregate (mean) over time → `tempo_frequencies` per lag bin → weight by **log-normal prior** `−0.5·((log2(bpm) − log2(start_bpm))/std_bpm)²` (or user prior) → kill bins above `max_tempo=320` → `argmax(log1p(1e6·tg) + logprior)`.

**Pleco `xa-tempo.tempo`**: global (already time-aggregated) autocorrelation → prominence-based peak picking (`find_peaks_with_prominence`, 10%-of-max threshold) → optional `apply_tempo_prior` = multiplicative boosts near 7 hardcoded dance tempos → strongest candidate. Differences: no log-normal prior (genre table instead), no `log1p` compression, prominence-sorted rather than prior-weighted argmax, returns a rich `{bpm, candidates, tempogram, confidence}` object rather than an ndarray, and has an extra `min_tempo` parameter librosa lacks. The `aggregate=None` dynamic-tempo mode has no equivalent here — the windowed analogs live in `xa-bpm-algorithm.analyzeWithProgress` and `BeatTracker.estimateDynamicTempo`, each with their own incompatible conventions. **Verdict: partial.**

Duplication census for "estimate a BPM from audio" (nine, counting inlines): `xa-tempo.tempo`, `xa-beat.estimateTempo` (+`fastBPMDetect`+`simpleTempoEstimate`), `xa-beat-tracker.tempoEstimation`, `xa-bpm-algorithm.estimateGlobalTempo` (+`estimateConstrainedTempo`), `xa-bpm-detection.detectBPM`, `BPMDetector.ts findTempo` (+`fastBPMDetect`), `pleco-xa.js analyzeAudio`, `audio-analysis.js` inline pipeline, `loop-smart.js` internal micro-tracker.

### 3.3 `onset_strength` — the upstream divergence

Librosa's default pipeline: `S = power_to_db(melspectrogram(y, fmax=sr/2))` → `ref = maximum_filter1d(S, max_size)` (or S) → `onset = mean_f max(0, S[f,t] − ref[f,t−lag])` → left-pad by `lag + n_fft//(2·hop)` (center compensation) → optional detrend.

All six pleco variants: `|STFT|` linear magnitude → `sum_f max(0, M[f,t] − M[f,t−1])`. Consequences:
- **No log compression** → flux dominated by broadband loud events; percussion in quiet passages under-weighted. Tempo autocorrelation peaks shift accordingly. This is the single largest source of numerical disagreement with librosa across the whole rhythm domain.
- **No mel warping** → high-frequency bins (most of the linear axis) dominate.
- `xa-onset.computeSpectralFlux` iterates `j < currentFrame.length` step 2 over the **full interleaved FFT** including the negative-frequency mirror — every flux value double-counted (pure scaling, but it changes the meaning of `delta`).
- **No center padding** anywhere → onset/beat times biased early by ~`n_fft/2` samples (~46 ms at 22050/2048) relative to librosa.
- `BPMDetector.ts` doesn't even use spectra — it's a windowed *total energy* first difference.
- `loop-smart.js` uses frame-RMS differences.
- Only `xa-rhythm.onsetStrengthMulti` applies a mel filterbank (no log), and it's not used by any tempo path.

### 3.4 `onset_detect` / peak picking

Librosa `peak_pick` (defaults tuned by large-scale search): candidate must be the max of `[n−pre_max, n+post_max]` (30ms/0ms), exceed `mean[n−pre_avg, n+post_avg] + delta` (100ms windows, delta=0.07 on a **[0,1]-normalized** envelope), and respect `wait` (30ms). Pleco `pickPeaks`: strict 3-point local max, above **global** `mean + delta` on the **unnormalized** envelope (so delta=0.07 is numerically meaningless against arbitrary flux magnitudes — the threshold is effectively just the mean), `wait = 20` frames ≈ **464 ms** — an order of magnitude more suppression than librosa's 30 ms, guaranteeing sparser onsets on anything faster than ~129 BPM eighth notes. No backtrack, no units conversion, no sparse/dense option.

Notable: `xa-util.js` already exports `peakPick`, described elsewhere in the repo as a full port of librosa's `peak_pick` — but `xa-onset.js` doesn't use it. Wiring the existing util in would close most of this gap for free (verify that port first).

### 3.5 `plp`

Librosa: hop-1 complex Fourier tempogram → zero outside [tempo_min, tempo_max] → `log1p(1e6·|ftgram|)` (+ prior logpdf) → zero all bins below the per-frame peak → normalize to phase-only → `istft(hop=1)` → half-wave rectify → normalize.

`BeatTracker.plp`: same skeleton (constraint → per-frame argmax keep → normalize by magnitude → istft → clip → normalize), with three divergences: (a) **hop mismatch bug #2** (analysis hop win/4=96 vs synthesis hop 1) — output time base compressed 96×, the function cannot produce a usable pulse curve as written; (b) prior applied as a linear multiplicative weight instead of additive log-space; (c) no `log1p` magnitude compression. `xa-rhythm.predominantLocalPulse` is not PLP at all (phase histogram over a fixed beat period) and should be renamed — its actual job (find where beat 1 sits given a tempo) is useful but mislabeled.

---

## 4. Consolidation recommendations

1. **Declare one canonical rhythm module and enforce it.** Keep `xa-beat-tracker.js`'s `BeatTracker` as the DP beat-tracking engine (it is the only faithful Ellis port). Route `beat_track`/`tempo` exports through it alone; delete or explicitly deprecate `xa-beat.js trackBeats`, `xa-tempo.js dp_beat_track/beat_track`, `xa-bpm-detection.js`, and `analysis/BPMDetector.ts` per the existing CLAUDE.md directive.
2. **Fix or delete `xa-tempo.js dp_beat_track`** (line 332: `backlink.indexOf(...)` → should be `cumulative_score.indexOf(Math.max(...cumulative_score))`, though even fixed it emits a dense frame chain, not beats — deletion in favor of BeatTracker is the better move).
3. **Resolve the triple `beat_track`/`tempo` export collision** (`xa-beat.js:74/167`, `xa-beat-tracker.js:1003/1020`, `xa-tempo.js:261/26`) — three incompatible signatures under identical names is an import minefield and breaks any barrel that star-exports more than one.
4. **Rebuild `onset_strength` on log-power mel** (`power_to_db(melspectrogram)` + lag diff + center shift; mel filterbank code already exists in `xa-rhythm.js`/`xa-mel.js`) and make every tempo/beat path consume it. This one change moves the whole domain from "structurally similar" to "numerically comparable" with librosa.
5. **Fix `BeatTracker.plp` hop mismatch** (compute the Fourier tempogram at hop 1, or synthesize at hop 96 — librosa parity requires hop 1) and **rename `xa-rhythm.predominantLocalPulse`** to something honest like `beatPhaseHistogram`.
6. **Wire the public surface to the migrated lb path**: export `xa-bpm-algorithm.js` (and/or the consolidated BeatTracker) from `src/scripts/index.js` instead of legacy `BPMDetector.ts`; delete the inlined duplicate lb pipeline inside `audio-analysis.js` and import instead.
7. **Implement `onset_backtrack`** (~15 lines: local minima of the envelope + nearest-left match) — cheap librosa parity win that directly serves pleco's loop-slicing use case — and swap `pickPeaks` for the existing `xa-util.peakPick` (after verifying that port) with librosa's normalized-envelope defaults, fixing the 464 ms `wait`.
8. **Make genre priors opt-in.** Remove the silent dance-tempo snapping in `BeatTracker.tempoEstimation` and the `apply_tempo_prior` boost table from default paths; implement librosa's log-normal `start_bpm/std_bpm` prior for parity, keeping the dance table as an explicit `prior: 'dance'` option. Also excise the `"Jazzy-Drumset"` filename hack and fabricated confidence constants from any surviving code.

## 5. Test coverage note

Per the repo's own test census: zero test files exercise `xa-onset.js`, `xa-beat.js`, `xa-beat-tracker.js`, `xa-tempo.js`, `xa-rhythm.js`, `xa-downbeat.js`, `xa-bpm-algorithm.js`, or `xa-bpm-detection.js`. Both confirmed bugs (§1) would have been caught by a single synthetic-click-track test (generate clicks at 120 BPM → assert beats returned ≈ every 0.5 s). Recommend that as the first test added after consolidation.
