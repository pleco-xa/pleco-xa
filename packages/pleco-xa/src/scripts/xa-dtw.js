/**
 * Dynamic Time Warping (DTW) — compatibility shim.
 *
 * The librosa-faithful engine lives in src/sequence/dtw.js (recorded-step
 * backtracking, appended custom steps, honored weights_add/weights_mul,
 * subseq, absolute-radius Sakoe-Chiba band; fixture-gated against
 * tools/parity/fixtures/dtw_segment.json). This module keeps the legacy
 * positional call signature and result shape for existing consumers
 * (dj-loop-analyzer), delegating the actual alignment to the engine.
 *
 * Removed (Wave 5B): `fastDTW` and `constrainedDTW`. constrainedDTW ignored
 * its radius/path and called full dtw, so fastDTW was full DTW plus recursion
 * overhead — a fabricated speedup. `isWithinBand` (the old normalized-
 * coordinate band, which never matched librosa's geometry) is gone with it.
 * Callers who want FastDTW semantics must implement a real constrained pass.
 */

import { dtw as dtwCore } from '../sequence/dtw.js'

/**
 * Dynamic Time Warping (legacy signature).
 *
 * @param {Array} X - First sequence (2D: features x time)
 * @param {Array} Y - Second sequence (2D: features x time)
 * @param {string} metric - 'euclidean' | 'cosine' | 'manhattan' | 'sqeuclidean'
 * @param {Array} step_sizes_sigma - custom steps (appended to librosa defaults)
 * @param {Array} weights_add - additive step weights (honored)
 * @param {Array} weights_mul - multiplicative step weights (honored)
 * @param {boolean} subseq - subsequence matching (honored)
 * @param {boolean} backtrack - whether to return the optimal path
 * @param {boolean} global_constraints - Sakoe-Chiba band (librosa geometry)
 * @param {number} band_rad - band radius as a fraction of min(N, M)
 * @returns {Object} { distance, cost_matrix, path, normalized_distance }
 *   `cost_matrix` is the (N, M) accumulated cost matrix (librosa layout —
 *   no longer the padded (N+1, M+1) legacy matrix). `path` is start-to-end
 *   ascending, as before.
 */
export function dtw(
  X,
  Y,
  metric = 'euclidean',
  step_sizes_sigma = null,
  weights_add = null,
  weights_mul = null,
  subseq = false,
  backtrack = true,
  global_constraints = null,
  band_rad = 0.25,
) {
  const { D, wp } = dtwCore(X, Y, {
    metric,
    stepSizesSigma: step_sizes_sigma,
    weightsAdd: weights_add,
    weightsMul: weights_mul,
    subseq,
    backtrack,
    globalConstraints: Boolean(global_constraints),
    bandRad: band_rad,
  })

  const N = D.length
  const M = D[0].length

  return {
    distance: D[N - 1][M - 1],
    cost_matrix: D,
    path: backtrack ? wp.slice().reverse() : [],
    normalized_distance: D[N - 1][M - 1] / (N + M),
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
      } else {
        throw new Error(`computeCostMatrix: unsupported metric '${metric}'`)
      }
    }
  }

  return C
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
