/**
 * Temporal segmentation.
 *
 * Recurrence, cross-similarity, lag, and agglomerative primitives:
 *
 *  - `recurrenceMatrix` — kNN self-recurrence pipeline:
 *    kNN graph (n_neighbors = min(t-1, k + 2*width), self excluded), width-band
 *    removal, per-row top-k retention (stable value-then-column ordering, which
 *    reproduces scipy/numpy's LIL + stable-argsort behavior, including the
 *    connectivity-mode column-order tie-break), self-diagonal handling,
 *    `sym` via MUTUAL nearest neighbors (element-wise minimum with the
 *    transpose — not union/max), affinity kernel exp(-d / bandwidth) with
 *    the 'med_k_scalar' bandwidth estimation, and the final transpose.
 *  - `crossSimilarity` — kNN graph from one sequence into a reference.
 *  - `recurrenceToLag` / `lagToRecurrence` — the REAL shear:
 *    lag[i][j] = rec[(i + j) mod H][j] (factor -1), inverse with factor +1.
 *  - `agglomerative` — temporally-constrained bottom-up Ward clustering,
 *    replicating sklearn's AgglomerativeClustering(ward, chain connectivity)
 *    greedy merge of the ADJACENT pair with minimum Ward
 *    increment (nA·nB/(nA+nB)·||µA − µB||²), boundaries = left edges.
 *
 * Parity: fixture-gated against tools/parity/fixtures/dtw_segment.json
 * (case 2: connectivity exact 0/1, affinity toleranced, lag exact,
 * agglomerative boundary frames exact).
 *
 * Input features are NEVER shape-guessed: pass a 2D matrix (rows = features,
 * columns = frames) or a flat typed array with an explicit
 * `{ nFeatures, nFrames }`. Ambiguous input throws.
 *
 * Also re-exports `laplacianSegmentation` — the McFee-Ellis Laplacian spectral
 * structural segmentation (2014), composed from the recurrence pipeline above
 * plus the linalg (eigh/laplacian) and cluster (kmeans) primitives. See
 * `laplacian-segmentation.js`; proven on synthetic known-structure input in
 * tests/segment-laplacian.test.js.
 */

/**
 * Normalize feature input into an array of frame vectors (t × d).
 * Accepts:
 *  - 2D array/typed rows, shape (d, n) — features × frames;
 *  - flat Array/TypedArray with explicit `nFeatures`/`nFrames` (row-major d×n).
 * @private
 */
function toFrames(data, { nFeatures = null, nFrames = null } = {}, fnName) {
  if (data == null) {
    throw new Error(`${fnName}: data matrix must be provided`)
  }

  // 2D input: rows are features
  if (Array.isArray(data) && (Array.isArray(data[0]) || ArrayBuffer.isView(data[0]))) {
    const d = data.length
    const n = data[0].length
    if (n === 0) throw new Error(`${fnName}: data has zero frames`)
    for (const row of data) {
      if (!row || row.length !== n) {
        throw new Error(`${fnName}: all feature rows must have equal length`)
      }
    }
    const frames = Array.from({ length: n }, () => new Float64Array(d))
    for (let f = 0; f < d; f++) {
      for (let t = 0; t < n; t++) frames[t][f] = data[f][t]
    }
    return frames
  }

  // Flat input: shape must be explicit — no dimension guessing.
  if (ArrayBuffer.isView(data) || Array.isArray(data)) {
    if (nFeatures == null || nFrames == null) {
      throw new Error(
        `${fnName}: flat input requires explicit { nFeatures, nFrames } ` +
          `(refusing to guess dimensions)`,
      )
    }
    if (nFeatures * nFrames !== data.length) {
      throw new Error(
        `${fnName}: nFeatures*nFrames=${nFeatures * nFrames} does not match data.length=${data.length}`,
      )
    }
    const frames = Array.from({ length: nFrames }, () => new Float64Array(nFeatures))
    for (let f = 0; f < nFeatures; f++) {
      for (let t = 0; t < nFrames; t++) frames[t][f] = data[f * nFrames + t]
    }
    return frames
  }

  throw new Error(`${fnName}: unsupported data type ${Object.prototype.toString.call(data)}`)
}

