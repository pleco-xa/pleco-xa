/**
 * feature/mfcc.js — mfcc / melspectrogram, fixture-verified.
 *
 * Pipeline: S = power_to_db(melspectrogram(y)) →
 * DCT-II (ortho) along the mel axis → first n_mfcc rows → optional liftering.
 *
 * Builds on the validated foundations:
 *  - scripts/xa-mel.js melspectrogram (slaney filterbank, gated by
 *    mel_filterbank.json + melspectrogram.json)
 *  - scripts/xa-convert.js power_to_db (gated by conversions.json)
 *  - feature/dct.js cached ortho DCT-II basis — no per-frame O(N²)
 *    recomputation.
 *
 * Validated against committed reference fixtures.
 */

import { melspectrogram as xaMelspectrogram } from '../scripts/xa-mel.js'
import { power_to_db } from '../scripts/xa-convert.js'
import { ParameterError } from './spectral.js'
import { mfccFromLogMel } from './dct.js'

export { dctBasis, mfccFromLogMel } from './dct.js'

/**
 * Mel spectrogram with a (y, options) API.
 * Thin wrapper over the validated scripts/xa-mel.js implementation.
 * @param {Float32Array|Array|null} y - time series (or null when S given)
 * @param {Object} options - { sr, S, n_fft, hop_length, win_length, window,
 *   center, pad_mode, power, n_mels, fmin, fmax, norm, htk }
 * @returns {Array<Float32Array>} [n_mels][n_frames]
 */
export function melspectrogram(y = null, options = {}) {
  const {
    sr = 22050,
    S = null,
    n_fft = 2048,
    hop_length = 512,
    win_length = null,
    window = 'hann',
    center = true,
    pad_mode = 'constant',
    power = 2.0,
    n_mels = 128,
    fmin = 0,
    fmax = null,
    norm = 'slaney',
    htk = false,
  } = options

  return xaMelspectrogram(
    y, sr, S, n_fft, hop_length, win_length, window,
    center, pad_mode, power, n_mels, fmin, fmax, norm, htk,
  )
}

/**
 * Mel-frequency cepstral coefficients.
 * @param {Float32Array|Array|null} y - time series (or null when S given)
 * @param {Object} [options]
 * @param {number} [options.sr=22050] - sample rate (forwarded to melspectrogram)
 * @param {Array|null} [options.S=null] - precomputed LOG-power mel spectrogram
 *   (pass power_to_db(melspectrogram(...)))
 * @param {number} [options.n_mfcc=20] - number of coefficients
 * @param {number} [options.dct_type=2] - only type 2 is implemented
 * @param {string|null} [options.norm='ortho'] - DCT normalization: 'ortho' or null
 * @param {number} [options.lifter=0] - cepstral liftering parameter
 * @param {string|number|null} [options.mel_norm='slaney'] - mel filterbank
 *   normalization forwarded to melspectrogram as `norm`
 * Remaining options forward to melspectrogram (sr, n_fft, hop_length, n_mels, ...).
 * @returns {Array<Float64Array>} [n_mfcc][n_frames]
 */
export function mfcc(y = null, options = {}) {
  const {
    sr = 22050,
    S = null,
    n_mfcc = 20,
    dct_type = 2,
    norm = 'ortho',
    lifter = 0,
    mel_norm = 'slaney',
    ...melOptions
  } = options

  let logMel = S
  if (logMel == null) {
    if (y == null) {
      throw new ParameterError('feature.mfcc: either y or S must be provided')
    }
    logMel = power_to_db(melspectrogram(y, { sr, norm: mel_norm, ...melOptions }))
  }

  return mfccFromLogMel(logMel, { n_mfcc, dct_type, norm, lifter })
}
