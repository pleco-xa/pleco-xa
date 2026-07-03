/**
 * Sequence analysis and alignment implementations
 * Based on librosa's sequence.py module
 *
 * Provides:
 * - DTW (Dynamic Time Warping)
 * - Viterbi decoding (standard, discriminative, binary)
 * - RQA (Recurrence Quantification Analysis)
 * - Transition matrices (uniform, loop, local, cycle)
 *
 * The transition-matrix constructors and the standard/discriminative Viterbi
 * decoders live in the canonical sequence modules (../sequence/transition.js,
 * ../sequence/viterbi.js) and are re-exported here so the historical
 * scripts/xa-sequence.js import surface (used by scripts/pleco-audio.js) keeps
 * working unchanged. viterbi_binary remains here: it is pleco's own multi-label
 * helper, intentionally NOT promoted to a librosa-parity export.
 */

import { viterbi, viterbi_discriminative } from '../sequence/viterbi.js'

export { viterbi, viterbi_discriminative }
export {
  transition_uniform,
  transition_loop,
  transition_cycle,
  transition_local,
} from '../sequence/transition.js'

/**
 * Dynamic Time Warping (DTW)
 *
 * Compute the optimal alignment path between two sequences using dynamic programming.
 *
 * @param {Array<number>|Array<Array<number>>|null} X - First sequence or feature matrix
 * @param {Array<number>|Array<Array<number>>|null} Y - Second sequence or feature matrix
 * @param {Array<Array<number>>|null} C - Precomputed cost matrix (alternative to X, Y)
 * @param {string} metric - Distance metric ('euclidean', 'cosine', 'manhattan')
 * @param {Array<Array<number>>|null} step_sizes_sigma - Step size patterns
 * @param {Array<number>|null} weights_add - Additive step weights
 * @param {Array<number>|null} weights_mul - Multiplicative step weights
 * @param {boolean} subseq - Enable subsequence DTW
 * @param {boolean} backtrack - Return optimal path
 * @param {boolean} global_constraints - Apply global path constraints
 * @param {number} band_rad - Sakoe-Chiba band radius
 * @param {boolean} return_steps - Return step indices along path
 * @returns {Array|Object} Accumulated cost matrix, or {D, wp} if backtrack, or {D, wp, steps} if return_steps
 */
export function dtw(
  X = null,
  Y = null,
  C = null,
  metric = 'euclidean',
  step_sizes_sigma = null,
  weights_add = null,
  weights_mul = null,
  subseq = false,
  backtrack = true,
  global_constraints = false,
  band_rad = 0.25,
  return_steps = false
) {
  // Validate inputs
  if (C === null && (X === null || Y === null)) {
    throw new Error('Either C or both X and Y must be provided')
  }

  // Compute cost matrix if not provided
  if (C === null) {
    C = __compute_cost_matrix(X, Y, metric)
  }

  const max_0 = C.length
  const max_1 = C[0].length

  // Default step sizes (symmetric P0)
  if (step_sizes_sigma === null) {
    step_sizes_sigma = [[1, 1], [1, 0], [0, 1]]
  }

  // Default weights
  if (weights_add === null) {
    weights_add = [0, 0, 0]
  }
  if (weights_mul === null) {
    weights_mul = [1, 1, 1]
  }

  // Compute accumulated cost matrix
  const { D, steps } = __dtw_calc_accu_cost(
    C, step_sizes_sigma, weights_mul, weights_add,
    max_0, max_1, subseq, global_constraints, band_rad
  )

  if (!backtrack) {
    return return_steps ? { D, steps } : D
  }

  // Backtrack to find optimal path
  const wp = __dtw_backtracking(steps, step_sizes_sigma, subseq)

  if (return_steps) {
    return { D, wp, steps }
  }

  return { D, wp }
}

/**
 * Backtrack a warping path from accumulated cost matrix
 *
 * @param {Array<Array<number>>} steps - Step index matrix from DTW
 * @param {Array<Array<number>>|null} step_sizes_sigma - Step size patterns
 * @param {boolean} subseq - Subsequence mode
 * @param {number|null} start - Starting position (null = automatic)
 * @returns {Array<Array<number>>} Optimal warping path as [[i0, j0], [i1, j1], ...]
 */
export function dtw_backtracking(
  steps,
  step_sizes_sigma = null,
  subseq = false,
  start = null
) {
  if (step_sizes_sigma === null) {
    step_sizes_sigma = [[1, 1], [1, 0], [0, 1]]
  }

  return __dtw_backtracking(steps, step_sizes_sigma, subseq, start)
}

/**
 * Viterbi decoding from binary (multi-label) discriminative state predictions
 *
 * NOTE: This is pleco's own multi-label helper, not a librosa-parity port. It
 * builds an observation-likelihood matrix P(obs|state) = prob * p_state and
 * runs the standard Viterbi decoder, returning a single most-likely state path.
 *
 * @param {Array<Array<number>>} prob - Binary state probabilities [n_states x n_frames]
 * @param {Array<Array<number>>} transition - Transition matrix
 * @param {Array<number>|null} p_state - State prior
 * @param {Array<number>|null} p_init - Initial distribution
 * @param {boolean} return_logp - Return log probability
 * @returns {Array<number>|Object} State sequence or {states, logp}
 */
