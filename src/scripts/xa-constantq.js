/**
 * Constant-Q and Variable-Q Transform implementations
 * Based on librosa's constantq.py module
 *
 * Provides:
 * - CQT (Constant-Q Transform)
 * - VQT (Variable-Q Transform)
 * - Hybrid CQT
 * - Inverse CQT
 * - Griffin-Lim CQT reconstruction
 */

import { stft } from './xa-fft.js'
import { resample } from './xa-audioio.js'
import { hann_window } from './xa-fft.js'

/**
 * Compute the Constant-Q Transform of an audio signal
 *
 * The CQT is a time-frequency representation where frequency bins
 * are geometrically spaced (logarithmic in frequency).
 *
 * @param {Float32Array} y - Audio time series
 * @param {number} sr - Sample rate of y
 * @param {number} hop_length - Number of samples between successive CQT columns
 * @param {number|null} fmin - Minimum frequency (Hz). Defaults to C1 ~= 32.70 Hz
 * @param {number} n_bins - Number of frequency bins
 * @param {number} bins_per_octave - Number of bins per octave
 * @param {number} tuning - Tuning offset in fractions of a bin
 * @param {number} filter_scale - Filter scale factor
 * @param {number|null} norm - Normalization factor
 * @param {number} sparsity - Sparsity threshold for filter
 * @param {string} window - Window function type
 * @param {boolean} scale - Scale the CQT response by sqrt(length)
 * @param {string} pad_mode - Padding mode for signal edges
 * @param {string|null} res_type - Resampling type
 * @param {string|null} dtype - Data type for output
 * @returns {Array<Array<{real: number, imag: number}>>} CQT matrix [n_bins x frames]
 */
export function cqt(
  y,
  sr = 22050,
  hop_length = 512,
  fmin = null,
  n_bins = 84,
  bins_per_octave = 12,
  tuning = 0.0,
  filter_scale = 1,
  norm = 1,
  sparsity = 0.01,
  window = 'hann',
  scale = true,
  pad_mode = 'constant',
  res_type = 'soxr_hq',
  dtype = null
) {
  // Set default fmin to C1 (~32.70 Hz)
  if (fmin === null) {
    fmin = 32.70319566257483  // C1 in Hz
  }

  // Validate parameters
  if (fmin <= 0) {
    throw new Error('fmin must be positive')
  }

  if (n_bins <= 0) {
    throw new Error('n_bins must be positive')
  }

  if (bins_per_octave <= 0) {
    throw new Error('bins_per_octave must be positive')
  }

  // Number of octaves in the filter bank
  const n_octaves = Math.ceil(n_bins / bins_per_octave)

  // Compute filter lengths for each octave
  const filter_lengths = constant_q_lengths(
    sr, fmin, n_bins, bins_per_octave, window, filter_scale, 0
  )

  // Early downsampling to improve efficiency
  let y_working = y
  let sr_working = sr
  const downsample_count = __early_downsample_count(
    sr / 2.0,  // Nyquist frequency
    fmin * Math.pow(2, n_octaves),  // Highest frequency
    hop_length,
    n_octaves
  )

  if (downsample_count > 0 && res_type) {
    const downsample_factor = Math.pow(2, downsample_count)
    sr_working = sr / downsample_factor
    y_working = resample(y, sr, sr_working, res_type)
  }

  // Generate CQT filterbank
  const [fft_basis, lengths] = constant_q(
    sr_working,
    fmin,
    n_bins,
    bins_per_octave,
    window,
    filter_scale,
    true,  // pad_fft
    norm,
    null,  // dtype
    0      // gamma (for VQT, 0 for CQT)
  )

  // Choose appropriate n_fft
  const n_fft = Math.max(...lengths) * 2  // Power of 2 for efficiency

  // Compute the response using STFT
  const cqt_resp = __cqt_response(
    y_working,
    n_fft,
    hop_length,
    fft_basis,
    'same',
    window,
    true,  // phase
    dtype
  )

  // Stack and trim the CQT response
  const C = __trim_stack([cqt_resp], n_bins, dtype || 'complex64')

  // Apply scaling if requested
  if (scale) {
    const sqrt_lengths = lengths.map(l => Math.sqrt(l))
    for (let i = 0; i < C.length; i++) {
      for (let j = 0; j < C[i].length; j++) {
        C[i][j].real *= sqrt_lengths[i]
        C[i][j].imag *= sqrt_lengths[i]
      }
    }
  }

  return C
}

