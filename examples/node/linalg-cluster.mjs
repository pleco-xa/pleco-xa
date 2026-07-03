/**
 * linalg/ + cluster/ — the three flagship primitives behind McFee-Ellis
 * Laplacian segmentation, each proven DIRECTLY against a hand-computed answer
 * (not just via the segmentation pipeline that consumes them).
 *
 *   linalg.eigh — symmetric eigendecomposition (scipy.linalg.eigh).
 *     A = [[2,1],[1,2]] has the textbook spectrum {1, 3} with eigenvectors
 *     [1,-1]/√2 and [1,1]/√2. We assert the eigenvalues to 1e-9, then prove the
 *     decomposition reconstructs A (V·diag(λ)·Vᵀ) and is orthonormal (VᵀV = I),
 *     and that eigh throws on a non-symmetric matrix (failure path).
 *
 *   linalg.laplacian — normalized graph Laplacian (scipy csgraph.laplacian,
 *     normed=True). The complete graph K3 is 2-regular, so every row of the
 *     symmetric normalized Laplacian sums to exactly 0 and the smallest
 *     eigenvalue is 0 (the D^{1/2}·1 mode) — we chain eigh(laplacian(K3)) to
 *     prove it. The isolated-node convention (diagonal 0, not 1) and the
 *     combinatorial variant (D − W) are checked against their hand values.
 *
 *   cluster.kmeans — Lloyd + k-means++ (sklearn.cluster.KMeans). Two blatantly
 *     separated blobs must split into the two obvious clusters: the three
 *     near-origin points share a label, the three near (10,10) share the OTHER
 *     label, centers land on the blob means, inertia is tiny, the run is
 *     seed-deterministic, and k > nSamples throws (failure path).
 */
import { linalg, cluster } from '../../packages/pleco-xa/dist/pleco-xa.js'
import { check, checkTrue, summary } from './_harness.mjs'

// ── linalg.eigh — 2×2 symmetric vs hand-computed eigenpair + reconstruction ──
{
  const A = [[2, 1], [1, 2]]
  const { values, vectors } = linalg.eigh(A)
  check('eigh([[2,1],[1,2]]).values == [1, 3] (ascending)',
    Array.from(values), [1, 3], 1e-9)

  // Column k is the unit eigenvector for values[k]: λ=1 → [1,-1]/√2 (components
  // sum to 0), λ=3 → [1,1]/√2 (components equal). Sign gauge is free, so test
  // gauge-invariant shape.
  const col = (k) => [vectors[0][k], vectors[1][k]]
  const [x0, y0] = col(0)
  const [x1, y1] = col(1)
  checkTrue('eigenvector for λ=1 is ∝ [1,-1] (components sum to 0)',
    Math.abs(x0 + y0) < 1e-9, `[${x0.toFixed(4)}, ${y0.toFixed(4)}]`)
  checkTrue('eigenvector for λ=3 is ∝ [1,1] (components equal)',
    Math.abs(x1 - y1) < 1e-9, `[${x1.toFixed(4)}, ${y1.toFixed(4)}]`)

  // Reconstruction: A[i][j] == Σ_k V[i][k]·λ[k]·V[j][k].
  let reconErr = 0
  for (let i = 0; i < 2; i++)
    for (let j = 0; j < 2; j++) {
      let s = 0
      for (let k = 0; k < 2; k++) s += vectors[i][k] * values[k] * vectors[j][k]
      reconErr = Math.max(reconErr, Math.abs(s - A[i][j]))
    }
  checkTrue('V·diag(λ)·Vᵀ reconstructs A (err < 1e-9)', reconErr < 1e-9, reconErr.toExponential(3))

  // Orthonormality: VᵀV == I.
  let orthoErr = 0
  for (let a = 0; a < 2; a++)
    for (let b = 0; b < 2; b++) {
      let s = 0
      for (let i = 0; i < 2; i++) s += vectors[i][a] * vectors[i][b]
      orthoErr = Math.max(orthoErr, Math.abs(s - (a === b ? 1 : 0)))
    }
  checkTrue('VᵀV == I (orthonormal basis, err < 1e-9)', orthoErr < 1e-9, orthoErr.toExponential(3))

  // Failure path: a non-symmetric matrix is refused, not silently one-triangled.
  let threw = false
  try { linalg.eigh([[1, 2], [3, 4]]) } catch { threw = true }
  checkTrue('eigh throws on a non-symmetric matrix', threw)
}

