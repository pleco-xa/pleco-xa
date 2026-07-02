/**
 * Port of librosa.feature.tempogram
 * Tempogram and tempo analysis for rhythm tracking
 * Librosa-compatible tempogram computation for JavaScript
 */

import { stft, hann_window } from './xa-fft.js'
import { frames_to_time } from './xa-convert.js'

/**
 * Compute the tempogram: local autocorrelation of the onset strength envelope
 * Port of librosa.feature.tempogram
 * @param {Float32Array} y - Audio time series (optional if onset_envelope provided)
 * @param {number} sr - Sample rate
 * @param {Array} onset_envelope - Pre-computed onset strength envelope
 * @param {number} hop_length - Hop length for frame analysis
 * @param {number} win_length - Window length for temporal autocorrelation
 * @param {boolean} center - Center the autocorrelation windows
 * @param {string} window - Window function type
 * @param {number} norm - Normalization parameter (Infinity = max norm)
 * @returns {Array} Tempogram [win_length/2 + 1, n_frames]
 */
export function tempogram(
  y = null,
  sr = 22050,
  onset_envelope = null,
  hop_length = 512,
  win_length = 384,
  center = true,
  window = 'hann',
  norm = Infinity,
) {
  let oenv = onset_envelope

  // Compute onset envelope if not provided
  if (oenv === null) {
    if (y === null) {
      throw new Error('Either y or onset_envelope must be provided')
    }
    oenv = onset_strength(y, sr, hop_length)
  }

  // Get window function
  const win = get_window(window, win_length)

  // Pad onset envelope if centering
  let padded_oenv = oenv
  if (center) {
    const pad_width = Math.floor(win_length / 2)
    padded_oenv = pad_constant(oenv, pad_width, 0)
  }

  // Compute number of frames
  const n_frames = Math.max(1, padded_oenv.length - win_length + 1)
  const n_lags = Math.floor(win_length / 2) + 1

  // Initialize tempogram output [n_lags][n_frames]
  const tgram = Array(n_lags)
    .fill(null)
    .map(() => new Float32Array(n_frames))

  // Compute local autocorrelation for each frame
  for (let t = 0; t < n_frames; t++) {
    // Extract windowed frame
    const frame = padded_oenv.slice(t, t + win_length)
    const windowed = frame.map((val, i) => val * win[i])

    // Compute autocorrelation via FFT
    const ac = autocorrelate(windowed)

    // Keep only positive lags
    for (let lag = 0; lag < n_lags; lag++) {
      tgram[lag][t] = ac[lag]
    }
  }

  // Apply normalization
  if (norm !== null) {
    return normalize_tempogram(tgram, norm)
  }

  return tgram
}

/**
 * Compute Fourier tempogram
 * Port of librosa.feature.fourier_tempogram
 * @param {Float32Array} y - Audio time series (optional if onset_envelope provided)
 * @param {number} sr - Sample rate
 * @param {Array} onset_envelope - Pre-computed onset strength envelope
 * @param {number} hop_length - Hop length for frame analysis
 * @param {number} win_length - Window length for STFT
 * @param {boolean} center - Center the STFT windows
 * @param {string} window - Window function type
 * @returns {Array} Fourier tempogram [n_freq, n_frames] as complex values
 */
export function fourier_tempogram(
  y = null,
  sr = 22050,
  onset_envelope = null,
  hop_length = 512,
  win_length = 384,
  center = true,
  window = 'hann',
) {
  let oenv = onset_envelope

  // Compute onset envelope if not provided
  if (oenv === null) {
    if (y === null) {
      throw new Error('Either y or onset_envelope must be provided')
    }
    oenv = onset_strength(y, sr, hop_length)
  }

  // Compute STFT of onset envelope
  // Convert Float32Array to regular array if needed
  const oenv_array = Array.isArray(oenv) ? oenv : Array.from(oenv)

  const ftgram = stft(
    new Float32Array(oenv_array),
    win_length,
    hop_length,
    null,
    window,
    center,
    'constant',
  )

  return ftgram
}

