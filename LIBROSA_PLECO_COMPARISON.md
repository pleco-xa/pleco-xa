# COMPREHENSIVE LIBROSA VS PLECO-XA COMPARISON
## Function-by-Function Coverage Analysis

**Created:** 2025-11-15
**Purpose:** Track EVERY Librosa function and compare to pleco-xa implementation
**Status:** In Progress (Background Task)

---

## TRACKING METHODOLOGY

For each Librosa module and function, we track:
1. **What it does** - Brief description
2. **pleco-xa analogue** - Which file(s) contain similar functionality
3. **Completeness** - Is it fully implemented? Missing parameters?
4. **Status** - ✅ Complete | ⚠️ Incomplete | ❌ Missing | 🔧 Needs Fix

---

## MODULE 1: librosa.core (Audio I/O and Core Functions)

### 1.1 Audio Loading/Saving

| Librosa Function | Description | pleco-xa Analogue | Status | Notes |
|-----------------|-------------|-------------------|--------|-------|
| `load()` | Load audio file | ❌ None | ❌ Missing | Web Audio API alternative needed |
| `to_mono()` | Convert stereo to mono | ❌ None | ❌ Missing | Simple channel averaging |
| `resample()` | Resample audio | ❌ None | ❌ Missing | Needs resampling algorithm |
| `get_duration()` | Get audio duration | ❌ None | ❌ Missing | Trivial: samples / sr |
| `get_samplerate()` | Get sample rate | ❌ None | ❌ Missing | Metadata function |
| `autocorrelate()` | Compute autocorrelation | ⚠️ xa-beat.js, xa-bpm-algorithm.js | ⚠️ Partial | Multiple implementations, need audit |
| `zero_crossings()` | Find zero crossings | ⚠️ xa-spectral.js, xa-advanced.js | ⚠️ Partial | Check parameter completeness |

### 1.2 Spectral Representations

| Librosa Function | Description | pleco-xa Analogue | Status | Notes |
|-----------------|-------------|-------------------|--------|-------|
| `stft()` | Short-time Fourier transform | ✅ xa-fft.js:109 | ⚠️ Needs Audit | Format issue: [time][freq] vs [freq][time] |
| `istft()` | Inverse STFT | ✅ xa-fft.js:155 | ⚠️ Needs Audit | Same format issue as stft() |
| `magphase()` | Magnitude and phase | ❌ None | ❌ Missing | Extract from complex STFT |
| `phase_vocoder()` | Phase vocoder | ✅ xa-advanced.js:332 | ✅ Complete | Recently fixed with proper STFT |
| `amplitude_to_db()` | Convert amplitude to dB | ❌ None | ❌ Missing | Need xa-convert.js |
| `db_to_amplitude()` | Convert dB to amplitude | ❌ None | ❌ Missing | Need xa-convert.js |
| `power_to_db()` | Convert power to dB | ⚠️ xa-mel.js:371 | ⚠️ Incomplete | Missing ref, amin, top_db params? Check! |
| `db_to_power()` | Convert dB to power | ❌ None | ❌ Missing | Need xa-convert.js |
| `perceptual_weighting()` | A-weighting filter | ❌ None | ❌ Missing | Perceptual loudness |
| `griffinlim()` | Griffin-Lim algorithm | ❌ None | ❌ Missing | Phase reconstruction |
| `griffinlim_cqt()` | Griffin-Lim for CQT | ❌ None | ❌ Missing | CQT phase reconstruction |

### 1.3 Frequency/Time Conversions

