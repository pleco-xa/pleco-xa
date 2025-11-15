/**
 * Librosa-style Mel filterbank and MFCC computation for JavaScript
 * Mel-scale frequency analysis for audio processing
 */

import { stft, magnitude } from './xa-fft.js'

/**
 * Create Mel filterbank matrix
 * @param {number} sr - Sample rate
 * @param {number} n_fft - FFT size
 * @param {number} n_mels - Number of Mel filters
 * @param {number} fmin - Minimum frequency
 * @param {number|null} fmax - Maximum frequency (sr/2 if null)
 * @param {string|number|null} norm - Normalization type ('slaney', number, or null)
 * @param {boolean} htk - Use HTK formula for mel conversion
 * @returns {Array} Mel filterbank matrix (n_mels x n_freq_bins)
 */
export function mel_filterbank(
  sr = 22050,
  n_fft = 2048,
  n_mels = 128,
  fmin = 0,
  fmax = null,
  norm = 'slaney',  // Fixed: was boolean, now matches Librosa (default 'slaney')
  htk = false,
) {
  if (fmax === null) {
    fmax = sr / 2
  }

  // Compute mel frequencies (use htk parameter)
  const mel_min = hz_to_mel(fmin, htk)
  const mel_max = hz_to_mel(fmax, htk)
  const mel_points = linspace(mel_min, mel_max, n_mels + 2)
  const hz_points = mel_points.map((mel) => mel_to_hz(mel, htk))

  // Convert to FFT bin numbers
  const bin_points = hz_points.map((hz) => Math.floor(((n_fft + 1) * hz) / sr))

  // Create filterbank matrix
  const n_freq_bins = Math.floor(1 + n_fft / 2)
  const filterbank = Array(n_mels)
    .fill(null)
    .map(() => new Float32Array(n_freq_bins))

  for (let i = 0; i < n_mels; i++) {
    const start = bin_points[i]
    const center = bin_points[i + 1]
    const end = bin_points[i + 2]

    // Rising edge
    for (let j = start; j < center && j < n_freq_bins; j++) {
      if (center > start) {
        filterbank[i][j] = (j - start) / (center - start)
      }
    }

    // Falling edge
    for (let j = center; j < end && j < n_freq_bins; j++) {
      if (end > center) {
        filterbank[i][j] = (end - j) / (end - center)
      }
    }

    // Apply normalization
    // 'slaney': area normalization (default) - each filter integrates to 1
    // number: L-norm normalization
    // null: no normalization
    if (norm === 'slaney' || norm === true) {  // Support old boolean for compatibility
      // Area normalization - sum to 1
      const sum = filterbank[i].reduce((a, b) => a + b, 0)
      if (sum > 0) {
        for (let j = 0; j < n_freq_bins; j++) {
          filterbank[i][j] /= sum
        }
      }
    } else if (typeof norm === 'number' && norm !== null) {
      // L-norm normalization
      let norm_sum = 0
      for (let j = 0; j < n_freq_bins; j++) {
        norm_sum += Math.pow(Math.abs(filterbank[i][j]), norm)
      }
      const norm_factor = Math.pow(norm_sum, 1 / norm)
      if (norm_factor > 0) {
        for (let j = 0; j < n_freq_bins; j++) {
          filterbank[i][j] /= norm_factor
        }
      }
    }
    // If norm === null, no normalization
  }

  return filterbank
}

/**
 * Convert Hz to Mel scale
 * @param {number} hz - Frequency in Hz
 * @param {boolean} htk - Use HTK formula instead of Slaney (default: false)
 * @returns {number} Frequency in Mel scale
 */
export function hz_to_mel(hz, htk = false) {
  if (htk) {
    // HTK formula
    return 2595 * Math.log10(1 + hz / 700)
  }

  // Slaney formula (default in Librosa)
  const f_min = 0.0
  const f_sp = 200.0 / 3

  // Linear part (below 1000 Hz)
  let mel = (hz - f_min) / f_sp

  // Log part (above 1000 Hz)
  const min_log_hz = 1000.0
  const min_log_mel = (min_log_hz - f_min) / f_sp
  const logstep = Math.log(6.4) / 27.0

  if (hz >= min_log_hz) {
    mel = min_log_mel + Math.log(hz / min_log_hz) / logstep
  }

  return mel
}

/**
 * Convert Mel scale to Hz
 * @param {number} mel - Frequency in Mel scale
 * @param {boolean} htk - Use HTK formula instead of Slaney (default: false)
 * @returns {number} Frequency in Hz
 */
export function mel_to_hz(mel, htk = false) {
  if (htk) {
    // HTK formula
    return 700 * (Math.pow(10, mel / 2595) - 1)
  }

  // Slaney formula (default in Librosa)
  const f_min = 0.0
  const f_sp = 200.0 / 3
  const min_log_hz = 1000.0
  const min_log_mel = (min_log_hz - f_min) / f_sp
  const logstep = Math.log(6.4) / 27.0

  if (mel < min_log_mel) {
    // Linear part
    return f_min + f_sp * mel
  } else {
    // Log part
    return min_log_hz * Math.exp(logstep * (mel - min_log_mel))
  }
}

