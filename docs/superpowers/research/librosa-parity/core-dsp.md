# Pleco-XA vs librosa — Core DSP Parity Report

**Domain:** core-dsp (STFT/ISTFT, FFT, resampling, audio loading, framing, windowing, dB conversion, normalization, utilities)
**Date:** 2026-07-02
**Method:** Direct source comparison. Pleco files read in full: `src/scripts/xa-fft.js`, `xa-audioio.js`, `xa-util.js`, `xa-processing.js`, `audio-utils.js`, `xa-wav-encoder.js`, plus targeted reads of `xa-mel.js`, `xa-spectral.js`, `xa-advanced.js`, `xa-file.js`. Librosa sources: `core/spectrum.py`, `core/audio.py`, `util/utils.py`, `filters.py`.

---

## 1. Executive summary

Pleco-xa covers roughly the *shape* of librosa's core surface — `stft/istft`, `load/resample/to_mono`, signal synthesis (`tone/chirp/clicks`), mu-law, LPC, and a large chunk of `librosa.util` — but numerical fidelity is compromised by a handful of load-bearing bugs:

1. **`ifft` discards imaginary input** (`xa-fft.js:91`), which silently breaks `istft` for every real spectrogram with nonzero phase — i.e., all of them. Everything downstream of ISTFT (vocal separation reconstruction, any resynthesis) is corrupted.
2. **Windows are symmetric, librosa's are periodic** (`fftbins=True` in `filters.get_window`, `filters.py:1230`). Every pleco spectrogram differs numerically from librosa's at every bin.
3. **`xa-util.js` mishandles typed arrays**: `frame()` silently returns `[]`, and `validAudio()`/`normalize()` **throw** on any `Float32Array` longer than 1 sample — the native audio type of the platform.
4. **`chirp` and `mu_expand` have straight math bugs** (wrong phase integral; wrong dequantize scale).
5. **CQT/VQT and `griffinlim` are absent**; the `constant_q_transform` in `xa-chroma.js` is FFT-bin picking, not a CQT.
6. **At least four incompatible FFT implementations** coexist (object-based recursive in `xa-fft.js`, interleaved-Float32Array iterative in `xa-onset.js`, a non-FFT stub in `xa-recurrence.js`, naive O(N²) DFTs in `SpectrumAnalyzer.js`/`xa-bpm-algorithm.js`/`audio-analysis.js`).

The best-fidelity items: `lpc` (correct Burg), `tone`, `clicks`, `to_mono`, `localmax/localmin`, `peak_pick`, `power_to_db`, `fft_frequencies`, and the `normalize` *semantics* (fill/threshold/p-norm rules mirror librosa closely — when the input is a plain JS array).

---

## 2. STFT / ISTFT / FFT (`xa-fft.js` vs `core/spectrum.py`, `core/fft.py`)

### 2.1 `stft` — PARTIAL

| Aspect | librosa (`spectrum.py:55-390`) | pleco (`xa-fft.js:109-145`) | Verdict |
|---|---|---|---|
| Signature | `n_fft=2048, hop_length=win_length//4, win_length=n_fft, window='hann', center=True, pad_mode='constant', dtype, out` | `n_fft=2048, hop_length=512, window='hann', center=true` | No `win_length`, no `pad_mode`, positional args |
| Default hop | `win_length // 4` = 512 | 512 hardcoded | Same for defaults only |
| Window | `get_window(window, win_length, fftbins=True)` → **periodic** Hann `0.5(1-cos(2πn/N))`, padded to `n_fft` via `pad_center` | **symmetric** Hann `0.5(1-cos(2πn/(N-1)))` (`xa-fft.js:246`) | **Numerical divergence at every bin.** Periodic vs symmetric is librosa's documented convention; COLA properties differ too |
| Center padding | `pad_mode='constant'` (zeros) by default since librosa 0.10; reflect optional | always **reflect** (`pad_reflect`) | Matches librosa ≤0.9 behavior, not current default |
| Frame count | `1 + (padded - n_fft)//hop` (block-wise, head/tail optimization) | `floor((padded - n_fft)/hop) + 1` | **Matches** |
| Output layout | `(1 + n_fft//2, n_frames)` freq-major complex ndarray | array of frames, each an array of `{real, imag}` (time-major) | Transposed layout; per-bin object allocation is very slow |
| FFT kernel | `np.fft.rfft` | recursive Cooley-Tukey with per-bin object allocation; auto-pads to next pow-2 | Correct for pow-2 `n_fft`; if `n_fft` not pow-2, spectrum is longer than `n_fft/2+1` expectation |

