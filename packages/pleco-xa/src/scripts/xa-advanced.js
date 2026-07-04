/**
 * Advanced Functions Module
 * Web-ready JavaScript implementation of advanced audio processing functions
 *
 * Provides the missing foundational functions for complete audio analysis:
 * - Feature normalization and processing
 * - Zero crossing rate and RMS energy
 * - Harmonic-percussive source separation (HPSS)
 * - Pitch shifting and phase vocoder
 * - Monophonic pitch detection
 * - Advanced signal processing utilities
 *
 * @author Pleco-XA Audio Analysis Suite
 * @version 1.0.0
 */

import { _amax } from './_arrstat.js'
import { stft as stftTransform, istft as istftTransform } from './xa-fft.js'
import { hpss as hpssCanonical } from '../decompose/index.js'
import {
  phase_vocoder as phaseVocoderCanonical,
  pitch_shift as pitchShiftCanonical,
} from '../effects/index.js'

/**
 * Custom error class for parameter validation
 */
class ParameterError extends Error {
  constructor(message) {
    super(message)
    this.name = 'ParameterError'
  }
}

// ============= FEATURE NORMALIZATION =============

/**
 * Normalize features using L1, L2, or infinity norm
 * @param {Array<Array<number>>} features - Feature matrix [n_features x n_frames]
 * @param {string} norm - Normalization type ('l1', 'l2', 'inf')
 * @param {number} axis - Axis along which to normalize (0 or 1)
 * @returns {Array<Array<number>>} Normalized features
 */
export function normalize_features(features, norm = 'l2', axis = 0) {
  if (!features || features.length === 0) {
    throw new ParameterError('Features array cannot be empty')
  }

  // Create a deep copy of the features array
  const normalized = features.map((row) => [...row])

  // Normalization function map for better performance
  const normFunctions = {
    l1: (arr) => arr.reduce((acc, val) => acc + Math.abs(val), 0),
    l2: (arr) => Math.sqrt(arr.reduce((acc, val) => acc + val * val, 0)),
    inf: (arr) => _amax(arr.map(Math.abs)),
  }

  const normFunc = normFunctions[norm]
  if (!normFunc) throw new ParameterError(`Unknown norm type: ${norm}`)

  if (axis === 0) {
    // Normalize each feature dimension across time
    for (let featIdx = 0; featIdx < features.length; featIdx++) {
      const feature = features[featIdx]
      const normValue = normFunc(feature)

      if (normValue > 1e-10) {
        const invNorm = 1 / normValue
        for (let i = 0; i < feature.length; i++) {
          normalized[featIdx][i] = feature[i] * invNorm
        }
      }
    }
  } else if (axis === 1) {
    // Normalize each time frame across features
    const nFrames = features[0].length
    for (let frameIdx = 0; frameIdx < nFrames; frameIdx++) {
      const frame = features.map((feature) => feature[frameIdx])
      const normValue = normFunc(frame)

      if (normValue > 1e-10) {
        const invNorm = 1 / normValue
        for (let featIdx = 0; featIdx < features.length; featIdx++) {
          normalized[featIdx][frameIdx] = features[featIdx][frameIdx] * invNorm
        }
      }
    }
  }

  return normalized
}

// ============= ZERO CROSSING RATE =============

/**
 * Compute zero crossing rate for audio frames
 * @param {Float32Array} y - Audio signal
 * @param {number} frame_length - Frame length in samples
 * @param {number} hop_length - Hop length in samples
 * @param {boolean} center - Whether to center frames
 * @returns {Float32Array} Zero crossing rate for each frame
 */
export function zero_crossing_rate(
  y,
  frame_length = 2048,
  hop_length = 512,
  center = true,
) {
  if (!y || y.length === 0) {
    throw new ParameterError('Audio signal cannot be empty')
  }

  const startOffset = center ? Math.floor(frame_length / 2) : 0
  const numFrames =
    Math.floor((y.length + startOffset - frame_length) / hop_length) + 1
  const zcr = new Float32Array(numFrames)

  for (
    let i = 0, frameIdx = 0;
    i + frame_length <= y.length + startOffset;
    i += hop_length, frameIdx++
  ) {
    const start = Math.max(0, i - startOffset)
    const end = Math.min(y.length, start + frame_length)

    let crossings = 0
    for (let j = start + 1; j < end; j++) {
      // XOR of sign bits is faster than comparing signs
      if (y[j] >= 0 !== y[j - 1] >= 0) {
        crossings++
      }
    }

    zcr[frameIdx] = crossings / frame_length
  }

  return zcr
}

// ============= RMS ENERGY =============

/**
 * Compute RMS (Root Mean Square) energy for audio frames
 * @param {Float32Array} y - Audio signal
 * @param {number} frame_length - Frame length in samples
 * @param {number} hop_length - Hop length in samples
 * @param {boolean} center - Whether to center frames
 * @returns {Float32Array} RMS energy for each frame
 */
