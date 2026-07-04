/**
 * Normalized graph Laplacian — a line-faithful port of
 * `scipy.sparse.csgraph.laplacian(W, normed=True)` for a dense weight matrix
 * (scipy's `_laplacian_dense`, in-degree axis, `symmetrized=False`).
 *
 * The symmetric normalized Laplacian is
 *
 *     L = I − D^{-1/2} · W · D^{-1/2},    D = diag(rowsums(W))
 *
 * with scipy's exact conventions:
 *   1. The input diagonal is IGNORED — self-weights are zeroed before the
 *      degree sum (`np.fill_diagonal(m, 0)`), so `W[i][i]` never contributes.
 *   2. Degrees `w[i] = Σ_j W[i][j]` (diagonal already zeroed). scipy sums over
 *      axis 0 (in-degree); for a symmetric `W` this equals the row sum.
 *   3. Isolated nodes (`w[i] == 0`) get scaling factor 1 instead of √0, so
 *      their row/column is left unscaled and their diagonal entry becomes
 *      `1 − 1 = 0` (not 1). Every connected node gets diagonal `1`.
 *   4. Off-diagonal: `L[i][j] = −W[i][j] / (√w[i] · √w[j])`.
 *
 * Validated against committed reference fixtures — L within 1e-9, and
 * `eigh(L)` eigenvalues within 1e-6.
 *
 * Input is NEVER shape-guessed: pass a 2D matrix (array of rows) or a flat
 * row-major array with an explicit `{ flat, n }`. Non-square input throws.
 *
 * @module linalg/laplacian
 */

/**
 * Normalize input into a flat row-major Float64Array plus its dimension.
 * @private
 * @param {number[][]|Float64Array[]|{flat: ArrayLike<number>, n: number}} input
 * @returns {{ w: Float64Array, n: number }}
 */
function toMatrix(input) {
  if (input == null) {
    throw new Error('laplacian: W must be provided (2D array or { flat, n })')
  }

  if (
    !Array.isArray(input) &&
    !ArrayBuffer.isView(input) &&
    typeof input === 'object' &&
    'flat' in input
  ) {
    const { flat, n } = input
    if (!Number.isInteger(n) || n <= 0) {
      throw new Error(`laplacian: { flat, n } requires a positive integer n, got n=${n}`)
    }
    if (flat == null || flat.length !== n * n) {
      throw new Error(
        `laplacian: flat length ${flat == null ? 'null' : flat.length} does not match n*n=${n * n}`,
      )
    }
    return { w: Float64Array.from(flat), n }
  }

  if (Array.isArray(input) && (Array.isArray(input[0]) || ArrayBuffer.isView(input[0]))) {
    const n = input.length
    const w = new Float64Array(n * n)
    for (let i = 0; i < n; i++) {
      const row = input[i]
      if (!row || row.length !== n) {
        throw new Error(
          `laplacian: W must be square; row ${i} has length ${row ? row.length : 'null'}, expected ${n}`,
        )
      }
      for (let j = 0; j < n; j++) w[i * n + j] = row[j]
    }
    return { w, n }
  }

  throw new Error('laplacian: unrecognized W input — pass a 2D array or { flat, n }')
}

/**
 * Normalized graph Laplacian of a dense weight matrix.
 *
 * @param {number[][]|Float64Array[]|{flat: ArrayLike<number>, n: number}} W
 *   Weight/adjacency matrix as a 2D array of rows, or `{ flat, n }` (row-major).
 * @param {object} [opts]
 * @param {boolean} [opts.normed=true] When `true`, returns the symmetric
 *   normalized Laplacian `I − D^{-1/2} W D^{-1/2}`. When `false`, returns the
 *   combinatorial Laplacian `D − W` (both with scipy's zeroed-diagonal degrees).
 * @returns {number[][]} The n×n Laplacian as an array of Float64Array rows.
 */
export function laplacian(W, { normed = true } = {}) {
  const { w, n } = toMatrix(W)

  // Step 1: work on a copy with the diagonal zeroed (scipy ignores self-weights).
  const m = Float64Array.from(w)
  for (let i = 0; i < n; i++) m[i * n + i] = 0

  // Step 2: degrees w[i] = Σ_j m[i][j] (rowsum == colsum for symmetric W,
  // matching scipy's axis-0 in-degree).
  const deg = new Float64Array(n)
  for (let i = 0; i < n; i++) {
    let s = 0
    for (let j = 0; j < n; j++) s += m[i * n + j]
    deg[i] = s
  }

  const L = Array.from({ length: n }, () => new Float64Array(n))

  if (normed) {
    // Step 3: isolated-node handling — √0 replaced by scale 1.
    const isolated = new Uint8Array(n)
    const scale = new Float64Array(n)
    for (let i = 0; i < n; i++) {
      if (deg[i] === 0) {
        isolated[i] = 1
        scale[i] = 1
      } else {
        scale[i] = Math.sqrt(deg[i])
      }
    }
    // Step 4: L[i][j] = -m[i][j] / (scale[i]*scale[j]); diagonal = 1 - isolated.
    for (let i = 0; i < n; i++) {
      for (let j = 0; j < n; j++) {
        L[i][j] = -m[i * n + j] / (scale[i] * scale[j])
      }
      L[i][i] = 1 - isolated[i]
    }
  } else {
    // Combinatorial Laplacian D - W (diagonal-zeroed degrees).
    for (let i = 0; i < n; i++) {
      for (let j = 0; j < n; j++) {
        L[i][j] = -m[i * n + j]
      }
      L[i][i] = deg[i]
    }
  }

  return L
}