`pad_reflect` (`xa-fft.js:328-346`): left-side index is `array[Math.min(pad_width - i, array.length - 1)]`. Correct reflect is `array[pad_width - i]`; the `min` clamp only kicks in when `pad_width ≥ len` (in which case numpy-style reflect would bounce, not clamp). Edge case only, but divergent for very short signals.

### 2.2 `istft` — PARTIAL (functionally broken)

The overlap-add skeleton is faithful: full-spectrum reconstruction with conjugate mirroring, window applied on synthesis, **sum-of-squared-window normalization** (`window_sum[i] += win[i]*win[i]`, `xa-fft.js:196`) exactly mirroring librosa's `window_sumsquare` (`spectrum.py:605-624`), and center-padding removal.

**But it inherits the `ifft` bug and therefore produces wrong audio for any real input:**

```js
// xa-fft.js:81-98
export function ifft(spectrum) {
  const conjugated = spectrum.map((bin) => ({ real: bin.real, imag: -bin.imag }))
  const result = fft(conjugated.map((bin) => bin.real))  // <-- imaginary parts DISCARDED
  ...
}
```

`fft()` only accepts real signals, so the conjugate-and-forward-FFT trick collapses to "IFFT of the real part of the spectrum". This is only correct when the spectrum is purely real (zero phase). Consequence: `istft` output ≈ zero-phase resynthesis, not reconstruction. `xa-vocal-separation.js` reconstruction quality is bounded by this. No `length`, `win_length`, or `n_fft`-override parameters either.

Also: `istft` mirrors bins `k=1..D-2` into `n_fft-k`, then has a dead "fill DC/Nyquist" guard at `xa-fft.js:184` (all indices are already covered for `D ≥ 3`).

### 2.3 Other spectrum functions

| librosa | pleco | status | notes |
|---|---|---|---|
| `magphase` | `magnitude()` + `phase()` (`xa-fft.js:285-298`) | partial | Split into two calls; no `power` parameter; no `mag*exp(iφ)` invariant helper |
| `fft_frequencies` | `xa-fft.js:354-360` | **full** | `i*sr/n_fft`, identical to `np.fft.rfftfreq` |
| `_spectrogram` | `spectrogram()` (`xa-fft.js:369-372`) | partial | Magnitude-only; librosa's takes `power` and accepts precomputed `S` |
| `power_to_db` | `xa-mel.js:331-355` (+ private `powerToDb` in `xa-spectral.js:1312`) | **full** (minor) | `10·log10(max(amin,S)/ref)` + `top_db` clamp matches. Librosa also clamps `ref` by `amin` and supports callable `ref`; pleco divides by raw `ref`. Duplicated privately in xa-spectral |
| `amplitude_to_db` | — | **missing** | Trivial to add: `power_to_db(S²)` with `amin²`/`ref²` |
| `db_to_power`, `db_to_amplitude` | — | **missing** | One-liners |
| `phase_vocoder` | `xa-processing.js:160-246` | partial | See below |
| `griffinlim` | — | **missing** | Blocked on the `ifft`/`istft` fix; afterwards it's a ~30-line loop |
| `reassigned_spectrogram`, `iirt`, `fmt`, `pcen`, `perceptual_weighting` | — | **missing** | Long tail |
| `cqt`, `hybrid_cqt`, `pseudo_cqt`, `icqt`, `vqt`, `griffinlim_cqt` | — | **missing** | `xa-chroma.js constant_q_transform` picks single nearest FFT bins per log-spaced frequency from one large FFT — no Q-constant filter bank, no multi-resolution. It is not a CQT and is only used internally for chroma |

