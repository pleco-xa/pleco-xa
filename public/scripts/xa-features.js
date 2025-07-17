/**
 * Librosa-style feature extraction and normalization for JavaScript
 * Audio feature computation and processing utilities
 */

/**
 * Zero Crossing Rate - measure of signal changes
 * @param {Float32Array} y - Audio signal
 * @param {number} frame_length - Frame size
 * @param {number} hop_length - Hop size
 * @param {boolean} center - Whether to center frames
 * @returns {Array} Zero crossing rate per frame
 */
export function zero_crossing_rate(
  y,
  frame_length = 2048,
  hop_length = 512,
  _center = true,
) {
  const zcr = []

  for (let i = 0; i <= y.length - frame_length; i += hop_length) {
    const frame = y.slice(i, i + frame_length)
    let crossings = 0

    for (let j = 1; j < frame.length; j++) {
      if (
        (frame[j] >= 0 && frame[j - 1] < 0) ||
        (frame[j] < 0 && frame[j - 1] >= 0)
      ) {
        crossings++
      }
    }

    zcr.push(crossings / frame_length)
  }

  return zcr
}

/**
 * RMS Energy - root mean square energy of signal
 * @param {Float32Array} y - Audio signal
 * @param {number} frame_length - Frame size
 * @param {number} hop_length - Hop size
 * @param {boolean} center - Whether to center frames
 * @returns {Array} RMS energy per frame
 */
export function rms(y, frame_length = 2048, hop_length = 512, _center = true) {
  const rms_values = []

  for (let i = 0; i <= y.length - frame_length; i += hop_length) {
    const frame = y.slice(i, i + frame_length)
    const sum = frame.reduce((acc, val) => acc + val * val, 0)
    rms_values.push(Math.sqrt(sum / frame_length))
  }

  return rms_values
}

/**
 * Spectral Centroid - brightness of sound
 * @param {Float32Array} y - Audio signal
 * @param {number} sr - Sample rate
 * @param {number} hop_length - Hop length
 * @param {number} n_fft - FFT size
 * @returns {Array} Spectral centroid per frame
 */
export function spectral_centroid(
  y,
  sr = 22050,
  hop_length = 512,
  n_fft = 2048,
) {
  // Import STFT functions
  const { stft, magnitude, fft_frequencies } = require('./librosa-fft.js')

  // Compute magnitude spectrogram
  const stft_matrix = stft(y, n_fft, hop_length)
  const mag_spec = stft_matrix.map((frame) => magnitude(frame))

  // Get frequency bins
  const freqs = fft_frequencies(sr, n_fft)

  // Compute centroid for each frame
  const centroids = []

  for (let t = 0; t < mag_spec.length; t++) {
    let weighted_sum = 0
    let magnitude_sum = 0

    for (let f = 0; f < mag_spec[t].length; f++) {
      weighted_sum += freqs[f] * mag_spec[t][f]
      magnitude_sum += mag_spec[t][f]
    }

    const centroid = magnitude_sum > 0 ? weighted_sum / magnitude_sum : 0
    centroids.push(centroid)
  }

  return centroids
}

/**
 * Spectral Bandwidth - spread of frequencies
 * @param {Float32Array} y - Audio signal
 * @param {number} sr - Sample rate
 * @param {number} hop_length - Hop length
 * @param {number} n_fft - FFT size
 * @param {number} p - Norm order (default 2)
 * @returns {Array} Spectral bandwidth per frame
 */
export function spectral_bandwidth(
  y,
  sr = 22050,
  hop_length = 512,
  n_fft = 2048,
  p = 2,
) {
  const { stft, magnitude, fft_frequencies } = require('./librosa-fft.js')

  // Compute magnitude spectrogram
  const stft_matrix = stft(y, n_fft, hop_length)
  const mag_spec = stft_matrix.map((frame) => magnitude(frame))

  // Get frequency bins
  const freqs = fft_frequencies(sr, n_fft)

  // Compute centroid first
  const centroids = spectral_centroid(y, sr, hop_length, n_fft)

  // Compute bandwidth
  const bandwidths = []

  for (let t = 0; t < mag_spec.length; t++) {
    let weighted_deviation = 0
    let magnitude_sum = 0
    const centroid = centroids[t]

    for (let f = 0; f < mag_spec[t].length; f++) {
      const deviation = Math.abs(freqs[f] - centroid)
      weighted_deviation += Math.pow(deviation, p) * mag_spec[t][f]
      magnitude_sum += mag_spec[t][f]
    }

    const bandwidth =
      magnitude_sum > 0
        ? Math.pow(weighted_deviation / magnitude_sum, 1 / p)
        : 0
    bandwidths.push(bandwidth)
  }

  return bandwidths
}

/**
 * Spectral Rolloff - frequency below which X% of energy is contained
 * @param {Float32Array} y - Audio signal
 * @param {number} sr - Sample rate
 * @param {number} hop_length - Hop length
 * @param {number} n_fft - FFT size
 * @param {number} roll_percent - Rolloff percentage (0-1)
 * @returns {Array} Spectral rolloff per frame
 */
