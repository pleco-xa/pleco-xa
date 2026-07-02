/**
 * xa-features.js — LEGACY SHIM over the fixture-verified feature/ namespace.
 *
 * History (Wave 4 consolidation): the spectral functions here called
 * require('./librosa-fft.js') — CommonJS in an ES module AND a file that no
 * longer exists — so centroid/bandwidth/rolloff/contrast were dead on
 * arrival. They now delegate to feature/spectral.js (librosa 0.11.0
 * numerics, gated by tools/parity/fixtures/spectral_features.json).
 *
 * Signature note: the old positional signatures are preserved. Two behavior
 * changes come with correctness:
 *  - rms/zero_crossing_rate now center-pad like librosa (center=true).
 *  - spectral_contrast now returns n_bands + 1 rows (librosa includes the
 *    [0, fmin] band) instead of the old n_bands.
 *
 * New code should import from src/feature/ directly.
 */

import {
  spectral_centroid as featureCentroid,
  spectral_bandwidth as featureBandwidth,
  spectral_rolloff as featureRolloff,
  spectral_contrast as featureContrast,
  rms as featureRms,
  zero_crossing_rate as featureZcr,
} from '../feature/spectral.js'

/**
 * Zero crossing rate per frame (librosa-parity via feature/spectral.js).
 * @returns {Float64Array} fraction of zero crossings per frame
 */
export function zero_crossing_rate(
  y,
  frame_length = 2048,
  hop_length = 512,
  center = true,
) {
  return featureZcr(y, { frame_length, hop_length, center })
}

/**
 * RMS energy per frame (librosa-parity via feature/spectral.js).
 * @returns {Float64Array} RMS per frame
 */
export function rms(y, frame_length = 2048, hop_length = 512, center = true) {
  return featureRms(y, { frame_length, hop_length, center })
}

/**
 * Spectral centroid per frame (librosa-parity via feature/spectral.js).
 * @returns {Float64Array} centroid (Hz) per frame
 */
export function spectral_centroid(y, sr = 22050, hop_length = 512, n_fft = 2048) {
  return featureCentroid(y, { sr, hop_length, n_fft })
}

/**
 * Spectral bandwidth per frame (librosa-parity via feature/spectral.js).
 * @returns {Float64Array} bandwidth per frame
 */
export function spectral_bandwidth(
  y,
  sr = 22050,
  hop_length = 512,
  n_fft = 2048,
  p = 2,
) {
  return featureBandwidth(y, { sr, hop_length, n_fft, p })
}

/**
 * Spectral rolloff per frame (librosa-parity via feature/spectral.js).
 * Note: librosa computes rolloff on the magnitude spectrogram (power=1);
 * the old power-squared variant here was a divergence and is gone.
 * @returns {Float64Array} rolloff frequency (Hz) per frame
 */
export function spectral_rolloff(
  y,
  sr = 22050,
  hop_length = 512,
  n_fft = 2048,
  roll_percent = 0.85,
) {
  return featureRolloff(y, { sr, hop_length, n_fft, roll_percent })
}

/**
 * Spectral contrast (librosa-parity via feature/spectral.js).
 * @returns {Array<Float64Array>} [n_bands + 1][n_frames]
 */
export function spectral_contrast(
  y,
  sr = 22050,
  hop_length = 512,
  n_fft = 2048,
  n_bands = 6,
) {
  return featureContrast(y, { sr, hop_length, n_fft, n_bands })
}

/**
 * Normalize features using various methods
 * @param {Array} features - Feature matrix (n_features x n_frames)
 * @param {string} norm - Normalization type ('l1', 'l2', 'max', 'minmax')
 * @param {number} axis - Axis to normalize along (0=features, 1=time)
 * @returns {Array} Normalized features
 */
export function normalize_features(features, norm = 'l2', axis = 0) {
  const n_features = features.length
  const n_frames = features[0].length

  if (norm === 'l2') {
    // L2 normalization
    if (axis === 0) {
      // Normalize each feature across time
      return features.map((feature) => {
        const sum_sq = feature.reduce((acc, val) => acc + val * val, 0)
        const norm_val = Math.sqrt(sum_sq)
        return norm_val > 0 ? feature.map((val) => val / norm_val) : feature
      })
    } else {
      // Normalize each frame across features
      const normalized = Array(n_features)
        .fill(null)
        .map(() => new Float32Array(n_frames))
      for (let t = 0; t < n_frames; t++) {
        let sum_sq = 0
        for (let f = 0; f < n_features; f++) {
          sum_sq += features[f][t] * features[f][t]
        }
        const norm_val = Math.sqrt(sum_sq)

        for (let f = 0; f < n_features; f++) {
          normalized[f][t] = norm_val > 0 ? features[f][t] / norm_val : 0
        }
      }
      return normalized
    }
  } else if (norm === 'l1') {
    // L1 normalization
    if (axis === 0) {
      return features.map((feature) => {
        const sum = feature.reduce((acc, val) => acc + Math.abs(val), 0)
        return sum > 0 ? feature.map((val) => val / sum) : feature
      })
    } else {
      const normalized = Array(n_features)
        .fill(null)
        .map(() => new Float32Array(n_frames))
      for (let t = 0; t < n_frames; t++) {
        let sum = 0
        for (let f = 0; f < n_features; f++) {
          sum += Math.abs(features[f][t])
        }

        for (let f = 0; f < n_features; f++) {
          normalized[f][t] = sum > 0 ? features[f][t] / sum : 0
        }
      }
      return normalized
    }
  } else if (norm === 'max') {
    // Max normalization
    let max_val = 0
    for (const feature of features) {
      for (const val of feature) max_val = Math.max(max_val, Math.abs(val))
    }
    return features.map((feature) =>
      feature.map((val) => (max_val > 0 ? val / max_val : 0)),
    )
  } else if (norm === 'minmax') {
    // Min-max normalization (0-1 scaling)
    let min_val = Infinity
    let max_val = -Infinity
    for (const feature of features) {
      for (const val of feature) {
        if (val < min_val) min_val = val
        if (val > max_val) max_val = val
      }
    }
    const range = max_val - min_val

    return features.map((feature) =>
      feature.map((val) => (range > 0 ? (val - min_val) / range : 0)),
    )
  }

  return features
}