**`phase_vocoder` fidelity note** (correcting the prior module-map claim): the `xa-processing.js` implementation *does* unwrap phase (`xa-processing.js:223-224`) and accumulate instantaneous frequency (`:233`), mirroring librosa's structure (`spectrum.py:1365+`). Divergences: `hop_length` hardcoded to 512 (`:163`); expected phase advance computed as `2πk·hop/(n_freq*2)` (`:183`) — the denominator should be `n_fft = (n_freq-1)*2`, so every bin's expected advance is slightly flat (ratio `(n_fft)/(n_fft+2)`), causing progressive phase error; `last_phase` written but never read. **However, both callers (`pitch_shift`, `time_stretch`) are dead on arrival**: they call `require('./librosa-fft.js')` — CommonJS `require` inside an ES module (ReferenceError in browsers) *and* a filename that does not exist (renamed to `xa-fft.js`). A second `phase_vocoder`/`pitch_shift` pair in `xa-advanced.js` is worse: its `simple_stft`/`simple_istft` (`xa-advanced.js:585-610`) are **zero-filled placeholders**, so `xa-advanced.pitch_shift` always returns silence.

### 2.4 Windows (`get_window` family) — PARTIAL

`get_window/hann_window/hamming_window/blackman_window` (`xa-fft.js:222-278`) all use the **symmetric** convention (denominator `n-1`). Librosa uses `scipy.signal.get_window(..., fftbins=True)` → **periodic** (denominator `n`). This is the single most pervasive numerical divergence: every STFT frame, mel spectrogram, and onset envelope shifts slightly relative to librosa. `applyHannWindow` in `audio-utils.js:238-246` repeats the same symmetric formula (third copy; `xa-beat-tracker.js` and `SpectrumAnalyzer.js` inline more).

---

## 3. Audio I/O and signal ops (`xa-audioio.js` vs `core/audio.py`)

### 3.1 `load` — PARTIAL

Pleco `load(url, {sr=22050, mono=true, offset=0, duration=null})` (`xa-audioio.js:28-59`) mirrors librosa's defaults and slicing semantics, returns `{y, sr}` instead of a tuple. Divergences:
- Decoding via `decodeAudioData` (codec support = browser-dependent) vs soundfile/audioread.
- Resampling is naive linear interpolation (below).
- **Non-mono path is broken in shape**: `Float32Array.from(chans.flat())` concatenates channels end-to-end (`:48`) — librosa returns `(n_channels, n)`; downstream code expecting either interleaved or 2-D data gets neither.
- **Module-level hazard**: `import { fft, ifft } from 'src/core/xa-fft.js'` (`:7`) is a bare, non-relative specifier pointing at a file that does not exist — the import is also *unused*. Outside a bundler alias this kills the whole module at load time.
- Caches into module singletons (`currentAudioBuffer`) — not instance-safe.

`stream` — **missing** entirely (no chunked/block processing anywhere).

### 3.2 `resample` — PARTIAL

Pleco (`xa-audioio.js:118-132`) is pure linear interpolation. Librosa defaults to `soxr_hq` band-limited sinc and offers polyphase/FFT/kaiser modes; even librosa's own `linear` mode is documented as aliasing-prone. Pleco's output length `ceil(n·ratio)` matches librosa's `fix=True` length. No `res_type`, `scale`, or `axis`. **Every downsample aliases.** This also degrades `load(sr=22050)` on 44.1k sources — the most common path.

