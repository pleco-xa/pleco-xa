/**
 * Linear-algebra primitives — pure-JS ports matching scipy's numeric output.
 *
 *  - `eigh` — symmetric-matrix eigendecomposition (ascending eigenvalues +
 *    orthonormal eigenvectors) via the cyclic Jacobi algorithm, matching
 *    `scipy.linalg.eigh`.
 *  - `laplacian` — normalized graph Laplacian `I − D^{-1/2} W D^{-1/2}`,
 *    matching `scipy.sparse.csgraph.laplacian(W, normed=True)` including
 *    scipy's zeroed-diagonal degrees and isolated-node convention.
 *
 * Validated against committed reference fixtures.
 *
 * @module linalg
 */

export { eigh } from './eigh.js'
export { laplacian } from './laplacian.js'