export function spectral_rolloff(
  y,
  sr = 22050,
  hop_length = 512,
  n_fft = 2048,
  roll_percent = 0.85,
) {
  const { stft, magnitude, fft_frequencies } = require('./librosa-fft.js')

  // Compute power spectrogram
  const stft_matrix = stft(y, n_fft, hop_length)
  const power_spec = stft_matrix.map((frame) => {
    const mag = magnitude(frame)
    return mag.map((m) => m * m)
  })

  // Get frequency bins
  const freqs = fft_frequencies(sr, n_fft)

  // Compute rolloff for each frame
  const rolloffs = []

  for (let t = 0; t < power_spec.length; t++) {
    const total_energy = power_spec[t].reduce((a, b) => a + b, 0)
    const threshold = total_energy * roll_percent

    let cumulative_energy = 0
    let rolloff_freq = 0

    for (let f = 0; f < power_spec[t].length; f++) {
      cumulative_energy += power_spec[t][f]
      if (cumulative_energy >= threshold) {
        rolloff_freq = freqs[f]
        break
      }
    }

    rolloffs.push(rolloff_freq)
  }

  return rolloffs
}

/**
 * Spectral Contrast - difference between peaks and valleys in spectrum
 * @param {Float32Array} y - Audio signal
 * @param {number} sr - Sample rate
 * @param {number} hop_length - Hop length
 * @param {number} n_fft - FFT size
 * @param {number} n_bands - Number of frequency bands
 * @returns {Array} Spectral contrast matrix (n_bands x n_frames)
 */
export function spectral_contrast(
  y,
  sr = 22050,
  hop_length = 512,
  n_fft = 2048,
  n_bands = 6,
) {
  const { stft, magnitude } = require('./librosa-fft.js')

  // Compute magnitude spectrogram
  const stft_matrix = stft(y, n_fft, hop_length)
  const mag_spec = stft_matrix.map((frame) => magnitude(frame))

  // Define frequency bands (octave-based)
  const fmin = 200 // Start from 200 Hz
  const band_edges = []
  for (let i = 0; i <= n_bands; i++) {
    band_edges.push(fmin * Math.pow(2, i))
  }

  // Convert to bin indices
  const bin_edges = band_edges.map((freq) =>
    Math.min(Math.floor((freq * n_fft) / sr), mag_spec[0].length - 1),
  )

  // Compute contrast for each frame and band
  const n_frames = mag_spec.length
  const contrast = Array(n_bands)
    .fill(null)
    .map(() => new Float32Array(n_frames))

  for (let t = 0; t < n_frames; t++) {
    for (let b = 0; b < n_bands; b++) {
      const start_bin = bin_edges[b]
      const end_bin = bin_edges[b + 1]

      if (start_bin < end_bin) {
        const band_spec = mag_spec[t].slice(start_bin, end_bin)

        // Sort to find peaks and valleys
        const sorted = [...band_spec].sort((a, b) => a - b)
        const valley = sorted[Math.floor(sorted.length * 0.1)] // 10th percentile
        const peak = sorted[Math.floor(sorted.length * 0.9)] // 90th percentile

        contrast[b][t] =
          peak > 0
            ? Math.log(Math.max(peak, 1e-10) / Math.max(valley, 1e-10))
            : 0
      }
    }
  }

  return contrast
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
    const max_val = Math.max(...features.flat().map(Math.abs))
    return features.map((feature) =>
      feature.map((val) => (max_val > 0 ? val / max_val : 0)),
    )
  } else if (norm === 'minmax') {
    // Min-max normalization (0-1 scaling)
    const flat_values = features.flat()
    const min_val = Math.min(...flat_values)
    const max_val = Math.max(...flat_values)
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

    // Min and Max
    stats.min[f] = Math.min(...feature)
    stats.max[f] = Math.max(...feature)

    // Median
    const sorted = [...feature].sort((a, b) => a - b)
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
 * @param {number} degree - Polynomial degree
 * @returns {Array} Detrended feature
 */
export function detrend_feature(feature, degree = 1) {
  const n = feature.length
  const x = Array.from({ length: n }, (_, i) => i)

  // Fit polynomial (simplified for linear case)
  if (degree === 1) {
    const sumX = x.reduce((a, b) => a + b, 0)
    const sumY = feature.reduce((a, b) => a + b, 0)
    const sumXY = x.reduce((acc, xi, i) => acc + xi * feature[i], 0)
    const sumX2 = x.reduce((acc, xi) => acc + xi * xi, 0)

    const slope = (n * sumXY - sumX * sumY) / (n * sumX2 - sumX * sumX)
    const intercept = (sumY - slope * sumX) / n

    // Remove trend
    return feature.map((val, i) => val - (slope * i + intercept))
  }

  // For higher degrees, return original (would need full polynomial fitting)
  return feature
}

/**
 * Extract comprehensive audio features
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
