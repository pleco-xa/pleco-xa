/**
 * Port of librosa.segment
 * Structural segmentation and music structure analysis
 * Librosa-compatible segmentation for JavaScript
 */

/**
 * Compute recurrence matrix from feature sequence
 * Port of librosa.segment.recurrence_matrix
 * @param {Array} data - Feature matrix [n_features][n_frames]
 * @param {number} k - Number of nearest neighbors
 * @param {number} width - Filter width (diagonal suppression)
 * @param {string} metric - Distance metric ('euclidean', 'cosine', 'cityblock')
 * @param {boolean} sym - Force symmetry
 * @returns {Array} Recurrence matrix [n_frames][n_frames]
 */
export function recurrence_matrix(data, k = null, width = 1, metric = 'euclidean', sym = false) {
  const is_1d = !Array.isArray(data[0])
  const n_frames = is_1d ? data.length : data[0].length
  const n_features = is_1d ? 1 : data.length

  if (k === null) {
    k = Math.floor(Math.sqrt(n_frames))
  }

  const R = Array(n_frames).fill(null).map(() => new Float32Array(n_frames))

  for (let i = 0; i < n_frames; i++) {
    const distances = new Float32Array(n_frames)
    
    for (let j = 0; j < n_frames; j++) {
      if (Math.abs(i - j) < width) {
        distances[j] = Infinity
        continue
      }

      const vec_i = is_1d ? [data[i]] : data.map(row => row[i])
      const vec_j = is_1d ? [data[j]] : data.map(row => row[j])
      
      distances[j] = compute_distance(vec_i, vec_j, metric)
    }

    const sorted = distances.map((d, idx) => ({d, idx})).sort((a, b) => a.d - b.d)
    
    for (let kk = 0; kk < Math.min(k, sorted.length); kk++) {
      const j = sorted[kk].idx
      R[i][j] = 1
    }
  }

  if (sym) {
    for (let i = 0; i < n_frames; i++) {
      for (let j = i + 1; j < n_frames; j++) {
        const val = Math.max(R[i][j], R[j][i])
        R[i][j] = val
        R[j][i] = val
      }
    }
  }

  return R
}

function compute_distance(a, b, metric) {
  if (metric === 'euclidean') {
    let sum = 0
    for (let i = 0; i < a.length; i++) {
      const diff = a[i] - b[i]
      sum += diff * diff
    }
    return Math.sqrt(sum)
  } else if (metric === 'cosine') {
    let dot = 0, norm_a = 0, norm_b = 0
    for (let i = 0; i < a.length; i++) {
      dot += a[i] * b[i]
      norm_a += a[i] * a[i]
      norm_b += b[i] * b[i]
    }
    const denom = Math.sqrt(norm_a * norm_b)
    return denom === 0 ? 1.0 : 1.0 - dot / denom
  } else if (metric === 'cityblock') {
    let sum = 0
    for (let i = 0; i < a.length; i++) {
      sum += Math.abs(a[i] - b[i])
    }
    return sum
  }
  return 0
}

/**
 * Convert recurrence matrix to time-lag representation
 * Port of librosa.segment.recurrence_to_lag
 * @param {Array} R - Recurrence matrix [n][n]
 * @param {number} pad - Pad length
 * @param {number} axis - Aggregation axis
 * @returns {Array} Lag matrix
 */
export function recurrence_to_lag(R, pad = true, axis = -1) {
  const n = R.length
  const lag_matrix = Array(n).fill(null).map(() => new Float32Array(n))

  for (let i = 0; i < n; i++) {
    for (let j = 0; j < n; j++) {
      const lag = j - i
      if (lag >= 0) {
        lag_matrix[i][lag] = R[i][j]
      }
    }
  }

  return lag_matrix
}

/**
 * Convert time-lag representation to recurrence matrix
 * Port of librosa.segment.lag_to_recurrence
 * @param {Array} L - Lag matrix [n][n]
 * @returns {Array} Recurrence matrix
 */
export function lag_to_recurrence(L) {
  const n = L.length
  const R = Array(n).fill(null).map(() => new Float32Array(n))

  for (let i = 0; i < n; i++) {
    for (let lag = 0; lag < n; lag++) {
      const j = i + lag
      if (j < n) {
        R[i][j] = L[i][lag]
      }
    }
  }

  return R
}

/**
 * Time-lag filtering for segmentation
 * @param {Array} R - Recurrence matrix
 * @param {number} min_lag - Minimum lag
 * @param {number} max_lag - Maximum lag
 * @returns {Array} Filtered recurrence matrix
 */
