/**
 * feature/chroma.js — chroma_stft, fixture-verified.
 *
 * chroma_stft: power-2 spectrogram → filters.chroma Gaussian filterbank
 * matmul → per-frame inf-norm normalization.
 * When tuning is not given it is estimated from the signal
 * (piptrack parabolic interpolation → pitch_tuning histogram).
 *
 * Also hosts logFrequencySpectrum — the honest rename of the old
 * xa-chroma "constant_q_transform". It is NOT a constant-Q transform:
 * it samples the nearest FFT bin of one large FFT per hop at log-spaced
 * frequencies. Kept as an explicitly-named fast approximation.
 *
 * Parity gate: tests/parity/chroma.parity.test.js vs
 * tools/parity/fixtures/chroma.json.
 */

import { stft, fft, fft_frequencies } from '../scripts/xa-fft.js'
import { chroma as chromaFilterbank } from '../filters/index.js'
import { ParameterError } from './spectral.js'

/** float32 tiny — util.normalize threshold on the f32 pipeline */
const TINY = 1.1754943508222875e-38

/* -------------------------------------------------------------------------- */
/*  Tuning estimation (pitch tracking)                                        */
/* -------------------------------------------------------------------------- */

/**
 * Pitch tracking on thresholded parabolically-interpolated STFT
 * (piptrack), restricted to what estimate_tuning needs:
 * returns the sparse list of detected {pitch, mag} peaks.
 * @param {Object} options - { y, sr, S, n_fft, hop_length, fmin, fmax, threshold }
 * @returns {{pitches: number[], mags: number[]}}
 */
export function piptrackPeaks(options = {}) {
  const {
    y = null,
    sr = 22050,
    S = null,
    n_fft = 2048,
    hop_length = 512,
    fmin = 150.0,
    fmax = 4000.0,
    threshold = 0.1,
  } = options

  let spec = S
  let nfft = n_fft
  if (spec == null) {
    if (y == null) {
      throw new ParameterError('piptrack: either y or S must be provided')
    }
    const D = stft(y, n_fft, hop_length)
    const nF = D.length
    const nT = D[0] ? D[0].length : 0
    spec = new Array(nF)
    for (let f = 0; f < nF; f++) {
      const row = new Float64Array(nT)
      for (let t = 0; t < nT; t++) row[t] = Math.hypot(D[f][t].real, D[f][t].imag)
      spec[f] = row
    }
  } else {
    nfft = 2 * (spec.length - 1)
  }

  const nF = spec.length
  const nT = spec[0] ? spec[0].length : 0
  const loF = Math.max(fmin, 0)
  const hiF = Math.min(fmax, sr / 2)
  const freqs = fft_frequencies(sr, nfft)

  const pitches = []
  const mags = []

  for (let t = 0; t < nT; t++) {
    // Per-frame reference: threshold * max magnitude
    let colMax = 0
    for (let f = 0; f < nF; f++) {
      const v = Math.abs(spec[f][t])
      if (v > colMax) colMax = v
    }
    const refValue = threshold * colMax

    for (let f = 0; f < nF; f++) {
      if (!(freqs[f] >= loF && freqs[f] < hiF)) continue

      // localmax over Z = S * (S > ref): strict left, non-strict right
      const z = (i) => {
        const v = Math.abs(spec[i][t])
        return v > refValue ? v : 0
      }
      let isMax
      if (f === 0) {
        isMax = false
      } else if (f === nF - 1) {
        isMax = z(f) > z(f - 1)
      } else {
        isMax = z(f) > z(f - 1) && z(f) >= z(f + 1)
      }
      if (!isMax) continue

      // np.gradient along frequency
      let avg
      if (f === 0) avg = spec[1][t] - spec[0][t]
      else if (f === nF - 1) avg = spec[nF - 1][t] - spec[nF - 2][t]
      else avg = (spec[f + 1][t] - spec[f - 1][t]) / 2

      // Parabolic interpolation shift (0 at edges or when |b| >= |a|)
      let shift = 0
      if (f > 0 && f < nF - 1) {
        const a = spec[f + 1][t] + spec[f - 1][t] - 2 * spec[f][t]
        const b = (spec[f + 1][t] - spec[f - 1][t]) / 2
        shift = Math.abs(b) >= Math.abs(a) ? 0 : -b / a
      }

      const dskew = 0.5 * avg * shift
      pitches.push(((f + shift) * sr) / nfft)
      mags.push(spec[f][t] + dskew)
    }
  }

  return { pitches, mags }
}

