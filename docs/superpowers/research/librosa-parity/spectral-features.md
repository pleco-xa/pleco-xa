# Pleco-XA vs librosa — Spectral Features Parity Report

**Domain:** mel spectrograms, MFCC, chroma, spectral descriptors, tonnetz, filter banks
**Date:** 2026-07-02
**Method:** function-by-function source comparison of
`/Users/cameronbrooks/Developer/pleco-xa/src/scripts/{xa-mel,xa-chroma,xa-spectral,xa-features,xa-audio-features}.js`
against
`/Users/cameronbrooks/Developer/librosa/librosa/{filters.py,feature/spectral.py,feature/utils.py,feature/inverse.py,core/convert.py}`.

---

## Executive summary

Pleco-xa has **four parallel, mutually inconsistent spectral stacks** (`xa-mel`, `xa-chroma`, `xa-features`, `xa-spectral`, plus a fifth mini-stack in `xa-audio-features`). None is a numerically faithful librosa port:

- **`xa-spectral.js`** (the ambitious 1360-line options-object port) references **~29 helper functions that are never defined or imported** (`fftFrequencies`, `dct`, `melFilterBank`, `chromaFilterBank`, `estimateTuning`, `cqt`, `cumsum`, `polyfit`, `transpose`, `linspace`, `sum`, ...). Verified by grep: 0 definitions/imports for all of them. Nearly every exported function throws `ReferenceError` at runtime. The only fully executable y-path functions (`spectralCentroid`, `spectralFlatness`, `rms`) are additionally poisoned by two structural bugs (below).
- **`xa-features.js`** uses `require('./librosa-fft.js')` — CommonJS inside a browser ES module **and** a nonexistent file (renamed to `xa-fft.js`). Every spectral function (centroid/bandwidth/rolloff/contrast) is dead on arrival, though the underlying formulas are mostly correct.
- **`xa-mel.js`** `melspectrogram` dynamically imports the same nonexistent `./librosa-fft.js` → rejects at runtime; `mfcc()` calls the `async` melspectrogram **without `await`** and immediately `.map()`s the Promise → `TypeError`. The mel filterbank itself is HTK-scale-only with wrong normalization (details below).
- **`xa-chroma.js`** actually runs, but its "CQT" is nearest-FFT-bin sampling from one giant FFT, not a constant-Q transform, and its chroma folding diverges substantially from librosa's Gaussian chroma filterbank.

### Two structural bugs that silently zero out results in `xa-spectral.js`

1. **Complex magnitude never computed.** `xa-fft.stft()` returns frames of `{real, imag}` objects. `xa-spectral`'s `abs()` helper checks `x.real !== undefined` only on the *outer* array, then does `row.map(Math.abs)` → `Math.abs({real, imag})` = `NaN` for every bin. The `sanitize()` step then **silently replaces every NaN with 0**, so the entire "spectrogram" is zeros. `spectralCentroid`/`spectralFlatness` return all-zero output with no error (validation theater: `isRealArray()` is hard-coded `return true`).
2. **Matrix orientation flipped.** `xa-fft.stft()` is time-major (`frames[t][freq]`), but all the axis math in `xa-spectral` assumes librosa's freq-major layout (`S[freq][t]`, axis=-2 = frequency). E.g. `spectralCentroid`'s internal `sumArray(..., axis:-2)` sums **over time per frequency bin** instead of over frequency per frame — output has length `n_freq_bins`, not `n_frames`, even if the abs() bug were fixed.

### Window function divergence (affects everything)

`xa-fft.hann_window(n)` uses the **symmetric** form `0.5*(1-cos(2πi/(n-1)))`; librosa/scipy `get_window(..., fftbins=True)` uses the **periodic** form (denominator `n`). Same symmetric formula is re-inlined in `xa-chroma.computeSTFT`. Every STFT-derived feature differs from librosa at the ~1e-3 level even before algorithmic differences.

---

