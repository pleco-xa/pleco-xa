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
 * Compute Mel spectrogram (Librosa-compatible)
 * @param {Float32Array} y - Audio signal (optional if S provided)
 * @param {number} sr - Sample rate
 * @param {Array} S - Pre-computed power spectrogram [freq][time] (optional)
 * @param {number} n_fft - FFT size
 * @param {number} hop_length - Hop length
 * @param {number} win_length - Window length
 * @param {string} window - Window type
 * @param {boolean} center - Center frames
 * @param {string} pad_mode - Padding mode
 * @param {number} power - Exponent for magnitude to power conversion (2.0 = power, 1.0 = magnitude)
 * @param {number} n_mels - Number of Mel filters
 * @param {number} fmin - Minimum frequency
 * @param {number|null} fmax - Maximum frequency
 * @param {string|number|null} norm - Mel filterbank normalization
 * @param {boolean} htk - Use HTK formula for mel conversion
 * @returns {Array} Mel spectrogram [n_mels][n_frames]
 */
export function melspectrogram(
  y = null,
  sr = 22050,
  S = null,
  n_fft = 2048,
  hop_length = 512,
  win_length = null,
  window = 'hann',
  center = true,
  pad_mode = 'constant',
  power = 2.0,
  n_mels = 128,
  fmin = 0,
  fmax = null,
  norm = 'slaney',
  htk = false,
) {
  let power_spec

  if (S !== null) {
    // Use pre-computed spectrogram
    // Assume S is already in the correct format [freq][time]
    if (power !== 2.0 && power !== 1.0) {
      // Need to adjust power if S is not in expected power format
      console.warn(
        `Pre-computed S with power=${power} may require manual conversion`,
      )
    }
    power_spec = S
  } else if (y !== null) {
    // Compute power spectrogram from audio
    // stft() now returns [freq][time] format (Librosa-compatible)
    const stft_matrix = stft(
      y,
      n_fft,
      hop_length,
      win_length,
      window,
      center,
      pad_mode,
    )

    const n_freq = stft_matrix.length
    const n_frames = stft_matrix[0] ? stft_matrix[0].length : 0

    // Convert to power spectrogram [freq][time]
    power_spec = Array(n_freq)
    for (let f = 0; f < n_freq; f++) {
      power_spec[f] = new Float32Array(n_frames)
      for (let t = 0; t < n_frames; t++) {
        const bin = stft_matrix[f][t]
        const mag = Math.sqrt(bin.real * bin.real + bin.imag * bin.imag)
        power_spec[f][t] = Math.pow(mag, power) // Apply power exponent
      }
    }
  } else {
    throw new Error('Either y or S must be provided')
  }

  const n_freq = power_spec.length
  const n_frames = power_spec[0] ? power_spec[0].length : 0

  // Get Mel filterbank [n_mels][n_freq]
  const mel_fb = mel_filterbank(sr, n_fft, n_mels, fmin, fmax, norm, htk)

  // Apply filterbank: mel_spec[m][t] = sum_f(mel_fb[m][f] * power_spec[f][t])
  // Output: [n_mels][n_frames] (Librosa format)
  const mel_spec = Array(n_mels)
    .fill(null)
    .map(() => new Float32Array(n_frames))

  for (let m = 0; m < n_mels; m++) {
    for (let t = 0; t < n_frames; t++) {
      let energy = 0
      for (let f = 0; f < n_freq; f++) {
        energy += mel_fb[m][f] * power_spec[f][t]
      }
      mel_spec[m][t] = energy
    }
  }

  return mel_spec
}

