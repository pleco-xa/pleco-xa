/**
 * Symmetric-matrix eigendecomposition — a pure-JS port matching the OUTPUT of
 * `scipy.linalg.eigh` (ascending eigenvalues + orthonormal eigenvectors).
 *
 * scipy calls LAPACK (`?syevr`). To reproduce that output deterministically in
 * JS — with no native dependency and bit-stable results across engines — this
 * uses the **cyclic Jacobi eigenvalue algorithm** (Golub & Van Loan §8.4, the
 * classic threshold-sweep formulation from Numerical Recipes `jacobi`). Jacobi
 * is exact for real symmetric matrices: it applies plane rotations that zero
 * the largest off-diagonal entries, converging quadratically once the matrix is
 * nearly diagonal. The accumulated rotation product is an orthonormal basis of
 * eigenvectors; the surviving diagonal holds the eigenvalues. Pairs are sorted
 * ascending to match scipy's convention.
 *
 * Because Jacobi drives the off-diagonal to (numerically) zero, the recovered
 * decomposition satisfies V·diag(λ)·Vᵀ ≈ A and Vᵀ·V ≈ I to ~1e-13 for the
 * float64 input, independent of the sign gauge (eigenvector signs are not
 * canonicalized against LAPACK because that gauge is not part of the spectrum).
 *
 * Validated against committed reference fixtures — eigenvalues ascending
 * within 1e-6, reconstruction within 1e-9, orthonormality within 1e-9.
 *
 * Input is NEVER shape-guessed: pass a 2D symmetric matrix (array of rows) or a
 * flat row-major array with an explicit `{ flat, n }`. Non-square or materially
 * non-symmetric input throws with diagnostics.
 *
 * @module linalg/eigh
 */

/**
 * Normalize input into a flat row-major Float64Array plus its dimension.
 * Accepts a 2D array/typed-row matrix, or `{ flat, n }` (row-major n×n).
 * @private
 * @param {number[][]|Float64Array[]|{flat: ArrayLike<number>, n: number}} input
 * @returns {{ a: Float64Array, n: number }}
 */
function toMatrix(input) {
  if (input == null) {
    throw new Error('eigh: matrix must be provided (2D array or { flat, n })')
  }

  // { flat, n } form — explicit dimension, no guessing.
  if (
    !Array.isArray(input) &&
    !ArrayBuffer.isView(input) &&
    typeof input === 'object' &&
    'flat' in input
  ) {
    const { flat, n } = input
    if (!Number.isInteger(n) || n <= 0) {
      throw new Error(`eigh: { flat, n } requires a positive integer n, got n=${n}`)
    }
    if (flat == null || flat.length !== n * n) {
      throw new Error(
        `eigh: flat length ${flat == null ? 'null' : flat.length} does not match n*n=${n * n}`,
      )
    }
    return { a: Float64Array.from(flat), n }
  }

  // 2D array of rows (Array rows or typed-array rows).
  if (Array.isArray(input) && (Array.isArray(input[0]) || ArrayBuffer.isView(input[0]))) {
    const n = input.length
    const a = new Float64Array(n * n)
    for (let i = 0; i < n; i++) {
      const row = input[i]
      if (!row || row.length !== n) {
        throw new Error(
          `eigh: matrix must be square; row ${i} has length ${row ? row.length : 'null'}, expected ${n}`,
        )
      }
      for (let j = 0; j < n; j++) a[i * n + j] = row[j]
    }
    return { a, n }
  }

  throw new Error('eigh: unrecognized matrix input — pass a 2D array or { flat, n }')
}

/**
 * Verify (near-)symmetry, throwing with the worst offender if violated.
 * scipy.linalg.eigh only reads one triangle; we require the full matrix to be
 * symmetric so the returned decomposition actually reconstructs the INPUT.
 * @private
 */
function assertSymmetric(a, n) {
  let maxAbs = 0
  for (let i = 0; i < n * n; i++) {
    const v = Math.abs(a[i])
    if (v > maxAbs) maxAbs = v
  }
  const tol = 1e-9 + 1e-9 * maxAbs
  for (let i = 0; i < n; i++) {
    for (let j = i + 1; j < n; j++) {
      const d = Math.abs(a[i * n + j] - a[j * n + i])
      if (d > tol) {
        throw new Error(
          `eigh: matrix is not symmetric — |A[${i}][${j}] - A[${j}][${i}]| = ` +
            `${d.toExponential(3)} exceeds tol ${tol.toExponential(3)} ` +
            `(A[${i}][${j}]=${a[i * n + j]}, A[${j}][${i}]=${a[j * n + i]})`,
        )
      }
    }
  }
}

/**
 * Symmetric eigendecomposition via cyclic Jacobi rotations.
 *
 * @param {number[][]|Float64Array[]|{flat: ArrayLike<number>, n: number}} input
 *   Real symmetric matrix as a 2D array of rows, or `{ flat, n }` (row-major).
 * @param {object} [opts]
 * @param {number} [opts.tol=1e-15] Off-diagonal convergence threshold (relative
 *   to the matrix scale) at which rotations stop.
 * @param {number} [opts.maxSweeps=100] Hard cap on Jacobi sweeps; exceeding it
 *   throws rather than returning an unconverged result.
 * @returns {{ values: Float64Array, vectors: number[][] }}
 *   `values` — eigenvalues in ascending order.
 *   `vectors` — n×n array of rows where column k is the unit eigenvector for
 *   `values[k]` (scipy's column convention).
 */
