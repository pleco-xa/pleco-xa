/**
 * Audio processing for JavaScript
 * Advanced audio manipulation including HPSS, pitch shifting, and pitch detection
 *
 * SHIM (Wave 5A): hpss / phase_vocoder / time_stretch / pitch_shift delegate
 * to the canonical implementations in src/decompose/index.js
 * and src/effects/index.js (fixture-gated: hpss.json, phase_vocoder.json).
 * The legacy local copies returned raw median-filtered spectrograms from
 * hpss (not a decomposition of S), wrapped the raw phase delta instead of
 * the deviation in phase_vocoder, and time_stretch/pitch_shift crashed on a
 * dead require of a removed FFT module with inverted rate semantics.
 */

import { hpss as hpssCanonical } from '../decompose/index.js'
import {
  phase_vocoder as phaseVocoderCanonical,
  time_stretch as timeStretchCanonical,
  pitch_shift as pitchShiftCanonical,
} from '../effects/index.js'

/**
 * Harmonic-Percussive Source Separation (HPSS)
 * Default output is the MASKED components S*mask_H / S*mask_P, so
 * harmonic + percussive ≈ S at margin=1.
 * @param {Array} S - Magnitude (or complex) spectrogram (freq x time)
 * @param {number|Array} kernel_size - Median filter kernel size(s)
 * @param {number} power - Power for soft masking
 * @param {boolean} mask - Whether to return the soft masks instead
 * @returns {Object} {harmonic, percussive} components (or masks)
 */
export function hpss(S, kernel_size = 31, power = 2.0, mask = false) {
  return hpssCanonical(S, { kernel_size, power, mask })
}

/**
 * Horizontal median filter (for harmonic enhancement)
 * @param {Array} S - Input spectrogram
 * @param {number} kernel_size - Filter kernel size
 * @returns {Array} Horizontally filtered spectrogram
 */
export function median_filter_horizontal(S, kernel_size) {
  return S.map((row) => median_filter_1d(row, kernel_size))
}

/**
 * Vertical median filter (for percussive enhancement)
 * @param {Array} S - Input spectrogram
 * @param {number} kernel_size - Filter kernel size
 * @returns {Array} Vertically filtered spectrogram
 */
export function median_filter_vertical(S, kernel_size) {
  const n_freq = S.length
  const n_time = S[0].length
  const result = Array(n_freq)
    .fill(null)
    .map(() => new Float32Array(n_time))

  for (let j = 0; j < n_time; j++) {
    const column = S.map((row) => row[j])
    const filtered = median_filter_1d(column, kernel_size)

    for (let i = 0; i < n_freq; i++) {
      result[i][j] = filtered[i]
    }
  }

  return result
}

/**
 * 1D median filter
 * @param {Array} array - Input array
 * @param {number} kernel_size - Filter kernel size
 * @returns {Array} Filtered array
 */
export function median_filter_1d(array, kernel_size) {
  const half_kernel = Math.floor(kernel_size / 2)
  const result = new Float32Array(array.length)

  for (let i = 0; i < array.length; i++) {
    const start = Math.max(0, i - half_kernel)
    const end = Math.min(array.length, i + half_kernel + 1)

    const window = array.slice(start, end)
    result[i] = median(window)
  }

  return result
}

/**
 * Calculate median of array
 * @param {Array} array - Input array
 * @returns {number} Median value
 */
export function median(array) {
  const sorted = Array.from(array).sort((a, b) => a - b)
  const mid = Math.floor(sorted.length / 2)

  if (sorted.length % 2 === 0) {
    return (sorted[mid - 1] + sorted[mid]) / 2
  } else {
    return sorted[mid]
  }
}

/**
 * Pitch shift using phase vocoder
 * @param {Float32Array} y - Audio signal
 * @param {number} sr - Sample rate
 * @param {number} n_steps - Number of semitones to shift
 * @param {number} bins_per_octave - Bins per octave (default 12)
 * @returns {Float32Array} Pitch-shifted audio
 */
export function pitch_shift(y, sr, n_steps, bins_per_octave = 12) {
  return pitchShiftCanonical(y, sr, n_steps, { bins_per_octave })
}

/**
 * Phase vocoder for time-stretching an STFT matrix.
 * NOTE: operates on the [freq][time] layout produced by xa-fft.js stft —
 * the legacy version here expected a [time][freq] layout that nothing in
 * the library produced.
 * @param {Array} D - STFT matrix [freq][time] of {real, imag} bins
 * @param {number} rate - Time stretch factor (>1 faster, <1 slower)
 * @param {number|null} hop_length - Hop length (default n_fft/4 inferred from D)
 * @param {number|null} n_fft - FFT size (default 2*(D.length-1))
 * @returns {Array} Stretched STFT matrix [freq][ceil(time/rate)]
 */
export function phase_vocoder(D, rate, hop_length = null, n_fft = null) {
  return phaseVocoderCanonical(D, rate, { hop_length, n_fft })
}

/**
 * Monophonic pitch detection using autocorrelation
 * @param {Float32Array} y - Audio signal
 * @param {number} sr - Sample rate
 * @param {number} hop_length - Hop length
 * @param {number} fmin - Minimum frequency to detect
 * @param {number} fmax - Maximum frequency to detect
 * @returns {Object} Pitch and confidence arrays
 */
