/**
 * Dynamic Time Warping (DTW) for audio sequence comparison
 * Core algorithm for comparing musical sequences with optimal alignment
 */

/**
 * Dynamic Time Warping implementation
 * @param {Array} X - First sequence (2D array: features x time)
 * @param {Array} Y - Second sequence (2D array: features x time)
 * @param {string} metric - Distance metric ('euclidean' or 'cosine')
 * @param {Array} step_sizes_sigma - Step patterns [[1,1], [1,0], [0,1]]
 * @param {Array} weights_add - Additive weights for step patterns
 * @param {Array} weights_mul - Multiplicative weights for step patterns
 * @param {boolean} subseq - Subsequence matching
 * @param {boolean} backtrack - Whether to return optimal path
 * @param {Object} global_constraints - Global path constraints
 * @param {number} band_rad - Sakoe-Chiba band radius (0-1)
 * @returns {Object} DTW result with distance, cost matrix, and path
 */
export function dtw(
  X,
  Y,
  metric = 'euclidean',
  step_sizes_sigma = null,
  weights_add = null,
  _weights_mul = null,
  _subseq = false,
  backtrack = true,
  global_constraints = null,
  band_rad = 0.25,
) {
  const n = X[0].length
  const m = Y[0].length

  // Initialize cost matrix
  const D = Array(n + 1)
    .fill(null)
    .map(() => Array(m + 1).fill(Infinity))
  D[0][0] = 0

  // Step patterns (default is (1,1), (1,0), (0,1))
  const steps = step_sizes_sigma || [
    [1, 1],
    [1, 0],
    [0, 1],
  ]
  const weights = weights_add || [0, 0, 0]

  // Calculate distance matrix
  const C = computeCostMatrix(X, Y, metric)

  // Fill cost matrix
  for (let i = 1; i <= n; i++) {
    for (let j = 1; j <= m; j++) {
      // Check global constraints (Sakoe-Chiba band)
      if (global_constraints && !isWithinBand(i, j, n, m, band_rad)) {
        continue
      }

      const candidates = []
      for (let s = 0; s < steps.length; s++) {
        const [di, dj] = steps[s]
        const prev_i = i - di
        const prev_j = j - dj

        if (prev_i >= 0 && prev_j >= 0) {
          const cost = D[prev_i][prev_j] + weights[s] + C[i - 1][j - 1]
          candidates.push(cost)
        }
      }

      if (candidates.length > 0) {
        D[i][j] = Math.min(...candidates)
      }
    }
  }

  // Backtrack to find path
  let path = []
  if (backtrack) {
    path = findPath(D, steps)
  }

  return {
    distance: D[n][m],
    cost_matrix: D,
    path: path,
    normalized_distance: D[n][m] / (n + m), // Normalize by path length
  }
}

/**
 * Compute cost matrix between two sequences
 * @param {Array} X - First sequence
 * @param {Array} Y - Second sequence
 * @param {string} metric - Distance metric
 * @returns {Array} Cost matrix
 */
export function computeCostMatrix(X, Y, metric = 'euclidean') {
  const n = X[0].length
  const m = Y[0].length
  const C = Array(n)
    .fill(null)
    .map(() => Array(m).fill(0))

  for (let i = 0; i < n; i++) {
    for (let j = 0; j < m; j++) {
      if (metric === 'euclidean') {
        C[i][j] = euclideanDistance(
          X.map((row) => row[i]),
          Y.map((row) => row[j]),
        )
      } else if (metric === 'cosine') {
        C[i][j] =
          1 -
          cosineSimilarity(
            X.map((row) => row[i]),
            Y.map((row) => row[j]),
          )
      } else if (metric === 'manhattan') {
        C[i][j] = manhattanDistance(
          X.map((row) => row[i]),
          Y.map((row) => row[j]),
        )
      }
    }
  }

  return C
}

/**
 * Check if position is within Sakoe-Chiba band constraint
 * @param {number} i - Row index
 * @param {number} j - Column index
 * @param {number} n - Total rows
 * @param {number} m - Total columns
 * @param {number} band_rad - Band radius (0-1)
 * @returns {boolean} Whether position is within band
 */
export function isWithinBand(i, j, n, m, band_rad) {
  const normalized_i = i / n
  const normalized_j = j / m
  return Math.abs(normalized_i - normalized_j) <= band_rad
}

/**
 * Backtrack to find optimal path through cost matrix
 * @param {Array} D - Cost matrix
 * @param {Array} steps - Step patterns
 * @returns {Array} Optimal path as array of [i, j] coordinates
 */
export function findPath(D, steps) {
  const path = []
  let i = D.length - 1
  let j = D[0].length - 1

  path.push([i - 1, j - 1])

  while (i > 0 || j > 0) {
    const candidates = []

    for (let s = 0; s < steps.length; s++) {
      const [di, dj] = steps[s]
      const prev_i = i - di
      const prev_j = j - dj

      if (prev_i >= 0 && prev_j >= 0 && D[prev_i][prev_j] !== Infinity) {
        candidates.push({
          cost: D[prev_i][prev_j],
          i: prev_i,
          j: prev_j,
        })
      }
    }

    if (candidates.length === 0) break

    candidates.sort((a, b) => a.cost - b.cost)
    i = candidates[0].i
    j = candidates[0].j

    if (i > 0 || j > 0) {
      path.push([i - 1, j - 1])
    }
  }

  return path.reverse()
}