export function rms(y, frame_length = 2048, hop_length = 512, center = true) {
  if (!y || y.length === 0) {
    throw new ParameterError('Audio signal cannot be empty')
  }

  const startOffset = center ? Math.floor(frame_length / 2) : 0
  const numFrames =
    Math.floor((y.length + startOffset - frame_length) / hop_length) + 1
  const rms_values = new Float32Array(numFrames)

  for (
    let i = 0, frameIdx = 0;
    i + frame_length <= y.length + startOffset;
    i += hop_length, frameIdx++
  ) {
    const start = Math.max(0, i - startOffset)
    const end = Math.min(y.length, start + frame_length)

    let sum = 0
    for (let j = start; j < end; j++) {
      sum += y[j] * y[j]
    }

    rms_values[frameIdx] = Math.sqrt(sum / (end - start))
  }

  return rms_values
}

// ============= HARMONIC-PERCUSSIVE SOURCE SEPARATION =============

/**
 * Harmonic-Percussive Source Separation using median filtering
 * @param {Array<Array<number>>} S - Magnitude spectrogram [freq x time]
 * @param {number} kernel_size - Median filter kernel size
 * @param {number} power - Power for soft masking
 * @param {boolean} mask - Whether to return soft masks
 * @returns {Object} {harmonic, percussive} components
 */
export function hpss(S, kernel_size = 31, power = 2.0, mask = false) {
  // SHIM (Wave 5A): delegates to the canonical HPSS in
  // src/decompose/index.js (fixture-gated: hpss.json). The legacy local copy
  // returned raw median-filtered spectrograms by default (not a decomposition
  // of S) and used shrinking window boundaries instead of reflect.
  if (!S || S.length === 0) {
    throw new ParameterError('Spectrogram cannot be empty')
  }
  return hpssCanonical(S, { kernel_size, power, mask })
}

// ============= PITCH SHIFTING =============

/**
 * Pitch shift audio using phase vocoder
 * @param {Float32Array} y - Audio signal
 * @param {number} sr - Sample rate
 * @param {number} n_steps - Number of semitones to shift
 * @param {number} bins_per_octave - Number of bins per octave
 * @returns {Float32Array} Pitch-shifted audio
 */
export function pitch_shift(y, sr, n_steps, bins_per_octave = 12) {
  // SHIM (Wave 5A): delegates to the canonical pitch_shift
  // (time_stretch → resample → fix_length) in src/effects/index.js. The
  // legacy local copy phase-vocoded without the resample step (a duration
  // change, not a pitch change) through a phase vocoder that never read the
  // input phase.
  if (!y || y.length === 0) {
    throw new ParameterError('Audio signal cannot be empty')
  }
  return pitchShiftCanonical(y, sr, n_steps, { bins_per_octave })
}

/**
 * Phase vocoder for time-stretching an STFT matrix.
 * SHIM (Wave 5A): delegates to the canonical implementation
 * in src/effects/index.js (fixture-gated: phase_vocoder.json). The legacy
 * local copy ignored the input phase entirely (magnitude-only robotization)
 * and skipped magnitude interpolation.
 * @param {Array} D - STFT matrix [freq][time] of {real, imag} bins
 * @param {number} rate - Time stretch/compression rate (>1 faster)
 * @returns {Array} Modified STFT matrix [freq][ceil(time/rate)]
 */
export function phase_vocoder(D, rate) {
  if (!D || D.length === 0 || !D[0] || D[0].length === 0) {
    throw new ParameterError('Empty STFT matrix')
  }
  return phaseVocoderCanonical(D, rate)
}

// ============= MONOPHONIC PITCH DETECTION =============

/**
 * Detect fundamental frequency using autocorrelation
 * @param {Float32Array} y - Audio signal
 * @param {number} sr - Sample rate
 * @param {number} hop_length - Hop length for frame analysis
 * @param {number} fmin - Minimum frequency to detect
 * @param {number} fmax - Maximum frequency to detect
 * @returns {Object} {pitches, confidences} arrays
 */
export function monophonic_pitch_detect(
  y,
  sr = 22050,
  hop_length = 512,
  fmin = 60,
  fmax = 600,
) {
  if (!y || y.length === 0) {
    throw new ParameterError('Audio signal cannot be empty')
  }

  const frame_length = 2048
  const numFrames = Math.floor((y.length - frame_length) / hop_length) + 1
  const pitches = new Float32Array(numFrames)
  const confidences = new Float32Array(numFrames)

  // Convert frequency range to period range
  const minPeriod = Math.floor(sr / fmax)
  const maxPeriod = Math.floor(sr / fmin)

  for (
    let i = 0, frameIdx = 0;
    i <= y.length - frame_length;
    i += hop_length, frameIdx++
  ) {
    const frame = y.slice(i, i + frame_length)
    const ac = autocorrelate(frame)

    let maxVal = 0
    let bestPeriod = 0

    // Find peak in autocorrelation within valid period range
    for (
      let period = minPeriod;
      period < Math.min(maxPeriod, ac.length / 2);
      period++
    ) {
      if (ac[period] > maxVal) {
        maxVal = ac[period]
        bestPeriod = period
      }
    }

    pitches[frameIdx] = bestPeriod > 0 ? sr / bestPeriod : 0
    confidences[frameIdx] =
      ac[0] > 0 ? Math.max(0, Math.min(1, maxVal / ac[0])) : 0
  }

  return { pitches, confidences }
}

/**
 * Compute autocorrelation of a signal
 * @param {Float32Array} buffer - Input signal
 * @returns {Float32Array} Autocorrelation function
 */
