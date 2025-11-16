/**
 * Pleco Audio - JavaScript Audio Analysis Library
 * Librosa-compatible audio processing for JavaScript
 * 
 * A comprehensive audio analysis library providing:
 * - Spectral analysis (FFT, STFT, Mel, MFCC)
 * - Feature extraction (chroma, spectral features, rhythm)
 * - Pitch tracking (YIN, pYIN, piptrack)
 * - Beat and tempo detection
 * - Source separation (HPSS, NMF)
 * - Audio effects (time stretch, pitch shift, HPSS)
 * - Structural segmentation
 * 
 * @module pleco-audio
 * @version 1.0.0
 */

// Core: FFT and STFT
export { stft, istft, fft, ifft, hann_window, hamming_window, blackman_window, magnitude, phase, power, fft_frequencies } from './xa-fft.js'

// Constant-Q and Variable-Q transforms
export { cqt, vqt, hybrid_cqt, icqt, pseudo_cqt, griffinlim_cqt } from './xa-constantq.js'

// Harmonic analysis
export { f0_harmonics, interp_harmonics, salience, harmonic_product_spectrum, harmonic_sum_spectrum } from './xa-harmonic.js'

// Interval theory and tuning systems
export { interval_frequencies, plimit_intervals, pythagorean_intervals, IntervalConstructor } from './xa-intervals.js'

// Filter banks and window functions
export {
  constant_q, wavelet, mel, chroma, diagonal_filter, get_window, window_sumsquare,
  constant_q_lengths, cq_to_chroma, mr_frequencies, semitone_filterbank,
  wavelet_lengths, window_bandwidth
} from './xa-filters.js'

// Mel-frequency analysis
export { melspectrogram, mfcc, mel_filterbank, dct, idct, delta_features, lifter_mfcc, power_to_db } from './xa-mel.js'

// Spectral features
export {
  spectralCentroid as spectral_centroid,
  spectralBandwidth as spectral_bandwidth,
  spectralContrast as spectral_contrast,
  spectralRolloff as spectral_rolloff,
  spectralFlatness as spectral_flatness,
  rms,
  polyFeatures as poly_features,
  zeroCrossingRate as zero_crossing_rate,
  chromaStft as chroma_stft,
  chromaCqt as chroma_cqt,
  chromaCens as chroma_cens,
  tonnetz
} from './xa-spectral.js'

// Chroma features (VQT)
export { chroma_vqt } from './xa-chroma.js'

// Inverse transforms
export { mel_to_audio, mel_to_stft, mfcc_to_audio, mfcc_to_mel } from './xa-inverse.js'

// Conversion utilities
export {
  frames_to_samples, samples_to_frames, frames_to_time, time_to_frames,
  samples_to_time, time_to_samples, hz_to_midi, midi_to_hz, midi_to_note,
  note_to_midi, hz_to_note, note_to_hz, hz_to_octs, octs_to_hz,
  amplitude_to_db, db_to_amplitude, power_to_db as power_to_db_convert, db_to_power,
  a_weighting, b_weighting, c_weighting, d_weighting, z_weighting,
  frequency_weighting, multi_frequency_weighting, perceptual_weighting,
  fft_frequencies as fft_freq, cqt_frequencies, fourier_tempo_frequencies,
  tempo_to_lag, lag_to_tempo,
  blocks_to_frames, blocks_to_samples, blocks_to_time,
  tempo_frequencies, times_like, samples_like,
  hz_to_mel, mel_to_hz, mel_frequencies,
  A4_to_tuning, tuning_to_A4
} from './xa-convert.js'

// Normalization and masking
export {
  normalize, peak_normalize, normalize_clip, softmask, apply_mask,
  rms_normalize, lufs_normalize, compress, fade, crossfade
} from './xa-normalize.js'

// Tempogram and tempo analysis
export { tempogram, fourier_tempogram, tempogram_ratio, estimate_tempo } from './xa-tempogram.js'

// Pitch tracking
export { piptrack, yin, pyin, autocorrelation_pitch, hz_to_midi_pitch, pitch_salience, smooth_pitch, pitch_tuning, estimate_tuning } from './xa-pitch.js'

// Source separation and decomposition
export { hpss, median_filter, nn_filter, decompose, nmf_reconstruct, nmf_separate } from './xa-decompose.js'

// Rhythm and beat tracking
export { beat_track, tempo, plp, beat_sync } from './xa-rhythm.js'

// Onset detection
export {
  onsetDetect as onset_detect,
  onset_strength,
  onset_backtrack,
  onset_strength_multi,
  computeSpectralFlux as spectral_flux,
  pickPeaks as peak_pick
} from './xa-onset.js'

// Structural segmentation
export {
  recurrence_matrix, recurrence_to_lag, lag_to_recurrence, timelag_filter,
  segment_boundaries, agglomerative_clustering, boundaries_to_segments,
  cross_similarity, path_enhance, subsegment
} from './xa-segment.js'

