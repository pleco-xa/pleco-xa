/**
 * Audio filters for JavaScript
 * Preemphasis and deemphasis filtering
 */

/**
 * Apply first-order differencing filter (high-pass)
 * @param {Float32Array} y - Audio time series
 * @param {number} coef - Filter coefficient (typically 0.97)
 * @param {number|null} zi - Initial filter state
 * @param {boolean} return_zf - Whether to return final filter state
 * @returns {Float32Array|Object} Filtered audio or object with audio and final state
 */
export function preemphasis(y, coef = 0.97, zi = null, return_zf = false) {
  // Apply pre-emphasis filter: y[n] = x[n] - coef * x[n-1]
  const y_out = new Float32Array(y.length)

  // Initialize filter state
  let z = zi !== null ? zi : 0

  // Apply filter
  for (let n = 0; n < y.length; n++) {
    if (n === 0) {
      y_out[n] = y[n] - coef * z
      z = y[n]
    } else {
      y_out[n] = y[n] - coef * y[n - 1]
    }
  }

  // Final filter state
  const zf = y[y.length - 1]

  if (return_zf) {
    return { y: y_out, zf: zf }
  } else {
    return y_out
  }
}

/**
 * Apply inverse of preemphasis filter (low-pass)
 * @param {Float32Array} y - Audio time series
 * @param {number} coef - Filter coefficient (typically 0.97)
 * @param {number|null} zi - Initial filter state
 * @param {boolean} return_zf - Whether to return final filter state
 * @returns {Float32Array|Object} Filtered audio or object with audio and final state
 */
export function deemphasis(y, coef = 0.97, zi = null, return_zf = false) {
  // Apply de-emphasis filter: y[n] = x[n] + coef * y[n-1]
  const y_out = new Float32Array(y.length)

  // Initialize filter state
  let z = zi !== null ? zi : 0

  // Apply filter
  for (let n = 0; n < y.length; n++) {
    if (n === 0) {
      y_out[n] = y[n] + coef * z
    } else {
      y_out[n] = y[n] + coef * y_out[n - 1]
    }
  }

  // Final filter state
  const zf = y_out[y_out.length - 1]

  if (return_zf) {
    return { y: y_out, zf: zf }
  } else {
    return y_out
  }
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