## 1. Mel filterbank — `filters.mel` vs `xa-mel.mel_filterbank`

| Aspect | librosa `filters.mel` | pleco `mel_filterbank` | Verdict |
|---|---|---|---|
| Mel scale | **Slaney by default** (linear below 1 kHz: `f/(200/3)`; log above: `ln(6.4)/27` step), `htk=True` optional | **HTK only**: `2595*log10(1+f/700)` — no option | Divergent default. All mel center frequencies differ from librosa defaults |
| Filter shape | Continuous triangular ramps evaluated against exact `fft_frequencies`: `max(0, min(lower, upper))` | Triangles snapped to **integer FFT bins** via `Math.floor(((n_fft+1)*hz)/sr)` (HTK-tutorial idiom, also uses `n_fft+1` instead of `n_fft` in the bin formula) | Quantization error; narrow low-frequency filters can collapse |
| Normalization | `norm='slaney'` default: **area norm** `2/(mel_f[i+2]-mel_f[i])`; numeric norms via `util.normalize`; `None` = peak 1.0 | `norm=true` → divide by **sum of weights** (≈ L1 norm), no slaney option | Different scaling of every mel band → melspectrogram magnitudes not comparable to librosa |
| Empty-filter warning | yes | no | minor |

`hz_to_mel` / `mel_to_hz` / `mel_frequencies` in pleco are the HTK closed forms only — they match librosa **only** when the caller passes `htk=True` (which pleco cannot express).

## 2. melspectrogram

- librosa: `power=2.0` default, full `win_length/window/center/pad_mode` pass-through, `mel_basis @ S` via einsum, mel kwargs (`n_mels`, `fmax`, `htk`, `norm`) forwarded.
- pleco `xa-mel.melspectrogram`: power-2 spectrogram (matches default), hop 512 / n_fft 2048 defaults match, **but**: (a) `await import('./librosa-fft.js')` → module not found, function rejects; (b) filterbank issues from §1; (c) positional args, no window/center options (relies on xa-fft defaults: hann-symmetric, center reflect-pad — librosa default pad_mode is `'constant'` in `_spectrogram`, another small divergence); (d) `norm` argument to `mel_filterbank` is silently dropped (call passes 6 args, `norm` defaults true).
- `xa-spectral.melspectrogram`: calls undefined `melFilterBank` → ReferenceError.

**Status: partial (runtime-broken pending import fix; numerically divergent after that).**

## 3. MFCC

librosa: `S = power_to_db(melspectrogram(...))` → `scipy.fft.dct(S, axis=-2, type=2, norm='ortho')[:n_mfcc]`, `n_mfcc=20`, optional lifter `1 + (L/2)·sin(π(i+1)/L)`.

pleco `xa-mel.mfcc`:
- **BUG:** `const mel_spec = melspectrogram(...)` — no `await` on an async function; the next line `.map()`s a Promise → `TypeError` always. Everything downstream (`extract_mel_features`) is dead.
- Uses **natural log** `Math.log(max(1e-10, val))` instead of `power_to_db` (10·log10 + top_db clamp). Even after fixing the await, coefficients are scaled by `ln(10)/10 ≈ 0.23` relative to librosa and lack the top_db floor.
- DCT-II with ortho normalization is **correct** (matches `scipy.fft.dct(type=2, norm='ortho')`), just O(N²) per frame.
- `n_mfcc=13` default (Kaldi-style) vs librosa's 20.
- `lifter_mfcc` is a separate function with an **off-by-one**: uses `sin(πi/L)` for `i=0..n-1`; librosa uses `sin(π(i+1)/L)` — pleco's c₀ weight is exactly 1, librosa's is `1+(L/2)sin(π/L)`.
- `xa-spectral.mfcc`: liftering matches librosa's `(i+1)` indexing, but calls undefined `dct`/`powerToDb`-chain helpers upstream → DOA.

**Status: partial (correct DCT core, broken pipeline, wrong log compression).**

## 4. Chroma

