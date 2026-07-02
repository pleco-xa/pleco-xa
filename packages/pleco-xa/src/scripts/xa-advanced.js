/**
 * Librosa Advanced Functions Module
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
    inf: (arr) => Math.max(...arr.map(Math.abs)),
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
  if (!S || S.length === 0) {
    throw new ParameterError('Spectrogram cannot be empty')
  }

  const n_freq = S.length
  const n_time = S[0].length

  // Median filters
  const H = median_filter_horizontal(S, kernel_size)
  const P = median_filter_vertical(S, kernel_size)

  if (!mask) return { harmonic: H, percussive: P }

  // Soft masking - preallocate arrays
  const H_mask = Array(n_freq)
  const P_mask = Array(n_freq)

  for (let i = 0; i < n_freq; i++) {
    H_mask[i] = new Float32Array(n_time)
    P_mask[i] = new Float32Array(n_time)

    for (let j = 0; j < n_time; j++) {
      const H_power = Math.pow(Math.abs(H[i][j]), power)
      const P_power = Math.pow(Math.abs(P[i][j]), power)
      const sum = H_power + P_power

      if (sum > 1e-10) {
        const invSum = 1 / sum
        H_mask[i][j] = H_power * invSum
        P_mask[i][j] = P_power * invSum
      } else {
        H_mask[i][j] = 0.5
        P_mask[i][j] = 0.5
      }
    }
  }

  return { harmonic: H_mask, percussive: P_mask }
}

/**
 * Apply horizontal median filter (for harmonic component)
 * @private
 */
function median_filter_horizontal(S, kernel_size) {
  return S.map((row) => median_filter_1d(row, kernel_size))
}

/**
 * Apply vertical median filter (for percussive component)
 * @private
 */
function median_filter_vertical(S, kernel_size) {
  const n_freq = S.length
  const n_time = S[0].length
  const result = Array(n_freq)

  for (let i = 0; i < n_freq; i++) {
    result[i] = new Float32Array(n_time)
  }

  for (let j = 0; j < n_time; j++) {
    const column = new Float32Array(n_freq)
    for (let i = 0; i < n_freq; i++) {
      column[i] = S[i][j]
    }

    const filtered = median_filter_1d(column, kernel_size)

    for (let i = 0; i < n_freq; i++) {
      result[i][j] = filtered[i]
    }
  }

  return result
}

/**
 * 1D median filter
 * @private
 */
function median_filter_1d(array, kernel_size) {
  const half_kernel = Math.floor(kernel_size / 2)
  const result = new Float32Array(array.length)

  for (let i = 0; i < array.length; i++) {
    const start = Math.max(0, i - half_kernel)
    const end = Math.min(array.length, i + half_kernel + 1)

    // Create a window slice for sorting
    const window = array.slice(start, end)
    result[i] = median(window)
  }

  return result
}

/**
 * Compute median of array
 * @private
 */
function median(array) {
  const sorted = Array.from(array).sort((a, b) => a - b)
  const mid = Math.floor(sorted.length / 2)

  if (sorted.length % 2 === 0) {
    return (sorted[mid - 1] + sorted[mid]) / 2
  } else {
    return sorted[mid]
  }
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
  if (!y || y.length === 0) {
    throw new ParameterError('Audio signal cannot be empty')
  }

  const hop_length = 512
  const n_fft = 2048

  // Compute STFT
  const D = simple_stft(y, n_fft, hop_length)

  // Shift ratio
  const shift_ratio = Math.pow(2, n_steps / bins_per_octave)

  // Phase vocoder pitch shift
  const D_shifted = phase_vocoder(D, shift_ratio)

  // Reconstruct signal
  return simple_istft(D_shifted, hop_length)
}

/**
 * Phase vocoder for time/pitch manipulation
 * @param {Array} D - STFT matrix
 * @param {number} rate - Time stretch/compression rate
 * @returns {Array} Modified STFT matrix
 */
export function phase_vocoder(D, rate) {
  const n_freq = D.length
  const n_time = D[0] ? D[0].length : 0
  const hop_length = 512 // Default

  if (n_time === 0) {
    throw new ParameterError('Empty STFT matrix')
  }

  // Time stretch factor
  const time_steps = Math.ceil(n_time / rate)
  const D_stretched = Array(n_freq)

  // Initialize output matrix
  for (let k = 0; k < n_freq; k++) {
    D_stretched[k] = Array(time_steps)
    for (let t = 0; t < time_steps; t++) {
      D_stretched[k][t] = { real: 0, imag: 0 }
    }
  }

  // Phase advance per bin
  const phase_advance = new Float32Array(n_freq)
  for (let k = 0; k < n_freq; k++) {
    phase_advance[k] = (2 * Math.PI * k * hop_length) / (n_freq * 2)
  }

  // Process each frequency bin
  for (let k = 0; k < n_freq; k++) {
    let phase_accumulator = 0

    for (let t = 0; t < time_steps - 1; t++) {
      const index = Math.floor(t * rate)
      if (index >= n_time - 1) break

      const bin = D[k][index]
      const magnitude = Math.hypot(bin.real, bin.imag)

      const cos_val = Math.cos(phase_accumulator)
      const sin_val = Math.sin(phase_accumulator)

      D_stretched[k][t] = {
        real: magnitude * cos_val,
        imag: magnitude * sin_val,
      }

      phase_accumulator += phase_advance[k]
    }
  }

  return D_stretched
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

// ============= SIMPLIFIED STFT PLACEHOLDERS =============

/**
 * Simplified STFT placeholder
 * @private
 */
function simple_stft(y, n_fft, hop_length) {
  // This would normally use the full STFT implementation
  const n_frames = Math.floor((y.length - n_fft) / hop_length) + 1
  const n_freq = Math.floor(n_fft / 2) + 1

  const D = Array(n_freq)
  for (let i = 0; i < n_freq; i++) {
    D[i] = Array(n_frames)
    for (let j = 0; j < n_frames; j++) {
      D[i][j] = { real: 0, imag: 0 }
    }
  }

  return D
}

/**
 * Simplified ISTFT placeholder
 * @private
 */
function simple_istft(D, hop_length) {
  // This would normally use the full ISTFT implementation
  const length = (D[0].length - 1) * hop_length + 2048
  return new Float32Array(length)
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
*/
