# Pleco-XA vs librosa parity — domain: effects-decompose

Comparison of `librosa.effects` + `librosa.decompose` against pleco-xa (JS).
Sources read in full:

- librosa: `/Users/cameronbrooks/Developer/librosa/librosa/effects.py`, `/Users/cameronbrooks/Developer/librosa/librosa/decompose.py`, `phase_vocoder` in `/Users/cameronbrooks/Developer/librosa/librosa/core/spectrum.py` (l.1365–1474), `util.softmask` signature (`util/utils.py` l.1678).
- pleco-xa: `src/scripts/xa-processing.js`, `src/scripts/xa-advanced.js`, `src/scripts/xa-split.js`, `src/scripts/xa-trim.js`, `src/scripts/xa-remix.js`, `src/scripts/compression.js`, `src/scripts/xa-filters.js`, `src/scripts/xa-vocal-separation.js`, `src/scripts/xa-fft.js`.
- Repo-wide grep confirmed **no** `nn_filter`, `softmask`, NMF, or REPET-style code exists anywhere in pleco-xa.

## Summary verdict

Pleco-xa covers the *shapes* of librosa.effects (hpss, time_stretch, pitch_shift, remix, trim, split, preemphasis) but almost every implementation is either simplified in a way that changes results, duplicated across two modules, or outright non-functional. `librosa.decompose.decompose` (NMF) and `nn_filter` have no counterpart at all. The single highest-leverage defect in this domain is `ifft()` in `src/scripts/xa-fft.js` (l.81–98): it conjugates the spectrum and then calls `fft(conjugated.map(bin => bin.real))`, **discarding all imaginary components**. For the conjugate-symmetric spectra built by `istft`, this returns only the *even (time-symmetrized)* part of each synthesis frame — every stft→process→istft pipeline in the repo (vocal separation reconstruction, any future waveform-level HPSS or time_stretch) produces materially wrong audio because of this one function.

---

## Function-by-function parity table

### librosa.effects

