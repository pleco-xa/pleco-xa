import { _amax } from '../scripts/_arrstat.js'
/**
 * Dynamic time warping (DTW).
 *
 * Follows Müller, "Fundamentals of Music Processing" (2015):
 *
 *  - default step sizes [[1,1],[0,1],[1,0]] with zero additive and unit
 *    multiplicative weights;
 *  - custom `stepSizesSigma` are APPENDED to the defaults, and the default
 *    steps get infinite weights so they are never preferred (customs do not
 *    replace the defaults);
 *  - `weightsAdd` / `weightsMul` are honored in the forward pass;
 *  - step indices are RECORDED during cost accumulation and backtracking
 *    walks the recorded step matrix (greedy re-derivation from D is wrong
 *    under non-zero weights);
 *  - `subseq` (subsequence DTW) starts backtracking at argmin(D[-1, :]);
 *  - `globalConstraints` applies an absolute-radius Sakoe-Chiba band
 *    (`int(round(bandRad * min(C.shape)))`, off-diagonal offset compensated
 *    for non-square C), not a normalized-coordinate band.
 *
 * Fixture-gated against tools/parity/fixtures/dtw_segment.json
 * (case 1: D[-1][-1] within 1e-6 relative, warping path exact).
 *
 * All failures throw. No silent parameter drops: every accepted option is
 * either honored or rejected with an explicit error.
 */

const DEFAULT_STEPS = [
  [1, 1],
  [0, 1],
  [1, 0],
]

/**
 * Pairwise distance between column vectors of X (d×N) and Y (d×M),
 * mirroring the scipy.spatial.distance.cdist metrics.
 * @private
 */
function costMatrix(X, Y, metric) {
  const d = X.length
  if (Y.length !== d) {
    throw new Error(
      `dtw: X and Y must have the same feature dimension (got ${d} and ${Y.length})`,
    )
  }
  const N = X[0].length
  const M = Y[0].length
  for (const row of X) {
    if (row.length !== N) throw new Error('dtw: all rows of X must have equal length')
  }
  for (const row of Y) {
    if (row.length !== M) throw new Error('dtw: all rows of Y must have equal length')
  }

  const C = Array.from({ length: N }, () => new Float64Array(M))

  if (metric === 'euclidean' || metric === 'sqeuclidean') {
    const sq = metric === 'sqeuclidean'
    for (let i = 0; i < N; i++) {
      for (let j = 0; j < M; j++) {
        let sum = 0
        for (let f = 0; f < d; f++) {
          const diff = X[f][i] - Y[f][j]
          sum += diff * diff
        }
        C[i][j] = sq ? sum : Math.sqrt(sum)
      }
    }
  } else if (metric === 'cityblock' || metric === 'manhattan') {
    for (let i = 0; i < N; i++) {
      for (let j = 0; j < M; j++) {
        let sum = 0
        for (let f = 0; f < d; f++) sum += Math.abs(X[f][i] - Y[f][j])
        C[i][j] = sum
      }
    }
  } else if (metric === 'cosine') {
    for (let i = 0; i < N; i++) {
      for (let j = 0; j < M; j++) {
        let dot = 0
        let nx = 0
        let ny = 0
        for (let f = 0; f < d; f++) {
          dot += X[f][i] * Y[f][j]
          nx += X[f][i] * X[f][i]
          ny += Y[f][j] * Y[f][j]
        }
        const denom = Math.sqrt(nx) * Math.sqrt(ny)
        // scipy convention: cosine distance = 1 - u.v/(|u||v|)
        C[i][j] = denom > 0 ? 1 - dot / denom : 1
      }
    }
  } else {
    throw new Error(
      `dtw: metric='${metric}' is not supported ` +
        `(supported: 'euclidean', 'sqeuclidean', 'cityblock'/'manhattan', 'cosine')`,
    )
  }

  return C
}

/**
 * fill_off_diagonal: absolute-radius Sakoe-Chiba band, with
 * the radius expanded by |N - M| on the long side so (N-1, M-1) stays inside.
 * Modifies C in place.
 * @private
 */
function fillOffDiagonal(C, bandRad, value) {
  const nx = C.length
  const ny = C[0].length
  const radius = Math.round(bandRad * Math.min(nx, ny))
  const offset = Math.abs(nx - ny)

  // triu(k): j - i >= k ; tril(k): j - i <= k
  const kUpper = nx < ny ? radius + offset : radius
  const kLower = nx < ny ? -radius : -radius - offset
  for (let i = 0; i < nx; i++) {
    for (let j = 0; j < ny; j++) {
      if (j - i >= kUpper || j - i <= kLower) C[i][j] = value
    }
  }
}

/** Deep-copy a 2D matrix into Float64Array rows. @private */
function copyMatrix(C) {
  return C.map((row) => Float64Array.from(row))
}

/**
 * Backtrack a warping path from a recorded step matrix.
 * @private
 */
