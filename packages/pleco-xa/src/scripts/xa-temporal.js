/**
 * Temporal Segmentation Module — compatibility shim.
 *
 * The librosa-faithful engines live in src/segment/index.js (fixture-gated
 * against tools/parity/fixtures/dtw_segment.json):
 *  - recurrenceMatrix: kNN with MUTUAL-nearest-neighbor symmetrization
 *    (the legacy union/max sym was the opposite of librosa) and the
 *    exp(-d/bandwidth) affinity kernel (legacy used a Gaussian).
 *  - recurrenceToLag / lagToRecurrence: the REAL shear
 *    (lag[i][j] = rec[(i+j) mod H][j]) — the legacy `_shear` was a no-op
 *    stub that returned its input unchanged.
 *  - agglomerative: working Ward merges (the legacy implementation called
 *    Float32Array.prototype.splice, which does not exist, so it threw
 *    a TypeError on the first merge for every k < n).
 *
 * Dimension-inference repair: the legacy code computed
 *   n = Math.floor(data.length / (data.length / data.length))
 * in four places, which is identically data.length — every multi-feature
 * matrix was silently misread as d=1. This shim never guesses: pass a 2D
 * matrix (rows = features) or a flat array WITH explicit
 * { nFeatures, nFrames } in options. Ambiguous flat input throws.
 *
 * Legacy conventions preserved: flat Float32Array returns (row-major),
 * optional { sparse: true } output format.
 *
 * `pathEnhance` remains a pleco-specific variant (stripe kernel, global
 * zero-mean) — it is NOT a librosa parity port; see the audit
 * (docs/superpowers/research/librosa-parity/structure-sequence.md).
 */

import {
  recurrenceMatrix as recurrenceMatrixCore,
  crossSimilarity as crossSimilarityCore,
  recurrenceToLag as recurrenceToLagCore,
  lagToRecurrence as lagToRecurrenceCore,
  agglomerative as agglomerativeCore,
} from '../segment/index.js'

/**
 * Custom error class for parameter validation
 */
class ParameterError extends Error {
  constructor(message) {
    super(message)
    this.name = 'ParameterError'
  }
}

/** Flatten rows-of-arrays into the legacy flat Float32Array layout. @private */
function flattenRows(rows) {
  const nRows = rows.length
  const nCols = rows[0].length
  const out = new Float32Array(nRows * nCols)
  for (let i = 0; i < nRows; i++) {
    for (let j = 0; j < nCols; j++) out[i * nCols + j] = rows[i][j]
  }
  return out
}

/** Legacy flat square matrix (or 2D rows) -> rows-of-arrays. @private */
function toSquareRows(matrix, fnName) {
  if (
    Array.isArray(matrix) &&
    (Array.isArray(matrix[0]) || ArrayBuffer.isView(matrix[0]))
  ) {
    return matrix
  }
  if (ArrayBuffer.isView(matrix) || Array.isArray(matrix)) {
    const n = Math.round(Math.sqrt(matrix.length))
    if (n * n !== matrix.length) {
      throw new ParameterError(
        `${fnName}: flat matrix length ${matrix.length} is not a perfect square`,
      )
    }
    const rows = []
    for (let i = 0; i < n; i++) {
      rows.push(
        matrix.subarray
          ? matrix.subarray(i * n, (i + 1) * n)
          : matrix.slice(i * n, (i + 1) * n),
      )
    }
    return rows
  }
  throw new ParameterError(`${fnName}: unsupported matrix input`)
}

/** Legacy (2t, t) or (t, t) flat lag matrix -> rows. @private */
function toLagRows(matrix, fnName) {
  if (
    Array.isArray(matrix) &&
    (Array.isArray(matrix[0]) || ArrayBuffer.isView(matrix[0]))
  ) {
    return matrix
  }
  if (ArrayBuffer.isView(matrix) || Array.isArray(matrix)) {
    // square (t*t) or padded (2t*t)
    const len = matrix.length
    const tSquare = Math.round(Math.sqrt(len))
    const tPadded = Math.round(Math.sqrt(len / 2))
    let rows
    let cols
    if (tSquare * tSquare === len) {
      rows = tSquare
      cols = tSquare
    } else if (2 * tPadded * tPadded === len) {
      rows = 2 * tPadded
      cols = tPadded
    } else {
      throw new ParameterError(
        `${fnName}: flat lag matrix length ${len} is neither t*t nor 2t*t`,
      )
    }
    const out = []
    for (let i = 0; i < rows; i++) {
      out.push(
        matrix.subarray
          ? matrix.subarray(i * cols, (i + 1) * cols)
          : matrix.slice(i * cols, (i + 1) * cols),
      )
    }
    return out
  }
  throw new ParameterError(`${fnName}: unsupported matrix input`)
}

/**
 * Convert dense flat matrix to the legacy sparse representation
 * @private
 */