| librosa fn | pleco file / export | status | fidelity notes |
|---|---|---|---|
| `effects.hpss` (waveform) | — | **missing** | No stft→hpss→istft wrapper with length matching exists. Composing one manually today would inherit the broken `ifft`. |
| `effects.harmonic` | — | **missing** | No convenience function. |
| `effects.percussive` | — | **missing** | No convenience function. |
| `effects.time_stretch` | `xa-processing.js: time_stretch` | **partial (non-functional)** | See §time_stretch. Dead on arrival (`require('./librosa-fft.js')` in ESM, file doesn't exist) AND rate semantics inverted vs its own docstring/librosa. `compression.js: pitchBasedCompress` is a linear-interp resample (pitch changes), i.e. closer to `librosa.resample`, not time_stretch; `tempoBasedCompress` is an admitted placeholder that silently falls back to pitch-changing resample. |
| `effects.pitch_shift` | `xa-processing.js: pitch_shift`, `xa-advanced.js: pitch_shift` | **partial (non-functional, ×2)** | See §pitch_shift. xa-advanced version always returns silence (zero-filled STFT placeholders). xa-processing version has the broken `require` and, even if fixed, is algorithmically incomplete: phase-vocoder stretch **without the resample step**, so it changes duration, not pitch. |
| `core.phase_vocoder` (used by effects) | `xa-processing.js: phase_vocoder`, `xa-advanced.js: phase_vocoder` | **partial** | See §phase_vocoder. xa-processing is structurally close but the phase-unwrap math deviates from librosa (wraps raw Δφ before subtracting expected advance instead of wrapping the deviation) and hop is hardcoded 512. xa-advanced version ignores input phase entirely (fully synthetic phase). |
| `effects.remix` | `xa-remix.js: remix` | **partial** | Sorts intervals by start time (l.43), which defeats reordering — the entire point of remix. librosa preserves caller order (its canonical example reverses beats; through pleco's remix that is a no-op). `align_zeros` defaults `false` (librosa: `true`), and alignment strategy differs: librosa snaps interval boundaries to the nearest zero crossing of the whole (mono) signal via `match_events`; pleco slices first then shrinks each segment to its first/last internal crossing — different boundaries, shortened segments. Mono only. Interval bounds validated (throws) — librosa doesn't. |
| `effects.trim` | `xa-trim.js: trim` | **partial** | Correct overall shape (frame RMS envelope, dB threshold, index return). Divergences: (1) **ref default = peak sample amplitude** `max(|y|)` vs librosa's max *frame RMS* — since peak ≥ max-RMS (often by 6–12 dB for music) pleco trims more aggressively at equal `top_db`; (2) end index = `end_frame*hop + frame_length` vs librosa `(last+1)*hop` → pleco keeps 1536 extra samples at default params; (3) all-silent input returns the **full untrimmed** signal, librosa returns an empty `[0,0)` slice; (4) trailing partial frame never analyzed (loop stops at `y.length - frame_length`; librosa's `feature.rms` centers/pads); (5) no callable `ref`, no `aggregate`, mono only; (6) `Math.max(...y.map(...))` spreads the entire signal — stack-overflow risk on long audio. `autoTrimBuffer` (AudioBuffer wrapper, default top_db=30) is a pleco extra. |
| `effects.split` | `xa-split.js: split` | **partial** | Same ref/threshold and spread-stack issues as trim (identical envelope code). State-machine interval extraction is equivalent in spirit to librosa's sign-flip edge detection, but interval **ends are extended by `frame_length`** (`i*hop + frame_length`) where librosa uses frame-boundary samples (`edge*hop`) — adjacent non-silent regions separated by < ~4 frames can overlap/merge differently. Returns plain `[start,end]` arrays vs shape `(m,2)` ndarray. `getNonSilentSegments` (time/sample segment objects for AudioBuffer) is a pleco extra. |
| `effects.preemphasis` | `xa-filters.js: preemphasis` | **partial** | Difference equation `y[n]-coef*y[n-1]` correct. Default `zi=0` vs librosa's linear-extrapolation init `2*y[0]-y[1]` → first output sample differs (librosa: `y[0]-coef*(2y[0]-y[1])`; pleco: `y[0]`). Returned `zf` is the raw last input sample (not scipy's scaled state `-coef*y[-1]`), but chaining is **self-consistent** within pleco's own convention, so block streaming works if you stay inside pleco. Returns `{y, zf}` object vs tuple. Mono only. |
| `effects.deemphasis` | `xa-filters.js: deemphasis` | **partial** | Recurrence `y[n]+coef*y_out[n-1]` correct. Default `zi=0` and no equivalent of librosa's extrapolation-correction term (`((2-coef)y[0]-y[1])/(3-coef) * coef^n`), so `deemphasis(preemphasis(x))` does **not** round-trip to `x` at the signal start the way librosa guarantees (`np.allclose` true in librosa). |

### librosa.decompose

| librosa fn | pleco file / export | status | fidelity notes |
|---|---|---|---|
| `decompose.hpss` (spectrogram) | `xa-processing.js: hpss`, `xa-advanced.js: hpss` (duplicates) | **partial** | See §hpss below. Core median-filtering idea (Fitzgerald 2010) is present and oriented correctly, but the default output is *not* an HPSS decomposition, and margin/kernel-tuple/complex-input are unsupported. |
| `decompose.decompose` (NMF) | — | **missing** | No matrix factorization of any kind in the repo. |
| `decompose.nn_filter` | — | **missing** | No nearest-neighbor / REPET-SIM / non-local-means filtering. `xa-temporal.js` has a `recurrenceMatrix` that could in principle supply the `rec` input, but no aggregation filter exists (and per the prior mapping pass that module has its own blocking bugs). Pleco's vocal separation is an unrelated, pleco-unique algorithm (below). |

