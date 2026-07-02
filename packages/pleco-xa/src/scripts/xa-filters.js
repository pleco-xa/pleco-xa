/**
 * Audio filters for JavaScript
 * Preemphasis and deemphasis filtering
 *
 * SHIM (Wave 5A): preemphasis/deemphasis delegate to the canonical
 * librosa-parity implementations in src/effects/index.js (fixture-gated:
 * effects.json). The legacy local versions initialized zi=0 (librosa uses
 * the lfilter state 2*y[0]-y[1]) and returned a zf convention incompatible
 * with librosa block chaining — both repaired in the canonical module, so
 * deemphasis(preemphasis(x)) now round-trips to x like librosa guarantees.
 */

import {
  preemphasis as preemphasisCanonical,
  deemphasis as deemphasisCanonical,
} from '../effects/index.js'

/**
 * Apply first-order differencing filter (high-pass): y[n] = x[n] - coef*x[n-1]
 * @param {Float32Array} y - Audio time series
 * @param {number} coef - Filter coefficient (typically 0.97)
 * @param {number|null} zi - Initial filter state (librosa default: 2*y[0]-y[1]);
 *   chain non-overlapping blocks by passing the previous call's zf
 * @param {boolean} return_zf - Whether to return final filter state
 * @returns {Float32Array|{y: Float32Array, zf: number}} Filtered audio, or {y, zf}
 */
export function preemphasis(y, coef = 0.97, zi = null, return_zf = false) {
  if (return_zf) {
    const [y_out, zf] = preemphasisCanonical(y, { coef, zi, return_zf: true })
    return { y: y_out, zf }
  }
  return preemphasisCanonical(y, { coef, zi })
}

/**
 * Apply inverse of preemphasis filter (low-pass): x[n] = y[n] + coef*x[n-1]
 * @param {Float32Array} y - Audio time series
 * @param {number} coef - Filter coefficient (typically 0.97)
 * @param {number|null} zi - Initial filter state; when null, librosa's
 *   extrapolation correction is applied so preemphasis round-trips exactly
 * @param {boolean} return_zf - Whether to return final filter state
 * @returns {Float32Array|{y: Float32Array, zf: number}} Filtered audio, or {y, zf}
 */
export function deemphasis(y, coef = 0.97, zi = null, return_zf = false) {
  if (return_zf) {
    const [y_out, zf] = deemphasisCanonical(y, { coef, zi, return_zf: true })
    return { y: y_out, zf }
  }
  return deemphasisCanonical(y, { coef, zi })
}

/**
 * Simple high-pass filter
 * @param {Float32Array} y - Audio time series
 * @param {number} cutoff - Cutoff frequency (normalized 0-1)
 * @returns {Float32Array} Filtered audio
 */
export function highpass(y, cutoff = 0.1) {
  const alpha = Math.exp(-2 * Math.PI * cutoff)
  const y_out = new Float32Array(y.length)

  y_out[0] = y[0]
  for (let n = 1; n < y.length; n++) {
    y_out[n] = alpha * y_out[n - 1] + alpha * (y[n] - y[n - 1])
  }

  return y_out
}

/**
 * Simple low-pass filter
 * @param {Float32Array} y - Audio time series
 * @param {number} cutoff - Cutoff frequency (normalized 0-1)
 * @returns {Float32Array} Filtered audio
 */
export function lowpass(y, cutoff = 0.1) {
  const alpha = Math.exp(-2 * Math.PI * cutoff)
  const y_out = new Float32Array(y.length)

  y_out[0] = y[0]
  for (let n = 1; n < y.length; n++) {
    y_out[n] = alpha * y_out[n - 1] + (1 - alpha) * y[n]
  }

  return y_out
}

// ============================================================================
// Librosa Filter Bank Functions
// ============================================================================

/**
 * Generate Constant-Q filterbank
 *
 * @param {number} sr - Sample rate
 * @param {number} fmin - Minimum frequency
 * @param {number} n_bins - Number of frequency bins
 * @param {number} bins_per_octave - Bins per octave (default: 12)
 * @param {string} window - Window function name (default: 'hann')
 * @param {number} filter_scale - Filter scale factor (default: 1)
 * @param {boolean} pad_fft - Pad filters to next power of 2 (default: true)
 * @param {number|null} norm - Normalization mode (default: 1)
 * @param {string|null} dtype - Data type (default: null)
 * @param {number} gamma - Bandwidth offset for VQT (default: 0)
 * @returns {Object} {filters, lengths} - Filter bank and filter lengths
 */