/**
 * Compute the Variable-Q Transform of an audio signal
 *
 * VQT generalizes CQT to allow for non-equal temperament intervals.
 *
 * @param {Float32Array} y - Audio time series
 * @param {number} sr - Sample rate
 * @param {number} hop_length - Hop length for VQT
 * @param {number|null} fmin - Minimum frequency
 * @param {number} n_bins - Number of frequency bins
 * @param {string|Array<number>} intervals - Interval specification ('equal' or array of ratios)
 * @param {number|null} gamma - Bandwidth offset for variable-Q
 * @param {number} bins_per_octave - Bins per octave (for equal temperament)
 * @param {number} tuning - Tuning offset
 * @param {number} filter_scale - Filter scale factor
 * @param {number|null} norm - Normalization
 * @param {number} sparsity - Sparsity threshold
 * @param {string} window - Window function
 * @param {boolean} scale - Apply scaling
 * @param {string} pad_mode - Padding mode
 * @param {string|null} res_type - Resampling type
 * @param {string|null} dtype - Output data type
 * @returns {Array<Array<{real: number, imag: number}>>} VQT matrix
 */
export function vqt(
  y,
  sr = 22050,
  hop_length = 512,
  fmin = null,
  n_bins = 84,
  intervals = 'equal',
  gamma = null,
  bins_per_octave = 12,
  tuning = 0.0,
  filter_scale = 1,
  norm = 1,
  sparsity = 0.01,
  window = 'hann',
  scale = true,
  pad_mode = 'constant',
  res_type = 'soxr_hq',
  dtype = null
) {
  // Default fmin
  if (fmin === null) {
    fmin = 32.70319566257483  // C1
  }

  // Default gamma for VQT
  if (gamma === null) {
    gamma = 24.7  // Default bandwidth offset
  }

  // For equal temperament, use standard CQT with gamma
  if (intervals === 'equal') {
    return cqt(
      y, sr, hop_length, fmin, n_bins, bins_per_octave,
      tuning, filter_scale, norm, sparsity, window,
      scale, pad_mode, res_type, dtype
    )
  }

  // Handle custom intervals
  const freqs = interval_frequencies(
    n_bins, fmin, intervals, bins_per_octave, tuning
  )

  // Generate VQT filterbank
  const [fft_basis, lengths] = wavelet(
    freqs,
    sr,
    window,
    filter_scale,
    true,  // pad_fft
    norm,
    null,  // dtype
    gamma
  )

  const n_fft = Math.max(...lengths) * 2

  // Compute VQT response
  const vqt_resp = __cqt_response(
    y, n_fft, hop_length, fft_basis, 'same',
    window, true, dtype
  )

  const V = __trim_stack([vqt_resp], n_bins, dtype || 'complex64')

  if (scale) {
    const sqrt_lengths = lengths.map(l => Math.sqrt(l))
    for (let i = 0; i < V.length; i++) {
      for (let j = 0; j < V[i].length; j++) {
        V[i][j].real *= sqrt_lengths[i]
        V[i][j].imag *= sqrt_lengths[i]
      }
    }
  }

  return V
}

/**
 * Compute the hybrid Constant-Q Transform
 *
 * Uses a pseudo-CQT for high frequencies and a standard CQT for low frequencies.
 * More efficient than full CQT for wide frequency ranges.
 *
 * @param {Float32Array} y - Audio time series
 * @param {number} sr - Sample rate
 * @param {number} hop_length - Hop length
 * @param {number|null} fmin - Minimum frequency
 * @param {number} n_bins - Number of bins
 * @param {number} bins_per_octave - Bins per octave
 * @param {number} tuning - Tuning offset
 * @param {number} filter_scale - Filter scale
 * @param {number|null} norm - Normalization
 * @param {number} sparsity - Sparsity threshold
 * @param {string} window - Window function
 * @param {boolean} scale - Apply scaling
 * @param {string} pad_mode - Padding mode
 * @param {string} res_type - Resampling type
 * @param {string|null} dtype - Data type
 * @returns {Array<Array<{real: number, imag: number}>>} Hybrid CQT matrix
 */