export function viterbi_binary(
  prob,
  transition,
  p_state = null,
  p_init = null,
  return_logp = false
) {
  // For binary predictions, convert to observation likelihoods
  // P(obs|state=i) = prob[i] if state active, (1-prob[i]) if inactive
  const n_states = prob.length
  const n_frames = prob[0].length

  if (p_state === null) {
    p_state = new Array(n_states).fill(1.0 / n_states)
  }

  // Build observation probability matrix
  const obs_prob = new Array(n_states)
  for (let i = 0; i < n_states; i++) {
    obs_prob[i] = new Array(n_frames)
    for (let t = 0; t < n_frames; t++) {
      const p = Math.max(Math.min(prob[i][t], 1 - 1e-10), 1e-10)
      obs_prob[i][t] = p * p_state[i]
    }
  }

  return viterbi(obs_prob, transition, p_init, return_logp)
}

/**
 * Recurrence Quantification Analysis (RQA)
 *
 * Compute optimal recurrence path through a similarity matrix using
 * affine gap penalties.
 *
 * @param {Array<Array<number>>} sim - Similarity matrix
 * @param {number} gap_onset - Gap opening penalty
 * @param {number} gap_extend - Gap extension penalty
 * @param {boolean} knight_moves - Allow knight's moves (2,1) and (1,2)
 * @param {boolean} backtrack - Return alignment path
 * @returns {Array<Array<number>>|Object} Score matrix or {score, path}
 */
export function rqa(
  sim,
  gap_onset = 1,
  gap_extend = 1,
  knight_moves = true,
  backtrack = true
) {
  const { score, pointers } = __rqa_dp(sim, gap_onset, gap_extend, knight_moves)

  if (!backtrack) {
    return score
  }

  const path = __rqa_backtrack(score, pointers)
  return { score, path }
}

// ============================================================================
// Helper Functions
// ============================================================================

/**
 * Compute pairwise cost matrix
 */
function __compute_cost_matrix(X, Y, metric) {
  const n = X.length
  const m = Y.length

  const C = Array(n).fill(null).map(() => Array(m).fill(0))

  for (let i = 0; i < n; i++) {
    for (let j = 0; j < m; j++) {
      C[i][j] = __distance(X[i], Y[j], metric)
    }
  }

  return C
}

/**
 * Compute distance between two vectors
 */
function __distance(a, b, metric) {
  if (!Array.isArray(a)) {
    a = [a]
  }
  if (!Array.isArray(b)) {
    b = [b]
  }

  if (metric === 'euclidean') {
    let sum = 0
    for (let i = 0; i < a.length; i++) {
      const diff = a[i] - b[i]
      sum += diff * diff
    }
    return Math.sqrt(sum)
  } else if (metric === 'manhattan') {
    let sum = 0
    for (let i = 0; i < a.length; i++) {
      sum += Math.abs(a[i] - b[i])
    }
    return sum
  } else if (metric === 'cosine') {
    let dot = 0, norm_a = 0, norm_b = 0
    for (let i = 0; i < a.length; i++) {
      dot += a[i] * b[i]
      norm_a += a[i] * a[i]
      norm_b += b[i] * b[i]
    }
    return 1 - dot / (Math.sqrt(norm_a * norm_b) + 1e-10)
  }

  return 0
}

/**
 * Calculate accumulated cost matrix for DTW
 */
function __dtw_calc_accu_cost(
  C, step_sizes_sigma, weights_mul, weights_add,
  max_0, max_1, subseq, global_constraints, band_rad
) {
  const D = Array(max_0).fill(null).map(() => Array(max_1).fill(Infinity))
  const steps = Array(max_0).fill(null).map(() => Array(max_1).fill(-1))

  // Initialize first cell
  if (subseq) {
    // Subsequence mode: can start anywhere in first sequence
    for (let i = 0; i < max_0; i++) {
      D[i][0] = C[i][0]
    }
  } else {
    D[0][0] = C[0][0]
  }

  // Fill accumulated cost matrix
  for (let i = 0; i < max_0; i++) {
    for (let j = 0; j < max_1; j++) {
      if (i === 0 && j === 0 && !subseq) continue

      // Apply band constraint if requested
      if (global_constraints) {
        const band_width = Math.ceil(band_rad * Math.max(max_0, max_1))
        if (Math.abs(i / max_0 - j / max_1) > band_width / Math.max(max_0, max_1)) {
          continue
        }
      }

      // Try each step size
      let min_cost = Infinity
      let min_step = -1

      for (let s = 0; s < step_sizes_sigma.length; s++) {
        const [di, dj] = step_sizes_sigma[s]
        const prev_i = i - di
        const prev_j = j - dj

        if (prev_i >= 0 && prev_j >= 0 && D[prev_i][prev_j] !== Infinity) {
          const cost = D[prev_i][prev_j] * weights_mul[s] + C[i][j] + weights_add[s]
          if (cost < min_cost) {
            min_cost = cost
            min_step = s
          }
        }
      }

      D[i][j] = min_cost
      steps[i][j] = min_step
    }
  }

  return { D, steps }
}

