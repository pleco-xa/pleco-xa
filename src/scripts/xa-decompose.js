/**
 * Port of librosa.decompose
 * Source separation and signal decomposition
 * Librosa-compatible HPSS and decomposition utilities for JavaScript
 */

import { stft, istft } from './xa-fft.js'
import { softmask } from './xa-normalize.js'

/**
 * Harmonic-Percussive Source Separation (HPSS)
 * Port of librosa.decompose.hpss
 * @param {Float32Array} y - Audio time series (optional if S provided)
 * @param {Array} S - Pre-computed complex STFT [freq][time]
 * @param {number} kernel_size - Kernel size for median filtering [harmonic, percussive]
 * @param {number} power - Exponent for soft masking
 * @param {number} mask - Return masks instead of separated spectrograms
 * @param {number} margin - Margin size for soft/hard masking (1.0=soft, >1.0=hard)
 * @param {number} n_fft - FFT size
 * @param {number} hop_length - Hop length
 * @param {number} win_length - Window length
 * @param {string} window - Window type
 * @param {boolean} center - Center frames
 * @param {string} pad_mode - Padding mode
 * @returns {Object} {harmonic: Array, percussive: Array} - separated components
 */
export function hpss(
  y = null,
  S = null,
  kernel_size = [17, 17],
  power = 2.0,
  mask = false,
  margin = 1.0,
  n_fft = 2048,
  hop_length = 512,
  win_length = null,
  window = 'hann',
  center = true,
  pad_mode = 'constant',
) {
  let D

  // Compute STFT if not provided
  if (S !== null) {
    D = S
  } else if (y !== null) {
    D = stft(y, n_fft, hop_length, win_length, window, center, pad_mode)
  } else {
    throw new Error('Either y or S must be provided')
  }

  const n_freq = D.length
  const n_frames = D[0] ? D[0].length : 0

  // Compute magnitude spectrogram
  const mag = Array(n_freq)
    .fill(null)
    .map(() => new Float32Array(n_frames))

  for (let f = 0; f < n_freq; f++) {
    for (let t = 0; t < n_frames; t++) {
      const bin = D[f][t]
      mag[f][t] = Math.sqrt(bin.real * bin.real + bin.imag * bin.imag)
    }
  }

  // Apply power exponent
  let mag_power = mag
  if (power !== 1.0) {
    mag_power = mag.map((row) => row.map((val) => Math.pow(val, power)))
  }

  // Perform median filtering
  const [harmonic_kernel, percussive_kernel] = Array.isArray(kernel_size)
    ? kernel_size
    : [kernel_size, kernel_size]

  // Harmonic filter (horizontal - time direction)
  const harmonic_mag = median_filter(mag_power, [1, harmonic_kernel])

  // Percussive filter (vertical - frequency direction)
  const percussive_mag = median_filter(mag_power, [percussive_kernel, 1])

  // Create masks
  const h_mask = Array(n_freq)
    .fill(null)
    .map(() => new Float32Array(n_frames))
  const p_mask = Array(n_freq)
    .fill(null)
    .map(() => new Float32Array(n_frames))

  // Soft masking with margin
  for (let f = 0; f < n_freq; f++) {
    for (let t = 0; t < n_frames; t++) {
      const h = harmonic_mag[f][t]
      const p = percussive_mag[f][t]

      if (margin === 1.0) {
        // Soft mask (Wiener filter)
        const total = h + p
        if (total > 0) {
          h_mask[f][t] = h / total
          p_mask[f][t] = p / total
        } else {
          h_mask[f][t] = 0.5
          p_mask[f][t] = 0.5
        }
      } else {
        // Hard/soft mask with margin
        const ratio = h / (p + 1e-10)
        if (ratio > margin) {
          h_mask[f][t] = 1.0
          p_mask[f][t] = 0.0
        } else if (ratio < 1.0 / margin) {
          h_mask[f][t] = 0.0
          p_mask[f][t] = 1.0
        } else {
          // Soft transition
          h_mask[f][t] = h / (h + p)
          p_mask[f][t] = p / (h + p)
        }
      }
    }
  }

  // Return masks if requested
  if (mask) {
    return { harmonic: h_mask, percussive: p_mask }
  }

  // Apply masks to complex STFT
  const D_harmonic = Array(n_freq)
    .fill(null)
    .map(() => new Array(n_frames))
  const D_percussive = Array(n_freq)
    .fill(null)
    .map(() => new Array(n_frames))

  for (let f = 0; f < n_freq; f++) {
    for (let t = 0; t < n_frames; t++) {
      D_harmonic[f][t] = {
        real: D[f][t].real * h_mask[f][t],
        imag: D[f][t].imag * h_mask[f][t],
      }
      D_percussive[f][t] = {
        real: D[f][t].real * p_mask[f][t],
        imag: D[f][t].imag * p_mask[f][t],
      }
    }
  }

  // If input was time-domain, return time-domain
  if (y !== null && S === null) {
    const y_harmonic = istft(D_harmonic, hop_length, win_length, window, center, y.length)
    const y_percussive = istft(D_percussive, hop_length, win_length, window, center, y.length)
    return { harmonic: y_harmonic, percussive: y_percussive }
  }

  return { harmonic: D_harmonic, percussive: D_percussive }
}