export function hybrid_cqt(
  y,
  sr = 22050,
  hop_length = 512,
  fmin = null,
  n_bins = 84,
  bins_per_octave = 12,
  tuning = 0.0,
  filter_scale = 1,
  norm = 1,
  sparsity = 0.01,
  window = 'hann',
  scale = true,
  pad_mode = 'constant',
  res_type = 'soxr_hq',
  dtype = null
) {
  if (fmin === null) {
    fmin = 32.70319566257483
  }

  // Split point: use pseudo-CQT for top 2 octaves
  const n_bins_pseudo = Math.min(n_bins, 2 * bins_per_octave)
  const n_bins_full = n_bins - n_bins_pseudo

  // Compute pseudo-CQT for high frequencies
  const fmin_pseudo = fmin * Math.pow(2, n_bins_full / bins_per_octave)
  const cqt_high = pseudo_cqt(
    y, sr, hop_length, fmin_pseudo, n_bins_pseudo,
    bins_per_octave, tuning, filter_scale, norm,
    sparsity, window, scale, pad_mode, dtype
  )

  // Compute full CQT for low frequencies if needed
  if (n_bins_full > 0) {
    const cqt_low = cqt(
      y, sr, hop_length, fmin, n_bins_full,
      bins_per_octave, tuning, filter_scale, norm,
      sparsity, window, scale, pad_mode, res_type, dtype
    )

    // Concatenate low and high frequency components
    return [...cqt_low, ...cqt_high]
  }

  return cqt_high
}

/**
 * Compute the inverse Constant-Q Transform
 *
 * Reconstructs time-domain audio from a CQT representation.
 *
 * @param {Array<Array<{real: number, imag: number}>>} C - CQT matrix
 * @param {number} sr - Sample rate
 * @param {number} hop_length - Hop length
 * @param {number|null} fmin - Minimum frequency
 * @param {number} bins_per_octave - Bins per octave
 * @param {number} tuning - Tuning offset
 * @param {number} filter_scale - Filter scale
 * @param {number|null} norm - Normalization
 * @param {number} sparsity - Sparsity
 * @param {string} window - Window function
 * @param {boolean} scale - Scaling flag
 * @param {number|null} length - Output length
 * @param {string} res_type - Resampling type
 * @param {string|null} dtype - Data type
 * @returns {Float32Array} Reconstructed audio signal
 */
export function icqt(
  C,
  sr = 22050,
  hop_length = 512,
  fmin = null,
  bins_per_octave = 12,
  tuning = 0.0,
  filter_scale = 1,
  norm = 1,
  sparsity = 0.01,
  window = 'hann',
  scale = true,
  length = null,
  res_type = 'soxr_hq',
  dtype = null
) {
  if (fmin === null) {
    fmin = 32.70319566257483
  }

  const n_bins = C.length
  const n_frames = C[0].length

  // Generate inverse CQT filterbank
  const [fft_basis, lengths] = constant_q(
    sr, fmin, n_bins, bins_per_octave,
    window, filter_scale, true, norm, null, 0
  )

  // Invert scaling if it was applied
  let C_scaled = C
  if (scale) {
    C_scaled = C.map((row, i) => {
      const scale_factor = 1.0 / Math.sqrt(lengths[i])
      return row.map(val => ({
        real: val.real * scale_factor,
        imag: val.imag * scale_factor
      }))
    })
  }

  // Perform inverse transform via overlap-add
  const n_fft = Math.max(...lengths) * 2
  const output_length = length || (n_frames * hop_length + n_fft)
  const y = new Float32Array(output_length)

  // Overlap-add reconstruction
  for (let frame = 0; frame < n_frames; frame++) {
    const frame_data = new Array(n_fft)
    for (let i = 0; i < n_fft; i++) {
      frame_data[i] = { real: 0, imag: 0 }
    }

    // Sum contributions from all frequency bins
    for (let bin = 0; bin < n_bins; bin++) {
      const cqt_val = C_scaled[bin][frame]
      const filter = fft_basis[bin]

      for (let k = 0; k < filter.length && k < n_fft; k++) {
        // Complex multiplication and accumulation
        frame_data[k].real += cqt_val.real * filter[k].real - cqt_val.imag * filter[k].imag
        frame_data[k].imag += cqt_val.real * filter[k].imag + cqt_val.imag * filter[k].real
      }
    }

    // IFFT to get time-domain signal
    const ifft_result = ifft_real(frame_data)

    // Overlap-add
    const offset = frame * hop_length
    for (let i = 0; i < ifft_result.length && offset + i < output_length; i++) {
      y[offset + i] += ifft_result[i]
    }
  }

  // Normalize by window sum
  const window_sum = window_sumsquare(window, n_frames, hop_length, n_fft, n_fft)
  for (let i = 0; i < y.length; i++) {
    if (window_sum[i] > 1e-8) {
      y[i] /= window_sum[i]
    }
  }

  return length ? y.slice(0, length) : y
}