/**
 * Tuning offset of a set of detected frequencies relative to A440,
 * in fractions of a chroma bin.
 * @returns {number} tuning in [-0.5, 0.5)
 */
export function pitch_tuning(frequencies, options = {}) {
  const { resolution = 0.01, bins_per_octave = 12 } = options

  const freqs = []
  for (const f of frequencies) if (f > 0) freqs.push(f)
  if (freqs.length === 0) {
    // Warns and returns 0.0 here for an empty frequency set.
    console.warn('pitch_tuning: trying to estimate tuning from empty frequency set')
    return 0.0
  }

  // Residual of each pitch relative to the chroma grid (A440/16 = 27.5 Hz ref)
  const residuals = new Float64Array(freqs.length)
  for (let i = 0; i < freqs.length; i++) {
    let r = (bins_per_octave * Math.log2(freqs[i] / 27.5)) % 1
    if (r < 0) r += 1
    if (r >= 0.5) r -= 1
    residuals[i] = r
  }

  // Histogram over linspace(-0.5, 0.5, ceil(1/resolution)+1) edges
  const nBins = Math.ceil(1.0 / resolution)
  const edges = new Float64Array(nBins + 1)
  const step = 1.0 / nBins
  for (let i = 0; i < nBins; i++) edges[i] = -0.5 + i * step
  edges[nBins] = 0.5

  const counts = new Uint32Array(nBins)
  for (const r of residuals) {
    // upper_bound(edges, r) - 1  (numpy histogram: left-closed bins)
    let lo = 0
    let hi = edges.length
    while (lo < hi) {
      const mid = (lo + hi) >> 1
      if (edges[mid] <= r) lo = mid + 1
      else hi = mid
    }
    let idx = lo - 1
    if (idx >= nBins) idx = nBins - 1
    if (idx >= 0) counts[idx]++
  }

  let best = 0
  for (let i = 1; i < nBins; i++) if (counts[i] > counts[best]) best = i
  return edges[best]
}

/**
 * Estimate tuning from a signal or spectrogram.
 * @param {Object} options - { y, sr, S, n_fft, resolution, bins_per_octave,
 *   + piptrack options }
 * @returns {number} tuning deviation in fractions of a bin, in [-0.5, 0.5)
 */
export function estimate_tuning(options = {}) {
  const {
    resolution = 0.01,
    bins_per_octave = 12,
    ...piptrackOptions
  } = options

  const { pitches, mags } = piptrackPeaks(piptrackOptions)

  // threshold = median magnitude among detected pitches
  let threshold = 0.0
  if (mags.length > 0) {
    const sorted = Float64Array.from(mags).sort()
    const mid = sorted.length >> 1
    threshold =
      sorted.length % 2 === 1 ? sorted[mid] : (sorted[mid - 1] + sorted[mid]) / 2
  }

  const selected = []
  for (let i = 0; i < pitches.length; i++) {
    if (mags[i] >= threshold && pitches[i] > 0) selected.push(pitches[i])
  }
  return pitch_tuning(selected, { resolution, bins_per_octave })
}

/* -------------------------------------------------------------------------- */
/*  chroma_stft                                                               */
/* -------------------------------------------------------------------------- */

