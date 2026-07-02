/**
 * xa-chroma.js — LEGACY SHIM over the fixture-verified feature/ namespace
 * (Wave 4 consolidation).
 *
 * chroma_stft now delegates to feature/chroma.js: librosa's Gaussian
 * filters.chroma matrix over a power spectrogram with per-frame inf-norm
 * (gated by tools/parity/fixtures/chroma.json). The old nearest-semitone
 * hard binning survives only as the explicitly-named fast variant
 * stft_to_chroma.
 *
 * HONESTY NOTE — "CQT": the old constant_q_transform was never a constant-Q
 * transform (nearest-FFT-bin sampling of one big FFT per hop). It lives on
 * in feature/chroma.js under its honest name logFrequencySpectrum; the old
 * export names delegate there.
 *
 * New code should import from src/feature/ directly.
 */

import {
  chroma_stft as featureChromaStft,
  logFrequencySpectrum,
  foldLogSpectrumToChroma,
} from '../feature/chroma.js'

/**
 * Chroma features from a log-frequency spectrum (formerly "CQT chroma").
 * Delegates to logFrequencySpectrum + foldLogSpectrumToChroma.
 * @param {Float32Array} y - Audio time series
 * @param {number} sr - Sample rate
 * @param {number} hop_length - Hop between frames
 * @param {number|null} fmin - Minimum frequency (C1 = 32.7 Hz if null)
 * @param {number} n_chroma - Number of chroma bins
 * @param {number} tuning - Tuning deviation in cents
 * @param {number} n_octaves - Number of octaves to analyze
 * @param {number} bins_per_octave - Must equal n_chroma (fold constraint)
 * @returns {Array<Float32Array>} [n_chroma][n_frames]
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
  const logSpec = logFrequencySpectrum(
    y,
    sr,
    hop_length,
    fmin,
    n_octaves * bins_per_octave,
    tuning,
    bins_per_octave,
  )
  return foldLogSpectrumToChroma(logSpec, n_chroma, bins_per_octave)
}

/**
 * Chromagram from STFT — now librosa-parity via feature/chroma.js
 * (Gaussian filterbank matmul + per-frame inf-norm; the old version used
 * hard nearest-semitone binning and no frame centering).
 * @param {Float32Array} y - Audio time series
 * @param {number} sr - Sample rate
 * @param {number} hop_length - Hop length
 * @param {number} n_fft - FFT window size
 * @param {number} n_chroma - Number of chroma bins
 * @param {number|null} tuning - Tuning in fractional chroma bins
 *   (0.0 default preserves this shim's historical signature; pass null to
 *   estimate from the signal like librosa)
 * @returns {Array<Float64Array>} [n_chroma][n_frames]
 */
export function chroma_stft(
  y,
  sr = 22050,
  hop_length = 512,
  n_fft = 2048,
  n_chroma = 12,
  tuning = 0.0,
) {
  return featureChromaStft(y, { sr, hop_length, n_fft, n_chroma, tuning })
}

/**
 * DEPRECATED NAME — this is NOT a constant-Q transform. Delegates to
 * feature/chroma.js logFrequencySpectrum (nearest-FFT-bin sampling at
 * log-spaced frequencies).
 * @returns {Array<Float32Array>} time-major [n_frames][n_bins]
 */
export function constant_q_transform(
  y,
  sr,
  hop_length,
  fmin = null,
  n_bins = 84,
  tuning = 0.0,
) {
  return logFrequencySpectrum(y, sr, hop_length, fmin, n_bins, tuning, 12)
}

/**
 * Map an interleaved FFT spectrum ([re0, im0, re1, im1, ...]) to
 * log-frequency bins by nearest-bin sampling (legacy helper for the
 * xa-onset.fft output format).
 * @param {Float32Array} spectrum - Interleaved complex FFT output
 * @param {number} sr - Sample rate
 * @param {number} fmin - Minimum frequency
 * @param {number} n_bins - Number of log-frequency bins
 * @param {number} n_fft - FFT size
 * @returns {Float32Array} log-frequency magnitude bins
 */
