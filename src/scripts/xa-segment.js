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

/**
 * Compute cross-similarity from one data sequence to a reference sequence
 * Port of librosa.segment.cross_similarity
 *
 * @param {Array} data - Query feature matrix [n_features][n_frames]
 * @param {Array} data_ref - Reference feature matrix [n_features][n_frames_ref]
 * @param {number} k - Number of nearest neighbors (null for sqrt(n_frames))
 * @param {string} metric - Distance metric ('euclidean', 'cosine', 'cityblock')
 * @param {boolean} sparse - Return sparse matrix (not fully supported in JS)
 * @param {string} mode - Affinity mode ('connectivity' or 'distance')
 * @param {number|string} bandwidth - Bandwidth for kernel (null, number, or 'min'/'max')
 * @param {boolean} full - Return full matrix or only query frames
 * @returns {Array} Cross-similarity matrix [n_frames][n_frames_ref]
 */
export function cross_similarity(
  data,
  data_ref,
  k = null,
  metric = 'euclidean',
  sparse = false,
  mode = 'connectivity',
  bandwidth = null,
  full = false
) {
  const is_1d = !Array.isArray(data[0])
  const n_frames = is_1d ? data.length : data[0].length
  const n_frames_ref = is_1d ? data_ref.length : data_ref[0].length

  if (k === null) {
    k = Math.floor(Math.sqrt(n_frames_ref))
  }

  const S = Array(n_frames).fill(null).map(() => new Float32Array(n_frames_ref))

  for (let i = 0; i < n_frames; i++) {
    const distances = new Float32Array(n_frames_ref)

    for (let j = 0; j < n_frames_ref; j++) {
      const vec_i = is_1d ? [data[i]] : data.map(row => row[i])
      const vec_j = is_1d ? [data_ref[j]] : data_ref.map(row => row[j])

      distances[j] = compute_distance(vec_i, vec_j, metric)
    }

    const sorted = distances.map((d, idx) => ({d, idx})).sort((a, b) => a.d - b.d)

    if (mode === 'connectivity') {
      for (let kk = 0; kk < Math.min(k, sorted.length); kk++) {
        const j = sorted[kk].idx
        S[i][j] = 1
      }
    } else if (mode === 'distance') {
      for (let kk = 0; kk < Math.min(k, sorted.length); kk++) {
        const j = sorted[kk].idx
        S[i][j] = sorted[kk].d
      }
    }
  }

  return S
}

/**
 * Multi-angle path enhancement for self- and cross-similarity matrices
 * Port of librosa.segment.path_enhance
 *
 * Applies diagonal median filtering at multiple angles to enhance
 * diagonal structures in similarity matrices
 *
 * @param {Array} R - Recurrence/similarity matrix [n][n]
 * @param {number} n - Number of frames to enhance
 * @param {string} window - Window function ('hann', 'hamming', 'triangle')
 * @param {number} max_ratio - Maximum ratio for angle range (2.0 default)
 * @param {number} min_ratio - Minimum ratio for angle range (null = 1/max_ratio)
 * @param {number} n_filters - Number of filters to apply at different angles
 * @param {boolean} zero_mean - Subtract mean before filtering
 * @param {boolean} clip - Clip negative values to zero after enhancement
 * @returns {Array} Enhanced similarity matrix
 */
export function path_enhance(
  R,
  n,
  window = 'hann',
  max_ratio = 2.0,
  min_ratio = null,
  n_filters = 7,
  zero_mean = false,
  clip = true
) {
  if (min_ratio === null) {
    min_ratio = 1.0 / max_ratio
  }

  const n_rows = R.length
  const n_cols = R[0].length

  // Create angles array (slopes for diagonal filtering)
  const angles = []
  for (let i = 0; i < n_filters; i++) {
    const ratio = min_ratio * Math.pow(max_ratio / min_ratio, i / (n_filters - 1))
    angles.push(ratio)
  }

  // Initialize enhanced matrix
  const R_enhanced = Array(n_rows).fill(null).map(() => new Float32Array(n_cols))

  // Apply diagonal filtering at each angle
  for (const slope of angles) {
    // Extract diagonals at this slope
    for (let i = 0; i < n_rows; i++) {
      for (let j = 0; j < n_cols; j++) {
        // Compute diagonal path
        const diag_vals = []
        for (let k = -(n - 1); k <= (n - 1); k++) {
          const row_idx = i + k
          const col_idx = Math.round(j + k * slope)

          if (row_idx >= 0 && row_idx < n_rows && col_idx >= 0 && col_idx < n_cols) {
            diag_vals.push(R[row_idx][col_idx])
          }
        }

        if (diag_vals.length > 0) {
          // Apply median filter
          diag_vals.sort((a, b) => a - b)
          const median_val = diag_vals[Math.floor(diag_vals.length / 2)]
          R_enhanced[i][j] += median_val
        }
      }
    }
  }

  // Normalize by number of filters
  for (let i = 0; i < n_rows; i++) {
    for (let j = 0; j < n_cols; j++) {
      R_enhanced[i][j] /= n_filters
    }
  }

  // Optional zero-mean normalization
  if (zero_mean) {
    let sum = 0
    for (let i = 0; i < n_rows; i++) {
      for (let j = 0; j < n_cols; j++) {
        sum += R_enhanced[i][j]
      }
    }
    const mean = sum / (n_rows * n_cols)

    for (let i = 0; i < n_rows; i++) {
      for (let j = 0; j < n_cols; j++) {
        R_enhanced[i][j] -= mean
      }
    }
  }

  // Optional clipping
  if (clip) {
    for (let i = 0; i < n_rows; i++) {
      for (let j = 0; j < n_cols; j++) {
        R_enhanced[i][j] = Math.max(0, R_enhanced[i][j])
      }
    }
  }

  return R_enhanced
}