/** Pairwise distance between two frame vectors. @private */
function frameDistance(a, b, metric, fnName) {
  if (metric === 'euclidean') {
    let sum = 0
    for (let f = 0; f < a.length; f++) {
      const diff = a[f] - b[f]
      sum += diff * diff
    }
    return Math.sqrt(sum)
  }
  if (metric === 'sqeuclidean') {
    let sum = 0
    for (let f = 0; f < a.length; f++) {
      const diff = a[f] - b[f]
      sum += diff * diff
    }
    return sum
  }
  if (metric === 'cityblock' || metric === 'manhattan') {
    let sum = 0
    for (let f = 0; f < a.length; f++) sum += Math.abs(a[f] - b[f])
    return sum
  }
  if (metric === 'cosine') {
    let dot = 0
    let na = 0
    let nb = 0
    for (let f = 0; f < a.length; f++) {
      dot += a[f] * b[f]
      na += a[f] * a[f]
      nb += b[f] * b[f]
    }
    const denom = Math.sqrt(na) * Math.sqrt(nb)
    return denom > 0 ? 1 - dot / denom : 1
  }
  throw new Error(
    `${fnName}: metric='${metric}' is not supported ` +
      `(supported: 'euclidean', 'sqeuclidean', 'cityblock'/'manhattan', 'cosine')`,
  )
}

const VALID_MODES = ['connectivity', 'distance', 'affinity']

/**
 * Per-row top-k retention via a sparse LIL walk:
 * links are visited in ascending column order and stably argsorted by value,
 * so equal values (connectivity mode) keep column order. Everything past the
 * k-th closest is squashed. Mutates struct.
 * @private
 */
function retainTopK(struct, vals, rows, cols, k) {
  for (let i = 0; i < rows; i++) {
    const links = []
    for (let j = 0; j < cols; j++) {
      if (struct[i * cols + j]) links.push(j)
    }
    // stable sort by value; ties keep ascending column order
    const order = links
      .map((j, pos) => ({ j, pos, v: vals[i * cols + j] }))
      .sort((a, b) => (a.v - b.v) || (a.pos - b.pos))
    for (let r = k; r < order.length; r++) {
      struct[i * cols + order[r].j] = 0
    }
  }
}

/**
 * Affinity bandwidth, 'med_k_scalar' branch: the median (NaN-aware)
 * over rows of the distance to the k-th nearest retained neighbor.
 * @private
 */
function medKScalarBandwidth(struct, vals, rows, cols, k, fnName) {
  const distToK = []
  for (let i = 0; i < rows; i++) {
    const rowVals = []
    for (let j = 0; j < cols; j++) {
      // sparse semantics: only stored non-zero values count as links
      if (struct[i * cols + j] && vals[i * cols + j] !== 0) {
        rowVals.push(vals[i * cols + j])
      }
    }
    if (rowVals.length === 0) continue // NaN, skipped by nanmedian
    rowVals.sort((a, b) => a - b)
    distToK.push(rowVals[Math.min(k, rowVals.length) - 1])
  }
  if (distToK.length === 0) {
    throw new Error(`${fnName}: cannot estimate bandwidth from an empty graph`)
  }
  distToK.sort((a, b) => a - b)
  const n = distToK.length
  return n % 2 === 1
    ? distToK[(n - 1) / 2]
    : (distToK[n / 2 - 1] + distToK[n / 2]) / 2
}

/** Resolve the bandwidth option (scalar or 'med_k_scalar'); others throw. @private */
function resolveBandwidth(bandwidth, struct, vals, rows, cols, k, fnName) {
  if (bandwidth == null || bandwidth === 'med_k_scalar') {
    return medKScalarBandwidth(struct, vals, rows, cols, k, fnName)
  }
  if (typeof bandwidth === 'number') {
    if (!(bandwidth > 0)) {
      throw new Error(`${fnName}: invalid scalar bandwidth=${bandwidth}; must be strictly positive`)
    }
    return bandwidth
  }
  throw new Error(
    `${fnName}: bandwidth='${bandwidth}' is not supported ` +
      `(supported: positive scalar or 'med_k_scalar')`,
  )
}

