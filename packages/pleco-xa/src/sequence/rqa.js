/**
 * Recurrence quantification analysis (RQA).
 *
 * Implements the methods of Serrà, Serra & Andrzejak (2009): dynamic
 * programming over a self- or cross-similarity matrix, maximizing alignment
 * value, with optional chess-knight moves and gap penalties.
 *
 * Unlike DTW, alignment paths here are MAXIMIZED, so the input must measure
 * similarity, not distance.
 *
 * Validated against committed reference fixtures
 * (exact path agreement + score max).
 *
 * @param {Array<Array<number>|Float32Array|Float64Array>} sim
 *   Similarity matrix, shape (N, M), non-negative, N ≥ 2 and M ≥ 2.
 * @param {Object} [options]
 * @param {number} [options.gapOnset=1] - penalty for introducing a gap (must be ≥ 0)
 * @param {number} [options.gapExtend=1] - penalty for extending a gap (must be ≥ 0)
 * @param {boolean} [options.knightMoves=true] - allow (−1,−2)/(−2,−1) moves
 * @param {boolean} [options.backtrack=true] - also return the optimal path
 * @returns {{score: Float64Array[], path?: number[][]}}
 *   `score[n][m]` is the cumulative value of the best alignment ending at
 *   (n, m). When `backtrack` is true, `path` is an array of [n, m] pairs
 *   (possibly empty when there is no positive alignment at all).
 */
export function rqa(
  sim,
  { gapOnset = 1, gapExtend = 1, knightMoves = true, backtrack = true } = {},
) {
  if (gapOnset < 0) {
    throw new Error(`rqa: gapOnset=${gapOnset} must be strictly positive`)
  }
  if (gapExtend < 0) {
    throw new Error(`rqa: gapExtend=${gapExtend} must be strictly positive`)
  }
  if (!Array.isArray(sim) || sim.length < 2 || !sim[0] || sim[0].length < 2) {
    throw new Error('rqa: sim must be a 2D matrix with shape at least (2, 2)')
  }
  const N = sim.length
  const M = sim[0].length
  for (const row of sim) {
    if (!row || row.length !== M) {
      throw new Error('rqa: all rows of sim must have equal length')
    }
  }

  const { score, pointers } = rqaDp(sim, N, M, gapOnset, gapExtend, knightMoves)

  if (backtrack) {
    return { score, path: rqaBacktrack(score, pointers, N, M) }
  }
  return { score }
}

/**
 * RQA dynamic-programming core.
 *
 * Backtracking rubric:
 *    0 ==> diagonal move (-1, -1)
 *    1 ==> knight move (-1, -2)
 *    2 ==> knight move (-2, -1)
 *   -1 ==> reset without inclusion
 *   -2 ==> reset with inclusion (positive value at init)
 */
