/**
 * Librosa-style onset detection - JavaScript port
 * High-performance implementation for real-time audio analysis
 */

import { fft as fftTransform, hann_window } from './xa-fft.js'

/**
 * FFT wrapper to convert from xa-fft complex object format to flat array format
 * @param {Float32Array} signal - Input signal
 * @returns {Float32Array} FFT result as flat array [real, imag, real, imag, ...]
 */
function fft(signal) {
  const complexResult = fftTransform(signal)
  const flatResult = new Float32Array(complexResult.length * 2)

  for (let i = 0; i < complexResult.length; i++) {
    flatResult[i * 2] = complexResult[i].real
    flatResult[i * 2 + 1] = complexResult[i].imag
  }

  return flatResult
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
  const window = hann_window(frameLength)

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

/**
 * Backtrack detected onset events to the nearest preceding local minimum of energy
 * @param {Array|Float32Array} events - Frame indices of detected onsets
 * @param {Array|Float32Array} energy - Energy envelope (e.g., RMS, onset strength)
 * @returns {Float32Array} Backtracked onset event frames
 */
export function onset_backtrack(events, energy) {
  const backtracked = new Float32Array(events.length)

  for (let i = 0; i < events.length; i++) {
    const event_frame = Math.floor(events[i])

    // Search backwards for local minimum
    let min_frame = event_frame
    let min_energy = energy[event_frame] || 0

    for (let j = event_frame - 1; j >= 0 && j >= event_frame - 3; j--) {
      if (energy[j] < min_energy) {
        min_energy = energy[j]
        min_frame = j
      } else {
        // Stop at first increase
        break
      }
    }

    backtracked[i] = min_frame
  }

  return backtracked
}

/**
 * Compute a spectral flux onset strength envelope across multiple channels
 * Useful for multi-channel or source-separated audio
 * @param {Float32Array|null} y - Audio time series
 * @param {number} sr - Sample rate
 * @param {Array|null} S - Pre-computed spectrogram [channels x freq x time]
 * @param {number} n_fft - FFT size
 * @param {number} hop_length - Hop length
 * @param {number} lag - Lag for onset detection
 * @param {number} max_size - Max filter size
 * @param {Array|null} ref - Reference power
 * @param {boolean} detrend - Remove DC component
 * @param {boolean} center - Center frames
 * @param {Function|null} feature - Feature extraction function
 * @param {Function|null} aggregate - Aggregation function across channels
 * @param {Array|null} channels - List of channel slices
 * @param {Object} kwargs - Additional arguments
 * @returns {Array} Multi-channel onset strength [channels x time]
 */
export function onset_strength_multi(
  y = null,
  sr = 22050,
  S = null,
  n_fft = 2048,
  hop_length = 512,
  lag = 1,
  max_size = 1,
  ref = null,
  detrend = false,
  center = true,
  feature = null,
  aggregate = null,
  channels = null,
  kwargs = {}
) {
  // For now, compute onset strength for each channel separately
  // This is a simplified version - full implementation would handle source separation

  if (S === null && y === null) {
    throw new Error('Either y or S must be provided')
  }

  // If S provided, assume it's [channels x freq x time]
  if (S !== null) {
    const n_channels = S.length
    const results = []

    for (let c = 0; c < n_channels; c++) {
      const channel_strength = onset_strength(
        {S: S[c]},
        {
          sr,
          lag,
          max_size,
          detrend,
          center,
          ...kwargs
        }
      )
      results.push(channel_strength)
    }

    return results
  }

  // If only y provided, compute single-channel onset strength
  const single_channel = onset_strength(y, {
    sr,
    n_fft,
    hop_length,
    lag,
    max_size,
    detrend,
    center,
    ...kwargs
  })

  return [single_channel]
}
