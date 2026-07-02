/**
 * Chroma feature extraction for JavaScript
 * Pitch class profiles for harmonic analysis and key detection
 */

import { fft } from './xa-onset.js'

/**
 * Compute chroma features using Constant-Q Transform
 * @param {Float32Array} y - Audio time series
 * @param {number} sr - Sample rate
 * @param {number} hop_length - Number of audio samples between successive frames
 * @param {number|null} fmin - Minimum frequency (C1 = 32.7 Hz if null)
 * @param {number} n_chroma - Number of chroma bins (12 for standard chromatic scale)
 * @param {number} tuning - Tuning deviation in cents
 * @param {number} n_octaves - Number of octaves to analyze
 * @param {number} bins_per_octave - Number of bins per octave (12 for semitones)
 * @returns {Array} Chroma feature matrix (n_chroma x n_frames)
 */
export function chroma_cqt(
  y,
  sr = 22050,
  hop_length = 512,
  fmin = null,
  n_chroma = 12,
  tuning = 0.0,
  n_octaves = 7,
  bins_per_octave = 12,
) {
  // Compute CQT
  const cqt = constant_q_transform(
    y,
    sr,
    hop_length,
    fmin,
    n_octaves * bins_per_octave,
    tuning,
  )

  // Convert to chroma
  const chroma = cqt_to_chroma(cqt, n_chroma, bins_per_octave)

  return chroma
}

/**
 * Compute chroma features using Short-Time Fourier Transform
 * @param {Float32Array} y - Audio time series
 * @param {number} sr - Sample rate
 * @param {number} hop_length - Hop length
 * @param {number} n_fft - FFT window size
 * @param {number} n_chroma - Number of chroma bins
 * @param {number} tuning - Tuning deviation in cents
 * @returns {Array} Chroma feature matrix
 */
export function chroma_stft(
  y,
  sr = 22050,
  hop_length = 512,
  n_fft = 2048,
  n_chroma = 12,
  tuning = 0.0,
) {
  // Compute STFT
  const stft_result = computeSTFT(y, n_fft, hop_length)

  // Convert to magnitude spectrum
  const magnitude_spectra = stft_result.map((frame) => {
    const magnitudes = new Float32Array(frame.length / 2)
    for (let i = 0; i < magnitudes.length; i++) {
      const real = frame[i * 2]
      const imag = frame[i * 2 + 1]
      magnitudes[i] = Math.sqrt(real * real + imag * imag)
    }
    return magnitudes
  })

  // Convert to chroma
  return stft_to_chroma(magnitude_spectra, sr, n_fft, n_chroma, tuning)
}

/**
 * Constant-Q Transform implementation
 * @param {Float32Array} y - Audio time series
 * @param {number} sr - Sample rate
 * @param {number} hop_length - Hop length
 * @param {number|null} fmin - Minimum frequency
 * @param {number} n_bins - Number of CQT bins
 * @param {number} tuning - Tuning deviation
 * @returns {Array} CQT matrix
 */
export function constant_q_transform(
  y,
  sr,
  hop_length,
  fmin = null,
  n_bins = 84,
  tuning = 0.0,
) {
  if (fmin === null) {
    fmin = 32.7 // C1
  }

  // Apply tuning
  fmin *= Math.pow(2, tuning / 1200)

  const n_fft = Math.pow(2, Math.ceil(Math.log2((4 * sr) / fmin)))
  const frames = []

  // Frame the signal
  for (let i = 0; i <= y.length - n_fft; i += hop_length) {
    const frame = y.slice(i, i + n_fft)
    frames.push(frame)
  }

  // Compute CQT for each frame
  const cqt = frames.map((frame) => {
    const spectrum = fft(frame)
    return mapToCQTBins(spectrum, sr, fmin, n_bins, n_fft)
  })

  return cqt
}

/**
 * Map FFT spectrum to Constant-Q bins
 * @param {Array} spectrum - FFT spectrum (complex values)
 * @param {number} sr - Sample rate
 * @param {number} fmin - Minimum frequency
 * @param {number} n_bins - Number of CQT bins
 * @param {number} n_fft - FFT size
 * @returns {Float32Array} CQT bins
 */
