/**
 * Librosa-style onset detection - JavaScript port
 * High-performance implementation for real-time audio analysis
 */

import { fft as fftTransform, hann_window } from './xa-fft.js'
import { melspectrogram } from './xa-mel.js'
import { power_to_db } from './xa-convert.js'

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
 * Sliding maximum filter along the frequency axis (rows of S).
 * Mirrors scipy.ndimage.maximum_filter1d(S, size, axis=-2, mode='reflect').
 * @param {Array<Float32Array|Array>} S - Spectrogram [freq][time]
 * @param {number} size - Filter size in frequency bins
 * @returns {Array<Float32Array>} Max-filtered spectrogram [freq][time]
 */
function maximumFilterFreq(S, size) {
  const nFreq = S.length
  const nFrames = S[0] ? S[0].length : 0
  const half = Math.floor(size / 2)
  // scipy 'reflect' boundary: (d c b a | a b c d | d c b a)
  const reflect = (i) => {
    const period = 2 * nFreq
    let k = ((i % period) + period) % period
    return k < nFreq ? k : period - 1 - k
  }
  const out = Array(nFreq)
    .fill(null)
    .map(() => new Float32Array(nFrames))
  for (let f = 0; f < nFreq; f++) {
    for (let t = 0; t < nFrames; t++) {
      let m = -Infinity
      for (let w = f - half; w < f - half + size; w++) {
        const v = S[reflect(w)][t]
        if (v > m) m = v
      }
      out[f][t] = m
    }
  }
  return out
}

/**
 * Port of librosa.onset.onset_strength() (librosa 0.11.0 semantics).
 *
 * S = power_to_db(melspectrogram(y, sr, n_fft, hop_length, fmax=sr/2))
 * onset_env[t] = mean_f max(0, S[f, t] - ref[f, t - lag])
 * padded left by lag + n_fft // (2 * hop_length) frames (center=true),
 * then trimmed to the frame count of S.
 *
 * Accepts either librosa-style positional args `(y, sr, hop_length)` or an
 * options object `(y, { sr, hop_length, ... })`.
 *
 * @param {Float32Array|Array} y - 1-D audio signal (or null if opts.S given)
 * @param {Object|number} [opts] - Options object, or sr as a number
 *   @param {number} [opts.sr=22050]         sample rate (Hz)
 *   @param {Array}  [opts.S=null]           pre-computed LOG-POWER spectrogram [freq][time]
 *   @param {number} [opts.n_fft=2048]       FFT size for the mel spectrogram
 *   @param {number} [opts.hop_length=512]   hop length
 *   @param {number} [opts.lag=1]            time lag for the difference
 *   @param {number} [opts.max_size=1]       frequency-local max filter size (1 = off)
 *   @param {Array}  [opts.ref=null]         pre-computed reference spectrum
 *   @param {boolean} [opts.detrend=false]   remove DC via lfilter([1,-1],[1,-0.99])
 *   @param {boolean} [opts.center=true]     compensate for centered STFT frames
 *   @param {number} [opts.n_mels=128]       mel bands for the default feature
 *   @param {number} [opts.fmin=0]           lowest mel frequency
 *   @param {number} [opts.fmax=sr/2]        highest mel frequency (librosa default)
 *   @param {boolean} [opts.htk=false]       HTK mel scale
 * @param {number} [maybeHop] - hop_length when called positionally (y, sr, hop)
 * @returns {Float32Array} onset strength envelope
 */
export function onset_strength(y, opts = {}, maybeHop) {
  // Support the legacy/librosa positional call style: onset_strength(y, sr, hop_length)
  if (typeof opts === 'number') {
    opts = { sr: opts }
    if (typeof maybeHop === 'number') opts.hop_length = maybeHop
  }

  const {
    sr = 22050,
    S: S_in = null,
    n_fft = 2048,
    hop_length = 512,
    frame_length, // legacy alias for n_fft
    lag = 1,
    max_size = 1,
    ref = null,
    detrend = false,
    center = true,
    n_mels = 128,
    fmin = 0,
    fmax = 0.5 * sr, // librosa: kwargs.setdefault('fmax', 0.5 * sr)
    htk = false,
  } = opts

  const fft_size = typeof frame_length === 'number' ? frame_length : n_fft

  if (!Number.isInteger(lag) || lag < 1) {
    throw new Error(`lag=${lag} must be a positive integer`)
  }
  if (!Number.isInteger(max_size) || max_size < 1) {
    throw new Error(`max_size=${max_size} must be a positive integer`)
  }

  let S = S_in
  if (S === null) {
    if (y === null || y === undefined) {
      throw new Error('Either y or opts.S must be provided')
    }
    // Log-power mel spectrogram (librosa default feature)
    const melspec = melspectrogram(
      y,
      sr,
      null, // S
      fft_size,
      hop_length,
      null, // win_length
      'hann',
      center,
      'constant',
      2.0, // power
      n_mels,
      fmin,
      fmax,
      'slaney',
      htk,
    )
    S = power_to_db(melspec) // ref=1.0, amin=1e-10, top_db=80 (librosa defaults)
  }

  const nFreq = S.length
  const nFrames = S[0] ? S[0].length : 0

  // Reference spectrum: identity unless max filtering is requested
  let refS = ref
  if (refS === null) {
    refS = max_size === 1 ? S : maximumFilterFreq(S, max_size)
  } else if (refS.length !== nFreq || (refS[0] && refS[0].length !== nFrames)) {
    throw new Error('Reference spectrum shape must match input spectrum')
  }

  // Rectified difference at the given lag, averaged over frequency bins
  const rawLen = Math.max(0, nFrames - lag)
  const raw = new Float64Array(rawLen)
  for (let t = 0; t < rawLen; t++) {
    let sum = 0
    for (let f = 0; f < nFreq; f++) {
      const d = S[f][t + lag] - refS[f][t]
      if (d > 0) sum += d
    }
    raw[t] = sum / nFreq
  }

  // Compensate for lag (and framing effects when center=true)
  let pad_width = lag
  if (center) {
    pad_width += Math.floor(fft_size / (2 * hop_length))
  }

  let env = new Float64Array(pad_width + rawLen)
  env.set(raw, pad_width)

  // Remove the DC component: scipy.signal.lfilter([1, -1], [1, -0.99], env)
  if (detrend) {
    const filtered = new Float64Array(env.length)
    let prevX = 0
    let prevY = 0
    for (let i = 0; i < env.length; i++) {
      filtered[i] = env[i] - prevX + 0.99 * prevY
      prevX = env[i]
      prevY = filtered[i]
    }
    env = filtered
  }

  // Trim to match the input duration
  const outLen = center ? Math.min(env.length, nFrames) : env.length
  return Float32Array.from(env.subarray(0, outLen))
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
      const channel_strength = onset_strength(null, {
        sr,
        S: S[c],
        n_fft,
        hop_length,
        lag,
        max_size,
        ref,
        detrend,
        center,
        ...kwargs,
      })
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
    ref,
    detrend,
    center,
    ...kwargs,
  })

  return [single_channel]
}
