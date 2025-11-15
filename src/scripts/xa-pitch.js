/**
 * Port of librosa.core.pitch and librosa.feature.pitch tracking
 * Pitch detection and fundamental frequency estimation
 * Librosa-compatible pitch tracking for JavaScript
 */

import { stft } from './xa-fft.js'
import { frames_to_time } from './xa-convert.js'

/**
 * Pitch tracking using parabolic interpolation of peak locations in a spectrogram
 * Port of librosa.core.piptrack
 * @param {Float32Array} y - Audio time series (optional if S provided)
 * @param {number} sr - Sample rate
 * @param {Array} S - Pre-computed magnitude/power spectrogram [freq][time]
 * @param {number} n_fft - FFT window size
 * @param {number} hop_length - Hop length
 * @param {number} fmin - Minimum frequency
 * @param {number} fmax - Maximum frequency
 * @param {number} threshold - Threshold for peak detection
 * @returns {Object} {pitches: Array, magnitudes: Array} - pitch and magnitude per frame
 */
export function piptrack(
  y = null,
  sr = 22050,
  S = null,
  n_fft = 2048,
  hop_length = 512,
  fmin = 150.0,
  fmax = 4000.0,
  threshold = 0.1,
) {
  let mag_spec

  if (S !== null) {
    mag_spec = S
  } else if (y !== null) {
    // Compute magnitude spectrogram
    const D = stft(y, n_fft, hop_length, null, 'hann', true, 'constant')

    const n_freq = D.length
    const n_frames = D[0] ? D[0].length : 0

    mag_spec = Array(n_freq)
      .fill(null)
      .map(() => new Float32Array(n_frames))

    for (let f = 0; f < n_freq; f++) {
      for (let t = 0; t < n_frames; t++) {
        const bin = D[f][t]
        mag_spec[f][t] = Math.sqrt(bin.real * bin.real + bin.imag * bin.imag)
      }
    }
  } else {
    throw new Error('Either y or S must be provided')
  }

  const n_freq = mag_spec.length
  const n_frames = mag_spec[0] ? mag_spec[0].length : 0

  // Compute frequency bins
  const freqs = new Float32Array(n_freq)
  for (let i = 0; i < n_freq; i++) {
    freqs[i] = (i * sr) / n_fft
  }

  // Initialize output matrices
  const pitches = Array(n_freq)
    .fill(null)
    .map(() => new Float32Array(n_frames))
  const magnitudes = Array(n_freq)
    .fill(null)
    .map(() => new Float32Array(n_frames))

  // Find peaks in each frame
  for (let t = 0; t < n_frames; t++) {
    // Find local maxima
    for (let f = 1; f < n_freq - 1; f++) {
      const freq = freqs[f]

      // Skip if outside frequency range
      if (freq < fmin || freq > fmax) {
        continue
      }

      const mag = mag_spec[f][t]
      const mag_prev = mag_spec[f - 1][t]
      const mag_next = mag_spec[f + 1][t]

      // Check if local maximum and above threshold
      if (mag > mag_prev && mag > mag_next && mag > threshold) {
        // Parabolic interpolation for sub-bin accuracy
        const alpha = mag_prev
        const beta = mag
        const gamma = mag_next

        const p = 0.5 * (alpha - gamma) / (alpha - 2 * beta + gamma)
        const refined_bin = f + p
        const refined_freq = (refined_bin * sr) / n_fft

        pitches[f][t] = refined_freq
        magnitudes[f][t] = mag
      }
    }
  }

  return { pitches, magnitudes }
}

/**
 * Fundamental frequency (F0) estimation using the YIN algorithm
 * Port of librosa.core.yin
 * @param {Float32Array} y - Audio time series
 * @param {number} fmin - Minimum frequency to search
 * @param {number} fmax - Maximum frequency to search
 * @param {number} sr - Sample rate
 * @param {number} frame_length - Length of analysis frame
 * @param {number} win_length - Window length (default: frame_length / 2)
 * @param {number} hop_length - Hop length
 * @param {number} trough_threshold - Threshold for peak picking
 * @returns {Float32Array} F0 estimates per frame (0 = unvoiced)
 */