// ── linalg.laplacian — row-sum / normalization property + eigh chain ─────────
{
  const K3 = [[0, 1, 1], [1, 0, 1], [1, 1, 0]] // complete graph, 2-regular
  const L = linalg.laplacian(K3) // normed:true by default

  // Hand value: diagonal 1, every off-diagonal −1/√(2·2) = −0.5.
  check('normalized L diagonal == [1,1,1]',
    [L[0][0], L[1][1], L[2][2]], [1, 1, 1], 1e-12)
  checkTrue('normalized L off-diagonals == −0.5 (−W/√(deg·deg))',
    [L[0][1], L[0][2], L[1][2]].every((v) => Math.abs(v + 0.5) < 1e-9),
    `[${L[0][1].toFixed(4)}, ${L[0][2].toFixed(4)}, ${L[1][2].toFixed(4)}]`)

  // Normalization property: for a REGULAR graph every row of the symmetric
  // normalized Laplacian sums to exactly 0 (the D^{1/2}·1 mode is a 0-eigenmode).
  const rowSums = L.map((r) => r[0] + r[1] + r[2])
  checkTrue('each row of the 2-regular normalized L sums to 0',
    rowSums.every((s) => Math.abs(s) < 1e-9), `[${rowSums.map((s) => s.toExponential(1)).join(', ')}]`)

  // Chain into eigh: the connected graph's smallest normalized-Laplacian
  // eigenvalue is exactly 0, and the spectrum tops out below 2.
  const { values } = linalg.eigh(L)
  checkTrue('eigh(laplacian(K3)).values[0] == 0 (Fiedler floor)',
    Math.abs(values[0]) < 1e-9, values[0].toExponential(3))
  checkTrue('all normalized-Laplacian eigenvalues lie in [0, 2]',
    Array.from(values).every((v) => v >= -1e-9 && v <= 2 + 1e-9), `[${Array.from(values).map((v) => v.toFixed(3)).join(', ')}]`)

  // Isolated-node convention (scipy): a 0-degree node keeps diagonal 0, not 1.
  const Wiso = [[0, 1, 0], [1, 0, 0], [0, 0, 0]]
  const Liso = linalg.laplacian(Wiso)
  check('isolated node keeps diagonal 0 (scipy √0→scale 1 convention)', Liso[2][2], 0)
  check('connected nodes keep diagonal 1', [Liso[0][0], Liso[1][1]], [1, 1], 1e-12)

  // Combinatorial variant D − W: K3 gives diagonal degree 2, off-diagonals −1.
  const Lc = linalg.laplacian(K3, { normed: false })
  check('combinatorial L = D − W for K3 == [[2,-1,-1],[-1,2,-1],[-1,-1,2]]',
    Lc.map((r) => Array.from(r)), [[2, -1, -1], [-1, 2, -1], [-1, -1, 2]], 1e-12)
  check('eigh(combinatorial L).values == [0, 3, 3]',
    Array.from(linalg.eigh(Lc).values), [0, 3, 3], 1e-9)
}

// ── cluster.kmeans — two obvious clusters → correct labels ───────────────────
{
  const X = [
    [0, 0], [0.1, 0.1], [-0.1, 0.05], // blob A near origin
    [10, 10], [10.1, 9.9], [9.9, 10.05], // blob B near (10,10)
  ]
  const { labels, centers, inertia } = cluster.kmeans(X, 2, { seed: 1 })

  const lab = Array.from(labels)
  checkTrue('blob A (rows 0-2) share one label', lab[0] === lab[1] && lab[1] === lab[2], `[${lab.slice(0, 3)}]`)
  checkTrue('blob B (rows 3-5) share one label', lab[3] === lab[4] && lab[4] === lab[5], `[${lab.slice(3)}]`)
  checkTrue('the two blobs get DIFFERENT labels', lab[0] !== lab[3], `A=${lab[0]} B=${lab[3]}`)

  // Centers land on the blob means regardless of label ordering.
  const centerFor = (label) => centers[label]
  const cA = centerFor(lab[0])
  const cB = centerFor(lab[3])
  checkTrue('blob A centroid ≈ (0, 0.05)', Math.hypot(cA[0] - 0, cA[1] - 0.05) < 0.1, `(${cA[0].toFixed(3)}, ${cA[1].toFixed(3)})`)
  checkTrue('blob B centroid ≈ (10, 9.98)', Math.hypot(cB[0] - 10, cB[1] - 9.983) < 0.1, `(${cB[0].toFixed(3)}, ${cB[1].toFixed(3)})`)
  checkTrue('inertia is tiny (< 0.2) for cleanly separated blobs', inertia < 0.2, inertia.toExponential(3))

  // Determinism: same seed → bit-identical labels.
  const rerun = cluster.kmeans(X, 2, { seed: 1 })
  checkTrue('same seed → identical labels (deterministic)',
    JSON.stringify(Array.from(rerun.labels)) === JSON.stringify(lab))

  // Failure path: k cannot exceed the sample count.
  let threw = false
  try { cluster.kmeans([[0, 0]], 5) } catch { threw = true }
  checkTrue('kmeans throws when k > nSamples', threw)
}

summary('linalg.eigh + linalg.laplacian + cluster.kmeans — flagship primitives (direct)')