export function autocorrelate(buffer) {
  const n = buffer.length
  const ac = new Float32Array(n)

  // Compute autocorrelation using FFT for large buffers
  if (n > 1024) {
    // This would use FFT-based autocorrelation
    // Placeholder for actual implementation
    for (let lag = 0; lag < n; lag++) {
      let sum = 0
      for (let i = 0; i < n - lag; i++) {
        sum += buffer[i] * buffer[i + lag]
      }
      ac[lag] = sum
    }
  } else {
    // Direct computation for smaller buffers
    for (let lag = 0; lag < n; lag++) {
      let sum = 0
      const nSamples = n - lag
      for (let i = 0; i < nSamples; i++) {
        sum += buffer[i] * buffer[i + lag]
      }
      ac[lag] = sum / nSamples // Normalize by number of samples
    }
  }

  return ac
}

// ============= UTILITY FUNCTIONS =============

/**
 * Simple polynomial fitting (linear regression for degree=1)
 * @param {Array<number>} x - X values
 * @param {Array<number>} y - Y values
 * @param {number} degree - Polynomial degree (1 for linear)
 * @returns {Array<number>} Polynomial coefficients
 */
export function polyfit(x, y, degree = 1) {
  if (!x || !y || x.length !== y.length) {
    throw new ParameterError('X and Y arrays must have same length')
  }

  const n = x.length
  const coeffs = new Array(degree + 1).fill(0)

  if (degree === 1) {
    // Linear regression - optimized calculation
    let sumX = 0,
      sumY = 0,
      sumXY = 0,
      sumX2 = 0

    for (let i = 0; i < n; i++) {
      sumX += x[i]
      sumY += y[i]
      sumXY += x[i] * y[i]
      sumX2 += x[i] * x[i]
    }

    const denominator = n * sumX2 - sumX * sumX
    if (Math.abs(denominator) > 1e-10) {
      coeffs[1] = (n * sumXY - sumX * sumY) / denominator // slope
      coeffs[0] = (sumY - coeffs[1] * sumX) / n // intercept
    }
  }

  return coeffs
}

/**
 * Generate linearly spaced array
 * @param {number} start - Start value
 * @param {number} stop - Stop value
 * @param {number} num - Number of values
 * @returns {Array<number>} Linearly spaced array
 */
export function linspace(start, stop, num) {
  if (num <= 0) {
    throw new ParameterError('Number of samples must be positive')
  }

  if (num === 1) {
    return [start]
  }

  const step = (stop - start) / (num - 1)
  const result = new Float32Array(num)

  for (let i = 0; i < num; i++) {
    result[i] = start + step * i
  }

  return result
}

/**
 * Find local maxima in a 1D signal
 * @param {Array<number>} signal - Input signal
 * @param {number} min_distance - Minimum distance between peaks
 * @param {number} threshold - Minimum peak height
 * @returns {Array<number>} Peak indices
 */
export function find_peaks(signal, min_distance = 1, threshold = 0) {
  const peaks = []

  for (let i = 1; i < signal.length - 1; i++) {
    // Check if it's a local maximum and above threshold
    if (
      signal[i] > signal[i - 1] &&
      signal[i] > signal[i + 1] &&
      signal[i] >= threshold
    ) {
      // Check minimum distance constraint
      if (peaks.length === 0 || i - peaks[peaks.length - 1] >= min_distance) {
        peaks.push(i)
      } else if (signal[i] > signal[peaks[peaks.length - 1]]) {
        // Replace previous peak if current one is higher
        peaks[peaks.length - 1] = i
      }
    }
  }

  return peaks
}

// ============= ADVANCED SPECTRUM FUNCTIONS =============

/**
 * Griffin-Lim algorithm for phase reconstruction
 *
 * Approximate magnitude spectrogram inversion using iterative phase estimation.
 *
 * @param {Array<Array<number>>} S - Magnitude spectrogram [freq x time]
 * @param {number} n_iter - Number of iterations (default: 32)
 * @param {number} hop_length - Hop length for STFT (default: 512)
 * @param {number|null} win_length - Window length (default: null, uses n_fft)
 * @param {number|null} n_fft - FFT size (default: null, inferred from S)
 * @param {string} window - Window function (default: 'hann')
 * @param {boolean} center - Center the frames (default: true)
 * @param {string|null} dtype - Data type (default: null)
 * @param {number|null} length - Output length in samples (default: null)
 * @param {string} pad_mode - Padding mode (default: 'constant')
 * @param {number} momentum - Fast Griffin-Lim momentum (default: 0.99)
 * @param {string|null} init - Initialization ('random' or null, default: 'random')
 * @param {number|null} random_state - Random seed (default: null)
 * @returns {Float32Array} Reconstructed audio signal
 */