/**
 * Create linearly spaced array
 * @param {number} start - Start value
 * @param {number} stop - Stop value
 * @param {number} num - Number of samples
 * @returns {Array} Linearly spaced array
 */
export function linspace(start, stop, num) {
  const step = (stop - start) / (num - 1)
  return Array.from({ length: num }, (_, i) => start + step * i)
}

/**
 * Compute Mel spectrogram
 * @param {Float32Array} y - Audio signal
 * @param {number} sr - Sample rate
 * @param {number} n_fft - FFT size
 * @param {number} hop_length - Hop length
 * @param {number} n_mels - Number of Mel filters
 * @param {number} fmin - Minimum frequency
 * @param {number|null} fmax - Maximum frequency
 * @returns {Array} Mel spectrogram (n_mels x n_frames)
 */
export function melspectrogram(
  y,
  sr = 22050,
  n_fft = 2048,
  hop_length = 512,
  n_mels = 128,
  fmin = 0,
  fmax = null,
) {
  // Compute power spectrogram
  const stft_matrix = stft(y, n_fft, hop_length)
  const power_spec = stft_matrix.map((frame) => {
    const mag = magnitude(frame)
    return mag.map((m) => m * m) // Power = magnitude^2
  })

  // Get Mel filterbank
  const mel_fb = mel_filterbank(sr, n_fft, n_mels, fmin, fmax)

  // Apply filterbank
  const n_frames = power_spec.length
  const mel_spec = Array(n_mels)
    .fill(null)
    .map(() => new Float32Array(n_frames))

  for (let t = 0; t < n_frames; t++) {
    for (let m = 0; m < n_mels; m++) {
      let energy = 0
      for (let f = 0; f < power_spec[t].length; f++) {
        energy += power_spec[t][f] * mel_fb[m][f]
      }
      mel_spec[m][t] = energy
    }
  }

  return mel_spec
}

/**
 * Compute Mel-Frequency Cepstral Coefficients (MFCCs)
 * @param {Float32Array} y - Audio signal
 * @param {number} sr - Sample rate
 * @param {number} n_mfcc - Number of MFCCs to return
 * @param {number} n_fft - FFT size
 * @param {number} hop_length - Hop length
 * @param {number} n_mels - Number of Mel filters
 * @param {number} fmin - Minimum frequency
 * @param {number|null} fmax - Maximum frequency
 * @returns {Array} MFCC matrix (n_mfcc x n_frames)
 */
export function mfcc(
  y,
  sr = 22050,
  n_mfcc = 20,  // Fixed: was 13, Librosa default is 20
  n_fft = 2048,
  hop_length = 512,
  n_mels = 128,
  fmin = 0,
  fmax = null,
) {
  // Compute Mel spectrogram
  const mel_spec = melspectrogram(y, sr, n_fft, hop_length, n_mels, fmin, fmax)

  // Log compression
  const log_mel = mel_spec.map((mel_band) =>
    mel_band.map((val) => Math.log(Math.max(1e-10, val))),
  )

  // DCT (Discrete Cosine Transform)
  const n_frames = log_mel[0].length
  const mfcc_matrix = Array(n_mfcc)
    .fill(null)
    .map(() => new Float32Array(n_frames))

  for (let t = 0; t < n_frames; t++) {
    // Extract frame
    const frame = log_mel.map((band) => band[t])

    // Apply DCT
    const dct_coeffs = dct(frame)

    // Keep first n_mfcc coefficients
    for (let i = 0; i < n_mfcc && i < dct_coeffs.length; i++) {
      mfcc_matrix[i][t] = dct_coeffs[i]
    }
  }

  return mfcc_matrix
}

/**
 * Discrete Cosine Transform (Type II)
 * @param {Array} signal - Input signal
 * @returns {Array} DCT coefficients
 */
export function dct(signal) {
  const N = signal.length
  const dct_coeffs = new Array(N)

  for (let k = 0; k < N; k++) {
    let sum = 0
    for (let n = 0; n < N; n++) {
      sum += signal[n] * Math.cos((Math.PI * k * (2 * n + 1)) / (2 * N))
    }

    // Normalization
    const norm = k === 0 ? Math.sqrt(1 / N) : Math.sqrt(2 / N)
    dct_coeffs[k] = norm * sum
  }

  return dct_coeffs
}

/**
 * Inverse Discrete Cosine Transform
 * @param {Array} dct_coeffs - DCT coefficients
 * @returns {Array} Reconstructed signal
 */
export function idct(dct_coeffs) {
  const N = dct_coeffs.length
  const signal = new Array(N)

  for (let n = 0; n < N; n++) {
    let sum = 0
    for (let k = 0; k < N; k++) {
      const norm = k === 0 ? Math.sqrt(1 / N) : Math.sqrt(2 / N)
      sum +=
        norm * dct_coeffs[k] * Math.cos((Math.PI * k * (2 * n + 1)) / (2 * N))
    }
    signal[n] = sum
  }

  return signal
}