/**
 * Compute tempogram ratio (VQT-based)
 * Port of librosa.feature.tempogram_ratio
 * @param {Array} tg - Tempogram [n_lags, n_frames]
 * @param {number} sr - Sample rate
 * @param {number} hop_length - Hop length
 * @param {number} win_length - Window length
 * @returns {Object} {ratio: Array, loc: Array} - ratio matrix and local maxima locations
 */
export function tempogram_ratio(tg, sr = 22050, hop_length = 512, win_length = 384) {
  const n_lags = tg.length
  const n_frames = tg[0] ? tg[0].length : 0

  // Compute tempo frequencies (lags to BPM)
  const tempo_frequencies = new Float32Array(n_lags)
  for (let i = 0; i < n_lags; i++) {
    // Convert lag to BPM
    const samples_per_lag = hop_length
    const lag_seconds = (i * samples_per_lag) / sr
    if (lag_seconds > 0) {
      tempo_frequencies[i] = 60.0 / lag_seconds
    } else {
      tempo_frequencies[i] = 0
    }
  }

  // Compute ratio matrix
  const ratio = Array(n_lags)
    .fill(null)
    .map(() => new Float32Array(n_frames))

  const loc = Array(n_lags)
    .fill(null)
    .map(() => new Int32Array(n_frames))

  // For each frame, find local maxima and compute ratios
  for (let t = 0; t < n_frames; t++) {
    const frame = tg.map((lag_band) => lag_band[t])

    // Find peaks in tempogram
    const peaks = find_peaks(frame)

    if (peaks.length === 0) {
      continue
    }

    // Get primary tempo (strongest peak)
    const primary_idx = peaks[0]

    // Compute ratios for all lags relative to primary
    for (let lag = 0; lag < n_lags; lag++) {
      if (tempo_frequencies[primary_idx] > 0) {
        ratio[lag][t] = tempo_frequencies[lag] / tempo_frequencies[primary_idx]
      }
      loc[lag][t] = primary_idx
    }
  }

  return { ratio, loc }
}

/**
 * Compute onset strength envelope (simplified)
 * @param {Float32Array} y - Audio signal
 * @param {number} sr - Sample rate
 * @param {number} hop_length - Hop length
 * @returns {Float32Array} Onset strength envelope
 */
function onset_strength(y, sr = 22050, hop_length = 512) {
  // Compute STFT
  const D = stft(y, 2048, hop_length, null, 'hann', true, 'constant')

  const n_freq = D.length
  const n_frames = D[0] ? D[0].length : 0

  // Compute magnitude spectrogram
  const mag = Array(n_freq)
    .fill(null)
    .map(() => new Float32Array(n_frames))

  for (let f = 0; f < n_freq; f++) {
    for (let t = 0; t < n_frames; t++) {
      const bin = D[f][t]
      mag[f][t] = Math.sqrt(bin.real * bin.real + bin.imag * bin.imag)
    }
  }

  // Compute spectral flux (onset strength)
  const oenv = new Float32Array(n_frames)

  for (let t = 1; t < n_frames; t++) {
    let flux = 0
    for (let f = 0; f < n_freq; f++) {
      const diff = mag[f][t] - mag[f][t - 1]
      flux += Math.max(0, diff) // Half-wave rectification
    }
    oenv[t] = flux
  }

  return oenv
}

/**
 * Autocorrelation via FFT
 * @param {Array} x - Input signal
 * @returns {Array} Autocorrelation
 */
function autocorrelate(x) {
  const N = x.length

  // Pad to next power of 2 for efficiency
  const fft_size = Math.pow(2, Math.ceil(Math.log2(2 * N - 1)))
  const padded = new Float32Array(fft_size)
  padded.set(x)

  // Compute FFT
  const X = fft_real(padded)

  // Compute power spectrum
  for (let i = 0; i < X.length; i++) {
    const mag_sq = X[i].real * X[i].real + X[i].imag * X[i].imag
    X[i].real = mag_sq
    X[i].imag = 0
  }

  // Inverse FFT
  const ac = ifft_real(X)

  // Normalize and return first N lags
  const result = new Array(N)
  if (ac[0] > 0) {
    for (let i = 0; i < N; i++) {
      result[i] = ac[i] / ac[0]
    }
  } else {
    result.fill(0)
  }

  return result
}