export function griffinlim(
  S,
  n_iter = 32,
  hop_length = 512,
  win_length = null,
  n_fft = null,
  window = 'hann',
  center = true,
  dtype = null,
  length = null,
  pad_mode = 'constant',
  momentum = 0.99,
  init = 'random',
  random_state = null
) {
  const n_freq = S.length
  const n_frames = S[0].length

  // Infer n_fft from spectrogram shape
  if (n_fft === null) {
    n_fft = 2 * (n_freq - 1)
  }

  if (win_length === null) {
    win_length = n_fft
  }

  // Initialize with random phase
  let angles
  if (init === 'random') {
    if (random_state !== null) {
      // Set random seed if provided (simplified)
      Math.seedrandom = random_state
    }
    angles = Array(n_freq).fill(null).map(() =>
      Array(n_frames).fill(null).map(() => Math.random() * 2 * Math.PI - Math.PI)
    )
  } else {
    angles = Array(n_freq).fill(null).map(() => Array(n_frames).fill(0))
  }

  // Create initial complex spectrogram.
  // Array.from (NOT row.map): magnitude rows are typically Float32Array and
  // TypedArray.map would coerce the {real, imag} objects to NaN.
  let S_complex = S.map((row, i) =>
    Array.from(row, (mag, j) => ({
      real: mag * Math.cos(angles[i][j]),
      imag: mag * Math.sin(angles[i][j])
    }))
  )

  // Momentum for fast Griffin-Lim
  let y_prev = null

  // Iterative phase refinement
  for (let iter = 0; iter < n_iter; iter++) {
    // Inverse STFT — istft signature is (D, hop_length, win_length, window,
    // center, length); the old 8-arg call shifted n_fft into window and
    // center=true into length, slicing the output to 1 sample.
    const y = istftTransform(S_complex, hop_length, win_length, window, center, length)

    // Apply momentum
    let y_final = y
    if (momentum > 0 && y_prev !== null) {
      y_final = y.map((val, i) => val + momentum * (val - (y_prev[i] || 0)))
    }
    y_prev = y.slice()

    // Forward STFT — stft has no dtype parameter; passing it shifted
    // pad_mode out of the arg list entirely.
    const S_est = stftTransform(y_final, n_fft, hop_length, win_length, window, center, pad_mode)

    // Update phase while keeping original magnitude (Array.from — see above)
    S_complex = S.map((row, i) =>
      Array.from(row, (mag, j) => {
        const est = S_est[i] && S_est[i][j] ? S_est[i][j] : { real: 0, imag: 0 }
        const phase = Math.atan2(est.imag, est.real)
        return {
          real: mag * Math.cos(phase),
          imag: mag * Math.sin(phase)
        }
      })
    )
  }

  // Final inverse STFT (same corrected arg order as the loop above)
  return istftTransform(S_complex, hop_length, win_length, window, center, length)
}

/**
 * Per-Channel Energy Normalization (PCEN)
 *
 * Applies adaptive gain control and dynamic range compression for robust feature extraction.
 *
 * @param {Array<Array<number>>} S - Input spectrogram [freq x time]
 * @param {number} sr - Sample rate (default: 22050)
 * @param {number} hop_length - Hop length (default: 512)
 * @param {number} gain - Gain normalization exponent (default: 0.98)
 * @param {number} bias - Bias constant (default: 2)
 * @param {number} power - Compression exponent (default: 0.5)
 * @param {number} time_constant - AGC time constant in seconds (default: 0.4)
 * @param {number} eps - Numerical stability constant (default: 1e-6)
 * @param {number|null} b - Smoothing coefficient (default: null, computed from time_constant)
 * @param {number} max_size - Max filter size for smoothing (default: 1)
 * @param {Array|null} ref - Reference values for normalization (default: null)
 * @param {number} axis - Time axis (default: -1)
 * @param {number|null} max_axis - Max pooling axis (default: null)
 * @param {Array|null} zi - Initial filter state (default: null)
 * @param {boolean} return_zf - Return final filter state (default: false)
 * @returns {Array<Array<number>>|Object} PCEN output or {output, zf} if return_zf
 */