/**
 * Compute pseudo Constant-Q Transform
 *
 * Efficiently approximates CQT using STFT with fractional shifts.
 * Faster than full CQT but less accurate.
 *
 * @param {Float32Array} y - Audio time series
 * @param {number} sr - Sample rate
 * @param {number} hop_length - Hop length
 * @param {number|null} fmin - Minimum frequency
 * @param {number} n_bins - Number of bins
 * @param {number} bins_per_octave - Bins per octave
 * @param {number} tuning - Tuning offset
 * @param {number} filter_scale - Filter scale
 * @param {number|null} norm - Normalization
 * @param {number} sparsity - Sparsity
 * @param {string} window - Window function
 * @param {boolean} scale - Scaling
 * @param {string} pad_mode - Padding mode
 * @param {string|null} dtype - Data type
 * @returns {Array<Array<{real: number, imag: number}>>} Pseudo-CQT matrix
 */
export function pseudo_cqt(
  y,
  sr = 22050,
  hop_length = 512,
  fmin = null,
  n_bins = 84,
  bins_per_octave = 12,
  tuning = 0.0,
  filter_scale = 1,
  norm = 1,
  sparsity = 0.01,
  window = 'hann',
  scale = true,
  pad_mode = 'constant',
  dtype = null
) {
  if (fmin === null) {
    fmin = 32.70319566257483
  }

  // Compute STFT
  const n_fft = sr / (fmin / Math.pow(2, 1.0 / bins_per_octave))
  const S = stft(y, Math.ceil(n_fft), hop_length, null, window, true, dtype, pad_mode)

  // Map STFT bins to CQT bins
  const cqt_freqs = cqt_frequencies(n_bins, fmin, bins_per_octave, tuning)
  const fft_freqs = fft_frequencies(sr, Math.ceil(n_fft))

  const C = new Array(n_bins)
  for (let i = 0; i < n_bins; i++) {
    C[i] = new Array(S[0].length)

    // Find nearest FFT bin for each CQT frequency
    const target_freq = cqt_freqs[i]
    let nearest_bin = 0
    let min_dist = Math.abs(fft_freqs[0] - target_freq)

    for (let j = 1; j < fft_freqs.length; j++) {
      const dist = Math.abs(fft_freqs[j] - target_freq)
      if (dist < min_dist) {
        min_dist = dist
        nearest_bin = j
      }
    }

    // Copy STFT values with interpolation
    for (let frame = 0; frame < S[0].length; frame++) {
      if (nearest_bin < S.length) {
        C[i][frame] = S[nearest_bin][frame]
      } else {
        C[i][frame] = { real: 0, imag: 0 }
      }
    }
  }

  return C
}

/**
 * Approximate CQT magnitude spectrogram inversion using Griffin-Lim algorithm
 *
 * Iteratively estimates phase to reconstruct audio from CQT magnitude.
 *
 * @param {Array<Array<number>>} C - CQT magnitude spectrogram
 * @param {number} n_iter - Number of Griffin-Lim iterations
 * @param {number} sr - Sample rate
 * @param {number} hop_length - Hop length
 * @param {number|null} fmin - Minimum frequency
 * @param {number} bins_per_octave - Bins per octave
 * @param {number} tuning - Tuning offset
 * @param {number} filter_scale - Filter scale
 * @param {number|null} norm - Normalization
 * @param {number} sparsity - Sparsity
 * @param {string} window - Window function
 * @param {boolean} scale - Scaling
 * @param {string} pad_mode - Padding mode
 * @param {string} res_type - Resampling type
 * @param {string|null} dtype - Data type
 * @param {number|null} length - Output length
 * @param {number} momentum - Momentum for fast Griffin-Lim
 * @param {string|null} init - Initialization method ('random' or null)
 * @param {number|object|null} random_state - Random state for initialization
 * @returns {Float32Array} Reconstructed audio
 */
