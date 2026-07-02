/**
 * Librosa Temporal Segmentation Module
 * Web-ready JavaScript implementation of temporal analysis functions
 *
 * Provides tools for:
 * - Cross-similarity matrix computation
 * - Recurrence matrix analysis
 * - Audio segmentation and clustering
 * - Path enhancement for tempo-varying music
 *
 * @author Pleco-XA Audio Analysis Suite
 * @version 1.0.0
 */

import { debugLog } from './debug.js'

/**
 * Custom error class for parameter validation
 */
class ParameterError extends Error {
  constructor(message) {
    super(message)
    this.name = 'ParameterError'
  }
}

/**
 * Compute cross-similarity matrix between feature matrices
 * @param {Float32Array} data - Feature matrix [d x n]
 * @param {Float32Array} dataRef - Reference feature matrix [d x n_ref]
 * @param {Object} options - Configuration options
 * @param {number|null} options.k - Number of nearest neighbors (auto if null)
 * @param {string} options.metric - Distance metric ('euclidean', 'cosine')
 * @param {boolean} options.sparse - Return sparse matrix format
 * @param {string} options.mode - Output mode ('connectivity', 'distance', 'affinity')
 * @param {number|null} options.bandwidth - Bandwidth for affinity mode
 * @returns {Float32Array|Object} Cross-similarity matrix
 */
export function crossSimilarity(data, dataRef, options = {}) {
  const {
    k = null,
    metric = 'euclidean',
    sparse = false,
    mode = 'connectivity',
    bandwidth = null,
  } = options

  // Validate inputs
  if (!data || !dataRef) {
    throw new ParameterError('Both data and dataRef must be provided')
  }

  // Get dimensions
  const n = Math.floor(data.length / (data.length / data.length))
  const nRef = Math.floor(dataRef.length / (dataRef.length / dataRef.length))

  // Default k value
  const kVal = k || Math.min(nRef, 2 * Math.ceil(Math.sqrt(nRef)))

  // Compute pairwise distances
  const distances = _computeDistances(data, dataRef, metric)

  // Find k-nearest neighbors
  const knn = _kNearestNeighbors(distances, kVal)

  // Apply mode transformations
  let result = knn
  if (mode === 'distance') {
    // Keep distances as-is
    result = knn
  } else if (mode === 'affinity') {
    // Convert distances to affinities
    const bw = _estimateBandwidth(distances, bandwidth, kVal)
    result = _distanceToAffinity(knn, bw)
  }

  // Return sparse format if requested
  if (sparse) {
    return _toSparseMatrix(result)
  }

  return result
}

/**
 * Compute recurrence matrix for self-similarity analysis
 * @param {Float32Array} data - Feature matrix
 * @param {Object} options - Configuration options
 * @param {number|null} options.k - Number of nearest neighbors
 * @param {number} options.width - Diagonal exclusion width
 * @param {string} options.metric - Distance metric
 * @param {boolean} options.sym - Symmetrize matrix
 * @param {boolean} options.sparse - Return sparse format
 * @param {string} options.mode - Output mode
 * @param {number|null} options.bandwidth - Bandwidth for affinity
 * @param {boolean} options.self - Include self-connections
 * @param {number} options.axis - Feature axis
 * @returns {Float32Array|Object} Recurrence matrix
 */
export function recurrenceMatrix(data, options = {}) {
  const {
    k = null,
    width = 1,
    metric = 'euclidean',
    sym = false,
    sparse = false,
    mode = 'connectivity',
    bandwidth = null,
    self = false,
    axis = -1,
  } = options

  // Validate input
  if (!data) {
    throw new ParameterError('Data matrix must be provided')
  }

  // Get dimensions
  const t = Math.floor(data.length / (data.length / data.length))

  // Default k value
  const kVal = k || Math.min(t - 1, 2 * Math.ceil(Math.sqrt(t - 2 * width + 1)))

  // Compute self-distances
  const distances = _computeDistances(data, data, metric)

  // Remove diagonal band to exclude trivial self-matches
  for (let diag = -width + 1; diag < width; diag++) {
    _setDiagonal(distances, Infinity, diag)
  }

  // Find k-nearest neighbors
  let rec = _kNearestNeighbors(distances, kVal)

  // Set self-connections if requested
  if (self) {
    const selfValue = mode === 'distance' ? 0 : 1
    _setDiagonal(rec, selfValue, 0)
  }

  // Symmetrize if requested
  if (sym) {
    rec = _symmetrize(rec)
  }

  // Apply mode transformations
  if (mode === 'affinity') {
    const bw = _estimateBandwidth(distances, bandwidth, kVal)
    rec = _distanceToAffinity(rec, bw)
  }

  if (sparse) {
    return _toSparseMatrix(rec)
  }

  return rec
}