/**
 * Compute Mel-Frequency Cepstral Coefficients (MFCCs) - Librosa-compatible
 * @param {Float32Array} y - Audio signal (optional if S provided)
 * @param {number} sr - Sample rate
 * @param {Array} S - Pre-computed mel spectrogram [n_mels][n_frames] (optional)
 * @param {number} n_mfcc - Number of MFCCs to return
 * @param {number} dct_type - DCT type (1, 2, or 3)
 * @param {string|null} norm - DCT normalization ('ortho' or null)
 * @param {number} lifter - Liftering coefficient (0 = no liftering)
 * @param {number} n_fft - FFT size
 * @param {number} hop_length - Hop length
 * @param {number} win_length - Window length
 * @param {string} window - Window type
 * @param {boolean} center - Center frames
 * @param {string} pad_mode - Padding mode
 * @param {number} power - Exponent for magnitude to power conversion
 * @param {number} n_mels - Number of Mel filters
 * @param {number} fmin - Minimum frequency
 * @param {number|null} fmax - Maximum frequency
 * @param {string|number|null} mel_norm - Mel filterbank normalization
 * @param {boolean} htk - Use HTK formula for mel conversion
 * @returns {Array} MFCC matrix (n_mfcc x n_frames)
 */
export function mfcc(
  y = null,
  sr = 22050,
  S = null,
  n_mfcc = 20,
  dct_type = 2,
  norm = 'ortho',
  lifter = 0,
  n_fft = 2048,
  hop_length = 512,
  win_length = null,
  window = 'hann',
  center = true,
  pad_mode = 'constant',
  power = 2.0,
  n_mels = 128,
  fmin = 0,
  fmax = null,
  mel_norm = 'slaney',
  htk = false,
) {
  let mel_spec

  if (S !== null) {
    // Use pre-computed mel spectrogram
    mel_spec = S
  } else if (y !== null) {
    // Compute Mel spectrogram with all parameters
    mel_spec = melspectrogram(
      y,
      sr,
      null, // S
      n_fft,
      hop_length,
      win_length,
      window,
      center,
      pad_mode,
      power,
      n_mels,
      fmin,
      fmax,
      mel_norm,
      htk,
    )
  } else {
    throw new Error('Either y or S must be provided')
  }

  const n_mel_bands = mel_spec.length
  const n_frames = mel_spec[0] ? mel_spec[0].length : 0

  // Log compression
  const log_mel = mel_spec.map((mel_band) =>
    mel_band.map((val) => Math.log(Math.max(1e-10, val))),
  )

  // DCT (Discrete Cosine Transform)
  const mfcc_matrix = Array(n_mfcc)
    .fill(null)
    .map(() => new Float32Array(n_frames))

  for (let t = 0; t < n_frames; t++) {
    // Extract frame
    const frame = log_mel.map((band) => band[t])

    // Apply DCT with specified type and normalization
    const dct_coeffs = dct(frame, dct_type, norm)

    // Keep first n_mfcc coefficients
    for (let i = 0; i < n_mfcc && i < dct_coeffs.length; i++) {
      mfcc_matrix[i][t] = dct_coeffs[i]
    }
  }

  // Apply liftering if requested
  if (lifter > 0) {
    const lifter_weights = new Array(n_mfcc)
    for (let i = 0; i < n_mfcc; i++) {
      lifter_weights[i] = 1 + (lifter / 2) * Math.sin((Math.PI * i) / lifter)
    }

    for (let i = 0; i < n_mfcc; i++) {
      for (let t = 0; t < n_frames; t++) {
        mfcc_matrix[i][t] *= lifter_weights[i]
      }
    }
  }

  return mfcc_matrix
}

/**
 * Discrete Cosine Transform (Librosa-compatible)
 * @param {Array} signal - Input signal
 * @param {number} type - DCT type (1, 2, or 3)
 * @param {string|null} norm - Normalization ('ortho' or null)
 * @returns {Array} DCT coefficients
 */