export function yin(
  y,
  fmin = 80.0,
  fmax = 400.0,
  sr = 22050,
  frame_length = 2048,
  win_length = null,
  hop_length = null,
  trough_threshold = 0.1,
) {
  if (win_length === null) {
    win_length = Math.floor(frame_length / 2)
  }
  if (hop_length === null) {
    hop_length = Math.floor(frame_length / 4)
  }

  // Compute lag range from frequency range
  const min_lag = Math.max(1, Math.floor(sr / fmax))
  const max_lag = Math.min(Math.floor(frame_length / 2), Math.floor(sr / fmin))

  // Number of frames
  const n_frames = Math.floor((y.length - frame_length) / hop_length) + 1

  const f0 = new Float32Array(n_frames)

  // Process each frame
  for (let i = 0; i < n_frames; i++) {
    const start = i * hop_length
    const frame = y.slice(start, start + frame_length)

    // Compute YIN difference function
    const yin_df = compute_yin_difference(frame, max_lag)

    // Cumulative mean normalized difference
    const yin_cmnd = cumulative_mean_normalized_difference(yin_df)

    // Find the first trough below threshold
    let tau = -1
    for (let lag = min_lag; lag < max_lag; lag++) {
      if (yin_cmnd[lag] < trough_threshold) {
        // Find local minimum after this point
        while (lag + 1 < max_lag && yin_cmnd[lag + 1] < yin_cmnd[lag]) {
          lag++
        }
        tau = lag
        break
      }
    }

    // If no trough found, find absolute minimum
    if (tau === -1) {
      let min_val = Infinity
      for (let lag = min_lag; lag < max_lag; lag++) {
        if (yin_cmnd[lag] < min_val) {
          min_val = yin_cmnd[lag]
          tau = lag
        }
      }
    }

    // Parabolic interpolation for sub-sample accuracy
    if (tau > 0 && tau < max_lag - 1) {
      const better_tau = parabolic_interpolation(
        yin_cmnd,
        tau,
      )
      f0[i] = sr / better_tau
    } else if (tau > 0) {
      f0[i] = sr / tau
    } else {
      f0[i] = 0 // Unvoiced
    }
  }

  return f0
}

/**
 * Probabilistic YIN (pYIN) algorithm for pitch tracking
 * Port of librosa.core.pyin
 * @param {Float32Array} y - Audio time series
 * @param {number} fmin - Minimum frequency
 * @param {number} fmax - Maximum frequency
 * @param {number} sr - Sample rate
 * @param {number} frame_length - Frame length
 * @param {number} win_length - Window length
 * @param {number} hop_length - Hop length
 * @param {number} n_thresholds - Number of thresholds for pYIN
 * @param {number} beta_parameters - Beta distribution parameters [a, b]
 * @param {boolean} boltzmann_parameter - Boltzmann distribution parameter
 * @param {boolean} fill_na - Fill unvoiced frames with NaN
 * @returns {Object} {f0: Array, voiced_flag: Array, voiced_prob: Array}
 */
export function pyin(
  y,
  fmin = 80.0,
  fmax = 400.0,
  sr = 22050,
  frame_length = 2048,
  win_length = null,
  hop_length = null,
  n_thresholds = 100,
  beta_parameters = [2, 18],
  boltzmann_parameter = 2,
  fill_na = null,
) {
  if (win_length === null) {
    win_length = Math.floor(frame_length / 2)
  }
  if (hop_length === null) {
    hop_length = Math.floor(frame_length / 4)
  }

  // Compute lag range
  const min_lag = Math.max(1, Math.floor(sr / fmax))
  const max_lag = Math.min(Math.floor(frame_length / 2), Math.floor(sr / fmin))

  // Generate thresholds using beta distribution
  const thresholds = []
  for (let i = 0; i < n_thresholds; i++) {
    const t = i / (n_thresholds - 1)
    // Simplified beta distribution approximation
    const beta_val = beta_pdf(t, beta_parameters[0], beta_parameters[1])
    thresholds.push(beta_val * 0.99 + 0.01)
  }

  // Number of frames
  const n_frames = Math.floor((y.length - frame_length) / hop_length) + 1

  // Store observations for each threshold
  const observations = Array(n_thresholds)
    .fill(null)
    .map(() => new Float32Array(n_frames))

  // Process each frame with each threshold
  for (let t_idx = 0; t_idx < n_thresholds; t_idx++) {
    const threshold = thresholds[t_idx]

    for (let i = 0; i < n_frames; i++) {
      const start = i * hop_length
      const frame = y.slice(start, start + frame_length)

      // Compute YIN
      const yin_df = compute_yin_difference(frame, max_lag)
      const yin_cmnd = cumulative_mean_normalized_difference(yin_df)

      // Find period with this threshold
      let tau = -1
      for (let lag = min_lag; lag < max_lag; lag++) {
        if (yin_cmnd[lag] < threshold) {
          while (lag + 1 < max_lag && yin_cmnd[lag + 1] < yin_cmnd[lag]) {
            lag++
          }
          tau = lag
          break
        }
      }

      if (tau > 0 && tau < max_lag - 1) {
        const better_tau = parabolic_interpolation(yin_cmnd, tau)
        observations[t_idx][i] = sr / better_tau
      } else {
        observations[t_idx][i] = 0
      }
    }
  }

  // Compute probabilistic estimate (simplified - use median)
  const f0 = new Float32Array(n_frames)
  const voiced_prob = new Float32Array(n_frames)
  const voiced_flag = new Array(n_frames)

  for (let i = 0; i < n_frames; i++) {
    const frame_obs = observations.map((obs) => obs[i]).filter((f) => f > 0)

    if (frame_obs.length > 0) {
      // Median of observations
      frame_obs.sort((a, b) => a - b)
      f0[i] = frame_obs[Math.floor(frame_obs.length / 2)]
      voiced_prob[i] = frame_obs.length / n_thresholds
      voiced_flag[i] = voiced_prob[i] > 0.5
    } else {
      f0[i] = fill_na !== null ? fill_na : 0
      voiced_prob[i] = 0
      voiced_flag[i] = false
    }
  }

  return { f0, voiced_flag, voiced_prob }
}