/**
 * Feature statistics computation
 * @param {Array} features - Feature matrix
 * @returns {Object} Feature statistics
 */
export function compute_feature_stats(features) {
  const n_features = features.length
  const n_frames = features[0].length

  const stats = {
    mean: new Array(n_features),
    std: new Array(n_features),
    min: new Array(n_features),
    max: new Array(n_features),
    median: new Array(n_features),
    skewness: new Array(n_features),
    kurtosis: new Array(n_features),
  }

  for (let f = 0; f < n_features; f++) {
    const feature = features[f]

    // Mean
    const mean = feature.reduce((a, b) => a + b, 0) / n_frames
    stats.mean[f] = mean

    // Standard deviation
    const variance =
      feature.reduce((acc, val) => acc + (val - mean) ** 2, 0) / n_frames
    stats.std[f] = Math.sqrt(variance)

    // Min and Max (loop, not spread: long frames overflow the arg stack)
    let mn = Infinity
    let mx = -Infinity
    for (const val of feature) {
      if (val < mn) mn = val
      if (val > mx) mx = val
    }
    stats.min[f] = mn
    stats.max[f] = mx

    // Median
    const sorted = Array.from(feature).sort((a, b) => a - b)
    stats.median[f] = sorted[Math.floor(n_frames / 2)]

    // Skewness (third moment)
    const skew =
      feature.reduce(
        (acc, val) => acc + Math.pow((val - mean) / stats.std[f], 3),
        0,
      ) / n_frames
    stats.skewness[f] = stats.std[f] > 0 ? skew : 0

    // Kurtosis (fourth moment)
    const kurt =
      feature.reduce(
        (acc, val) => acc + Math.pow((val - mean) / stats.std[f], 4),
        0,
      ) / n_frames
    stats.kurtosis[f] = stats.std[f] > 0 ? kurt - 3 : 0 // Excess kurtosis
  }

  return stats
}

/**
 * Apply moving average filter to features
 * @param {Array} features - Feature matrix
 * @param {number} window_size - Window size for smoothing
 * @returns {Array} Smoothed features
 */
export function smooth_features(features, window_size = 5) {
  const half_window = Math.floor(window_size / 2)

  return features.map((feature) => {
    const smoothed = new Float32Array(feature.length)

    for (let i = 0; i < feature.length; i++) {
      let sum = 0
      let count = 0

      for (
        let j = Math.max(0, i - half_window);
        j <= Math.min(feature.length - 1, i + half_window);
        j++
      ) {
        sum += feature[j]
        count++
      }

      smoothed[i] = count > 0 ? sum / count : 0
    }

    return smoothed
  })
}

/**
 * Polynomial detrending for features
 * @param {Array} feature - Single feature vector
 * @param {number} degree - Polynomial degree (only 1 is implemented)
 * @returns {Array} Detrended feature
 */
export function detrend_feature(feature, degree = 1) {
  const n = feature.length
  const x = Array.from({ length: n }, (_, i) => i)

  if (degree !== 1) {
    throw new Error(
      `detrend_feature: degree=${degree} is not implemented (linear only)`,
    )
  }

  const sumX = x.reduce((a, b) => a + b, 0)
  const sumY = feature.reduce((a, b) => a + b, 0)
  const sumXY = x.reduce((acc, xi, i) => acc + xi * feature[i], 0)
  const sumX2 = x.reduce((acc, xi) => acc + xi * xi, 0)

  const slope = (n * sumXY - sumX * sumY) / (n * sumX2 - sumX * sumX)
  const intercept = (sumY - slope * sumX) / n

  // Remove trend
  return feature.map((val, i) => val - (slope * i + intercept))
}

/**
 * Extract comprehensive audio features (now functional: the old version
 * died on require('./librosa-fft.js')).
 * @param {Float32Array} y - Audio signal
 * @param {number} sr - Sample rate
 * @returns {Object} Comprehensive feature set
 */
export function extract_comprehensive_features(y, sr = 22050) {
  const hop_length = 512
  const n_fft = 2048

  return {
    // Time-domain features
    zcr: zero_crossing_rate(y, n_fft, hop_length),
    rms: rms(y, n_fft, hop_length),

    // Spectral features
    spectral_centroid: spectral_centroid(y, sr, hop_length, n_fft),
    spectral_bandwidth: spectral_bandwidth(y, sr, hop_length, n_fft),
    spectral_rolloff: spectral_rolloff(y, sr, hop_length, n_fft),
    spectral_contrast: spectral_contrast(y, sr, hop_length, n_fft),

    // Summary statistics
    duration: y.length / sr,
    sample_rate: sr,
  }
}
