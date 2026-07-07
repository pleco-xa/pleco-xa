/**
 * FFT and STFT implementations for JavaScript
 * Fast Fourier Transform: iterative in-place radix-2 Cooley-Tukey
 * (bit-reversal permutation + butterfly stages over flat Float64Array
 * real/imag pairs). Complex {real, imag} objects only exist at the public
 * API boundary — the transform itself never allocates per-bin objects, so
 * long signals no longer exhaust the heap the way the old recursive
 * implementation did (one boxed object per bin per recursion level).
 */

/** Next power of 2 >= n (n >= 1). */
function nextPow2(n) {
  return Math.pow(2, Math.ceil(Math.log2(n)))
}

// Twiddle-factor tables (cos/sin of -2*pi*k/n for k in [0, n/2)), cached per
// transform size. Sizes above the cap are computed per call instead of cached
// so a one-shot giant transform can't permanently pin hundreds of MB.
const TWIDDLE_CACHE_MAX = 65536
const twiddleCache = new Map()

function getTwiddles(n) {
  const cached = twiddleCache.get(n)
  if (cached) return cached
  const half = n >> 1
  const cos = new Float64Array(half)
  const sin = new Float64Array(half)
  for (let k = 0; k < half; k++) {
    const t = (-2 * Math.PI * k) / n
    cos[k] = Math.cos(t)
    sin[k] = Math.sin(t)
  }
  const tables = { cos, sin }
  if (n <= TWIDDLE_CACHE_MAX) twiddleCache.set(n, tables)
  return tables
}

/**
 * Iterative in-place radix-2 DIT FFT core.
 * Operates directly on flat real/imag arrays — zero allocations.
 * @param {Float64Array} re - Real parts (length n, power of 2), transformed in place
 * @param {Float64Array} im - Imag parts (length n), transformed in place
 * @param {number} n - Transform size (power of 2)
 * @param {Float64Array} cosT - Twiddle cosines, length n/2
 * @param {Float64Array} sinT - Twiddle sines, length n/2
 */
function fftCore(re, im, n, cosT, sinT) {
  // Bit-reversal permutation
  for (let i = 1, j = 0; i < n; i++) {
    let bit = n >> 1
    for (; j & bit; bit >>= 1) j ^= bit
    j ^= bit
    if (i < j) {
      const tr = re[i]
      re[i] = re[j]
      re[j] = tr
      const ti = im[i]
      im[i] = im[j]
      im[j] = ti
    }
  }

  // Butterfly stages
  for (let len = 2; len <= n; len <<= 1) {
    const half = len >> 1
    const stride = n / len
    for (let start = 0; start < n; start += len) {
      for (let k = 0; k < half; k++) {
        const wr = cosT[k * stride]
        const wi = sinT[k * stride]
        const i0 = start + k
        const i1 = i0 + half
        const oddReal = re[i1] * wr - im[i1] * wi
        const oddImag = re[i1] * wi + im[i1] * wr
        re[i1] = re[i0] - oddReal
        im[i1] = im[i0] - oddImag
        re[i0] += oddReal
        im[i0] += oddImag
      }
    }
  }
}

/**
 * Throw a clear diagnostic if the signal contains NaN/Infinity. The old
 * implementation silently laundered NaN to 0 at the recursion base case,
 * which let NaN-corrupted audio produce plausible fabricated spectra.
 * Failures must throw with diagnostics rather than fabricate.
 * @param {Float32Array|Array} signal - Input samples
 * @param {string} fnName - Calling function name for the diagnostic
 */
function assertFiniteSignal(signal, fnName) {
  for (let i = 0; i < signal.length; i++) {
    const v = signal[i]
    if (!Number.isFinite(v)) {
      throw new Error(
        `${fnName}: input contains non-finite values at index ${i} (value: ${v})`,
      )
    }
  }
}