/**
 * Median filtering for spectrograms
 * @param {Array} S - Input spectrogram [freq][time]
 * @param {Array} size - Kernel size [freq_size, time_size]
 * @returns {Array} Filtered spectrogram
 */
export function median_filter(S, size = [1, 1]) {
  const n_freq = S.length
  const n_frames = S[0] ? S[0].length : 0
  const [freq_size, time_size] = size

  const filtered = Array(n_freq)
    .fill(null)
    .map(() => new Float32Array(n_frames))

  const half_freq = Math.floor(freq_size / 2)
  const half_time = Math.floor(time_size / 2)

  for (let f = 0; f < n_freq; f++) {
    for (let t = 0; t < n_frames; t++) {
      const window = []

      // Collect values in kernel window
      for (let df = -half_freq; df <= half_freq; df++) {
        for (let dt = -half_time; dt <= half_time; dt++) {
          const ff = f + df
          const tt = t + dt

          if (ff >= 0 && ff < n_freq && tt >= 0 && tt < n_frames) {
            window.push(S[ff][tt])
          }
        }
      }

      // Compute median
      if (window.length > 0) {
        window.sort((a, b) => a - b)
        filtered[f][t] = window[Math.floor(window.length / 2)]
      }
    }
  }

  return filtered
}

/**
 * Nearest-neighbor filter (NNF) for audio enhancement
 * Port of librosa.decompose.nn_filter
 * @param {Array} S - Input spectrogram [freq][time]
 * @param {Array} aggregate - Aggregation function (median, mean, max, min)
 * @param {Array} metric - Distance metric (cosine, euclidean, cityblock)
 * @param {number} width - Temporal context window width
 * @param {boolean} sparse - Use sparse filtering (not implemented)
 * @returns {Array} Filtered spectrogram
 */
export function nn_filter(
  S,
  aggregate = 'median',
  metric = 'cosine',
  width = 9,
  sparse = false,
) {
  const n_freq = S.length
  const n_frames = S[0] ? S[0].length : 0

  const filtered = Array(n_freq)
    .fill(null)
    .map(() => new Float32Array(n_frames))

  const half_width = Math.floor(width / 2)

  for (let t = 0; t < n_frames; t++) {
    // Extract current frame
    const frame = S.map((row) => row[t])

    // Collect context frames
    const context_frames = []
    for (let dt = -half_width; dt <= half_width; dt++) {
      const tt = t + dt
      if (tt >= 0 && tt < n_frames && tt !== t) {
        context_frames.push(S.map((row) => row[tt]))
      }
    }

    if (context_frames.length === 0) {
      // No context, copy input
      for (let f = 0; f < n_freq; f++) {
        filtered[f][t] = S[f][t]
      }
      continue
    }

    // Compute distances to context frames
    const distances = context_frames.map((ctx) =>
      compute_distance(frame, ctx, metric),
    )

    // Find nearest neighbors (sort by distance)
    const sorted_indices = distances
      .map((d, i) => ({ dist: d, idx: i }))
      .sort((a, b) => a.dist - b.dist)

    // Aggregate nearest neighbors
    const k = Math.max(1, Math.floor(context_frames.length / 2))
    const neighbors = sorted_indices
      .slice(0, k)
      .map((item) => context_frames[item.idx])

    // Apply aggregation
    for (let f = 0; f < n_freq; f++) {
      const values = neighbors.map((n) => n[f])
      filtered[f][t] = apply_aggregate(values, aggregate)
    }
  }

  return filtered
}