function toSparseMatrix(dense, rows, cols) {
  const indices = []
  const values = []

  for (let i = 0; i < rows; i++) {
    for (let j = 0; j < cols; j++) {
      const val = dense[i * cols + j]
      if (Math.abs(val) > 1e-10) {
        indices.push(i, j)
        values.push(val)
      }
    }
  }

  return {
    sparse: true,
    indices: new Uint32Array(indices),
    values: new Float32Array(values),
    shape: [rows, cols],
  }
}

/**
 * Cross-similarity matrix between feature matrices
 * (delegates to segment/crossSimilarity — librosa semantics).
 *
 * @param {Array|Float32Array} data - comparison features: 2D (d, n) or flat
 *   with explicit options.nFeatures/options.nFrames
 * @param {Array|Float32Array} dataRef - reference features: 2D (d, n_ref) or
 *   flat with explicit options.nFeatures/options.nFramesRef
 * @param {Object} options - { k, metric, sparse, mode, bandwidth, full,
 *   nFeatures, nFrames, nFramesRef }
 * @returns {Float32Array|Object} flat (n_ref, n) row-major matrix
 *   (or the legacy sparse format when options.sparse)
 */
export function crossSimilarity(data, dataRef, options = {}) {
  const { sparse = false } = options
  const result = crossSimilarityCore(data, dataRef, options)
  const flat = flattenRows(result)
  if (sparse) return toSparseMatrix(flat, result.length, result[0].length)
  return flat
}

/**
 * Recurrence (self-similarity) matrix
 * (delegates to segment/recurrenceMatrix — librosa semantics: mutual-NN
 * symmetrization, exp(-d/bandwidth) affinity).
 *
 * @param {Array|Float32Array} data - features: 2D (d, n) or flat with
 *   explicit options.nFeatures/options.nFrames
 * @param {Object} options - { k, width, metric, sym, sparse, mode,
 *   bandwidth, self, full, nFeatures, nFrames }
 * @returns {Float32Array|Object} flat (t, t) row-major matrix
 *   (or the legacy sparse format when options.sparse)
 */
export function recurrenceMatrix(data, options = {}) {
  const { sparse = false } = options
  const result = recurrenceMatrixCore(data, options)
  const flat = flattenRows(result)
  if (sparse) return toSparseMatrix(flat, result.length, result.length)
  return flat
}

/**
 * Convert recurrence matrix to lag representation (REAL shear:
 * lag[i][j] = rec[(i+j) mod H][j]).
 *
 * @param {Float32Array|Array} rec - flat square matrix or 2D rows
 * @param {boolean} pad - zero-pad to (2t, t) before shearing
 * @param {number} axis - only the librosa default (-1 / 1) is supported
 * @returns {Float32Array} flat lag matrix ((2t, t) when padded, else (t, t))
 */
export function recurrenceToLag(rec, pad = true, axis = -1) {
  if (axis !== -1 && axis !== 1) {
    throw new ParameterError(
      `recurrenceToLag: axis=${axis} is not supported (only the librosa default time axis -1/1)`,
    )
  }
  const rows = toSquareRows(rec, 'recurrenceToLag')
  return flattenRows(recurrenceToLagCore(rows, { pad }))
}

/**
 * Convert lag matrix back to recurrence matrix (inverse shear + row slice).
 *
 * @param {Float32Array|Array} lag - flat (t, t) or (2t, t) matrix, or 2D rows
 * @param {number} axis - only the librosa default (-1 / 1) is supported
 * @returns {Float32Array} flat (t, t) recurrence matrix
 */
export function lagToRecurrence(lag, axis = -1) {
  if (axis !== -1 && axis !== 1) {
    throw new ParameterError(
      `lagToRecurrence: axis=${axis} is not supported (only the librosa default time axis -1/1)`,
    )
  }
  const rows = toLagRows(lag, 'lagToRecurrence')
  return flattenRows(lagToRecurrenceCore(rows))
}

/**
 * Python-style snake_case aliases (kept for verbatim librosa ports).
 */
export function recurrence_to_lag(rec, pad = true, axis = -1) {
  return recurrenceToLag(rec, pad, axis)
}

export function lag_to_recurrence(lag, axis = -1) {
  return lagToRecurrence(lag, axis)
}

/**
 * Temporally-constrained agglomerative clustering (Ward, librosa/sklearn
 * semantics; delegates to segment/agglomerative).
 *
 * @param {Array|Float32Array} data - features: 2D (d, n) or flat with
 *   explicit options.nFeatures/options.nFrames
 * @param {number} k - number of segments
 * @param {Object} options - { linkage ('ward' only), nFeatures, nFrames }
 * @returns {Uint32Array} left-boundary frame indices (starts with 0)
 */
export function agglomerative(data, k, options = {}) {
  const { linkage = 'ward' } = options
  if (linkage !== 'ward') {
    throw new ParameterError(
      `agglomerative: linkage='${linkage}' is not supported (librosa uses Ward; ` +
        `the legacy 'single'/'complete'/'average' fallbacks are gone)`,
    )
  }
  return agglomerativeCore(data, k, options)
}