### Pleco-unique (no librosa counterpart) — status `extra`

| pleco export(s) | file | notes |
|---|---|---|
| `convolve2d`, `downsampleSpectrum`, `createOrientedFilter`, `create18Slices`, `windowToFingerprint`, `processAudioToFingerprints`, `optimizeEqCurves`, `reconstructVocal` | `src/scripts/xa-vocal-separation.js` | Vocal separation via multi-scale spectral fingerprints (19 convolution "slices", 400-point per-window freq profile + band/shape/harmonic/formant/dynamics metrics) and per-window 400-point EQ curves fit by gradient descent, then phase-preserving reconstruction. This is NOT the librosa nn_filter recipe. **Fidelity blocker:** `reconstructVocal` calls `istft` from xa-fft.js whose `ifft` drops imaginary parts (verified, xa-fft.js l.91) — every synthesis frame comes back time-symmetrized `(x[n]+x[N-n])/2`, so reconstruction quality is fundamentally compromised regardless of how good the EQ fit is. Also: `create18Slices` produces 19 slices (slice_0..slice_18); only `slice_0_raw` fingerprints are actually consumed by `optimizeEqCurves` (the other 18 slice fingerprint banks are computed then unused — enormous wasted O(freq·time·9) convolution work); `mixtureFps` param unused; `Math.max(...arr.map)` spread on full-length audio (stack risk); heavy console banner spam in library code. |
| `crossfade` | `src/scripts/xa-remix.js` | Linear crossfade between two segments. No length validation (`seg1.length >= fade_samples` assumed; short segments silently corrupt output). |
| `pitchBasedCompress`, `tempoBasedCompress` | `src/scripts/compression.js` | Linear-interp resampling keeping the header sample rate (pitch+tempo change together) ≈ crude `librosa.resample` without anti-aliasing. `tempoBasedCompress` is a placeholder that silently violates its pitch-preservation contract. Creates a throwaway `AudioContext` per call (browser-only, leaks). Both re-exported via `src/core/index.js`, so the placeholder is public API. |
| `spectral_gate`, `enhance_onsets`, `spectral_whiten`, `median_filter_*`, `median` | `src/scripts/xa-processing.js` | Noise gating (percentile noise floor), half-wave-rectified flux enhancement, local-median whitening. Reasonable utilities; no direct librosa equivalents (whitening loosely relates to `librosa.util` normalization patterns). |
| `highpass`, `lowpass` | `src/scripts/xa-filters.js` | One-pole exponential filters with **normalized 0–1 cutoff and no sample-rate awareness**; highpass discretization is nonstandard. Not librosa surface. |
| `stutter`, `phase`, `fractal`, `applyQuantumOp` | `src/scripts/audio-ops-extended.js` | Destructive loop-region glitch effects (browser/window-coupled). No librosa counterpart; performance-tool domain. |
| `reverseBufferSectionEnhanced`, `applyOperationEnhanced`, etc. | `src/scripts/enhanced-audio-ops.js` | Chunked large-buffer loop ops. No librosa counterpart. Prior mapping pass flags the chunked reverse as reversing per-chunk instead of whole-section (not re-verified here; outside librosa parity scope). |

---

## Detailed algorithm comparisons

### hpss (decompose.hpss vs xa-processing/xa-advanced hpss)

librosa (`decompose.py` l.211–408):
1. Accepts complex or magnitude `S`; splits `S = mag * phase` via `magphase` and reapplies phase at the end.
2. `kernel_size` scalar **or (harm, perc) tuple**; median filter along time for harmonic, along frequency for percussive, `mode='reflect'` boundaries.
3. `margin` scalar or tuple, must be ≥ 1; enables H+P+R (Driedger 2014) residual separation.
4. **Always** builds Wiener soft masks `softmask(harm, perc*margin_h, power)` / `softmask(perc, harm*margin_p, power)` (with `split_zeros` when both margins == 1, giving 0.5/0.5 at all-zero bins; `power=inf` → hard binary mask).
5. Returns masks if `mask=True`, else the **masked components** `(S*mask_h*phase, S*mask_p*phase)` — so `H + P == S` when margin == 1.

