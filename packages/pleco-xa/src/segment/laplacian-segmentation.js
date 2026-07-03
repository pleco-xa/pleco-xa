/**
 * Laplacian structural segmentation — McFee & Ellis (2014),
 * "Analyzing song structure with spectral clustering" (ISMIR).
 *
 * Implements the McFee & Ellis spectral-clustering recipe (the half after the
 * CQT/beat-sync feature stage), composed entirely from pleco's own
 * primitives:
 *
 *   1. `segment.recurrenceMatrix(feats, mode='affinity', width, sym=true)`
 *      builds the weighted recurrence affinity S_rep (Eq. 1, after Eq. 8).
 *   2. A diagonal-enhancing median filter in the **time-lag domain**
 *      (`recurrenceToLag → median(size=(1,7), reflect) → lagToRecurrence`,
 *      i.e. a `timelag_filter(scipy.ndimage.median_filter)`) yields Rf
 *      (Eq. 2).
 *   3. The sequential path matrix R_path (S_loc) is the tridiagonal chain
 *      `R_path[i, i±1] = exp(-‖f_{i+1} − f_i‖² / σ²)`, σ = median successive
 *      distance (after Eq. 8).
 *   4. Balanced combination `A = μ·Rf + (1−μ)·R_path` (Eqs. 6, 7, 9). Unlike the
 *      example — which derives μ from the graph degrees — μ is an explicit knob
 *      here (default 0.5), matching the requested public signature.
 *   5. Symmetric normalized Laplacian `L = I − D^{-1/2} A D^{-1/2}`
 *      (`linalg.laplacian(A, normed=true)`, Eq. 10).
 *   6. Eigendecomposition `linalg.eigh(L)` (ascending), then a
 *      `median(size=(9,1), reflect)` smoother down each eigenvector to iron out
 *      small discontinuities.
 *   7. Cumulative-norm normalization of the first k eigenvectors
 *      `Cnorm = cumsum(evecs², axis=1)^{1/2}; X = evecs[:, :k] / Cnorm[:, k-1]`
 *      (the symmetric-Laplacian row normalization).
 *   8. `cluster.kmeans(X, k)` → per-frame segment ids (Algorithm 1).
 *   9. Boundaries `1 + where(seg[:-1] ≠ seg[1:])` — the internal transitions.
 *
 * scipy detail reproduced: `scipy.linalg.eigh` reads a single triangle, i.e. it
 * treats the (undirected) graph as symmetric. The time-lag median filter can
 * leave Rf marginally asymmetric, so A is symmetrized `(A + Aᵀ)/2` before the
 * Laplacian — the mathematically-intended undirected affinity and what eigh's
 * single-triangle read amounts to. pleco's `eigh`/`laplacian` require symmetry
 * and throw otherwise; symmetrizing keeps that contract honest.
 *
 * Inputs are NEVER shape-guessed: pass a 2D feature matrix, rows = features,
 * columns = frames (d × n layout). Ambiguous input throws.
 *
 * No exact reference fixture exists for this end-to-end pipeline (the example
 * chains a CQT that pleco only approximates), so correctness is proven against
 * synthetic known-structure input in tests/segment-laplacian.test.js.
 *
 * @module segment/laplacian-segmentation
 */

import { recurrenceMatrix, recurrenceToLag, lagToRecurrence } from './index.js'
import { laplacian, eigh } from '../linalg/index.js'
import { kmeans } from '../cluster/index.js'

/**
 * Convert a 2D feature matrix (d × n, features × frames) into an array of
 * n frame vectors (each a Float64Array of length d). Mirrors the validation of
 * `segment.recurrenceMatrix`'s 2D branch. @private
 */
function toFrameVectors(features2d) {
  if (
    !Array.isArray(features2d) ||
    features2d.length === 0 ||
    !(Array.isArray(features2d[0]) || ArrayBuffer.isView(features2d[0]))
  ) {
    throw new Error(
      'laplacianSegmentation: features2d must be a non-empty 2D matrix ' +
        '(rows = features, columns = frames, d×n layout)',
    )
  }
  const d = features2d.length
  const n = features2d[0].length
  if (n === 0) throw new Error('laplacianSegmentation: features2d has zero frames')
  for (const row of features2d) {
    if (!row || row.length !== n) {
      throw new Error('laplacianSegmentation: all feature rows must have equal length')
    }
  }
  const frames = Array.from({ length: n }, () => new Float64Array(d))
  for (let f = 0; f < d; f++) {
    for (let t = 0; t < n; t++) frames[t][f] = features2d[f][t]
  }
  return frames
}

/**
 * scipy.ndimage 'reflect' boundary map (d c b a | a b c d | d c b a):
 * index −1 ↦ 0, n ↦ n−1, etc. Period 2n. @private
 */