/**
 * Chromagram from a waveform or power spectrogram
 * (Ellis chromagram_E lineage).
 * @param {Float32Array|Array|null} y - time series (or null when S given)
 * @param {Object} options
 * @param {Array|null} options.S - precomputed POWER spectrogram [freq][time]
 * @param {number|null} options.norm - per-frame norm (default Infinity = max)
 * @param {number|null} options.tuning - tuning in fractional chroma bins;
 *   null (default) estimates it from the input
 * @param {number} options.n_chroma - number of chroma bins (default 12)
 * @param {number} options.ctroct / options.octwidth / options.filter_norm /
 *   options.base_c - forwarded to filters.chroma (filter_norm maps to that
 *   function's `norm` to avoid colliding with the frame norm)
 * @returns {Array<Float64Array>} [n_chroma][n_frames]
 */
export function chroma_stft(y = null, options = {}) {
  const {
    sr = 22050,
    S = null,
    norm = Infinity,
    n_fft = 2048,
    hop_length = 512,
    win_length = null,
    window = 'hann',
    center = true,
    pad_mode = 'constant',
    tuning = null,
    n_chroma = 12,
    ctroct = 5.0,
    octwidth = 2,
    filter_norm = 2,
    base_c = true,
  } = options

  // Power spectrogram (power=2 into _spectrogram)
  let spec = S
  let nfft = n_fft
  if (spec == null) {
    if (y == null) {
      throw new ParameterError('chroma_stft: either y or S must be provided')
    }
    const D = stft(y, n_fft, hop_length, win_length, window, center, pad_mode)
    const nF = D.length
    const nT = D[0] ? D[0].length : 0
    spec = new Array(nF)
    for (let f = 0; f < nF; f++) {
      const row = new Float64Array(nT)
      for (let t = 0; t < nT; t++) {
        const re = D[f][t].real
        const im = D[f][t].imag
        row[t] = re * re + im * im
      }
      spec[f] = row
    }
  } else {
    if (nfft == null || Math.floor(nfft / 2) + 1 !== spec.length) {
      nfft = 2 * (spec.length - 1)
    }
  }

  const tuningEst =
    tuning != null
      ? tuning
      : estimate_tuning({ S: spec, sr, bins_per_octave: n_chroma })

  const fb = chromaFilterbank({
    sr,
    n_fft: nfft,
    tuning: tuningEst,
    n_chroma,
    ctroct,
    octwidth,
    norm: filter_norm,
    base_c,
  })

  const nF = spec.length
  const nT = spec[0] ? spec[0].length : 0
  const raw = new Array(n_chroma)
  for (let c = 0; c < n_chroma; c++) {
    const row = new Float64Array(nT)
    const fbRow = fb[c]
    for (let t = 0; t < nT; t++) {
      let acc = 0
      for (let f = 0; f < nF; f++) acc += fbRow[f] * spec[f][t]
      row[t] = acc
    }
    raw[c] = row
  }

  // Per-frame normalization (util.normalize, axis=-2)
  if (norm === null) return raw
  for (let t = 0; t < nT; t++) {
    let length
    if (norm === Infinity) {
      length = 0
      for (let c = 0; c < n_chroma; c++) length = Math.max(length, Math.abs(raw[c][t]))
    } else if (typeof norm === 'number' && norm > 0) {
      length = 0
      for (let c = 0; c < n_chroma; c++) length += Math.pow(Math.abs(raw[c][t]), norm)
      length = Math.pow(length, 1.0 / norm)
    } else {
      throw new ParameterError(`chroma_stft: unsupported norm ${norm}`)
    }
    if (length < TINY) continue // sub-threshold frames pass through un-normalized
    for (let c = 0; c < n_chroma; c++) raw[c][t] /= length
  }
  return raw
}

/* -------------------------------------------------------------------------- */
/*  Log-frequency spectrum (honest rename of the old pseudo-"CQT")            */
/* -------------------------------------------------------------------------- */

