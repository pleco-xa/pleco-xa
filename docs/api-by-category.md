---
title: API reference by category
description: Every public pleco-xa function grouped by what it does — click any name for its signature, parameters, and source.
tableOfContents: false
---

The complete public API, grouped by task. Click any function for its full signature, parameters, returns, and a link to the exact source line.

## Core DSP & transforms

| Function | Description |
| --- | --- |
| [`applyHannWindow`](https://plecoxa.com/api/functions/applyhannwindow/) | Apply a Hann window to an audio sample array. |
| [`blackman_window`](https://plecoxa.com/api/functions/blackman_window/) | Blackman window |
| [`buf_to_float`](https://plecoxa.com/api/functions/buf_to_float/) | Convert an integer buffer to floating point values |
| [`computePeak`](https://plecoxa.com/api/functions/computepeak/) | Find the peak absolute sample value across all channels of an audio buffer. |
| [`cqt`](https://plecoxa.com/api/functions/cqt/) | Constant-Q Transform of an audio signal. |
| [`createSpectrogram`](https://plecoxa.com/api/functions/createspectrogram/) | Creates a spectrogram visualization of audio over time |
| [`debugLog`](https://plecoxa.com/api/functions/debuglog/) | Log to the console only when debug logging is enabled. |
| [`f0_harmonics`](https://plecoxa.com/api/functions/f0_harmonics/) | Compute the energy at selected harmonics of a time-varying fundamental frequency |
| [`fft`](https://plecoxa.com/api/functions/fft/) | Fast Fourier Transform using Cooley-Tukey algorithm (radix-2). |
| [`fft_frequencies`](https://plecoxa.com/api/functions/fft_frequencies/) | FFT frequencies |
| [`findDownbeatPhase`](https://plecoxa.com/api/functions/finddownbeatphase/) | Find the true downbeat phase by analyzing onset patterns. |
| [`findKickSnareHit`](https://plecoxa.com/api/functions/findkicksnarehit/) | Find kick+snare hit (strong transient with wide frequency content) |
| [`fix_frames`](https://plecoxa.com/api/functions/fix_frames/) | Fix a list of frames to lie within [x_min, x_max] |
| [`frame`](https://plecoxa.com/api/functions/frame/) | Slice a data array into (overlapping) frames |
| [`get_window`](https://plecoxa.com/api/functions/get_window/) | Get window function |
| [`hamming_window`](https://plecoxa.com/api/functions/hamming_window/) | Hamming window |
| [`hann_window`](https://plecoxa.com/api/functions/hann_window/) | Hann window |
| [`ifft`](https://plecoxa.com/api/functions/ifft/) | Inverse Fast Fourier Transform (complex input preserved, no component discarded). |
| [`isDebugEnabled`](https://plecoxa.com/api/functions/isdebugenabled/) | Report whether debug logging is currently enabled. |
| [`istft`](https://plecoxa.com/api/functions/istft/) | Inverse Short-Time Fourier Transform |
| [`magnitude`](https://plecoxa.com/api/functions/magnitude/) | Magnitude of complex spectrum |
| [`mel_to_stft`](https://plecoxa.com/api/functions/mel_to_stft/) | Approximate STFT magnitude from a Mel power spectrogram. |
| [`peakPick`](https://plecoxa.com/api/functions/peakpick/) | Peak picking algorithm with advanced filtering |
| [`phase`](https://plecoxa.com/api/functions/phase/) | Phase of complex spectrum |
| [`polar_to_complex`](https://plecoxa.com/api/functions/polar_to_complex/) | Convert magnitude and phase to complex spectrum |
| [`power`](https://plecoxa.com/api/functions/power/) | Power spectrum |
| [`rqa`](https://plecoxa.com/api/functions/rqa/) | Recurrence quantification analysis (RQA). |
| [`salience`](https://plecoxa.com/api/functions/salience/) | Compute the harmonic salience function |
| [`setDebug`](https://plecoxa.com/api/functions/setdebug/) | Enable or disable the library's debug logging. |
| [`spectrogram`](https://plecoxa.com/api/functions/spectrogram/) | Simple spectrogram computation |
| [`stft`](https://plecoxa.com/api/functions/stft/) | Short-Time Fourier Transform |
| [`sync`](https://plecoxa.com/api/functions/sync/) | Aggregate a multi-dimensional array between boundaries, synchronizing features to a set of frames. |
| [`warnIfNoMp3Support`](https://plecoxa.com/api/functions/warnifnomp3support/) | Check MP3 playback support and optionally show a warning banner. |
| [`yin`](https://plecoxa.com/api/functions/yin/) | Fundamental frequency (F0) estimation using the YIN algorithm |

## Spectral features

| Function | Description |
| --- | --- |
| [`computeRMS`](https://plecoxa.com/api/functions/computerms/) | Compute the Root Mean Square (RMS) energy of an audio buffer. |
| [`computeZeroCrossingRate`](https://plecoxa.com/api/functions/computezerocrossingrate/) | Compute the average zero-crossing rate across all channels of an audio buffer. |
| [`createRmsMeter`](https://plecoxa.com/api/functions/creatermsmeter/) | Create an incremental RMS meter. |
| [`delta_features`](https://plecoxa.com/api/functions/delta_features/) | Compute delta (first-order derivative) features |
| [`feature.chroma_stft`](https://plecoxa.com/api/pleco-xa/namespaces/feature/functions/chroma_stft/) | Chromagram from a waveform or power spectrogram. |
| [`feature.dctBasis`](https://plecoxa.com/api/pleco-xa/namespaces/feature/functions/dctbasis/) | Rows 0..n_out-1 of the DCT-II matrix over n_in points. |
| [`feature.estimate_tuning`](https://plecoxa.com/api/pleco-xa/namespaces/feature/functions/estimate_tuning/) | Estimate tuning from a signal or spectrogram. |
| [`feature.foldLogSpectrumToChroma`](https://plecoxa.com/api/pleco-xa/namespaces/feature/functions/foldlogspectrumtochroma/) | Fold a time-major log-frequency spectrum into pitch classes by summing energy across octaves. |
| [`feature.logFrequencySpectrum`](https://plecoxa.com/api/pleco-xa/namespaces/feature/functions/logfrequencyspectrum/) | Log-frequency spectrum by nearest-FFT-bin sampling. |
| [`feature.melspectrogram`](https://plecoxa.com/api/pleco-xa/namespaces/feature/functions/melspectrogram/) | Mel spectrogram from a waveform with a (y, options) API. |
| [`feature.mfcc`](https://plecoxa.com/api/pleco-xa/namespaces/feature/functions/mfcc/) | Mel-frequency cepstral coefficients. |
| [`feature.mfccFromLogMel`](https://plecoxa.com/api/pleco-xa/namespaces/feature/functions/mfccfromlogmel/) | MFCC cepstral core: DCT-II along the mel axis of a log-power mel spectrogram, keeping the first coefficients. |
| [`feature.piptrackPeaks`](https://plecoxa.com/api/pleco-xa/namespaces/feature/functions/piptrackpeaks/) | Pitch tracking on a thresholded, parabolically-interpolated STFT (piptrack); returns the sparse list of detected pitch/magnitude peaks. |
| [`feature.pitch_tuning`](https://plecoxa.com/api/pleco-xa/namespaces/feature/functions/pitch_tuning/) | Tuning offset of a set of detected frequencies relative to A440, in fractions of a chroma bin. |
| [`feature.rms`](https://plecoxa.com/api/pleco-xa/namespaces/feature/functions/rms/) | Root-mean-square energy per frame (centered, constant-padded framing). |
| [`feature.spectral_bandwidth`](https://plecoxa.com/api/pleco-xa/namespaces/feature/functions/spectral_bandwidth/) | p'th-order spectral bandwidth per frame. |
| [`feature.spectral_centroid`](https://plecoxa.com/api/pleco-xa/namespaces/feature/functions/spectral_centroid/) | Spectral centroid (energy-weighted mean frequency) per frame. |
| [`feature.spectral_contrast`](https://plecoxa.com/api/pleco-xa/namespaces/feature/functions/spectral_contrast/) | Spectral contrast: octave-band peak-to-valley energy difference per frame. |
| [`feature.spectral_flatness`](https://plecoxa.com/api/pleco-xa/namespaces/feature/functions/spectral_flatness/) | Spectral flatness (geometric mean over arithmetic mean of the power spectrum) per frame. |
| [`feature.spectral_rolloff`](https://plecoxa.com/api/pleco-xa/namespaces/feature/functions/spectral_rolloff/) | Roll-off frequency: the lowest frequency bin whose cumulative energy reaches a given percentage of the total. |
| [`feature.zero_crossing_rate`](https://plecoxa.com/api/pleco-xa/namespaces/feature/functions/zero_crossing_rate/) | Frame-wise zero-crossing rate with edge-padded centering. |
| [`findAllZeroCrossings`](https://plecoxa.com/api/functions/findallzerocrossings/) | Collect the indices of every zero crossing in a signal. |
| [`findZeroCrossing`](https://plecoxa.com/api/functions/findzerocrossing/) | Find the next zero crossing at or after a given sample index. |
| [`mfcc_to_mel`](https://plecoxa.com/api/functions/mfcc_to_mel/) | Invert Mel-frequency cepstral coefficients to approximate a Mel power spectrogram |

## Beat & tempo

| Function | Description |
| --- | --- |
| [`analyze_groove`](https://plecoxa.com/api/functions/analyze_groove/) | Estimate groove and timing feel |
| [`beat_sync`](https://plecoxa.com/api/functions/beat_sync/) | Beat-synchronous feature aggregation |
| [`beat_track`](https://plecoxa.com/api/functions/beat_track/) | Dynamic programming beat tracker. |
| [`beatTrack`](https://plecoxa.com/api/functions/beattrack/) | Beat tracker with tempo estimation and dynamic-programming beat selection. |
| [`calculateBeatAlignment`](https://plecoxa.com/api/functions/calculatebeatalignment/) | Calculate how well a loop length aligns with musical timing |
| [`compute_tempogram`](https://plecoxa.com/api/functions/compute_tempogram/) | Compute tempogram using autocorrelation |
| [`detect_tempo_multiples`](https://plecoxa.com/api/functions/detect_tempo_multiples/) | Detect tempo multiples and submultiples |
| [`detectBPM`](https://plecoxa.com/api/functions/detectbpm/) | Detect BPM from audio. |
| [`estimate_tempo`](https://plecoxa.com/api/functions/estimate_tempo/) | Estimate the global tempo (BPM) from a lag tempogram using tempo scoring. |
| [`extractTempo`](https://plecoxa.com/api/functions/extracttempo/) | Extract tempo from beat times Useful for validation and multiple tempo detection |
| [`fastBPMDetect`](https://plecoxa.com/api/functions/fastbpmdetect/) | Fast BPM detection using onset detection plus tempo estimation. |
| [`find_tempo_candidates`](https://plecoxa.com/api/functions/find_tempo_candidates/) | Find tempo candidates from tempogram |
| [`findFirstDownbeat`](https://plecoxa.com/api/functions/findfirstdownbeat/) | Find the first strong downbeat in the track to help align loops to the musical phrasing. |
| [`fourier_tempogram`](https://plecoxa.com/api/functions/fourier_tempogram/) | Fourier tempogram: the STFT of the onset strength envelope. |
| [`plp`](https://plecoxa.com/api/functions/plp/) | Predominant Local Pulse (PLP) estimation |
| [`quickTempo`](https://plecoxa.com/api/functions/quicktempo/) | QUICK TIER — windowed live tempo estimate. |
| [`tempo`](https://plecoxa.com/api/functions/tempo/) | Estimate the global tempo (BPM) with aggregate='mean'. |
| [`tempoBasedCompress`](https://plecoxa.com/api/functions/tempobasedcompress/) | Tempo-based audio compression — PITCH-PRESERVING time stretch via the phase vocoder. |
| [`tempogram`](https://plecoxa.com/api/functions/tempogram/) | Local autocorrelation tempogram of the onset strength envelope. |
| [`tempogram_ratio`](https://plecoxa.com/api/functions/tempogram_ratio/) | Tempogram ratio features (a.k.a. spectral rhythm patterns). |

## Tempo — BPM engine

| Function | Description |
| --- | --- |
| [`bpm.analyzeTempogram`](https://plecoxa.com/api/pleco-xa/namespaces/bpm/functions/analyzetempogram/) | Analyze a tempogram to find its peak tempos. |
| [`bpm.analyzeWithProgress`](https://plecoxa.com/api/pleco-xa/namespaces/bpm/functions/analyzewithprogress/) | Main analysis orchestrator that yields progress as it runs. |
| [`bpm.computeFourierTempogram`](https://plecoxa.com/api/pleco-xa/namespaces/bpm/functions/computefouriertempogram/) | Compute a Fourier tempogram. |
| [`bpm.computeOnsetStrength`](https://plecoxa.com/api/pleco-xa/namespaces/bpm/functions/computeonsetstrength/) | Compute onset strength using spectral flux. |
| [`bpm.computeSimpleFFT`](https://plecoxa.com/api/pleco-xa/namespaces/bpm/functions/computesimplefft/) | Compute a simple FFT. |
| [`bpm.computeSimpleSpectrum`](https://plecoxa.com/api/pleco-xa/namespaces/bpm/functions/computesimplespectrum/) | Compute a simple spectrum using a decimated FFT. |
| [`bpm.computeTempoFrequencies`](https://plecoxa.com/api/pleco-xa/namespaces/bpm/functions/computetempofrequencies/) | Convert FFT bins to tempo frequencies. |
| [`bpm.estimateConstrainedTempo`](https://plecoxa.com/api/pleco-xa/namespaces/bpm/functions/estimateconstrainedtempo/) | Estimate tempo within a constrained range. |
| [`bpm.estimateGlobalTempo`](https://plecoxa.com/api/pleco-xa/namespaces/bpm/functions/estimateglobaltempo/) | Estimate global tempo using autocorrelation. |

## Onset detection

| Function | Description |
| --- | --- |
| [`createFluxAnalyzer`](https://plecoxa.com/api/functions/createfluxanalyzer/) | Create an incremental spectral-flux analyzer. |
| [`onset_strength`](https://plecoxa.com/api/functions/onset_strength/) | onset_strength() — log-power-mel onset strength envelope. |
| [`onsetDetect`](https://plecoxa.com/api/functions/onsetdetect/) | Fast spectral-flux onset detection — returns picked onset times directly. |

## Pitch & harmony

| Function | Description |
| --- | --- |
| [`pitchBasedCompress`](https://plecoxa.com/api/functions/pitchbasedcompress/) | Pitch-based audio compression — a plain linear-interpolation resample kept at the original sample rate. |
| [`pyin`](https://plecoxa.com/api/functions/pyin/) | Probabilistic YIN (pYIN). |

## Loop detection

| Function | Description |
| --- | --- |
| [`addLoopRegions`](https://plecoxa.com/api/functions/addloopregions/) | Adds loop region overlays to existing waveform |
| [`compareLoops`](https://plecoxa.com/api/functions/compareloops/) | Quick loop comparison utility |
| [`createLoopBuffer`](https://plecoxa.com/api/functions/createloopbuffer/) | Create a loopable AudioBuffer with a custom waveform, multichannel support, and export options. |
| [`defineMultipleLoopPoints`](https://plecoxa.com/api/functions/definemultiplelooppoints/) | Define multiple loop points for playback. |
| [`detectLoop`](https://plecoxa.com/api/functions/detectloop/) | Detect loop points and return a real sample-range descriptor. |
| [`fastLoopAnalysis`](https://plecoxa.com/api/functions/fastloopanalysis/) | Fast loop analysis — the default strategy of loop.detect(). |
| [`findMusicalLoop`](https://plecoxa.com/api/functions/findmusicalloop/) | Simple loop finder that respects musical boundaries |
| [`fullBufferLoop`](https://plecoxa.com/api/functions/fullbufferloop/) | Return a loop spanning the entire buffer, performing no detection (the explicit whole-buffer descriptor used by resetLoop). |
| [`loop.analyzeLoopPoints`](https://plecoxa.com/api/pleco-xa/namespaces/loop/functions/analyzelooppoints/) | :::caution[Deprecated] Use loop.detect() instead. ::: |
| [`loop.clamp01`](https://plecoxa.com/api/pleco-xa/namespaces/loop/functions/clamp01/) | Clamp a number into [0, 1]. NaN clamps to 0. |
| [`loop.detect`](https://plecoxa.com/api/pleco-xa/namespaces/loop/functions/detect/) | Detect loop points in an audio buffer. |
| [`loop.fastOnsetLoopAnalysis`](https://plecoxa.com/api/pleco-xa/namespaces/loop/functions/fastonsetloopanalysis/) | :::caution[Deprecated] Use loop.detect(buffer, { strategy: 'recurrence' }) instead. ::: |
| [`loop.findPreciseLoop`](https://plecoxa.com/api/pleco-xa/namespaces/loop/functions/findpreciseloop/) | Find precise loop boundaries by testing actual audio repetition. |
| [`loop.loopAnalysis`](https://plecoxa.com/api/pleco-xa/namespaces/loop/functions/loopanalysis/) | :::caution[Deprecated] Use loop.detect() instead. ::: |
| [`loop.measureLoopConfidence`](https://plecoxa.com/api/pleco-xa/namespaces/loop/functions/measureloopconfidence/) | Measure how well audio loops over [startSec, endSec), returning a confidence in [0, 1]. |
| [`loop.musicalLoopAnalysis`](https://plecoxa.com/api/pleco-xa/namespaces/loop/functions/musicalloopanalysis/) | Musical boundary-aware analysis. |
| [`loop.normalizedCrossCorrelation`](https://plecoxa.com/api/pleco-xa/namespaces/loop/functions/normalizedcrosscorrelation/) | Normalized cross-correlation (mean-subtracted, std-normalized) in [-1, 1]. |
| [`loop.recurrenceLoop`](https://plecoxa.com/api/pleco-xa/namespaces/loop/functions/recurrenceloop/) | Detect a loop via recurrence-matrix analysis. |
| [`loop.snapToZeroCrossings`](https://plecoxa.com/api/pleco-xa/namespaces/loop/functions/snaptozerocrossings/) | Snap loop boundaries to nearby zero crossings to avoid clicks. |
| [`loop.xaLoopAnalysis`](https://plecoxa.com/api/pleco-xa/namespaces/loop/functions/xaloopanalysis/) | :::caution[Deprecated] Use loop.detect() instead. ::: |

## Structural segmentation

| Function | Description |
| --- | --- |
| [`segment.agglomerative`](https://plecoxa.com/api/pleco-xa/namespaces/segment/functions/agglomerative/) | Bottom-up temporal segmentation: partition frames into k contiguous segments; returns the left-boundary frame indices. |
| [`segment.crossSimilarity`](https://plecoxa.com/api/pleco-xa/namespaces/segment/functions/crosssimilarity/) | Cross-similarity between a comparison sequence and a reference sequence. |
| [`segment.lagToRecurrence`](https://plecoxa.com/api/pleco-xa/namespaces/segment/functions/lagtorecurrence/) | Convert a lag matrix back into a recurrence matrix. |
| [`segment.laplacianSegmentation`](https://plecoxa.com/api/pleco-xa/namespaces/segment/functions/laplaciansegmentation/) | Structural segmentation of a beat/frame-synchronous feature matrix by Laplacian spectral clustering. |
| [`segment.recurrenceMatrix`](https://plecoxa.com/api/pleco-xa/namespaces/segment/functions/recurrencematrix/) | Compute a recurrence (self-similarity) matrix from a feature matrix. |
| [`segment.recurrenceToLag`](https://plecoxa.com/api/pleco-xa/namespaces/segment/functions/recurrencetolag/) | Convert a recurrence matrix into a lag matrix. |

## Recurrence

| Function | Description |
| --- | --- |
| [`recurrence.computeChroma`](https://plecoxa.com/api/pleco-xa/namespaces/recurrence/functions/computechroma/) | Compute chroma features from audio buffer |
| [`recurrence.findLoopCandidates`](https://plecoxa.com/api/pleco-xa/namespaces/recurrence/functions/findloopcandidates/) | Find peaks in lag matrix to identify loop-lag candidates. |
| [`recurrence.framesToTime`](https://plecoxa.com/api/pleco-xa/namespaces/recurrence/functions/framestotime/) | Convert frames to time (xa-style) |
| [`recurrence.recurrenceLoopDetection`](https://plecoxa.com/api/pleco-xa/namespaces/recurrence/functions/recurrenceloopdetection/) | Recurrence loop detection using matrix analysis. |
| [`recurrence.recurrenceMatrix`](https://plecoxa.com/api/pleco-xa/namespaces/recurrence/functions/recurrencematrix/) | Proper recurrence matrix (xa-style) |
| [`recurrence.recurrenceToLag`](https://plecoxa.com/api/pleco-xa/namespaces/recurrence/functions/recurrencetolag/) | Convert a recurrence matrix to its lag representation (xa-style). |
| [`recurrence.stackMemory`](https://plecoxa.com/api/pleco-xa/namespaces/recurrence/functions/stackmemory/) | Time-delay embedding to stack chroma features. |

## Sequence alignment (DTW · Viterbi · RQA)

| Function | Description |
| --- | --- |
| [`sequence.dtw`](https://plecoxa.com/api/pleco-xa/namespaces/sequence/functions/dtw/) | Dynamic time warping between two feature sequences (or a precomputed cost matrix). |
| [`sequence.dtwBacktracking`](https://plecoxa.com/api/pleco-xa/namespaces/sequence/functions/dtwbacktracking/) | Backtrack a warping path from a recorded step matrix. |
| [`sequence.matchEvents`](https://plecoxa.com/api/pleco-xa/namespaces/sequence/functions/matchevents/) | Match one set of events to another (nearest neighbor with optional left/right constraints). |
| [`sequence.matchIntervals`](https://plecoxa.com/api/pleco-xa/namespaces/sequence/functions/matchintervals/) | Match one set of time intervals to another, maximizing Jaccard similarity. |
| [`sequence.transition_cycle`](https://plecoxa.com/api/pleco-xa/namespaces/sequence/functions/transition_cycle/) | Construct a cyclic transition matrix. |
| [`sequence.transition_local`](https://plecoxa.com/api/pleco-xa/namespaces/sequence/functions/transition_local/) | Construct a localized transition matrix where each state transitions only to nearby states. |
| [`sequence.transition_loop`](https://plecoxa.com/api/pleco-xa/namespaces/sequence/functions/transition_loop/) | Construct a self-loop transition matrix. |
| [`sequence.transition_uniform`](https://plecoxa.com/api/pleco-xa/namespaces/sequence/functions/transition_uniform/) | Construct a uniform transition matrix over nStates. |
| [`sequence.viterbi`](https://plecoxa.com/api/pleco-xa/namespaces/sequence/functions/viterbi/) | Viterbi decoding from observation likelihoods. |
| [`sequence.viterbi_discriminative`](https://plecoxa.com/api/pleco-xa/namespaces/sequence/functions/viterbi_discriminative/) | Viterbi decoding from discriminative (mutually exclusive) state posteriors. |

## Decomposition & separation

| Function | Description |
| --- | --- |
| [`decompose.hpss`](https://plecoxa.com/api/pleco-xa/namespaces/decompose/functions/hpss/) | Median-filtering harmonic/percussive source separation on a spectrogram. |
| [`decompose.nn_filter`](https://plecoxa.com/api/pleco-xa/namespaces/decompose/functions/nn_filter/) | Nearest-neighbor filtering (nn_filter). |
| [`decompose.optimizeEqCurves`](https://plecoxa.com/api/pleco-xa/namespaces/decompose/functions/optimizeeqcurves/) | Optimize EQ curves to match mixture fingerprints to vocal fingerprints |
| [`decompose.processAudioToFingerprints`](https://plecoxa.com/api/pleco-xa/namespaces/decompose/functions/processaudiotofingerprints/) | Process audio to create complete fingerprint |
| [`decompose.reconstructVocal`](https://plecoxa.com/api/pleco-xa/namespaces/decompose/functions/reconstructvocal/) | Reconstruct vocal audio using learned EQ curves |
| [`decompose.softmask`](https://plecoxa.com/api/pleco-xa/namespaces/decompose/functions/softmask/) | Robust soft mask M = X^power / (X^power + X_ref^power), computed with a rescale-by-max stabilization. |
| [`griffinlim`](https://plecoxa.com/api/functions/griffinlim/) | Griffin-Lim algorithm for phase reconstruction |
| [`pcen`](https://plecoxa.com/api/functions/pcen/) | Per-Channel Energy Normalization (PCEN) |

## Effects

| Function | Description |
| --- | --- |
| [`effects.deemphasis`](https://plecoxa.com/api/pleco-xa/namespaces/effects/functions/deemphasis/) | De-emphasis filter — the exact inverse of preemphasis(). |
| [`effects.harmonic`](https://plecoxa.com/api/pleco-xa/namespaces/effects/functions/harmonic/) | Extract only the harmonic component of a waveform. |
| [`effects.hpss`](https://plecoxa.com/api/pleco-xa/namespaces/effects/functions/hpss/) | Decompose an audio time series into harmonic and percussive components. |
| [`effects.percussive`](https://plecoxa.com/api/pleco-xa/namespaces/effects/functions/percussive/) | Extract only the percussive component of a waveform. |
| [`effects.phase_vocoder`](https://plecoxa.com/api/pleco-xa/namespaces/effects/functions/phase_vocoder/) | Phase vocoder: time-stretch an STFT matrix by a given rate. |
| [`effects.pitch_shift`](https://plecoxa.com/api/pleco-xa/namespaces/effects/functions/pitch_shift/) | Shift the pitch of a waveform by n_steps steps while preserving duration. |
| [`effects.preemphasis`](https://plecoxa.com/api/pleco-xa/namespaces/effects/functions/preemphasis/) | Pre-emphasis filter that boosts high frequencies (the inverse of deemphasis()). |
| [`effects.remix`](https://plecoxa.com/api/pleco-xa/namespaces/effects/functions/remix/) | Remix an audio signal by re-ordering time intervals. |
| [`effects.split`](https://plecoxa.com/api/pleco-xa/namespaces/effects/functions/split/) | Split an audio signal into non-silent intervals. |
| [`effects.time_stretch`](https://plecoxa.com/api/pleco-xa/namespaces/effects/functions/time_stretch/) | Time-stretch an audio series by a fixed rate while preserving pitch. |
| [`effects.trim`](https://plecoxa.com/api/pleco-xa/namespaces/effects/functions/trim/) | Trim leading and trailing silence from an audio signal. |

## Filter banks

| Function | Description |
| --- | --- |
| [`filters.chroma`](https://plecoxa.com/api/pleco-xa/namespaces/filters/functions/chroma/) | Chroma filter bank. Projects FFT bins onto n_chroma pitch classes via Gaussian bumps. |
| [`filters.mel_filterbank`](https://plecoxa.com/api/pleco-xa/namespaces/filters/functions/mel_filterbank/) | Create Mel filterbank matrix |

## Unit conversions

| Function | Description |
| --- | --- |
| [`convert.A4_to_tuning`](https://plecoxa.com/api/pleco-xa/namespaces/convert/functions/a4_to_tuning/) | Convert reference pitch A4 frequency to tuning deviation |
| [`convert.a_weighting`](https://plecoxa.com/api/pleco-xa/namespaces/convert/functions/a_weighting/) | A-weighting of frequency |
| [`convert.amplitude_to_db`](https://plecoxa.com/api/pleco-xa/namespaces/convert/functions/amplitude_to_db/) | Convert amplitude to decibels |
| [`convert.b_weighting`](https://plecoxa.com/api/pleco-xa/namespaces/convert/functions/b_weighting/) | B-weighting of frequency |
| [`convert.blocks_to_frames`](https://plecoxa.com/api/pleco-xa/namespaces/convert/functions/blocks_to_frames/) | Convert block indices to frame indices |
| [`convert.blocks_to_samples`](https://plecoxa.com/api/pleco-xa/namespaces/convert/functions/blocks_to_samples/) | Convert block indices to sample indices |
| [`convert.blocks_to_time`](https://plecoxa.com/api/pleco-xa/namespaces/convert/functions/blocks_to_time/) | Convert block indices to time (in seconds) |
| [`convert.c_weighting`](https://plecoxa.com/api/pleco-xa/namespaces/convert/functions/c_weighting/) | C-weighting of frequency |
| [`convert.cqt_frequencies`](https://plecoxa.com/api/pleco-xa/namespaces/convert/functions/cqt_frequencies/) | Compute CQT (Constant-Q Transform) frequencies |
| [`convert.d_weighting`](https://plecoxa.com/api/pleco-xa/namespaces/convert/functions/d_weighting/) | D-weighting of frequency |
| [`convert.db_to_amplitude`](https://plecoxa.com/api/pleco-xa/namespaces/convert/functions/db_to_amplitude/) | Convert decibels to amplitude |
| [`convert.db_to_power`](https://plecoxa.com/api/pleco-xa/namespaces/convert/functions/db_to_power/) | Convert decibels to power |
| [`convert.fft_frequencies`](https://plecoxa.com/api/pleco-xa/namespaces/convert/functions/fft_frequencies/) | Compute FFT frequencies |
| [`convert.fourier_tempo_frequencies`](https://plecoxa.com/api/pleco-xa/namespaces/convert/functions/fourier_tempo_frequencies/) | Compute Fourier tempogram frequencies |
| [`convert.frames_to_samples`](https://plecoxa.com/api/pleco-xa/namespaces/convert/functions/frames_to_samples/) | Convert frame indices to sample indices |
| [`convert.frames_to_time`](https://plecoxa.com/api/pleco-xa/namespaces/convert/functions/frames_to_time/) | Convert frame indices to time (seconds) |
| [`convert.frequency_weighting`](https://plecoxa.com/api/pleco-xa/namespaces/convert/functions/frequency_weighting/) | General frequency weighting function (wrapper for A/B/C/D/Z weightings) |
| [`convert.hz_to_mel`](https://plecoxa.com/api/pleco-xa/namespaces/convert/functions/hz_to_mel/) | Convert Hz to Mel scale |
| [`convert.hz_to_midi`](https://plecoxa.com/api/pleco-xa/namespaces/convert/functions/hz_to_midi/) | Convert Hz to MIDI note number |
| [`convert.hz_to_note`](https://plecoxa.com/api/pleco-xa/namespaces/convert/functions/hz_to_note/) | Convert Hz to note name |
| [`convert.hz_to_octs`](https://plecoxa.com/api/pleco-xa/namespaces/convert/functions/hz_to_octs/) | Convert Hz to octaves (relative to C0) |
| [`convert.lag_to_tempo`](https://plecoxa.com/api/pleco-xa/namespaces/convert/functions/lag_to_tempo/) | Convert lag (in frames) to BPM |
| [`convert.mel_frequencies`](https://plecoxa.com/api/pleco-xa/namespaces/convert/functions/mel_frequencies/) | Compute the mel-scale frequencies |
| [`convert.mel_to_hz`](https://plecoxa.com/api/pleco-xa/namespaces/convert/functions/mel_to_hz/) | Convert Mel scale to Hz |
| [`convert.midi_to_hz`](https://plecoxa.com/api/pleco-xa/namespaces/convert/functions/midi_to_hz/) | Convert MIDI note number to Hz |
| [`convert.midi_to_note`](https://plecoxa.com/api/pleco-xa/namespaces/convert/functions/midi_to_note/) | Convert MIDI note number to note name |
| [`convert.multi_frequency_weighting`](https://plecoxa.com/api/pleco-xa/namespaces/convert/functions/multi_frequency_weighting/) | Compute multiple frequency weightings at once |
| [`convert.note_to_hz`](https://plecoxa.com/api/pleco-xa/namespaces/convert/functions/note_to_hz/) | Convert note name to Hz |
| [`convert.note_to_midi`](https://plecoxa.com/api/pleco-xa/namespaces/convert/functions/note_to_midi/) | Convert note name to MIDI note number |
| [`convert.octs_to_hz`](https://plecoxa.com/api/pleco-xa/namespaces/convert/functions/octs_to_hz/) | Convert octaves to Hz |
| [`convert.perceptual_weighting`](https://plecoxa.com/api/pleco-xa/namespaces/convert/functions/perceptual_weighting/) | Perceptual weighting curve (approximate) |
| [`convert.power_to_db`](https://plecoxa.com/api/pleco-xa/namespaces/convert/functions/power_to_db/) | Convert power to decibels |
| [`convert.samples_like`](https://plecoxa.com/api/pleco-xa/namespaces/convert/functions/samples_like/) | Return an array of sample indices to match the time axis from a feature matrix |
| [`convert.samples_to_frames`](https://plecoxa.com/api/pleco-xa/namespaces/convert/functions/samples_to_frames/) | Convert audio samples to frame indices |
| [`convert.samples_to_time`](https://plecoxa.com/api/pleco-xa/namespaces/convert/functions/samples_to_time/) | Convert sample indices to time (seconds) |
| [`convert.tempo_frequencies`](https://plecoxa.com/api/pleco-xa/namespaces/convert/functions/tempo_frequencies/) | Compute the tempo frequencies (in BPM) corresponding to lag-tempogram bins. |
| [`convert.tempo_to_lag`](https://plecoxa.com/api/pleco-xa/namespaces/convert/functions/tempo_to_lag/) | Convert BPM to lag (in frames) |
| [`convert.time_to_frames`](https://plecoxa.com/api/pleco-xa/namespaces/convert/functions/time_to_frames/) | Convert time (seconds) to frame indices |
| [`convert.time_to_samples`](https://plecoxa.com/api/pleco-xa/namespaces/convert/functions/time_to_samples/) | Convert time (seconds) to sample indices |
| [`convert.times_like`](https://plecoxa.com/api/pleco-xa/namespaces/convert/functions/times_like/) | Return an array of time values to match the time axis from a feature matrix |
| [`convert.tuning_to_A4`](https://plecoxa.com/api/pleco-xa/namespaces/convert/functions/tuning_to_a4/) | Convert tuning deviation to A4 reference frequency |
| [`convert.z_weighting`](https://plecoxa.com/api/pleco-xa/namespaces/convert/functions/z_weighting/) | Z-weighting (flat/no weighting) for frequency analysis |

## Music notation

| Function | Description |
| --- | --- |
| [`notation.fifths_to_note`](https://plecoxa.com/api/pleco-xa/namespaces/notation/functions/fifths_to_note/) | Calculate the note name for a given number of perfect fifths |
| [`notation.hz_to_fjs`](https://plecoxa.com/api/pleco-xa/namespaces/notation/functions/hz_to_fjs/) | Convert one or more frequencies (in Hz) to Functional Just System (FJS) notation |
| [`notation.hz_to_svara_c`](https://plecoxa.com/api/pleco-xa/namespaces/notation/functions/hz_to_svara_c/) | Convert frequencies (in Hz) to Carnatic svara notation within a melakarta raga |
| [`notation.hz_to_svara_h`](https://plecoxa.com/api/pleco-xa/namespaces/notation/functions/hz_to_svara_h/) | Convert frequencies (in Hz) to Hindustani svara notation |
| [`notation.interval_to_fjs`](https://plecoxa.com/api/pleco-xa/namespaces/notation/functions/interval_to_fjs/) | Convert an interval to Functional Just System (FJS) notation |
| [`notation.key_to_degrees`](https://plecoxa.com/api/pleco-xa/namespaces/notation/functions/key_to_degrees/) | Construct the diatonic scale degrees for a given key |
| [`notation.key_to_notes`](https://plecoxa.com/api/pleco-xa/namespaces/notation/functions/key_to_notes/) | List all 12 chromatic note names as spelled according to a given key. |
| [`notation.list_mela`](https://plecoxa.com/api/pleco-xa/namespaces/notation/functions/list_mela/) | List melakarta ragas by name and index |
| [`notation.list_thaat`](https://plecoxa.com/api/pleco-xa/namespaces/notation/functions/list_thaat/) | List supported thaats by name |
| [`notation.mela_to_degrees`](https://plecoxa.com/api/pleco-xa/namespaces/notation/functions/mela_to_degrees/) | Construct the svara indices (degrees) for a given melakarta raga |
| [`notation.mela_to_svara`](https://plecoxa.com/api/pleco-xa/namespaces/notation/functions/mela_to_svara/) | Spell the Carnatic svara names for a given melakarta raga |
| [`notation.midi_to_svara_c`](https://plecoxa.com/api/pleco-xa/namespaces/notation/functions/midi_to_svara_c/) | Convert MIDI numbers to Carnatic svara within a melakarta raga |
| [`notation.midi_to_svara_h`](https://plecoxa.com/api/pleco-xa/namespaces/notation/functions/midi_to_svara_h/) | Convert MIDI numbers to Hindustani svara |
| [`notation.note_to_svara_c`](https://plecoxa.com/api/pleco-xa/namespaces/notation/functions/note_to_svara_c/) | Convert western note names to Carnatic svara within a melakarta raga |
| [`notation.note_to_svara_h`](https://plecoxa.com/api/pleco-xa/namespaces/notation/functions/note_to_svara_h/) | Convert western note names to Hindustani svara |
| [`notation.thaat_to_degrees`](https://plecoxa.com/api/pleco-xa/namespaces/notation/functions/thaat_to_degrees/) | Construct the svara indices (degrees) for a given thaat |

## Intervals

| Function | Description |
| --- | --- |
| [`intervals.compareTuningSystems`](https://plecoxa.com/api/pleco-xa/namespaces/intervals/functions/comparetuningsystems/) | Compare different tuning systems |
| [`intervals.generateFrequencies`](https://plecoxa.com/api/pleco-xa/namespaces/intervals/functions/generatefrequencies/) | Quick frequency generation utility |
| [`intervals.interval_frequencies`](https://plecoxa.com/api/pleco-xa/namespaces/intervals/functions/interval_frequencies/) | Construct interval frequencies (convenience wrapper) |
| [`intervals.plimit_intervals`](https://plecoxa.com/api/pleco-xa/namespaces/intervals/functions/plimit_intervals/) | Construct p-limit intervals (convenience wrapper) |
| [`intervals.pythagorean_intervals`](https://plecoxa.com/api/pleco-xa/namespaces/intervals/functions/pythagorean_intervals/) | Construct Pythagorean intervals (convenience wrapper) |

## Linear algebra

| Function | Description |
| --- | --- |
| [`linalg.eigh`](https://plecoxa.com/api/pleco-xa/namespaces/linalg/functions/eigh/) | Symmetric eigendecomposition via cyclic Jacobi rotations. |
| [`linalg.laplacian`](https://plecoxa.com/api/pleco-xa/namespaces/linalg/functions/laplacian/) | Normalized graph Laplacian of a dense weight matrix. |

## Clustering

| Function | Description |
| --- | --- |
| [`cluster.kmeans`](https://plecoxa.com/api/pleco-xa/namespaces/cluster/functions/kmeans/) | K-means clustering — Lloyd's algorithm with greedy k-means++ seeding. |

## Display & visualization

| Function | Description |
| --- | --- |
| [`analyzeWaveform`](https://plecoxa.com/api/functions/analyzewaveform/) | Calculates waveform statistics for analysis |
| [`cmap`](https://plecoxa.com/api/functions/cmap/) | Get a default colormap from the given data |
| [`createInteractiveRenderer`](https://plecoxa.com/api/functions/createinteractiverenderer/) | Creates an interactive waveform renderer with events |
| [`drawWaveform`](https://plecoxa.com/api/functions/drawwaveform/) | Draw waveform visualization |
| [`getStereoWaveformPeaks`](https://plecoxa.com/api/functions/getstereowaveformpeaks/) | Extracts stereo waveform data for left and right channels |
| [`getTimebasedWaveform`](https://plecoxa.com/api/functions/gettimebasedwaveform/) | Generates time-based waveform data with precise time stamps |
| [`getWaveformPeaks`](https://plecoxa.com/api/functions/getwaveformpeaks/) | Extracts waveform peaks suitable for visualization |
| [`getWaveformRange`](https://plecoxa.com/api/functions/getwaveformrange/) | Generates waveform data for a specific time range |
| [`harmonic_product_spectrum`](https://plecoxa.com/api/functions/harmonic_product_spectrum/) | Compute harmonic product spectrum (HPS) for pitch detection |
| [`renderStaticSpectrum`](https://plecoxa.com/api/functions/renderstaticspectrum/) | Renders static spectrum analysis of audio buffer |
| [`renderStereoWaveform`](https://plecoxa.com/api/functions/renderstereowaveform/) | Renders stereo waveform with separate channels |
| [`renderWaveform`](https://plecoxa.com/api/functions/renderwaveform/) | Renders waveform data to a canvas element |
| [`specshow`](https://plecoxa.com/api/functions/specshow/) | Display a spectrogram/chromagram/CQT/etc on a Canvas element |
| [`waveshow`](https://plecoxa.com/api/functions/waveshow/) | Visualize a waveform in the time domain on a Canvas element |

## Audio I/O — synthesis & codecs

| Function | Description |
| --- | --- |
| [`audioio.autocorrelate`](https://plecoxa.com/api/pleco-xa/namespaces/audioio/functions/autocorrelate/) | Autocorrelation of a signal up to a maximum lag. |
| [`audioio.chirp`](https://plecoxa.com/api/pleco-xa/namespaces/audioio/functions/chirp/) | Synthesize a linear or exponential frequency sweep (chirp). |
| [`audioio.clicks`](https://plecoxa.com/api/pleco-xa/namespaces/audioio/functions/clicks/) | Synthesize a click track at the given times or frames. |
| [`audioio.getDuration`](https://plecoxa.com/api/pleco-xa/namespaces/audioio/functions/getduration/) | Compute a signal's duration in seconds from its length and sample rate. |
| [`audioio.getSamplerate`](https://plecoxa.com/api/pleco-xa/namespaces/audioio/functions/getsamplerate/) | Read the sample rate of an AudioBuffer. |
| [`audioio.load`](https://plecoxa.com/api/pleco-xa/namespaces/audioio/functions/load/) | Fetch and decode an audio file, with optional mono downmix, resampling, offset, and duration. |
| [`audioio.lpc`](https://plecoxa.com/api/pleco-xa/namespaces/audioio/functions/lpc/) | Burg LPC (real‑valued) — returns LPC denominator polynomial a[0..p], a[0] == 1 |
| [`audioio.muCompress`](https://plecoxa.com/api/pleco-xa/namespaces/audioio/functions/mucompress/) | mu-law compress a signal, optionally quantizing to integer codewords. |
| [`audioio.muExpand`](https://plecoxa.com/api/pleco-xa/namespaces/audioio/functions/muexpand/) | mu-law expand (decode) a companded signal back to linear amplitude. |
| [`audioio.play`](https://plecoxa.com/api/pleco-xa/namespaces/audioio/functions/play/) | Play the currently loaded audio through the Web Audio API, optionally looping. |
| [`audioio.resample`](https://plecoxa.com/api/pleco-xa/namespaces/audioio/functions/resample/) | Linearly resample a signal from one sample rate to another. |
| [`audioio.stop`](https://plecoxa.com/api/pleco-xa/namespaces/audioio/functions/stop/) | Stop the current Web Audio playback and release the source node. |
| [`audioio.toMono`](https://plecoxa.com/api/pleco-xa/namespaces/audioio/functions/tomono/) | Downmix multi-channel audio to a single mono channel by averaging. |
| [`audioio.tone`](https://plecoxa.com/api/pleco-xa/namespaces/audioio/functions/tone/) | Synthesize a pure sinusoidal tone at a given frequency. |
| [`audioio.zeroCrossings`](https://plecoxa.com/api/pleco-xa/namespaces/audioio/functions/zerocrossings/) | Mark the sample positions where the signal changes sign. |

## Audio I/O — files & cache

| Function | Description |
| --- | --- |
| [`file.cache`](https://plecoxa.com/api/pleco-xa/namespaces/file/functions/cache/) | Get cache management interface |
| [`file.createAudioContext`](https://plecoxa.com/api/pleco-xa/namespaces/file/functions/createaudiocontext/) | Create a new Web Audio API context with proper configuration |
| [`file.createVisualization`](https://plecoxa.com/api/pleco-xa/namespaces/file/functions/createvisualization/) | Create audio visualization data |
| [`file.example`](https://plecoxa.com/api/pleco-xa/namespaces/file/functions/example/) | Load example audio file from remote source |
| [`file.exampleAudio`](https://plecoxa.com/api/pleco-xa/namespaces/file/functions/exampleaudio/) | Get audio data as Float32Array from AudioBuffer |
| [`file.exampleBuffer`](https://plecoxa.com/api/pleco-xa/namespaces/file/functions/examplebuffer/) | Load and decode audio example to AudioBuffer |
| [`file.exampleInfo`](https://plecoxa.com/api/pleco-xa/namespaces/file/functions/exampleinfo/) | Get metadata for a specific example |
| [`file.isWebAudioSupported`](https://plecoxa.com/api/pleco-xa/namespaces/file/functions/iswebaudiosupported/) | Utility function to check if Web Audio API is available |
| [`file.listExamples`](https://plecoxa.com/api/pleco-xa/namespaces/file/functions/listexamples/) | List all available audio examples |
| [`file.saveAudio`](https://plecoxa.com/api/pleco-xa/namespaces/file/functions/saveaudio/) | Save audio data as downloadable file |

## Audio I/O — streaming

| Function | Description |
| --- | --- |
| [`fileio.cite`](https://plecoxa.com/api/pleco-xa/namespaces/fileio/functions/cite/) | Get citation information for the pleco-xa library |
| [`fileio.createMediaStreamProcessor`](https://plecoxa.com/api/pleco-xa/namespaces/fileio/functions/createmediastreamprocessor/) | Create a real-time audio stream processor for live input |
| [`fileio.find_files`](https://plecoxa.com/api/pleco-xa/namespaces/fileio/functions/find_files/) | Get a sorted list of audio files using File System Access API |
| [`fileio.stream`](https://plecoxa.com/api/pleco-xa/namespaces/fileio/functions/stream/) | Chunked audio reader (not true streaming). |

## Audio I/O & playback

| Function | Description |
| --- | --- |
| [`applyLiveDoubleSpeed`](https://plecoxa.com/api/functions/applylivedoublespeed/) | Raise live playback to double speed in real time (crossfaded playback rate, or pitch-preserving resample). |
| [`applyLiveHalfSpeed`](https://plecoxa.com/api/functions/applylivehalfspeed/) | Drop live playback to half speed in real time (crossfaded playback rate, or pitch-preserving resample). |
| [`createAudioBlob`](https://plecoxa.com/api/functions/createaudioblob/) | Encode an AudioBuffer's first channel as a WAV Blob. |
| [`decodeWav`](https://plecoxa.com/api/functions/decodewav/) | Decode a WAV file into planar Float32Array channels (PCM 16/24/32-bit integer and 32-bit float). |
| [`encodeWav`](https://plecoxa.com/api/functions/encodewav/) | Encode planar channel data as an interleaved 16-bit PCM WAV file. |
| [`exportBufferAsWav`](https://plecoxa.com/api/functions/exportbufferaswav/) | Export an AudioBuffer as a .wav file. |
| [`findAudioStart`](https://plecoxa.com/api/functions/findaudiostart/) | Find where audible audio begins (first sample above a threshold, snapped to the nearest zero crossing). |
| [`initAudioProcessor`](https://plecoxa.com/api/functions/initaudioprocessor/) | Initialize the audio processor |
| [`loadAudioFile`](https://plecoxa.com/api/functions/loadaudiofile/) | Load audio file (from URL or File object) |
| [`loadFile`](https://plecoxa.com/api/functions/loadfile/) | Load local audio file from user input |
| [`mel_to_audio`](https://plecoxa.com/api/functions/mel_to_audio/) | Invert a mel power spectrogram to audio using Griffin-Lim |
| [`mfcc_to_audio`](https://plecoxa.com/api/functions/mfcc_to_audio/) | Convert Mel-frequency cepstral coefficients to a time-domain audio signal |
| [`resetLiveSpeed`](https://plecoxa.com/api/functions/resetlivespeed/) | Reset live playback back to normal (1x) speed. |
| [`valid_audio`](https://plecoxa.com/api/functions/valid_audio/) | Determine whether a variable contains valid audio data |

## Playback

| Function | Description |
| --- | --- |
| [`playback.closeGapLeft`](https://plecoxa.com/api/pleco-xa/namespaces/playback/functions/closegapleft/) | Close a detected gap by shifting the audio after it left. The normalized loop end is preserved. |
| [`playback.closeGapRight`](https://plecoxa.com/api/pleco-xa/namespaces/playback/functions/closegapright/) | Close a detected gap by removing it and rescaling the loop end to the shorter buffer. |
| [`playback.createBufferLike`](https://plecoxa.com/api/pleco-xa/namespaces/playback/functions/createbufferlike/) | Default pure buffer factory: an AudioBuffer-shaped object backed by Float32Array channels. |
| [`playback.detectGap`](https://plecoxa.com/api/pleco-xa/namespaces/playback/functions/detectgap/) | Detect a gap (silence across all channels) after the loop end. |
| [`playback.doubleSpeedQuantzLoop`](https://plecoxa.com/api/pleco-xa/namespaces/playback/functions/doublespeedquantzloop/) | Double speed quantz — gapless: compress the loop content at 2x speed into half the space and re-fill. |
| [`playback.doubleSpeedUnquantzLoop`](https://plecoxa.com/api/pleco-xa/namespaces/playback/functions/doublespeedunquantzloop/) | Double speed unquantz: compress the loop content at 2x speed in place (track length unchanged). |
| [`playback.halfSpeedLoop`](https://plecoxa.com/api/pleco-xa/namespaces/playback/functions/halfspeedloop/) | Half speed (time stretch) a loop section. The loop region is stretched to 2x its length. |
| [`playback.halfSpeedQuantzLoop`](https://plecoxa.com/api/pleco-xa/namespaces/playback/functions/halfspeedquantzloop/) | Half speed quantz: time-stretch the loop content at half speed but mask it to the original length. |
| [`playback.revealFirstHalf`](https://plecoxa.com/api/pleco-xa/namespaces/playback/functions/revealfirsthalf/) | Reveal the first half of a half-speed-quantz'd loop (counterpart of revealHiddenHalf; toggles back). |
| [`playback.revealHiddenHalf`](https://plecoxa.com/api/pleco-xa/namespaces/playback/functions/revealhiddenhalf/) | Reveal the "hidden" second half of a half-speed-quantz'd loop by replacing the loop window with it. |
| [`playback.reverseSection`](https://plecoxa.com/api/pleco-xa/namespaces/playback/functions/reversesection/) | Reverse a sample range of a buffer without mutating the input (copy-then-reverse). |

## Experimental & creative play

The Echoplex-inspired live-performance and glitch layer — the creative-play tier, not part of the stable analysis API. These helpers mutate loops and buffers in place for real-time performance and algorithmic sequencing; treat their signatures and behavior as experimental.

| Function | Description |
| --- | --- |
| [`applyOperationEnhanced`](https://plecoxa.com/api/functions/applyoperationenhanced/) | Apply a loop operation with live responsiveness — large reverse operations run in chunks with progress callbacks. |
| [`applyQuantumOp`](https://plecoxa.com/api/functions/applyquantumop/) | Apply a single named operation (half, double, move, reverse, reset, stutter, phase, fractal) to a buffer and loop. |
| [`buildQuantumOpList`](https://plecoxa.com/api/functions/buildquantumoplist/) | Build an operation list by warping a random seed through vector space and injecting preset accent bars. |
| [`buildQuantumSequence`](https://plecoxa.com/api/functions/buildquantumsequence/) | Turn an operation list into a list of executable playback steps, each applying one operation to the buffer and loop. |
| [`checkBufferSafety`](https://plecoxa.com/api/functions/checkbuffersafety/) | Validate a buffer and loop range, reporting whether the operation is safe along with any issues and loop metrics. |
| [`doubleLoop`](https://plecoxa.com/api/functions/doubleloop/) | Double a loop descriptor's length by extending its end, clamped to the buffer length. |
| [`executeOperation`](https://plecoxa.com/api/functions/executeoperation/) | Apply a single named loop operation (half, double, move, reverse, reset, stutter, fractal, phase) to a buffer and loop. |
| [`generateChaotic`](https://plecoxa.com/api/functions/generatechaotic/) | Generate a chaotic sequence of loop operations driven by a logistic-map iterator. |
| [`generateFibonacci`](https://plecoxa.com/api/functions/generatefibonacci/) | Generate a Fibonacci-patterned sequence of loop operations. |
| [`generatePrimeRhythm`](https://plecoxa.com/api/functions/generateprimerhythm/) | Generate a prime-number-driven rhythmic sequence of loop operations. |
| [`generateWaveform`](https://plecoxa.com/api/functions/generatewaveform/) | Generate a sine-wave-modulated sequence of loop operations. |
| [`glitchBurst`](https://plecoxa.com/api/functions/glitchburst/) | Run a time-boxed burst of randomized loop glitches on an internal clock; returns a stop function. |
| [`halfLoop`](https://plecoxa.com/api/functions/halfloop/) | Halve a loop descriptor, keeping the start and moving the end to the midpoint. |
| [`isLargeOperation`](https://plecoxa.com/api/functions/islargeoperation/) | Decide whether a loop operation counts as large (long loop, high buffer share, or long file) and warrants chunked processing. |
| [`moveForward`](https://plecoxa.com/api/functions/moveforward/) | Advance a loop descriptor forward by a number of samples, clamped so it never runs past the buffer end. |
| [`playQuantumOps`](https://plecoxa.com/api/functions/playquantumops/) | Play a quantum operation sequence with adaptive, oscillating per-operation timing. |
| [`randomLocal`](https://plecoxa.com/api/functions/randomlocal/) | Apply a short random burst of loop operations to the current loop and return the result. |
| [`randomPreset`](https://plecoxa.com/api/functions/randompreset/) | Return a randomly chosen preset beat pattern (an eight-step operation bar) for injection into a sequence. |
| [`randomSequence`](https://plecoxa.com/api/functions/randomsequence/) | Build a randomized sequence of loop-manipulation steps (move, half, double, reverse, reset) for live playback. |
| [`resetLoop`](https://plecoxa.com/api/functions/resetloop/) | Reset a loop descriptor to span the entire buffer. |
| [`reverseBufferSection`](https://plecoxa.com/api/functions/reversebuffersection/) | Reverse a sample range of a buffer in place (mutates the buffer). |
| [`signatureDemo`](https://plecoxa.com/api/functions/signaturedemo/) | Build the library's fixed signature demo — narrow, move, reverse, grow, and finish — as a list of playable steps. |
| [`startBeatGlitch`](https://plecoxa.com/api/functions/startbeatglitch/) | Start a beat-synchronized glitch that fires random loop operations once per detected bar; returns a stop function. |