export function constant_q(
  sr,
  fmin,
  n_bins = 84,
  bins_per_octave = 12,
  window = 'hann',
  filter_scale = 1,
  pad_fft = true,
  norm = 1,
  dtype = null,
  gamma = 0
) {
  const alpha = Math.pow(2, 1.0 / bins_per_octave) - 1

  // Compute filter lengths
  const lengths = []
  const freqs = []

  for (let i = 0; i < n_bins; i++) {
    const freq = fmin * Math.pow(2, i / bins_per_octave)
    const Q = 1.0 / (alpha + gamma / freq)
    const length = Math.ceil(Q * sr / freq * filter_scale)

    freqs.push(freq)
    lengths.push(length)
  }

  // Generate filters
  const filters = []

  for (let i = 0; i < n_bins; i++) {
    const freq = freqs[i]
    const length = lengths[i]
    const fft_length = pad_fft ? Math.pow(2, Math.ceil(Math.log2(length))) : length

    // Create complex filter
    const filter = new Array(fft_length)
    const win = get_window(window, length)

    for (let j = 0; j < fft_length; j++) {
      if (j < length) {
        const t = (j - length / 2) / sr
        const phase = 2 * Math.PI * freq * t
        const w = win[j]

        filter[j] = {
          real: w * Math.cos(phase),
          imag: w * Math.sin(phase)
        }
      } else {
        filter[j] = { real: 0, imag: 0 }
      }
    }

    // Apply normalization
    if (norm !== null) {
      const energy = filter.reduce((sum, val) => sum + val.real * val.real + val.imag * val.imag, 0)
      const scale = Math.pow(energy, -norm / 2)
      filter.forEach(val => {
        val.real *= scale
        val.imag *= scale
      })
    }

    filters.push(filter)
  }

  return { filters, lengths }
}

/**
 * Generate wavelet filterbank
 *
 * @param {Array<number>} freqs - Center frequencies
 * @param {number} sr - Sample rate (default: 22050)
 * @param {string} window - Window function (default: 'hann')
 * @param {number} filter_scale - Filter scale factor (default: 1)
 * @param {boolean} pad_fft - Pad to power of 2 (default: true)
 * @param {number|null} norm - Normalization (default: 1)
 * @param {string|null} dtype - Data type (default: null)
 * @param {number} gamma - Bandwidth offset (default: 0)
 * @param {number|null} alpha - Time-bandwidth product (default: null)
 * @returns {Object} {filters, lengths}
 */
export function wavelet(
  freqs,
  sr = 22050,
  window = 'hann',
  filter_scale = 1,
  pad_fft = true,
  norm = 1,
  dtype = null,
  gamma = 0,
  alpha = null
) {
  const n_filters = freqs.length
  const lengths = freqs.map(f => Math.ceil((sr / f) * filter_scale * (1 + gamma / f)))

  const filters = []

  for (let i = 0; i < n_filters; i++) {
    const freq = freqs[i]
    const length = lengths[i]
    const fft_length = pad_fft ? Math.pow(2, Math.ceil(Math.log2(length))) : length

    const filter = new Array(fft_length)
    const win = get_window(window, length)

    for (let j = 0; j < fft_length; j++) {
      if (j < length) {
        const t = (j - length / 2) / sr
        const phase = 2 * Math.PI * freq * t
        const w = win[j]

        filter[j] = {
          real: w * Math.cos(phase),
          imag: w * Math.sin(phase)
        }
      } else {
        filter[j] = { real: 0, imag: 0 }
      }
    }

    // Normalization
    if (norm !== null) {
      const energy = filter.reduce((sum, val) => sum + val.real * val.real + val.imag * val.imag, 0)
      const scale = Math.pow(energy, -norm / 2)
      filter.forEach(val => {
        val.real *= scale
        val.imag *= scale
      })
    }

    filters.push(filter)
  }

  return { filters, lengths }
}