export function timelag_filter(R, min_lag = 1, max_lag = null) {
  const n = R.length
  if (max_lag === null) max_lag = n

  const filtered = Array(n).fill(null).map(() => new Float32Array(n))

  for (let i = 0; i < n; i++) {
    for (let j = 0; j < n; j++) {
      const lag = Math.abs(j - i)
      if (lag >= min_lag && lag <= max_lag) {
        filtered[i][j] = R[i][j]
      }
    }
  }

  return filtered
}

/**
 * Detect segment boundaries using novelty curve
 * @param {Array} data - Feature matrix [n_features][n_frames]
 * @param {number} k - Kernel size for Gaussian filter
 * @param {number} threshold - Threshold for peak picking
 * @returns {Array} Segment boundary frames
 */
export function segment_boundaries(data, k = 64, threshold = 0.1) {
  const R = recurrence_matrix(data)
  const novelty = compute_novelty(R)
  
  const smoothed = gaussian_filter(novelty, k)
  
  const boundaries = [0]
  for (let i = 1; i < smoothed.length - 1; i++) {
    if (smoothed[i] > smoothed[i-1] && smoothed[i] > smoothed[i+1] && smoothed[i] > threshold) {
      boundaries.push(i)
    }
  }
  boundaries.push(smoothed.length - 1)

  return boundaries
}

function compute_novelty(R) {
  const n = R.length
  const novelty = new Float32Array(n)

  for (let i = 1; i < n; i++) {
    let sum = 0
    for (let j = 0; j < n; j++) {
      sum += Math.abs(R[i][j] - R[i-1][j])
    }
    novelty[i] = sum
  }

  return novelty
}

function gaussian_filter(data, kernel_size) {
  const sigma = kernel_size / 6.0
  const kernel = new Float32Array(kernel_size)
  const center = Math.floor(kernel_size / 2)

  for (let i = 0; i < kernel_size; i++) {
    const x = i - center
    kernel[i] = Math.exp(-(x * x) / (2 * sigma * sigma))
  }

  const sum = kernel.reduce((a, b) => a + b, 0)
  for (let i = 0; i < kernel_size; i++) {
    kernel[i] /= sum
  }

  const filtered = new Float32Array(data.length)
  const half = Math.floor(kernel_size / 2)

  for (let i = 0; i < data.length; i++) {
    let val = 0
    let weight = 0

    for (let j = 0; j < kernel_size; j++) {
      const idx = i - half + j
      if (idx >= 0 && idx < data.length) {
        val += data[idx] * kernel[j]
        weight += kernel[j]
      }
    }

    filtered[i] = weight > 0 ? val / weight : 0
  }

  return filtered
}

/**
 * Agglomerative clustering for segmentation
 * @param {Array} data - Feature matrix
 * @param {number} k - Number of segments
 * @returns {Array} Segment labels
 */
export function agglomerative_clustering(data, k = 8) {
  const n_frames = Array.isArray(data[0]) ? data[0].length : data.length
  
  let clusters = Array.from({length: n_frames}, (_, i) => [i])
  
  while (clusters.length > k) {
    let min_dist = Infinity
    let merge_i = 0, merge_j = 1

    for (let i = 0; i < clusters.length; i++) {
      for (let j = i + 1; j < clusters.length; j++) {
        const dist = cluster_distance(clusters[i], clusters[j], data)
        if (dist < min_dist) {
          min_dist = dist
          merge_i = i
          merge_j = j
        }
      }
    }

    clusters[merge_i] = clusters[merge_i].concat(clusters[merge_j])
    clusters.splice(merge_j, 1)
  }

  const labels = new Array(n_frames)
  for (let i = 0; i < clusters.length; i++) {
    for (const frame of clusters[i]) {
      labels[frame] = i
    }
  }

  return labels
}

function cluster_distance(cluster_a, cluster_b, data) {
  let sum = 0, count = 0

  for (const i of cluster_a) {
    for (const j of cluster_b) {
      const vec_i = Array.isArray(data[0]) ? data.map(row => row[i]) : [data[i]]
      const vec_j = Array.isArray(data[0]) ? data.map(row => row[j]) : [data[j]]
      sum += compute_distance(vec_i, vec_j, 'euclidean')
      count++
    }
  }

  return count > 0 ? sum / count : Infinity
}

/**
 * Extract segments from boundary frames
 * @param {Array} boundaries - Boundary frame indices
 * @param {number} n_frames - Total number of frames
 * @returns {Array} Array of [start, end] segment ranges
 */
export function boundaries_to_segments(boundaries, n_frames) {
  const segments = []

  for (let i = 0; i < boundaries.length - 1; i++) {
    segments.push([boundaries[i], boundaries[i + 1]])
  }

  return segments
}