/**
 * Compute distance between two frames
 * @param {Array} a - First frame
 * @param {Array} b - Second frame
 * @param {string} metric - Distance metric
 * @returns {number} Distance value
 */
function compute_distance(a, b, metric) {
  if (a.length !== b.length) {
    throw new Error('Frame lengths must match')
  }

  if (metric === 'cosine') {
    let dot = 0
    let norm_a = 0
    let norm_b = 0

    for (let i = 0; i < a.length; i++) {
      dot += a[i] * b[i]
      norm_a += a[i] * a[i]
      norm_b += b[i] * b[i]
    }

    const denom = Math.sqrt(norm_a * norm_b)
    if (denom === 0) return 1.0
    return 1.0 - dot / denom
  } else if (metric === 'euclidean') {
    let sum = 0
    for (let i = 0; i < a.length; i++) {
      const diff = a[i] - b[i]
      sum += diff * diff
    }
    return Math.sqrt(sum)
  } else if (metric === 'cityblock' || metric === 'manhattan') {
    let sum = 0
    for (let i = 0; i < a.length; i++) {
      sum += Math.abs(a[i] - b[i])
    }
    return sum
  }

  throw new Error(`Unknown metric: ${metric}`)
}

/**
 * Apply aggregation function to values
 * @param {Array} values - Input values
 * @param {string} aggregate - Aggregation type
 * @returns {number} Aggregated value
 */
function apply_aggregate(values, aggregate) {
  if (values.length === 0) return 0

  if (aggregate === 'median') {
    const sorted = [...values].sort((a, b) => a - b)
    return sorted[Math.floor(sorted.length / 2)]
  } else if (aggregate === 'mean') {
    return values.reduce((a, b) => a + b, 0) / values.length
  } else if (aggregate === 'max') {
    return Math.max(...values)
  } else if (aggregate === 'min') {
    return Math.min(...values)
  }

  throw new Error(`Unknown aggregate: ${aggregate}`)
}

/**
 * Decompose a feature matrix into components
 * Port of librosa.decompose.decompose (simplified NMF)
 * @param {Array} S - Input spectrogram [freq][time]
 * @param {number} n_components - Number of components
 * @param {string} transformer - Decomposition method (nmf, pca, ica)
 * @param {number} max_iter - Maximum iterations
 * @param {number} random_state - Random seed
 * @returns {Object} {components: Array, activations: Array}
 */
export function decompose(
  S,
  n_components = null,
  transformer = 'nmf',
  max_iter = 200,
  random_state = null,
) {
  const n_freq = S.length
  const n_frames = S[0] ? S[0].length : 0

  if (n_components === null) {
    n_components = Math.min(n_freq, n_frames)
  }

  if (transformer === 'nmf') {
    return nmf(S, n_components, max_iter, random_state)
  }

  throw new Error(`Unsupported transformer: ${transformer}. Only 'nmf' is currently implemented.`)
}

/**
 * Non-negative Matrix Factorization (NMF)
 * Simplified implementation
 * @param {Array} V - Input matrix [freq][time]
 * @param {number} k - Number of components
 * @param {number} max_iter - Maximum iterations
 * @param {number} random_state - Random seed (not used in simplified version)
 * @returns {Object} {components: W, activations: H}
 */
function nmf(V, k, max_iter = 200, random_state = null) {
  const n_freq = V.length
  const n_frames = V[0] ? V[0].length : 0

  // Initialize W and H with random values
  const W = Array(n_freq)
    .fill(null)
    .map(() =>
      new Float32Array(k).map(() => Math.random())
    )

  const H = Array(k)
    .fill(null)
    .map(() =>
      new Float32Array(n_frames).map(() => Math.random())
    )

  // Multiplicative update rules
  for (let iter = 0; iter < max_iter; iter++) {
    // Compute WH
    const WH = matmul(W, H)

    // Update H
    const WT = transpose(W)
    const WTV = matmul(WT, V)
    const WTWH = matmul(WT, WH)

    for (let i = 0; i < k; i++) {
      for (let j = 0; j < n_frames; j++) {
        if (WTWH[i][j] > 0) {
          H[i][j] *= WTV[i][j] / WTWH[i][j]
        }
      }
    }

    // Update W
    const HT = transpose(H)
    const VHT = matmul(V, HT)
    const WHHT = matmul(WH, HT)

    for (let i = 0; i < n_freq; i++) {
      for (let j = 0; j < k; j++) {
        if (WHHT[i][j] > 0) {
          W[i][j] *= VHT[i][j] / WHHT[i][j]
        }
      }
    }
  }

  return { components: W, activations: H }
}

