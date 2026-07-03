/**
 * Constant-Q and Variable-Q Transform — repaired against librosa's
 * constantq.py (0.11.0).
 *
 * Tier-3 proof-of-work repair (2026-07-02). The previous implementation was
 * runtime-confirmed garbage: it multiplied TIME-domain wavelet filters
 * element-wise against STFT FREQUENCY bins (a category error — librosa FFTs
 * the filterbank first), called resample() positionally against an
 * options-object signature (silently returning the un-resampled signal), and
 * passed 8 positional args to a 7-arg stft. A 440 Hz sine peaked at bin
 * 23/24 with a smooth magnitude ramp instead of an isolated peak at bin 12.
 *
 * Repaired forward path (this file):
 *   - wavelet filterbank: complex exponentials on librosa's exact time grid
 *     arange(-ilen//2, ilen//2), periodic-hann windowed, L1/L2/inf
 *     normalized, center-padded to a power-of-2 n_fft;
 *   - fft_basis: basis * lengths/n_fft, then row-wise FFT keeping the
 *     non-negative frequencies (librosa __vqt_filter_fft);
 *   - response: fft_basis · stft(y, n_fft, hop, window='ones')
 *     (librosa __cqt_response);
 *   - scale=true divides by sqrt(lengths) (the old code MULTIPLIED).
 *
 * DOCUMENTED DIVERGENCES from librosa:
 *   - Single-pass evaluation: every bin's filter is built at the native
 *     sample rate. librosa recurses octave-by-octave with 2x resampling
 *     (a speed optimization with sqrt(2) gain compensation); results agree
 *     up to resampling error, but this version is slower for many-octave
 *     ranges.
 *   - sparsity is accepted but NOT applied (dense basis; librosa quantile-
 *     sparsifies rows for speed, not correctness).
 *   - window: periodic hann only.
 *
 * HONEST-FAIL surface (not minimally repairable — these now throw instead
 * of returning plausible-looking garbage):
 *   - icqt(): previous body overlap-added the ANALYSIS basis (not librosa's
 *     dual frame) through an O(N^2) DFT loop;
 *   - griffinlim_cqt(): inherits icqt.
 *
 * Proof: examples/node/xa-constantq.mjs (peak-bin + octave-spacing +
 * dominance asserts on known tones).
 */

import { stft, ifft } from './xa-fft.js'

// scipy.signal window bandwidth constant used by librosa for the hann window
const HANN_BANDWIDTH = 1.50018310546875

const C1_HZ = 32.70319566257483

/* ------------------------------------------------------------------------ *
 * Frequency / length helpers
 * ------------------------------------------------------------------------ */

/** librosa.cqt_frequencies. @private */
function cqt_frequencies(n_bins, fmin, bins_per_octave, tuning) {
  const freqs = new Float64Array(n_bins)
  const f0 = fmin * Math.pow(2, tuning / bins_per_octave)
  for (let i = 0; i < n_bins; i++) {
    freqs[i] = f0 * Math.pow(2, i / bins_per_octave)
  }
  return freqs
}

/** librosa __et_relative_bw: alpha = 2^(1/bpo) - 1. @private */
function relativeBandwidth(bins_per_octave) {
  return Math.pow(2, 1.0 / bins_per_octave) - 1.0
}

/**
 * librosa filters.wavelet_lengths: fractional filter lengths and the
 * filterbank's maximum frequency cutoff. gamma=0 gives constant-Q.
 * @private
 */
function waveletLengths(freqs, sr, filter_scale, gamma, alpha) {
  const Q = filter_scale / alpha
  const lengths = new Float64Array(freqs.length)
  let cutoff = 0
  for (let i = 0; i < freqs.length; i++) {
    lengths[i] = (Q * sr) / (freqs[i] + gamma / alpha)
    const c = freqs[i] * (1 + (0.5 * HANN_BANDWIDTH) / Q) + 0.5 * gamma
    if (c > cutoff) cutoff = c
  }
  return { lengths, cutoff }
}

/** Periodic Hann window (scipy get_window('hann', n, fftbins=True)). @private */
function hannPeriodic(n) {
  const w = new Float64Array(n)
  for (let i = 0; i < n; i++) {
    w[i] = 0.5 - 0.5 * Math.cos((2 * Math.PI * i) / n)
  }
  return w
}