// Sequence analysis and alignment
export {
  dtw, dtw_backtracking,
  viterbi, viterbi_discriminative, viterbi_binary,
  rqa,
  transition_uniform, transition_loop, transition_cycle, transition_local
} from './xa-sequence.js'

// Audio effects
export { time_stretch, trim, split, harmonic, percussive, remix, preemphasis, deemphasis } from './xa-effects.js'

// Advanced functions
export {
  phase_vocoder,
  pitch_shift,
  normalize_features,
  find_peaks,
  polyfit,
  linspace,
  griffinlim,
  pcen,
  magphase,
  fmt,
  reassigned_spectrogram
} from './xa-advanced.js'

// Audio I/O and utilities
export {
  toMono as to_mono,
  resample,
  zeroCrossings as zero_crossings,
  autocorrelate,
  lpc,
  tone,
  chirp,
  clicks,
  muCompress as mu_compress,
  muExpand as mu_expand,
  getDuration as get_duration,
  getSamplerate as get_samplerate
} from './xa-audioio.js'

// Utility functions
export {
  frame,
  padCenter as pad_center,
  fixLength as fix_length,
  localmax,
  localmin,
  peakPick as peak_pick_util,
  tiny,
  abs2,
  phasor,
  sync,
  stack_memory,
  shear,
  axis_sort,
  expand_to,
  fill_off_diagonal,
  sparsify_rows,
  valid_audio,
  valid_int,
  valid_intervals,
  buf_to_float,
  count_unique,
  cyclic_gradient,
  dtype_c2r,
  dtype_r2c,
  fix_frames,
  index_to_slice,
  is_positive_int,
  is_unique,
  stack
} from './xa-util.js'

// Music notation and theory
export {
  key_to_degrees,
  key_to_notes,
  list_mela,
  list_thaat,
  mela_to_degrees,
  mela_to_svara,
  thaat_to_degrees,
  hz_to_fjs,
  interval_to_fjs,
  hz_to_svara_c,
  hz_to_svara_h,
  midi_to_svara_c,
  midi_to_svara_h,
  note_to_svara_c,
  note_to_svara_h
} from './xa-notation.js'

// Matching utilities
export { match_events, match_intervals } from './xa-matching.js'

// Display and visualization (Canvas-based)
export { cmap, specshow, waveshow, connect, disconnect, update } from './xa-display.js'

// File I/O and streaming (Browser File API, MediaStream)
export { stream, find_files, cite, createMediaStreamProcessor } from './xa-fileio.js'

// Cache and utility decorators
export { LRUCache, wrapper, deprecated, moved, rename_kw, memoize, globalCache } from './xa-cache.js'

// Version info
export const VERSION = '1.0.0'
export const LIBROSA_COMPAT_VERSION = '0.10.x'

/**
 * Library information
 */
export const info = {
  name: 'pleco-audio',
  version: VERSION,
  description: 'Librosa-compatible audio analysis for JavaScript',
  librosaParity: '74.8%',
  implementedFunctions: 383,
  totalLibrosaFunctions: 512,
  jsApplicableFunctions: 512,
  remainingToImplement: 129,
  note: 'Librosa Feature Parity: 74.8% (383/512 functions). All Librosa functions will have JavaScript equivalents using browser APIs (Web Audio, Canvas, File API, etc). Previous [N/A] classifications corrected - all functions need JS implementations.',
  modules: [
    'Core (FFT, STFT)',
    'Constant-Q transforms (CQT, VQT, Hybrid CQT, inverse CQT, Griffin-Lim CQT)',
    'Sequence analysis (DTW, Viterbi, RQA, transition matrices)',
    'Mel-frequency (melspectrogram, MFCC, inverse transforms)',
    'Spectral features (centroid, bandwidth, rolloff, contrast, flatness, RMS, ZCR)',
    'Chroma features (STFT, CQT, CENS, VQT, Tonnetz)',
    'Display & Visualization (specshow, waveshow, cmap, canvas event adapters)',
    'File I/O & Streaming (stream, find_files, cite, MediaStream processing)',
    'Onset detection (onset_detect, onset_strength, onset_backtrack, onset_strength_multi)',
    'Audio I/O (resample, duration, to_mono, zero_crossings)',
    'Audio synthesis (tone, chirp, clicks)',
    'Compression (LPC, mu-law)',
    'Conversion utilities (blocks, times, samples, mel frequencies)',
    'Normalization & masking (softmask, sync)',
    'Tempogram & tempo analysis',
    'Pitch tracking (YIN, pYIN, piptrack)',
    'Source separation (HPSS, NMF)',
    'Beat tracking & rhythm',
    'Segmentation (recurrence, boundaries)',
    'Audio effects (time stretch, pitch shift, HPSS)',
    'Advanced (phase vocoder, autocorrelation)',
    'Music notation & theory (keys, scales, ragas, thaats, FJS, svara conversions)',
    'Cache & Decorators (LRU cache, memoization, deprecation warnings)',
    'Utilities (frame, pad, localmax/min, peak picking)'
  ]
}