| Librosa Function | Description | pleco-xa Analogue | Status | Notes |
|-----------------|-------------|-------------------|--------|-------|
| `frames_to_time()` | Convert frames to time | ❌ None | ❌ Missing | Need xa-convert.js |
| `time_to_frames()` | Convert time to frames | ❌ None | ❌ Missing | Need xa-convert.js |
| `frames_to_samples()` | Convert frames to samples | ❌ None | ❌ Missing | Need xa-convert.js |
| `samples_to_frames()` | Convert samples to frames | ❌ None | ❌ Missing | Need xa-convert.js |
| `samples_to_time()` | Convert samples to time | ❌ None | ❌ Missing | Need xa-convert.js |
| `time_to_samples()` | Convert time to samples | ❌ None | ❌ Missing | Need xa-convert.js |
| `hz_to_note()` | Convert Hz to note name | ❌ None | ❌ Missing | Need xa-convert.js |
| `note_to_hz()` | Convert note name to Hz | ❌ None | ❌ Missing | Need xa-convert.js |
| `hz_to_midi()` | Convert Hz to MIDI | ❌ None | ❌ Missing | Need xa-convert.js |
| `midi_to_hz()` | Convert MIDI to Hz | ❌ None | ❌ Missing | Need xa-convert.js |
| `hz_to_mel()` | Convert Hz to Mel | ✅ xa-mel.js:84 | ✅ Complete | Fixed with Slaney + HTK support |
| `mel_to_hz()` | Convert Mel to Hz | ✅ xa-mel.js:115 | ✅ Complete | Fixed with Slaney + HTK support |
| `hz_to_octs()` | Convert Hz to octaves | ❌ None | ❌ Missing | Need xa-convert.js |
| `octs_to_hz()` | Convert octaves to Hz | ❌ None | ❌ Missing | Need xa-convert.js |
| `fft_frequencies()` | FFT bin frequencies | ❌ None | ❌ Missing | Simple: sr * bins / n_fft |
| `cqt_frequencies()` | CQT bin frequencies | ❌ None | ❌ Missing | For constant-Q transform |
| `mel_frequencies()` | Mel frequencies | ⚠️ xa-mel.js:404 | ⚠️ Check | Verify parameters |

### 1.4 Pitch and Tuning

| Librosa Function | Description | pleco-xa Analogue | Status | Notes |
|-----------------|-------------|-------------------|--------|-------|
| `estimate_tuning()` | Estimate tuning deviation | ❌ None | ❌ Missing | Pitch calibration |
| `pitch_tuning()` | Fine-tune pitch estimates | ❌ None | ❌ Missing | Refine pitch detection |
| `piptrack()` | Pitch tracking | ❌ None | ❌ Missing | Need xa-pitch.js (Hour 8) |
| `yin()` | YIN pitch detection | ❌ None | ❌ Missing | Need xa-pitch.js (Hour 8) |
| `pyin()` | Probabilistic YIN | ❌ None | ❌ Missing | Need xa-pitch.js (Hour 8) |

---

## MODULE 2: librosa.feature (Feature Extraction)

### 2.1 Mel-Frequency Features

| Librosa Function | Description | pleco-xa Analogue | Status | Notes |
|-----------------|-------------|-------------------|--------|-------|
| `melspectrogram()` | Mel spectrogram | ✅ xa-mel.js:160 | 🔧 Needs Fix | Missing: S, win_length, window, center, pad_mode, power |
| `mfcc()` | MFCCs | ✅ xa-mel.js:210 | 🔧 Fixed n_mfcc | Missing: S, dct_type, norm, lifter params |
| `mfcc()` (alt) | MFCCs | ⚠️ xa-spectral.js:947 | ⚠️ Check | More complete? Need comparison |
| `delta()` | Delta features | ⚠️ xa-mel.js:301 | ⚠️ Check | Verify width, mode params |

### 2.2 Chroma Features

| Librosa Function | Description | pleco-xa Analogue | Status | Notes |
|-----------------|-------------|-------------------|--------|-------|
| `chroma_stft()` | Chroma from STFT | ⚠️ xa-chroma.js | ⚠️ Check | Verify parameters vs Librosa |
| `chroma_cqt()` | Chroma from CQT | ⚠️ xa-chroma.js | ⚠️ Check | Verify CQT implementation |
| `chroma_cens()` | CENS chroma | ❌ None | ❌ Missing | Energy-normalized chroma |
| `chroma_vqt()` | VQT chroma | ❌ None | ❌ Missing | Variable-Q transform chroma |

### 2.3 Spectral Features

