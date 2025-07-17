/**
 * Librosa-style onset detection - JavaScript port
 * High-performance implementation for real-time audio analysis
 */

/**
 * Fast FFT implementation using Cooley-Tukey algorithm
 * Much faster than the O(N²) DFT we were using
 */
export function fft(signal) {
  const N = signal.length
  if (N <= 1) return signal

  // Make sure N is power of 2
  const nextPow2 = Math.pow(2, Math.ceil(Math.log2(N)))
  if (N !== nextPow2) {
    const padded = new Float32Array(nextPow2)
    padded.set(signal)
    return fft(padded)
  }

  // Bit-reversal permutation
  const reversed = new Float32Array(N * 2) // Complex: [real, imag, real, imag, ...]
  for (let i = 0; i < N; i++) {
    const j = reverseBits(i, Math.log2(N))
    reversed[j * 2] = signal[i]
    reversed[j * 2 + 1] = 0
  }

  // Cooley-Tukey FFT
  for (let len = 2; len <= N; len <<= 1) {
    const angle = (-2 * Math.PI) / len
    const wlen = [Math.cos(angle), Math.sin(angle)]

    for (let i = 0; i < N; i += len) {
      const w = [1, 0]
      for (let j = 0; j < len / 2; j++) {
        const u = [reversed[(i + j) * 2], reversed[(i + j) * 2 + 1]]
        const v = [
          reversed[(i + j + len / 2) * 2] * w[0] -
            reversed[(i + j + len / 2) * 2 + 1] * w[1],
          reversed[(i + j + len / 2) * 2] * w[1] +
            reversed[(i + j + len / 2) * 2 + 1] * w[0],
        ]

        reversed[(i + j) * 2] = u[0] + v[0]
        reversed[(i + j) * 2 + 1] = u[1] + v[1]
        reversed[(i + j + len / 2) * 2] = u[0] - v[0]
        reversed[(i + j + len / 2) * 2 + 1] = u[1] - v[1]

        const temp = w[0] * wlen[0] - w[1] * wlen[1]
        w[1] = w[0] * wlen[1] + w[1] * wlen[0]
        w[0] = temp
      }
    }
  }

  return reversed
}

function reverseBits(num, bits) {
  let result = 0
  for (let i = 0; i < bits; i++) {
    result = (result << 1) | (num & 1)
    num >>= 1
  }
  return result
}

/**
 * Port of librosa.onset.onset_detect()
 * Fast spectral flux-based onset detection
 */
export function onsetDetect(
  audioData,
  sampleRate,
  { hopLength = 512, frameLength = 2048, delta = 0.07, wait = 20 } = {},
) {
  console.time('onset_detect')

  // Step 1: Compute STFT (Short-Time Fourier Transform)
  const stft = computeSTFT(audioData, frameLength, hopLength)

  // Step 2: Compute spectral flux (onset strength)
  const onsetStrength = computeSpectralFlux(stft)

  // Step 3: Peak picking to find actual onsets
  const onsetFrames = pickPeaks(onsetStrength, { delta, wait })

  // Convert frames to time
  const onsetTimes = onsetFrames.map(
    (frame) => (frame * hopLength) / sampleRate,
  )

  console.timeEnd('onset_detect')

  return {
    onsetTimes,
    onsetStrength,
    onsetFrames,
  }
}

/**
 * Fast STFT using our optimized FFT
 */
export function computeSTFT(audioData, frameLength = 2048, hopLength = 512) {
  const numFrames = Math.floor((audioData.length - frameLength) / hopLength) + 1
  const stft = []

  // Pre-compute Hann window
  const window = new Float32Array(frameLength)
  for (let i = 0; i < frameLength; i++) {
    window[i] = 0.5 * (1 - Math.cos((2 * Math.PI * i) / (frameLength - 1)))
  }

  for (let i = 0; i < numFrames; i++) {
    const start = i * hopLength
    const frame = new Float32Array(frameLength)

    // Apply windowing
    for (let j = 0; j < frameLength && start + j < audioData.length; j++) {
      frame[j] = audioData[start + j] * window[j]
    }

    // Compute FFT
    const fftResult = fft(frame)
    stft.push(fftResult)
  }

  return stft
}

