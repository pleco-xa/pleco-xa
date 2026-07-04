/**
 * feature/ — the canonical, fixture-verified spectral feature namespace.
 *
 * One implementation per feature, fixture-verified numerics, validated against
 * committed reference fixtures.
 *
 * The legacy modules (scripts/xa-spectral.js, xa-features.js,
 * xa-audio-features.js, xa-chroma.js) are shims that delegate here.
 */

export {
  ParameterError,
  spectral_centroid,
  spectral_bandwidth,
  spectral_rolloff,
  spectral_flatness,
  spectral_contrast,
  rms,
  zero_crossing_rate,
} from './spectral.js'

export { melspectrogram, mfcc, dctBasis, mfccFromLogMel } from './mfcc.js'

export {
  chroma_stft,
  estimate_tuning,
  pitch_tuning,
  piptrackPeaks,
  logFrequencySpectrum,
  foldLogSpectrumToChroma,
} from './chroma.js'