/**
 * Generate Mel filterbank
 *
 * @param {number} sr - Sample rate
 * @param {number} n_fft - FFT size
 * @param {number} n_mels - Number of Mel bands (default: 128)
 * @param {number} fmin - Minimum frequency (default: 0.0)
 * @param {number|null} fmax - Maximum frequency (default: null, sr/2)
 * @param {boolean} htk - Use HTK formula (default: false)
 * @param {string|number|null} norm - Normalization ('slaney' or number, default: 'slaney')
 * @param {string|null} dtype - Data type (default: null)
 * @returns {Array<Array<number>>} Mel filterbank [n_mels x (n_fft/2 + 1)]
 */
export function mel(
  sr,
  n_fft,
  n_mels = 128,
  fmin = 0.0,
  fmax = null,
  htk = false,
  norm = 'slaney',
  dtype = null
) {
  if (fmax === null) {
    fmax = sr / 2.0
  }

  // Convert Hz to Mel
  const hz_to_mel = htk
    ? (hz) => 2595.0 * Math.log10(1.0 + hz / 700.0)
    : (hz) => 1127.0 * Math.log(1.0 + hz / 700.0)

  // Convert Mel to Hz
  const mel_to_hz = htk
    ? (mel) => 700.0 * (Math.pow(10, mel / 2595.0) - 1.0)
    : (mel) => 700.0 * (Math.exp(mel / 1127.0) - 1.0)

  // Generate Mel-spaced frequencies
  const mel_min = hz_to_mel(fmin)
  const mel_max = hz_to_mel(fmax)
  const mel_points = Array(n_mels + 2).fill(null).map((_, i) =>
    mel_to_hz(mel_min + i * (mel_max - mel_min) / (n_mels + 1))
  )

  // Convert to FFT bin numbers
  const bin_points = mel_points.map(f => Math.floor((n_fft + 1) * f / sr))

  // Generate filterbank
  const n_bins = Math.floor(n_fft / 2) + 1
  const filterbank = Array(n_mels).fill(null).map(() => Array(n_bins).fill(0))

  for (let i = 0; i < n_mels; i++) {
    const left = bin_points[i]
    const center = bin_points[i + 1]
    const right = bin_points[i + 2]

    for (let j = left; j < center; j++) {
      if (j < n_bins) {
        filterbank[i][j] = (j - left) / (center - left)
      }
    }

    for (let j = center; j < right; j++) {
      if (j < n_bins) {
        filterbank[i][j] = (right - j) / (right - center)
      }
    }

    // Normalization
    if (norm === 'slaney') {
      const area = 2.0 / (mel_points[i + 2] - mel_points[i])
      filterbank[i] = filterbank[i].map(v => v * area)
    } else if (typeof norm === 'number') {
      const sum = filterbank[i].reduce((acc, v) => acc + Math.pow(v, norm), 0)
      const scale = Math.pow(sum, -1.0 / norm)
      filterbank[i] = filterbank[i].map(v => v * scale)
    }
  }

  return filterbank
}

/**
 * Generate chroma filterbank
 *
 * @param {number} sr - Sample rate
 * @param {number} n_fft - FFT size
 * @param {number} n_chroma - Number of chroma bins (default: 12)
 * @param {number} tuning - Tuning offset in fractions of a bin (default: 0.0)
 * @param {number} ctroct - Center octave (default: 5.0)
 * @param {number|null} octwidth - Octave width (default: 2)
 * @param {number|null} norm - Normalization (default: 2)
 * @param {boolean} base_c - Start at C (default: true)
 * @param {string|null} dtype - Data type (default: null)
 * @returns {Array<Array<number>>} Chroma filterbank [n_chroma x (n_fft/2 + 1)]
 */