/**
 * Convert recurrence matrix to lag matrix representation
 * @param {Float32Array|Object} rec - Recurrence matrix
 * @param {boolean} pad - Whether to pad the matrix
 * @param {number} axis - Axis for transformation
 * @returns {Float32Array|Object} Lag matrix
 */
export function recurrenceToLag(rec, pad = true, axis = -1) {
  const isSparse = rec.sparse !== undefined
  const n = Math.sqrt(rec.length || rec.data?.length || 0)

  let matrix = rec

  if (pad) {
    // Pad the matrix for lag representation
    if (isSparse) {
      matrix = _padSparseMatrix(rec, n)
    } else {
      matrix = _padMatrix(rec, n)
    }
  }

  // Apply shear transformation to convert to lag coordinates
  return _shear(matrix, -1, axis)
}

/**
 * Convert lag matrix back to recurrence matrix
 * @param {Float32Array|Object} lag - Lag matrix
 * @param {number} axis - Axis for transformation
 * @returns {Float32Array|Object} Recurrence matrix
 */
export function lagToRecurrence(lag, axis = -1) {
  // Apply inverse shear transformation
  const rec = _shear(lag, 1, axis)

  // Extract the appropriate slice to get original dimensions
  const n = Math.floor(Math.sqrt(lag.length || lag.data?.length || 0))
  return _sliceMatrix(rec, n)
}

/**
 * Alias helpers using the original Python-style snake_case names so that
 * JS ports copied verbatim from librosa can do:
 *   import { recurrence_to_lag, lag_to_recurrence } from './librosa-temporal.js';
 * without failing.
 *
 * They simply call the camelCase versions above.
 */

export function recurrence_to_lag(rec, pad = true, axis = -1) {
  return recurrenceToLag(rec, pad, axis)
}

export function lag_to_recurrence(lag, axis = -1) {
  return lagToRecurrence(lag, axis)
}

/**
 * Apply temporal clustering using agglomerative clustering
 * @param {Float32Array} data - Data matrix to cluster
 * @param {number} k - Number of segments/clusters
 * @param {Object} options - Clustering options
 * @param {number} options.axis - Feature axis
 * @param {string} options.linkage - Linkage criterion
 * @returns {Uint32Array} Segment boundary indices
 */
export function agglomerative(data, k, options = {}) {
  const { axis: _axis = -1, linkage = 'ward' } = options

  if (!data || k <= 0) {
    throw new ParameterError('Valid data and positive k required')
  }

  // Get data dimensions
  const n = Math.floor(data.length / (data.length / data.length))

  if (k >= n) {
    // Return all frame boundaries
    return new Uint32Array(Array.from({ length: n }, (_, i) => i))
  }

  // Initialize clusters (each point is its own cluster)
  let clusters = Array.from({ length: n }, (_, i) => [i])

  // Compute initial pairwise distances between adjacent segments
  const distances = new Float32Array(n - 1)
  for (let i = 0; i < n - 1; i++) {
    distances[i] = _clusterDistance(data, [i], [i + 1], linkage)
  }

  // Merge clusters until we have k segments
  while (clusters.length > k) {
    // Find minimum distance
    let minDist = Infinity
    let minIdx = -1

    for (let i = 0; i < distances.length; i++) {
      if (distances[i] >= 0 && distances[i] < minDist) {
        minDist = distances[i]
        minIdx = i
      }
    }

    if (minIdx === -1) break // No more valid merges

    // Merge clusters at minIdx
    const mergedCluster = clusters[minIdx].concat(clusters[minIdx + 1])
    clusters[minIdx] = mergedCluster
    clusters.splice(minIdx + 1, 1)

    // Mark this distance as invalid
    distances[minIdx] = -1

    // Update distances for adjacent clusters
    if (minIdx > 0 && clusters[minIdx - 1]) {
      distances[minIdx - 1] = _clusterDistance(
        data,
        clusters[minIdx - 1],
        clusters[minIdx],
        linkage,
      )
    }
    if (minIdx < clusters.length - 1 && clusters[minIdx + 1]) {
      if (minIdx < distances.length) {
        distances[minIdx] = _clusterDistance(
          data,
          clusters[minIdx],
          clusters[minIdx + 1],
          linkage,
        )
      }
    }

    // Remove invalid distance entries
    distances.splice(minIdx + 1, 1)
  }

  // Extract segment boundaries
  const boundaries = [0]
  let cumSum = 0
  for (let i = 0; i < clusters.length - 1; i++) {
    cumSum += clusters[i].length
    boundaries.push(cumSum)
  }

  return new Uint32Array(boundaries)
}