function backtrackSteps(steps, stepSizesSigma, subseq, start) {
  let cur =
    start == null
      ? [steps.length - 1, steps[0].length - 1]
      : [steps.length - 1, start]

  const wp = [[cur[0], cur[1]]]

  while (subseq ? cur[0] > 0 : cur[0] !== 0 || cur[1] !== 0) {
    const stepIdx = steps[cur[0]][cur[1]]
    cur = [
      cur[0] - stepSizesSigma[stepIdx][0],
      cur[1] - stepSizesSigma[stepIdx][1],
    ]
    if (Math.min(cur[0], cur[1]) < 0) break
    wp.push([cur[0], cur[1]])
  }

  return wp
}

/**
 * Dynamic time warping between two feature sequences (or a precomputed
 * cost matrix).
 *
 * @param {Array<Array<number>|Float32Array|Float64Array>|null} X
 *   Feature matrix, shape (d, N) — rows are features, columns are frames.
 *   Pass null when supplying `options.C`.
 * @param {Array<Array<number>|Float32Array|Float64Array>|null} Y
 *   Feature matrix, shape (d, M). Pass null when supplying `options.C`.
 * @param {Object} [options]
 * @param {Array<Array<number>>} [options.C=null] - precomputed cost matrix (N, M).
 *   Mutually exclusive with X/Y.
 * @param {string} [options.metric='euclidean']
 * @param {Array<Array<number>>} [options.stepSizesSigma=null] - custom steps,
 *   APPENDED to the defaults.
 * @param {Array<number>} [options.weightsAdd=null] - additive step weights.
 * @param {Array<number>} [options.weightsMul=null] - multiplicative step weights.
 * @param {boolean} [options.subseq=false] - subsequence DTW.
 * @param {boolean} [options.backtrack=true] - also return the warping path.
 * @param {boolean} [options.globalConstraints=false] - Sakoe-Chiba band.
 * @param {number} [options.bandRad=0.25] - band radius as a fraction of min(N, M).
 * @param {boolean} [options.returnSteps=false] - also return the step matrix.
 * @returns {{D: Float64Array[], wp?: number[][], steps?: Int32Array[]}}
 *   `D` is the (N, M) accumulated cost matrix (`D[N-1][M-1]` is the total
 *   alignment cost). `wp` (when backtrack) is the warping path from the end
 *   of the alignment down to its start.
 */