### 3.3 Analysis / synthesis functions

| librosa | pleco (`xa-audioio.js`) | status | fidelity notes |
|---|---|---|---|
| `to_mono` | `toMono` (:105) | **full** | mean across channels, identical semantics |
| `get_duration` | `getDuration` (:134) | partial | `y.length/sr` only; librosa also supports `S`/`n_fft`/`hop_length`/`center` and file paths |
| `get_samplerate` | `getSamplerate` (:135) | partial | reads `AudioBuffer.sampleRate`; librosa reads file headers |
| `autocorrelate` | `autocorrelate` (:161) | partial | Values identical (unnormalized, bounded lag) but O(N·M) time-domain vs librosa's FFT method (`audio.py:911-942`); no `axis`. Two more divergent copies exist: `xa-processing.js:307` (same math) and `xa-advanced.js` (inconsistent normalization between its small/large branches) |
| `lpc` | `lpc` (:174) | **full** | Genuine Burg's method; `a[0]=1`, `order+1` coefficients, float64 accumulators. Recomputes `den` per order rather than librosa's recursive update — numerically fine. No multi-axis |
| `zero_crossings` | `zeroCrossings` (:141) | partial | threshold-clip + sign-compare + `pad` matches; missing `ref_magnitude` and `axis` |
| `clicks` | `clicks` (:249) | **full** | `2^(-10i/N)·sin(ωi)` matches librosa's `logspace(0,-10,base=2)` envelope (`audio.py:1389-1391`) modulo an off-by-one in the decay denominator (`i/cLen` vs `i/(N-1)`); same defaults (1 kHz, 100 ms) |
| `tone` | `tone` (:210) | **full** | `cos(2πft + φ)`, `φ=-π/2` default — identical |
| `chirp` | `chirp` (:224) | partial — **MATH BUG** | Librosa delegates to `scipy.signal.chirp`, whose phase is the *integral* of instantaneous frequency. Pleco computes `cos(2π·k(t)·t + φ)` where `k(t)` is the instantaneous frequency (`:239-244`). d/dt[k(t)·t] = k(t) + t·k'(t), so a linear chirp sweeps at ~2× the requested rate (instantaneous freq ends near `2·fmax − fmin`); exponential mode is similarly wrong |
| `mu_compress` | `muCompress` (:283) | partial | Compression formula exact. Quantizer differs: librosa `digitize(x, linspace(-1,1,mu+1), right=True) − (mu+1)//2` → range `[-128,127]` for mu=255; pleco `round(x_comp·mu/2)` → range `[-128,128]` with different bin edges |
| `mu_expand` | `muExpand` (:300) | partial — **MATH BUG** | Librosa dequantizes with `x·2/(1+mu)` (`audio.py:1781`); pleco uses `v·2/mu` (`:307`). Off by factor `(1+mu)/mu` — inputs at full scale (±mu/2 → ±(1+mu)/mu > 1) **throw RangeError**, and every expanded value is biased |
| `yin`, `pyin`, `piptrack`, `estimate_tuning`, `pitch_tuning` | — | **missing** | `monophonic_pitch_detect` (`xa-processing.js:257`, duplicated in `xa-advanced.js`) is a plain autocorrelation-peak picker — a loose cousin, no CMND (yin), no probabilistic tracking |

### 3.4 Frame/time/frequency conversion (`core/convert.py`) — MISSING

None of `frames_to_time`, `frames_to_samples`, `samples_to_time`, `time_to_frames`, `samples_like`, `times_like`, `note_to_hz`, `midi_to_hz`, `hz_to_note`, `hz_to_octs`, A/B/C/D/Z weighting, key/svara helpers exist as public utilities. The only sighting is a private `framesToTime(frames, hopLength=512, sr=22050)` in `xa-recurrence.js:307` (formula correct). These are one-liners with high downstream value — most pleco modules hand-roll `* hop / sr` conversions inline.