/** Forward complex FFT via the exported ifft: fft(x) = N * conj(ifft(conj(x))). @private */
function fftComplex(x) {
  const N = x.length
  const conj = x.map((v) => ({ real: v.real, imag: -v.imag }))
  const y = ifft(conj)
  return y.map((v) => ({ real: v.real * N, imag: -v.imag * N }))
}

/* ------------------------------------------------------------------------ *
 * Filterbank construction (librosa filters.wavelet + __vqt_filter_fft)
 * ------------------------------------------------------------------------ */

/**
 * Build the frequency-domain CQT/VQT filter basis.
 * @private
 * @returns {{ fftBasis: Array<Array<{real:number,imag:number}>>,
 *             lengths: Float64Array, n_fft: number }}
 *   fftBasis is [n_bins][n_fft/2 + 1].
 */
function buildFftBasis(freqs, sr, { filter_scale, norm, window, gamma, hop_length }) {
  if (window !== 'hann') {
    throw new Error(`cqt: window='${window}' is not supported (periodic hann only)`)
  }
  const n_bins = freqs.length
  const alpha = n_bins > 1 ? freqs[1] / freqs[0] - 1 : relativeBandwidth(12)
  const { lengths, cutoff } = waveletLengths(freqs, sr, filter_scale, gamma, alpha)
  if (cutoff > sr / 2) {
    throw new Error(
      `cqt: filterbank cutoff ${cutoff.toFixed(1)} Hz exceeds Nyquist ` +
        `${(sr / 2).toFixed(1)} Hz — reduce n_bins or fmin`,
    )
  }

  // pad_fft: next power of two above the longest filter
  let maxLen = 0
  for (let i = 0; i < n_bins; i++) if (lengths[i] > maxLen) maxLen = lengths[i]
  let n_fft = Math.pow(2, Math.ceil(Math.log2(Math.ceil(maxLen))))
  // librosa __vqt_filter_fft: ensure n_fft comfortably exceeds the hop
  if (hop_length != null && n_fft < Math.pow(2, 1 + Math.ceil(Math.log2(hop_length)))) {
    n_fft = Math.pow(2, 1 + Math.ceil(Math.log2(hop_length)))
  }

  const fftBasis = new Array(n_bins)
  for (let i = 0; i < n_bins; i++) {
    const ilen = lengths[i]
    // np.arange(-ilen//2, ilen//2): count = floor(ilen/2) + ceil(ilen/2)
    const start = -Math.ceil(ilen / 2)
    const count = Math.floor(ilen / 2) + Math.ceil(ilen / 2)
    const win = hannPeriodic(count)

    // Windowed complex exponential exp(+i 2π f t/sr)
    const filt = new Array(count)
    for (let j = 0; j < count; j++) {
      const phase = (2 * Math.PI * freqs[i] * (start + j)) / sr
      filt[j] = { real: win[j] * Math.cos(phase), imag: win[j] * Math.sin(phase) }
    }

    // util.normalize(sig, norm=norm)
    if (norm !== null && norm !== undefined) {
      let normVal = 0
      if (norm === 1) {
        for (let j = 0; j < count; j++) {
          normVal += Math.hypot(filt[j].real, filt[j].imag)
        }
      } else if (norm === 2) {
        for (let j = 0; j < count; j++) {
          normVal += filt[j].real * filt[j].real + filt[j].imag * filt[j].imag
        }
        normVal = Math.sqrt(normVal)
      } else if (norm === Infinity) {
        for (let j = 0; j < count; j++) {
          const m = Math.hypot(filt[j].real, filt[j].imag)
          if (m > normVal) normVal = m
        }
      } else {
        throw new Error(`cqt: norm=${norm} must be 1, 2, Infinity, or null`)
      }
      if (normVal > 0) {
        for (let j = 0; j < count; j++) {
          filt[j].real /= normVal
          filt[j].imag /= normVal
        }
      }
    }

    // pad_center to n_fft, re-scale by length/n_fft, then FFT
    const padded = new Array(n_fft)
    const offset = Math.floor((n_fft - count) / 2)
    const rescale = ilen / n_fft
    for (let j = 0; j < n_fft; j++) padded[j] = { real: 0, imag: 0 }
    for (let j = 0; j < count; j++) {
      padded[offset + j] = { real: filt[j].real * rescale, imag: filt[j].imag * rescale }
    }
    fftBasis[i] = fftComplex(padded).slice(0, Math.floor(n_fft / 2) + 1)
  }

  return { fftBasis, lengths, n_fft }
}