export function chroma(
  sr,
  n_fft,
  n_chroma = 12,
  tuning = 0.0,
  ctroct = 5.0,
  octwidth = 2,
  norm = 2,
  base_c = true,
  dtype = null
) {
  const n_bins = Math.floor(n_fft / 2) + 1
  const filterbank = Array(n_chroma).fill(null).map(() => Array(n_bins).fill(0))

  // Frequency values for each FFT bin
  const freqs = Array(n_bins).fill(null).map((_, i) => i * sr / n_fft)

  for (let i = 0; i < n_bins; i++) {
    const freq = freqs[i]
    if (freq <= 0) continue

    // Convert frequency to fractional MIDI note
    const midi = 12 * Math.log2(freq / 440.0) + 69 + tuning

    // Compute chroma bin
    const chroma_bin = (midi % 12 + 12) % 12

    // Compute octave deviation from center
    const octave = Math.floor(midi / 12)
    const oct_dev = Math.abs(octave - ctroct) / octwidth

    // Gaussian weighting by octave
    const weight = Math.exp(-0.5 * oct_dev * oct_dev)

    // Distribute to neighboring chroma bins with linear interpolation
    const bin_low = Math.floor(chroma_bin)
    const bin_high = Math.ceil(chroma_bin)
    const frac = chroma_bin - bin_low

    filterbank[bin_low % n_chroma][i] += weight * (1 - frac)
    if (bin_low !== bin_high) {
      filterbank[bin_high % n_chroma][i] += weight * frac
    }
  }

  // Normalization
  if (norm !== null) {
    for (let i = 0; i < n_chroma; i++) {
      const sum = filterbank[i].reduce((acc, v) => acc + Math.pow(v, norm), 0)
      if (sum > 0) {
        const scale = Math.pow(sum, -1.0 / norm)
        filterbank[i] = filterbank[i].map(v => v * scale)
      }
    }
  }

  // Rotate to start at C if requested
  if (!base_c) {
    const shift = 9  // Shift to start at A
    const rotated = Array(n_chroma)
    for (let i = 0; i < n_chroma; i++) {
      rotated[i] = filterbank[(i + shift) % n_chroma]
    }
    return rotated
  }

  return filterbank
}

/**
 * Build a two-dimensional diagonal filter
 *
 * Used for path enhancement in recurrence plots.
 *
 * @param {string|Array<number>} window - Window specification
 * @param {number} n - Filter size
 * @param {number} slope - Slope of the diagonal (default: 1.0)
 * @param {number|null} angle - Angle of the diagonal in radians (default: null)
 * @param {boolean} zero_mean - Force zero mean (default: false)
 * @returns {Array<Array<number>>} 2D diagonal filter
 */
export function diagonal_filter(
  window,
  n,
  slope = 1.0,
  angle = null,
  zero_mean = false
) {
  if (angle !== null) {
    slope = Math.tan(angle)
  }

  // Get 1D window
  const win = typeof window === 'string' ? get_window(window, n) : window

  // Create 2D filter
  const filter = Array(n).fill(null).map(() => Array(n).fill(0))

  const center = Math.floor(n / 2)

  for (let i = 0; i < n; i++) {
    for (let j = 0; j < n; j++) {
      // Distance from diagonal
      const di = i - center
      const dj = j - center
      const dist = Math.abs(dj - slope * di) / Math.sqrt(1 + slope * slope)

      // Map distance to window position
      const pos = Math.round(dist)
      if (pos < n) {
        filter[i][j] = win[pos]
      }
    }
  }

  // Zero-mean normalization
  if (zero_mean) {
    const mean = filter.flat().reduce((a, b) => a + b, 0) / (n * n)
    for (let i = 0; i < n; i++) {
      for (let j = 0; j < n; j++) {
        filter[i][j] -= mean
      }
    }
  }

  return filter
}

/**
 * Get a window function
 *
 * @param {string|Array<number>} window - Window specification
 * @param {number} Nx - Window length
 * @param {boolean} fftbins - Center window for FFT use (default: true)
 * @returns {Array<number>} Window values
 */