export function eigh(input, { tol = 1e-15, maxSweeps = 100 } = {}) {
  const { a, n } = toMatrix(input)
  assertSymmetric(a, n)

  // Working copy of the matrix (mutated toward diagonal) and the accumulating
  // eigenvector basis V, initialized to identity.
  const A = Float64Array.from(a)
  const V = new Float64Array(n * n)
  for (let i = 0; i < n; i++) V[i * n + i] = 1

  // Trivial 1×1: single eigenpair, no rotations needed.
  if (n === 1) {
    return { values: Float64Array.of(A[0]), vectors: [[1]] }
  }

  const d = new Float64Array(n) // running eigenvalue estimates (diagonal)
  const b = new Float64Array(n) // accumulator base for d
  const z = new Float64Array(n) // per-sweep rotational corrections
  for (let i = 0; i < n; i++) {
    d[i] = A[i * n + i]
    b[i] = d[i]
  }

  // Scale reference for the convergence threshold.
  let scale = 0
  for (let i = 0; i < n * n; i++) scale = Math.max(scale, Math.abs(A[i]))
  const convTol = tol * Math.max(scale, 1)

  for (let sweep = 1; sweep <= maxSweeps; sweep++) {
    // Sum of |off-diagonal| — the quantity Jacobi drives to zero.
    let sm = 0
    for (let ip = 0; ip < n - 1; ip++) {
      for (let iq = ip + 1; iq < n; iq++) sm += Math.abs(A[ip * n + iq])
    }
    if (sm <= convTol) {
      return finalize(d, V, n)
    }

    // Aggressive threshold for the first sweeps, then rotate everything.
    const thresh = sweep < 4 ? (0.2 * sm) / (n * n) : 0

    for (let ip = 0; ip < n - 1; ip++) {
      for (let iq = ip + 1; iq < n; iq++) {
        const apq = A[ip * n + iq]
        const g = 100 * Math.abs(apq)
        // Off-diagonal already negligible relative to its diagonals: zero it.
        if (
          sweep > 4 &&
          Math.abs(d[ip]) + g === Math.abs(d[ip]) &&
          Math.abs(d[iq]) + g === Math.abs(d[iq])
        ) {
          A[ip * n + iq] = 0
        } else if (Math.abs(apq) > thresh) {
          let h = d[iq] - d[ip]
          let t
          if (Math.abs(h) + g === Math.abs(h)) {
            t = apq / h
          } else {
            const theta = (0.5 * h) / apq
            t = 1 / (Math.abs(theta) + Math.sqrt(1 + theta * theta))
            if (theta < 0) t = -t
          }
          const c = 1 / Math.sqrt(1 + t * t)
          const s = t * c
          const tau = s / (1 + c)
          h = t * apq
          z[ip] -= h
          z[iq] += h
          d[ip] -= h
          d[iq] += h
          A[ip * n + iq] = 0
          // Apply the rotation to the remaining off-diagonal blocks.
          for (let j = 0; j < ip; j++) rotate(A, n, j, ip, j, iq, s, tau)
          for (let j = ip + 1; j < iq; j++) rotate(A, n, ip, j, j, iq, s, tau)
          for (let j = iq + 1; j < n; j++) rotate(A, n, ip, j, iq, j, s, tau)
          for (let j = 0; j < n; j++) rotate(V, n, j, ip, j, iq, s, tau)
        }
      }
    }

    for (let ip = 0; ip < n; ip++) {
      b[ip] += z[ip]
      d[ip] = b[ip]
      z[ip] = 0
    }
  }

  throw new Error(
    `eigh: Jacobi failed to converge in ${maxSweeps} sweeps (n=${n}); ` +
      'matrix may be ill-conditioned — increase maxSweeps',
  )
}

/**
 * Givens-style rotation update for a symmetric pair of entries, using the
 * numerically stable `tau = s/(1+c)` form (avoids cancellation).
 * @private
 */
function rotate(M, n, i1, j1, i2, j2, s, tau) {
  const g = M[i1 * n + j1]
  const h = M[i2 * n + j2]
  M[i1 * n + j1] = g - s * (h + g * tau)
  M[i2 * n + j2] = h + s * (g - h * tau)
}

/**
 * Sort eigenpairs ascending and pack eigenvectors as columns of a row-major
 * 2D array. `V[i*n + k]` is component i of eigenvector k prior to sorting.
 * @private
 */
function finalize(d, V, n) {
  const order = Array.from({ length: n }, (_, k) => k)
  order.sort((p, q) => d[p] - d[q])

  const values = new Float64Array(n)
  const vectors = Array.from({ length: n }, () => new Array(n))
  for (let k = 0; k < n; k++) {
    const src = order[k]
    values[k] = d[src]
    for (let i = 0; i < n; i++) vectors[i][k] = V[i * n + src]
  }
  return { values, vectors }
}