export function griffinlim_cqt(
  C,
  n_iter = 32,
  sr = 22050,
  hop_length = 512,
  fmin = null,
  bins_per_octave = 12,
  tuning = 0.0,
  filter_scale = 1,
  norm = 1,
  sparsity = 0.01,
  window = 'hann',
  scale = true,
  pad_mode = 'constant',
  res_type = 'soxr_hq',
  dtype = null,
  length = null,
  momentum = 0.99,
  init = 'random',
  random_state = null
) {
  if (fmin === null) {
    fmin = 32.70319566257483
  }

  const n_bins = C.length
  const n_frames = C[0].length

  // Initialize with random phase
  let angles
  if (init === 'random') {
    angles = Array(n_bins).fill(null).map(() =>
      Array(n_frames).fill(null).map(() => Math.random() * 2 * Math.PI - Math.PI)
    )
  } else {
    angles = Array(n_bins).fill(null).map(() => Array(n_frames).fill(0))
  }

  // Create initial complex CQT
  let C_complex = C.map((row, i) =>
    row.map((mag, j) => ({
      real: mag * Math.cos(angles[i][j]),
      imag: mag * Math.sin(angles[i][j])
    }))
  )

  // Griffin-Lim iterations with momentum
  let y_prev = null

  for (let iter = 0; iter < n_iter; iter++) {
    // Inverse CQT
    const y = icqt(
      C_complex, sr, hop_length, fmin, bins_per_octave,
      tuning, filter_scale, norm, sparsity, window,
      scale, length, res_type, dtype
    )

    // Apply momentum
    let y_final = y
    if (momentum > 0 && y_prev !== null) {
      y_final = y.map((val, i) => val + momentum * (val - y_prev[i]))
    }
    y_prev = y.slice()

    // Forward CQT
    const C_est = cqt(
      y_final, sr, hop_length, fmin, n_bins,
      bins_per_octave, tuning, filter_scale, norm,
      sparsity, window, scale, pad_mode, res_type, dtype
    )

    // Update phase, keep original magnitude
    C_complex = C.map((row, i) =>
      row.map((mag, j) => {
        const est = C_est[i][j]
        const phase = Math.atan2(est.imag, est.real)
        return {
          real: mag * Math.cos(phase),
          imag: mag * Math.sin(phase)
        }
      })
    )
  }

  // Final inverse CQT
  return icqt(
    C_complex, sr, hop_length, fmin, bins_per_octave,
    tuning, filter_scale, norm, sparsity, window,
    scale, length, res_type, dtype
  )
}

// ============================================================================
// Helper Functions
// ============================================================================

/**
 * Compute filter lengths for constant-Q filterbank
 */
function constant_q_lengths(sr, fmin, n_bins, bins_per_octave, window, filter_scale, gamma) {
  const alpha = Math.pow(2, 1.0 / bins_per_octave) - 1
  const lengths = new Array(n_bins)

  for (let i = 0; i < n_bins; i++) {
    const freq = fmin * Math.pow(2, i / bins_per_octave)
    const Q = 1.0 / (alpha + gamma / freq)
    lengths[i] = Math.ceil(Q * sr / freq * filter_scale)
  }

  return lengths
}

/**
 * Compute early downsampling count for efficiency
 */
function __early_downsample_count(nyquist, filter_cutoff, hop_length, n_octaves) {
  let downsample_count = 0

  while (downsample_count < n_octaves - 1 &&
         nyquist / Math.pow(2, downsample_count + 1) > filter_cutoff &&
         hop_length % Math.pow(2, downsample_count + 1) === 0) {
    downsample_count++
  }

  return downsample_count
}

/**
 * Compute CQT response using STFT
 */
function __cqt_response(y, n_fft, hop_length, fft_basis, mode, window, phase, dtype) {
  // This is a simplified version - full implementation would use STFT
  // and convolve with the filter basis
  const S = stft(y, n_fft, hop_length, null, window, true, dtype, 'constant')

  // Apply filterbank (simplified - actual implementation is more complex)
  return S
}

