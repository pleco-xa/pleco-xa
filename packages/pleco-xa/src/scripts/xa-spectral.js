/**
 * xa-spectral.js — LEGACY SHIM over the fixture-verified feature/ namespace.
 *
 * History (Wave 4 consolidation): the original 1360-line module referenced
 * ~29 helper functions that were never defined, silently NaN-sanitized
 * complex spectrograms to zero, and flipped the matrix orientation — nearly
 * every export either threw ReferenceError or returned wrong values.
 *
 * Fixture judgment (tools/parity/fixtures/spectral_features.json):
 *  - spectralFlatness: formula CORRECT (survived) → delegates to
 *    feature/spectral.js spectral_flatness.
 *  - rms y-path: bit-identical to librosa (survived) → delegates to
 *    feature/spectral.js rms (whose S path also works now).
 *  - everything else: did not survive → throws with the feature/ replacement
 *    named, instead of fabricating output.
 *
 * New code should import from src/feature/ directly.
 */

import {
  spectral_flatness,
  rms as featureRms,
  ParameterError,
} from '../feature/spectral.js'

export { ParameterError }

function removed(name, replacement) {
  return function xaSpectralRemoved() {
    throw new Error(
      `pleco-xa: xa-spectral.${name} was removed in the Wave-4 spectral ` +
        `consolidation (it returned incorrect results or crashed on ` +
        `undefined helpers). Use ${replacement} instead.`,
    )
  }
}

/**
 * Spectral flatness (salvaged path).
 * @param {Object} options - { y, S, n_fft, hop_length, win_length, window,
 *   center, pad_mode, amin, power } (librosa-style, S is [freq][time])
 * @returns {Float64Array} flatness per frame
 */
export function spectralFlatness(options = {}) {
  const { y = null, ...rest } = options
  return spectral_flatness(y, rest)
}

/**
 * Root-mean-square energy (salvaged y-path; S path now also functional).
 * @param {Object} options - { y, S, frame_length, hop_length, center, pad_mode }
 * @returns {Float64Array} RMS per frame
 */
export function rms(options = {}) {
  const { y = null, ...rest } = options
  return featureRms(y, rest)
}

// Removed exports — kept as named throwers so stale imports fail loudly at
// call time with a pointer to the canonical implementation.
export const spectralCentroid = removed(
  'spectralCentroid',
  "feature/spectral.js spectral_centroid(y, { sr })",
)
export const spectralBandwidth = removed(
  'spectralBandwidth',
  "feature/spectral.js spectral_bandwidth(y, { sr })",
)
export const spectralContrast = removed(
  'spectralContrast',
  "feature/spectral.js spectral_contrast(y, { sr })",
)
export const spectralRolloff = removed(
  'spectralRolloff',
  "feature/spectral.js spectral_rolloff(y, { sr })",
)
export const polyFeatures = removed(
  'polyFeatures',
  'nothing yet (poly_features has no verified port; deliberately left out)',
)
export const zeroCrossingRate = removed(
  'zeroCrossingRate',
  "feature/spectral.js zero_crossing_rate(y, { frame_length, hop_length })",
)
export const chromaStft = removed(
  'chromaStft',
  "feature/chroma.js chroma_stft(y, { sr })",
)
export const chromaCqt = removed(
  'chromaCqt',
  'feature/chroma.js logFrequencySpectrum + foldLogSpectrumToChroma (NOT a true CQT), or xa-chroma.js chroma_cqt',
)
export const chromaCens = removed(
  'chromaCens',
  'nothing yet (chroma_cens has no verified port; deliberately left out)',
)
export const mfcc = removed('mfcc', "feature/mfcc.js mfcc(y, { sr, n_mfcc })")
export const melspectrogram = removed(
  'melspectrogram',
  "feature/mfcc.js melspectrogram(y, { sr }) or scripts/xa-mel.js",
)
export const tonnetz = removed(
  'tonnetz',
  'nothing yet (tonnetz has no verified port; deliberately left out)',
)