/**
 * Simple real FFT (uses complex FFT)
 * @param {Float32Array} x - Real input
 * @returns {Array} Complex FFT result
 */
function fft_real(x) {
  const N = x.length

  // Base case
  if (N <= 1) {
    return [{ real: x[0] || 0, imag: 0 }]
  }

  // Pad to power of 2 if needed
  const fft_size = Math.pow(2, Math.ceil(Math.log2(N)))
  const padded = new Float32Array(fft_size)
  padded.set(x)

  return fft_recursive(padded)
}

/**
 * Recursive FFT implementation
 * @param {Float32Array} signal - Input signal (power of 2 length)
 * @returns {Array} FFT result
 */
function fft_recursive(signal) {
  const N = signal.length

  if (N <= 1) {
    return [{ real: signal[0] || 0, imag: 0 }]
  }

  // Divide
  const even = new Float32Array(N / 2)
  const odd = new Float32Array(N / 2)

  for (let i = 0; i < N / 2; i++) {
    even[i] = signal[2 * i]
    odd[i] = signal[2 * i + 1]
  }

  // Conquer
  const evenFFT = fft_recursive(even)
  const oddFFT = fft_recursive(odd)

  // Combine
  const result = new Array(N)
  for (let k = 0; k < N / 2; k++) {
    const t = (-2 * Math.PI * k) / N
    const wReal = Math.cos(t)
    const wImag = Math.sin(t)

    const oddReal = wReal * oddFFT[k].real - wImag * oddFFT[k].imag
    const oddImag = wReal * oddFFT[k].imag + wImag * oddFFT[k].real

    result[k] = {
      real: evenFFT[k].real + oddReal,
      imag: evenFFT[k].imag + oddImag,
    }

    result[k + N / 2] = {
      real: evenFFT[k].real - oddReal,
      imag: evenFFT[k].imag - oddImag,
    }
  }

  return result
}

/**
 * Inverse FFT for real signals
 * @param {Array} X - Complex FFT result
 * @returns {Float32Array} Real signal
 */
function ifft_real(X) {
  const N = X.length

  // Conjugate
  const X_conj = X.map((bin) => ({ real: bin.real, imag: -bin.imag }))

  // Forward FFT
  const result = fft_recursive_complex(X_conj)

  // Conjugate and scale
  const output = new Float32Array(N)
  for (let i = 0; i < N; i++) {
    output[i] = result[i].real / N
  }

  return output
}

/**
 * Recursive FFT for complex input
 * @param {Array} signal - Complex input
 * @returns {Array} FFT result
 */
function fft_recursive_complex(signal) {
  const N = signal.length

  if (N <= 1) {
    return signal
  }

  // Divide
  const even = new Array(N / 2)
  const odd = new Array(N / 2)

  for (let i = 0; i < N / 2; i++) {
    even[i] = signal[2 * i]
    odd[i] = signal[2 * i + 1]
  }

  // Conquer
  const evenFFT = fft_recursive_complex(even)
  const oddFFT = fft_recursive_complex(odd)

  // Combine
  const result = new Array(N)
  for (let k = 0; k < N / 2; k++) {
    const t = (-2 * Math.PI * k) / N
    const wReal = Math.cos(t)
    const wImag = Math.sin(t)

    const oddReal = wReal * oddFFT[k].real - wImag * oddFFT[k].imag
    const oddImag = wReal * oddFFT[k].imag + wImag * oddFFT[k].real

    result[k] = {
      real: evenFFT[k].real + oddReal,
      imag: evenFFT[k].imag + oddImag,
    }

    result[k + N / 2] = {
      real: evenFFT[k].real - oddReal,
      imag: evenFFT[k].imag - oddImag,
    }
  }

  return result
}

/**
 * Get window function
 * @param {string} window_type - Window type
 * @param {number} length - Window length
 * @returns {Float32Array} Window
 */