### chroma_stft
librosa: power spectrogram → `filters.chroma` (Gaussian bumps per pitch, binwidth-adaptive, `octwidth` Gaussian octave weighting centered at `ctroct=5.0`, tuning shift, `base_c` roll) → matmul → `normalize(norm=inf, axis=-2)`. Tuning **estimated from the signal** when not given.

pleco `xa-chroma.chroma_stft`: internal STFT (own Hann, no centering) → each FFT bin's **power** assigned to `round(12·log2(f/440))+9 mod 12` (nearest semitone, hard binning, bins <80 Hz dropped) → per-frame `sqrt(energy_c)/sqrt(Σenergy)` normalization. No Gaussian weighting, no octave weighting, no tuning estimation (manual `tuning` param only), different normalization (norm=∞ vs sqrt-energy-share). Runs, but output values are not comparable to librosa. Fragile implicit contract with `xa-onset.fft` (flat interleaved Float32Array) — which does hold, per `frame[i*2]`, `frame[i*2+1]` indexing.

`xa-spectral.chromaStft`: needs undefined `estimateTuning` + `chromaFilterBank` → DOA.

**Status: partial (working but algorithmically far from librosa).**

### chroma_cqt
librosa: real CQT (wavelet basis, recursive downsampling), `bins_per_octave=36`, then `filters.cq_to_chroma` aggregation matrix, threshold, normalize.

pleco: `constant_q_transform` is **not a CQT** — it frames the signal at `n_fft = 2^ceil(log2(4·sr/fmin))` (≈8192+ at sr 22050) and picks the single **nearest FFT bin** per log-spaced frequency; constant-Q resolution is illusory and it's very slow (one huge FFT per hop of 512). `cqt_to_chroma` ignores its `bins_per_octave` parameter (folds `bin % n_chroma`, only correct when bpo === n_chroma; pleco's own default call uses bpo=12 so it "works" by luck; librosa's default bpo=36 could not be expressed). Default `bins_per_octave=12` vs librosa 36.

**Status: partial (pseudo-CQT; usable qualitatively, not faithful).**

### chroma_cens
Only in `xa-spectral.chromaCens`. The QUANT_STEPS/QUANT_WEIGHTS quantization and structure mirror librosa, but it calls undefined `greaterThan`, `addInPlace`, `getWindow`, `convolve1d`, and depends on the broken `chromaCqt` → cannot execute. **Status: missing (non-functional sketch).**

### chroma_vqt
No pleco implementation anywhere. **Status: missing.**

## 5. Spectral descriptors