/**
 * Compute YIN difference function
 * @param {Float32Array} frame - Audio frame
 * @param {number} max_lag - Maximum lag
 * @returns {Float32Array} Difference function
 */
function compute_yin_difference(frame, max_lag) {
  const df = new Float32Array(max_lag)

  for (let tau = 0; tau < max_lag; tau++) {
    let sum = 0
    for (let j = 0; j < frame.length - max_lag; j++) {
      const delta = frame[j] - frame[j + tau]
      sum += delta * delta
    }
    df[tau] = sum
  }

  return df
}

/**
 * Compute cumulative mean normalized difference function
 * @param {Float32Array} df - Difference function
 * @returns {Float32Array} CMND function
 */
function cumulative_mean_normalized_difference(df) {
  const cmnd = new Float32Array(df.length)
  cmnd[0] = 1.0

  let running_sum = 0
  for (let tau = 1; tau < df.length; tau++) {
    running_sum += df[tau]
    cmnd[tau] = df[tau] / (running_sum / tau)
  }

  return cmnd
}

/**
 * Parabolic interpolation for sub-sample peak location
 * @param {Float32Array} arr - Array to interpolate
 * @param {number} idx - Peak index
 * @returns {number} Interpolated peak location
 */
function parabolic_interpolation(arr, idx) {
  if (idx <= 0 || idx >= arr.length - 1) {
    return idx
  }

  const alpha = arr[idx - 1]
  const beta = arr[idx]
  const gamma = arr[idx + 1]

  const p = 0.5 * (alpha - gamma) / (alpha - 2 * beta + gamma)
  return idx + p
}

/**
 * Simplified beta distribution PDF
 * @param {number} x - Input value [0, 1]
 * @param {number} a - Alpha parameter
 * @param {number} b - Beta parameter
 * @returns {number} PDF value
 */
function beta_pdf(x, a, b) {
  if (x <= 0 || x >= 1) {
    return 0
  }

  // Simplified beta PDF (not properly normalized)
  return Math.pow(x, a - 1) * Math.pow(1 - x, b - 1)
}

/**
 * Estimate pitch using autocorrelation method
 * @param {Float32Array} y - Audio time series
 * @param {number} sr - Sample rate
 * @param {number} fmin - Minimum frequency
 * @param {number} fmax - Maximum frequency
 * @param {number} frame_length - Frame length
 * @param {number} hop_length - Hop length
 * @returns {Float32Array} F0 estimates per frame
 */