export function pcen(
  S,
  sr = 22050,
  hop_length = 512,
  gain = 0.98,
  bias = 2,
  power = 0.5,
  time_constant = 0.4,
  eps = 1e-6,
  b = null,
  max_size = 1,
  ref = null,
  axis = -1,
  max_axis = null,
  zi = null,
  return_zf = false
) {
  // --- Parameter validation --------------------------------------------------
  if (!S || S.length === 0 || !S[0] || S[0].length === undefined) {
    throw new ParameterError('pcen: S must be a non-empty [freq][time] matrix')
  }
  if (power < 0) throw new ParameterError(`pcen: power=${power} must be nonnegative`)
  if (gain < 0) throw new ParameterError(`pcen: gain=${gain} must be non-negative`)
  if (bias < 0) throw new ParameterError(`pcen: bias=${bias} must be non-negative`)
  if (eps <= 0) throw new ParameterError(`pcen: eps=${eps} must be strictly positive`)
  if (time_constant <= 0) {
    throw new ParameterError(
      `pcen: time_constant=${time_constant} must be strictly positive`,
    )
  }
  if (!Number.isInteger(max_size) || max_size < 1) {
    throw new ParameterError(`pcen: max_size=${max_size} must be a positive integer`)
  }
  // pcen smooths along the time axis, which for a [freq][time] matrix is the
  // last axis (-1, or 1 for 2-D input). Any other axis is unsupported here.
  if (axis !== -1 && axis !== 1) {
    throw new ParameterError(
      `pcen: axis=${axis} unsupported; time must be the last axis of [freq][time] S`,
    )
  }

  const n_freq = S.length
  const n_frames = S[0].length

  // Smoothing coefficient. Solve b**2 + (1 - b)/T - 2 = 0, the
  // full-width-half-max of the squared IIR frequency response, NOT the naive
  // exp(-1/T). T is the time constant expressed in frames.
  if (b === null) {
    const t_frames = (time_constant * sr) / hop_length
    b = (Math.sqrt(1 + 4 * t_frames * t_frames) - 1) / (2 * t_frames * t_frames)
  }
  if (!(b >= 0 && b <= 1)) {
    throw new ParameterError(`pcen: b=${b} must be between 0 and 1`)
  }

  // Reference signal R fed to the IIR smoother. With max_size == 1, R = S.
  // Frequency-axis max-filtering (max_size > 1) requires scipy.ndimage's
  // reflect-boundary maximum_filter1d, which is not implemented here; throw
  // rather than silently produce wrong output.
  let R = ref
  if (R === null) {
    if (max_size === 1) {
      R = S
    } else {
      throw new ParameterError(
        `pcen: max_size=${max_size} (frequency max-filtering) is not implemented; ` +
          'pass a pre-computed ref or use max_size=1',
      )
    }
  }

  // First-order IIR low-pass: M[t] = b*R[t] + (1-b)*M[t-1], realised as
  // scipy.signal.lfilter([b], [1, b-1], R, zi). The delay register holds
  // z0 = (1-b)*M[t]; scipy.signal.lfilter_zi([b],[1,b-1]) == (1-b), so the
  // unspecified-state warmup behaves as if M[-1] = 1 (steady state for a
  // unit-DC input), NOT M[-1] = 0.
  const state = new Float64Array(n_freq)
  if (zi === null) {
    state.fill(1 - b)
  } else {
    for (let i = 0; i < n_freq; i++) state[i] = zi[i]
  }

  const oneMinusB = 1 - b
  const logEps = Math.log(eps)
  const biasPow = Math.pow(bias, power)

  const P = new Array(n_freq)
  for (let i = 0; i < n_freq; i++) {
    const Si = S[i]
    const Ri = R[i]
    const row = new Float64Array(n_frames)
    let z = state[i]
    for (let j = 0; j < n_frames; j++) {
      // Temporal integration (IIR smoother).
      const M = b * Ri[j] + z
      z = oneMinusB * M

      // Adaptive gain control in log-space:
      //   smooth = (eps + M)^(-gain) = exp(-gain*(log(eps) + log1p(M/eps)))
      const logSmooth = -gain * (logEps + Math.log1p(M / eps))
      const smooth = Math.exp(logSmooth)

      // Dynamic range compression (numerically stable branches).
      const x = Si[j]
      let out
      if (power === 0) {
        out = Math.log1p(x * smooth)
      } else if (bias === 0) {
        out = Math.exp(power * (Math.log(x) + logSmooth))
      } else {
        out = biasPow * Math.expm1(power * Math.log1p((x * smooth) / bias))
      }
      row[j] = out
    }
    state[i] = z
    P[i] = row
  }

  if (return_zf) {
    return { output: P, zf: Array.from(state) }
  }

  return P
}

/**
 * Separate magnitude and phase from a complex spectrogram
 *
 * @param {Array<Array<{real: number, imag: number}>>} D - Complex spectrogram
 * @param {number} power - Magnitude power (default: 1)
 * @returns {Object} {magnitude: Array, phase: Array}
 */
export function magphase(D, power = 1) {
  const n_freq = D.length
  const n_frames = D[0].length

  const magnitude = Array(n_freq).fill(null).map(() => Array(n_frames))
  const phase = Array(n_freq).fill(null).map(() => Array(n_frames))

  for (let i = 0; i < n_freq; i++) {
    for (let j = 0; j < n_frames; j++) {
      const real = D[i][j].real
      const imag = D[i][j].imag

      const mag = Math.sqrt(real * real + imag * imag)
      magnitude[i][j] = Math.pow(mag, power)

      // Phase as complex unit phasor
      if (mag > 1e-10) {
        phase[i][j] = {
          real: real / mag,
          imag: imag / mag
        }
      } else {
        phase[i][j] = { real: 1, imag: 0 }
      }
    }
  }

  return { magnitude, phase }
}

/**
 * Fast Mellin Transform (FMT)
 *
 * Compute the FMT for time-scale analysis (useful for tempo-invariant features).
 *
 * @param {Float32Array|Array<number>} y - Input signal
 * @param {number} t_min - Minimum period (default: 0.5)
 * @param {number|null} n_fmt - Number of FMT bins (default: null, uses signal length)
 * @param {string} kind - Interpolation kind (default: 'cubic')
 * @param {number} beta - FMT parameter (default: 0.5)
 * @param {number} over_sample - Oversampling factor (default: 1)
 * @param {number} axis - Axis to transform (default: -1)
 * @returns {Array<{real: number, imag: number}>} FMT coefficients
 */
