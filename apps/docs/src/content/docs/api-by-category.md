---
title: API reference by category
description: Every public pleco-xa function grouped by what it does — click any name for its signature, parameters, and source.
tableOfContents: false
---

The complete public API, grouped by task. Click any function for its full signature, parameters, returns, and a link to the exact source line.

## Core DSP & transforms

| Function | Description |
| --- | --- |
| [`applyHannWindow`](/api/functions/applyhannwindow/) | any |
| [`blackman_window`](/api/functions/blackman_window/) | Blackman window |
| [`buf_to_float`](/api/functions/buf_to_float/) | Convert an integer buffer to floating point values |
| [`computePeak`](/api/functions/computepeak/) | any |
| [`cqt`](/api/functions/cqt/) | Constant-Q Transform of an audio signal (single-pass evaluation — see module header for do |
| [`createSpectrogram`](/api/functions/createspectrogram/) | Creates a spectrogram visualization of audio over time |
| [`debugLog`](/api/functions/debuglog/) | Pleco-Xa — browser-native audio analysis engine. Wave-0 curated surface: every export here |
| [`f0_harmonics`](/api/functions/f0_harmonics/) | Compute the energy at selected harmonics of a time-varying fundamental frequency |
| [`fft`](/api/functions/fft/) | Fast Fourier Transform using Cooley-Tukey algorithm (radix-2). |
| [`fft_frequencies`](/api/functions/fft_frequencies/) | FFT frequencies |
| [`findDownbeatPhase`](/api/functions/finddownbeatphase/) | Find the true downbeat phase by analyzing onset patterns Much simpler and more reliable th |
| [`findKickSnareHit`](/api/functions/findkicksnarehit/) | Find kick+snare hit (strong transient with wide frequency content) |
| [`fix_frames`](/api/functions/fix_frames/) | Fix a list of frames to lie within [x_min, x_max] |
| [`frame`](/api/functions/frame/) | Slice a data array into (overlapping) frames |
| [`generateChaotic`](/api/functions/generatechaotic/) | any |
| [`generateFibonacci`](/api/functions/generatefibonacci/) | any |
| [`generatePrimeRhythm`](/api/functions/generateprimerhythm/) | any |
| [`get_window`](/api/functions/get_window/) | Get window function |
| [`hamming_window`](/api/functions/hamming_window/) | Hamming window |
| [`hann_window`](/api/functions/hann_window/) | Hann window |
| [`ifft`](/api/functions/ifft/) | Inverse Fast Fourier Transform (complex input preserved — no component discarded) ifft(X)  |
| [`isDebugEnabled`](/api/functions/isdebugenabled/) | Pleco-Xa — browser-native audio analysis engine. Wave-0 curated surface: every export here |
| [`istft`](/api/functions/istft/) | Inverse Short-Time Fourier Transform |
| [`magnitude`](/api/functions/magnitude/) | Magnitude of complex spectrum |
| [`mel_to_stft`](/api/functions/mel_to_stft/) | Approximate STFT magnitude from a Mel power spectrogram. |
| [`moveForward`](/api/functions/moveforward/) | any |
| [`peakPick`](/api/functions/peakpick/) | Peak picking algorithm with advanced filtering |
| [`phase`](/api/functions/phase/) | Phase of complex spectrum |
| [`polar_to_complex`](/api/functions/polar_to_complex/) | Convert magnitude and phase to complex spectrum |
| [`power`](/api/functions/power/) | Power spectrum |
| [`rqa`](/api/functions/rqa/) | Recurrence quantification analysis (RQA). |
| [`salience`](/api/functions/salience/) | Compute the harmonic salience function |
| [`setDebug`](/api/functions/setdebug/) | Pleco-Xa — browser-native audio analysis engine. Wave-0 curated surface: every export here |
| [`spectrogram`](/api/functions/spectrogram/) | Simple spectrogram computation |
| [`stft`](/api/functions/stft/) | Short-Time Fourier Transform |
| [`sync`](/api/functions/sync/) | Aggregate a multi-dimensional array between specified boundaries Synchronizes features to  |
| [`warnIfNoMp3Support`](/api/functions/warnifnomp3support/) | Check MP3 playback support and optionally show a warning banner. |
| [`yin`](/api/functions/yin/) | Fundamental frequency (F0) estimation using the YIN algorithm |

## Spectral features

| Function | Description |
| --- | --- |
| [`computeRMS`](/api/functions/computerms/) | Compute the Root Mean Square (RMS) energy of an audio buffer. |
| [`computeZeroCrossingRate`](/api/functions/computezerocrossingrate/) | any |
| [`createRmsMeter`](/api/functions/creatermsmeter/) | Create an incremental RMS meter. |
| [`delta_features`](/api/functions/delta_features/) | Compute delta (first-order derivative) features |
| [`feature.chroma_stft`](/api/pleco-xa/namespaces/feature/functions/chroma_stft/) | Chromagram from a waveform or power spectrogram (Ellis chromagram_E lineage). |
| [`feature.dctBasis`](/api/pleco-xa/namespaces/feature/functions/dctbasis/) | Rows 0..n_out-1 of the DCT-II matrix over n_in points (scipy.fft.dct(type=2) semantics: 'o |
| [`feature.estimate_tuning`](/api/pleco-xa/namespaces/feature/functions/estimate_tuning/) | Estimate tuning from a signal or spectrogram. |
| [`feature.foldLogSpectrumToChroma`](/api/pleco-xa/namespaces/feature/functions/foldlogspectrumtochroma/) | Fold a time-major log-frequency spectrum into pitch classes by energy sum over bin % n_chr |
| [`feature.logFrequencySpectrum`](/api/pleco-xa/namespaces/feature/functions/logfrequencyspectrum/) | Log-frequency spectrum by nearest-FFT-bin sampling. |
| [`feature.melspectrogram`](/api/pleco-xa/namespaces/feature/functions/melspectrogram/) | Mel spectrogram with a (y, options) API. Thin wrapper over the parity-gated scripts/xa-mel |
| [`feature.mfcc`](/api/pleco-xa/namespaces/feature/functions/mfcc/) | Mel-frequency cepstral coefficients. |
| [`feature.mfccFromLogMel`](/api/pleco-xa/namespaces/feature/functions/mfccfromlogmel/) | MFCC cepstral core: DCT-II along the mel axis of a LOG-power mel spectrogram, keep the fir |
| [`feature.piptrackPeaks`](/api/pleco-xa/namespaces/feature/functions/piptrackpeaks/) | Pitch tracking on thresholded parabolically-interpolated STFT (piptrack), restricted to wh |
| [`feature.pitch_tuning`](/api/pleco-xa/namespaces/feature/functions/pitch_tuning/) | Tuning offset of a set of detected frequencies relative to A440, in fractions of a chroma  |
| [`feature.rms`](/api/pleco-xa/namespaces/feature/functions/rms/) | Root-mean-square energy per frame. y path: centered constant-padded framing (verified salv |
| [`feature.spectral_bandwidth`](/api/pleco-xa/namespaces/feature/functions/spectral_bandwidth/) | p'th-order spectral bandwidth. bw[t] = (sum_f S_norm[f][t] * \|freq[f] - centroid[t]\|**p) |
| [`feature.spectral_centroid`](/api/pleco-xa/namespaces/feature/functions/spectral_centroid/) | Spectral centroid per frame. centroid[t] = sum_f freq[f] * S_norm[f][t], with per-frame L1 |
| [`feature.spectral_contrast`](/api/pleco-xa/namespaces/feature/functions/spectral_contrast/) | Spectral contrast. Octave-band peak/valley contrast: mean of the top / bottom quantile fra |
| [`feature.spectral_flatness`](/api/pleco-xa/namespaces/feature/functions/spectral_flatness/) | Spectral flatness: geometric mean / arithmetic mean of max(amin, S**power) per frame. (For |
| [`feature.spectral_rolloff`](/api/pleco-xa/namespaces/feature/functions/spectral_rolloff/) | Roll-off frequency: the minimum frequency bin whose cumulative energy reaches roll_percent |
| [`feature.zero_crossing_rate`](/api/pleco-xa/namespaces/feature/functions/zero_crossing_rate/) | Frame-wise zero-crossing rate: edge-padded centering, \|v\| &lt;= threshold clipped to zer |
| [`findAllZeroCrossings`](/api/functions/findallzerocrossings/) | any |
| [`findZeroCrossing`](/api/functions/findzerocrossing/) | any |
| [`mfcc_to_mel`](/api/functions/mfcc_to_mel/) | Invert Mel-frequency cepstral coefficients to approximate a Mel power spectrogram |

## Beat & tempo

| Function | Description |
| --- | --- |
| [`analyze_groove`](/api/functions/analyze_groove/) | Estimate groove and timing feel |
| [`beat_sync`](/api/functions/beat_sync/) | Beat-synchronous feature aggregation |
| [`beat_track`](/api/functions/beat_track/) | Dynamic programming beat tracker. |
| [`beatTrack`](/api/functions/beattrack/) | Port of xa.beat.beat_track() Much faster and more accurate than our basic BPM detector |
| [`calculateBeatAlignment`](/api/functions/calculatebeatalignment/) | Calculate how well a loop length aligns with musical timing |
| [`compute_tempogram`](/api/functions/compute_tempogram/) | Compute tempogram using autocorrelation |
| [`detect_tempo_multiples`](/api/functions/detect_tempo_multiples/) | Detect tempo multiples and submultiples |
| [`detectBPM`](/api/functions/detectbpm/) | Detect BPM from audio. |
| [`estimate_tempo`](/api/functions/estimate_tempo/) | Estimate the global tempo from a (lag) tempogram using tempo scoring: time-mean of the tem |
| [`extractTempo`](/api/functions/extracttempo/) | Extract tempo from beat times Useful for validation and multiple tempo detection |
| [`fastBPMDetect`](/api/functions/fastbpmdetect/) | Optimized BPM detection - replacement for the slow one Uses onset detection + tempo estima |
| [`find_tempo_candidates`](/api/functions/find_tempo_candidates/) | Find tempo candidates from tempogram |
| [`findFirstDownbeat`](/api/functions/findfirstdownbeat/) | Find the first strong downbeat in the track This helps align loops to the actual musical p |
| [`fourier_tempogram`](/api/functions/fourier_tempogram/) | Fourier tempogram: STFT of the onset strength envelope at hop 1: stft(onset_envelope, n_ff |
| [`plp`](/api/functions/plp/) | Predominant Local Pulse (PLP) estimation |
| [`quickTempo`](/api/functions/quicktempo/) | QUICK TIER — windowed lb-style live tempo estimate. |
| [`startBeatGlitch`](/api/functions/startbeatglitch/) | any |
| [`tempo`](/api/functions/tempo/) | Estimate the global tempo (BPM) with aggregate='mean'. |
| [`tempoBasedCompress`](/api/functions/tempobasedcompress/) | Tempo-based audio compression — PITCH-PRESERVING time stretch via the phase vocoder (src/e |
| [`tempogram`](/api/functions/tempogram/) | Local autocorrelation tempogram of the onset strength envelope. |
| [`tempogram_ratio`](/api/functions/tempogram_ratio/) | Tempogram ratio features (a.k.a. spectral rhythm patterns). Summarizes tempogram energy at |

## Tempo — BPM engine

| Function | Description |
| --- | --- |
| [`bpm.analyzeTempogram`](/api/pleco-xa/namespaces/bpm/functions/analyzetempogram/) | Analyze tempogram for peak tempos From lb/index.html lines 1149-1208 |
| [`bpm.analyzeWithProgress`](/api/pleco-xa/namespaces/bpm/functions/analyzewithprogress/) | Main analysis orchestrator with progress yielding From lb/index.html lines 917-981 |
| [`bpm.computeFourierTempogram`](/api/pleco-xa/namespaces/bpm/functions/computefouriertempogram/) | Compute Fourier tempogram From lb/index.html lines 1083-1125 |
| [`bpm.computeOnsetStrength`](/api/pleco-xa/namespaces/bpm/functions/computeonsetstrength/) | Compute onset strength using spectral flux From lb/index.html lines 983-1019 |
| [`bpm.computeSimpleFFT`](/api/pleco-xa/namespaces/bpm/functions/computesimplefft/) | Compute simple FFT From lb/index.html lines 1134-1147 |
| [`bpm.computeSimpleSpectrum`](/api/pleco-xa/namespaces/bpm/functions/computesimplespectrum/) | Compute simple spectrum using decimated FFT From lb/index.html lines 1264-1276 |
| [`bpm.computeTempoFrequencies`](/api/pleco-xa/namespaces/bpm/functions/computetempofrequencies/) | Convert FFT bins to tempo frequencies From lb/index.html lines 1127-1132 |
| [`bpm.estimateConstrainedTempo`](/api/pleco-xa/namespaces/bpm/functions/estimateconstrainedtempo/) | Estimate tempo within constrained range From lb/index.html lines 1210-1262 |
| [`bpm.estimateGlobalTempo`](/api/pleco-xa/namespaces/bpm/functions/estimateglobaltempo/) | Estimate global tempo using autocorrelation From lb/index.html lines 1021-1081 |

## Onset detection

| Function | Description |
| --- | --- |
| [`createFluxAnalyzer`](/api/functions/createfluxanalyzer/) | Create an incremental spectral-flux analyzer. |
| [`onset_strength`](/api/functions/onset_strength/) | onset_strength() — log-power-mel onset strength envelope. |
| [`onsetDetect`](/api/functions/onsetdetect/) | onset_detect() — fast spectral flux-based onset detection |

## Pitch & harmony

| Function | Description |
| --- | --- |
| [`pitchBasedCompress`](/api/functions/pitchbasedcompress/) | Pitch-based audio compression — a plain linear-interpolation resample kept at the original |
| [`pyin`](/api/functions/pyin/) | Probabilistic YIN (pYIN). |

## Loop detection

| Function | Description |
| --- | --- |
| [`addLoopRegions`](/api/functions/addloopregions/) | Adds loop region overlays to existing waveform |
| [`compareLoops`](/api/functions/compareloops/) | Quick loop comparison utility |
| [`createLoopBuffer`](/api/functions/createloopbuffer/) | Create a loopable AudioBuffer with custom waveform, multichannel support, and export optio |
| [`defineMultipleLoopPoints`](/api/functions/definemultiplelooppoints/) | Define multiple loop points for playback. |
| [`detectLoop`](/api/functions/detectloop/) | Detect loop points and return a real sample-range descriptor. |
| [`doubleLoop`](/api/functions/doubleloop/) | any |
| [`fastLoopAnalysis`](/api/functions/fastloopanalysis/) | Fast loop analysis — the default strategy of loop.detect(). Pipeline: beat tracking → onse |
| [`findMusicalLoop`](/api/functions/findmusicalloop/) | Simple loop finder that respects musical boundaries |
| [`fullBufferLoop`](/api/functions/fullbufferloop/) | Return a loop spanning the entire buffer. Performs NO detection — this is the explicit "wh |
| [`halfLoop`](/api/functions/halfloop/) | any |
| [`loop.analyzeLoopPoints`](/api/pleco-xa/namespaces/loop/functions/analyzelooppoints/) | :::caution[Deprecated] Use loop.detect() instead. ::: |
| [`loop.clamp01`](/api/pleco-xa/namespaces/loop/functions/clamp01/) | Clamp a number into [0, 1]. NaN clamps to 0. |
| [`loop.detect`](/api/pleco-xa/namespaces/loop/functions/detect/) | Detect loop points in an audio buffer. |
| [`loop.fastOnsetLoopAnalysis`](/api/pleco-xa/namespaces/loop/functions/fastonsetloopanalysis/) | :::caution[Deprecated] Use loop.detect(buffer, { strategy: 'recurrence' }) instead. ::: |
| [`loop.findPreciseLoop`](/api/pleco-xa/namespaces/loop/functions/findpreciseloop/) | Find precise loop boundaries by testing actual audio repetition. Much more accurate than b |
| [`loop.loopAnalysis`](/api/pleco-xa/namespaces/loop/functions/loopanalysis/) | :::caution[Deprecated] Use loop.detect() instead. ::: |
| [`loop.measureLoopConfidence`](/api/pleco-xa/namespaces/loop/functions/measureloopconfidence/) | Measure how well audioData loops at [startSec, endSec) by correlating the loop segment aga |
| [`loop.musicalLoopAnalysis`](/api/pleco-xa/namespaces/loop/functions/musicalloopanalysis/) | Musical boundary-aware analysis. |
| [`loop.normalizedCrossCorrelation`](/api/pleco-xa/namespaces/loop/functions/normalizedcrosscorrelation/) | Normalized cross-correlation (mean-subtracted, std-normalized) in [-1, 1]. Zero-variance i |
| [`loop.recurrenceLoop`](/api/pleco-xa/namespaces/loop/functions/recurrenceloop/) | Detect a loop via recurrence-matrix analysis. |
| [`loop.snapToZeroCrossings`](/api/pleco-xa/namespaces/loop/functions/snaptozerocrossings/) | Convenience wrapper over DynamicZeroCrossing.snap for callers that prefer a plain function |
| [`loop.xaLoopAnalysis`](/api/pleco-xa/namespaces/loop/functions/xaloopanalysis/) | :::caution[Deprecated] Use loop.detect() instead. ::: |
| [`resetLoop`](/api/functions/resetloop/) | any |

## Structural segmentation

| Function | Description |
| --- | --- |
| [`segment.agglomerative`](/api/pleco-xa/namespaces/segment/functions/agglomerative/) | Bottom-up temporal segmentation: partition frames into k contiguous segments by temporally |
| [`segment.crossSimilarity`](/api/pleco-xa/namespaces/segment/functions/crosssimilarity/) | Cross-similarity between a comparison sequence and a reference sequence. |
| [`segment.lagToRecurrence`](/api/pleco-xa/namespaces/segment/functions/lagtorecurrence/) | Convert a lag matrix back into a recurrence matrix: shear with factor=+1 (out[i][j] = lag[ |
| [`segment.laplacianSegmentation`](/api/pleco-xa/namespaces/segment/functions/laplaciansegmentation/) | Structural segmentation of a beat/frame-synchronous feature matrix by Laplacian spectral c |
| [`segment.recurrenceMatrix`](/api/pleco-xa/namespaces/segment/functions/recurrencematrix/) | Compute a recurrence (self-similarity) matrix from a feature matrix. |
| [`segment.recurrenceToLag`](/api/pleco-xa/namespaces/segment/functions/recurrencetolag/) | Convert a recurrence matrix into a lag matrix: lag[i][j] = rec[(i + j) mod H][j] (a shear  |

## Recurrence

| Function | Description |
| --- | --- |
| [`recurrence.computeChroma`](/api/pleco-xa/namespaces/recurrence/functions/computechroma/) | Compute chroma features from audio buffer |
| [`recurrence.findLoopCandidates`](/api/pleco-xa/namespaces/recurrence/functions/findloopcandidates/) | Find peaks in lag matrix to identify loop-lag candidates. |
| [`recurrence.framesToTime`](/api/pleco-xa/namespaces/recurrence/functions/framestotime/) | Convert frames to time (xa-style) |
| [`recurrence.recurrenceLoopDetection`](/api/pleco-xa/namespaces/recurrence/functions/recurrenceloopdetection/) | Recurrence loop detection using matrix analysis. |
| [`recurrence.recurrenceMatrix`](/api/pleco-xa/namespaces/recurrence/functions/recurrencematrix/) | Proper recurrence matrix (xa-style) |
| [`recurrence.recurrenceToLag`](/api/pleco-xa/namespaces/recurrence/functions/recurrencetolag/) | Convert recurrence matrix to lag representation (xa-style). Accepts rows as plain arrays o |
| [`recurrence.stackMemory`](/api/pleco-xa/namespaces/recurrence/functions/stackmemory/) | Time-delay embedding to stack chroma features. Accepts rows as plain arrays or typed array |

## Sequence alignment (DTW · Viterbi · RQA)

| Function | Description |
| --- | --- |
| [`sequence.dtw`](/api/pleco-xa/namespaces/sequence/functions/dtw/) | Dynamic time warping between two feature sequences (or a precomputed cost matrix). |
| [`sequence.dtwBacktracking`](/api/pleco-xa/namespaces/sequence/functions/dtwbacktracking/) | Backtrack a warping path from a recorded step matrix. |
| [`sequence.matchEvents`](/api/pleco-xa/namespaces/sequence/functions/matchevents/) | Match one set of events to another (nearest neighbor with optional left/right constraints) |
| [`sequence.matchIntervals`](/api/pleco-xa/namespaces/sequence/functions/matchintervals/) | Match one set of time intervals to another, maximizing Jaccard similarity. |
| [`sequence.transition_cycle`](/api/pleco-xa/namespaces/sequence/functions/transition_cycle/) | Construct a cyclic transition matrix. transition[i][i] = p, transition[i][(i + 1) mod nSta |
| [`sequence.transition_local`](/api/pleco-xa/namespaces/sequence/functions/transition_local/) | Construct a localized transition matrix. State i transitions only to nearby states, weight |
| [`sequence.transition_loop`](/api/pleco-xa/namespaces/sequence/functions/transition_loop/) | Construct a self-loop transition matrix. transition[i][i] = p, transition[i][j] = (1 - p)  |
| [`sequence.transition_uniform`](/api/pleco-xa/namespaces/sequence/functions/transition_uniform/) | Construct a uniform transition matrix over nStates. transition[i][j] = 1 / nStates. |
| [`sequence.viterbi`](/api/pleco-xa/namespaces/sequence/functions/viterbi/) | Viterbi decoding from observation likelihoods. |
| [`sequence.viterbi_discriminative`](/api/pleco-xa/namespaces/sequence/functions/viterbi_discriminative/) | Viterbi decoding from discriminative (mutually exclusive) state posteriors. |

## Decomposition & separation

| Function | Description |
| --- | --- |
| [`decompose.hpss`](/api/pleco-xa/namespaces/decompose/functions/hpss/) | Median-filtering harmonic/percussive source separation on a spectrogram. Default behavior: |
| [`decompose.nn_filter`](/api/pleco-xa/namespaces/decompose/functions/nn_filter/) | Nearest-neighbor filtering (nn_filter). |
| [`decompose.optimizeEqCurves`](/api/pleco-xa/namespaces/decompose/functions/optimizeeqcurves/) | Optimize EQ curves to match mixture fingerprints to vocal fingerprints |
| [`decompose.processAudioToFingerprints`](/api/pleco-xa/namespaces/decompose/functions/processaudiotofingerprints/) | Process audio to create complete fingerprint |
| [`decompose.reconstructVocal`](/api/pleco-xa/namespaces/decompose/functions/reconstructvocal/) | Reconstruct vocal audio using learned EQ curves |
| [`decompose.softmask`](/api/pleco-xa/namespaces/decompose/functions/softmask/) | Robust soft mask: M = X^power / (X^power + X_ref^power), computed with a rescale-by-max st |
| [`griffinlim`](/api/functions/griffinlim/) | Griffin-Lim algorithm for phase reconstruction |
| [`pcen`](/api/functions/pcen/) | Per-Channel Energy Normalization (PCEN) |

## Effects

| Function | Description |
| --- | --- |
| [`effects.deemphasis`](/api/pleco-xa/namespaces/effects/functions/deemphasis/) | De-emphasis filter x[n] = y[n] + coef*x[n-1] — exact inverse of preemphasis() including th |
| [`effects.harmonic`](/api/pleco-xa/namespaces/effects/functions/harmonic/) | Extract only the harmonic component of a waveform. |
| [`effects.hpss`](/api/pleco-xa/namespaces/effects/functions/hpss/) | Decompose an audio time series into harmonic and percussive components. Pipeline: stft → d |
| [`effects.percussive`](/api/pleco-xa/namespaces/effects/functions/percussive/) | Extract only the percussive component of a waveform. |
| [`effects.phase_vocoder`](/api/pleco-xa/namespaces/effects/functions/phase_vocoder/) | Phase vocoder: time-stretch an STFT matrix by rate. Ellis 2002 formulation: phi_advance =  |
| [`effects.pitch_shift`](/api/pleco-xa/namespaces/effects/functions/pitch_shift/) | Shift the pitch of a waveform by n_steps steps (duration preserved). Recipe: rate = 2^(-n_ |
| [`effects.preemphasis`](/api/pleco-xa/namespaces/effects/functions/preemphasis/) | Pre-emphasis filter y[n] = x[n] - coef*x[n-1], including its exact zi handling: zi is the  |
| [`effects.remix`](/api/pleco-xa/namespaces/effects/functions/remix/) | Remix an audio signal by re-ordering time intervals. Intervals are concatenated in CALLER  |
| [`effects.split`](/api/pleco-xa/namespaces/effects/functions/split/) | Split an audio signal into non-silent intervals. Frame-edge sample indices, capped to y.le |
| [`effects.time_stretch`](/api/pleco-xa/namespaces/effects/functions/time_stretch/) | Time-stretch an audio series by a fixed rate (pitch-preserving). Pipeline: stft → phase_vo |
| [`effects.trim`](/api/pleco-xa/namespaces/effects/functions/trim/) | Trim leading and trailing silence from an audio signal. |

## Filter banks

| Function | Description |
| --- | --- |
| [`filters.chroma`](/api/pleco-xa/namespaces/filters/functions/chroma/) | Chroma filter bank. Projects FFT bins onto n_chroma pitch classes via Gaussian bumps. |
| [`filters.mel_filterbank`](/api/pleco-xa/namespaces/filters/functions/mel_filterbank/) | Create Mel filterbank matrix |

## Unit conversions

| Function | Description |
| --- | --- |
| [`convert.A4_to_tuning`](/api/pleco-xa/namespaces/convert/functions/a4_to_tuning/) | Convert reference pitch A4 frequency to tuning deviation |
| [`convert.a_weighting`](/api/pleco-xa/namespaces/convert/functions/a_weighting/) | A-weighting of frequency |
| [`convert.amplitude_to_db`](/api/pleco-xa/namespaces/convert/functions/amplitude_to_db/) | Convert amplitude to decibels |
| [`convert.b_weighting`](/api/pleco-xa/namespaces/convert/functions/b_weighting/) | B-weighting of frequency |
| [`convert.blocks_to_frames`](/api/pleco-xa/namespaces/convert/functions/blocks_to_frames/) | Convert block indices to frame indices |
| [`convert.blocks_to_samples`](/api/pleco-xa/namespaces/convert/functions/blocks_to_samples/) | Convert block indices to sample indices |
| [`convert.blocks_to_time`](/api/pleco-xa/namespaces/convert/functions/blocks_to_time/) | Convert block indices to time (in seconds) |
| [`convert.c_weighting`](/api/pleco-xa/namespaces/convert/functions/c_weighting/) | C-weighting of frequency |
| [`convert.cqt_frequencies`](/api/pleco-xa/namespaces/convert/functions/cqt_frequencies/) | Compute CQT (Constant-Q Transform) frequencies |
| [`convert.d_weighting`](/api/pleco-xa/namespaces/convert/functions/d_weighting/) | D-weighting of frequency |
| [`convert.db_to_amplitude`](/api/pleco-xa/namespaces/convert/functions/db_to_amplitude/) | Convert decibels to amplitude |
| [`convert.db_to_power`](/api/pleco-xa/namespaces/convert/functions/db_to_power/) | Convert decibels to power |
| [`convert.fft_frequencies`](/api/pleco-xa/namespaces/convert/functions/fft_frequencies/) | Compute FFT frequencies |
| [`convert.fourier_tempo_frequencies`](/api/pleco-xa/namespaces/convert/functions/fourier_tempo_frequencies/) | Compute Fourier tempogram frequencies |
| [`convert.frames_to_samples`](/api/pleco-xa/namespaces/convert/functions/frames_to_samples/) | any |
| [`convert.frames_to_time`](/api/pleco-xa/namespaces/convert/functions/frames_to_time/) | Convert frame indices to time (seconds) |
| [`convert.frequency_weighting`](/api/pleco-xa/namespaces/convert/functions/frequency_weighting/) | General frequency weighting function (wrapper for A/B/C/D/Z weightings) |
| [`convert.hz_to_mel`](/api/pleco-xa/namespaces/convert/functions/hz_to_mel/) | Convert Hz to Mel scale |
| [`convert.hz_to_midi`](/api/pleco-xa/namespaces/convert/functions/hz_to_midi/) | Convert Hz to MIDI note number |
| [`convert.hz_to_note`](/api/pleco-xa/namespaces/convert/functions/hz_to_note/) | Convert Hz to note name |
| [`convert.hz_to_octs`](/api/pleco-xa/namespaces/convert/functions/hz_to_octs/) | Convert Hz to octaves (relative to C0) |
| [`convert.lag_to_tempo`](/api/pleco-xa/namespaces/convert/functions/lag_to_tempo/) | Convert lag (in frames) to BPM |
| [`convert.mel_frequencies`](/api/pleco-xa/namespaces/convert/functions/mel_frequencies/) | Compute the mel-scale frequencies |
| [`convert.mel_to_hz`](/api/pleco-xa/namespaces/convert/functions/mel_to_hz/) | Convert Mel scale to Hz |
| [`convert.midi_to_hz`](/api/pleco-xa/namespaces/convert/functions/midi_to_hz/) | Convert MIDI note number to Hz |
| [`convert.midi_to_note`](/api/pleco-xa/namespaces/convert/functions/midi_to_note/) | Convert MIDI note number to note name |
| [`convert.multi_frequency_weighting`](/api/pleco-xa/namespaces/convert/functions/multi_frequency_weighting/) | Compute multiple frequency weightings at once |
| [`convert.note_to_hz`](/api/pleco-xa/namespaces/convert/functions/note_to_hz/) | Convert note name to Hz |
| [`convert.note_to_midi`](/api/pleco-xa/namespaces/convert/functions/note_to_midi/) | Convert note name to MIDI note number |
| [`convert.octs_to_hz`](/api/pleco-xa/namespaces/convert/functions/octs_to_hz/) | Convert octaves to Hz |
| [`convert.perceptual_weighting`](/api/pleco-xa/namespaces/convert/functions/perceptual_weighting/) | Perceptual weighting curve (approximate) |
| [`convert.power_to_db`](/api/pleco-xa/namespaces/convert/functions/power_to_db/) | Convert power to decibels |
| [`convert.samples_like`](/api/pleco-xa/namespaces/convert/functions/samples_like/) | Return an array of sample indices to match the time axis from a feature matrix |
| [`convert.samples_to_frames`](/api/pleco-xa/namespaces/convert/functions/samples_to_frames/) | Convert audio samples to frame indices |
| [`convert.samples_to_time`](/api/pleco-xa/namespaces/convert/functions/samples_to_time/) | Convert sample indices to time (seconds) |
| [`convert.tempo_frequencies`](/api/pleco-xa/namespaces/convert/functions/tempo_frequencies/) | Compute the frequencies (in BPM) corresponding to LAG-tempogram bins. Lag-tempogram bin k  |
| [`convert.tempo_to_lag`](/api/pleco-xa/namespaces/convert/functions/tempo_to_lag/) | Convert BPM to lag (in frames) |
| [`convert.time_to_frames`](/api/pleco-xa/namespaces/convert/functions/time_to_frames/) | Convert time (seconds) to frame indices |
| [`convert.time_to_samples`](/api/pleco-xa/namespaces/convert/functions/time_to_samples/) | Convert time (seconds) to sample indices |
| [`convert.times_like`](/api/pleco-xa/namespaces/convert/functions/times_like/) | Return an array of time values to match the time axis from a feature matrix |
| [`convert.tuning_to_A4`](/api/pleco-xa/namespaces/convert/functions/tuning_to_a4/) | Convert tuning deviation to A4 reference frequency |
| [`convert.z_weighting`](/api/pleco-xa/namespaces/convert/functions/z_weighting/) | Z-weighting (flat/no weighting) for frequency analysis |

## Music notation

| Function | Description |
| --- | --- |
| [`notation.fifths_to_note`](/api/pleco-xa/namespaces/notation/functions/fifths_to_note/) | Calculate the note name for a given number of perfect fifths |
| [`notation.hz_to_fjs`](/api/pleco-xa/namespaces/notation/functions/hz_to_fjs/) | Convert one or more frequencies (in Hz) to Functional Just System (FJS) notation |
| [`notation.hz_to_svara_c`](/api/pleco-xa/namespaces/notation/functions/hz_to_svara_c/) | Convert frequencies (in Hz) to Carnatic svara notation within a melakarta raga |
| [`notation.hz_to_svara_h`](/api/pleco-xa/namespaces/notation/functions/hz_to_svara_h/) | Convert frequencies (in Hz) to Hindustani svara notation |
| [`notation.interval_to_fjs`](/api/pleco-xa/namespaces/notation/functions/interval_to_fjs/) | Convert an interval to Functional Just System (FJS) notation |
| [`notation.key_to_degrees`](/api/pleco-xa/namespaces/notation/functions/key_to_degrees/) | Construct the diatonic scale degrees for a given key |
| [`notation.key_to_notes`](/api/pleco-xa/namespaces/notation/functions/key_to_notes/) | List all 12 note names in the chromatic scale, as spelled according to a given key. The re |
| [`notation.list_mela`](/api/pleco-xa/namespaces/notation/functions/list_mela/) | List melakarta ragas by name and index |
| [`notation.list_thaat`](/api/pleco-xa/namespaces/notation/functions/list_thaat/) | List supported thaats by name |
| [`notation.mela_to_degrees`](/api/pleco-xa/namespaces/notation/functions/mela_to_degrees/) | Construct the svara indices (degrees) for a given melakarta raga |
| [`notation.mela_to_svara`](/api/pleco-xa/namespaces/notation/functions/mela_to_svara/) | Spell the Carnatic svara names for a given melakarta raga |
| [`notation.midi_to_svara_c`](/api/pleco-xa/namespaces/notation/functions/midi_to_svara_c/) | Convert MIDI numbers to Carnatic svara within a melakarta raga |
| [`notation.midi_to_svara_h`](/api/pleco-xa/namespaces/notation/functions/midi_to_svara_h/) | Convert MIDI numbers to Hindustani svara |
| [`notation.note_to_svara_c`](/api/pleco-xa/namespaces/notation/functions/note_to_svara_c/) | Convert western note names to Carnatic svara within a melakarta raga |
| [`notation.note_to_svara_h`](/api/pleco-xa/namespaces/notation/functions/note_to_svara_h/) | Convert western note names to Hindustani svara |
| [`notation.thaat_to_degrees`](/api/pleco-xa/namespaces/notation/functions/thaat_to_degrees/) | Construct the svara indices (degrees) for a given thaat |

## Intervals

| Function | Description |
| --- | --- |
| [`intervals.compareTuningSystems`](/api/pleco-xa/namespaces/intervals/functions/comparetuningsystems/) | Compare different tuning systems |
| [`intervals.generateFrequencies`](/api/pleco-xa/namespaces/intervals/functions/generatefrequencies/) | Quick frequency generation utility |
| [`intervals.interval_frequencies`](/api/pleco-xa/namespaces/intervals/functions/interval_frequencies/) | Construct interval frequencies (convenience wrapper) |
| [`intervals.plimit_intervals`](/api/pleco-xa/namespaces/intervals/functions/plimit_intervals/) | Construct p-limit intervals (convenience wrapper) |
| [`intervals.pythagorean_intervals`](/api/pleco-xa/namespaces/intervals/functions/pythagorean_intervals/) | Construct Pythagorean intervals (convenience wrapper) |

## Linear algebra

| Function | Description |
| --- | --- |
| [`linalg.eigh`](/api/pleco-xa/namespaces/linalg/functions/eigh/) | Symmetric eigendecomposition via cyclic Jacobi rotations. |
| [`linalg.laplacian`](/api/pleco-xa/namespaces/linalg/functions/laplacian/) | Normalized graph Laplacian of a dense weight matrix. |

## Clustering

| Function | Description |
| --- | --- |
| [`cluster.kmeans`](/api/pleco-xa/namespaces/cluster/functions/kmeans/) | K-means clustering — Lloyd's algorithm with greedy k-means++ seeding. |

## Display & visualization

| Function | Description |
| --- | --- |
| [`analyzeWaveform`](/api/functions/analyzewaveform/) | Calculates waveform statistics for analysis |
| [`cmap`](/api/functions/cmap/) | Get a default colormap from the given data |
| [`createInteractiveRenderer`](/api/functions/createinteractiverenderer/) | Creates an interactive waveform renderer with events |
| [`drawWaveform`](/api/functions/drawwaveform/) | Draw waveform visualization |
| [`generateWaveform`](/api/functions/generatewaveform/) | any |
| [`getStereoWaveformPeaks`](/api/functions/getstereowaveformpeaks/) | Extracts stereo waveform data for left and right channels |
| [`getTimebasedWaveform`](/api/functions/gettimebasedwaveform/) | Generates time-based waveform data with precise time stamps |
| [`getWaveformPeaks`](/api/functions/getwaveformpeaks/) | Extracts waveform peaks suitable for visualization |
| [`getWaveformRange`](/api/functions/getwaveformrange/) | Generates waveform data for a specific time range |
| [`harmonic_product_spectrum`](/api/functions/harmonic_product_spectrum/) | Compute harmonic product spectrum (HPS) for pitch detection |
| [`renderStaticSpectrum`](/api/functions/renderstaticspectrum/) | Renders static spectrum analysis of audio buffer |
| [`renderStereoWaveform`](/api/functions/renderstereowaveform/) | Renders stereo waveform with separate channels |
| [`renderWaveform`](/api/functions/renderwaveform/) | Renders waveform data to a canvas element |
| [`specshow`](/api/functions/specshow/) | Display a spectrogram/chromagram/CQT/etc on a Canvas element |
| [`waveshow`](/api/functions/waveshow/) | Visualize a waveform in the time domain on a Canvas element |

## Audio I/O — synthesis & codecs

| Function | Description |
| --- | --- |
| [`audioio.autocorrelate`](/api/pleco-xa/namespaces/audioio/functions/autocorrelate/) | any |
| [`audioio.chirp`](/api/pleco-xa/namespaces/audioio/functions/chirp/) | any = null |
| [`audioio.clicks`](/api/pleco-xa/namespaces/audioio/functions/clicks/) | any = null |
| [`audioio.getDuration`](/api/pleco-xa/namespaces/audioio/functions/getduration/) | any |
| [`audioio.getSamplerate`](/api/pleco-xa/namespaces/audioio/functions/getsamplerate/) | any |
| [`audioio.load`](/api/pleco-xa/namespaces/audioio/functions/load/) | any |
| [`audioio.lpc`](/api/pleco-xa/namespaces/audioio/functions/lpc/) | Burg LPC (real‑valued) — returns LPC denominator polynomial a[0..p], a[0] == 1 |
| [`audioio.muCompress`](/api/pleco-xa/namespaces/audioio/functions/mucompress/) | any |
| [`audioio.muExpand`](/api/pleco-xa/namespaces/audioio/functions/muexpand/) | any |
| [`audioio.play`](/api/pleco-xa/namespaces/audioio/functions/play/) | boolean = false |
| [`audioio.resample`](/api/pleco-xa/namespaces/audioio/functions/resample/) | any |
| [`audioio.stop`](/api/pleco-xa/namespaces/audioio/functions/stop/) | void |
| [`audioio.toMono`](/api/pleco-xa/namespaces/audioio/functions/tomono/) | any |
| [`audioio.tone`](/api/pleco-xa/namespaces/audioio/functions/tone/) | any |
| [`audioio.zeroCrossings`](/api/pleco-xa/namespaces/audioio/functions/zerocrossings/) | any |

## Audio I/O — files & cache

| Function | Description |
| --- | --- |
| [`file.cache`](/api/pleco-xa/namespaces/file/functions/cache/) | Get cache management interface |
| [`file.createAudioContext`](/api/pleco-xa/namespaces/file/functions/createaudiocontext/) | Create a new Web Audio API context with proper configuration |
| [`file.createVisualization`](/api/pleco-xa/namespaces/file/functions/createvisualization/) | Create audio visualization data |
| [`file.example`](/api/pleco-xa/namespaces/file/functions/example/) | Load example audio file from remote source |
| [`file.exampleAudio`](/api/pleco-xa/namespaces/file/functions/exampleaudio/) | Get audio data as Float32Array from AudioBuffer |
| [`file.exampleBuffer`](/api/pleco-xa/namespaces/file/functions/examplebuffer/) | Load and decode audio example to AudioBuffer |
| [`file.exampleInfo`](/api/pleco-xa/namespaces/file/functions/exampleinfo/) | Get metadata for a specific example |
| [`file.isWebAudioSupported`](/api/pleco-xa/namespaces/file/functions/iswebaudiosupported/) | Utility function to check if Web Audio API is available |
| [`file.listExamples`](/api/pleco-xa/namespaces/file/functions/listexamples/) | List all available audio examples |
| [`file.saveAudio`](/api/pleco-xa/namespaces/file/functions/saveaudio/) | Save audio data as downloadable file |

## Audio I/O — streaming

| Function | Description |
| --- | --- |
| [`fileio.cite`](/api/pleco-xa/namespaces/fileio/functions/cite/) | Get citation information for the pleco-xa library |
| [`fileio.createMediaStreamProcessor`](/api/pleco-xa/namespaces/fileio/functions/createmediastreamprocessor/) | Create a real-time audio stream processor for live input |
| [`fileio.find_files`](/api/pleco-xa/namespaces/fileio/functions/find_files/) | Get a sorted list of audio files using File System Access API |
| [`fileio.stream`](/api/pleco-xa/namespaces/fileio/functions/stream/) | Chunked audio reader (NOT true streaming — honesty note, 2026-07-02). |

## Audio I/O & playback

| Function | Description |
| --- | --- |
| [`applyLiveDoubleSpeed`](/api/functions/applylivedoublespeed/) | any = null |
| [`applyLiveHalfSpeed`](/api/functions/applylivehalfspeed/) | any = null |
| [`checkBufferSafety`](/api/functions/checkbuffersafety/) | any |
| [`createAudioBlob`](/api/functions/createaudioblob/) | any |
| [`decodeWav`](/api/functions/decodewav/) | Decode a WAV file into planar Float32Array channels. Supports PCM 16/24/32-bit int and 32- |
| [`encodeWav`](/api/functions/encodewav/) | Encode planar channel data as an interleaved 16-bit PCM WAV file. |
| [`exportBufferAsWav`](/api/functions/exportbufferaswav/) | Export an AudioBuffer as a .wav file. |
| [`findAudioStart`](/api/functions/findaudiostart/) | any |
| [`initAudioProcessor`](/api/functions/initaudioprocessor/) | Initialize the audio processor |
| [`loadAudioFile`](/api/functions/loadaudiofile/) | Load audio file (from URL or File object) |
| [`loadFile`](/api/functions/loadfile/) | Load local audio file from user input |
| [`mel_to_audio`](/api/functions/mel_to_audio/) | Invert a mel power spectrogram to audio using Griffin-Lim |
| [`mfcc_to_audio`](/api/functions/mfcc_to_audio/) | Convert Mel-frequency cepstral coefficients to a time-domain audio signal |
| [`resetLiveSpeed`](/api/functions/resetlivespeed/) | Promise\&lt;\{ method: string; preservePitch: boolean; speed: any; \} \\| \{ buffer: any;  |
| [`reverseBufferSection`](/api/functions/reversebuffersection/) | any |
| [`valid_audio`](/api/functions/valid_audio/) | Determine whether a variable contains valid audio data |

## Playback

| Function | Description |
| --- | --- |
| [`playback.closeGapLeft`](/api/pleco-xa/namespaces/playback/functions/closegapleft/) | Close a detected gap by shifting the audio after it left. The normalized loop end is prese |
| [`playback.closeGapRight`](/api/pleco-xa/namespaces/playback/functions/closegapright/) | Close a detected gap by removing it and rescaling the loop end to the shorter buffer (cont |
| [`playback.createBufferLike`](/api/pleco-xa/namespaces/playback/functions/createbufferlike/) | Default pure buffer factory: an AudioBuffer-shaped object backed by Float32Array channels. |
| [`playback.detectGap`](/api/pleco-xa/namespaces/playback/functions/detectgap/) | Detect a gap (silence across all channels) after the loop end. |
| [`playback.doubleSpeedQuantzLoop`](/api/pleco-xa/namespaces/playback/functions/doublespeedquantzloop/) | Double speed quantz — gapless: compress the loop content at 2x speed into half the space a |
| [`playback.doubleSpeedUnquantzLoop`](/api/pleco-xa/namespaces/playback/functions/doublespeedunquantzloop/) | Double speed unquantz: compress the loop content at 2x speed IN PLACE (track length unchan |
| [`playback.halfSpeedLoop`](/api/pleco-xa/namespaces/playback/functions/halfspeedloop/) | Half speed (time stretch) a loop section. The loop region is stretched to 2x its length (l |
| [`playback.halfSpeedQuantzLoop`](/api/pleco-xa/namespaces/playback/functions/halfspeedquantzloop/) | Half speed quantz: time-stretch the loop content at half speed but MASK it to the original |
| [`playback.revealFirstHalf`](/api/pleco-xa/namespaces/playback/functions/revealfirsthalf/) | Reveal the FIRST half of a half-speed-quantz'd loop (counterpart of revealHiddenHalf; togg |
| [`playback.revealHiddenHalf`](/api/pleco-xa/namespaces/playback/functions/revealhiddenhalf/) | Reveal the "hidden" second half of a half-speed-quantz'd loop: replace the loop window wit |
| [`playback.reverseSection`](/api/pleco-xa/namespaces/playback/functions/reversesection/) | Reverse a sample range of a buffer WITHOUT mutating the input (copy-then-reverse; contrast |

## Creative play layer

| Function | Description |
| --- | --- |
| [`applyOperationEnhanced`](/api/functions/applyoperationenhanced/) | any |
| [`applyQuantumOp`](/api/functions/applyquantumop/) | Apply a quantum operation to audio buffer |
| [`buildQuantumOpList`](/api/functions/buildquantumoplist/) | number = 128 |
| [`buildQuantumSequence`](/api/functions/buildquantumsequence/) | any |
| [`executeOperation`](/api/functions/executeoperation/) | any |
| [`glitchBurst`](/api/functions/glitchburst/) | any |
| [`isLargeOperation`](/api/functions/islargeoperation/) | any |
| [`playQuantumOps`](/api/functions/playquantumops/) | any |
| [`randomLocal`](/api/functions/randomlocal/) | any |
| [`randomPreset`](/api/functions/randompreset/) | string[] |
| [`randomSequence`](/api/functions/randomsequence/) | any |
| [`signatureDemo`](/api/functions/signaturedemo/) | any |