/**
 * Compute a recurrence (self-similarity) matrix from a feature matrix.
 *
 * @param {Array|Float32Array|Float64Array} data - features, shape (d, n) as a
 *   2D matrix, or flat with explicit `options.nFeatures`/`options.nFrames`.
 * @param {Object} [options]
 * @param {number|null} [options.k=null] - neighbors per sample
 *   (default 2*ceil(sqrt(t - 2*width + 1))).
 * @param {number} [options.width=1] - |i - j| < width links are removed.
 * @param {string} [options.metric='euclidean']
 * @param {boolean} [options.sym=false] - keep only MUTUAL nearest neighbors.
 * @param {string} [options.mode='connectivity'] - 'connectivity' | 'distance' | 'affinity'.
 * @param {number|string|null} [options.bandwidth=null] - affinity bandwidth
 *   (positive scalar or 'med_k_scalar'; other estimators throw).
 * @param {boolean} [options.self=false] - populate the main diagonal.
 * @param {boolean} [options.full=false] - full distance/affinity matrix.
 * @param {number|null} [options.nFeatures], [options.nFrames] - shape for flat input.
 * @returns {Float64Array[]} rec - (t, t) matrix, rows are Float64Array.
 *   rec[i][j] non-zero means data[:, i] is a k-NN of data[:, j]
 *   (the transposed-graph orientation).
 */
export function recurrenceMatrix(data, options = {}) {
  const {
    k = null,
    width = 1,
    metric = 'euclidean',
    sym = false,
    mode = 'connectivity',
    bandwidth = null,
    self = false,
    full = false,
  } = options

  const frames = toFrames(data, options, 'recurrenceMatrix')
  const t = frames.length

  if (width < 1 || width >= Math.floor((t - 1) / 2)) {
    throw new Error(
      `recurrenceMatrix: width=${width} must be at least 1 and at most (n_frames - 1) // 2 = ${Math.floor((t - 1) / 2)}`,
    )
  }
  if (!VALID_MODES.includes(mode)) {
    throw new Error(
      `recurrenceMatrix: invalid mode='${mode}'. Must be one of ${JSON.stringify(VALID_MODES)}`,
    )
  }

  let kVal = k == null ? 2 * Math.ceil(Math.sqrt(t - 2 * width + 1)) : Math.floor(k)
  const bandwidthK = kVal
  if (full && mode !== 'connectivity') {
    kVal = t
  }

  const nNeighbors = Math.min(t - 1, kVal + 2 * width)

  // Pairwise distances
  const dist = new Float64Array(t * t)
  for (let i = 0; i < t; i++) {
    for (let j = i + 1; j < t; j++) {
      const d = frameDistance(frames[i], frames[j], metric, 'recurrenceMatrix')
      dist[i * t + j] = d
      dist[j * t + i] = d
    }
  }

  // kNN graph: for each row, link the nNeighbors nearest (self excluded)
  const struct = new Uint8Array(t * t)
  const vals = new Float64Array(t * t)
  const idx = new Array(t - 1)
  for (let i = 0; i < t; i++) {
    let p = 0
    for (let j = 0; j < t; j++) {
      if (j !== i) idx[p++] = j
    }
    idx.sort((a, b) => (dist[i * t + a] - dist[i * t + b]) || (a - b))
    for (let r = 0; r < nNeighbors; r++) {
      const j = idx[r]
      struct[i * t + j] = 1
      vals[i * t + j] = mode === 'connectivity' ? 1 : dist[i * t + j]
    }
  }

  if (!full) {
    // Remove connections within the width band
    for (let i = 0; i < t; i++) {
      for (let off = -width + 1; off < width; off++) {
        const j = i + off
        if (j >= 0 && j < t) struct[i * t + j] = 0
      }
    }
    // Retain only the top-k links per point
    retainTopK(struct, vals, t, t, kVal)
  }

  // Diagonal handling (self=True marks it, self=False clears it)
  for (let i = 0; i < t; i++) {
    const di = i * t + i
    if (self) {
      if (mode === 'connectivity') {
        struct[di] = 1
        vals[di] = 1
      } else if (mode === 'affinity') {
        // negative placeholder: preserved in structure, excluded from
        // bandwidth statistics, restored to exp(0)=1 below
        struct[di] = 1
        vals[di] = -1
      }
      // distance mode: diagonal left as-is (removed by the width band)
    } else {
      struct[di] = 0
    }
  }

  // Symmetrize: MUTUAL nearest neighbors (element-wise minimum with transpose)
  if (sym) {
    for (let i = 0; i < t; i++) {
      for (let j = i + 1; j < t; j++) {
        const a = i * t + j
        const b = j * t + i
        if (struct[a] && struct[b]) {
          const v = Math.min(vals[a], vals[b])
          vals[a] = v
          vals[b] = v
        } else {
          struct[a] = 0
          struct[b] = 0
        }
      }
    }
  }

  // eliminate_zeros: stored zeros drop out of the sparse structure
  for (let i = 0; i < t * t; i++) {
    if (struct[i] && vals[i] === 0) struct[i] = 0
  }

  const out = Array.from({ length: t }, () => new Float64Array(t))
  if (mode === 'connectivity') {
    for (let i = 0; i < t; i++) {
      for (let j = 0; j < t; j++) {
        // final transpose (rec = rec.T)
        if (struct[j * t + i]) out[i][j] = 1
      }
    }
  } else if (mode === 'affinity') {
    // negatives (self-diagonal placeholders) -> 0 before bandwidth estimation
    for (let i = 0; i < t * t; i++) {
      if (struct[i] && vals[i] < 0) vals[i] = 0
    }
    const bw = resolveBandwidth(bandwidth, struct, vals, t, t, bandwidthK, 'recurrenceMatrix')
    for (let i = 0; i < t; i++) {
      for (let j = 0; j < t; j++) {
        if (struct[j * t + i]) out[i][j] = Math.exp(vals[j * t + i] / -bw)
      }
    }
  } else {
    // distance
    for (let i = 0; i < t; i++) {
      for (let j = 0; j < t; j++) {
        if (struct[j * t + i]) out[i][j] = vals[j * t + i]
      }
    }
  }

  return out
}