export function fmt(
  y,
  t_min = 0.5,
  n_fmt = null,
  kind = 'cubic',
  beta = 0.5,
  over_sample = 1,
  axis = -1
) {
  const n = y.length

  if (n_fmt === null) {
    n_fmt = n
  }

  // Log-scale sampling for Mellin transform
  const log_t = Array(n_fmt).fill(null).map((_, i) => {
    return Math.log(t_min) + (i / (n_fmt - 1)) * Math.log(n / t_min)
  })

  // Sample the signal at log-spaced time points
  const y_interp = log_t.map(lt => {
    const t = Math.exp(lt)
    const idx = Math.floor(t)
    if (idx >= 0 && idx < n - 1) {
      const frac = t - idx
      // Linear interpolation (simplified from cubic)
      return y[idx] * (1 - frac) + y[idx + 1] * frac
    } else if (idx >= n - 1) {
      return y[n - 1]
    } else {
      return y[0]
    }
  })

  // Apply window
  const windowed = y_interp.map((val, i) => {
    const w = 0.5 * (1 - Math.cos(2 * Math.PI * i / n_fmt))  // Hann window
    return val * w * Math.exp(-beta * log_t[i])
  })

  // FFT of windowed signal
  const fmt_result = []
  for (let k = 0; k < n_fmt; k++) {
    let real = 0, imag = 0
    for (let n = 0; n < n_fmt; n++) {
      const angle = -2 * Math.PI * k * n / n_fmt
      real += windowed[n] * Math.cos(angle)
      imag += windowed[n] * Math.sin(angle)
    }
    fmt_result.push({ real, imag })
  }

  return fmt_result
}

/**
 * Time-frequency reassigned spectrogram
 *
 * Compute spectrogram with reassigned time and frequency coordinates
 * for improved time-frequency resolution.
 *
 * @param {Float32Array} y - Audio signal
 * @param {number} sr - Sample rate (default: 22050)
 * @param {Array|null} S - Precomputed spectrogram (default: null)
 * @param {number} n_fft - FFT size (default: 2048)
 * @param {number|null} hop_length - Hop length (default: null)
 * @param {number|null} win_length - Window length (default: null)
 * @param {string} window - Window function (default: 'hann')
 * @param {boolean} center - Center frames (default: true)
 * @param {boolean} reassign_frequencies - Reassign frequencies (default: true)
 * @param {boolean} reassign_times - Reassign times (default: true)
 * @param {number} ref_power - Reference power for dB conversion (default: 1e-6)
 * @param {boolean} fill_nan - Fill NaN values with zeros (default: false)
 * @param {boolean} clip - Clip reassigned values to valid range (default: true)
 * @param {string|null} dtype - Data type (default: null)
 * @param {string} pad_mode - Padding mode (default: 'constant')
 * @returns {Object} {spectrogram, frequencies, times}
 */
export function reassigned_spectrogram(
  y,
  sr = 22050,
  S = null,
  n_fft = 2048,
  hop_length = null,
  win_length = null,
  window = 'hann',
  center = true,
  reassign_frequencies = true,
  reassign_times = true,
  ref_power = 1e-6,
  fill_nan = false,
  clip = true,
  dtype = null,
  pad_mode = 'constant'
) {
  if (hop_length === null) {
    hop_length = Math.floor(n_fft / 4)
  }

  if (win_length === null) {
    win_length = n_fft
  }

  // Compute base spectrogram if not provided
  if (S === null) {
    S = stftTransform(y, n_fft, hop_length, win_length, window, center, pad_mode)
  }

  const n_freq = S.length
  const n_frames = S[0].length

  // Initialize reassignment matrices
  const freqs_reassigned = Array(n_freq).fill(null).map((_, i) =>
    Array(n_frames).fill(i * sr / n_fft)
  )

  const times_reassigned = Array(n_freq).fill(null).map(() =>
    Array(n_frames).fill(null).map((_, j) => j * hop_length / sr)
  )

  // Compute time-weighted and frequency-weighted STFTs for reassignment
  // This is a simplified version - full implementation requires derivative windows

  if (reassign_frequencies) {
    // Frequency reassignment using phase derivative
    for (let i = 1; i < n_freq - 1; i++) {
      for (let j = 0; j < n_frames; j++) {
        const phase_curr = Math.atan2(S[i][j].imag, S[i][j].real)
        const phase_next = Math.atan2(S[i + 1][j].imag, S[i + 1][j].real)

        const phase_deriv = (phase_next - phase_curr) / (sr / n_fft)
        const freq_offset = phase_deriv / (2 * Math.PI)

        freqs_reassigned[i][j] = Math.max(0, Math.min(
          sr / 2,
          i * sr / n_fft + freq_offset
        ))
      }
    }
  }

  if (reassign_times) {
    // Time reassignment using group delay
    for (let i = 0; i < n_freq; i++) {
      for (let j = 1; j < n_frames - 1; j++) {
        const phase_curr = Math.atan2(S[i][j].imag, S[i][j].real)
        const phase_next = Math.atan2(S[i][j + 1].imag, S[i][j + 1].real)

        const phase_deriv = (phase_next - phase_curr) / (hop_length / sr)
        const time_offset = -phase_deriv / (2 * Math.PI * (i * sr / n_fft))

        times_reassigned[i][j] = Math.max(0,
          j * hop_length / sr + time_offset
        )
      }
    }
  }

  // Compute magnitude spectrogram
  const mag = S.map(row =>
    row.map(val => Math.sqrt(val.real * val.real + val.imag * val.imag))
  )

  return {
    spectrogram: mag,
    frequencies: freqs_reassigned,
    times: times_reassigned
  }
}