/**
 * Fast Fourier Transform using Cooley-Tukey algorithm (radix-2, iterative).
 *
 * Zero-padding contract: this is a radix-2 transform, so inputs whose length
 * is not already a power of 2 are zero-padded UP to the next power of 2. The
 * returned spectrum therefore has `2**ceil(log2(N))` bins, which for a
 * non-power-of-2 input is LONGER than the input. This padding is intentional
 * (not a silent best-guess): pass a power-of-2-length signal to get a spectrum
 * of exactly that length, or account for the padded length in the caller.
 *
 * Non-finite policy: NaN/Infinity in the input throws with the offending
 * index — corrupted audio is never laundered into a plausible spectrum.
 *
 * @param {Float32Array|Array} signal - Input signal
 * @returns {Array} FFT result as complex numbers; length = next power of 2 >= N
 */
export function fft(signal) {
  if (signal == null || typeof signal.length !== 'number') {
    throw new Error('fft: input must be an array or typed array of samples')
  }

  const N = signal.length

  if (N === 0) {
    throw new Error('fft: input signal must not be empty')
  }

  assertFiniteSignal(signal, 'fft')

  // Base case. Array.from (not signal.map) so typed-array inputs still
  // produce an array of {real, imag} objects instead of coerced NaNs.
  if (N === 1) {
    return Array.from(signal, (x) => ({ real: x, imag: 0 }))
  }

  // Pad to power of 2 (radix-2 requirement — see the zero-padding contract in
  // the JSDoc above). When N is already a power of 2, paddedLength === N and no
  // padding occurs, so the spectrum length matches the input exactly.
  // Math.fround preserves the previous implementation's numerics, which
  // round the input to float32 on entry (a no-op for Float32Array input).
  const paddedLength = nextPow2(N)
  const re = new Float64Array(paddedLength)
  const im = new Float64Array(paddedLength)
  for (let i = 0; i < N; i++) {
    re[i] = Math.fround(signal[i])
  }

  const tw = getTwiddles(paddedLength)
  fftCore(re, im, paddedLength, tw.cos, tw.sin)

  // Box into {real, imag} objects only at the public boundary.
  const result = new Array(paddedLength)
  for (let k = 0; k < paddedLength; k++) {
    result[k] = { real: re[k], imag: im[k] }
  }
  return result
}

/**
 * Inverse Fast Fourier Transform (complex input preserved — no component discarded)
 * ifft(X) = conj(fft(conj(X))) / N
 *
 * Non-finite policy: a missing bin or a bin with NaN/Infinity components
 * throws with the offending index (the old recursive implementation silently
 * treated missing bins as 0).
 *
 * @param {Array<{real: number, imag: number}>} spectrum - Complex spectrum (power-of-2 length)
 * @returns {Array<{real: number, imag: number}>} IFFT result
 */
export function ifft(spectrum) {
  if (spectrum == null || typeof spectrum.length !== 'number') {
    throw new Error('ifft: input must be an array of {real, imag} bins')
  }
  const N = spectrum.length
  if (N === 0) return []
  if ((N & (N - 1)) !== 0) {
    throw new Error(`ifft requires power-of-2 length, got ${N}`)
  }

  const re = new Float64Array(N)
  const im = new Float64Array(N)
  for (let i = 0; i < N; i++) {
    const bin = spectrum[i]
    if (
      bin == null ||
      !Number.isFinite(bin.real) ||
      !Number.isFinite(bin.imag)
    ) {
      throw new Error(
        `ifft: spectrum contains a missing or non-finite bin at index ${i}`,
      )
    }
    // Conjugate on the way in (ifft via forward transform)
    re[i] = bin.real
    im[i] = -bin.imag
  }

  const tw = getTwiddles(N)
  fftCore(re, im, N, tw.cos, tw.sin)

  const result = new Array(N)
  for (let k = 0; k < N; k++) {
    result[k] = { real: re[k] / N, imag: -im[k] / N }
  }
  return result
}