/**
 * Cross-similarity between a comparison sequence and a reference sequence.
 *
 * @param {Array|Float32Array|Float64Array} data - comparison features (d, n).
 * @param {Array|Float32Array|Float64Array} dataRef - reference features (d, n_ref).
 * @param {Object} [options] - { k, metric, mode, bandwidth, full,
 *   nFeatures, nFrames, nFramesRef } (flat inputs need explicit shapes).
 * @returns {Float64Array[]} xsim - (n_ref, n): xsim[i][j] non-zero when
 *   dataRef[:, i] is a k-NN of data[:, j].
 */
export function crossSimilarity(data, dataRef, options = {}) {
  const {
    k = null,
    metric = 'euclidean',
    mode = 'connectivity',
    bandwidth = null,
    full = false,
    nFeatures = null,
    nFrames = null,
    nFramesRef = null,
  } = options

  const frames = toFrames(data, { nFeatures, nFrames }, 'crossSimilarity')
  const framesRef = toFrames(
    dataRef,
    { nFeatures, nFrames: nFramesRef },
    'crossSimilarity',
  )
  if (frames[0].length !== framesRef[0].length) {
    throw new Error(
      `crossSimilarity: data (d=${frames[0].length}) and dataRef (d=${framesRef[0].length}) ` +
        'do not match on the feature dimension',
    )
  }

  const n = frames.length
  const nRef = framesRef.length

  if (!VALID_MODES.includes(mode)) {
    throw new Error(
      `crossSimilarity: invalid mode='${mode}'. Must be one of ${JSON.stringify(VALID_MODES)}`,
    )
  }

  let kVal = k == null ? Math.min(nRef, 2 * Math.ceil(Math.sqrt(nRef))) : Math.floor(k)
  const bandwidthK = kVal
  if (full && mode !== 'connectivity') {
    kVal = n
  }

  const nNeighbors = Math.min(nRef, kVal)

  // Rows are queries (n), columns are reference frames (n_ref)
  const struct = new Uint8Array(n * nRef)
  const vals = new Float64Array(n * nRef)
  const idx = new Array(nRef)
  for (let i = 0; i < n; i++) {
    const rowDist = new Float64Array(nRef)
    for (let j = 0; j < nRef; j++) {
      rowDist[j] = frameDistance(frames[i], framesRef[j], metric, 'crossSimilarity')
      idx[j] = j
    }
    idx.sort((a, b) => (rowDist[a] - rowDist[b]) || (a - b))
    for (let r = 0; r < nNeighbors; r++) {
      const j = idx[r]
      struct[i * nRef + j] = 1
      vals[i * nRef + j] = mode === 'connectivity' ? 1 : rowDist[j]
    }
  }

  if (!full) {
    retainTopK(struct, vals, n, nRef, kVal)
  }

  // eliminate_zeros
  for (let i = 0; i < n * nRef; i++) {
    if (struct[i] && vals[i] === 0) struct[i] = 0
  }

  const out = Array.from({ length: nRef }, () => new Float64Array(n))
  if (mode === 'connectivity') {
    for (let i = 0; i < nRef; i++) {
      for (let j = 0; j < n; j++) {
        if (struct[j * nRef + i]) out[i][j] = 1
      }
    }
  } else if (mode === 'affinity') {
    const bw = resolveBandwidth(bandwidth, struct, vals, n, nRef, bandwidthK, 'crossSimilarity')
    for (let i = 0; i < nRef; i++) {
      for (let j = 0; j < n; j++) {
        if (struct[j * nRef + i]) out[i][j] = Math.exp(vals[j * nRef + i] / -bw)
      }
    }
  } else {
    for (let i = 0; i < nRef; i++) {
      for (let j = 0; j < n; j++) {
        if (struct[j * nRef + i]) out[i][j] = vals[j * nRef + i]
      }
    }
  }

  return out
}