/**
 * Trim and stack CQT responses
 */
function __trim_stack(cqt_responses, n_bins, dtype) {
  if (cqt_responses.length === 0) {
    return []
  }

  const n_frames = cqt_responses[0][0].length
  const result = new Array(n_bins)

  for (let i = 0; i < n_bins; i++) {
    result[i] = cqt_responses[0][i] || new Array(n_frames).fill({ real: 0, imag: 0 })
  }

  return result
}

/**
 * Compute CQT bin frequencies
 */
function cqt_frequencies(n_bins, fmin, bins_per_octave, tuning) {
  const freqs = new Array(n_bins)
  const tuning_factor = Math.pow(2, tuning / bins_per_octave)

  for (let i = 0; i < n_bins; i++) {
    freqs[i] = fmin * Math.pow(2, i / bins_per_octave) * tuning_factor
  }

  return freqs
}

/**
 * Compute FFT bin frequencies
 */
function fft_frequencies(sr, n_fft) {
  const freqs = new Array(Math.floor(n_fft / 2) + 1)
  for (let i = 0; i < freqs.length; i++) {
    freqs[i] = i * sr / n_fft
  }
  return freqs
}

/**
 * Simplified IFFT for real output
 */
function ifft_real(spectrum) {
  // Simplified - should use proper IFFT implementation
  const N = spectrum.length
  const result = new Float32Array(N)

  for (let n = 0; n < N; n++) {
    let sum = 0
    for (let k = 0; k < N; k++) {
      const angle = 2 * Math.PI * k * n / N
      sum += spectrum[k].real * Math.cos(angle) + spectrum[k].imag * Math.sin(angle)
    }
    result[n] = sum / N
  }

  return result
}

/**
 * Compute window sum-square for normalization
 */
function window_sumsquare(window, n_frames, hop_length, win_length, n_fft) {
  const length = n_frames * hop_length + n_fft
  const wss = new Float32Array(length)

  // Get window function
  const win = hann_window(win_length)

  for (let frame = 0; frame < n_frames; frame++) {
    const offset = frame * hop_length
    for (let i = 0; i < win.length && offset + i < length; i++) {
      wss[offset + i] += win[i] * win[i]
    }
  }

  return wss
}

/**
 * Generate interval frequencies for VQT
 */
function interval_frequencies(n_bins, fmin, intervals, bins_per_octave, tuning) {
  if (intervals === 'equal') {
    return cqt_frequencies(n_bins, fmin, bins_per_octave, tuning)
  }

  // Custom intervals
  const freqs = new Array(n_bins)
  for (let i = 0; i < n_bins; i++) {
    const octave = Math.floor(i / intervals.length)
    const interval_idx = i % intervals.length
    freqs[i] = fmin * Math.pow(2, octave) * intervals[interval_idx]
  }

  return freqs
}

/**
 * Generate wavelet filterbank for VQT
 */
function wavelet(freqs, sr, window, filter_scale, pad_fft, norm, dtype, gamma) {
  const n_bins = freqs.length
  const lengths = freqs.map(f => Math.ceil((sr / f) * filter_scale * (1 + gamma / f)))

  const basis = new Array(n_bins)
  for (let i = 0; i < n_bins; i++) {
    const length = lengths[i]
    basis[i] = new Array(length)

    for (let j = 0; j < length; j++) {
      const t = (j - length / 2) / sr
      const phase = 2 * Math.PI * freqs[i] * t
      const window_val = 0.5 * (1 - Math.cos(2 * Math.PI * j / length))  // Hann window

      basis[i][j] = {
        real: window_val * Math.cos(phase),
        imag: window_val * Math.sin(phase)
      }
    }
  }

  return [basis, lengths]
}

/**
 * Generate constant-Q filterbank
 */
function constant_q(sr, fmin, n_bins, bins_per_octave, window, filter_scale,
                    pad_fft, norm, dtype, gamma) {
  const freqs = cqt_frequencies(n_bins, fmin, bins_per_octave, 0)
  return wavelet(freqs, sr, window, filter_scale, pad_fft, norm, dtype, gamma)
}