// Usage Example:
/*
// Feature analysis
const audioData = new Float32Array([...]); // Your audio
const zcr = zero_crossing_rate(audioData);
const energy = rms(audioData);

// Normalization
const features = [zcr, energy];
const normalized = normalize_features(features, 'l2', 0);

// Harmonic-percussive separation
const spectrogram = computeSpectrogram(audioData); // Your spectrogram
const {harmonic, percussive} = hpss(spectrogram, 31, 2.0, true);

// Pitch detection
const {pitches, confidences} = monophonic_pitch_detect(audioData, 44100);

// Autocorrelation for BPM
const ac = autocorrelate(audioData);
const bpmFromAC = detectBPMFromAutocorr(ac, sampleRate);

// Griffin-Lim phase reconstruction
const S_magnitude = ...; // Magnitude spectrogram
const y_reconstructed = griffinlim(S_magnitude, 32, 512);

// PCEN for robust features
const S = ...; // Power spectrogram
const P = pcen(S, 22050, 512, 0.98, 2, 0.5);

// Reassigned spectrogram
const {spectrogram, frequencies, times} = reassigned_spectrogram(audioData, 22050);
*/

// ============================================================================
// Spectrum Processing Helpers
// ============================================================================

/**
 * Overlap-add operation for inverse STFT and Griffin-Lim
 * The __overlap_add helper
 *
 * Accumulates windowed frames into output buffer using overlap-add method.
 * This is the core operation for combining overlapping STFT frames back into
 * a time-domain signal.
 *
 * @private
 * @param {Float32Array|Array<number>} y - Pre-allocated output buffer [n_samples]
 * @param {Float32Array|Array<number>} ytmp - Windowed frame to add [frame_length]
 * @param {number} hop_length - Hop length in samples
 * @param {number} frame_idx - Current frame index
 * @returns {void} Modifies y in-place
 */
export function __overlap_add(y, ytmp, hop_length, frame_idx) {
  const frame_length = ytmp.length
  const sample_start = frame_idx * hop_length
  const sample_end = Math.min(sample_start + frame_length, y.length)

  // Add windowed frame to output buffer
  for (let i = 0; i < sample_end - sample_start; i++) {
    y[sample_start + i] += ytmp[i]
  }
}

/**
 * Compute instantaneous frequencies for reassigned spectrogram
 * The __reassign_frequencies helper
 *
 * Uses the method from Flandrin et al. (2002) to compute frequency reassignments
 * based on the derivative of the analysis window.
 *
 * @private
 * @param {Float32Array|Array<number>} y - Audio signal
 * @param {number} sr - Sample rate in Hz
 * @param {Array<Array<{real: number, imag: number}>>|null} S - Pre-computed STFT (optional)
 * @param {number} n_fft - FFT window size
 * @param {number|null} hop_length - Hop length (default: n_fft/4)
 * @param {number|null} win_length - Window length (default: n_fft)
 * @param {string} window - Window type ('hann', 'hamming', etc.)
 * @param {boolean} center - Whether to center frames
 * @param {any} dtype - Data type (unused in JS)
 * @param {string} pad_mode - Padding mode
 * @returns {{S: Array, freqs_reassigned: Array}} STFT and reassigned frequencies
 */
export function __reassign_frequencies(
  y,
  sr = 22050,
  S = null,
  n_fft = 2048,
  hop_length = null,
  win_length = null,
  window = 'hann',
  center = true,
  dtype = null,
  pad_mode = 'constant'
) {
  if (hop_length === null) {
    hop_length = Math.floor(n_fft / 4)
  }

  if (win_length === null) {
    win_length = n_fft
  }

  // Compute standard STFT if not provided
  if (S === null) {
    S = stftTransform(y, n_fft, hop_length, win_length, window, center, pad_mode)
  }

  // Compute STFT with derivative window for frequency reassignment
  // For frequency reassignment, we need to compute the phase derivative
  // This is approximated using finite differences in the frequency domain
  // NOTE: This is a simplified implementation - a full version uses a derivative window
  const S_dh = stftTransform(y, n_fft, hop_length, win_length, window, center, pad_mode)

  const n_freq = S.length
  const n_frames = S[0].length

  // Compute frequency reassignments: omega_reassigned = omega - Im(S_dh / S_h)
  const freqs_reassigned = Array(n_freq).fill(null).map((_, i) =>
    Array(n_frames).fill(null).map((_, j) => {
      const s_h = S[i][j]
      const s_dh = S_dh[i][j]

      const mag_h = Math.sqrt(s_h.real * s_h.real + s_h.imag * s_h.imag)

      if (mag_h < 1e-10) {
        // Default to bin frequency if magnitude too small
        return i * sr / n_fft
      }

      // Complex division: S_dh / S_h
      const denom = s_h.real * s_h.real + s_h.imag * s_h.imag
      const div_imag = (s_dh.imag * s_h.real - s_dh.real * s_h.imag) / denom

      // Frequency reassignment
      const freq_offset = -div_imag / (2 * Math.PI)
      const freq_reassigned = i * sr / n_fft + freq_offset

      // Clip to valid range
      return Math.max(0, Math.min(sr / 2, freq_reassigned))
    })
  )

  return { S, freqs_reassigned }
}

