/**
 * feature/dct.js — cached DCT-II basis + the MFCC cepstral core.
 *
 * Leaf module (no xa-* imports) so both feature/mfcc.js and the legacy
 * scripts/xa-mel.js shim can share the exact same cepstral math without a
 * circular dependency.
 */

import { ParameterError } from './spectral.js'

/** DCT-II basis cache, keyed by (n_in, n_out, norm). */
const dctBasisCache = new Map()

/**
 * Rows 0..n_out-1 of the DCT-II matrix over n_in points
 * (scipy.fft.dct(type=2) semantics: 'ortho' or unnormalized).
 * @returns {Array<Float64Array>} [n_out][n_in]
 */
export function dctBasis(n_in, n_out, norm = 'ortho') {
  const key = `${n_in}|${n_out}|${norm}`
  const cached = dctBasisCache.get(key)
  if (cached) return cached

  const basis = new Array(n_out)
  for (let k = 0; k < n_out; k++) {
    const row = new Float64Array(n_in)
    const scale =
      norm === 'ortho'
        ? k === 0
          ? Math.sqrt(1 / n_in)
          : Math.sqrt(2 / n_in)
        : 2
    for (let n = 0; n < n_in; n++) {
      row[n] = scale * Math.cos((Math.PI * k * (2 * n + 1)) / (2 * n_in))
    }
    basis[k] = row
  }
  dctBasisCache.set(key, basis)
  return basis
}

/**
 * MFCC cepstral core: DCT-II along the mel axis of a LOG-power mel
 * spectrogram, keep the first n_mfcc rows, optional cepstral liftering
 * (1 + (L/2)·sin(π(k+1)/L)).
 * @param {Array} logMel - [n_mels][n_frames] log-power mel spectrogram
 * @returns {Array<Float64Array>} [n_mfcc][n_frames]
 */
export function mfccFromLogMel(logMel, { n_mfcc = 20, dct_type = 2, norm = 'ortho', lifter = 0 } = {}) {
  if (dct_type !== 2) {
    throw new ParameterError(
      `mfcc: dct_type=${dct_type} is not implemented (only the default dct_type=2)`,
    )
  }
  if (norm !== 'ortho' && norm !== null) {
    throw new ParameterError(`mfcc: norm='${norm}' is not supported (use 'ortho' or null)`)
  }
  if (!(lifter >= 0)) {
    throw new ParameterError(`MFCC lifter=${lifter} must be a non-negative number`)
  }

  const nMels = logMel.length
  if (!nMels || logMel[0] == null || typeof logMel[0].length !== 'number') {
    throw new ParameterError('mfcc: S must be a 2-D log-mel spectrogram')
  }
  const nT = logMel[0].length
  const nOut = Math.min(n_mfcc, nMels)
  const basis = dctBasis(nMels, nOut, norm)

  const M = new Array(nOut)
  for (let k = 0; k < nOut; k++) {
    const row = new Float64Array(nT)
    const bk = basis[k]
    for (let t = 0; t < nT; t++) {
      let acc = 0
      for (let n = 0; n < nMels; n++) acc += bk[n] * logMel[n][t]
      row[t] = acc
    }
    M[k] = row
  }

  if (lifter > 0) {
    for (let k = 0; k < nOut; k++) {
      const w = 1 + (lifter / 2) * Math.sin((Math.PI * (k + 1)) / lifter)
      const row = M[k]
      for (let t = 0; t < nT; t++) row[t] *= w
    }
  }

  return M
}