/**
 * librosa __cqt_response: fft_basis · stft(y, n_fft, hop, window='ones').
 * @private
 */
function cqtResponse(y, n_fft, hop_length, fftBasis, pad_mode) {
  const D = stft(y, n_fft, hop_length, null, 'rectangular', true, pad_mode)
  const n_freq = D.length
  const n_frames = D[0] ? D[0].length : 0
  const n_bins = fftBasis.length

  const C = new Array(n_bins)
  for (let b = 0; b < n_bins; b++) {
    const row = fftBasis[b]
    const out = new Array(n_frames)
    for (let t = 0; t < n_frames; t++) {
      let re = 0
      let im = 0
      for (let k = 0; k < n_freq; k++) {
        const s = D[k][t]
        const f = row[k]
        re += f.real * s.real - f.imag * s.imag
        im += f.real * s.imag + f.imag * s.real
      }
      out[t] = { real: re, imag: im }
    }
    C[b] = out
  }
  return C
}

/* ------------------------------------------------------------------------ *
 * Public transforms
 * ------------------------------------------------------------------------ */

/**
 * Constant-Q Transform of an audio signal (librosa.cqt semantics, single-pass
 * evaluation — see module header for documented divergences).
 *
 * Legacy positional signature preserved.
 *
 * @param {Float32Array} y - Audio time series
 * @param {number} sr - Sample rate
 * @param {number} hop_length - Samples between successive CQT columns
 * @param {number|null} fmin - Minimum frequency (Hz); defaults to C1
 * @param {number} n_bins - Number of frequency bins
 * @param {number} bins_per_octave - Bins per octave
 * @param {number} tuning - Tuning offset in fractions of a bin
 * @param {number} filter_scale - Filter scale factor
 * @param {number|null} norm - Filter normalization (1, 2, Infinity, or null)
 * @param {number} sparsity - Accepted but not applied (dense basis)
 * @param {string} window - Window function ('hann' only)
 * @param {boolean} scale - Divide by sqrt(filter length) (librosa scale=True)
 * @param {string} pad_mode - Padding mode for signal edges
 * @returns {Array<Array<{real:number, imag:number}>>} CQT [n_bins][n_frames]
 *   with n_frames = 1 + floor(len(y)/hop_length)
 * @throws {Error} on invalid parameters or a filterbank exceeding Nyquist
 */
export function cqt(
  y,
  sr = 22050,
  hop_length = 512,
  fmin = null,
  n_bins = 84,
  bins_per_octave = 12,
  tuning = 0.0,
  filter_scale = 1,
  norm = 1,
  sparsity = 0.01, // eslint-disable-line no-unused-vars — accepted, not applied
  window = 'hann',
  scale = true,
  pad_mode = 'constant',
) {
  if (fmin === null) fmin = C1_HZ
  if (!(fmin > 0)) throw new Error('fmin must be positive')
  if (!Number.isInteger(n_bins) || n_bins <= 0) throw new Error('n_bins must be a positive integer')
  if (!Number.isInteger(bins_per_octave) || bins_per_octave <= 0) {
    throw new Error('bins_per_octave must be a positive integer')
  }
  if (!Number.isInteger(hop_length) || hop_length <= 0) {
    throw new Error('hop_length must be a positive integer')
  }
  if (y == null || typeof y.length !== 'number' || y.length === 0) {
    throw new Error('cqt: y must be a non-empty array of samples')
  }

  const freqs = cqt_frequencies(n_bins, fmin, bins_per_octave, tuning)
  const { fftBasis, lengths, n_fft } = buildFftBasis(freqs, sr, {
    filter_scale, norm, window, gamma: 0, hop_length,
  })

  const C = cqtResponse(y, n_fft, hop_length, fftBasis, pad_mode)

  if (scale) {
    for (let b = 0; b < n_bins; b++) {
      const s = 1 / Math.sqrt(lengths[b])
      for (let t = 0; t < C[b].length; t++) {
        C[b][t].real *= s
        C[b][t].imag *= s
      }
    }
  }

  return C
}