/**
 * Backtrack optimal DTW path
 */
function __dtw_backtracking(steps, step_sizes_sigma, subseq, start = null) {
  const max_0 = steps.length
  const max_1 = steps[0].length

  // Find starting position
  let i, j
  if (start !== null) {
    [i, j] = start
  } else if (subseq) {
    // Find minimum in last column
    j = max_1 - 1
    i = 0
    let min_val = Infinity
    for (let k = 0; k < max_0; k++) {
      const val = steps[k][j]
      if (val < min_val) {
        min_val = val
        i = k
      }
    }
  } else {
    i = max_0 - 1
    j = max_1 - 1
  }

  // Backtrack path
  const path = [[i, j]]

  while (i > 0 || j > 0) {
    const step_idx = steps[i][j]
    if (step_idx < 0) break

    const [di, dj] = step_sizes_sigma[step_idx]
    i -= di
    j -= dj

    if (i < 0 || j < 0) break
    path.unshift([i, j])
  }

  return path
}

/**
 * RQA dynamic programming implementation
 */
function __rqa_dp(sim, gap_onset, gap_extend, knight) {
  const n = sim.length
  const m = sim[0].length

  // Three matrices: match, gap_x, gap_y
  const M = Array(n).fill(null).map(() => Array(m).fill(0))
  const X = Array(n).fill(null).map(() => Array(m).fill(-Infinity))
  const Y = Array(n).fill(null).map(() => Array(m).fill(-Infinity))
  const pointers = Array(n).fill(null).map(() => Array(m).fill(null))

  // Initialize
  M[0][0] = sim[0][0]

  // Fill matrices
  for (let i = 0; i < n; i++) {
    for (let j = 0; j < m; j++) {
      if (i === 0 && j === 0) continue

      const candidates = []

      // Match moves
      if (i > 0 && j > 0) {
        candidates.push({ score: M[i-1][j-1] + sim[i][j], from: [i-1, j-1], type: 'M' })
        candidates.push({ score: X[i-1][j-1] + sim[i][j], from: [i-1, j-1], type: 'X' })
        candidates.push({ score: Y[i-1][j-1] + sim[i][j], from: [i-1, j-1], type: 'Y' })
      }

      // Knight moves if enabled
      if (knight) {
        if (i >= 2 && j >= 1) {
          candidates.push({ score: M[i-2][j-1] + sim[i][j], from: [i-2, j-1], type: 'M' })
        }
        if (i >= 1 && j >= 2) {
          candidates.push({ score: M[i-1][j-2] + sim[i][j], from: [i-1, j-2], type: 'M' })
        }
      }

      // Gap in Y (vertical)
      if (i > 0) {
        candidates.push({ score: M[i-1][j] - gap_onset, from: [i-1, j], type: 'X' })
        candidates.push({ score: X[i-1][j] - gap_extend, from: [i-1, j], type: 'X' })
      }

      // Gap in X (horizontal)
      if (j > 0) {
        candidates.push({ score: M[i][j-1] - gap_onset, from: [i, j-1], type: 'Y' })
        candidates.push({ score: Y[i][j-1] - gap_extend, from: [i, j-1], type: 'Y' })
      }

      // Find best
      const best = candidates.reduce((max, c) =>
        c.score > max.score ? c : max, { score: -Infinity })

      if (best.type === 'M' || best.type === 'match') {
        M[i][j] = best.score
        pointers[i][j] = best.from
      } else if (best.type === 'X') {
        X[i][j] = best.score
        pointers[i][j] = best.from
      } else if (best.type === 'Y') {
        Y[i][j] = best.score
        pointers[i][j] = best.from
      }
    }
  }

  // Combine scores
  const score = Array(n).fill(null).map((_, i) =>
    Array(m).fill(null).map((_, j) =>
      Math.max(M[i][j], X[i][j], Y[i][j])
    )
  )

  return { score, pointers }
}

/**
 * RQA path backtracking
 */
function __rqa_backtrack(score, pointers) {
  const n = score.length
  const m = score[0].length

  // Find maximum score position
  let max_i = n - 1, max_j = m - 1
  let max_score = score[max_i][max_j]

  for (let i = 0; i < n; i++) {
    for (let j = 0; j < m; j++) {
      if (score[i][j] > max_score) {
        max_score = score[i][j]
        max_i = i
        max_j = j
      }
    }
  }

  // Backtrack
  const path = [[max_i, max_j]]
  let i = max_i, j = max_j

  while (pointers[i][j] !== null) {
    [i, j] = pointers[i][j]
    path.unshift([i, j])
  }

  return path
}
