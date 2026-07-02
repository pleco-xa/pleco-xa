/**
 * Audio filters for JavaScript
 * Preemphasis and deemphasis filtering + re-pointed filterbank canon
 *
 * SHIM (Wave 5A): preemphasis/deemphasis delegate to the canonical
 * librosa-parity implementations in src/effects/index.js (fixture-gated:
 * effects.json). The legacy local versions initialized zi=0 (librosa uses
 * the lfilter state 2*y[0]-y[1]) and returned a zf convention incompatible
 * with librosa block chaining — both repaired in the canonical module, so
 * deemphasis(preemphasis(x)) now round-trips to x like librosa guarantees.
 *
 * REPAIR (Tier-1 proof-of-work pass): the legacy marathon filterbank family
 * that lived here (constant_q, wavelet, window_sumsquare, cq_to_chroma,
 * diagonal_filter, semitone_filterbank, _multirate_fb, …) was retired — it
 * had zero importers outside the pleco-audio barrel, duplicated the
 * fixture-gated canon, and its local mel() was mathematically wrong (its
 * "slaney" branch used the HTK formula 1127·ln(1+f/700) and snapped triangle
 * corners to integer bins). mel / chroma / get_window remain exported but now
 * delegate to the parity-gated implementations:
 *   - mel        → scripts/xa-mel.js mel_filterbank (fixture: mel_filterbank.json)
 *   - get_window → scripts/xa-fft.js get_window     (fixture: windows.json)
 *   - chroma     → filters/index.js chroma          (fixture: chroma.json)
 * Acceptance proof: examples/node/filters-shim.mjs.
 */

import {
  preemphasis as preemphasisCanonical,
  deemphasis as deemphasisCanonical,
} from '../effects/index.js'
import { mel_filterbank } from './xa-mel.js'
import { chroma as chromaCanonical } from '../filters/index.js'

export { get_window } from './xa-fft.js'

/**
 * Apply first-order differencing filter (high-pass): y[n] = x[n] - coef*x[n-1]
 * @param {Float32Array} y - Audio time series
 * @param {number} coef - Filter coefficient (typically 0.97)
 * @param {number|null} zi - Initial filter state (librosa default: 2*y[0]-y[1]);
 *   chain non-overlapping blocks by passing the previous call's zf
 * @param {boolean} return_zf - Whether to return final filter state
 * @returns {Float32Array|{y: Float32Array, zf: number}} Filtered audio, or {y, zf}
 */
export function preemphasis(y, coef = 0.97, zi = null, return_zf = false) {
  if (return_zf) {
    const [y_out, zf] = preemphasisCanonical(y, { coef, zi, return_zf: true })
    return { y: y_out, zf }
  }
  return preemphasisCanonical(y, { coef, zi })
}

/**
 * Apply inverse of preemphasis filter (low-pass): x[n] = y[n] + coef*x[n-1]
 * @param {Float32Array} y - Audio time series
 * @param {number} coef - Filter coefficient (typically 0.97)
 * @param {number|null} zi - Initial filter state; when null, librosa's
 *   extrapolation correction is applied so preemphasis round-trips exactly
 * @param {boolean} return_zf - Whether to return final filter state
 * @returns {Float32Array|{y: Float32Array, zf: number}} Filtered audio, or {y, zf}
 */
export function deemphasis(y, coef = 0.97, zi = null, return_zf = false) {
  if (return_zf) {
    const [y_out, zf] = deemphasisCanonical(y, { coef, zi, return_zf: true })
    return { y: y_out, zf }
  }
  return deemphasisCanonical(y, { coef, zi })
}

/**
 * Simple high-pass filter
 * @param {Float32Array} y - Audio time series
 * @param {number} cutoff - Cutoff frequency (normalized 0-1)
 * @returns {Float32Array} Filtered audio
 */
export function highpass(y, cutoff = 0.1) {
  const alpha = Math.exp(-2 * Math.PI * cutoff)
  const y_out = new Float32Array(y.length)

  y_out[0] = y[0]
  for (let n = 1; n < y.length; n++) {
    y_out[n] = alpha * y_out[n - 1] + alpha * (y[n] - y[n - 1])
  }

  return y_out
}

/**
 * Simple low-pass filter
 * @param {Float32Array} y - Audio time series
 * @param {number} cutoff - Cutoff frequency (normalized 0-1)
 * @returns {Float32Array} Filtered audio
 */
export function lowpass(y, cutoff = 0.1) {
  const alpha = Math.exp(-2 * Math.PI * cutoff)
  const y_out = new Float32Array(y.length)

  y_out[0] = y[0]
  for (let n = 1; n < y.length; n++) {
    y_out[n] = alpha * y_out[n - 1] + (1 - alpha) * y[n]
  }

  return y_out
}

// ============================================================================
// Re-pointed filterbank canon (legacy positional signatures preserved)
// ============================================================================

/**
 * Generate Mel filterbank — delegates to the fixture-gated
 * scripts/xa-mel.js mel_filterbank (real Slaney scale, continuous
 * triangle weights). Legacy positional signature preserved (htk before norm).
 *
 * @param {number} sr - Sample rate
 * @param {number} n_fft - FFT size
 * @param {number} n_mels - Number of Mel bands (default: 128)
 * @param {number} fmin - Minimum frequency (default: 0.0)
 * @param {number|null} fmax - Maximum frequency (default: null, sr/2)
 * @param {boolean} htk - Use HTK formula (default: false → Slaney)
 * @param {string|number|null} norm - Normalization ('slaney' or number)
 * @returns {Array<Float32Array>} Mel filterbank [n_mels x (n_fft/2 + 1)]
 */
export function mel(
  sr,
  n_fft,
  n_mels = 128,
  fmin = 0.0,
  fmax = null,
  htk = false,
  norm = 'slaney',
) {
  return mel_filterbank(sr, n_fft, n_mels, fmin, fmax, norm, htk)
}

/**
 * Generate chroma filterbank — delegates to the fixture-gated
 * filters/index.js chroma port. Legacy positional signature preserved.
 *
 * @param {number} sr - Sample rate
 * @param {number} n_fft - FFT size
 * @param {number} n_chroma - Number of chroma bins (default: 12)
 * @param {number} tuning - Tuning offset in fractions of a bin (default: 0.0)
 * @param {number} ctroct - Center octave (default: 5.0)
 * @param {number|null} octwidth - Octave width (default: 2)
 * @param {number|null} norm - Normalization (default: 2)
 * @param {boolean} base_c - Start at C (default: true)
 * @returns {Array<Float64Array>} Chroma filterbank [n_chroma x (n_fft/2 + 1)]
 */
export function chroma(
  sr,
  n_fft,
  n_chroma = 12,
  tuning = 0.0,
  ctroct = 5.0,
  octwidth = 2,
  norm = 2,
  base_c = true,
) {
  return chromaCanonical({ sr, n_fft, n_chroma, tuning, ctroct, octwidth, norm, base_c })
}