`hz_to_mel`/`mel_to_hz` (`xa-mel.js`) exist but implement **HTK only** (`2595·log10(1+f/700)`); librosa defaults to Slaney (`htk=False`), so pleco mel filterbanks and `mel_frequencies` are numerically incompatible with librosa defaults. → partial.

`interval_frequencies` / `pythagorean_intervals` / `plimit_intervals` → `xa-intervals.js` (IntervalConstructor): present, options-object API, well-tempered sets implemented but unreachable through the dispatch switch. → partial (not deeply audited here; see util domain).

---

## 4. `librosa.util` (`xa-util.js` vs `util/utils.py`)

### 4.1 The typed-array problem (systemic)

`getShape()` (`xa-util.js:519-527`) and `flatten()` (`:529-532`) only recognize `Array.isArray`. Consequences, verified by code trace:

- **`frame(new Float32Array(...), {...})` silently returns `[]`**: shape is `[]`, `ndim=0`, the too-short check compares `undefined < frameLength` (false), `nFrames` is `NaN`, the loop never runs. No error, empty output.
- **`validAudio(new Float32Array([...]))` throws** for any typed array with length > 1: `flatten` wraps the whole typed array as one element, `isFinite(Float32Array)` coerces to `NaN` → `ParameterError('Audio buffer is not finite everywhere')`.
- **`normalize` throws the same way** (`:259-261` finiteness check) before ever reaching its (otherwise faithful) norm logic.

Since `Float32Array` is what `AudioBuffer.getChannelData()` returns, the librosa-util port fails on the platform's canonical audio type. Only plain JS arrays work.

### 4.2 Function table

| librosa | pleco (`xa-util.js`) | status | notes |
|---|---|---|---|
| `frame` | `frame` (:57) | partial | Copies slices instead of strided views (acceptable in JS); 1-D plain arrays only; **typed arrays → `[]` bug**; `axis` mostly unimplemented |
| `valid_audio` | `validAudio` (:105) | partial | **Throws on typed arrays** (above); also wrapped in `cache()` that `JSON.stringify`s the entire audio buffer as a cache key |
| `valid_int` | `validInt` (:136) | full | double-floor is harmless |
| `is_positive_int` | `isPositiveInt` (:148) | full | |
| `pad_center` | `padCenter` (:162) | partial | 1-D only; reflect-mode left index `arr[min(leftPad-i, len-1)]` diverges from numpy reflect when pad ≥ len (same flaw as `xa-fft pad_reflect`) |
| `fix_length` | `fixLength` (:202) | partial | 1-D only; trim/pad semantics match |
| `normalize` | `normalize` (:244) | partial | Semantics are the most faithful in the file: `norm ∈ {inf,-inf,0,p}`, `threshold=tiny(S)` default, `fill ∈ {null,true,false}` incl. `fillNorm = n^(-1/p)` — all match librosa (`utils.py:792+`). Broken by: typed-array throw; `cache(40)` memoizing on `JSON.stringify` of full matrices (perf/memory hazard, stale-reference retention); `tiny` divergence (below) |
| `localmax` / `localmin` | (:296/:338) | **full** | `x[n] > x[n-1] && x[n] >= x[n+1]`, first-element False, last-element compares to previous — matches librosa stencils |
| `peak_pick` | `peakPick` (:386) | **full** | Same three conditions (window max, mean+delta, wait), same parameter set incl. `sparse=true`; missing `axis`; `Math.max(...slice)` spread risks stack overflow for huge `pre/post` windows |
| `tiny` | `tiny` (:450) | partial | Returns `Number.EPSILON` (2.2e-16). Librosa returns `np.finfo(dtype).tiny` — smallest *normal* (1.18e-38 f32 / 2.2e-308 f64). ~22 orders of magnitude apart for f64; changes `normalize`'s silent-frame handling threshold |
| `abs2` | `abs2` (:461) | **full** | complex objects, arrays, scalars |
| `phasor` | `phasor` (:480) | **full** | incl. `mag` scaling |
| `MAX_MEM_BLOCK` | (:8) | full | 2⁸·2¹⁰ = 262144, same value (irrelevant in JS but faithful) |
| `softmask` | — | **missing** | `hpss` in `xa-processing.js:21-47` inlines its own power-mask math instead |
| `sync`, `fix_frames`, `expand_to`, `stack`, `axis_sort`, `shear`, `sparsify_rows`, `fill_off_diagonal`, `buf_to_float`, `nnls`, `cyclic_gradient`, `dtype_r2c/c2r`, `count_unique`, `is_unique`, `index_to_slice` | — | **missing** | Long tail; `sync` and `softmask` are the two with real downstream demand |
| `match_intervals` / `match_events` | `xa-matching.js` | partial | Present with Jaccard/binary-search structure; module map flags Uint32Array `.map` truncating fractional times (typed-array map preserves element type — a real JS footgun); not re-verified line-by-line in this pass |
| `example` / `ex` / `list_examples` / `example_info` | `xa-file.js:193-350` | partial | Registry of librosa.org example files, LRU byte+AudioBuffer cache; browser-only fetch |
| `find_files`, `cite` | — | missing | N/A in browser context |