| Function | Best pleco impl | Fidelity notes |
|---|---|---|
| `spectral_centroid` | `xa-features.spectral_centroid` | Formula correct (Σf·S/ΣS per frame ≡ librosa norm-1 weighting). **DOA**: `require('./librosa-fft.js')`. `xa-spectral.spectralCentroid` executes but returns garbage (abs→NaN→0 sanitize + axis flipped, output per-bin not per-frame). |
| `spectral_bandwidth` | `xa-features.spectral_bandwidth` | Matches librosa `norm=True, p=2` math (Σ Ŝ·|f−c|^p)^(1/p). DOA (require). Recomputes STFT twice (once via centroid). No `norm`/`centroid` options. |
| `spectral_contrast` | `xa-features.spectral_contrast` | Divergent: 10th/90th **percentile point values** vs librosa's **mean of the extreme `quantile=0.02` fraction** (min 1 bin); `ln(peak/valley)` vs `power_to_db(peak)−power_to_db(valley)` (natural-log vs 10·log10); returns `n_bands` rows vs librosa `n_bands+1` (librosa's first band is `[0, fmin]`, pleco starts at fmin); no boundary-bin adjustments. DOA (require). `xa-spectral.spectralContrast` needs undefined `sortAlongAxis`/`extractSubBand`. |
| `spectral_rolloff` | `xa-features.spectral_rolloff` | Uses **power** (mag²) cumsum; librosa uses the spectrogram at default `power=1` (magnitude) — rolloff frequencies differ. Otherwise equivalent threshold logic. DOA (require). |
| `spectral_flatness` | `xa-spectral.spectralFlatness` | Formula is a faithful port (amin clamp, `power=2.0`, geo-mean/arith-mean, axis semantics coincidentally right for time-major rows). Works **only** if caller passes a precomputed real magnitude matrix as `S` in time-major layout; the `y` path yields zeros via the abs() bug. No other implementation exists. |
| `rms` | `xa-spectral.rms` (y path) | Closest to librosa: center pad (`constant`), frame 2048/hop 512, `sqrt(mean(x²))`. The `S` path calls undefined `sum` → DOA. `xa-features.rms` and `xa-audio-features.computeRMS` lack centering (frame offsets shifted by frame_length/2 vs librosa) and use different defaults (1024/512 in xa-audio-features). |
| `zero_crossing_rate` | `xa-features.zero_crossing_rate` | Counts sign flips / frame_length; librosa edge-pads for `center=True` and uses `zero_crossings` with `threshold=1e-10` (tiny values clamped to zero before sign test). Pleco: no centering, no threshold, `xa-audio-features` divides by `frameSize−1`. Close but not bit-comparable. |
| `poly_features` | `xa-spectral.polyFeatures` | Needs undefined `polyfit`/`transpose`. `xa-advanced.polyfit` only supports degree 1 (silently returns zeros above). **Effectively missing.** |
| `tonnetz` | `xa-spectral.tonnetz` | Transform-matrix construction (scale = [7/6,7/6,3/2,3/2,2/3,2/3], `V[::2] −= 0.5`, `R=[1,1,1,1,.5,.5]`, `cos(πV)`, L1-normalized chroma) is a **faithful structural port** of librosa. But it calls `linspace` which is not defined/imported in the file → ReferenceError, and its default chroma path goes through broken `chromaCqt`. One import fix + precomputed chroma would make it run. |

## 6. feature.utils and inverse

- **`delta`**: librosa = Savitzky-Golay (`savgol_filter(width=9, polyorder=order, deriv=order, mode='interp')`). pleco `xa-mel.delta_features` = classic regression-slope delta (`Σ i·x[t+i] / Σ i²`) with edge clamping — equivalent to savgol only for `polyorder=1, deriv=1, mode='nearest'`-ish; no `order` param (delta-delta obtained by composing, which differs from savgol order=2), no `mode` options. **Partial.**
- **`stack_memory`**: `xa-recurrence.stackMemory` implements time-delay embedding, but validates rows with `Array.isArray(chroma[0])` which **rejects Float32Array rows** produced by its own siblings → callers fall into fallback paths. **Partial.**
- **`feature.inverse.*`** (`mel_to_stft`, `mel_to_audio` via Griffin-Lim, `mfcc_to_mel`, `mfcc_to_audio`): no pleco equivalents. `xa-mel.idct` exists as a primitive that would serve `mfcc_to_mel`, and `xa-fft.istft` exists (with a known-broken `ifft` that discards imaginary parts), but no NNLS mel inversion or Griffin-Lim anywhere. **Missing.**
- **rhythm exports of `feature`** (`tempo`, `tempogram`, `fourier_tempogram`): implemented (divergently) in `xa-tempo.js` / `xa-beat-tracker.js` / `xa-bpm-algorithm.js` — belongs to the rhythm-domain report; noted here only for completeness. `tempogram_ratio`: no equivalent anywhere. **Missing.**

## 7. filters module (beyond mel)