export function autocorrelation_pitch(
  y,
  sr = 22050,
  fmin = 80.0,
  fmax = 400.0,
  frame_length = 2048,
  hop_length = 512,
) {
  const min_lag = Math.max(1, Math.floor(sr / fmax))
  const max_lag = Math.min(Math.floor(frame_length / 2), Math.floor(sr / fmin))

  const n_frames = Math.floor((y.length - frame_length) / hop_length) + 1
  const f0 = new Float32Array(n_frames)

  for (let i = 0; i < n_frames; i++) {
    const start = i * hop_length
    const frame = y.slice(start, start + frame_length)

    // Compute autocorrelation
    const ac = autocorrelate(frame, max_lag)

    // Find maximum in lag range
    let max_val = -Infinity
    let max_lag_idx = min_lag

    for (let lag = min_lag; lag < max_lag; lag++) {
      if (ac[lag] > max_val) {
        max_val = ac[lag]
        max_lag_idx = lag
      }
    }

    // Parabolic interpolation
    if (max_lag_idx > min_lag && max_lag_idx < max_lag - 1) {
      const refined_lag = parabolic_interpolation(ac, max_lag_idx)
      f0[i] = sr / refined_lag
    } else {
      f0[i] = sr / max_lag_idx
    }
  }

  return f0
}

/**
 * Compute autocorrelation
 * @param {Float32Array} frame - Audio frame
 * @param {number} max_lag - Maximum lag
 * @returns {Float32Array} Autocorrelation
 */
function autocorrelate(frame, max_lag) {
  const ac = new Float32Array(max_lag)

  for (let lag = 0; lag < max_lag; lag++) {
    let sum = 0
    for (let i = 0; i < frame.length - lag; i++) {
      sum += frame[i] * frame[i + lag]
    }
    ac[lag] = sum
  }

  // Normalize by lag 0 (optional)
  if (ac[0] > 0) {
    for (let lag = 0; lag < max_lag; lag++) {
      ac[lag] /= ac[0]
    }
  }

  return ac
}

/**
 * Convert pitch (Hz) to MIDI note number
 * @param {Float32Array|Array} pitches - Pitches in Hz
 * @returns {Float32Array} MIDI note numbers
 */
export function hz_to_midi_pitch(pitches) {
  const midi = new Float32Array(pitches.length)

  for (let i = 0; i < pitches.length; i++) {
    if (pitches[i] > 0) {
      midi[i] = 12 * Math.log2(pitches[i] / 440.0) + 69
    } else {
      midi[i] = 0
    }
  }

  return midi
}

/**
 * Estimate pitch salience (confidence)
 * @param {Float32Array} y - Audio time series
 * @param {Float32Array} f0 - F0 estimates
 * @param {number} sr - Sample rate
 * @param {number} hop_length - Hop length
 * @returns {Float32Array} Salience values [0, 1]
 */
export function pitch_salience(y, f0, sr = 22050, hop_length = 512) {
  const n_frames = f0.length
  const salience = new Float32Array(n_frames)

  for (let i = 0; i < n_frames; i++) {
    if (f0[i] === 0) {
      salience[i] = 0
      continue
    }

    const start = i * hop_length
    const frame_length = 2048
    const frame = y.slice(start, Math.min(start + frame_length, y.length))

    // Compute autocorrelation at the estimated pitch period
    const period = Math.round(sr / f0[i])

    if (period > 0 && period < frame.length / 2) {
      let sum_prod = 0
      let sum_sq1 = 0
      let sum_sq2 = 0

      for (let j = 0; j < frame.length - period; j++) {
        sum_prod += frame[j] * frame[j + period]
        sum_sq1 += frame[j] * frame[j]
        sum_sq2 += frame[j + period] * frame[j + period]
      }

      // Normalized correlation coefficient
      const denom = Math.sqrt(sum_sq1 * sum_sq2)
      if (denom > 0) {
        salience[i] = Math.max(0, Math.min(1, sum_prod / denom))
      }
    }
  }

  return salience
}

/**
 * Smooth pitch contour using median filtering
 * @param {Float32Array} f0 - F0 estimates
 * @param {number} window_size - Median filter window size (odd number)
 * @returns {Float32Array} Smoothed F0
 */
export function smooth_pitch(f0, window_size = 5) {
  const half_window = Math.floor(window_size / 2)
  const smoothed = new Float32Array(f0.length)

  for (let i = 0; i < f0.length; i++) {
    const window = []

    for (let j = Math.max(0, i - half_window); j <= Math.min(f0.length - 1, i + half_window); j++) {
      if (f0[j] > 0) {
        window.push(f0[j])
      }
    }

    if (window.length > 0) {
      window.sort((a, b) => a - b)
      smoothed[i] = window[Math.floor(window.length / 2)]
    } else {
      smoothed[i] = 0
    }
  }

  return smoothed
}