---

## 5. WAV encoding / export (pleco-unique, no current librosa counterpart)

Three near-duplicate encoders, two with correctness bugs:

1. **`xa-wav-encoder.js encodeWAV`** — `numChannels` parameter adjusts header fields (blockAlign, byteRate) but samples are written as-is: passing `numChannels=2` with a mono/flat array produces a **corrupt WAV** (header/data disagreement). Symmetric clip to `0x7FFF` (librosa-adjacent convention uses `0x8000` for negatives). `createAudioBlob` silently exports channel 0 only. Duplicated at `public/scripts/xa-wav-encoder.js`.
2. **`audio-utils.js exportBufferAsWav`** (`:64-108`) — **confirmed stereo bug**: PCM loop writes all of channel 0, then all of channel 1 (block layout, `:94-105`) while the header declares standard interleaved PCM. Stereo exports are garbled (each channel plays at 2× speed sequentially in most decoders). Asymmetric scaling (`0x8000`/`0x7FFF`) is the more standard convention here.
3. **`xa-file.js _encodeWAV`** (`:482+`) — mono-only private duplicate.

---

## 6. Duplication inventory (core-dsp)

| Capability | Implementations |
|---|---|
| FFT | `xa-fft.js` (recursive, `{real,imag}` objects), `xa-onset.js fft` (iterative, interleaved Float32Array — the fastest and best), `xa-recurrence.js computeFFT` (stub: returns time-domain samples as "spectrum"), naive O(N²) DFTs in `SpectrumAnalyzer.js` (×3 file copies), `xa-bpm-algorithm.js`, `audio-analysis.js` |
| STFT framing | `xa-fft.js stft`, `xa-onset.js computeSTFT`, `xa-chroma.js` private, `xa-beat-tracker.js`, `xa-advanced.js simple_stft` (zero stub) |
| Hann window | `xa-fft.js`, `audio-utils.js applyHannWindow`, inline in `SpectrumAnalyzer.js`, `xa-beat-tracker.js` (all symmetric) |
| autocorrelate | `xa-audioio.js`, `xa-processing.js`, `xa-advanced.js` (inconsistent scaling) |
| phase_vocoder / pitch_shift | `xa-processing.js` (dead imports), `xa-advanced.js` (returns silence) |
| power_to_db | `xa-mel.js` (public), `xa-spectral.js` (private) |
| WAV encode | `xa-wav-encoder.js`, `audio-utils.js`, `xa-file.js` |
| linspace | `xa-util.js`, `xa-mel.js`, `xa-advanced.js` |
| resample (linear) | `xa-audioio.js`, `compression.js pitchBasedCompress`, `live-speed-control.js` |

