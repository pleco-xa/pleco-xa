/**
 * FFT and STFT implementations for JavaScript
 * Fast Fourier Transform using Cooley-Tukey algorithm
 */

/**
 * Fast Fourier Transform using Cooley-Tukey algorithm
 * @param {Float32Array|Array} signal - Input signal
 * @returns {Array} FFT result as complex numbers
 */
export function fft(signal) {
  const N = signal.length

  // Base case
  if (N <= 1) {
    return signal.map((x) => ({ real: x, imag: 0 }))
  }

  // Pad to power of 2
  const paddedLength = Math.pow(2, Math.ceil(Math.log2(N)))
  const padded = new Float32Array(paddedLength)
  padded.set(signal)

  return fftRecursive(padded)
}

/**
 * Recursive FFT implementation
 * @param {Float32Array} signal - Input signal (power of 2 length)
 * @returns {Array} FFT result
 */
function fftRecursive(signal) {
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
  const evenFFT = fftRecursive(even)
  const oddFFT = fftRecursive(odd)

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
 * Recursive FFT over complex input ({real, imag} array, power-of-2 length)
 * @param {Array<{real: number, imag: number}>} x - Complex input
 * @returns {Array<{real: number, imag: number}>} FFT result
 */
function fftComplexRecursive(x) {
  const N = x.length

  if (N <= 1) {
    return [{ real: x[0] ? x[0].real : 0, imag: x[0] ? x[0].imag : 0 }]
  }

  const even = new Array(N / 2)
  const odd = new Array(N / 2)
  for (let i = 0; i < N / 2; i++) {
    even[i] = x[2 * i]
    odd[i] = x[2 * i + 1]
  }

  const evenFFT = fftComplexRecursive(even)
  const oddFFT = fftComplexRecursive(odd)

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
 * Inverse Fast Fourier Transform (complex input preserved — no component discarded)
 * ifft(X) = conj(fft(conj(X))) / N
 * @param {Array<{real: number, imag: number}>} spectrum - Complex spectrum (power-of-2 length)
 * @returns {Array<{real: number, imag: number}>} IFFT result
 */
export function ifft(spectrum) {
  const N = spectrum.length
  if (N === 0) return []
  if ((N & (N - 1)) !== 0) {
    throw new Error(`ifft requires power-of-2 length, got ${N}`)
  }

  const conjugated = spectrum.map((bin) => ({
    real: bin.real,
    imag: -bin.imag,
  }))

  const result = fftComplexRecursive(conjugated)

  return result.map((bin) => ({
    real: bin.real / N,
    imag: -bin.imag / N,
  }))
}

/**
 * Short-Time Fourier Transform (Librosa-compatible)
 * @param {Float32Array} y - Audio signal
 * @param {number} n_fft - FFT window size
 * @param {number} hop_length - Hop length (default: n_fft/4)
 * @param {number} win_length - Window length (default: n_fft)
 * @param {string} window - Window type
 * @param {boolean} center - Whether to center the signal
 * @param {string} pad_mode - Padding mode ('reflect', 'constant', 'edge')
 * @returns {Array} STFT matrix [freq, time] - matches Librosa format
 */
export function stft(
  y,
  n_fft = 2048,
  hop_length = null,
  win_length = null,
  window = 'hann',
  center = true,
  pad_mode = 'constant',
) {
  // Set defaults to match Librosa
  if (hop_length === null) {
    hop_length = Math.floor(n_fft / 4)
  }
  if (win_length === null) {
    win_length = n_fft
  }

  // Get window function
  let win = get_window(window, win_length)

  // If win_length < n_fft, pad the window
  if (win_length < n_fft) {
    const padded_win = new Float32Array(n_fft)
    const offset = Math.floor((n_fft - win_length) / 2)
    padded_win.set(win, offset)
    win = padded_win
  } else if (win_length > n_fft) {
    // If win_length > n_fft, center-crop the window
    const offset = Math.floor((win_length - n_fft) / 2)
    win = win.slice(offset, offset + n_fft)
  }

  // Pad the signal if center is true
  let padded_y = y
  if (center) {
    const pad_length = Math.floor(n_fft / 2)
    padded_y = pad_signal(y, pad_length, pad_mode)
  }

  // Compute STFT frames
  const num_frames = Math.floor((padded_y.length - n_fft) / hop_length) + 1
  const n_freq = Math.floor(n_fft / 2) + 1

  // Initialize output matrix as [freq][time] (Librosa format)
  const stft_matrix = Array(n_freq)
  for (let f = 0; f < n_freq; f++) {
    stft_matrix[f] = new Array(num_frames)
  }

  // Compute STFT for each frame
  for (let t = 0; t < num_frames; t++) {
    const start = t * hop_length
    const frame = padded_y.slice(start, start + n_fft)

    // Apply window
    const windowed_frame = frame.map((sample, i) => sample * win[i])

    // Compute FFT
    const fft_result = fft(windowed_frame)

    // Extract positive frequencies and store in [freq][time] format
    for (let f = 0; f < n_freq; f++) {
      stft_matrix[f][t] = fft_result[f]
    }
  }

  return stft_matrix
}

/**
 * Inverse Short-Time Fourier Transform (Librosa-compatible)
 * @param {Array} D - STFT matrix [freq, time]
 * @param {number} hop_length - Hop length (default: n_fft/4)
 * @param {number} win_length - Window length (default: n_fft)
 * @param {string} window - Window type
 * @param {boolean} center - Whether signal was centered
 * @param {number} length - Expected output length (optional)
 * @returns {Float32Array} Reconstructed signal
 */
export function istft(
  D,
  hop_length = null,
  win_length = null,
  window = 'hann',
  center = true,
  length = null,
) {
  // D is [freq][time] format (Librosa-compatible)
  const n_freq = D.length
  const n_frames = D[0] ? D[0].length : 0
  const n_fft = (n_freq - 1) * 2

  // Set defaults
  if (hop_length === null) {
    hop_length = Math.floor(n_fft / 4)
  }
  if (win_length === null) {
    win_length = n_fft
  }

  // Get window function
  let win = get_window(window, win_length)

  // Handle win_length != n_fft
  if (win_length < n_fft) {
    const padded_win = new Float32Array(n_fft)
    const offset = Math.floor((n_fft - win_length) / 2)
    padded_win.set(win, offset)
    win = padded_win
  } else if (win_length > n_fft) {
    const offset = Math.floor((win_length - n_fft) / 2)
    win = win.slice(offset, offset + n_fft)
  }

  // Calculate output length
  const expected_length = (n_frames - 1) * hop_length + n_fft
  const y = new Float32Array(expected_length)
  const window_sum = new Float32Array(expected_length)

  // Overlap-add synthesis
  for (let t = 0; t < n_frames; t++) {
    // Reconstruct full spectrum (mirror for negative frequencies)
    const spectrum = new Array(n_fft)

    // Positive frequencies (extract from [freq][time] format)
    for (let f = 0; f < n_freq; f++) {
      spectrum[f] = D[f][t]
    }

    // Negative frequencies (complex conjugate)
    for (let f = 1; f < n_freq - 1; f++) {
      spectrum[n_fft - f] = {
        real: D[f][t].real,
        imag: -D[f][t].imag,
      }
    }

    // Fill DC and Nyquist for even n_fft
    if (spectrum[spectrum.length - 1] === undefined) {
      spectrum[spectrum.length - 1] = { real: 0, imag: 0 }
    }

    // IFFT
    const frame_complex = ifft(spectrum)
    const frame = frame_complex.map((bin) => bin.real)

    // Apply window and overlap-add
    const start = t * hop_length
    for (let i = 0; i < n_fft && start + i < expected_length; i++) {
      y[start + i] += frame[i] * win[i]
      window_sum[start + i] += win[i] * win[i]
    }
  }

  // Normalize by window function
  for (let i = 0; i < expected_length; i++) {
    if (window_sum[i] > 1e-10) {
      y[i] /= window_sum[i]
    }
  }

  // Remove padding if center was true.
  // When a target length is known, take it directly from the OLA buffer —
  // trimming pad from BOTH ends starves the tail for non-hop-aligned signals.
  let result = y
  if (center) {
    const pad = Math.floor(n_fft / 2)
    if (length !== null) {
      result = y.slice(pad, Math.min(y.length, pad + length))
    } else {
      result = y.slice(pad, Math.max(pad, y.length - pad))
    }
  }

  // Trim or pad to requested length if specified
  if (length !== null) {
    if (result.length > length) {
      result = result.slice(0, length)
    } else if (result.length < length) {
      const padded = new Float32Array(length)
      padded.set(result)
      result = padded
    }
  }

  return result
}

/**
 * Get window function
 * @param {string} window_type - Window type
 * @param {number} n_fft - Window length
 * @returns {Float32Array} Window function
 */
export function get_window(window_type, n_fft) {
  switch (window_type) {
    case 'hann':
      return hann_window(n_fft)
    case 'hamming':
      return hamming_window(n_fft)
    case 'blackman':
      return blackman_window(n_fft)
    case 'rectangular':
    case 'boxcar':
      return new Float32Array(n_fft).fill(1.0)
    default:
      return hann_window(n_fft)
  }
}

/**
 * Hann window
 * @param {number} n - Window length
 * @returns {Float32Array} Hann window
 */
export function hann_window(n) {
  const window = new Float32Array(n)
  for (let i = 0; i < n; i++) {
    window[i] = 0.5 * (1 - Math.cos((2 * Math.PI * i) / n))
  }
  return window
}

/**
 * Hamming window
 * @param {number} n - Window length
 * @returns {Float32Array} Hamming window
 */
export function hamming_window(n) {
  const window = new Float32Array(n)
  for (let i = 0; i < n; i++) {
    window[i] = 0.54 - 0.46 * Math.cos((2 * Math.PI * i) / n)
  }
  return window
}

/**
 * Blackman window
 * @param {number} n - Window length
 * @returns {Float32Array} Blackman window
 */
export function blackman_window(n) {
  const window = new Float32Array(n)
  for (let i = 0; i < n; i++) {
    window[i] =
      0.42 -
      0.5 * Math.cos((2 * Math.PI * i) / n) +
      0.08 * Math.cos((4 * Math.PI * i) / n)
  }
  return window
}

/**
 * Magnitude of complex spectrum
 * @param {Array} spectrum - Complex spectrum
 * @returns {Float32Array} Magnitude spectrum
 */
export function magnitude(spectrum) {
  return spectrum.map((bin) =>
    Math.sqrt(bin.real * bin.real + bin.imag * bin.imag),
  )
}

/**
 * Phase of complex spectrum
 * @param {Array} spectrum - Complex spectrum
 * @returns {Float32Array} Phase spectrum
 */
export function phase(spectrum) {
  return spectrum.map((bin) => Math.atan2(bin.imag, bin.real))
}

/**
 * Power spectrum
 * @param {Array} spectrum - Complex spectrum
 * @returns {Float32Array} Power spectrum
 */
export function power(spectrum) {
  return spectrum.map((bin) => bin.real * bin.real + bin.imag * bin.imag)
}

/**
 * Convert magnitude and phase to complex spectrum
 * @param {Array} magnitude - Magnitude spectrum
 * @param {Array} phase - Phase spectrum
 * @returns {Array} Complex spectrum
 */
export function polar_to_complex(magnitude, phase) {
  return magnitude.map((mag, i) => ({
    real: mag * Math.cos(phase[i]),
    imag: mag * Math.sin(phase[i]),
  }))
}

/**
 * Pad signal with various modes (Librosa-compatible)
 * @param {Float32Array} array - Input array
 * @param {number} pad_width - Padding width on each side
 * @param {string} mode - Padding mode ('constant', 'reflect', 'edge')
 * @returns {Float32Array} Padded array
 */
function pad_signal(array, pad_width, mode = 'constant') {
  const result = new Float32Array(array.length + 2 * pad_width)

  // Copy original array
  result.set(array, pad_width)

  if (mode === 'constant') {
    // Zero padding (default for Librosa)
    // Already zeros from Float32Array initialization
  } else if (mode === 'reflect') {
    // Reflect padding
    for (let i = 0; i < pad_width; i++) {
      result[i] = array[Math.min(pad_width - i, array.length - 1)]
    }
    for (let i = 0; i < pad_width; i++) {
      result[array.length + pad_width + i] =
        array[Math.max(0, array.length - 2 - i)]
    }
  } else if (mode === 'edge') {
    // Edge padding (repeat edge values)
    const leftEdge = array[0]
    const rightEdge = array[array.length - 1]
    for (let i = 0; i < pad_width; i++) {
      result[i] = leftEdge
      result[array.length + pad_width + i] = rightEdge
    }
  }

  return result
}

/**
 * Reflect padding for arrays (backward compatibility)
 * @param {Float32Array} array - Input array
 * @param {number} pad_width - Padding width on each side
 * @returns {Float32Array} Padded array
 */
function pad_reflect(array, pad_width) {
  return pad_signal(array, pad_width, 'reflect')
}

/**
 * FFT frequencies
 * @param {number} sr - Sample rate
 * @param {number} n_fft - FFT size
 * @returns {Float32Array} Frequency bins
 */
export function fft_frequencies(sr, n_fft) {
  const freqs = new Float32Array(Math.floor(n_fft / 2) + 1)
  for (let i = 0; i < freqs.length; i++) {
    freqs[i] = (i * sr) / n_fft
  }
  return freqs
}

/**
 * Simple spectrogram computation
 * @param {Float32Array} y - Audio signal
 * @param {number} n_fft - FFT size
 * @param {number} hop_length - Hop length
 * @returns {Array} Magnitude spectrogram
 */
export function spectrogram(y, n_fft = 2048, hop_length = 512) {
  const stft_matrix = stft(y, n_fft, hop_length)
  return stft_matrix.map((frame) => magnitude(frame))
}