/**
 * Multi-angle path enhancement for tempo-varying music
 * @param {Float32Array} R - Similarity matrix
 * @param {number} [n] - Filter length (optional)
 * @param {Object} options - Enhancement options
 * @param {string} options.window - Window function type
 * @param {number} options.maxRatio - Maximum tempo ratio
 * @param {number|null} options.minRatio - Minimum tempo ratio
 * @param {number} options.nFilters - Number of diagonal filters
 * @param {boolean} options.zeroMean - Zero-mean filters
 * @param {boolean} options.clip - Clip negative values
 * @returns {Float32Array} Enhanced similarity matrix
 */
// `n` (filter length) is now optional. If omitted, we use
// 1/8 of the matrix size (clamped to [32, 256]).
export function pathEnhance(R, n = null, options = {}) {
  const {
    window = 'hann',
    maxRatio = 2.0,
    minRatio = null,
    nFilters = 7,
    zeroMean = false,
    clip = true,
  } = options

  // If caller didn't supply n, pick a heuristic based on matrix size
  if (n == null) {
    const sizeGuess = Math.round(Math.sqrt(R.length))
    n = Math.min(256, Math.max(32, Math.floor(sizeGuess / 8)))
  }

  if (!R || n <= 0) {
    throw new ParameterError('Valid similarity matrix required')
  }

  const minR = minRatio || 1.0 / maxRatio
  const size = Math.sqrt(R.length)
  let RSmooth = null

  // Generate tempo ratios for diagonal filters
  const ratios = _logspace(Math.log2(minR), Math.log2(maxRatio), nFilters)

  // Apply filters at different tempo ratios
  for (const ratio of ratios) {
    // Create diagonal filter for this tempo ratio
    const kernel = _diagonalFilter(window, n, ratio, zeroMean)

    // Convolve with similarity matrix
    const filtered = _convolve2d(R, kernel, size)

    if (RSmooth === null) {
      RSmooth = new Float32Array(filtered)
    } else {
      // Element-wise maximum to combine filter responses
      for (let i = 0; i < RSmooth.length; i++) {
        RSmooth[i] = Math.max(RSmooth[i], filtered[i])
      }
    }
  }

  // Clip negative values if requested
  if (clip && RSmooth) {
    for (let i = 0; i < RSmooth.length; i++) {
      RSmooth[i] = Math.max(0, RSmooth[i])
    }
  }

  return RSmooth || new Float32Array(R.length)
}

// ============= Private Helper Functions =============

/**
 * Compute pairwise distances between feature matrices
 * @private
 */
function _computeDistances(data1, data2, metric = 'euclidean') {
  const n1 = Math.floor(data1.length / (data1.length / data1.length))
  const n2 = Math.floor(data2.length / (data2.length / data2.length))
  const d = data1.length / n1

  const distances = new Float32Array(n1 * n2)

  for (let i = 0; i < n1; i++) {
    for (let j = 0; j < n2; j++) {
      const idx = i * n2 + j

      if (metric === 'euclidean') {
        let sum = 0
        for (let k = 0; k < d; k++) {
          const diff = data1[i * d + k] - data2[j * d + k]
          sum += diff * diff
        }
        distances[idx] = Math.sqrt(sum)
      } else if (metric === 'cosine') {
        let dot = 0,
          norm1 = 0,
          norm2 = 0
        for (let k = 0; k < d; k++) {
          const v1 = data1[i * d + k]
          const v2 = data2[j * d + k]
          dot += v1 * v2
          norm1 += v1 * v1
          norm2 += v2 * v2
        }
        const cosine = dot / (Math.sqrt(norm1) * Math.sqrt(norm2))
        distances[idx] = 1 - Math.max(-1, Math.min(1, cosine))
      } else {
        throw new ParameterError(`Unsupported metric: ${metric}`)
      }
    }
  }

  return distances
}