---

## 7. Consolidation & fix recommendations (priority order)

1. **Fix `ifft` for complex input** (`xa-fft.js:91`) — e.g., swap-real/imag trick: `ifft(X) = swap(fft(swap(X)))/N`, requiring `fft` to accept complex input, or implement a dedicated inverse butterfly. Add a round-trip test `maxAbs(istft(stft(y)) − y) < 1e-6` (librosa achieves ~9e-8). This unblocks vocal separation quality and makes `griffinlim` a ~30-line add.
2. **Adopt periodic windows** (denominator `n`, matching `fftbins=True`) in `get_window`/`hann_window`/etc., and add `win_length` + `pad_mode` (default `'constant'`) to `stft` to match librosa ≥0.10 numerics.
3. **Make `xa-util.js` typed-array-safe**: teach `getShape`/`flatten`/`isFinite` checks about TypedArrays (loop-based finiteness), and delete the `JSON.stringify`-keyed `cache()` wrappers around `validAudio`/`normalize`. Right now `frame()` returns `[]` and `validAudio`/`normalize` throw on `Float32Array` — the platform's audio type.
4. **Consolidate to one FFT**: promote the interleaved-Float32Array iterative FFT (xa-onset style) into a single core module with `fft/ifft/rfft/irfft`, port `stft/istft` onto it, and delete the object-based recursive version, the `xa-recurrence` stub, and the naive DFTs. Fix the phantom imports at the same time (`xa-audioio.js` unused `'src/core/xa-fft.js'`; `require('./librosa-fft.js')` in `xa-processing.js`/`xa-mel.js`/`xa-features.js` → ESM import of the real module).
5. **Fix the three signal-math bugs**: `chirp` phase (integrate instantaneous frequency: linear `2π(f₀t + (f₁−f₀)t²/2T)`, log `2π f₀T/ln(f₁/f₀)·((f₁/f₀)^{t/T}−1)`); `muExpand` dequantize `2/(1+mu)`; align `muCompress` quantizer with digitize semantics. Delete `xa-advanced.js pitch_shift`/`simple_stft` (currently ships silence as a public export).
6. **Add the cheap high-value missing functions**: `amplitude_to_db`, `db_to_power`, `db_to_amplitude`, and the `frames_to_time`/`frames_to_samples`/`samples_to_time`/`time_to_frames` family (all one-liners; many modules hand-roll them today). Add a Slaney option (`htk=false` default) to `hz_to_mel`/`mel_to_hz` for librosa-default mel compatibility.
7. **Merge the three WAV encoders** into one with correct interleaved multi-channel writing; fix `exportBufferAsWav`'s channel-block layout and `encodeWAV`'s numChannels header/data mismatch.
8. **Upgrade `resample`** at least to windowed-sinc or polyphase (or document the aliasing loudly); linear interpolation silently degrades every `load(sr=...)` conversion, which feeds all analysis.

---

## 8. Full parity table

Status legend: **full** = present and algorithmically faithful · **partial** = present but simplified/divergent · **missing** = no equivalent · **extra** = pleco-unique.