export function mapToCQTBins(spectrum, sr, fmin, n_bins, n_fft) {
  const cqt_bins = new Float32Array(n_bins)
  const freq_resolution = sr / n_fft

  for (let k = 0; k < n_bins; k++) {
    const f_k = fmin * Math.pow(2, k / 12)
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
 * Fold a time-major log-frequency spectrum into chroma classes.
 * Delegates to feature/chroma.js foldLogSpectrumToChroma, which (unlike the
 * old silent version) throws when bins_per_octave !== n_chroma.
 * @returns {Array<Float32Array>} [n_chroma][n_frames]
 */
export function cqt_to_chroma(cqt, n_chroma = 12, bins_per_octave = 12) {
  return foldLogSpectrumToChroma(cqt, n_chroma, bins_per_octave)
}

/**
 * FAST VARIANT (not librosa parity): fold magnitude spectra into chroma by
 * hard nearest-semitone binning with sqrt-energy-share normalization.
 * Kept as an explicitly-named approximation; feature/chroma.js chroma_stft
 * is the parity path.
 * @param {Array} magnitude_spectra - time-major magnitude spectra
 * @param {number} sr - Sample rate
 * @param {number} n_fft - FFT size
 * @param {number} n_chroma - Number of chroma bins
 * @param {number} tuning - Tuning deviation in cents
 * @returns {Array<Float32Array>} [n_chroma][n_frames]
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
 * Compute chroma vector from a single spectrum (fast variant, not parity)
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

/**
 * Compute a Variable-Q chromagram
 * @param {Float32Array|null} y - Audio time series
 * @param {number} sr - Sample rate
 * @param {Array|null} V - Pre-computed VQT spectrogram
 * @param {number} hop_length - Hop length
 * @param {number|null} fmin - Minimum frequency (default: C1)
 * @param {string|Array} intervals - Interval specification (default: 'equal')
 * @param {number|null} norm - Normalization (default: np.inf)
 * @param {number} threshold - Threshold for chroma calculation
 * @param {number} n_octaves - Number of octaves
 * @param {number} bins_per_octave - Bins per octave
 * @param {number} gamma - Bandwidth offset for VQT (0 for CQT)
 * @returns {Array} Chroma features [12 x n_frames]
 */
export async function chroma_vqt(
  y = null,
  sr = 22050,
  V = null,
  hop_length = 512,
  fmin = null,
  intervals = 'equal',
  norm = Infinity,
  threshold = 0.0,
  n_octaves = 7,
  bins_per_octave = 12,
  gamma = 0
) {
  // Import vqt dynamically to avoid circular dependencies
  const { vqt } = await import('./xa-constantq.js')

  if (fmin === null) {
    fmin = 32.7 // C1
  }

  let vqt_spec = V

  // Compute VQT if not provided
  if (vqt_spec === null) {
    if (y === null) {
      throw new Error('Either y or V must be provided')
    }

    vqt_spec = vqt(
      y,
      sr,
      hop_length,
      fmin,
      bins_per_octave * n_octaves,
      intervals,
      gamma,
      bins_per_octave,
      0.0, // tuning
      1.0, // filter_scale
      1.0, // norm
      0.01, // sparsity
      'hann', // window
      true, // scale
      'constant', // pad_mode
      'soxr_hq', // res_type
      null // dtype
    )
  }

  // Convert VQT to magnitude
  const n_bins = vqt_spec.length
  const n_frames = vqt_spec[0] ? vqt_spec[0].length : 0

  const vqt_mag = Array(n_bins)
    .fill(null)
    .map(() => new Float32Array(n_frames))

  for (let i = 0; i < n_bins; i++) {
    for (let j = 0; j < n_frames; j++) {
      const bin = vqt_spec[i][j]
      vqt_mag[i][j] = Math.sqrt(bin.real * bin.real + bin.imag * bin.imag)
    }
  }

  // Group by chroma bins (12 semitones)
  const n_chroma = 12
  const chroma = Array(n_chroma)
    .fill(null)
    .map(() => new Float32Array(n_frames))

  for (let b = 0; b < n_bins; b++) {
    const chroma_idx = b % n_chroma

    for (let t = 0; t < n_frames; t++) {
      chroma[chroma_idx][t] += vqt_mag[b][t]
    }
  }

  // Apply threshold
  if (threshold > 0) {
    for (let c = 0; c < n_chroma; c++) {
      for (let t = 0; t < n_frames; t++) {
        if (chroma[c][t] < threshold) {
          chroma[c][t] = 0
        }
      }
    }
  }

  // Normalize
  if (norm !== null) {
    for (let t = 0; t < n_frames; t++) {
      if (norm === Infinity) {
        // L-inf norm (max norm)
        let max_val = 0
        for (let c = 0; c < n_chroma; c++) {
          max_val = Math.max(max_val, Math.abs(chroma[c][t]))
        }
        if (max_val > 0) {
          for (let c = 0; c < n_chroma; c++) {
            chroma[c][t] /= max_val
          }
        }
      } else if (typeof norm === 'number') {
        // L-p norm
        let sum = 0
        for (let c = 0; c < n_chroma; c++) {
          sum += Math.pow(Math.abs(chroma[c][t]), norm)
        }
        const norm_factor = Math.pow(sum, 1 / norm)
        if (norm_factor > 0) {
          for (let c = 0; c < n_chroma; c++) {
            chroma[c][t] /= norm_factor
          }
        }
      }
    }
  }

  return chroma
}