function get_window(window_type, length) {
  if (window_type === 'hann') {
    return hann_window(length)
  }
  // Default to rectangular window
  return new Float32Array(length).fill(1.0)
}

/**
 * Pad array with constant value
 * @param {Array|Float32Array} arr - Input array
 * @param {number} pad_width - Padding width on each side
 * @param {number} value - Padding value
 * @returns {Array} Padded array
 */
function pad_constant(arr, pad_width, value) {
  const result = new Float32Array(arr.length + 2 * pad_width)
  result.fill(value)
  result.set(arr, pad_width)
  return result
}

/**
 * Normalize tempogram
 * @param {Array} tgram - Tempogram [n_lags][n_frames]
 * @param {number} norm - Normalization type
 * @returns {Array} Normalized tempogram
 */
function normalize_tempogram(tgram, norm) {
  const n_lags = tgram.length
  const n_frames = tgram[0] ? tgram[0].length : 0

  const result = Array(n_lags)
    .fill(null)
    .map(() => new Float32Array(n_frames))

  if (norm === Infinity) {
    // Max normalization per frame
    for (let t = 0; t < n_frames; t++) {
      let max_val = 0
      for (let lag = 0; lag < n_lags; lag++) {
        max_val = Math.max(max_val, Math.abs(tgram[lag][t]))
      }

      if (max_val > 0) {
        for (let lag = 0; lag < n_lags; lag++) {
          result[lag][t] = tgram[lag][t] / max_val
        }
      } else {
        for (let lag = 0; lag < n_lags; lag++) {
          result[lag][t] = tgram[lag][t]
        }
      }
    }
  } else {
    // No normalization
    return tgram
  }

  return result
}

/**
 * Find peaks in 1D array (simplified)
 * @param {Array} arr - Input array
 * @returns {Array} Peak indices sorted by magnitude
 */
function find_peaks(arr) {
  const peaks = []

  for (let i = 1; i < arr.length - 1; i++) {
    if (arr[i] > arr[i - 1] && arr[i] > arr[i + 1]) {
      peaks.push(i)
    }
  }

  // Sort by magnitude (descending)
  peaks.sort((a, b) => arr[b] - arr[a])

  return peaks
}

/**
 * Estimate tempo from tempogram
 * @param {Array} tgram - Tempogram [n_lags, n_frames]
 * @param {number} sr - Sample rate
 * @param {number} hop_length - Hop length
 * @param {number} win_length - Window length used for tempogram
 * @param {number} start_bpm - Minimum BPM to consider
 * @param {number} max_tempo - Maximum BPM to consider
 * @returns {Object} {tempo: number, strength: number}
 */
export function estimate_tempo(
  tgram,
  sr = 22050,
  hop_length = 512,
  win_length = 384,
  start_bpm = 30,
  max_tempo = 300,
) {
  const n_lags = tgram.length
  const n_frames = tgram[0] ? tgram[0].length : 0

  // Average tempogram across frames
  const avg_tgram = new Float32Array(n_lags)
  for (let lag = 0; lag < n_lags; lag++) {
    let sum = 0
    for (let t = 0; t < n_frames; t++) {
      sum += tgram[lag][t]
    }
    avg_tgram[lag] = sum / n_frames
  }

  // Convert lags to BPM
  const bpm_per_lag = new Float32Array(n_lags)
  for (let lag = 0; lag < n_lags; lag++) {
    const lag_seconds = (lag * hop_length) / sr
    if (lag_seconds > 0) {
      bpm_per_lag[lag] = 60.0 / lag_seconds
    }
  }

  // Find peak within BPM range
  let best_lag = 0
  let best_strength = 0

  for (let lag = 1; lag < n_lags; lag++) {
    const bpm = bpm_per_lag[lag]
    if (bpm >= start_bpm && bpm <= max_tempo) {
      if (avg_tgram[lag] > best_strength) {
        best_strength = avg_tgram[lag]
        best_lag = lag
      }
    }
  }

  return {
    tempo: bpm_per_lag[best_lag] || 120,
    strength: best_strength,
  }
}