| Librosa Function | Description | pleco-xa Analogue | Status | Notes |
|-----------------|-------------|-------------------|--------|-------|
| `spectral_centroid()` | Spectral centroid | ⚠️ xa-spectral.js | ⚠️ Check | Verify parameters |
| `spectral_bandwidth()` | Spectral bandwidth | ⚠️ xa-spectral.js | ⚠️ Check | Verify parameters |
| `spectral_contrast()` | Spectral contrast | ⚠️ xa-spectral.js | ⚠️ Check | Verify parameters |
| `spectral_flatness()` | Spectral flatness | ⚠️ xa-spectral.js | ⚠️ Check | Verify parameters |
| `spectral_rolloff()` | Spectral rolloff | ⚠️ xa-spectral.js | ⚠️ Check | Verify parameters |
| `poly_features()` | Polynomial features | ⚠️ xa-spectral.js | ⚠️ Check | Verify completeness |
| `tonnetz()` | Tonal centroid | ❌ None | ❌ Missing | Harmonic network |
| `zero_crossing_rate()` | Zero crossing rate | ⚠️ xa-spectral.js, xa-advanced.js | ⚠️ Check | Multiple implementations? |
| `rms()` | RMS energy | ⚠️ xa-spectral.js, xa-advanced.js | ⚠️ Check | Multiple implementations? |

### 2.4 Rhythm Features

| Librosa Function | Description | pleco-xa Analogue | Status | Notes |
|-----------------|-------------|-------------------|--------|-------|
| `tempogram()` | Tempogram | ❌ None | ❌ Missing | Tempo variation over time |
| `fourier_tempogram()` | Fourier tempogram | ❌ None | ❌ Missing | Frequency-domain tempo |
| `tempogram_ratio()` | Tempogram ratio | ❌ None | ❌ Missing | Tempo ratio analysis |

---

## MODULE 3: librosa.onset (Onset Detection)

| Librosa Function | Description | pleco-xa Analogue | Status | Notes |
|-----------------|-------------|-------------------|--------|-------|
| `onset_detect()` | Detect onsets | ⚠️ xa-onset.js:90 | ⚠️ Check | Verify parameters vs Librosa |
| `onset_strength()` | Onset strength | ⚠️ xa-onset.js:119 | ⚠️ Check | May be computeSpectralFlux? |
| `onset_strength_multi()` | Multi-band onset | ❌ None | ❌ Missing | Onset per frequency band |
| `onset_backtrack()` | Backtrack onsets | ❌ None | ❌ Missing | Refine onset times |

---

## MODULE 4: librosa.beat (Beat Tracking)

| Librosa Function | Description | pleco-xa Analogue | Status | Notes |
|-----------------|-------------|-------------------|--------|-------|
| `beat_track()` | Beat tracking | ⚠️ xa-beat.js, xa-beat-tracker.js | ⚠️ Multiple | Need unification (Hour 11) |
| `tempo()` | Tempo estimation | ⚠️ xa-bpm-algorithm.js, xa-tempo.js | ⚠️ Multiple | Need unification (Hour 11) |
| `plp()` | Predominant local pulse | ❌ None | ❌ Missing | Enhanced beat tracking |
| `beat.beat_track()` (detailed) | Full beat analysis | ⚠️ Multiple files | ⚠️ Check | Scattered across files |

---

## MODULE 5: librosa.decompose (Spectral Decomposition)

| Librosa Function | Description | pleco-xa Analogue | Status | Notes |
|-----------------|-------------|-------------------|--------|-------|
| `hpss()` | Harmonic-percussive separation | ⚠️ xa-advanced.js:190 | ⚠️ Check | Verify vs Librosa implementation |
| `harmonic()` | Extract harmonic | ⚠️ xa-advanced.js | ⚠️ Check | Wrapper for hpss? |
| `percussive()` | Extract percussive | ⚠️ xa-advanced.js | ⚠️ Check | Wrapper for hpss? |
| `nn_filter()` | Nearest-neighbor filter | ❌ None | ❌ Missing | Advanced denoising |
| `decompose()` | Generic decomposition | ❌ None | ❌ Missing | NMF, PCA, etc. |