| librosa fn | pleco file | status | key notes |
|---|---|---|---|
| stft | src/scripts/xa-fft.js | partial | symmetric window, reflect-only pad, no win_length |
| istft | src/scripts/xa-fft.js | partial | broken via ifft; window² normalization otherwise faithful |
| (fft backend) rfft/irfft | src/scripts/xa-fft.js | partial | ifft discards imag; 4+ duplicate FFTs repo-wide |
| magphase | src/scripts/xa-fft.js | partial | split magnitude()/phase(), no power param |
| fft_frequencies | src/scripts/xa-fft.js | full | |
| power_to_db | src/scripts/xa-mel.js | full | minor amin-on-ref edge; private duplicate in xa-spectral |
| amplitude_to_db, db_to_power, db_to_amplitude | — | missing | one-liners |
| griffinlim (+ _cqt) | — | missing | blocked on istft fix |
| phase_vocoder | src/scripts/xa-processing.js | partial | unwrapping OK; hardcoded hop, wrong advance denom; callers dead (bad require) |
| cqt / vqt / icqt / hybrid / pseudo | — | missing | xa-chroma "CQT" is bin-picking |
| reassigned_spectrogram, iirt, fmt, pcen, perceptual_weighting | — | missing | |
| load | src/scripts/xa-audioio.js | partial | WebAudio decode, linear resample, broken stereo shape, phantom import |
| stream | — | missing | |
| to_mono | src/scripts/xa-audioio.js | full | |
| resample | src/scripts/xa-audioio.js | partial | linear only, aliases |
| get_duration / get_samplerate | src/scripts/xa-audioio.js | partial | narrow signatures |
| autocorrelate | src/scripts/xa-audioio.js | partial | O(N²) but value-equivalent; 3 copies |
| lpc | src/scripts/xa-audioio.js | full | Burg's method |
| zero_crossings | src/scripts/xa-audioio.js | partial | no ref_magnitude/axis |
| clicks / tone | src/scripts/xa-audioio.js | full | |
| chirp | src/scripts/xa-audioio.js | partial | wrong phase integral (2× sweep) |
| mu_compress | src/scripts/xa-audioio.js | partial | quantizer differs |
| mu_expand | src/scripts/xa-audioio.js | partial | 2/mu vs 2/(1+mu) bug |
| yin / pyin / piptrack / estimate_tuning | — | missing | loose cousin monophonic_pitch_detect |
| frames_to_time family (convert.py) | — | missing | private helper in xa-recurrence only |
| hz_to_mel / mel_to_hz / mel_frequencies | src/scripts/xa-mel.js | partial | HTK-only, librosa default is Slaney |
| note/midi/hz/key/svara/weighting conversions | — | missing | |
| interval_frequencies / pythagorean / plimit | src/scripts/xa-intervals.js | partial | well-tempered unreachable |
| util.frame | src/scripts/xa-util.js | partial | Float32Array → [] silently |
| util.valid_audio | src/scripts/xa-util.js | partial | throws on typed arrays |
| util.pad_center / fix_length | src/scripts/xa-util.js | partial | 1-D only |
| util.normalize | src/scripts/xa-util.js | partial | faithful semantics; typed-array throw; stringify cache |
| util.localmax / localmin | src/scripts/xa-util.js | full | |
| util.peak_pick | src/scripts/xa-util.js | full | no axis; spread stack risk |
| util.tiny | src/scripts/xa-util.js | partial | EPSILON vs finfo.tiny |
| util.abs2 / phasor / valid_int / is_positive_int | src/scripts/xa-util.js | full | |
| util.softmask | — | missing | hpss inlines masks |
| util.sync, fix_frames, expand_to, stack, shear, sparsify_rows, buf_to_float, nnls, etc. | — | missing | |
| util.match_intervals / match_events | src/scripts/xa-matching.js | partial | Uint32Array truncation hazard |
| util.example / ex / list_examples / example_info | src/scripts/xa-file.js | partial | librosa.org registry + cache |
| encodeWAV / createAudioBlob | src/scripts/xa-wav-encoder.js | extra | numChannels header/data mismatch |
| exportBufferAsWav (+ misc buffer utils) | src/scripts/audio-utils.js | extra | stereo channel-block bug confirmed |
| play / stop / initAudioProcessor / loadAudioFile | src/scripts/xa-audioio.js, xa-audio-core.js | extra | playback layer, no librosa analog |
| get_window / hann / hamming / blackman | src/scripts/xa-fft.js | partial | symmetric vs librosa periodic (fftbins=True) |
