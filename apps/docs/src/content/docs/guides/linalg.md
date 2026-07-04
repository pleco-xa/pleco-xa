---
title: Linalg — symmetric eigendecomposition and graph Laplacian
description: pleco-xa's linalg namespace — a pure-JS symmetric eigensolver (Jacobi) and the normalized graph Laplacian, the primitives behind Laplacian segmentation.
---

`linalg` is pleco-xa's small, exact linear-algebra corner: a symmetric-matrix eigensolver
and the normalized graph Laplacian. These are the two dependency-free primitives that the
[Laplacian segmentation](/api/pleco-xa/namespaces/segment/functions/laplaciansegmentation/)
pipeline surfaced — pure JavaScript, no native BLAS, and numerically matched to SciPy's
output so the structural-clustering demo produces the same boundaries in Node and the
browser.

Both are fixture-gated against `linalg.json`: `eigh` reconstructs to 1e-16 with
eigenvalues within 1e-6, and `laplacian` matches `scipy.sparse.csgraph.laplacian` to 1e-9.

## Key functions

Verified against the built barrel (`linalg` namespace):

- **`eigh(input, opts)`** → `{ values, vectors }`. Symmetric eigendecomposition via cyclic
  Jacobi (Golub & Van Loan §8.4), matching `scipy.linalg.eigh`: eigenvalues ascending,
  eigenvectors orthonormal. `vectors[i][k]` is component `i` of the eigenvector for
  `values[k]` (SciPy's column convention).
- **`laplacian(W, opts)`** → `Float64Array[]`. `normed: true` (default) returns the symmetric
  normalized Laplacian `I − D^{-1/2} W D^{-1/2}`; `normed: false` returns the combinatorial
  `D − W`.

## Example

```js
import { linalg } from 'pleco-xa'

// A weighted adjacency matrix (symmetric):
const W = [
  [0, 1, 1],
  [1, 0, 1],
  [1, 1, 0],
]

const L = linalg.laplacian(W, { normed: true })
const { values, vectors } = linalg.eigh(L)
// values are ascending; the Fiedler vector is column 1 of `vectors`
const fiedler = vectors.map((row) => row[1])
```

## Notes

- **Input is never shape-guessed.** Pass a 2D matrix (array of rows) or a flat row-major
  array with explicit `{ flat, n }`. Non-square input throws.
- **`eigh` requires a genuinely symmetric matrix** and throws on the worst offending pair if
  the two triangles disagree beyond tolerance — SciPy reads only one triangle, but pleco
  verifies the full matrix so the returned decomposition actually reconstructs your input.
  Eigenvector signs are not canonicalised (the sign gauge is not part of the spectrum).
- **`laplacian` follows SciPy's conventions exactly:** the input diagonal is ignored
  (self-weights zeroed before the degree sum), and isolated nodes (degree 0) get a scale
  factor of 1, so their diagonal entry becomes `0` rather than `1`.
- Jacobi throws rather than returning an unconverged result if it exceeds `maxSweeps`
  (default 100) — raise it for ill-conditioned matrices.

## API reference

Full signatures: [linalg namespace](/api-by-category/) — namely
[`eigh`](/api/pleco-xa/namespaces/linalg/functions/eigh/) and
[`laplacian`](/api/pleco-xa/namespaces/linalg/functions/laplacian/).