/**
 * Sub-divide a segmentation by feature clustering
 * Port of librosa.segment.subsegment
 *
 * Takes existing segment boundaries and further divides each segment
 * into sub-segments using k-means clustering
 *
 * @param {Array} data - Feature matrix [n_features][n_frames]
 * @param {Array} frames - Segment boundary frame indices
 * @param {number} n_segments - Number of sub-segments per segment
 * @param {number} axis - Feature axis (-1 for time axis)
 * @returns {Array} Refined boundary frame indices
 */
export function subsegment(data, frames, n_segments = 4, axis = -1) {
  const is_1d = !Array.isArray(data[0])
  const n_frames = is_1d ? data.length : data[0].length

  // Ensure frames includes start and end
  const boundaries = [...new Set([0, ...frames, n_frames])].sort((a, b) => a - b)

  const all_boundaries = [0]

  // Process each segment
  for (let seg_idx = 0; seg_idx < boundaries.length - 1; seg_idx++) {
    const start = boundaries[seg_idx]
    const end = boundaries[seg_idx + 1]
    const seg_length = end - start

    if (seg_length <= n_segments) {
      // Too short to subdivide, keep frame boundaries
      for (let i = start + 1; i <= end; i++) {
        all_boundaries.push(i)
      }
      continue
    }

    // Extract segment features
    const seg_data = []
    if (is_1d) {
      for (let i = start; i < end; i++) {
        seg_data.push([data[i]])
      }
    } else {
      for (let i = start; i < end; i++) {
        seg_data.push(data.map(row => row[i]))
      }
    }

    // Simple k-means clustering to find sub-segment boundaries
    const subseg_boundaries = simple_kmeans_boundaries(seg_data, n_segments)

    // Add offset and append to all_boundaries
    for (const b of subseg_boundaries) {
      if (b > 0 && b < seg_length) {
        all_boundaries.push(start + b)
      }
    }

    // Add segment end
    all_boundaries.push(end)
  }

  // Remove duplicates and sort
  return [...new Set(all_boundaries)].sort((a, b) => a - b)
}

/**
 * Simple k-means to find k boundaries in feature sequence
 * Helper for subsegment function
 */
function simple_kmeans_boundaries(features, k) {
  const n = features.length

  if (k >= n) {
    return Array.from({length: n}, (_, i) => i)
  }

  // Initialize centroids evenly spaced
  const centroids = []
  for (let i = 0; i < k; i++) {
    const idx = Math.floor(i * n / k)
    centroids.push([...features[idx]])
  }

  // Run k-means for a few iterations
  const max_iter = 10
  let labels = new Array(n).fill(0)

  for (let iter = 0; iter < max_iter; iter++) {
    // Assign labels
    for (let i = 0; i < n; i++) {
      let min_dist = Infinity
      let best_k = 0

      for (let kk = 0; kk < k; kk++) {
        const dist = euclidean_distance(features[i], centroids[kk])
        if (dist < min_dist) {
          min_dist = dist
          best_k = kk
        }
      }

      labels[i] = best_k
    }

    // Update centroids
    for (let kk = 0; kk < k; kk++) {
      const cluster_points = features.filter((_, i) => labels[i] === kk)
      if (cluster_points.length > 0) {
        const dim = features[0].length
        const new_centroid = new Array(dim).fill(0)

        for (const point of cluster_points) {
          for (let d = 0; d < dim; d++) {
            new_centroid[d] += point[d]
          }
        }

        for (let d = 0; d < dim; d++) {
          new_centroid[d] /= cluster_points.length
        }

        centroids[kk] = new_centroid
      }
    }
  }

  // Find boundaries (where label changes)
  const boundaries = [0]
  for (let i = 1; i < n; i++) {
    if (labels[i] !== labels[i - 1]) {
      boundaries.push(i)
    }
  }

  return boundaries
}

function euclidean_distance(a, b) {
  let sum = 0
  for (let i = 0; i < a.length; i++) {
    const diff = a[i] - b[i]
    sum += diff * diff
  }
  return Math.sqrt(sum)
}