export function get_window(window, Nx, fftbins = true) {
  if (Array.isArray(window)) {
    return window
  }

  const win = new Array(Nx)

  switch (window) {
    case 'hann':
    case 'hanning':
      for (let i = 0; i < Nx; i++) {
        win[i] = 0.5 * (1 - Math.cos(2 * Math.PI * i / (Nx - 1)))
      }
      break

    case 'hamming':
      for (let i = 0; i < Nx; i++) {
        win[i] = 0.54 - 0.46 * Math.cos(2 * Math.PI * i / (Nx - 1))
      }
      break

    case 'blackman':
      for (let i = 0; i < Nx; i++) {
        const t = i / (Nx - 1)
        win[i] = 0.42 - 0.5 * Math.cos(2 * Math.PI * t) + 0.08 * Math.cos(4 * Math.PI * t)
      }
      break

    case 'bartlett':
      for (let i = 0; i < Nx; i++) {
        win[i] = 1 - Math.abs((i - (Nx - 1) / 2) / ((Nx - 1) / 2))
      }
      break

    case 'triangle':
    case 'triang':
      for (let i = 0; i < Nx; i++) {
        win[i] = 1 - Math.abs((i - (Nx - 1) / 2) / (Nx / 2))
      }
      break

    case 'boxcar':
    case 'ones':
      win.fill(1)
      break

    default:
      throw new Error(`Unknown window type: ${window}`)
  }

  return win
}

/**
 * Compute the sum-square envelope of a window function at a given hop length
 *
 * @param {string|Array<number>} window - Window specification
 * @param {number} n_frames - Number of frames
 * @param {number} hop_length - Hop length (default: 512)
 * @param {number|null} win_length - Window length (default: null, uses n_fft)
 * @param {number} n_fft - FFT size (default: 2048)
 * @param {string|null} dtype - Data type (default: null)
 * @param {number|null} norm - Normalization (default: null)
 * @returns {Array<number>} Sum-square envelope
 */
export function window_sumsquare(
  window,
  n_frames,
  hop_length = 512,
  win_length = null,
  n_fft = 2048,
  dtype = null,
  norm = null
) {
  if (win_length === null) {
    win_length = n_fft
  }

  const length = n_frames * hop_length + n_fft
  const wss = new Array(length).fill(0)

  // Get window
  const win = get_window(window, win_length)

  // Square the window
  const win_sq = win.map(w => w * w)

  // Apply normalization if requested
  let win_norm = win_sq
  if (norm !== null) {
    const sum = win_sq.reduce((a, b) => a + b, 0)
    const scale = Math.pow(sum, -norm)
    win_norm = win_sq.map(w => w * scale)
  }

  // Accumulate window sum-square
  for (let frame = 0; frame < n_frames; frame++) {
    const offset = frame * hop_length
    for (let i = 0; i < win_norm.length && offset + i < length; i++) {
      wss[offset + i] += win_norm[i]
    }
  }

  return wss
}

/**
 * Compute the length of each constant-Q basis filter
 * Port of librosa.filters.constant_q_lengths
 *
 * @param {number} sr - Sample rate
 * @param {number} fmin - Minimum frequency
 * @param {number} n_bins - Number of frequency bins
 * @param {number} bins_per_octave - Bins per octave (default 12)
 * @param {number} tuning - Tuning offset in fractions of a bin (default 0)
 * @param {string|Function} window - Window function name or function
 * @param {number} filter_scale - Filter scale factor (default 1)
 * @returns {Array<number>} Array of filter lengths
 */
export function constant_q_lengths(
  sr,
  fmin,
  n_bins = 84,
  bins_per_octave = 12,
  tuning = 0.0,
  window = 'hann',
  filter_scale = 1
) {
  if (fmin <= 0) {
    throw new Error('fmin must be positive')
  }

  const lengths = new Array(n_bins)
  const Q = filter_scale / (Math.pow(2, 1.0 / bins_per_octave) - 1)

  for (let i = 0; i < n_bins; i++) {
    const freq = fmin * Math.pow(2, (i + tuning) / bins_per_octave)
    const length = Math.ceil(Q * sr / freq)
    lengths[i] = length
  }

  return lengths
}

/**
 * Convert a constant-Q representation to chroma
 * Port of librosa.filters.cq_to_chroma
 *
 * Reduces a constant-Q spectrogram to a 12-bin chroma representation
 * by summing across octaves
 *
 * @param {number} n_input - Number of input CQ bins
 * @param {number} bins_per_octave - Bins per octave (default 12)
 * @param {number} n_chroma - Number of chroma bins (default 12)
 * @param {number} fmin - Minimum frequency (not used, for API compatibility)
 * @param {string} window - Window function (not used, for API compatibility)
 * @param {number} base_c - Base chroma alignment (default true = C)
 * @returns {Array<Array<number>>} Chroma filter matrix [n_chroma][n_input]
 */