/** Validate/normalize a 2D matrix argument (rows of numbers). @private */
function asMatrixRows(m, fnName) {
  if (
    !Array.isArray(m) ||
    m.length === 0 ||
    !(Array.isArray(m[0]) || ArrayBuffer.isView(m[0]))
  ) {
    throw new Error(`${fnName}: expected a non-empty 2D matrix (array of rows)`)
  }
  const cols = m[0].length
  for (const row of m) {
    if (!row || row.length !== cols) {
      throw new Error(`${fnName}: all matrix rows must have equal length`)
    }
  }
  return cols
}

/**
 * Convert a recurrence matrix into a lag matrix:
 * `lag[i][j] = rec[(i + j) mod H][j]` (a shear with factor=-1, axis=1).
 *
 * @param {Array<Array<number>|Float32Array|Float64Array>} rec - square (n, n).
 * @param {Object} [options]
 * @param {boolean} [options.pad=true] - pad with n zero rows before shearing
 *   (output (2n, n)); pad=false assumes indefinite repetition (output (n, n)).
 * @returns {Float64Array[]} lag matrix.
 */
export function recurrenceToLag(rec, { pad = true } = {}) {
  const cols = asMatrixRows(rec, 'recurrenceToLag')
  const n = rec.length
  if (cols !== n) {
    throw new Error(`recurrenceToLag: non-square recurrence matrix shape: (${n}, ${cols})`)
  }

  const H = pad ? 2 * n : n
  const lag = Array.from({ length: H }, () => new Float64Array(n))
  for (let j = 0; j < n; j++) {
    for (let i = 0; i < H; i++) {
      const src = (i + j) % H
      // padded rows (src >= n) are zero
      lag[i][j] = src < n ? rec[src][j] : 0
    }
  }
  return lag
}

/**
 * Convert a lag matrix back into a recurrence matrix:
 * shear with factor=+1 (`out[i][j] = lag[(i - j) mod H][j]`), then keep the
 * first t rows (t = number of columns).
 *
 * @param {Array<Array<number>|Float32Array|Float64Array>} lag - (t, t) or (2t, t).
 * @returns {Float64Array[]} rec - (t, t).
 */
export function lagToRecurrence(lag) {
  const cols = asMatrixRows(lag, 'lagToRecurrence')
  const H = lag.length
  if (H !== cols && H !== 2 * cols) {
    throw new Error(`lagToRecurrence: invalid lag matrix shape: (${H}, ${cols})`)
  }
  const t = cols

  const rec = Array.from({ length: t }, () => new Float64Array(t))
  for (let j = 0; j < t; j++) {
    for (let i = 0; i < t; i++) {
      rec[i][j] = lag[(((i - j) % H) + H) % H][j]
    }
  }
  return rec
}