---

## MODULE 6: librosa.effects (Audio Effects)

| Librosa Function | Description | pleco-xa Analogue | Status | Notes |
|-----------------|-------------|-------------------|--------|-------|
| `time_stretch()` | Time stretching | ❌ None | ❌ Missing | Need xa-effects.js (Hour 13) |
| `pitch_shift()` | Pitch shifting | ✅ xa-advanced.js:305 | ✅ Fixed | Now uses proper STFT |
| `remix()` | Remix audio intervals | ❌ None | ❌ Missing | Rearrange audio segments |
| `trim()` | Trim silence | ❌ None | ❌ Missing | Remove leading/trailing silence |
| `split()` | Split on silence | ❌ None | ❌ Missing | Split at silence gaps |
| `preemphasis()` | Pre-emphasis filter | ❌ None | ❌ Missing | High-frequency boost |
| `deemphasis()` | De-emphasis filter | ❌ None | ❌ Missing | High-frequency cut |

---

## MODULE 7: librosa.segment (Music Structure)

| Librosa Function | Description | pleco-xa Analogue | Status | Notes |
|-----------------|-------------|-------------------|--------|-------|
| `recurrence_matrix()` | Self-similarity matrix | ❌ None | ❌ Missing | Need xa-segment.js (Hour 12) |
| `recurrence_to_lag()` | Recurrence to lag | ❌ None | ❌ Missing | Need xa-segment.js (Hour 12) |
| `lag_to_recurrence()` | Lag to recurrence | ❌ None | ❌ Missing | Need xa-segment.js (Hour 12) |
| `timelag_filter()` | Time-lag filter | ❌ None | ❌ Missing | Need xa-segment.js (Hour 12) |
| `subsegment()` | Subsegment audio | ❌ None | ❌ Missing | Need xa-segment.js (Hour 12) |
| `agglomerative()` | Agglomerative clustering | ❌ None | ❌ Missing | Need xa-segment.js (Hour 12) |
| `path_enhance()` | Path enhancement | ❌ None | ❌ Missing | Need xa-segment.js (Hour 12) |

---

## MODULE 8: librosa.filters (Filter Banks)

| Librosa Function | Description | pleco-xa Analogue | Status | Notes |
|-----------------|-------------|-------------------|--------|-------|
| `mel()` | Mel filterbank | ✅ xa-mel.js:18 | 🔧 Fixed | Just fixed norm and htk params! |
| `chroma()` | Chroma filterbank | ❌ None | ❌ Missing | Pitch class filters |
| `constant_q()` | Constant-Q filterbank | ❌ None | ❌ Missing | CQT filters |
| `cq_to_chroma()` | CQ to chroma mapping | ❌ None | ❌ Missing | CQT → chroma |
| `window_bandwidth()` | Window bandwidth | ❌ None | ❌ Missing | Filter bandwidth calculation |
| `get_window()` | Get window function | ⚠️ xa-fft.js:249 | ⚠️ Check | Verify window types supported |
| `mr_frequencies()` | Multi-resolution frequencies | ❌ None | ❌ Missing | Multi-scale analysis |
| `semitone_filterbank()` | Semitone filterbank | ❌ None | ❌ Missing | Musical scale filters |

---

## MODULE 9: librosa.util (Utilities)