export function dtw(X = null, Y = null, options = {}) {
  const {
    C: Cin = null,
    metric = 'euclidean',
    stepSizesSigma = null,
    weightsAdd = null,
    weightsMul = null,
    subseq = false,
    backtrack = true,
    globalConstraints = false,
    bandRad = 0.25,
    returnSteps = false,
  } = options

  // --- Step sizes and weights (customs are appended to defaults) ---
  let steps
  let wAdd
  let wMul
  if (stepSizesSigma == null) {
    steps = DEFAULT_STEPS.map((s) => s.slice())
    wAdd = weightsAdd != null ? Array.from(weightsAdd) : [0, 0, 0]
    wMul = weightsMul != null ? Array.from(weightsMul) : [1, 1, 1]
  } else {
    const custom = Array.from(stepSizesSigma, (s) => [s[0], s[1]])
    const customAdd =
      weightsAdd != null ? Array.from(weightsAdd) : custom.map(() => 0)
    const customMul =
      weightsMul != null ? Array.from(weightsMul) : custom.map(() => 1)
    steps = DEFAULT_STEPS.map((s) => s.slice()).concat(custom)
    wAdd = [Infinity, Infinity, Infinity].concat(customAdd)
    wMul = [Infinity, Infinity, Infinity].concat(customMul)
  }

  for (const [s0, s1] of steps) {
    if (s0 < 0 || s1 < 0) {
      throw new Error('dtw: step_sizes_sigma cannot contain negative values')
    }
  }
  if (steps.length !== wAdd.length) {
    throw new Error('dtw: len(weights_add) must be equal to len(step_sizes_sigma)')
  }
  if (steps.length !== wMul.length) {
    throw new Error('dtw: len(weights_mul) must be equal to len(step_sizes_sigma)')
  }

  if (Cin == null && (X == null || Y == null)) {
    throw new Error('dtw: if C is not supplied, both X and Y must be supplied')
  }
  if (Cin != null && (X != null || Y != null)) {
    throw new Error('dtw: if C is supplied, both X and Y must not be supplied')
  }

  // --- Cost matrix ---
  let C
  let cIsTransposed = false
  const cLocal = Cin == null
  if (cLocal) {
    C = costMatrix(X, Y, metric)
    // subsequence matching: if N > M, Y can be a subsequence of X
    if (subseq && C.length > C[0].length) {
      const Ct = Array.from({ length: C[0].length }, (_, j) =>
        Float64Array.from({ length: C.length }, (_, i) => C[i][j]),
      )
      C = Ct
      cIsTransposed = true
    }
  } else {
    C = copyMatrix(Cin)
  }

  const N = C.length
  const M = C[0].length

  // Diagonal matching requires M >= N
  if (
    steps.length === 1 &&
    steps[0][0] === 1 &&
    steps[0][1] === 1 &&
    N > M
  ) {
    throw new Error(
      'dtw: for diagonal matching, Y must be at least as long as X (C.shape[1] >= C.shape[0])',
    )
  }

  for (let i = 0; i < N; i++) {
    for (let j = 0; j < M; j++) {
      if (Number.isNaN(C[i][j])) {
        throw new Error('dtw: cost matrix C has NaN values')
      }
    }
  }

  if (globalConstraints) {
    fillOffDiagonal(C, bandRad, Infinity)
  }

  const max0 = _amax(steps.map((s) => s[0]))
  const max1 = _amax(steps.map((s) => s[1]))

  // Padded accumulated-cost and step matrices
  const Dp = Array.from({ length: N + max0 }, () =>
    new Float64Array(M + max1).fill(Infinity),
  )
  Dp[max0][max1] = C[0][0]
  if (subseq) {
    for (let m = 0; m < M; m++) Dp[max0][max1 + m] = C[0][m]
  }

  const stepsP = Array.from({ length: N + max0 }, () => new Int32Array(M + max1))
  for (let m = 0; m < M + max1; m++) stepsP[0][m] = 1
  for (let n = 0; n < N + max0; n++) stepsP[n][0] = 2

  // --- Forward pass with recorded step indices (port of __dtw_calc_accu_cost) ---
  for (let n = max0; n < N + max0; n++) {
    for (let m = max1; m < M + max1; m++) {
      for (let s = 0; s < steps.length; s++) {
        const prev = Dp[n - steps[s][0]][m - steps[s][1]]
        const cost = prev + wMul[s] * C[n - max0][m - max1] + wAdd[s]
        if (cost < Dp[n][m]) {
          Dp[n][m] = cost
          stepsP[n][m] = s
        }
      }
    }
  }

  // Trim the padding
  const D = Dp.map((row) => row.subarray(max1)).slice(max0)
  const stepMatrix = stepsP.map((row) => row.subarray(max1)).slice(max0)

  const result = { D }

  if (backtrack) {
    let wp
    if (subseq) {
      let allInf = true
      let start = 0
      let best = Infinity
      for (let m = 0; m < M; m++) {
        if (D[N - 1][m] < best) {
          best = D[N - 1][m]
          start = m
          allInf = false
        }
      }
      if (allInf) {
        throw new Error(
          'dtw: no valid sub-sequence warping path could be constructed with the given step sizes',
        )
      }
      wp = backtrackSteps(stepMatrix, steps, true, start)
    } else {
      if (!Number.isFinite(D[N - 1][M - 1])) {
        throw new Error(
          'dtw: no valid warping path could be constructed with the given step sizes',
        )
      }
      wp = backtrackSteps(stepMatrix, steps, false, null)
      const last = wp[wp.length - 1]
      if (last[0] !== 0 || last[1] !== 0) {
        throw new Error(
          'dtw: unable to compute a full DTW warping path; try subseq=true',
        )
      }
    }

    // Undo the subsequence transposition on the returned index pairs
    if (
      subseq &&
      ((X != null && Y != null && X[0].length > Y[0].length) ||
        cIsTransposed ||
        N > M)
    ) {
      wp = wp.map(([a, b]) => [b, a])
    }

    result.wp = wp
  }

  if (returnSteps) {
    result.steps = stepMatrix
  }

  return result
}

/**
 * Backtrack a warping path from a recorded step matrix.
 *
 * @param {Int32Array[]|Array<Array<number>>} steps - step matrix from `dtw`
 *   (`returnSteps: true`).
 * @param {Object} [options]
 * @param {Array<Array<number>>} [options.stepSizesSigma=null] - the SAME
 *   custom steps passed to `dtw` (they are appended to the defaults here
 *   too, so index bookkeeping matches the forward pass).
 * @param {boolean} [options.subseq=false]
 * @param {number|null} [options.start=null] - start column (subseq only).
 * @returns {number[][]} warping path, end-to-start.
 */
export function dtwBacktracking(steps, options = {}) {
  const { stepSizesSigma = null, subseq = false, start = null } = options

  if (!subseq && start != null) {
    throw new Error(
      `dtwBacktracking: start is only allowed to be set if subseq is true (start=${start})`,
    )
  }

  let allSteps
  if (stepSizesSigma == null) {
    allSteps = DEFAULT_STEPS.map((s) => s.slice())
  } else {
    allSteps = DEFAULT_STEPS.map((s) => s.slice()).concat(
      Array.from(stepSizesSigma, (s) => [s[0], s[1]]),
    )
  }
  for (const [s0, s1] of allSteps) {
    if (s0 < 0 || s1 < 0) {
      throw new Error(
        'dtwBacktracking: step_sizes_sigma cannot contain negative values',
      )
    }
  }

  return backtrackSteps(steps, allSteps, subseq, start)
}