pleco (both copies, `xa-processing.js` l.14–50 and `xa-advanced.js` l.182–221):
- Median directions and default kernel 31 match; boundary handling **shrinks the window at edges** instead of reflecting → first/last ~15 frames and bins differ numerically from librosa.
- `kernel_size` scalar only; **no margin** (no residual mode, no Driedger extension); no complex input (magnitude-only 2D arrays); no phase reapplication.
- Mask path (`mask=true`): `H^p/(H^p+P^p)` with 0.5/0.5 at zero-sum — this **matches** librosa's `softmask` at margin=1, split_zeros semantics included. `power=Infinity` unsupported.
- **Key divergence:** default path (`mask=false`) returns the **raw median-filtered spectrograms** `{harmonic: H, percussive: P}` rather than `S*mask`. Raw median outputs do not sum to `S` and are not a decomposition of `S`; a caller porting `H, P = librosa.decompose.hpss(S)` gets fundamentally different (blurrier, energy-inconsistent) output. Correct usage in pleco today requires `mask=true` and manual `S*mask` multiplication + manual phase handling.
- The two copies differ slightly (xa-advanced adds `Math.abs` inside `Math.pow` and a `1e-10` guard; xa-processing computes `n_time` unused in the non-mask path). Two near-identical implementations = drift risk.

Waveform-level `effects.hpss` / `harmonic()` / `percussive()`: **no equivalent**, and cannot be correctly built until `ifft` is fixed.

### phase_vocoder

librosa (`core/spectrum.py` l.1365–1474):
- `phi_advance = hop * 2π * k / n_fft`; `phase_acc` initialized to `angle(D[:,0])`; per output step: linear magnitude interpolation between neighboring input columns; `dphase = angle(next) − angle(curr) − phi_advance`, **then** wrapped to (−π, π]; `phase_acc += phi_advance + dphase`. Pads two zero columns for boundary logic; `hop_length`/`n_fft` are parameters (defaults inferred from D).

pleco `xa-processing.js: phase_vocoder` (l.160–246):
- Structure (magnitude interpolation, phase accumulation, unwrap) mirrors librosa, but the unwrap order is wrong: it wraps the **raw** `next_phase − curr_phase` to (−π, π] and then adds `expected_advance`. Because the raw inter-frame phase difference contains the expected advance modulo 2π (which for most bins exceeds π), wrapping before subtracting the expected advance produces a different instantaneous-frequency estimate than librosa's wrap-of-deviation — audible phasiness/detune for all but the lowest bins. `phase_accumulator` starts at 0 instead of the first frame's phase. `hop_length` hardcoded 512; `phase_advance` denominator `n_freq*2 = n_fft+2` (small systematic error). Breaks out at `t_floor >= n_time−1` (drops final frame instead of zero-padding). `last_phase` computed but never used.

pleco `xa-advanced.js: phase_vocoder` (l.332–383):
- Worse: freq-major layout, nearest-neighbor frame pick (no magnitude interpolation), and **input phase is never read** — output phase is purely `k·hop`-synthetic. Output is effectively a magnitude-only robotization, not a phase vocoder.

### time_stretch

librosa: `stft → phase_vocoder(rate) → istft(length = round(n/rate))`; `rate > 1` = faster; raises on `rate <= 0`.

pleco `xa-processing.js: time_stretch` (l.371–385):
1. **Dead on arrival:** `const { stft, istft } = require('./librosa-fft.js')` — CommonJS `require` inside a browser ES module (ReferenceError) *and* the file was renamed to `xa-fft.js`, so it fails under any loader.
2. **Inverted rate:** its own docstring says `rate > 1 = faster` (matching librosa), but it calls `phase_vocoder(D, 1/rate)`. Pleco's phase_vocoder already uses librosa's convention (rate>1 → fewer output frames → faster), so `time_stretch(y, 2)` would produce audio **twice as slow**.
3. No output-length trim to `round(n/rate)`; no rate validation.