/**
 * Variable-Q Transform. intervals='equal' with the librosa-default
 * ERB-derived gamma (24.7 * alpha / 0.108); pass gamma=0 to recover cqt().
 * Custom interval arrays build freqs[i] = fmin * 2^floor(i/len) * ratio.
 *
 * @param {Float32Array} y - Audio time series
 * @param {number} sr - Sample rate
 * @param {number} hop_length - Hop length
 * @param {number|null} fmin - Minimum frequency (default C1)
 * @param {number} n_bins - Number of bins
 * @param {string|Array<number>} intervals - 'equal' or interval ratios
 * @param {number|null} gamma - Bandwidth offset (null = ERB default)
 * @param {number} bins_per_octave - Bins per octave for 'equal'
 * @param {number} tuning - Tuning offset in bins
 * @param {number} filter_scale - Filter scale factor
 * @param {number|null} norm - Filter normalization
 * @param {number} sparsity - Accepted but not applied
 * @param {string} window - Window function ('hann' only)
 * @param {boolean} scale - Divide by sqrt(filter length)
 * @param {string} pad_mode - Padding mode
 * @returns {Array<Array<{real:number, imag:number}>>} VQT [n_bins][n_frames]
 */
export function vqt(
  y,
  sr = 22050,
  hop_length = 512,
  fmin = null,
  n_bins = 84,
  intervals = 'equal',
  gamma = null,
  bins_per_octave = 12,
  tuning = 0.0,
  filter_scale = 1,
  norm = 1,
  sparsity = 0.01, // eslint-disable-line no-unused-vars — accepted, not applied
  window = 'hann',
  scale = true,
  pad_mode = 'constant',
) {
  if (fmin === null) fmin = C1_HZ

  let freqs
  if (intervals === 'equal') {
    freqs = cqt_frequencies(n_bins, fmin, bins_per_octave, tuning)
  } else if (Array.isArray(intervals)) {
    freqs = new Float64Array(n_bins)
    for (let i = 0; i < n_bins; i++) {
      const octave = Math.floor(i / intervals.length)
      freqs[i] = fmin * Math.pow(2, octave) * intervals[i % intervals.length]
    }
  } else {
    throw new Error(`vqt: intervals=${intervals} must be 'equal' or an array of ratios`)
  }

  const alpha = n_bins > 1 ? freqs[1] / freqs[0] - 1 : relativeBandwidth(bins_per_octave)
  const g = gamma === null ? (24.7 * alpha) / 0.108 : gamma

  const { fftBasis, lengths, n_fft } = buildFftBasis(freqs, sr, {
    filter_scale, norm, window, gamma: g, hop_length,
  })

  const V = cqtResponse(y, n_fft, hop_length, fftBasis, pad_mode)

  if (scale) {
    for (let b = 0; b < n_bins; b++) {
      const s = 1 / Math.sqrt(lengths[b])
      for (let t = 0; t < V[b].length; t++) {
        V[b][t].real *= s
        V[b][t].imag *= s
      }
    }
  }

  return V
}

/**
 * Pseudo-CQT: magnitude-only approximation |fft_basis| · |STFT|
 * (librosa.pseudo_cqt shape). Returns REAL magnitudes, not complex values.
 *
 * @param {Float32Array} y - Audio time series
 * @param {number} sr - Sample rate
 * @param {number} hop_length - Hop length
 * @param {number|null} fmin - Minimum frequency (default C1)
 * @param {number} n_bins - Number of bins
 * @param {number} bins_per_octave - Bins per octave
 * @param {number} tuning - Tuning offset in bins
 * @param {number} filter_scale - Filter scale
 * @param {number|null} norm - Filter normalization
 * @param {number} sparsity - Accepted but not applied
 * @param {string} window - Window function ('hann' only)
 * @param {boolean} scale - librosa pseudo-CQT scaling (sqrt(n_fft/lengths))
 * @param {string} pad_mode - Padding mode
 * @returns {Array<Float64Array>} magnitude matrix [n_bins][n_frames]
 */