/**
 * Find k-nearest neighbors from distance matrix
 * @private
 */
function _kNearestNeighbors(distances, k) {
  const n = Math.sqrt(distances.length)
  const result = new Float32Array(distances.length)

  for (let i = 0; i < n; i++) {
    // Get distances for row i
    const rowDistances = []
    for (let j = 0; j < n; j++) {
      rowDistances.push({ index: j, distance: distances[i * n + j] })
    }

    // Sort by distance and take k nearest
    rowDistances.sort((a, b) => a.distance - b.distance)

    // Set k nearest neighbors
    for (let j = 0; j < Math.min(k, rowDistances.length); j++) {
      const neighbor = rowDistances[j]
      result[i * n + neighbor.index] = neighbor.distance
    }
  }

  return result
}

/**
 * Set diagonal values in a matrix
 * @private
 */
function _setDiagonal(matrix, value, offset = 0) {
  const n = Math.sqrt(matrix.length)

  for (let i = 0; i < n; i++) {
    const j = i + offset
    if (j >= 0 && j < n) {
      matrix[i * n + j] = value
    }
  }
}

/**
 * Symmetrize a matrix
 * @private
 */
function _symmetrize(matrix) {
  const n = Math.sqrt(matrix.length)
  const result = new Float32Array(matrix.length)

  for (let i = 0; i < n; i++) {
    for (let j = 0; j < n; j++) {
      const val = Math.max(matrix[i * n + j], matrix[j * n + i])
      result[i * n + j] = val
    }
  }

  return result
}

/**
 * Estimate bandwidth for affinity transformation
 * @private
 */
function _estimateBandwidth(distances, bandwidth, k) {
  if (bandwidth !== null) return bandwidth

  // Use median of k-th nearest neighbor distances
  const n = Math.sqrt(distances.length)
  const kthDistances = []

  for (let i = 0; i < n; i++) {
    const row = []
    for (let j = 0; j < n; j++) {
      if (distances[i * n + j] > 0) {
        row.push(distances[i * n + j])
      }
    }
    row.sort((a, b) => a - b)
    if (row.length > k) {
      kthDistances.push(row[k - 1])
    }
  }

  kthDistances.sort((a, b) => a - b)
  const median = kthDistances[Math.floor(kthDistances.length / 2)] || 1.0

  return median
}

/**
 * Convert distances to affinities using Gaussian kernel
 * @private
 */
function _distanceToAffinity(distances, bandwidth) {
  const result = new Float32Array(distances.length)
  const gamma = 1.0 / (2 * bandwidth * bandwidth)

  for (let i = 0; i < distances.length; i++) {
    if (distances[i] > 0) {
      result[i] = Math.exp(-gamma * distances[i] * distances[i])
    }
  }

  return result
}

/**
 * Compute distance between clusters
 * @private
 */
function _clusterDistance(data, cluster1, cluster2, linkage = 'ward') {
  const d = data.length / Math.floor(data.length / (data.length / data.length))

  if (linkage === 'single') {
    // Minimum distance between any two points
    let minDist = Infinity
    for (const i of cluster1) {
      for (const j of cluster2) {
        let dist = 0
        for (let k = 0; k < d; k++) {
          const diff = data[i * d + k] - data[j * d + k]
          dist += diff * diff
        }
        minDist = Math.min(minDist, Math.sqrt(dist))
      }
    }
    return minDist
  } else if (linkage === 'complete') {
    // Maximum distance between any two points
    let maxDist = 0
    for (const i of cluster1) {
      for (const j of cluster2) {
        let dist = 0
        for (let k = 0; k < d; k++) {
          const diff = data[i * d + k] - data[j * d + k]
          dist += diff * diff
        }
        maxDist = Math.max(maxDist, Math.sqrt(dist))
      }
    }
    return maxDist
  } else {
    // Average linkage (default)
    let totalDist = 0
    let count = 0
    for (const i of cluster1) {
      for (const j of cluster2) {
        let dist = 0
        for (let k = 0; k < d; k++) {
          const diff = data[i * d + k] - data[j * d + k]
          dist += diff * diff
        }
        totalDist += Math.sqrt(dist)
        count++
      }
    }
    return count > 0 ? totalDist / count : 0
  }
}

/**
 * Create diagonal filter kernel
 * @private
 */