/**
 * Bottom-up temporal segmentation: partition frames into k contiguous
 * segments by temporally-constrained agglomerative clustering.
 * Mirrors sklearn's AgglomerativeClustering with Ward linkage on a chain
 * connectivity graph:
 * repeatedly merge the ADJACENT pair of segments with minimum Ward increment
 *   d²(A, B) = (nA·nB / (nA + nB)) · ||centroid(A) − centroid(B)||²
 * until k segments remain.
 *
 * @param {Array|Float32Array|Float64Array} data - features, shape (d, n) 2D,
 *   or flat with explicit `options.nFeatures`/`options.nFrames`.
 * @param {number} k - number of segments (1 <= k <= n_frames).
 * @param {Object} [options] - { nFeatures, nFrames } for flat input.
 * @returns {Uint32Array} left-boundary frame indices (always starts with 0).
 */
export function agglomerative(data, k, options = {}) {
  const frames = toFrames(data, options, 'agglomerative')
  const n = frames.length
  const d = frames[0].length

  if (!Number.isInteger(k) || k < 1) {
    throw new Error(`agglomerative: k=${k} must be a positive integer`)
  }
  if (k > n) {
    throw new Error(`agglomerative: k=${k} cannot exceed the number of frames (${n})`)
  }

  // Contiguous segments: sizes + feature sums (centroid = sum / size)
  const sizes = new Float64Array(n).fill(1)
  const sums = frames.map((f) => Float64Array.from(f))
  // lengths[s] = frame count of segment s (for boundary extraction)
  let segCount = n

  // Ward increment between adjacent segments a, a+1 (indices into live arrays)
  const wardIncrement = (a, b) => {
    const na = sizes[a]
    const nb = sizes[b]
    let sq = 0
    for (let f = 0; f < d; f++) {
      const diff = sums[a][f] / na - sums[b][f] / nb
      sq += diff * diff
    }
    return ((na * nb) / (na + nb)) * sq
  }

  // Live adjacent-pair distances
  let dists = new Float64Array(n - 1)
  for (let i = 0; i < n - 1; i++) dists[i] = wardIncrement(i, i + 1)

  // Segment frame-counts as a plain array so removals are safe
  const counts = new Array(n).fill(1)

  while (segCount > k) {
    // argmin over live adjacent pairs
    let minIdx = 0
    for (let i = 1; i < segCount - 1; i++) {
      if (dists[i] < dists[minIdx]) minIdx = i
    }

    // Merge segment minIdx and minIdx+1
    sizes[minIdx] += sizes[minIdx + 1]
    for (let f = 0; f < d; f++) sums[minIdx][f] += sums[minIdx + 1][f]
    counts[minIdx] += counts[minIdx + 1]

    // Shift the tails left by one
    for (let i = minIdx + 1; i < segCount - 1; i++) {
      sizes[i] = sizes[i + 1]
      sums[i] = sums[i + 1]
      counts[i] = counts[i + 1]
    }
    segCount--

    // Rebuild the affected adjacent distances (plain-array semantics — the
    // Float32Array.splice crash in the legacy implementation is gone)
    const newDists = new Float64Array(segCount - 1)
    for (let i = 0; i < segCount - 1; i++) {
      if (i === minIdx - 1 || i === minIdx) {
        newDists[i] = wardIncrement(i, i + 1)
      } else {
        newDists[i] = i < minIdx ? dists[i] : dists[i + 1]
      }
    }
    dists = newDists
  }

  const boundaries = new Uint32Array(k)
  let acc = 0
  for (let s = 0; s < k; s++) {
    boundaries[s] = acc
    acc += counts[s]
  }
  return boundaries
}

// McFee-Ellis Laplacian structural segmentation (2014). Composed from the
// recurrence pipeline above + linalg (eigh/laplacian) + cluster (kmeans).
// Proven on synthetic known-structure input (tests/segment-laplacian.test.js).
export { laplacianSegmentation } from './laplacian-segmentation.js'