/**
 * Shared STFT frame engine: validates input, prepares the analysis window,
 * then streams windowed frames through the iterative FFT core using two
 * reusable Float64Array scratch buffers (zero per-frame allocations beyond
 * whatever the consumer callback builds).
 *
 * Padding for center=true is virtual — boundary samples are computed from the
 * same index mapping pad_signal uses ('constant', 'reflect', 'edge'), without
 * materializing a padded copy of the signal. Windowed samples go through
 * Math.fround to preserve the previous implementation's float32 numerics.
 *
 * @param {Float32Array|Array} y - Audio signal
 * @param {number} n_fft - Length of the FFT window
 * @param {number|null} hop_length - Hop length (default: n_fft/4)
 * @param {number|null} win_length - Window length (default: n_fft)
 * @param {string} window - Window type
 * @param {boolean} center - Whether to center the signal
 * @param {string} pad_mode - Padding mode ('reflect', 'constant', 'edge')
 * @param {Function} setup - Called once with (n_freq, num_frames); must return
 *   an onFrame(t, re, im) callback that consumes each transformed frame.
 *   re/im are scratch buffers reused across frames — copy, don't retain.
 */
function runStftFrames(
  y,
  n_fft,
  hop_length,
  win_length,
  window,
  center,
  pad_mode,
  setup,
) {
  if (y == null || typeof y.length !== 'number') {
    throw new Error('stft: input must be an array or typed array of samples')
  }
  if (y.length === 0) {
    throw new Error('stft: input signal must not be empty')
  }

  // Set defaults
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

  // NaN/Infinity in the signal would otherwise flow through every
  // overlapping frame — throw once, up front, with the offending index.
  assertFiniteSignal(y, 'stft')

  const L = y.length
  const pad = center ? Math.floor(n_fft / 2) : 0
  const paddedLength = L + 2 * pad
  const num_frames = Math.floor((paddedLength - n_fft) / hop_length) + 1
  const n_freq = Math.floor(n_fft / 2) + 1

  const onFrame = setup(n_freq, num_frames)

  // Radix-2 requirement: frames whose n_fft is not a power of 2 are
  // zero-padded up (same contract as fft()); only bins [0, n_freq) are read.
  const P = nextPow2(n_fft)
  const re = new Float64Array(P)
  const im = new Float64Array(P)
  const tw = getTwiddles(P)

  for (let t = 0; t < num_frames; t++) {
    const start = t * hop_length

    for (let i = 0; i < n_fft; i++) {
      const p = start + i
      let v
      if (!center) {
        v = y[p]
      } else {
        const s = p - pad
        if (s >= 0 && s < L) {
          v = Math.fround(y[s])
        } else if (s < 0) {
          // Left pad (same index mapping as pad_signal)
          if (pad_mode === 'reflect') {
            v = Math.fround(y[Math.min(-s, L - 1)])
          } else if (pad_mode === 'edge') {
            v = Math.fround(y[0])
          } else {
            v = 0 // 'constant'
          }
        } else {
          // Right pad (same index mapping as pad_signal)
          const j = s - L
          if (pad_mode === 'reflect') {
            v = Math.fround(y[Math.max(0, L - 2 - j)])
          } else if (pad_mode === 'edge') {
            v = Math.fround(y[L - 1])
          } else {
            v = 0 // 'constant'
          }
        }
      }
      re[i] = Math.fround(v * win[i])
      im[i] = 0
    }
    for (let i = n_fft; i < P; i++) {
      re[i] = 0
      im[i] = 0
    }

    fftCore(re, im, P, tw.cos, tw.sin)
    onFrame(t, re, im)
  }
}

