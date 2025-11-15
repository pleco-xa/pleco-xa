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

// Mel-frequency analysis
export { melspectrogram, mfcc, mel_filterbank, hz_to_mel, mel_to_hz, dct, idct, delta_features, lifter_mfcc, power_to_db } from './xa-mel.js'

// Conversion utilities
export { 
  frames_to_samples, samples_to_frames, frames_to_time, time_to_frames,
  samples_to_time, time_to_samples, hz_to_midi, midi_to_hz, midi_to_note,
  note_to_midi, hz_to_note, note_to_hz, hz_to_octs, octs_to_hz,
  amplitude_to_db, db_to_amplitude, power_to_db as power_to_db_convert, db_to_power,
  a_weighting, b_weighting, c_weighting, d_weighting, perceptual_weighting,
  fft_frequencies as fft_freq, cqt_frequencies, fourier_tempo_frequencies,
  tempo_to_lag, lag_to_tempo
} from './xa-convert.js'

// Normalization and masking
export {
  normalize, peak_normalize, normalize_clip, softmask, apply_mask,
  rms_normalize, lufs_normalize, compress, fade, crossfade, tiny
} from './xa-normalize.js'

// Tempogram and tempo analysis
export { tempogram, fourier_tempogram, tempogram_ratio, estimate_tempo } from './xa-tempogram.js'

// Pitch tracking
export { piptrack, yin, pyin, autocorrelation_pitch, hz_to_midi_pitch, pitch_salience, smooth_pitch } from './xa-pitch.js'

// Source separation and decomposition
export { hpss, median_filter, nn_filter, decompose, nmf_reconstruct, nmf_separate } from './xa-decompose.js'

// Rhythm and beat tracking
export { beat_track, tempo, plp, beat_sync } from './xa-rhythm.js'

// Structural segmentation
export { 
  recurrence_matrix, recurrence_to_lag, lag_to_recurrence, timelag_filter,
  segment_boundaries, agglomerative_clustering, boundaries_to_segments
} from './xa-segment.js'

// Audio effects
export { time_stretch, trim, split, harmonic, percussive, remix, preemphasis, deemphasis } from './xa-effects.js'

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
  librosaParity: '~50-60%',
  modules: [
    'Core (FFT, STFT)',
    'Mel-frequency (melspectrogram, MFCC)',
    'Conversion utilities',
    'Normalization',
    'Tempogram',
    'Pitch tracking',
    'Source separation (HPSS, NMF)',
    'Beat tracking',
    'Segmentation',
    'Audio effects'
  ]
}