export function cq_to_chroma(
  n_input,
  bins_per_octave = 12,
  n_chroma = 12,
  fmin = null,
  window = null,
  base_c = true
) {
  if (n_chroma > bins_per_octave) {
    throw new Error('n_chroma must be less than or equal to bins_per_octave')
  }

  // Initialize chroma filter matrix
  const chroma_filter = Array(n_chroma).fill(null).map(() => new Array(n_input).fill(0))

  // Map each CQ bin to its chroma bin and accumulate
  for (let i = 0; i < n_input; i++) {
    const chroma_idx = i % bins_per_octave

    // Map to n_chroma bins (in case bins_per_octave > n_chroma)
    const target_idx = Math.floor(chroma_idx * n_chroma / bins_per_octave)

    chroma_filter[target_idx][i] = 1.0
  }

  // Normalize each chroma bin
  for (let c = 0; c < n_chroma; c++) {
    const sum = chroma_filter[c].reduce((a, b) => a + b, 0)
    if (sum > 0) {
      for (let i = 0; i < n_input; i++) {
        chroma_filter[c][i] /= sum
      }
    }
  }

  return chroma_filter
}

/**
 * Compute frequencies for multirate filterbanks
 * Port of librosa.filters.mr_frequencies
 *
 * @param {number} tuning - Tuning offset in Hz (default 440 Hz)
 * @param {Array<number>} octaves - Octave numbers (e.g., [-2, -1, 0, 1, 2])
 * @param {number} bins_per_octave - Bins per octave (default 12)
 * @returns {Array<number>} Array of frequencies in Hz
 */
export function mr_frequencies(tuning = 440.0, octaves = null, bins_per_octave = 12) {
  if (octaves === null) {
    octaves = [-2, -1, 0, 1, 2, 3, 4, 5]
  }

  const frequencies = []

  for (const octave of octaves) {
    for (let bin = 0; bin < bins_per_octave; bin++) {
      const freq = tuning * Math.pow(2, octave + bin / bins_per_octave)
      frequencies.push(freq)
    }
  }

  return frequencies
}

/**
 * Construct a semitone filterbank
 * Port of librosa.filters.semitone_filterbank
 *
 * @param {number} sr - Sample rate
 * @param {number} fmin - Minimum frequency
 * @param {number} n_bins - Number of frequency bins (default 84)
 * @param {number} bins_per_octave - Bins per octave (default 12)
 * @param {number} tuning - Tuning offset in fractions of a bin (default 0)
 * @param {number} filter_scale - Filter scale factor (default 1)
 * @param {string} norm - Normalization mode (default null)
 * @returns {Array<Array<number>>} Filterbank matrix
 */
export function semitone_filterbank(
  sr,
  fmin,
  n_bins = 84,
  bins_per_octave = 12,
  tuning = 0.0,
  filter_scale = 1,
  norm = null
) {
  // This is essentially the constant_q filterbank
  // Simplified implementation for JS
  const filters = []

  const Q = filter_scale / (Math.pow(2, 1.0 / bins_per_octave) - 1)

  for (let i = 0; i < n_bins; i++) {
    const freq = fmin * Math.pow(2, (i + tuning) / bins_per_octave)
    const length = Math.ceil(Q * sr / freq)

    // Create triangular filter (simplified)
    const filter = new Array(length).fill(0)
    for (let j = 0; j < length; j++) {
      // Triangular window
      if (j < length / 2) {
        filter[j] = j / (length / 2)
      } else {
        filter[j] = (length - j) / (length / 2)
      }
    }

    filters.push(filter)
  }

  return filters
}

/**
 * Compute the length of each wavelet basis filter
 * Port of librosa.filters.wavelet_lengths
 *
 * @param {number} freqs - Center frequencies (Hz)
 * @param {number} sr - Sample rate
 * @param {string|Function} window - Window function
 * @param {number} filter_scale - Filter scale factor (default 1)
 * @param {number} gamma - Gamma parameter (default 0 for Morlet wavelets)
 * @returns {Array<number>} Array of wavelet filter lengths
 */