/**
 * Short-Time Fourier Transform
 * @param {Float32Array} y - Audio signal
 * @param {number} n_fft - Length of the FFT window
 * @param {number} hop_length - Hop length (default: n_fft/4)
 * @param {number} win_length - Window length (default: n_fft)
 * @param {string} window - Window type
 * @param {boolean} center - Whether to center the signal
 * @param {string} pad_mode - Padding mode ('reflect', 'constant', 'edge')
 * @returns {Array} STFT matrix [freq, time]
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
  let stft_matrix
  runStftFrames(
    y,
    n_fft,
    hop_length,
    win_length,
    window,
    center,
    pad_mode,
    (n_freq, num_frames) => {
      // Initialize output matrix as [freq][time]
      stft_matrix = Array(n_freq)
      for (let f = 0; f < n_freq; f++) {
        stft_matrix[f] = new Array(num_frames)
      }
      return (t, re, im) => {
        // Box positive frequencies into {real, imag} at the public boundary
        for (let f = 0; f < n_freq; f++) {
          stft_matrix[f][t] = { real: re[f], imag: im[f] }
        }
      }
    },
  )
  return stft_matrix
}

/**
 * Power spectrogram computed frame-by-frame on flat arrays — the memory-lean
 * path for feature extractors (melspectrogram, onset strength, beat tracking)
 * that only need |STFT|^power. Unlike stft(), no per-bin {real, imag} objects
 * are ever created: a 10-minute 44.1 kHz track yields ~53M bins, and boxing
 * them costs ~4 GB of heap that feature pipelines never look at.
 *
 * Same framing, windowing, padding, and numerics as stft().
 *
 * @param {Float32Array} y - Audio signal
 * @param {number} n_fft - Length of the FFT window
 * @param {number} hop_length - Hop length (default: n_fft/4)
 * @param {number} win_length - Window length (default: n_fft)
 * @param {string} window - Window type
 * @param {boolean} center - Whether to center the signal
 * @param {string} pad_mode - Padding mode ('reflect', 'constant', 'edge')
 * @param {number} power - Exponent applied to the magnitude (2.0 = power)
 * @returns {Array<Float32Array>} Power spectrogram [freq][time]
 */
export function stft_power(
  y,
  n_fft = 2048,
  hop_length = null,
  win_length = null,
  window = 'hann',
  center = true,
  pad_mode = 'constant',
  power = 2.0,
) {
  let power_spec
  runStftFrames(
    y,
    n_fft,
    hop_length,
    win_length,
    window,
    center,
    pad_mode,
    (n_freq, num_frames) => {
      power_spec = Array(n_freq)
      for (let f = 0; f < n_freq; f++) {
        power_spec[f] = new Float32Array(num_frames)
      }
      return (t, re, im) => {
        for (let f = 0; f < n_freq; f++) {
          const mag = Math.sqrt(re[f] * re[f] + im[f] * im[f])
          power_spec[f][t] = Math.pow(mag, power)
        }
      }
    },
  )
  return power_spec
}

/**
 * Inverse Short-Time Fourier Transform
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
  // D is [freq][time] format
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

/** Window types get_window can build. */
const SUPPORTED_WINDOWS = ['hann', 'hamming', 'blackman', 'rectangular', 'boxcar']

/**
 * Get window function
 * @param {string} window_type - Window type (one of SUPPORTED_WINDOWS)
 * @param {number} n_fft - Length of the FFT window
 * @returns {Float32Array} Window function
 * @throws {Error} if window_type is not supported (no silent fallback to hann)
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
      throw new Error(
        `get_window: unsupported window type ${JSON.stringify(window_type)}. ` +
          `Supported windows: ${SUPPORTED_WINDOWS.map((w) => `'${w}'`).join(', ')}.`,
      )
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
 * Pad signal with various modes
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
    // Zero padding (default)
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
function _pad_reflect(array, pad_width) {
  return pad_signal(array, pad_width, 'reflect')
}

/**
 * FFT frequencies
 * @param {number} sr - Sample rate
 * @param {number} n_fft - Length of the FFT window
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
 * @param {number} n_fft - Length of the FFT window
 * @param {number} hop_length - Hop length
 * @returns {Array} Magnitude spectrogram
 */
export function spectrogram(y, n_fft = 2048, hop_length = 512) {
  const stft_matrix = stft(y, n_fft, hop_length)
  return stft_matrix.map((frame) => magnitude(frame))
}