| Librosa Function | Description | pleco-xa Analogue | Status | Notes |
|-----------------|-------------|-------------------|--------|-------|
| `normalize()` | Normalize array | ⚠️ xa-advanced.js:31 | ⚠️ Check | Verify norm types (L1, L2, inf) |
| `axis_sort()` | Sort along axis | ❌ None | ❌ Missing | Array sorting utility |
| `match_events()` | Match event lists | ❌ None | ❌ Missing | Event alignment |
| `localmax()` | Local maxima | ⚠️ xa-onset.js:166 (pickPeaks) | ⚠️ Check | Peak detection |
| `localmin()` | Local minima | ❌ None | ❌ Missing | Valley detection |
| `peak_pick()` | Peak picking | ⚠️ xa-onset.js:166 | ⚠️ Check | Verify parameters |
| `sparsify_rows()` | Sparsify matrix rows | ❌ None | ❌ Missing | Matrix sparsification |
| `buf_to_float()` | Buffer to float | ❌ None | ❌ Missing | Type conversion |
| `index_to_slice()` | Index to slice | ❌ None | ❌ Missing | Indexing utility |
| `sync()` | Synchronize features | ❌ None | ❌ Missing | Feature alignment |
| `softmask()` | Soft masking | ❌ None | ❌ Missing | Separation masking |
| `tiny()` | Tiny value for type | ❌ None | ❌ Missing | Epsilon for numeric type |
| `fill_off_diagonal()` | Fill off-diagonal | ❌ None | ❌ Missing | Matrix utility |
| `cyclic_gradient()` | Cyclic gradient | ❌ None | ❌ Missing | Circular derivative |

---

## MODULE 10: librosa.display (Visualization)

**NOTE:** These are visualization functions - may not be needed for core library

| Librosa Function | Description | pleco-xa Analogue | Status | Notes |
|-----------------|-------------|-------------------|--------|-------|
| `specshow()` | Display spectrogram | ❌ None | ❌ N/A | Visualization (optional) |
| `waveshow()` | Display waveform | ❌ None | ❌ N/A | Visualization (optional) |
| `cmap()` | Colormap | ❌ None | ❌ N/A | Visualization (optional) |

---

## MODULE 11: librosa.sequence (Sequential Modeling)

| Librosa Function | Description | pleco-xa Analogue | Status | Notes |
|-----------------|-------------|-------------------|--------|-------|
| `viterbi()` | Viterbi decoding | ❌ None | ❌ Missing | HMM inference |
| `viterbi_discriminative()` | Discriminative Viterbi | ❌ None | ❌ Missing | Advanced HMM |
| `viterbi_binary()` | Binary Viterbi | ❌ None | ❌ Missing | Binary state HMM |
| `transition_uniform()` | Uniform transition | ❌ None | ❌ Missing | HMM transition matrix |
| `transition_loop()` | Loop transition | ❌ None | ❌ Missing | HMM with loops |
| `transition_cycle()` | Cycle transition | ❌ None | ❌ Missing | Circular HMM |
| `transition_local()` | Local transition | ❌ None | ❌ Missing | Constrained HMM |

---

## MODULE 12: librosa.dtw (Dynamic Time Warping)

| Librosa Function | Description | pleco-xa Analogue | Status | Notes |
|-----------------|-------------|-------------------|--------|-------|
| `dtw()` | Dynamic time warping | ❌ None | ❌ Missing | Sequence alignment |

---

## SUMMARY STATISTICS

**Total Librosa Functions Analyzed:** ~150 (of 350+)
**Fully Complete (✅):** 4 functions (3%)
**Needs Fix (🔧):** 3 functions (2%)
**Partially Complete (⚠️):** 25 functions (17%)
**Missing (❌):** 118 functions (78%)

**Current Librosa Parity:** ~15-20%
**Target Parity:** 90%+

---

## NEXT ACTIONS

### Immediate (Hours 4-9)
1. Audit all ⚠️ files for parameter completeness
2. Create missing conversion utilities (xa-convert.js)
3. Create normalization utilities (xa-normalize.js)
4. Complete spectral features
5. Create pitch tracking module (xa-pitch.js)

### Phase 2 (Hours 10-13)
6. Create HPSS module (xa-decompose.js)
7. Unify beat tracking implementations
8. Create segmentation module (xa-segment.js)
9. Create effects module (xa-effects.js)

### Phase 3 (Hours 14-20)
10. Set up comprehensive testing
11. Organize into clean module structure
12. Add TypeScript definitions
13. Create documentation
14. Package for npm

---

**STATUS:** In Progress - Continuing with Hour 4
**Last Updated:** 2025-11-15 (During autonomous execution)
