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
 * Inverse Fast Fourier Transform
 * @param {Array} spectrum - Complex spectrum
 * @returns {Array} IFFT result
 */
export function ifft(spectrum) {
  const N = spectrum.length

  // Conjugate the spectrum
  const conjugated = spectrum.map((bin) => ({
    real: bin.real,
    imag: -bin.imag,
  }))

  // Apply FFT
  const result = fft(conjugated.map((bin) => bin.real))

  // Conjugate and scale
  return result.map((bin) => ({
    real: bin.real / N,
    imag: -bin.imag / N,
  }))
}

/**
 * Short-Time Fourier Transform
 * @param {Float32Array} y - Audio signal
 * @param {number} n_fft - FFT window size
 * @param {number} hop_length - Hop length
 * @param {string} window - Window type
 * @param {boolean} center - Whether to center the signal
 * @returns {Array} STFT matrix
 */
export function stft(
  y,
  n_fft = 2048,
  hop_length = 512,
  window = 'hann',
  center = true,
) {
  const win = get_window(window, n_fft)

  // Pad the signal if center is true
  let padded_y = y
  if (center) {
    const pad_length = Math.floor(n_fft / 2)
    padded_y = pad_reflect(y, pad_length)
  }

  // Compute STFT frames
  const frames = []
  const num_frames = Math.floor((padded_y.length - n_fft) / hop_length) + 1

  for (let t = 0; t < num_frames; t++) {
    const start = t * hop_length
    const frame = padded_y.slice(start, start + n_fft)

    // Apply window
    const windowed_frame = frame.map((sample, i) => sample * win[i])

    // Compute FFT
    const fft_result = fft(windowed_frame)

    // Keep only positive frequencies
    const positive_freqs = fft_result.slice(0, Math.floor(n_fft / 2) + 1)
    frames.push(positive_freqs)
  }

  return frames
}

/**
 * Inverse Short-Time Fourier Transform
 * @param {Array} D - STFT matrix
 * @param {number} hop_length - Hop length
 * @param {string} window - Window type
 * @param {boolean} center - Whether signal was centered
 * @returns {Float32Array} Reconstructed signal
 */
export function istft(D, hop_length = 512, window = 'hann', center = true) {
  const n_fft = (D[0].length - 1) * 2
  const win = get_window(window, n_fft)
  const n_frames = D.length

  // Calculate output length
  const length = (n_frames - 1) * hop_length + n_fft
  const y = new Float32Array(length)
  const window_sum = new Float32Array(length)

  // Overlap-add synthesis
  for (let t = 0; t < n_frames; t++) {
    // Reconstruct full spectrum (mirror for negative frequencies)
    const spectrum = new Array(n_fft)

    // Positive frequencies
    for (let k = 0; k < D[t].length; k++) {
      spectrum[k] = D[t][k]
    }

    // Negative frequencies (complex conjugate)
    for (let k = 1; k < D[t].length - 1; k++) {
      spectrum[n_fft - k] = {
        real: D[t][k].real,
        imag: -D[t][k].imag,
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
    for (let i = 0; i < n_fft && start + i < length; i++) {
      y[start + i] += frame[i] * win[i]
      window_sum[start + i] += win[i] * win[i]
    }
  }

  // Normalize by window function
  for (let i = 0; i < length; i++) {
    if (window_sum[i] > 1e-10) {
      y[i] /= window_sum[i]
    }
  }

  // Remove padding if center was true
  if (center) {
    const pad = Math.floor(n_fft / 2)
    return y.slice(pad, y.length - pad)
  }

  return y
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
    window[i] = 0.5 * (1 - Math.cos((2 * Math.PI * i) / (n - 1)))
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
    window[i] = 0.54 - 0.46 * Math.cos((2 * Math.PI * i) / (n - 1))
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
      0.5 * Math.cos((2 * Math.PI * i) / (n - 1)) +
      0.08 * Math.cos((4 * Math.PI * i) / (n - 1))
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
 * Reflect padding for arrays
 * @param {Float32Array} array - Input array
 * @param {number} pad_width - Padding width on each side
 * @returns {Float32Array} Padded array
 */
function pad_reflect(array, pad_width) {
  const result = new Float32Array(array.length + 2 * pad_width)

  // Copy original array
  result.set(array, pad_width)

  // Pad left side (reflect)
  for (let i = 0; i < pad_width; i++) {
    result[i] = array[Math.min(pad_width - i, array.length - 1)]
  }

  // Pad right side (reflect)
  for (let i = 0; i < pad_width; i++) {
    result[array.length + pad_width + i] =
      array[Math.max(0, array.length - 2 - i)]
  }

  return result
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