function _diagonalFilter(window, n, slope, zeroMean) {
  const size = Math.ceil(n * Math.max(1, Math.abs(slope)))
  const kernel = new Float32Array(size * size)

  // Create diagonal stripe filter
  for (let i = 0; i < size; i++) {
    for (let j = 0; j < size; j++) {
      const diagDist = Math.abs(i - j * slope)
      if (diagDist < n / 2) {
        // Apply window function
        let weight = 1.0
        if (window === 'hann') {
          weight = 0.5 + 0.5 * Math.cos((2 * Math.PI * diagDist) / n)
        } else if (window === 'hamming') {
          weight = 0.54 + 0.46 * Math.cos((2 * Math.PI * diagDist) / n)
        }
        kernel[i * size + j] = weight
      }
    }
  }

  // Normalize kernel
  const sum = kernel.reduce((a, b) => a + b, 0)
  if (sum > 0) {
    for (let i = 0; i < kernel.length; i++) {
      kernel[i] /= sum
    }
  }

  // Zero-mean if requested
  if (zeroMean) {
    const mean = kernel.reduce((a, b) => a + b, 0) / kernel.length
    for (let i = 0; i < kernel.length; i++) {
      kernel[i] -= mean
    }
  }

  return kernel
}

/**
 * 2D convolution with kernel
 * @private
 */
function _convolve2d(matrix, kernel, size) {
  const kSize = Math.sqrt(kernel.length)
  const result = new Float32Array(matrix.length)
  const pad = Math.floor(kSize / 2)

  for (let i = 0; i < size; i++) {
    for (let j = 0; j < size; j++) {
      let sum = 0

      for (let ki = 0; ki < kSize; ki++) {
        for (let kj = 0; kj < kSize; kj++) {
          const mi = i + ki - pad
          const mj = j + kj - pad

          if (mi >= 0 && mi < size && mj >= 0 && mj < size) {
            sum += matrix[mi * size + mj] * kernel[ki * kSize + kj]
          }
        }
      }

      result[i * size + j] = sum
    }
  }

  return result
}

/**
 * Generate logarithmically spaced values
 * @private
 */
function _logspace(start, stop, num) {
  if (num <= 1) return num === 1 ? [Math.pow(2, start)] : []

  const step = (stop - start) / (num - 1)
  return Array.from({ length: num }, (_, i) => Math.pow(2, start + i * step))
}

/**
 * Convert dense matrix to sparse representation
 * @private
 */
function _toSparseMatrix(dense) {
  const indices = []
  const values = []
  const size = Math.sqrt(dense.length)

  for (let i = 0; i < size; i++) {
    for (let j = 0; j < size; j++) {
      const val = dense[i * size + j]
      if (Math.abs(val) > 1e-10) {
        indices.push([i, j])
        values.push(val)
      }
    }
  }

  return {
    sparse: true,
    indices: new Uint32Array(indices.flat()),
    values: new Float32Array(values),
    shape: [size, size],
  }
}

/**
 * Shear transformation for lag conversion
 * @private
 */
function _shear(matrix, _direction, _axis) {
  // Simplified shear implementation
  // In a full implementation, this would apply the proper shear transformation
  return new Float32Array(matrix)
}

/**
 * Pad matrix for lag representation
 * @private
 */
function _padMatrix(matrix, _n) {
  // Simplified padding - in practice would pad with zeros
  return new Float32Array(matrix)
}

/**
 * Pad sparse matrix
 * @private
 */
function _padSparseMatrix(matrix, _n) {
  // Simplified sparse padding
  return matrix
}

/**
 * Slice matrix to extract subregion
 * @private
 */
function _sliceMatrix(matrix, n) {
  // Simplified slicing
  return new Float32Array(matrix.slice(0, n * n))
}

// Usage Example:
/*
// Basic usage for audio segmentation
const features = extractAudioFeatures(audioData); // Your feature extraction
const recurrence = recurrenceMatrix(features, {
    mode: 'affinity',
    width: 3,
    k: 20
});

const enhanced = pathEnhance(recurrence, 128, {
    maxRatio: 2.0,
    nFilters: 7
});

const segments = agglomerative(features, 8);
debugLog('Segment boundaries:', segments);

// Cross-similarity between different sections
const similarity = crossSimilarity(features1, features2, {
    metric: 'cosine',
    mode: 'affinity'
});
*/