export function mapToCQTBins(spectrum, sr, fmin, n_bins, n_fft) {
  const cqt_bins = new Float32Array(n_bins)
  const freq_resolution = sr / n_fft

  for (let k = 0; k < n_bins; k++) {
    // Frequency for this CQT bin (logarithmic spacing)
    const f_k = fmin * Math.pow(2, k / 12)

    // Map to FFT bin
    const bin_idx = Math.round(f_k / freq_resolution)

    if (bin_idx < spectrum.length / 2) {
      const real = spectrum[bin_idx * 2] || 0
      const imag = spectrum[bin_idx * 2 + 1] || 0
      cqt_bins[k] = Math.sqrt(real * real + imag * imag)
    }
  }

  return cqt_bins
}

/**
 * Convert CQT to chroma features
 * @param {Array} cqt - CQT matrix (frames x bins)
 * @param {number} n_chroma - Number of chroma bins
 * @param {number} bins_per_octave - Bins per octave in CQT
 * @returns {Array} Chroma matrix (n_chroma x n_frames)
 */
export function cqt_to_chroma(cqt, n_chroma = 12, _bins_per_octave = 12) {
  const n_frames = cqt.length
  const chroma = Array(n_chroma)
    .fill(null)
    .map(() => new Float32Array(n_frames))

  for (let t = 0; t < n_frames; t++) {
    // Sum across octaves for each chroma class
    for (let bin = 0; bin < cqt[t].length; bin++) {
      const chroma_bin = bin % n_chroma
      chroma[chroma_bin][t] += Math.pow(cqt[t][bin], 2)
    }

    // Normalize each frame
    let sum = 0
    for (let c = 0; c < n_chroma; c++) {
      sum += chroma[c][t]
    }
    if (sum > 0) {
      for (let c = 0; c < n_chroma; c++) {
        chroma[c][t] = Math.sqrt(chroma[c][t]) / Math.sqrt(sum)
      }
    }
  }

  return chroma
}

/**
 * Convert STFT magnitude spectra to chroma
 * @param {Array} magnitude_spectra - Array of magnitude spectra
 * @param {number} sr - Sample rate
 * @param {number} n_fft - FFT size
 * @param {number} n_chroma - Number of chroma bins
 * @param {number} tuning - Tuning deviation
 * @returns {Array} Chroma matrix
 */
export function stft_to_chroma(
  magnitude_spectra,
  sr,
  n_fft,
  n_chroma = 12,
  tuning = 0.0,
) {
  const n_frames = magnitude_spectra.length
  const chroma = Array(n_chroma)
    .fill(null)
    .map(() => new Float32Array(n_frames))

  // Create frequency-to-chroma mapping
  const freqs = new Float32Array(n_fft / 2)
  for (let i = 0; i < freqs.length; i++) {
    freqs[i] = (i * sr) / n_fft
  }

  // Apply tuning correction
  const tuning_factor = Math.pow(2, tuning / 1200)

  for (let t = 0; t < n_frames; t++) {
    for (let f = 0; f < magnitude_spectra[t].length; f++) {
      if (freqs[f] < 80) continue // Skip very low frequencies

      // Convert frequency to chroma class
      const corrected_freq = freqs[f] * tuning_factor
      const chroma_class = freq_to_chroma(corrected_freq)

      if (chroma_class >= 0 && chroma_class < n_chroma) {
        chroma[chroma_class][t] +=
          magnitude_spectra[t][f] * magnitude_spectra[t][f]
      }
    }

    // Normalize
    let sum = 0
    for (let c = 0; c < n_chroma; c++) {
      sum += chroma[c][t]
    }
    if (sum > 0) {
      for (let c = 0; c < n_chroma; c++) {
        chroma[c][t] = Math.sqrt(chroma[c][t]) / Math.sqrt(sum)
      }
    }
  }

  return chroma
}

/**
 * Convert frequency to chroma class (0-11)
 * @param {number} freq - Frequency in Hz
 * @returns {number} Chroma class (0=C, 1=C#, 2=D, etc.)
 */
export function freq_to_chroma(freq) {
  if (freq <= 0) return -1

  // Reference: A4 = 440 Hz is chroma class 9
  const A4 = 440.0
  const semitones_from_A4 = 12 * Math.log2(freq / A4)

  // Convert to chroma class (C=0)
  let chroma_class = Math.round(semitones_from_A4) + 9 // A=9, so A4 maps to 9

  // Wrap to 0-11 range
  return ((chroma_class % 12) + 12) % 12
}