/**
 * Multi-angle path enhancement for tempo-varying music.
 *
 * NOTE: pleco-specific variant, NOT a librosa parity port — the diagonal
 * kernel is a cosine-tapered stripe (librosa rotates a 1-D window along the
 * diagonal with spline interpolation) and zeroMean subtracts the global mean
 * (librosa offsets only off-diagonal coordinates).
 *
 * @param {Float32Array} R - flat square similarity matrix
 * @param {number} [n] - filter length (default: size/8 clamped to [32, 256])
 * @param {Object} options - { window, maxRatio, minRatio, nFilters, zeroMean, clip }
 * @returns {Float32Array} enhanced similarity matrix
 */
export function pathEnhance(R, n = null, options = {}) {
  const {
    window = 'hann',
    maxRatio = 2.0,
    minRatio = null,
    nFilters = 7,
    zeroMean = false,
    clip = true,
  } = options

  // If caller didn't supply n, pick a heuristic based on matrix size
  if (n == null) {
    const sizeGuess = Math.round(Math.sqrt(R.length))
    n = Math.min(256, Math.max(32, Math.floor(sizeGuess / 8)))
  }

  if (!R || n <= 0) {
    throw new ParameterError('Valid similarity matrix required')
  }

  const minR = minRatio || 1.0 / maxRatio
  const size = Math.sqrt(R.length)
  let RSmooth = null

  // Generate tempo ratios for diagonal filters
  const ratios = _logspace(Math.log2(minR), Math.log2(maxRatio), nFilters)

  // Apply filters at different tempo ratios
  for (const ratio of ratios) {
    // Create diagonal filter for this tempo ratio
    const kernel = _diagonalFilter(window, n, ratio, zeroMean)

    // Convolve with similarity matrix
    const filtered = _convolve2d(R, kernel, size)

    if (RSmooth === null) {
      RSmooth = new Float32Array(filtered)
    } else {
      // Element-wise maximum to combine filter responses
      for (let i = 0; i < RSmooth.length; i++) {
        RSmooth[i] = Math.max(RSmooth[i], filtered[i])
      }
    }
  }

  // Clip negative values if requested
  if (clip && RSmooth) {
    for (let i = 0; i < RSmooth.length; i++) {
      RSmooth[i] = Math.max(0, RSmooth[i])
    }
  }

  return RSmooth || new Float32Array(R.length)
}

// ============= Private Helper Functions (pathEnhance only) =============

/**
 * Create diagonal filter kernel
 * @private
 */
function _diagonalFilter(window, n, slope, zeroMean) {
  const size = Math.ceil(n * Math.max(1, Math.abs(slope)))
  const kernel = new Float32Array(size * size)

  // Create diagonal stripe filter
  for (let i = 0; i < size; i++) {
    for (let j = 0; j < size; j++) {
      const diagDist = Math.abs(i - j * slope)
      if (diagDist < n / 2) {
        // Apply window function
        let weight = 1.0
        if (window === 'hann') {
          weight = 0.5 + 0.5 * Math.cos((2 * Math.PI * diagDist) / n)
        } else if (window === 'hamming') {
          weight = 0.54 + 0.46 * Math.cos((2 * Math.PI * diagDist) / n)
        }
        kernel[i * size + j] = weight
      }
    }
  }

  // Normalize kernel
  const sum = kernel.reduce((a, b) => a + b, 0)
  if (sum > 0) {
    for (let i = 0; i < kernel.length; i++) {
      kernel[i] /= sum
    }
  }

  // Zero-mean if requested
  if (zeroMean) {
    const mean = kernel.reduce((a, b) => a + b, 0) / kernel.length
    for (let i = 0; i < kernel.length; i++) {
      kernel[i] -= mean
    }
  }

  return kernel
}

/**
 * 2D convolution with kernel
 * @private
 */
function _convolve2d(matrix, kernel, size) {
  const kSize = Math.sqrt(kernel.length)
  const result = new Float32Array(matrix.length)
  const pad = Math.floor(kSize / 2)

  for (let i = 0; i < size; i++) {
    for (let j = 0; j < size; j++) {
      let sum = 0

      for (let ki = 0; ki < kSize; ki++) {
        for (let kj = 0; kj < kSize; kj++) {
          const mi = i + ki - pad
          const mj = j + kj - pad

          if (mi >= 0 && mi < size && mj >= 0 && mj < size) {
            sum += matrix[mi * size + mj] * kernel[ki * kSize + kj]
          }
        }
      }

      result[i * size + j] = sum
    }
  }

  return result
}

/**
 * Generate logarithmically spaced values
 * @private
 */
function _logspace(start, stop, num) {
  if (num <= 1) return num === 1 ? [Math.pow(2, start)] : []

  const step = (stop - start) / (num - 1)
  return Array.from({ length: num }, (_, i) => Math.pow(2, start + i * step))
}