export function pseudo_cqt(
  y,
  sr = 22050,
  hop_length = 512,
  fmin = null,
  n_bins = 84,
  bins_per_octave = 12,
  tuning = 0.0,
  filter_scale = 1,
  norm = 1,
  sparsity = 0.01, // eslint-disable-line no-unused-vars — accepted, not applied
  window = 'hann',
  scale = true,
  pad_mode = 'constant',
) {
  if (fmin === null) fmin = C1_HZ

  const freqs = cqt_frequencies(n_bins, fmin, bins_per_octave, tuning)
  const { fftBasis, lengths, n_fft } = buildFftBasis(freqs, sr, {
    filter_scale, norm, window, gamma: 0, hop_length,
  })

  const D = stft(y, n_fft, hop_length, null, 'rectangular', true, pad_mode)
  const n_freq = D.length
  const n_frames = D[0] ? D[0].length : 0

  const C = new Array(n_bins)
  for (let b = 0; b < n_bins; b++) {
    const row = fftBasis[b]
    const rowMag = new Float64Array(n_freq)
    for (let k = 0; k < n_freq; k++) rowMag[k] = Math.hypot(row[k].real, row[k].imag)
    const out = new Float64Array(n_frames)
    for (let t = 0; t < n_frames; t++) {
      let sum = 0
      for (let k = 0; k < n_freq; k++) {
        const s = D[k][t]
        sum += rowMag[k] * Math.hypot(s.real, s.imag)
      }
      out[t] = sum
    }
    // librosa: C *= sqrt(n_fft / lengths) with scale, else C *= sqrt(n_fft)
    const s = scale ? Math.sqrt(n_fft / lengths[b]) : Math.sqrt(n_fft)
    for (let t = 0; t < n_frames; t++) out[t] *= s
    C[b] = out
  }

  return C
}

/**
 * Hybrid CQT: pseudo-CQT for the top two octaves stacked over the full CQT
 * for the rest. Returns MAGNITUDES (librosa.hybrid_cqt shape).
 *
 * @param {Float32Array} y - Audio time series
 * @param {number} sr - Sample rate
 * @param {number} hop_length - Hop length
 * @param {number|null} fmin - Minimum frequency (default C1)
 * @param {number} n_bins - Number of bins
 * @param {number} bins_per_octave - Bins per octave
 * @param {number} tuning - Tuning offset in bins
 * @param {number} filter_scale - Filter scale
 * @param {number|null} norm - Filter normalization
 * @param {number} sparsity - Accepted but not applied
 * @param {string} window - Window function ('hann' only)
 * @param {boolean} scale - Scaling flag
 * @param {string} pad_mode - Padding mode
 * @returns {Array<Float64Array>} magnitude matrix [n_bins][n_frames]
 */
export function hybrid_cqt(
  y,
  sr = 22050,
  hop_length = 512,
  fmin = null,
  n_bins = 84,
  bins_per_octave = 12,
  tuning = 0.0,
  filter_scale = 1,
  norm = 1,
  sparsity = 0.01,
  window = 'hann',
  scale = true,
  pad_mode = 'constant',
) {
  if (fmin === null) fmin = C1_HZ

  const n_bins_pseudo = Math.min(n_bins, 2 * bins_per_octave)
  const n_bins_full = n_bins - n_bins_pseudo
  const fmin_pseudo = fmin * Math.pow(2, n_bins_full / bins_per_octave)

  const high = pseudo_cqt(
    y, sr, hop_length, fmin_pseudo, n_bins_pseudo, bins_per_octave,
    tuning, filter_scale, norm, sparsity, window, scale, pad_mode,
  )

  if (n_bins_full === 0) return high

  const low = cqt(
    y, sr, hop_length, fmin, n_bins_full, bins_per_octave,
    tuning, filter_scale, norm, sparsity, window, scale, pad_mode,
  ).map((row) => Float64Array.from(row, (v) => Math.hypot(v.real, v.imag)))

  return [...low, ...high]
}

/* ------------------------------------------------------------------------ *
 * Honest-fail surface — inverse path is NOT minimally repairable
 * ------------------------------------------------------------------------ */

/**
 * Inverse CQT is NOT implemented to librosa parity. The previous body
 * overlap-added the ANALYSIS wavelets (librosa reconstructs through the dual
 * frame with per-octave resampling) via an O(N^2) DFT loop, producing
 * unusable output. It now fails honestly instead.
 * @throws {Error} always
 */
export function icqt() {
  throw new Error(
    'icqt: not implemented to librosa parity — the previous implementation ' +
      'reconstructed with a non-dual basis and an O(N^2) IDFT. Repair requires ' +
      'the dual-frame synthesis of librosa.icqt.',
  )
}

/**
 * Griffin-Lim CQT reconstruction depends on icqt and is therefore NOT
 * implemented. Fails honestly. For STFT-magnitude reconstruction use the
 * repaired griffinlim in scripts/xa-advanced.js.
 * @throws {Error} always
 */
export function griffinlim_cqt() {
  throw new Error(
    'griffinlim_cqt: not implemented — depends on icqt, which is not ' +
      'implemented to librosa parity. Use griffinlim (STFT domain) instead.',
  )
}