/**
 * Compute delta (first-order derivative) features
 * @param {Array} features - Feature matrix (n_features x n_frames)
 * @param {number} width - Width of delta calculation window
 * @returns {Array} Delta features
 */
export function delta_features(features, width = 9) {
  const n_features = features.length
  const n_frames = features[0].length
  const deltas = Array(n_features)
    .fill(null)
    .map(() => new Float32Array(n_frames))

  const half_width = Math.floor(width / 2)

  // Regression coefficients
  const coeffs = []
  let norm = 0
  for (let i = -half_width; i <= half_width; i++) {
    coeffs.push(i)
    norm += i * i
  }

  for (let f = 0; f < n_features; f++) {
    for (let t = 0; t < n_frames; t++) {
      let delta = 0

      for (let i = -half_width; i <= half_width; i++) {
        const frame_idx = Math.max(0, Math.min(n_frames - 1, t + i))
        delta += coeffs[i + half_width] * features[f][frame_idx]
      }

      deltas[f][t] = norm > 0 ? delta / norm : 0
    }
  }

  return deltas
}

/**
 * Lifter MFCC coefficients (apply liftering window)
 * @param {Array} mfcc_matrix - MFCC matrix
 * @param {number} L - Liftering parameter
 * @returns {Array} Liftered MFCC matrix
 */
export function lifter_mfcc(mfcc_matrix, L = 22) {
  const n_mfcc = mfcc_matrix.length
  const n_frames = mfcc_matrix[0].length

  // Compute liftering weights
  const lifter_weights = new Array(n_mfcc)
  for (let i = 0; i < n_mfcc; i++) {
    lifter_weights[i] = 1 + (L / 2) * Math.sin((Math.PI * i) / L)
  }

  // Apply liftering
  const liftered = Array(n_mfcc)
    .fill(null)
    .map(() => new Float32Array(n_frames))
  for (let i = 0; i < n_mfcc; i++) {
    for (let t = 0; t < n_frames; t++) {
      liftered[i][t] = mfcc_matrix[i][t] * lifter_weights[i]
    }
  }

  return liftered
}

/**
 * Convert power spectrogram to dB scale
 * @param {Array} power_spec - Power spectrogram
 * @param {number} ref - Reference power level
 * @param {number} amin - Minimum amplitude
 * @param {number} top_db - Maximum dB range
 * @returns {Array} dB spectrogram
 */
export function power_to_db(
  power_spec,
  ref = 1.0,
  amin = 1e-10,
  top_db = 80.0,
) {
  const log_spec = power_spec.map((band) =>
    band.map((val) => {
      const magnitude = Math.max(amin, val)
      return 10 * Math.log10(magnitude / ref)
    }),
  )

  // Find maximum value for dynamic range compression
  let max_db = -Infinity
  for (let band of log_spec) {
    for (let val of band) {
      max_db = Math.max(max_db, val)
    }
  }

  // Apply top_db limit
  const threshold = max_db - top_db
  return log_spec.map((band) => band.map((val) => Math.max(threshold, val)))
}

/**
 * Get Mel frequencies for given number of filters
 * @param {number} n_mels - Number of Mel filters
 * @param {number} fmin - Minimum frequency
 * @param {number} fmax - Maximum frequency
 * @returns {Array} Mel frequencies
 */
export function mel_frequencies(n_mels, fmin = 0, fmax = 11025) {
  const mel_min = hz_to_mel(fmin)
  const mel_max = hz_to_mel(fmax)
  return linspace(mel_min, mel_max, n_mels).map((mel) => mel_to_hz(mel))
}

/**
 * Simple feature extraction for audio classification
 * @param {Float32Array} y - Audio signal
 * @param {number} sr - Sample rate
 * @returns {Object} Extracted features
 */
export function extract_mel_features(y, sr = 22050) {
  const n_mfcc = 13
  const n_mels = 40

  // Compute MFCC features
  const mfcc_features = mfcc(y, sr, n_mfcc, 2048, 512, n_mels)
  const mfcc_delta = delta_features(mfcc_features)
  const mfcc_delta2 = delta_features(mfcc_delta)

  // Compute statistics
  const mfcc_mean = mfcc_features.map(
    (band) => band.reduce((a, b) => a + b, 0) / band.length,
  )

  const mfcc_std = mfcc_features.map((band, i) =>
    Math.sqrt(
      band.reduce((acc, val) => acc + (val - mfcc_mean[i]) ** 2, 0) /
        band.length,
    ),
  )

  return {
    mfcc: mfcc_features,
    mfcc_delta: mfcc_delta,
    mfcc_delta2: mfcc_delta2,
    mfcc_mean: mfcc_mean,
    mfcc_std: mfcc_std,
  }
}