function reflectIndex(p, n) {
  if (n === 1) return 0
  const period = 2 * n
  const m = ((p % period) + period) % period
  return m < n ? m : period - 1 - m
}

/** Median of an odd-length numeric buffer (middle order statistic). @private */
function medianOdd(buf) {
  const s = Float64Array.from(buf).sort()
  return s[s.length >> 1]
}

/**
 * Diagonal-enhancing median filter in the time-lag domain:
 * `lagToRecurrence(median_{axis=1, reflect}(recurrenceToLag(R, pad=true), win))`.
 * Reproduces `timelag_filter(scipy.ndimage.median_filter)(R, size=(1, win))`.
 * @private
 */
function timelagMedianFilter(R, win) {
  const lag = recurrenceToLag(R, { pad: true }) // (2n, n)
  const H = lag.length
  const cols = lag[0].length
  const half = win >> 1
  const filtered = Array.from({ length: H }, () => new Float64Array(cols))
  const buf = new Float64Array(win)
  for (let i = 0; i < H; i++) {
    const row = lag[i]
    for (let j = 0; j < cols; j++) {
      for (let w = -half; w <= half; w++) buf[w + half] = row[reflectIndex(j + w, cols)]
      filtered[i][j] = medianOdd(buf)
    }
  }
  return lagToRecurrence(filtered) // (n, n)
}

/**
 * Median filter down the frame axis (axis 0), window `win`, reflect boundary,
 * over the first `kCols` eigenvectors. Reproduces
 * `scipy.ndimage.median_filter(evecs, size=(win, 1))[:, :kCols]`. @private
 */
function medianFilterColumns(evecs, n, kCols, win) {
  const half = win >> 1
  const out = Array.from({ length: n }, () => new Float64Array(kCols))
  const buf = new Float64Array(win)
  for (let c = 0; c < kCols; c++) {
    for (let i = 0; i < n; i++) {
      for (let w = -half; w <= half; w++) buf[w + half] = evecs[reflectIndex(i + w, n)][c]
      out[i][c] = medianOdd(buf)
    }
  }
  return out
}

/**
 * Structural segmentation of a beat/frame-synchronous feature matrix by
 * Laplacian spectral clustering (McFee & Ellis, 2014).
 *
 * Two input forms:
 *
 *   - **Single feature stack** — `laplacianSegmentation(features2d, opts)`:
 *     the same d×n matrix drives BOTH the recurrence graph and the path graph.
 *     Convenient when one representation must serve both roles.
 *
 *   - **Two-feature form** —
 *     `laplacianSegmentation({ recurrenceFeatures, pathFeatures }, opts)`:
 *     the recurrence affinity Rf is built from `recurrenceFeatures` and the
 *     sequential path graph R_path from `pathFeatures`, matching
 *     `plot_segmentation.py` which uses CQT (`Csync`) for repetition and MFCC
 *     (`Msync`) for local continuity. Both matrices must share the same number
 *     of frames (columns); their feature-row counts may differ.
 *
 * @param {(number[][]|Float32Array[]|Float64Array[]|
 *          {recurrenceFeatures: number[][], pathFeatures: number[][]})} features
 *   A single d×n feature matrix (rows = features, columns = frames), or an
 *   object carrying separate `recurrenceFeatures` and `pathFeatures` matrices.
 * @param {Object} [options]
 * @param {number} [options.k=5]     Number of segments / spectral components.
 * @param {number} [options.width=3] Recurrence-matrix width band (links with
 *   |i − j| < width are suppressed; prevents same-bar self-links).
 * @param {number} [options.mu=0.5]  Balance between recurrence (Rf) and path
 *   (R_path) graphs: `A = μ·Rf + (1 − μ)·R_path`, μ ∈ [0, 1].
 * @returns {{ segmentIds: Int32Array, boundaries: number[] }}
 *   `segmentIds[i]` is the cluster label of frame i; `boundaries` is the
 *   ascending list of internal segment-onset frames
 *   (`1 + where(segmentIds[:-1] ≠ segmentIds[1:])`).
 */