export function monophonic_pitch_detect(
  y,
  sr = 22050,
  hop_length = 512,
  fmin = 60,
  fmax = 600,
) {
  const pitches = []
  const confidences = []
  const frame_length = 2048

  for (let i = 0; i <= y.length - frame_length; i += hop_length) {
    const frame = y.slice(i, i + frame_length)

    // Autocorrelation method
    const ac = autocorrelate(frame)

    // Find peaks
    const minPeriod = Math.floor(sr / fmax)
    const maxPeriod = Math.floor(sr / fmin)

    let maxVal = 0
    let bestPeriod = 0

    for (
      let period = minPeriod;
      period < maxPeriod && period < ac.length;
      period++
    ) {
      if (ac[period] > maxVal) {
        maxVal = ac[period]
        bestPeriod = period
      }
    }

    const pitch = bestPeriod > 0 ? sr / bestPeriod : 0
    const confidence = ac[0] > 0 ? maxVal / ac[0] : 0 // Normalized confidence

    pitches.push(pitch)
    confidences.push(confidence)
  }

  return { pitches, confidences }
}

/**
 * Autocorrelation function
 * @param {Float32Array} buffer - Input buffer
 * @returns {Float32Array} Autocorrelation result
 */
export function autocorrelate(buffer) {
  const n = buffer.length
  const ac = new Float32Array(n)

  for (let lag = 0; lag < n; lag++) {
    let sum = 0
    for (let i = 0; i < n - lag; i++) {
      sum += buffer[i] * buffer[i + lag]
    }
    ac[lag] = sum
  }

  return ac
}

/**
 * Simple polynomial fitting for trend analysis
 * @param {Array} x - X values
 * @param {Array} y - Y values
 * @param {number} degree - Polynomial degree (1 for linear)
 * @returns {Array} Polynomial coefficients
 */
export function polyfit(x, y, degree) {
  const n = x.length

  // For linear fitting only (degree = 1)
  if (degree === 1) {
    const sumX = x.reduce((a, b) => a + b, 0)
    const sumY = y.reduce((a, b) => a + b, 0)
    const sumXY = x.reduce((acc, xi, i) => acc + xi * y[i], 0)
    const sumX2 = x.reduce((acc, xi) => acc + xi * xi, 0)

    const slope = (n * sumXY - sumX * sumY) / (n * sumX2 - sumX * sumX)
    const intercept = (sumY - slope * sumX) / n

    return [intercept, slope] // [a0, a1] for y = a0 + a1*x
  }

  // For higher degrees, return simple linear fit
  return polyfit(x, y, 1)
}

/**
 * Apply polynomial to x values
 * @param {Array} coeffs - Polynomial coefficients
 * @param {Array} x - X values
 * @returns {Array} Y values
 */
export function polyval(coeffs, x) {
  return x.map((xi) => {
    let result = 0
    for (let i = 0; i < coeffs.length; i++) {
      result += coeffs[i] * Math.pow(xi, i)
    }
    return result
  })
}

/**
 * Time stretching without pitch change
 * @param {Float32Array} y - Audio signal
 * @param {number} rate - Time stretch factor (>1 = faster, <1 = slower)
 * @returns {Float32Array} Time-stretched audio, length round(y.length / rate)
 */
export function time_stretch(y, rate) {
  return timeStretchCanonical(y, rate)
}

/**
 * Spectral gating (noise reduction)
 * @param {Array} S - Magnitude spectrogram
 * @param {number} alpha - Gating factor (0-1)
 * @param {number} beta - Threshold factor
 * @returns {Array} Gated spectrogram
 */
export function spectral_gate(S, alpha = 0.1, beta = 0.3) {
  const n_freq = S.length
  const n_time = S[0].length

  // Estimate noise floor for each frequency bin
  const noise_floor = new Array(n_freq)
  for (let f = 0; f < n_freq; f++) {
    const sorted = [...S[f]].sort((a, b) => a - b)
    noise_floor[f] = sorted[Math.floor(sorted.length * alpha)]
  }

  // Apply gating
  const gated = Array(n_freq)
    .fill(null)
    .map(() => new Float32Array(n_time))

  for (let f = 0; f < n_freq; f++) {
    const threshold = noise_floor[f] * (1 + beta)
    for (let t = 0; t < n_time; t++) {
      if (S[f][t] > threshold) {
        gated[f][t] = S[f][t]
      } else {
        gated[f][t] = S[f][t] * alpha // Reduce but don't eliminate
      }
    }
  }

  return gated
}

/**
 * Onset enhancement using spectral flux
 * @param {Array} S - Magnitude spectrogram
 * @param {number} lag - Number of frames to look back
 * @returns {Array} Enhanced spectrogram
 */
export function enhance_onsets(S, lag = 1) {
  const n_freq = S.length
  const n_time = S[0].length
  const enhanced = Array(n_freq)
    .fill(null)
    .map(() => new Float32Array(n_time))

  for (let f = 0; f < n_freq; f++) {
    for (let t = 0; t < n_time; t++) {
      if (t >= lag) {
        const diff = S[f][t] - S[f][t - lag]
        enhanced[f][t] = Math.max(0, diff) // Half-wave rectification
      } else {
        enhanced[f][t] = S[f][t]
      }
    }
  }

  return enhanced
}

/**
 * Spectral whitening
 * @param {Array} S - Magnitude spectrogram
 * @param {number} smooth_length - Smoothing window length
 * @returns {Array} Whitened spectrogram
 */
export function spectral_whiten(S, smooth_length = 101) {
  const n_freq = S.length
  const n_time = S[0].length
  const whitened = Array(n_freq)
    .fill(null)
    .map(() => new Float32Array(n_time))

  for (let f = 0; f < n_freq; f++) {
    // Smooth the spectrum to estimate local average
    const smoothed = median_filter_1d(S[f], smooth_length)

    // Normalize by local average
    for (let t = 0; t < n_time; t++) {
      whitened[f][t] = smoothed[t] > 0 ? S[f][t] / smoothed[t] : 0
    }
  }

  return whitened
}