### pitch_shift

librosa: `rate = 2^(−n_steps/bins_per_octave)`; `resample(time_stretch(y, rate), orig_sr = sr/rate, target_sr = sr)`; `fix_length` to input size; validates `bins_per_octave`; `res_type='soxr_hq'`, optional `scale`.

pleco `xa-processing.js: pitch_shift` (l.132–152): same broken `require`; computes `shift_ratio = 2^(n_steps/bpo)` and runs `phase_vocoder(D, shift_ratio)` then istft — that is a **time stretch**, with no resample step, so even with imports fixed it changes duration and leaves pitch unchanged. The `sr` parameter is accepted and ignored (`_sr`).

pleco `xa-advanced.js: pitch_shift` (l.305–324): calls private `simple_stft`/`simple_istft`, which are **zero-filled placeholders** (l.585–609) — the function unconditionally returns a silent Float32Array of plausible length. A placeholder shipped as a real export; also missing the resample step conceptually.

Net: **pleco has no working pitch shift and no working phase-vocoder time stretch.** The only functioning "speed change" paths are pitch-changing linear resamples (`compression.js`, `live-speed-control.js`), one of which falsely claims pitch preservation.

### trim / split threshold math (worked comparison)

librosa non-silent test: `20·log10(rms_frame / ref) > −top_db`, `ref = max(rms)` by default ⇒ `rms_frame > max(rms) · 10^(−top_db/20)`.
pleco test: `rms_frame ≥ max(|y|) · 10^(−top_db/20)`.
Same functional form; the divergence is the **reference**: peak sample amplitude vs max frame RMS. For a sine, peak = RMS·√2 (+3 dB); for percussive/transient material the gap is routinely 10–15 dB — pleco's effective threshold is that much higher, i.e. `trim(top_db=60)` in pleco behaves like librosa `trim(top_db≈45–57)`. Anyone porting notebook constants will over-trim.

### remix reorder bug (worked example)

librosa's canonical example: `remix(y, intervals[::-1])` reverses the beats. In pleco, `intervals.sort((a,b) => a[0]-b[0])` restores ascending order first, so `remix(y, reversed)` returns the original concatenation — the function can only *filter* intervals, never *reorder* them. One-line fix (delete the sort) restores librosa semantics.

### The ifft defect (verified, load-bearing for this whole domain)

`src/scripts/xa-fft.js` l.81–98:

```js
export function ifft(spectrum) {
  const N = spectrum.length
  const conjugated = spectrum.map((bin) => ({ real: bin.real, imag: -bin.imag }))
  const result = fft(conjugated.map((bin) => bin.real))   // <-- imaginary parts discarded
  return result.map((bin) => ({ real: bin.real / N, imag: -bin.imag / N }))
}
```

The conjugate-then-fft-then-conjugate identity requires feeding the **complex** conjugated spectrum to `fft`, but `fft()` only accepts real input, so `.map(bin => bin.real)` silently drops the odd (imaginary) half of the information. For the conjugate-symmetric spectra `istft` constructs, real parts are even ⇒ the recovered frame equals the time-symmetrized `(x[n] + x[(N−n) mod N]) / 2`. Consequences in this domain: `reconstructVocal` output is smeared/doubled; any future `effects.hpss`, `time_stretch`, or `pitch_shift` built on this istft is wrong before its own math even runs. There are also untracked duplicates of xa-fft.js at `public/scripts/xa-fft.js` (git status), so a fix must propagate through `scripts/sync-public-deps.js` or it will drift.