export function laplacianSegmentation(features, { k = 5, width = 3, mu = 0.5 } = {}) {
  // Resolve the two input forms. The two-feature object form is detected by the
  // presence of the recurrenceFeatures/pathFeatures keys (not an array).
  let recurrenceFeatures = features
  let pathFeatures = features
  if (
    features &&
    !Array.isArray(features) &&
    !ArrayBuffer.isView(features) &&
    (features.recurrenceFeatures !== undefined || features.pathFeatures !== undefined)
  ) {
    if (features.recurrenceFeatures === undefined || features.pathFeatures === undefined) {
      throw new Error(
        'laplacianSegmentation: the two-feature form requires BOTH ' +
          '{ recurrenceFeatures, pathFeatures }',
      )
    }
    recurrenceFeatures = features.recurrenceFeatures
    pathFeatures = features.pathFeatures
  }

  const frames = toFrameVectors(pathFeatures)
  const n = frames.length
  const recurrenceFrameCount = toFrameVectors(recurrenceFeatures).length
  if (recurrenceFrameCount !== n) {
    throw new Error(
      `laplacianSegmentation: recurrenceFeatures has ${recurrenceFrameCount} frames but ` +
        `pathFeatures has ${n}; both must share the same number of frames (columns)`,
    )
  }

  if (!Number.isInteger(k) || k < 1) {
    throw new Error(`laplacianSegmentation: k=${k} must be a positive integer`)
  }
  if (k > n) {
    throw new Error(`laplacianSegmentation: k=${k} cannot exceed the number of frames (${n})`)
  }
  if (!(mu >= 0 && mu <= 1)) {
    throw new Error(`laplacianSegmentation: mu=${mu} must lie in [0, 1]`)
  }

  // 1) Weighted recurrence affinity (S_rep, from recurrenceFeatures) +
  //    2) time-lag diagonal median filter.
  const R = recurrenceMatrix(recurrenceFeatures, { width, mode: 'affinity', sym: true })
  const Rf = timelagMedianFilter(R, 7)

  // 3) Sequential path matrix (S_loc): σ = median successive squared distance.
  const pathDist = new Float64Array(n - 1)
  for (let i = 0; i < n - 1; i++) {
    let s = 0
    const a = frames[i]
    const b = frames[i + 1]
    for (let f = 0; f < a.length; f++) {
      const dv = b[f] - a[f]
      s += dv * dv
    }
    pathDist[i] = s
  }
  const sorted = Float64Array.from(pathDist).sort()
  const m = sorted.length
  const sigma = m % 2 === 1 ? sorted[(m - 1) / 2] : (sorted[m / 2 - 1] + sorted[m / 2]) / 2
  if (!(sigma > 0) || !Number.isFinite(sigma)) {
    throw new Error(
      `laplacianSegmentation: degenerate path bandwidth σ=${sigma}; successive frames are ` +
        'identical (constant feature stream) so the sequential graph is undefined',
    )
  }
  // R_path[i, i±1] = exp(-‖Δf‖² / σ); tridiagonal, symmetric.
  const Rpath = Array.from({ length: n }, () => new Float64Array(n))
  for (let i = 0; i < n - 1; i++) {
    const w = Math.exp(-pathDist[i] / sigma)
    Rpath[i][i + 1] = w
    Rpath[i + 1][i] = w
  }

  // 4) Balanced combination A = μ·Rf + (1−μ)·R_path, symmetrized for eigh
  //    (reproduces scipy.linalg.eigh's single-triangle / undirected-graph read).
  const A = Array.from({ length: n }, () => new Float64Array(n))
  for (let i = 0; i < n; i++) {
    for (let j = 0; j < n; j++) {
      A[i][j] = mu * Rf[i][j] + (1 - mu) * Rpath[i][j]
    }
  }
  for (let i = 0; i < n; i++) {
    for (let j = i + 1; j < n; j++) {
      const avg = 0.5 * (A[i][j] + A[j][i])
      A[i][j] = avg
      A[j][i] = avg
    }
  }

  // 5) Normalized Laplacian + 6) eigendecomposition (ascending).
  const L = laplacian(A, { normed: true })
  const { vectors } = eigh(L)

  // 6b) Median-smooth the first k eigenvectors down the frame axis.
  const evecs = medianFilterColumns(vectors, n, k, 9)

  // 7) Cumulative-norm normalization: X = evecs[:, :k] / Cnorm[:, k-1].
  const X = Array.from({ length: n }, () => new Array(k))
  for (let i = 0; i < n; i++) {
    let acc = 0
    for (let c = 0; c < k; c++) acc += evecs[i][c] * evecs[i][c]
    const norm = Math.sqrt(acc)
    if (!(norm > 0) || !Number.isFinite(norm)) {
      throw new Error(
        `laplacianSegmentation: frame ${i} has a non-positive spectral norm (${norm}); ` +
          'the first k Laplacian eigenvectors vanish there and cannot be row-normalized',
      )
    }
    for (let c = 0; c < k; c++) X[i][c] = evecs[i][c] / norm
  }

  // 8) Cluster beats into segments (deterministic seed).
  const { labels } = kmeans(X, k, { seed: 0 })

  // 9) Boundaries: internal label transitions, 1-indexed.
  const boundaries = []
  for (let i = 0; i < n - 1; i++) {
    if (labels[i] !== labels[i + 1]) boundaries.push(i + 1)
  }

  return { segmentIds: Int32Array.from(labels), boundaries }
}