/**
 * Compute chroma vector from a single spectrum
 * @param {Float32Array} spectrum - Magnitude spectrum
 * @param {number} sr - Sample rate
 * @param {number} tuning - Tuning deviation
 * @returns {Float32Array} Chroma vector (12 elements)
 */
export function spectrum_to_chroma(spectrum, sr, tuning = 0.0) {
  const chroma = new Float32Array(12)
  const n_fft = spectrum.length * 2
  const tuning_factor = Math.pow(2, tuning / 1200)

  for (let i = 0; i < spectrum.length; i++) {
    const freq = (i * sr) / n_fft
    if (freq < 80) continue

    const corrected_freq = freq * tuning_factor
    const chroma_class = freq_to_chroma(corrected_freq)

    if (chroma_class >= 0 && chroma_class < 12) {
      chroma[chroma_class] += spectrum[i] * spectrum[i]
    }
  }

  // Normalize
  const sum = chroma.reduce((a, b) => a + b, 0)
  if (sum > 0) {
    for (let i = 0; i < 12; i++) {
      chroma[i] = Math.sqrt(chroma[i]) / Math.sqrt(sum)
    }
  }

  return chroma
}

/**
 * Enhance chroma features for better key detection
 * @param {Array} chroma - Input chroma matrix
 * @param {number} norm - Normalization order (1, 2, or Infinity)
 * @returns {Array} Enhanced chroma matrix
 */
export function enhance_chroma(chroma, norm = 2) {
  const n_chroma = chroma.length
  const n_frames = chroma[0].length
  const enhanced = Array(n_chroma)
    .fill(null)
    .map(() => new Float32Array(n_frames))

  for (let t = 0; t < n_frames; t++) {
    // Extract frame
    const frame = chroma.map((row) => row[t])

    // Apply log compression
    const log_frame = frame.map((val) => Math.log(1 + 1000 * val))

    // Normalize
    let normalizer = 0
    if (norm === 1) {
      normalizer = log_frame.reduce((a, b) => a + Math.abs(b), 0)
    } else if (norm === 2) {
      normalizer = Math.sqrt(log_frame.reduce((a, b) => a + b * b, 0))
    } else if (norm === Infinity) {
      normalizer = Math.max(...log_frame.map(Math.abs))
    }

    // Copy normalized frame
    for (let c = 0; c < n_chroma; c++) {
      enhanced[c][t] = normalizer > 0 ? log_frame[c] / normalizer : 0
    }
  }

  return enhanced
}

/**
 * Compute chroma energy (sum of all chroma values per frame)
 * @param {Array} chroma - Chroma matrix
 * @returns {Float32Array} Energy per frame
 */
export function chroma_energy(chroma) {
  const n_frames = chroma[0].length
  const energy = new Float32Array(n_frames)

  for (let t = 0; t < n_frames; t++) {
    for (let c = 0; c < chroma.length; c++) {
      energy[t] += chroma[c][t]
    }
  }

  return energy
}

/**
 * Simple STFT computation for chroma (reused from other modules)
 * @param {Float32Array} y - Audio signal
 * @param {number} n_fft - FFT size
 * @param {number} hop_length - Hop length
 * @returns {Array} STFT frames
 */
function computeSTFT(y, n_fft = 2048, hop_length = 512) {
  const numFrames = Math.floor((y.length - n_fft) / hop_length) + 1
  const stft = []

  // Pre-compute Hann window
  const window = new Float32Array(n_fft)
  for (let i = 0; i < n_fft; i++) {
    window[i] = 0.5 * (1 - Math.cos((2 * Math.PI * i) / (n_fft - 1)))
  }

  for (let i = 0; i < numFrames; i++) {
    const start = i * hop_length
    const frame = new Float32Array(n_fft)

    // Apply windowing
    for (let j = 0; j < n_fft && start + j < y.length; j++) {
      frame[j] = y[start + j] * window[j]
    }

    // Compute FFT
    const fftResult = fft(frame)
    stft.push(fftResult)
  }

  return stft
}

// Note names for reference
export const NOTE_NAMES = [
  'C',
  'C#',
  'D',
  'D#',
  'E',
  'F',
  'F#',
  'G',
  'G#',
  'A',
  'A#',
  'B',
]

/**
 * Convert chroma index to note name
 * @param {number} chroma_idx - Chroma index (0-11)
 * @returns {string} Note name
 */
export function chroma_to_note(chroma_idx) {
  return NOTE_NAMES[chroma_idx % 12]
}