Minor additional STFT fidelity notes: pleco's Hann uses the symmetric `n−1` denominator (librosa/scipy default is periodic, `sym=False`) — small COLA/normalization deviation; `pad_reflect`'s left-side index `Math.min(pad_width - i, array.length - 1)` reflects incorrectly when `pad_width − i` is out of range.

---

## Consolidation observations

- **HPSS ×2** (`xa-advanced.js`, `xa-processing.js`) with private duplicate median-filter helpers; **phase_vocoder ×2** (mutually incompatible layouts: time-major vs freq-major); **pitch_shift ×2** (both broken differently). One canonical module should own hpss + phase_vocoder + time_stretch + pitch_shift.
- Three parallel "speed change" stories (compression.js, live-speed-control.js resample, the dead phase-vocoder path) — none pitch-preserving despite two of them claiming to be.
- `xa-vocal-separation.js` exists in triplicate (`src/scripts/`, `public/scripts/`, plus the LibrosaDemo-PR1 tree per git status) and is not in the sync-public-deps whitelist.
- trim/split share ~20 identical envelope-computation lines; extract a `_signalToFrameNonsilent` helper mirroring librosa's, fixing the ref/end-index/spread issues once.

## Recommendations

1. **Fix `ifft()` in `src/scripts/xa-fft.js` first.** Accept complex input end-to-end (or add a dedicated conjugate-symmetric inverse real FFT for istft). Every effects-domain reconstruction depends on it; until then, vocal separation output quality is bounded by this bug, not by the algorithm.
2. **Consolidate HPSS into one module and make the default librosa-faithful:** `mask=false` should return `S·mask_H` / `S·mask_P` (masked components, H+P≈S), add `margin` and `(kernel_harm, kernel_perc)` tuple support, use reflect boundaries in the median filters, and (post-ifft-fix) add waveform-level `hpss`/`harmonic`/`percussive` wrappers with length matching.
3. **Rewrite `phase_vocoder` to librosa's formulation** (wrap `Δφ − φ_advance`, init phase from frame 0, parameterize hop/n_fft, pad 2 columns), then fix `time_stretch` (remove the `require`, un-invert the rate, trim to `round(n/rate)`) and implement `pitch_shift` properly as time_stretch + resample + fix_length. Delete `xa-advanced.js: pitch_shift`/`simple_stft`/`simple_istft` (silence-returning placeholders) and retire `tempoBasedCompress`'s silent pitch-changing fallback (throw or document instead).
4. **Fix `remix`:** delete the interval sort (it defeats reordering — librosa's core use case), default `align_zeros=true`, and align boundaries to the nearest zero crossings of the whole signal (match-events style) instead of shrinking each segment to internal crossings.
5. **Align trim/split with librosa's reference:** use max frame-RMS (not peak sample) as default ref, compute the signal max with a loop instead of `Math.max(...spread)` (stack-overflow risk on long files), use `(last_frame+1)·hop` end indices, return an empty result for all-silent trim, and share one envelope helper between the two functions.
6. **Triage the true gaps:** `decompose.nn_filter` (REPET-SIM median aggregation over a recurrence matrix) is the standard librosa vocal-separation recipe and would give `xa-vocal-separation.js` a well-understood baseline; `decompose.decompose` (NMF) is likely out of scope for the browser — mark it explicitly unsupported rather than leaving it silently absent.
7. **In `xa-vocal-separation.js`,** either consume the 18 non-raw slice fingerprint banks in the optimizer or stop computing them (currently only `slice_0_raw` is used — the 2D convolution bank is pure wasted work), rename `create18Slices` (it makes 19), and strip the console banner spam from library code.
8. **De-duplicate the public/ copies** (`xa-fft.js`, `xa-vocal-separation.js`, `xa-wav-encoder.js`, `SpectrumAnalyzer.js`) by adding them to `scripts/sync-public-deps.js` or switching to a glob manifest — otherwise fixes from items 1–7 will not reach the browser-served copies.