| librosa | pleco | Status |
|---|---|---|
| `filters.chroma` | none (xa-chroma does direct per-bin semitone binning; xa-spectral calls undefined `chromaFilterBank`) | **missing** |
| `filters.get_window` | `xa-fft.get_window` — hann/hamming/blackman/boxcar only, all **symmetric** (n−1 denominator) vs librosa's periodic (`fftbins=True`); unknown types silently fall back to hann instead of erroring | partial |
| `filters.constant_q`, `wavelet`, `wavelet_lengths`, `constant_q_lengths` | `xa-chroma.constant_q_transform` pseudo-CQT (nearest-bin sampling, no wavelet basis, no length calculation) | partial (constant_q concept), wavelet* missing |
| `filters.cq_to_chroma` | `xa-chroma.cqt_to_chroma` — modulo fold + sqrt-share normalization; ignores `bins_per_octave`; no roll-to-C, no window aggregation | partial |
| `window_sumsquare` | inline `window_sum` in `xa-fft.istft` accumulates **window** values, not **window²** — librosa's COLA normalization uses win² for hann-analysis+synthesis; reconstruction gain is wrong even ignoring the broken `ifft` | missing (divergent inline substitute) |
| `window_bandwidth`, `mr_frequencies`, `semitone_filterbank` | none | missing |
| `diagonal_filter` | loose cousin: `xa-temporal.pathEnhance` (multi-angle diagonal smoothing), different API/purpose | missing |

## 8. Pleco extras (no librosa counterpart)

- `xa-mel.extract_mel_features` — MFCC + Δ + ΔΔ + mean/std bundle (broken transitively via mfcc).
- `xa-chroma`: `enhance_chroma` (log-compression + norm), `chroma_energy`, `spectrum_to_chroma`, `freq_to_chroma`, `NOTE_NAMES`/`chroma_to_note` — handy utilities, all working.
- `xa-features`: `compute_feature_stats` (mean/std/median/skew/kurtosis), `smooth_features`, `detrend_feature`, `extract_comprehensive_features` (broken transitively), `normalize_features` (≈ `librosa.util.normalize` subset).
- `xa-audio-features.computePeak` — per-frame peak tracking (note: `Math.max(...peaks)` spread risk on long files).

## 9. Consolidation recommendations

1. **Fix the dead import chain first** — it's one rename: `./librosa-fft.js` → `./xa-fft.js` (plus converting `require()` to ESM `import` in `xa-features.js` and awaiting/de-asyncing `melspectrogram` in `xa-mel.mfcc`). This single fix revives centroid/bandwidth/rolloff/contrast/melspectrogram, the largest block of currently-dead parity surface.
2. **Delete or rewrite `xa-spectral.js`.** With ~29 undefined helpers, wrong matrix orientation, and the NaN-sanitizing abs(), it is unfixable incrementally; keep only `spectralFlatness` and the `rms` y-path (the two salvageable bodies) and fold them into one canonical module.
3. **Rebuild `mel_filterbank` to librosa spec**: Slaney mel scale default with an `htk` flag, continuous ramps against `fft_frequencies` (drop integer bin snapping), and `'slaney'` area normalization `2/(mel_f[i+2]-mel_f[i])`. This is the single biggest numerical-parity lever for melspectrogram/MFCC.
4. **MFCC pipeline**: use `power_to_db` (already correctly implemented in `xa-mel`!) instead of natural log; align `n_mfcc` default to 20; fix `lifter` off-by-one; cache the DCT-II basis matrix per (n_mels, n_mfcc).
5. **Adopt periodic (fftbins) windows** in `xa-fft` to match scipy/librosa, and route the inline Hann in `xa-chroma.computeSTFT` through `get_window`.
6. **One chroma path**: implement `filters.chroma` (Gaussian bumps + octwidth + tuning + base_c roll) as a matrix and make `chroma_stft` a matmul; retire the nearest-semitone binning or keep it as an explicitly-named "fast" variant.
7. **Replace `delta_features` with Savitzky-Golay** (small closed-form coefficient table for width 9 / polyorder 1&2 covers librosa defaults).
8. **Add golden-file tests**: precompute librosa outputs (melspectrogram/mfcc/centroid/chroma on a short fixture) and assert JS output within tolerance — the tests/ directory currently has zero coverage of any xa-* spectral module.