function rqaDp(sim, N, M, gapOnset, gapExtend, knight) {
  const score = Array.from({ length: N }, () => new Float64Array(M))
  const pointers = Array.from({ length: N }, () => new Int8Array(M))

  // Placeholder vectors indexed as [(-1,-1), (-1,-2), (-2,-1)]
  const simValues = new Float64Array(3)
  const scoreValues = new Float64Array(3)
  const vec = new Float64Array(3)

  const initLimit = knight ? 2 : 1
  const limit = knight ? 3 : 1

  // np.argmax semantics: first index of the maximum
  const argmax = (arr, n) => {
    let best = 0
    for (let i = 1; i < n; i++) {
      if (arr[i] > arr[best]) best = i
    }
    return best
  }

  // Initialize the first row and column with the data
  for (let j = 0; j < M; j++) score[0][j] = sim[0][j]
  for (let i = 0; i < N; i++) score[i][0] = sim[i][0]

  // First row/column backtracking: resets, inclusive when sim > 0
  for (let i = 0; i < N; i++) pointers[i][0] = sim[i][0] ? -2 : -1
  for (let j = 0; j < M; j++) pointers[0][j] = sim[0][j] ? -2 : -1

  // Initialize the (1, 1) case using only the diagonal
  if (sim[1][1] > 0) {
    score[1][1] = score[0][0] + sim[1][1]
    pointers[1][1] = 0
  } else {
    const link = sim[0][0] > 0
    score[1][1] = Math.max(
      0,
      score[0][0] - (link ? gapOnset : 0) - (link ? 0 : gapExtend),
    )
    pointers[1][1] = score[1][1] > 0 ? 0 : -1
  }

  // Initialize the second row with diagonal and left-knight moves
  {
    const i = 1
    for (let j = 2; j < M; j++) {
      scoreValues[0] = score[i - 1][j - 1]
      scoreValues[1] = score[i - 1][j - 2]
      simValues[0] = sim[i - 1][j - 1]
      simValues[1] = sim[i - 1][j - 2]
      if (sim[i][j] > 0) {
        pointers[i][j] = argmax(scoreValues, initLimit)
        score[i][j] = scoreValues[pointers[i][j]] + sim[i][j]
      } else {
        for (let t = 0; t < initLimit; t++) {
          vec[t] =
            scoreValues[t] - (simValues[t] > 0 ? gapOnset : gapExtend)
        }
        pointers[i][j] = argmax(vec, initLimit)
        score[i][j] = Math.max(0, vec[pointers[i][j]])
        if (score[i][j] === 0) pointers[i][j] = -1
      }
    }
  }

  // Initialize the second column with diagonal and up-knight moves
  {
    const j = 1
    for (let i = 2; i < N; i++) {
      scoreValues[0] = score[i - 1][j - 1]
      scoreValues[1] = score[i - 2][j - 1]
      simValues[0] = sim[i - 1][j - 1]
      simValues[1] = sim[i - 2][j - 1]
      if (sim[i][j] > 0) {
        pointers[i][j] = argmax(scoreValues, initLimit)
        score[i][j] = scoreValues[pointers[i][j]] + sim[i][j]
      } else {
        for (let t = 0; t < initLimit; t++) {
          vec[t] =
            scoreValues[t] - (simValues[t] > 0 ? gapOnset : gapExtend)
        }
        pointers[i][j] = argmax(vec, initLimit)
        score[i][j] = Math.max(0, vec[pointers[i][j]])
        if (score[i][j] === 0) pointers[i][j] = -1
      }
    }
  }

  // Fill in the rest of the table
  for (let i = 2; i < N; i++) {
    for (let j = 2; j < M; j++) {
      scoreValues[0] = score[i - 1][j - 1]
      scoreValues[1] = score[i - 1][j - 2]
      scoreValues[2] = score[i - 2][j - 1]
      simValues[0] = sim[i - 1][j - 1]
      simValues[1] = sim[i - 1][j - 2]
      simValues[2] = sim[i - 2][j - 1]
      if (sim[i][j] > 0) {
        pointers[i][j] = argmax(scoreValues, limit)
        score[i][j] = scoreValues[pointers[i][j]] + sim[i][j]
      } else {
        for (let t = 0; t < limit; t++) {
          vec[t] = scoreValues[t] - (simValues[t] > 0 ? gapOnset : gapExtend)
        }
        pointers[i][j] = argmax(vec, limit)
        score[i][j] = Math.max(0, vec[pointers[i][j]])
        if (score[i][j] === 0) pointers[i][j] = -1
      }
    }
  }

  return { score, pointers }
}

/**
 * RQA path backtracking.
 */
function rqaBacktrack(score, pointers, N, M) {
  const offsets = [
    [-1, -1],
    [-1, -2],
    [-2, -1],
  ]

  // np.argmax over the flattened (row-major) score: first occurrence of max
  let bi = 0
  let bj = 0
  let bv = -Infinity
  for (let i = 0; i < N; i++) {
    for (let j = 0; j < M; j++) {
      if (score[i][j] > bv) {
        bv = score[i][j]
        bi = i
        bj = j
      }
    }
  }

  const path = []
  let idx = [bi, bj]
  for (;;) {
    const bt = pointers[idx[0]][idx[1]]

    // -1: non-inclusive reset (sim == 0 here) — path ends
    if (bt === -1) break

    path.unshift([idx[0], idx[1]])

    // -2: beginning of sequence — can't backtrack further
    if (bt === -2) break

    idx = [idx[0] + offsets[bt][0], idx[1] + offsets[bt][1]]
  }

  return path
}