/**
 * Fast DTW with early termination for real-time use
 * @param {Array} X - First sequence
 * @param {Array} Y - Second sequence
 * @param {number} radius - Search radius
 * @param {number} threshold - Early termination threshold
 * @returns {Object} DTW result
 */
export function fastDTW(X, Y, radius = 5, threshold = Infinity) {
  const n = X[0].length
  const m = Y[0].length

  if (n <= radius || m <= radius) {
    return dtw(X, Y)
  }

  // Downsample sequences
  const downsample_factor = 2
  const X_down = downsample(X, downsample_factor)
  const Y_down = downsample(Y, downsample_factor)

  // Recursively compute DTW on downsampled sequences
  const result_down = fastDTW(X_down, Y_down, radius, threshold)

  // Project path back to original resolution
  const path_projected = result_down.path.map(([i, j]) => [
    Math.min(i * downsample_factor, n - 1),
    Math.min(j * downsample_factor, m - 1),
  ])

  // Refine path with constrained DTW
  return constrainedDTW(X, Y, path_projected, radius)
}

/**
 * Downsample sequence by factor
 * @param {Array} X - Input sequence
 * @param {number} factor - Downsampling factor
 * @returns {Array} Downsampled sequence
 */
function downsample(X, factor) {
  const n_features = X.length
  const n_frames = X[0].length
  const new_frames = Math.floor(n_frames / factor)

  const X_down = Array(n_features)
    .fill(null)
    .map(() => new Array(new_frames))

  for (let f = 0; f < n_features; f++) {
    for (let t = 0; t < new_frames; t++) {
      X_down[f][t] = X[f][t * factor]
    }
  }

  return X_down
}

/**
 * Constrained DTW around a given path
 * @param {Array} X - First sequence
 * @param {Array} Y - Second sequence
 * @param {Array} path - Reference path
 * @param {number} radius - Constraint radius
 * @returns {Object} DTW result
 */
function constrainedDTW(X, Y, _path, _radius) {
  // Implementation would create a constrained search region
  // around the given path with specified radius
  return dtw(X, Y) // Simplified for now
}

/**
 * Distance metrics
 */
export function euclideanDistance(a, b) {
  let sum = 0
  for (let i = 0; i < a.length; i++) {
    sum += Math.pow(a[i] - b[i], 2)
  }
  return Math.sqrt(sum)
}

export function manhattanDistance(a, b) {
  let sum = 0
  for (let i = 0; i < a.length; i++) {
    sum += Math.abs(a[i] - b[i])
  }
  return sum
}

export function cosineSimilarity(a, b) {
  let dotProduct = 0
  let normA = 0
  let normB = 0

  for (let i = 0; i < a.length; i++) {
    dotProduct += a[i] * b[i]
    normA += a[i] * a[i]
    normB += b[i] * b[i]
  }

  if (normA === 0 || normB === 0) return 0
  return dotProduct / (Math.sqrt(normA) * Math.sqrt(normB))
}

/**
 * Compute DTW distance matrix for multiple sequences
 * @param {Array} sequences - Array of sequences
 * @param {string} metric - Distance metric
 * @returns {Array} Distance matrix
 */
export function dtwDistanceMatrix(sequences, metric = 'cosine') {
  const n = sequences.length
  const matrix = Array(n)
    .fill(null)
    .map(() => new Array(n).fill(0))

  for (let i = 0; i < n; i++) {
    for (let j = i + 1; j < n; j++) {
      const { distance } = dtw(sequences[i], sequences[j], metric)
      matrix[i][j] = distance
      matrix[j][i] = distance // Symmetric
    }
  }

  return matrix
}

/**
 * Simple k-means clustering using DTW distances
 * @param {Array} sequences - Array of sequences to cluster
 * @param {number} k - Number of clusters
 * @param {number} maxIterations - Maximum iterations
 * @returns {Array} Cluster assignments
 */
export function dtwKMeans(sequences, k = 3, maxIterations = 10) {
  const n = sequences.length

  // Initialize cluster centers randomly
  let centers = []
  for (let i = 0; i < k; i++) {
    centers.push(sequences[Math.floor(Math.random() * n)])
  }

  let assignments = new Array(n)

  for (let iter = 0; iter < maxIterations; iter++) {
    // Assign sequences to nearest cluster
    for (let i = 0; i < n; i++) {
      let minDistance = Infinity
      let bestCluster = 0

      for (let c = 0; c < k; c++) {
        const { distance } = dtw(sequences[i], centers[c])
        if (distance < minDistance) {
          minDistance = distance
          bestCluster = c
        }
      }

      assignments[i] = bestCluster
    }

    // Update cluster centers (medoid approximation)
    for (let c = 0; c < k; c++) {
      const clusterMembers = sequences.filter((_, i) => assignments[i] === c)
      if (clusterMembers.length > 0) {
        // Use medoid as center (sequence with minimum total distance)
        let minTotalDistance = Infinity
        let medoid = clusterMembers[0]

        for (let candidate of clusterMembers) {
          let totalDistance = 0
          for (let member of clusterMembers) {
            const { distance } = dtw(candidate, member)
            totalDistance += distance
          }

          if (totalDistance < minTotalDistance) {
            minTotalDistance = totalDistance
            medoid = candidate
          }
        }

        centers[c] = medoid
      }
    }
  }

  return {
    assignments: assignments,
    centers: centers,
    clusters: centers.map((center, c) => ({
      center: center,
      members: sequences.filter((_, i) => assignments[i] === c),
    })),
  }
}