/**
 * Log-frequency spectrum by nearest-FFT-bin sampling.
 *
 * HONESTY NOTE: this is NOT a constant-Q transform (no wavelet basis, no
 * per-bin Q resolution). It frames the signal, takes one large FFT per hop
 * (n_fft = 2^ceil(log2(4*sr/fmin))) and picks the magnitude of the nearest
 * FFT bin for each log-spaced frequency. Formerly (mis)named
 * `constant_q_transform` in xa-chroma.js; kept as a fast approximation.
 *
 * @param {Float32Array|Array} y - time series
 * @param {number} sr - sample rate
 * @param {number} hop_length - hop between frames
 * @param {number|null} fmin - minimum frequency (default C1 = 32.7 Hz)
 * @param {number} n_bins - number of log-frequency bins
 * @param {number} tuning - tuning offset in cents
 * @param {number} bins_per_octave - log-frequency bins per octave
 * @returns {Array<Float32Array>} time-major [n_frames][n_bins]
 */
export function logFrequencySpectrum(
  y,
  sr,
  hop_length = 512,
  fmin = null,
  n_bins = 84,
  tuning = 0.0,
  bins_per_octave = 12,
) {
  if (y == null || typeof y.length !== 'number' || y.length === 0) {
    throw new ParameterError('logFrequencySpectrum: invalid audio input')
  }
  let f0 = fmin == null ? 32.7 : fmin // C1
  f0 *= Math.pow(2, tuning / 1200)

  const n_fft = Math.pow(2, Math.ceil(Math.log2((4 * sr) / f0)))
  if (y.length < n_fft) {
    throw new ParameterError(
      `logFrequencySpectrum: input (${y.length} samples) shorter than required frame (${n_fft})`,
    )
  }
  const freqResolution = sr / n_fft

  const frames = []
  for (let i = 0; i + n_fft <= y.length; i += hop_length) {
    const spectrum = fft(y.slice(i, i + n_fft))
    const bins = new Float32Array(n_bins)
    for (let k = 0; k < n_bins; k++) {
      const fk = f0 * Math.pow(2, k / bins_per_octave)
      const binIdx = Math.round(fk / freqResolution)
      if (binIdx < spectrum.length) {
        bins[k] = Math.hypot(spectrum[binIdx].real, spectrum[binIdx].imag)
      }
    }
    frames.push(bins)
  }
  return frames
}

/**
 * Fold a time-major log-frequency spectrum into pitch classes by
 * energy sum over `bin % n_chroma`, with per-frame sqrt-energy-share
 * normalization. Only valid when the spectrum has exactly n_chroma bins
 * per octave (the fold has no sub-semitone resolution).
 * @param {Array<Float32Array>} logSpec - time-major [n_frames][n_bins]
 * @param {number} n_chroma - pitch classes (default 12)
 * @param {number} bins_per_octave - must equal n_chroma
 * @returns {Array<Float32Array>} [n_chroma][n_frames]
 */
export function foldLogSpectrumToChroma(logSpec, n_chroma = 12, bins_per_octave = n_chroma) {
  if (bins_per_octave !== n_chroma) {
    throw new ParameterError(
      `foldLogSpectrumToChroma: bins_per_octave=${bins_per_octave} must equal n_chroma=${n_chroma} ` +
        '(the modulo fold has no sub-semitone resolution)',
    )
  }
  const nFrames = logSpec.length
  const chroma = Array.from({ length: n_chroma }, () => new Float32Array(nFrames))

  for (let t = 0; t < nFrames; t++) {
    for (let bin = 0; bin < logSpec[t].length; bin++) {
      const c = bin % n_chroma
      chroma[c][t] += logSpec[t][bin] * logSpec[t][bin]
    }
    let sum = 0
    for (let c = 0; c < n_chroma; c++) sum += chroma[c][t]
    if (sum > 0) {
      const denom = Math.sqrt(sum)
      for (let c = 0; c < n_chroma; c++) {
        chroma[c][t] = Math.sqrt(chroma[c][t]) / denom
      }
    }
  }
  return chroma
}