export function wavelet_lengths(
  freqs,
  sr,
  window = 'hann',
  filter_scale = 1,
  gamma = 0
) {
  if (!Array.isArray(freqs)) {
    freqs = [freqs]
  }

  const lengths = []

  for (const freq of freqs) {
    if (freq <= 0) {
      throw new Error('All frequencies must be positive')
    }

    // Compute wavelet length based on frequency and sample rate
    // For Morlet wavelet: length ~ filter_scale * sr / freq
    const length = Math.ceil(filter_scale * sr / freq)
    lengths.push(Math.max(1, length))
  }

  return lengths
}

/**
 * Compute the bandwidth of a window function
 * Port of librosa.filters.window_bandwidth
 *
 * Returns the equivalent noise bandwidth (in frequency bins)
 * for a given window function
 *
 * @param {string|Function} window - Window function name or function
 * @param {number} n - Window length (default 1000)
 * @returns {number} Window bandwidth in bins
 */
export function window_bandwidth(window = 'hann', n = 1000) {
  // Get window
  const win = get_window(window, n)

  // Compute energy (sum of squares)
  const energy = win.reduce((sum, w) => sum + w * w, 0)

  // Compute amplitude (sum of values)
  const amplitude = win.reduce((sum, w) => sum + w, 0)

  // Bandwidth = energy / amplitude^2 * n
  if (amplitude === 0) {
    return 0
  }

  const bandwidth = (energy / (amplitude * amplitude)) * n

  return bandwidth
}

// ============================================================================
// Filter Helper Functions
// ============================================================================

/**
 * Compute the sum-square envelope of a window
 * Equivalent to librosa's __window_ss_fill helper
 *
 * This function accumulates the squared window values into an output buffer
 * at regular hop intervals, used for computing window normalization envelopes
 * in overlap-add operations.
 *
 * @private
 * @param {Float32Array|Array<number>} x - Output buffer to accumulate into [n_samples]
 * @param {Float32Array|Array<number>} win_sq - Squared window values [n_fft]
 * @param {number} n_frames - Number of frames
 * @param {number} hop_length - Hop length in samples
 * @returns {void} Modifies x in-place
 */
export function __window_ss_fill(x, win_sq, n_frames, hop_length) {
  const n = x.length
  const n_fft = win_sq.length

  for (let i = 0; i < n_frames; i++) {
    const sample = i * hop_length
    const sample_end = Math.min(n, sample + n_fft)
    const win_end = Math.max(0, Math.min(n_fft, n - sample))

    // Accumulate squared window values
    for (let j = 0; j < win_end && sample + j < sample_end; j++) {
      x[sample + j] += win_sq[j]
    }
  }
}

/**
 * Construct a multirate filterbank
 * Equivalent to librosa's _multirate_fb helper
 *
 * Creates a bank of band-pass filters operating at different sample rates.
 * Each filter is designed to have a specific center frequency and Q factor.
 *
 * Note: This is a simplified JavaScript implementation. Full scipy.signal.iirdesign
 * functionality would require a complete IIR filter design library.
 *
 * @private
 * @param {Array<number>|null} center_freqs - Center frequencies for each filter [n_filters]
 * @param {Array<number>|null} sample_rates - Sample rate for each filter [n_filters]
 * @param {number} Q - Quality factor (center_freq / bandwidth) (default: 25.0)
 * @param {number} passband_ripple - Passband ripple in dB (default: 1)
 * @param {number} stopband_attenuation - Stopband attenuation in dB (default: 50)
 * @param {string} ftype - Filter type ('ellip', 'butter', 'cheby1', etc.) (default: 'ellip')
 * @param {string} flayout - Filter layout ('sos', 'ba') (default: 'sos')
 * @returns {{filterbank: Array, sample_rates: Array}} Filterbank and sample rates
 */