/**
 * Matrix multiplication
 * @param {Array} A - First matrix
 * @param {Array} B - Second matrix
 * @returns {Array} Result matrix
 */
function matmul(A, B) {
  const m = A.length
  const n = B[0] ? B[0].length : 0
  const p = B.length

  if (A[0].length !== p) {
    throw new Error('Matrix dimensions incompatible for multiplication')
  }

  const C = Array(m)
    .fill(null)
    .map(() => new Float32Array(n))

  for (let i = 0; i < m; i++) {
    for (let j = 0; j < n; j++) {
      let sum = 0
      for (let k = 0; k < p; k++) {
        sum += A[i][k] * B[k][j]
      }
      C[i][j] = sum
    }
  }

  return C
}

/**
 * Matrix transpose
 * @param {Array} A - Input matrix
 * @returns {Array} Transposed matrix
 */
function transpose(A) {
  const m = A.length
  const n = A[0] ? A[0].length : 0

  const AT = Array(n)
    .fill(null)
    .map(() => new Float32Array(m))

  for (let i = 0; i < m; i++) {
    for (let j = 0; j < n; j++) {
      AT[j][i] = A[i][j]
    }
  }

  return AT
}

/**
 * Reconstruct signal from NMF components
 * @param {Array} components - W matrix [freq][k]
 * @param {Array} activations - H matrix [k][time]
 * @returns {Array} Reconstructed spectrogram [freq][time]
 */
export function nmf_reconstruct(components, activations) {
  return matmul(components, activations)
}

/**
 * Separate sources using NMF
 * @param {Array} S - Input spectrogram [freq][time]
 * @param {number} n_sources - Number of sources
 * @param {number} max_iter - Maximum NMF iterations
 * @returns {Array} Array of separated source spectrograms
 */
export function nmf_separate(S, n_sources = 2, max_iter = 200) {
  // Decompose into components
  const { components, activations } = nmf(S, n_sources, max_iter)

  // Separate sources (each component is a source)
  const sources = []

  for (let src = 0; src < n_sources; src++) {
    // Create single-component matrices
    const W_src = components.map((row) => [row[src]])
    const H_src = [activations[src]]

    // Reconstruct this source
    const S_src = matmul(W_src, H_src)
    sources.push(S_src)
  }

  return sources
}

/**
 * Nearest-neighbor filter helper function
 * Private helper from librosa.decompose.__nn_filter_helper
 *
 * Internal implementation for sparse nearest-neighbor filtering.
 * Uses sparse matrix representation for efficient filtering.
 *
 * @private
 * @param {Array} R_data - Non-zero values from sparse recurrence matrix
 * @param {Array} R_indices - Column indices for non-zero values
 * @param {Array} R_ptr - Row pointer array for CSR format
 * @param {Array} S - Input spectrogram or feature matrix
 * @param {Function} aggregate - Aggregation function (e.g., Math.max, values => values.reduce((a,b) => a+b)/values.length)
 * @returns {Array} Filtered output
 */
export function __nn_filter_helper(R_data, R_indices, R_ptr, S, aggregate) {
  const n_frames = S.length
  const n_features = S[0] ? S[0].length : 0
  const output = Array.from({ length: n_frames }, () => new Float32Array(n_features))

  // Iterate over each frame
  for (let i = 0; i < n_frames; i++) {
    const row_start = R_ptr[i]
    const row_end = R_ptr[i + 1]

    // Collect neighbor frames
    const neighbors = []
    for (let j = row_start; j < row_end; j++) {
      const neighbor_idx = R_indices[j]
      neighbors.push(S[neighbor_idx])
    }

    // Aggregate over neighbors for each feature
    if (neighbors.length > 0) {
      for (let f = 0; f < n_features; f++) {
        const values = neighbors.map(n => n[f])
        output[i][f] = aggregate(values)
      }
    }
  }

  return output
}