export function dct(signal, type = 2, norm = 'ortho') {
  const N = signal.length
  const dct_coeffs = new Array(N)

  if (type === 1) {
    // DCT Type-I
    for (let k = 0; k < N; k++) {
      let sum = 0
      for (let n = 0; n < N; n++) {
        const factor = n === 0 || n === N - 1 ? 0.5 : 1.0
        sum += factor * signal[n] * Math.cos((Math.PI * k * n) / (N - 1))
      }
      dct_coeffs[k] = sum

      // Apply normalization
      if (norm === 'ortho') {
        const scale = k === 0 || k === N - 1 ? Math.sqrt(1 / (N - 1)) : Math.sqrt(2 / (N - 1))
        dct_coeffs[k] *= scale
      } else {
        dct_coeffs[k] *= 2
      }
    }
  } else if (type === 2) {
    // DCT Type-II (most common, used by Librosa)
    for (let k = 0; k < N; k++) {
      let sum = 0
      for (let n = 0; n < N; n++) {
        sum += signal[n] * Math.cos((Math.PI * k * (2 * n + 1)) / (2 * N))
      }
      dct_coeffs[k] = sum

      // Apply normalization
      if (norm === 'ortho') {
        const scale = k === 0 ? Math.sqrt(1 / N) : Math.sqrt(2 / N)
        dct_coeffs[k] *= scale
      }
    }
  } else if (type === 3) {
    // DCT Type-III (inverse of Type-II)
    for (let k = 0; k < N; k++) {
      let sum = 0
      for (let n = 0; n < N; n++) {
        const factor = n === 0 ? 0.5 : 1.0
        sum += factor * signal[n] * Math.cos((Math.PI * n * (2 * k + 1)) / (2 * N))
      }
      dct_coeffs[k] = sum

      // Apply normalization
      if (norm === 'ortho') {
        dct_coeffs[k] *= Math.sqrt(2 / N)
      } else {
        dct_coeffs[k] *= 2
      }
    }
  } else {
    throw new Error(`Unsupported DCT type: ${type}. Supported types are 1, 2, and 3.`)
  }

  return dct_coeffs
}

/**
 * Inverse Discrete Cosine Transform (Librosa-compatible)
 * @param {Array} dct_coeffs - DCT coefficients
 * @param {number} type - DCT type (1, 2, or 3)
 * @param {string|null} norm - Normalization ('ortho' or null)
 * @returns {Array} Reconstructed signal
 */
export function idct(dct_coeffs, type = 2, norm = 'ortho') {
  const N = dct_coeffs.length
  const signal = new Array(N)

  if (type === 1) {
    // IDCT Type-I (inverse of DCT-I)
    for (let n = 0; n < N; n++) {
      let sum = 0
      for (let k = 0; k < N; k++) {
        const k_factor = k === 0 || k === N - 1 ? 0.5 : 1.0
        let coeff = dct_coeffs[k]

        if (norm === 'ortho') {
          const scale = k === 0 || k === N - 1 ? Math.sqrt(1 / (N - 1)) : Math.sqrt(2 / (N - 1))
          coeff *= scale
        } else {
          coeff *= 2 / (N - 1)
        }

        sum += k_factor * coeff * Math.cos((Math.PI * k * n) / (N - 1))
      }
      signal[n] = sum
    }
  } else if (type === 2) {
    // IDCT Type-II (inverse is DCT-III)
    for (let n = 0; n < N; n++) {
      let sum = 0
      for (let k = 0; k < N; k++) {
        const k_factor = k === 0 ? 0.5 : 1.0
        let coeff = dct_coeffs[k]

        if (norm === 'ortho') {
          const scale = Math.sqrt(2 / N)
          coeff *= scale
        } else {
          coeff *= 2 / N
        }

        sum += k_factor * coeff * Math.cos((Math.PI * k * (2 * n + 1)) / (2 * N))
      }
      signal[n] = sum
    }
  } else if (type === 3) {
    // IDCT Type-III (inverse is DCT-II)
    for (let n = 0; n < N; n++) {
      let sum = 0
      for (let k = 0; k < N; k++) {
        let coeff = dct_coeffs[k]

        if (norm === 'ortho') {
          const scale = k === 0 ? Math.sqrt(1 / N) : Math.sqrt(2 / N)
          coeff *= scale
        } else {
          coeff *= 1 / N
        }

        sum += coeff * Math.cos((Math.PI * n * (2 * k + 1)) / (2 * N))
      }
      signal[n] = sum
    }
  } else {
    throw new Error(`Unsupported DCT type: ${type}. Supported types are 1, 2, and 3.`)
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