export function _multirate_fb(
  center_freqs = null,
  sample_rates = null,
  Q = 25.0,
  passband_ripple = 1,
  stopband_attenuation = 50,
  ftype = 'ellip',
  flayout = 'sos'
) {
  if (center_freqs === null) {
    throw new Error('center_freqs must be provided')
  }

  if (sample_rates === null) {
    throw new Error('sample_rates must be provided')
  }

  if (center_freqs.length !== sample_rates.length) {
    throw new Error('Number of center_freqs and sample_rates must be equal')
  }

  const filterbank = []

  for (let i = 0; i < center_freqs.length; i++) {
    const center_freq = center_freqs[i]
    const sample_rate = sample_rates[i]
    const nyquist = 0.5 * sample_rate
    const filter_bandwidth = center_freq / Q

    // Normalized passband and stopband frequencies
    const passband_freqs = [
      (center_freq - 0.5 * filter_bandwidth) / nyquist,
      (center_freq + 0.5 * filter_bandwidth) / nyquist
    ]

    const stopband_freqs = [
      (center_freq - filter_bandwidth) / nyquist,
      (center_freq + filter_bandwidth) / nyquist
    ]

    // Simplified filter design (placeholder for full IIR design)
    // In a complete implementation, this would call an IIR filter design function
    // similar to scipy.signal.iirdesign
    const filter = {
      type: ftype,
      layout: flayout,
      center_freq: center_freq,
      sample_rate: sample_rate,
      passband: passband_freqs,
      stopband: stopband_freqs,
      Q: Q,
      // Coefficients would be computed here by IIR design algorithm
      // For now, store design parameters
      passband_ripple: passband_ripple,
      stopband_attenuation: stopband_attenuation
    }

    filterbank.push(filter)
  }

  return { filterbank, sample_rates }
}

/**
 * Compute the relative bandwidth for each frequency
 * Equivalent to librosa's _relative_bandwidth helper
 *
 * Used in wavelet basis construction to determine the bandwidth
 * of each filter based on the spacing between adjacent frequencies.
 *
 * @private
 * @param {Array<number>} freqs - Array of frequencies [n_freqs]
 * @returns {Float32Array} Relative bandwidth for each frequency [n_freqs]
 */
export function _relative_bandwidth(freqs) {
  if (freqs.length <= 1) {
    throw new Error(`2 or more frequencies required. Given ${freqs.length} frequencies`)
  }

  const n = freqs.length
  const bpo = new Float32Array(n)  // Bands per octave
  const logf = new Float32Array(n)

  // Compute log2 of frequencies
  for (let i = 0; i < n; i++) {
    logf[i] = Math.log2(freqs[i])
  }

  // Compute bands per octave using finite differences
  // First element: forward difference
  bpo[0] = 1.0 / (logf[1] - logf[0])

  // Last element: backward difference
  bpo[n - 1] = 1.0 / (logf[n - 1] - logf[n - 2])

  // Middle elements: central difference
  for (let i = 1; i < n - 1; i++) {
    bpo[i] = 2.0 / (logf[i + 1] - logf[i - 1])
  }

  // Compute relative bandwidth: alpha = (2^(2/bpo) - 1) / (2^(2/bpo) + 1)
  const alpha = new Float32Array(n)
  for (let i = 0; i < n; i++) {
    const exp_term = Math.pow(2.0, 2.0 / bpo[i])
    alpha[i] = (exp_term - 1.0) / (exp_term + 1.0)
  }

  return alpha
}

/**
 * Wrap a window function to support fractional lengths
 * Equivalent to librosa's _wrap helper (inner function of __float_window)
 *
 * For fractional window lengths n, this function:
 * 1. Creates a window of length ceil(n)
 * 2. Sets all values from floor(n) onwards to 0
 *
 * This is used for precise control of window lengths in filter design.
 *
 * @private
 * @param {number} n - Window length (can be fractional)
 * @param {string} window_spec - Window type ('hann', 'hamming', etc.)
 * @returns {Float32Array} Wrapped window of length ceil(n)
 */
export function _wrap(n, window_spec = 'hann') {
  const n_min = Math.floor(n)
  const n_max = Math.ceil(n)

  // Get window of floor(n) length
  let window = get_window(window_spec, n_min)

  // Pad to ceil(n) length if needed
  if (window.length < n_max) {
    const padded = new Float32Array(n_max)
    padded.set(window)
    window = padded
  }

  // Zero out values from floor(n) onwards
  for (let i = n_min; i < n_max; i++) {
    window[i] = 0.0
  }

  return window
}