/**
 * Compute time reassignments for reassigned spectrogram
 * The __reassign_times helper
 *
 * Computes time-domain reassignment using time-weighted window STFT.
 *
 * @private
 * @param {Float32Array|Array<number>} y - Audio signal
 * @param {number} sr - Sample rate in Hz
 * @param {Array<Array<{real: number, imag: number}>>|null} S - Pre-computed STFT (optional)
 * @param {number} n_fft - FFT window size
 * @param {number|null} hop_length - Hop length (default: n_fft/4)
 * @param {number|null} win_length - Window length (default: n_fft)
 * @param {string} window - Window type
 * @param {boolean} center - Whether to center frames
 * @param {any} dtype - Data type (unused in JS)
 * @param {string} pad_mode - Padding mode
 * @returns {{S: Array, times_reassigned: Array}} STFT and reassigned times
 */
export function __reassign_times(
  y,
  sr = 22050,
  S = null,
  n_fft = 2048,
  hop_length = null,
  win_length = null,
  window = 'hann',
  center = true,
  dtype = null,
  pad_mode = 'constant'
) {
  if (hop_length === null) {
    hop_length = Math.floor(n_fft / 4)
  }

  if (win_length === null) {
    win_length = n_fft
  }

  // Compute standard STFT if not provided
  if (S === null) {
    S = stftTransform(y, n_fft, hop_length, win_length, window, center, pad_mode)
  }

  // Compute STFT with time-weighted window for time reassignment
  // For time reassignment, we need to compute the group delay
  // This is approximated using finite differences in the time domain
  // NOTE: This is simplified - a full version uses a time-weighted window
  const S_th = stftTransform(y, n_fft, hop_length, win_length, window, center, pad_mode)

  const n_freq = S.length
  const n_frames = S[0].length

  // Compute time reassignments: t_reassigned = t + Re(S_th / S_h)
  const times_reassigned = Array(n_freq).fill(null).map(() =>
    Array(n_frames).fill(null).map((_, j) => {
      const frame_time = j * hop_length / sr

      return Array(n_freq).fill(frame_time)
    })
  )

  for (let i = 0; i < n_freq; i++) {
    for (let j = 0; j < n_frames; j++) {
      const s_h = S[i][j]
      const s_th = S_th[i][j]

      const mag_h = Math.sqrt(s_h.real * s_h.real + s_h.imag * s_h.imag)

      if (mag_h < 1e-10) {
        times_reassigned[i][j] = j * hop_length / sr
        continue
      }

      // Complex division: S_th / S_h
      const denom = s_h.real * s_h.real + s_h.imag * s_h.imag
      const div_real = (s_th.real * s_h.real + s_th.imag * s_h.imag) / denom

      // Time reassignment
      const time_offset = div_real / win_length
      const time_reassigned = j * hop_length / sr + time_offset

      times_reassigned[i][j] = Math.max(0, time_reassigned)
    }
  }

  return { S, times_reassigned }
}

/**
 * Compute magnitude spectrogram from audio or STFT
 * The _spectrogram helper
 *
 * Internal helper that retrieves or computes a magnitude spectrogram,
 * handling both audio input and pre-computed STFT.
 *
 * @private
 * @param {Float32Array|Array<number>|null} y - Audio signal (optional if S provided)
 * @param {Array<Array<{real: number, imag: number}>>|null} S - Pre-computed STFT (optional if y provided)
 * @param {number} n_fft - FFT window size (default: 2048)
 * @param {number} hop_length - Hop length (default: 512)
 * @param {number} power - Exponent for magnitude (1=magnitude, 2=power) (default: 1)
 * @param {number|null} win_length - Window length (default: n_fft)
 * @param {string} window - Window type (default: 'hann')
 * @param {boolean} center - Whether to center frames (default: true)
 * @param {string} pad_mode - Padding mode (default: 'constant')
 * @returns {{S_mag: Array<Array<number>>, n_fft: number}} Magnitude spectrogram and n_fft
 */
export function _spectrogram(
  y = null,
  S = null,
  n_fft = 2048,
  hop_length = 512,
  power = 1,
  win_length = null,
  window = 'hann',
  center = true,
  pad_mode = 'constant'
) {
  if (y === null && S === null) {
    throw new ParameterError('Either y or S must be provided')
  }

  if (win_length === null) {
    win_length = n_fft
  }

  // Compute STFT if not provided
  if (S === null) {
    S = stftTransform(y, n_fft, hop_length, win_length, window, center, pad_mode)
  } else {
    // Infer n_fft from S shape
    n_fft = 2 * (S.length - 1)
  }

  const n_freq = S.length
  const n_frames = S[0].length

  // Compute magnitude spectrogram
  const S_mag = Array(n_freq).fill(null).map((_, i) =>
    Array(n_frames).fill(null).map((_, j) => {
      const val = S[i][j]
      const mag = Math.sqrt(val.real * val.real + val.imag * val.imag)
      return Math.pow(mag, power)
    })
  )

  return { S_mag, n_fft }
}