/**
 * Compute spectral flux for onset detection
 * Much more accurate than simple RMS differences
 */
export function computeSpectralFlux(stft) {
  const onsetStrength = new Float32Array(stft.length)

  for (let i = 1; i < stft.length; i++) {
    let flux = 0
    const currentFrame = stft[i]
    const prevFrame = stft[i - 1]

    // Compare magnitudes between consecutive frames
    for (let j = 0; j < currentFrame.length; j += 2) {
      const currentMag = Math.sqrt(
        currentFrame[j] ** 2 + currentFrame[j + 1] ** 2,
      )
      const prevMag = Math.sqrt(prevFrame[j] ** 2 + prevFrame[j + 1] ** 2)

      // Only positive differences (increases in magnitude)
      flux += Math.max(0, currentMag - prevMag)
    }

    onsetStrength[i] = flux
  }

  return onsetStrength
}

/**
 * Python‑style onset_strength() wrapper.
 * Accepts either a pre‑computed STFT **or** a 1‑D audio signal.
 *
 * @param {Float32Array|Array} y_or_stft  1‑D PCM signal **or** STFT array
 * @param {Object} [opts]
 *   @param {number} [opts.sr=22050]            sample‑rate (Hz) if y is audio
 *   @param {number} [opts.hop_length=512]      hop‑length used for STFT
 *   @param {number} [opts.frame_length=2048]   frame length for STFT
 * @returns {Float32Array}  onset strength envelope
 */

export function onset_strength(y_or_stft, opts = {}) {
  const { hop_length = 512, frame_length = 2048 } = opts

  // Detect whether we were given a 1‑D Float32Array (raw audio)
  const isAudio =
    (typeof Float32Array !== 'undefined' &&
      y_or_stft instanceof Float32Array) ||
    (Array.isArray(y_or_stft) && typeof y_or_stft[0] === 'number')

  const stft = isAudio
    ? computeSTFT(y_or_stft, frame_length, hop_length) // raw audio → STFT
    : y_or_stft // already an STFT

  return computeSpectralFlux(stft)
}

/**
 * Peak picking for onset detection
 * Port of librosa's peak picking algorithm
 */
export function pickPeaks(onsetStrength, { delta = 0.07, wait = 20 } = {}) {
  const peaks = []
  let lastPeak = -wait - 1

  // Adaptive threshold
  const meanStrength =
    onsetStrength.reduce((a, b) => a + b, 0) / onsetStrength.length
  const threshold = meanStrength + delta

  for (let i = 1; i < onsetStrength.length - 1; i++) {
    // Check if it's a local maximum above threshold
    if (
      onsetStrength[i] > threshold &&
      onsetStrength[i] > onsetStrength[i - 1] &&
      onsetStrength[i] > onsetStrength[i + 1] &&
      i - lastPeak > wait
    ) {
      peaks.push(i)
      lastPeak = i
    }
  }

  return peaks
}

/**
 * Convert onset times to beat times
 * Simple version - just use onset spacing
 */
export function onsetsToBeats(onsetTimes) {
  if (onsetTimes.length < 2) return { bpm: 120, beatTimes: [] }

  // Calculate intervals between onsets
  const intervals = []
  for (let i = 1; i < onsetTimes.length; i++) {
    intervals.push(onsetTimes[i] - onsetTimes[i - 1])
  }

  // Find most common interval (mode)
  intervals.sort((a, b) => a - b)
  const medianInterval = intervals[Math.floor(intervals.length / 2)]

  // Convert to BPM
  const bpm = 60 / medianInterval

  // Generate beat times
  const beatTimes = []
  let time = onsetTimes[0]
  while (time < onsetTimes[onsetTimes.length - 1]) {
    beatTimes.push(time)
    time += medianInterval
  }

  return { bpm, beatTimes, interval: medianInterval }
}
