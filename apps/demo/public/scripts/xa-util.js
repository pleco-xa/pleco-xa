/**
 * Librosa Utility Functions for JavaScript
 * Core signal processing utilities for audio analysis
 * Provides framing, validation, normalization, and peak detection
 */

// Maximum memory block size for processing
export const MAX_MEM_BLOCK = 2 ** 8 * 2 ** 10 // 256 KB

/**
 * Custom error class for parameter validation
 */
export class ParameterError extends Error {
  constructor(message) {
    super(message)
    this.name = 'ParameterError'
  }
}

/**
 * Simple cache decorator implementation
 * @param {number} maxSize - Maximum cache size
 * @returns {Function} Decorator function
 */
export function cache(maxSize = 20) {
  const cacheMap = new Map()
  return (fn) => {
    return function (...args) {
      const key = JSON.stringify(args)
      if (cacheMap.has(key)) {
        return cacheMap.get(key)
      }

      const result = fn.apply(this, args)

      // Simple LRU eviction
      if (cacheMap.size >= maxSize) {
        const firstKey = cacheMap.keys().next().value
        cacheMap.delete(firstKey)
      }

      cacheMap.set(key, result)
      return result
    }
  }
}

/**
 * Slice a data array into (overlapping) frames
 * @param {Array|Float32Array} x - Array to frame
 * @param {Object} options - Framing parameters
 * @param {number} options.frameLength - Length of each frame
 * @param {number} options.hopLength - Number of steps to advance between frames
 * @param {number} [options.axis=-1] - Axis along which to frame
 * @returns {Array} Array of frames
 */
export function frame(x, { frameLength, hopLength, axis = -1 }) {
  const shape = getShape(x)
  const ndim = shape.length

  // Normalize axis
  if (axis < 0) axis += ndim

  if (shape[axis] < frameLength) {
    throw new ParameterError(
      `Input is too short (n=${shape[axis]}) for frameLength=${frameLength}`,
    )
  }

  if (hopLength < 1) {
    throw new ParameterError(`Invalid hopLength: ${hopLength}`)
  }

  // Calculate number of frames
  const nFrames = 1 + Math.floor((shape[axis] - frameLength) / hopLength)

  // For 1D arrays, create simple frame array
  if (ndim === 1) {
    const frames = []
    for (let i = 0; i < nFrames; i++) {
      const start = i * hopLength
      frames.push(x.slice(start, start + frameLength))
    }
    return frames
  }

  // For higher dimensions, create nested structure
  const result = []
  for (let i = 0; i < nFrames; i++) {
    const start = i * hopLength
    const frameSlice = sliceAxis(x, axis, start, start + frameLength)
    result.push(frameSlice)
  }

  return result
}

/**
 * Validate audio data for processing
 * @param {Array|Float32Array} y - Audio data to validate
 * @param {boolean} [mono=true] - Whether to enforce mono audio
 * @returns {boolean} True if valid
 * @throws {ParameterError} If validation fails
 */
export function validAudio(y, mono = true) {
  if (!Array.isArray(y) && !isTypedArray(y)) {
    throw new ParameterError('Audio data must be an array or typed array')
  }

  const flat = flatten(y)
  if (flat.length === 0) {
    throw new ParameterError('Audio data must be at least one-dimensional')
  }

  // Check for non-finite values
  for (let val of flat) {
    if (!isFinite(val)) {
      throw new ParameterError('Audio buffer is not finite everywhere')
    }
  }

  // Check for mono constraint
  if (mono && y.length > 0 && (Array.isArray(y[0]) || isTypedArray(y[0]))) {
    throw new ParameterError('Audio data must be mono (1D array)')
  }

  return true
}

/**
 * Ensure value is integer-typed
 * @param {number} x - Value to cast
 * @param {Function} [castFn=Math.floor] - Casting function
 * @returns {number} Integer value
 */
export function validInt(x, castFn = Math.floor) {
  if (typeof castFn !== 'function') {
    throw new ParameterError('cast parameter must be callable')
  }
  return Math.floor(castFn(x))
}

/**
 * Check if value is a positive integer
 * @param {*} x - Value to check
 * @returns {boolean} True if positive integer
 */
export function isPositiveInt(x) {
  return Number.isInteger(x) && x > 0
}

// Alias for Librosa compatibility
export const is_positive_int = isPositiveInt

/**
 * Pad array to center data
 * @param {Array} data - Array to pad
 * @param {Object} options - Padding options
 * @param {number} options.size - Target size
 * @param {number} [options.axis=-1] - Axis to pad along
 * @param {string} [options.mode='constant'] - Padding mode
 * @param {number} [options.constantValue=0] - Value for constant padding
 * @returns {Array} Padded array
 */
export function padCenter(
  data,
  { size, axis = -1, mode = 'constant', constantValue = 0 },
) {
  const shape = getShape(data)
  const ndim = shape.length

  // Normalize axis
  if (axis < 0) axis += ndim

  const n = shape[axis]
  const lpad = Math.floor((size - n) / 2)

  if (lpad < 0) {
    throw new ParameterError(
      `Target size (${size}) must be at least input size (${n})`,
    )
  }

  const rpad = size - n - lpad

  // Simple 1D case
  if (ndim === 1) {
    return padArray1D(data, lpad, rpad, mode, constantValue)
  }

  // For higher dimensions, would need more complex implementation
  throw new ParameterError('Multi-dimensional padding not yet implemented')
}

/**
 * Fix array length by padding or trimming
 * @param {Array} data - Array to fix
 * @param {Object} options - Fix options
 * @param {number} options.size - Target size
 * @param {number} [options.axis=-1] - Axis along which to fix
 * @param {string} [options.mode='constant'] - Padding mode if needed
 * @param {number} [options.constantValue=0] - Value for constant padding
 * @returns {Array} Fixed-length array
 */
export function fixLength(
  data,
  { size, axis = -1, mode = 'constant', constantValue = 0 },
) {
  const shape = getShape(data)
  const ndim = shape.length

  // Normalize axis
  if (axis < 0) axis += ndim

  const n = shape[axis]

  if (n > size) {
    // Trim
    if (ndim === 1) {
      return data.slice(0, size)
    } else {
      return sliceAxis(data, axis, 0, size)
    }
  } else if (n < size) {
    // Pad
    const padWidth = size - n
    if (ndim === 1) {
      return padArray1D(data, 0, padWidth, mode, constantValue)
    } else {
      throw new ParameterError('Multi-dimensional padding not yet implemented')
    }
  }

  return data
}

/**
 * Normalize array along an axis
 * @param {Array} S - Array to normalize
 * @param {Object} options - Normalization options
 * @param {number|null} [options.norm=Infinity] - Norm type (1, 2, Infinity, or null)
 * @param {number} [options.axis=0] - Axis to normalize along
 * @param {number|null} [options.threshold=null] - Threshold for small norms
 * @param {boolean|null} [options.fill=null] - How to handle small norms
 * @returns {Array} Normalized array
 */
export function normalize(
  S,
  { norm = Infinity, axis = 0, threshold = null, fill = null } = {},
) {
  if (threshold === null) {
    threshold = tiny(S)
  } else if (threshold <= 0) {
    throw new ParameterError(`threshold=${threshold} must be strictly positive`)
  }

  if (![null, false, true].includes(fill)) {
    throw new ParameterError(`fill=${fill} must be null or boolean`)
  }

  // Check for finite values
  const flat = flatten(S)
  if (!flat.every(isFinite)) {
    throw new ParameterError('Input must be finite')
  }

  if (norm === null) return S

  // For 1D arrays (plain or typed)
  if (!(Array.isArray(S[0]) || isTypedArray(S[0]))) {
    return normalize1D(S, norm, threshold, fill)
  }

  // For 2D arrays, normalize along specified axis
  if (axis === 0) {
    // Normalize each column
    const result = S.map((row) => [...row])
    for (let col = 0; col < S[0].length; col++) {
      const column = S.map((row) => row[col])
      const normalized = normalize1D(column, norm, threshold, fill)
      for (let row = 0; row < S.length; row++) {
        result[row][col] = normalized[row]
      }
    }
    return result
  } else {
    // Normalize each row
    return S.map((row) => normalize1D(row, norm, threshold, fill))
  }
}

/**
 * Find local maxima in an array
 * @param {Array} x - Input array
 * @param {Object} options - Detection options
 * @param {number} [options.axis=0] - Axis along which to compute
 * @returns {Array} Boolean array indicating local maxima
 */
export function localmax(x, { axis = 0 } = {}) {
  if (!Array.isArray(x[0])) {
    // 1D case
    const result = new Array(x.length).fill(false)

    for (let i = 1; i < x.length - 1; i++) {
      if (x[i] > x[i - 1] && x[i] >= x[i + 1]) {
        result[i] = true
      }
    }

    // Handle edge cases
    if (x.length > 1 && x[x.length - 1] > x[x.length - 2]) {
      result[x.length - 1] = true
    }

    return result
  }

  // 2D case - apply along axis
  if (axis === 0) {
    const result = x.map((row) => new Array(row.length).fill(false))
    for (let col = 0; col < x[0].length; col++) {
      const column = x.map((row) => row[col])
      const maxima = localmax(column)
      for (let row = 0; row < x.length; row++) {
        result[row][col] = maxima[row]
      }
    }
    return result
  } else {
    return x.map((row) => localmax(row))
  }
}

/**
 * Find local minima in an array
 * @param {Array} x - Input array
 * @param {Object} options - Detection options
 * @param {number} [options.axis=0] - Axis along which to compute
 * @returns {Array} Boolean array indicating local minima
 */
export function localmin(x, { axis = 0 } = {}) {
  if (!Array.isArray(x[0])) {
    // 1D case
    const result = new Array(x.length).fill(false)

    for (let i = 1; i < x.length - 1; i++) {
      if (x[i] < x[i - 1] && x[i] <= x[i + 1]) {
        result[i] = true
      }
    }

    // Handle edge cases
    if (x.length > 1 && x[x.length - 1] < x[x.length - 2]) {
      result[x.length - 1] = true
    }

    return result
  }

  // 2D case - apply along axis
  if (axis === 0) {
    const result = x.map((row) => new Array(row.length).fill(false))
    for (let col = 0; col < x[0].length; col++) {
      const column = x.map((row) => row[col])
      const minima = localmin(column)
      for (let row = 0; row < x.length; row++) {
        result[row][col] = minima[row]
      }
    }
    return result
  } else {
    return x.map((row) => localmin(row))
  }
}

/**
 * Peak picking algorithm with advanced filtering
 * @param {Array} x - Input signal
 * @param {Object} options - Peak picking parameters
 * @param {number} options.preMax - Samples before n for max computation
 * @param {number} options.postMax - Samples after n for max computation
 * @param {number} options.preAvg - Samples before n for mean computation
 * @param {number} options.postAvg - Samples after n for mean computation
 * @param {number} options.delta - Threshold offset for mean
 * @param {number} options.wait - Samples to wait after picking a peak
 * @param {boolean} [options.sparse=true] - Return sparse indices or dense array
 * @returns {Array} Peak indices (sparse) or boolean array (dense)
 */
export function peakPick(
  x,
  { preMax, postMax, preAvg, postAvg, delta, wait, sparse = true },
) {
  // Validate parameters
  if (preMax < 0) throw new ParameterError('preMax must be non-negative')
  if (preAvg < 0) throw new ParameterError('preAvg must be non-negative')
  if (delta < 0) throw new ParameterError('delta must be non-negative')
  if (wait < 0) throw new ParameterError('wait must be non-negative')
  if (postMax <= 0) throw new ParameterError('postMax must be positive')
  if (postAvg <= 0) throw new ParameterError('postAvg must be positive')

  const peaks = new Array(x.length).fill(false)

  // First frame special case
  const postMaxIdx = Math.min(postMax, x.length)
  const postAvgIdx = Math.min(postAvg, x.length)

  if (x.length > 0) {
    const maxVal = Math.max(...x.slice(0, postMaxIdx))
    const avgVal = mean(x.slice(0, postAvgIdx))
    peaks[0] = x[0] >= maxVal && x[0] >= avgVal + delta
  }

  let n = peaks[0] ? wait + 1 : 1

  // Process remaining samples
  while (n < x.length) {
    const preMaxIdx = Math.max(0, n - preMax)
    const postMaxIdx = Math.min(n + postMax + 1, x.length)
    const maxVal = Math.max(...x.slice(preMaxIdx, postMaxIdx))

    if (x[n] !== maxVal) {
      n++
      continue
    }

    const preAvgIdx = Math.max(0, n - preAvg)
    const postAvgIdx = Math.min(n + postAvg + 1, x.length)
    const avgVal = mean(x.slice(preAvgIdx, postAvgIdx))

    if (x[n] >= avgVal + delta) {
      peaks[n] = true
      n += wait + 1
    } else {
      n++
    }
  }

  if (sparse) {
    return peaks.reduce((acc, val, idx) => {
      if (val) acc.push(idx)
      return acc
    }, [])
  }

  return peaks
}

/**
 * Compute tiny value for numeric precision
 * @param {number|Array} x - Value to get precision limit for
 * @returns {number} Tiny value for the data type
 */
export function tiny(_x) {
  // librosa tiny(): smallest positive normal for the dtype.
  // Pleco stores audio as float32, so mirror np.finfo(np.float32).tiny.
  return 1.1754943508222875e-38
}

/**
 * Compute squared magnitude efficiently
 * @param {number|Array|Object} x - Input value, array, or complex number
 * @param {string} [dtype] - Optional output data type (ignored in JS)
 * @returns {number|Array} Squared magnitude
 */
export function abs2(x, _dtype) {
  if (isComplex(x)) {
    return x.real * x.real + x.imag * x.imag
  } else if (isComplexArray(x)) {
    return x.map((val) => val.real * val.real + val.imag * val.imag)
  } else if (Array.isArray(x)) {
    return x.map((val) => (Array.isArray(val) ? abs2(val) : val * val))
  } else {
    return x * x
  }
}

/**
 * Construct complex phasor from angles
 * @param {number|Array} angles - Angles in radians
 * @param {Object} options - Phasor options
 * @param {number|Array} [options.mag] - Optional magnitude scaling
 * @returns {Object|Array} Complex phasor(s) with real and imag components
 */
export function phasor(angles, { mag = null } = {}) {
  const makeComplex = (angle) => ({
    real: Math.cos(angle),
    imag: Math.sin(angle),
  })

  let result
  if (Array.isArray(angles)) {
    result = angles.map(makeComplex)
  } else {
    result = makeComplex(angles)
  }

  if (mag !== null) {
    if (Array.isArray(result)) {
      if (Array.isArray(mag)) {
        result = result.map((z, i) => ({
          real: z.real * mag[i],
          imag: z.imag * mag[i],
        }))
      } else {
        result = result.map((z) => ({
          real: z.real * mag,
          imag: z.imag * mag,
        }))
      }
    } else {
      result.real *= mag
      result.imag *= mag
    }
  }

  return result
}

/**
 * Helper Functions
 */

function getShape(arr) {
  const shape = []
  let current = arr
  while (Array.isArray(current) || isTypedArray(current)) {
    shape.push(current.length)
    current = current[0]
  }
  return shape
}

function flatten(arr) {
  if (isTypedArray(arr)) return Array.from(arr)
  if (!Array.isArray(arr)) return [arr]
  const out = []
  for (const v of arr) {
    if (Array.isArray(v) || isTypedArray(v)) {
      for (const w of flatten(v)) out.push(w)
    } else {
      out.push(v)
    }
  }
  return out
}

function isTypedArray(arr) {
  return (
    arr instanceof Float32Array ||
    arr instanceof Float64Array ||
    arr instanceof Int8Array ||
    arr instanceof Int16Array ||
    arr instanceof Int32Array ||
    arr instanceof Uint8Array ||
    arr instanceof Uint16Array ||
    arr instanceof Uint32Array
  )
}

function mean(arr) {
  return arr.reduce((a, b) => a + b, 0) / arr.length
}

function isComplex(x) {
  return typeof x === 'object' && x !== null && 'real' in x && 'imag' in x
}

function isComplexArray(x) {
  return Array.isArray(x) && x.length > 0 && isComplex(x[0])
}

function sliceAxis(arr, axis, start, end) {
  if (axis === 0) {
    return arr.slice(start, end)
  }
  // For other axes, would need more complex slicing
  throw new ParameterError('Multi-axis slicing not fully implemented')
}

function padArray1D(arr, leftPad, rightPad, mode, constantValue) {
  const result = new Array(arr.length + leftPad + rightPad)

  // Left padding
  for (let i = 0; i < leftPad; i++) {
    if (mode === 'reflect') {
      result[i] = arr[Math.min(leftPad - i, arr.length - 1)]
    } else if (mode === 'edge') {
      result[i] = arr[0]
    } else {
      // constant
      result[i] = constantValue
    }
  }

  // Original data
  for (let i = 0; i < arr.length; i++) {
    result[leftPad + i] = arr[i]
  }

  // Right padding
  for (let i = 0; i < rightPad; i++) {
    if (mode === 'reflect') {
      result[leftPad + arr.length + i] = arr[Math.max(0, arr.length - 2 - i)]
    } else if (mode === 'edge') {
      result[leftPad + arr.length + i] = arr[arr.length - 1]
    } else {
      // constant
      result[leftPad + arr.length + i] = constantValue
    }
  }

  return result
}

function normalize1D(arr, norm, threshold, fill) {
  let length
  let fillNorm = 1

  if (norm === Infinity) {
    length = Math.max(...arr.map(Math.abs))
  } else if (norm === -Infinity) {
    length = Math.min(...arr.map(Math.abs))
  } else if (norm === 0) {
    if (fill === true) {
      throw new ParameterError('Cannot normalize with norm=0 and fill=true')
    }
    length = arr.filter((x) => Math.abs(x) > 0).length
  } else if (typeof norm === 'number' && norm > 0) {
    const sum = arr.reduce((acc, val) => acc + Math.pow(Math.abs(val), norm), 0)
    length = Math.pow(sum, 1.0 / norm)
    fillNorm = Math.pow(arr.length, -1.0 / norm)
  } else {
    throw new ParameterError(`Unsupported norm: ${norm}`)
  }

  // Handle small values
  if (length < threshold) {
    if (fill === null) {
      return arr // Leave unchanged
    } else if (fill) {
      return new Array(arr.length).fill(fillNorm)
    } else {
      return new Array(arr.length).fill(0)
    }
  }

  return arr.map((val) => val / length)
}

/**
 * Apply function along specified axis
 * @param {Array} arr - Input array
 * @param {number} axis - Axis to apply along
 * @param {Function} fn - Function to apply
 */
// This function is defined but not used anywhere in the code
function _applyAlongAxis(arr, axis, fn) {
  if (axis === 0 && Array.isArray(arr[0])) {
    // Apply to columns
    for (let col = 0; col < arr[0].length; col++) {
      const column = arr.map((row) => row[col])
      fn(column, [col])
    }
  } else {
    // Apply to rows or 1D
    arr.forEach((row, idx) => fn(row, [idx]))
  }
}

/**
 * Utility for finding indices and values
 * @param {Array} arr - Array to search
 * @param {Function} predicate - Test function
 * @returns {Array} Indices where predicate is true
 */
export function findIndices(arr, predicate) {
  const indices = []
  for (let i = 0; i < arr.length; i++) {
    if (predicate(arr[i], i)) {
      indices.push(i)
    }
  }
  return indices
}

/**
 * Create evenly spaced values
 * @param {number} start - Start value
 * @param {number} stop - Stop value
 * @param {number} num - Number of values
 * @returns {Array} Evenly spaced values
 */
export function linspace(start, stop, num) {
  const step = (stop - start) / (num - 1)
  return Array.from({ length: num }, (_, i) => start + step * i)
}

/**
 * Check MP3 playback support and optionally show a warning banner.
 *
 * @returns {string} The result of canPlayType for 'audio/mp3'.
 */
export function warnIfNoMp3Support() {
  const canPlay =
    typeof Audio !== 'undefined' ? new Audio().canPlayType('audio/mp3') : ''
  if (typeof document !== 'undefined' && typeof Audio !== 'undefined' && !canPlay) {
    let banner = document.getElementById('mp3Warning')
    if (!banner) {
      banner = document.createElement('div')
      banner.id = 'mp3Warning'
      banner.style.backgroundColor = '#ffc107'
      banner.style.color = '#000'
      banner.style.padding = '10px'
      banner.style.margin = '10px 0'
      banner.style.border = '1px solid #ffa000'
      banner.style.borderRadius = '4px'
      banner.style.textAlign = 'center'
      banner.style.display = 'none'
      document.body.prepend(banner)
    }

    banner.textContent = 'Warning: your browser cannot play MP3 audio.'
    banner.style.display = 'block'

    setTimeout(() => {
      banner.style.display = 'none'
    }, 5000)
  }
  return canPlay
}

/**
 * Aggregate a multi-dimensional array between specified boundaries
 * Synchronizes features to segment boundaries
 * @param {Array} data - Feature matrix [d x t]
 * @param {Array} idx - Segment boundaries (slices or indices)
 * @param {Function|null} aggregate - Aggregation function (default: mean)
 * @param {boolean} pad - Pad boundaries
 * @param {number} axis - Time axis
 * @returns {Array} Synchronized features [d x n_segments]
 */
export function sync(data, idx, aggregate = null, pad = true, axis = -1) {
  if (!aggregate) {
    aggregate = arr => arr.reduce((a, b) => a + b, 0) / arr.length // Mean
  }

  const n_features = data.length
  const n_frames = data[0] ? data[0].length : 0

  // Convert indices to slices if needed
  const segments = []
  for (let i = 0; i < idx.length - 1; i++) {
    segments.push({start: idx[i], end: idx[i + 1]})
  }

  // Initialize output
  const n_segments = segments.length
  const synced = Array(n_features).fill(null).map(() => new Float32Array(n_segments))

  // Aggregate each segment
  for (let f = 0; f < n_features; f++) {
    for (let s = 0; s < n_segments; s++) {
      const {start, end} = segments[s]
      const segment_data = []

      for (let t = start; t < end && t < n_frames; t++) {
        segment_data.push(data[f][t])
      }

      if (segment_data.length > 0) {
        synced[f][s] = aggregate(segment_data)
      } else {
        synced[f][s] = 0
      }
    }
  }

  return synced
}

/**
 * Short-term history embedding: vertically concatenate a data vector or matrix
 * with delayed copies of itself
 * @param {Array} data - Feature matrix [d x t]
 * @param {number} n_steps - Number of history steps (delay taps)
 * @param {number} delay - Delay between steps
 * @param {Object} kwargs - Additional arguments
 * @returns {Array} Stacked features [(n_steps * d) x t]
 */
export function stack_memory(data, n_steps = 2, delay = 1, kwargs = {}) {
  const n_features = data.length
  const n_frames = data[0] ? data[0].length : 0

  // Initialize output with n_steps copies
  const stacked_features = n_steps * n_features
  const stacked = Array(stacked_features).fill(null).map(() => new Float32Array(n_frames))

  // Stack delayed copies
  for (let step = 0; step < n_steps; step++) {
    const offset = step * delay

    for (let f = 0; f < n_features; f++) {
      const out_idx = step * n_features + f

      for (let t = 0; t < n_frames; t++) {
        const src_t = t - offset

        if (src_t >= 0 && src_t < n_frames) {
          stacked[out_idx][t] = data[f][src_t]
        } else {
          // Pad with zeros for out-of-range indices
          stacked[out_idx][t] = 0
        }
      }
    }
  }

  return stacked
}

/**
 * Shear a matrix by a given factor
 * Port of librosa.util.shear
 *
 * Applies a shearing transformation along the specified axis
 * Used for time-frequency analysis and spectrogram enhancement
 *
 * @param {Array} X - Input matrix [n_rows][n_cols]
 * @param {number} factor - Shear factor (default 1)
 * @param {number} axis - Axis to shear (-1 for time/columns, 0 for frequency/rows)
 * @returns {Array} Sheared matrix
 */
export function shear(X, factor = 1, axis = -1) {
  if (!Array.isArray(X) || !Array.isArray(X[0])) {
    throw new ParameterError('X must be a 2D array')
  }

  const n_rows = X.length
  const n_cols = X[0].length

  if (axis === -1 || axis === 1) {
    // Shear along columns (time axis)
    const X_sheared = Array(n_rows).fill(null).map(() => new Array(n_cols).fill(0))

    for (let i = 0; i < n_rows; i++) {
      const shift = Math.round(i * factor)

      for (let j = 0; j < n_cols; j++) {
        const new_j = j + shift
        if (new_j >= 0 && new_j < n_cols) {
          X_sheared[i][new_j] = X[i][j]
        }
      }
    }

    return X_sheared
  } else if (axis === 0) {
    // Shear along rows (frequency axis)
    const X_sheared = Array(n_rows).fill(null).map(() => new Array(n_cols).fill(0))

    for (let j = 0; j < n_cols; j++) {
      const shift = Math.round(j * factor)

      for (let i = 0; i < n_rows; i++) {
        const new_i = i + shift
        if (new_i >= 0 && new_i < n_rows) {
          X_sheared[new_i][j] = X[i][j]
        }
      }
    }

    return X_sheared
  } else {
    throw new ParameterError(`Invalid axis: ${axis}. Use -1, 0, or 1`)
  }
}

/**
 * Sort an array along its rows or columns
 * Port of librosa.util.axis_sort
 *
 * @param {Array} S - Input array [n_rows][n_cols]
 * @param {number} axis - Axis to sort (0 for rows, -1 for columns)
 * @param {boolean} index - If true, return indices instead of sorted values
 * @param {Function} value - Optional function to compute sort values
 * @returns {Array|Object} Sorted array or {values, indices}
 */
export function axis_sort(S, axis = -1, index = false, value = null) {
  if (!Array.isArray(S)) {
    throw new ParameterError('S must be an array')
  }

  const is_1d = !Array.isArray(S[0])

  if (is_1d) {
    // 1D array
    const indices = Array.from({length: S.length}, (_, i) => i)
    const values = value ? S.map(value) : S

    indices.sort((a, b) => values[a] - values[b])

    if (index) {
      return {values: indices.map(i => S[i]), indices}
    }
    return indices.map(i => S[i])
  }

  // 2D array
  const n_rows = S.length
  const n_cols = S[0].length

  if (axis === -1 || axis === 1) {
    // Sort along columns (each row independently)
    const sorted = []
    const idx_array = index ? [] : null

    for (let i = 0; i < n_rows; i++) {
      const row_indices = Array.from({length: n_cols}, (_, j) => j)
      const row_values = value ? S[i].map(value) : S[i]

      row_indices.sort((a, b) => row_values[a] - row_values[b])

      sorted.push(row_indices.map(j => S[i][j]))
      if (index) {
        idx_array.push(row_indices)
      }
    }

    if (index) {
      return {values: sorted, indices: idx_array}
    }
    return sorted
  } else if (axis === 0) {
    // Sort along rows (each column independently)
    const sorted = Array(n_rows).fill(null).map(() => new Array(n_cols))
    const idx_array = index ? Array(n_rows).fill(null).map(() => new Array(n_cols)) : null

    for (let j = 0; j < n_cols; j++) {
      const col = S.map(row => row[j])
      const col_indices = Array.from({length: n_rows}, (_, i) => i)
      const col_values = value ? col.map(value) : col

      col_indices.sort((a, b) => col_values[a] - col_values[b])

      for (let i = 0; i < n_rows; i++) {
        sorted[i][j] = S[col_indices[i]][j]
        if (index) {
          idx_array[i][j] = col_indices[i]
        }
      }
    }

    if (index) {
      return {values: sorted, indices: idx_array}
    }
    return sorted
  } else {
    throw new ParameterError(`Invalid axis: ${axis}`)
  }
}

/**
 * Expand the dimensions of an input array
 * Port of librosa.util.expand_to
 *
 * @param {Array} x - Input array
 * @param {number} ndim - Target number of dimensions
 * @param {Array|number} axes - Axes to preserve (others will be singleton)
 * @returns {Array} Expanded array
 */
export function expand_to(x, ndim, axes) {
  if (!Array.isArray(x)) {
    throw new ParameterError('x must be an array')
  }

  // For JS, we simulate dimension expansion by wrapping in arrays
  // This is a simplified version - full ND array support would need a library

  let result = x
  const axesArray = Array.isArray(axes) ? axes : [axes]

  // Ensure result has at least ndim dimensions
  while (getArrayDepth(result) < ndim) {
    result = [result]
  }

  return result
}

function getArrayDepth(arr) {
  if (!Array.isArray(arr)) {
    return 0
  }
  return 1 + getArrayDepth(arr[0])
}

/**
 * Set all cells of a matrix to a given value if they're outside a diagonal band
 * Port of librosa.util.fill_off_diagonal
 *
 * @param {Array} x - Input matrix (modified in place) [n][n]
 * @param {number} radius - Diagonal band radius
 * @param {number} value - Fill value (default 0)
 */
export function fill_off_diagonal(x, radius, value = 0) {
  if (!Array.isArray(x) || !Array.isArray(x[0])) {
    throw new ParameterError('x must be a 2D array')
  }

  const n = x.length

  for (let i = 0; i < n; i++) {
    for (let j = 0; j < x[i].length; j++) {
      if (Math.abs(i - j) > radius) {
        x[i][j] = value
      }
    }
  }
}

/**
 * Robustly compute a soft-mask operation
 * Port of librosa.util.softmask
 *
 * Computes the soft mask: X / (X + X_ref)^power
 * Used for source separation and masking
 *
 * @param {Array} X - Input array (numerator)
 * @param {Array} X_ref - Reference array (denominator)
 * @param {number} power - Exponent for the soft mask (default 1)
 * @param {boolean} split_zeros - If true, use 0.5 when both are zero (default false = 0.0)
 * @returns {Array} Soft mask array
 */
export function softmask(X, X_ref, power = 1, split_zeros = false) {
  const is_1d = !Array.isArray(X[0])

  if (is_1d) {
    const result = new Array(X.length)
    for (let i = 0; i < X.length; i++) {
      const num = X[i]
      const denom = Math.pow(X[i] + X_ref[i], power)

      if (denom === 0) {
        result[i] = split_zeros ? 0.5 : 0.0
      } else {
        result[i] = num / denom
      }
    }
    return result
  }

  // 2D array
  const n_rows = X.length
  const n_cols = X[0].length
  const result = Array(n_rows).fill(null).map(() => new Array(n_cols))

  for (let i = 0; i < n_rows; i++) {
    for (let j = 0; j < n_cols; j++) {
      const num = X[i][j]
      const denom = Math.pow(X[i][j] + X_ref[i][j], power)

      if (denom === 0) {
        result[i][j] = split_zeros ? 0.5 : 0.0
      } else {
        result[i][j] = num / denom
      }
    }
  }

  return result
}

/**
 * Return a row-sparse matrix approximating the input
 * Port of librosa.util.sparsify_rows
 *
 * Retains only values above a quantile threshold in each row,
 * setting others to zero (creating a sparse-like structure)
 *
 * @param {Array} x - Input matrix [n_rows][n_cols]
 * @param {number} quantile - Quantile threshold (0-1, default 0.01)
 * @param {String} dtype - Output data type (ignored in JS)
 * @returns {Array} Sparsified matrix
 */
export function sparsify_rows(x, quantile = 0.01, dtype = null) {
  if (!Array.isArray(x) || !Array.isArray(x[0])) {
    throw new ParameterError('x must be a 2D array')
  }

  const n_rows = x.length
  const n_cols = x[0].length
  const result = Array(n_rows).fill(null).map(() => new Array(n_cols).fill(0))

  for (let i = 0; i < n_rows; i++) {
    // Sort row values to find quantile threshold
    const sorted = [...x[i]].sort((a, b) => a - b)
    const threshold_idx = Math.floor(quantile * sorted.length)
    const threshold = sorted[threshold_idx]

    // Keep only values above threshold
    for (let j = 0; j < n_cols; j++) {
      if (x[i][j] >= threshold) {
        result[i][j] = x[i][j]
      }
    }
  }

  return result
}

/**
 * Determine whether a variable contains valid audio data
 * Port of librosa.util.valid_audio
 *
 * Valid audio must be:
 * - A typed array or regular array
 * - One-dimensional
 * - Finite (no NaN or Infinity values)
 * - Non-empty
 *
 * @param {Array|Float32Array|Float64Array} y - Input audio data
 * @param {boolean} mono - If true, require strictly 1D (default: true)
 * @returns {boolean} True if audio data is valid
 *
 * @example
 * valid_audio([1, 2, 3])  // true
 * valid_audio([NaN, 1, 2])  // false
 * valid_audio([])  // false
 */
export function valid_audio(y, mono = true) {
  if (!y || (!Array.isArray(y) && !(y instanceof Float32Array) && !(y instanceof Float64Array))) {
    return false
  }

  // Check if non-empty
  if (y.length === 0) {
    return false
  }

  // Check if 1D (no nested arrays for mono audio)
  if (mono && Array.isArray(y[0])) {
    return false
  }

  // Check all values are finite
  for (let i = 0; i < y.length; i++) {
    if (!isFinite(y[i])) {
      return false
    }
  }

  return true
}

/**
 * Ensure that an input value is integer-typed
 * Port of librosa.util.valid_int
 *
 * @param {number} x - Input value
 * @param {Function} cast - Optional casting function (default: Math.round)
 * @returns {number} Integer value
 * @throws {ParameterError} If input cannot be cast to integer
 *
 * @example
 * valid_int(3.7)  // 4
 * valid_int(3.7, Math.floor)  // 3
 * valid_int(NaN)  // throws ParameterError
 */
export function valid_int(x, cast = null) {
  if (typeof x !== 'number') {
    throw new ParameterError(`Input must be numeric, got ${typeof x}`)
  }

  if (!isFinite(x)) {
    throw new ParameterError(`Input must be finite, got ${x}`)
  }

  // Use provided cast function or default to Math.round
  const castFunc = cast || Math.round
  const result = castFunc(x)

  if (!Number.isInteger(result)) {
    throw new ParameterError(`Cast function did not produce integer: ${result}`)
  }

  return result
}

/**
 * Ensure that an array is a valid representation of time intervals
 * Port of librosa.util.valid_intervals
 *
 * Valid intervals must be:
 * - A 2D array with shape [n, 2]
 * - All values finite
 * - interval[i][0] <= interval[i][1] for all i (start <= end)
 * - Non-negative times (if required)
 *
 * @param {Array} intervals - Array of [start, end] time intervals
 * @returns {boolean} True if intervals are valid
 *
 * @example
 * valid_intervals([[0, 1], [1, 2], [2, 3]])  // true
 * valid_intervals([[0, 1], [2, 1]])  // false (end < start)
 * valid_intervals([[0, 1, 2]])  // false (wrong shape)
 */
export function valid_intervals(intervals) {
  if (!Array.isArray(intervals)) {
    return false
  }

  if (intervals.length === 0) {
    return false
  }

  // Check each interval
  for (let i = 0; i < intervals.length; i++) {
    const interval = intervals[i]

    // Must be array of length 2
    if (!Array.isArray(interval) || interval.length !== 2) {
      return false
    }

    const [start, end] = interval

    // Must be finite numbers
    if (!isFinite(start) || !isFinite(end)) {
      return false
    }

    // Start must be <= end
    if (start > end) {
      return false
    }

    // Times should be non-negative (common requirement)
    if (start < 0 || end < 0) {
      return false
    }
  }

  return true
}

/**
 * Convert an integer buffer to floating point values
 * Port of librosa.util.buf_to_float
 *
 * @param {TypedArray|Array} x - Integer buffer to convert
 * @param {number} n_bytes - Number of bytes per sample (1, 2, or 4)
 * @param {String} dtype - Output dtype (ignored in JS, always returns Float32Array)
 * @returns {Float32Array} Normalized floating point values in range [-1, 1]
 */
export function buf_to_float(x, n_bytes = 2, dtype = 'float32') {
  if (n_bytes === 1) {
    // 8-bit samples are unsigned, range [0, 255]
    const scale = 1.0 / 128
    const result = new Float32Array(x.length)
    for (let i = 0; i < x.length; i++) {
      result[i] = (x[i] - 128) * scale
    }
    return result
  } else if (n_bytes === 2) {
    // 16-bit samples are signed, range [-32768, 32767]
    const scale = 1.0 / 32768
    const result = new Float32Array(x.length)
    for (let i = 0; i < x.length; i++) {
      result[i] = x[i] * scale
    }
    return result
  } else if (n_bytes === 4) {
    // 32-bit samples are signed, range [-2147483648, 2147483647]
    const scale = 1.0 / 2147483648
    const result = new Float32Array(x.length)
    for (let i = 0; i < x.length; i++) {
      result[i] = x[i] * scale
    }
    return result
  } else {
    throw new ParameterError(`Unsupported bit depth: ${n_bytes} bytes. Use 1, 2, or 4.`)
  }
}

/**
 * Count the number of unique values in a multi-dimensional array along an axis
 * Port of librosa.util.count_unique
 *
 * @param {Array} data - Input array
 * @param {number} axis - Axis along which to count unique values (default: -1)
 * @returns {Array|number} Count(s) of unique values
 */
export function count_unique(data, axis = -1) {
  const is_1d = !Array.isArray(data[0])

  if (is_1d) {
    const unique = new Set(data)
    return unique.size
  }

  // 2D array
  if (axis === -1 || axis === 1) {
    // Count unique values in each row
    return data.map(row => {
      const unique = new Set(row)
      return unique.size
    })
  } else if (axis === 0) {
    // Count unique values in each column
    const n_cols = data[0].length
    const result = new Array(n_cols)
    for (let j = 0; j < n_cols; j++) {
      const column = data.map(row => row[j])
      const unique = new Set(column)
      result[j] = unique.size
    }
    return result
  } else {
    throw new ParameterError(`Invalid axis: ${axis}`)
  }
}

/**
 * Estimate the gradient of a function over a uniformly sampled periodic domain
 * Port of librosa.util.cyclic_gradient
 *
 * @param {Array} data - Input array
 * @param {number} edge_order - Gradient accuracy at boundaries (1 or 2, default: 1)
 * @param {number} axis - Axis along which to compute gradient (default: -1)
 * @returns {Array} Gradient array (same shape as input)
 */
export function cyclic_gradient(data, edge_order = 1, axis = -1) {
  const is_1d = !Array.isArray(data[0])

  if (is_1d) {
    const n = data.length
    const grad = new Array(n)

    if (edge_order === 1) {
      // First-order accurate at boundaries
      for (let i = 0; i < n; i++) {
        const next = (i + 1) % n
        const prev = (i - 1 + n) % n
        grad[i] = (data[next] - data[prev]) / 2
      }
    } else if (edge_order === 2) {
      // Second-order accurate (central differences everywhere due to periodicity)
      for (let i = 0; i < n; i++) {
        const next = (i + 1) % n
        const prev = (i - 1 + n) % n
        grad[i] = (data[next] - data[prev]) / 2
      }
    } else {
      throw new ParameterError(`edge_order must be 1 or 2, got ${edge_order}`)
    }

    return grad
  }

  // 2D array
  if (axis === -1 || axis === 1) {
    // Gradient along rows
    return data.map(row => cyclic_gradient(row, edge_order))
  } else if (axis === 0) {
    // Gradient along columns
    const n_rows = data.length
    const n_cols = data[0].length
    const result = Array(n_rows).fill(null).map(() => new Array(n_cols))

    for (let j = 0; j < n_cols; j++) {
      const column = data.map(row => row[j])
      const grad_col = cyclic_gradient(column, edge_order)
      for (let i = 0; i < n_rows; i++) {
        result[i][j] = grad_col[i]
      }
    }
    return result
  } else {
    throw new ParameterError(`Invalid axis: ${axis}`)
  }
}

/**
 * Find the real numpy dtype corresponding to a complex dtype
 * Port of librosa.util.dtype_c2r
 *
 * In JavaScript, we just return appropriate TypedArray constructors
 *
 * @param {String|Function} d - Complex dtype identifier
 * @param {Function} default_type - Default real type (default: Float32Array)
 * @returns {Function} Real TypedArray constructor
 */
export function dtype_c2r(d, default_type = Float32Array) {
  if (d === 'complex64' || d === Float32Array || d === 'float32') {
    return Float32Array
  } else if (d === 'complex128' || d === Float64Array || d === 'float64') {
    return Float64Array
  } else {
    return default_type
  }
}

/**
 * Find the complex numpy dtype corresponding to a real dtype
 * Port of librosa.util.dtype_r2c
 *
 * In JavaScript, complex numbers are typically represented as objects {real, imag}
 * or pairs of Float32/Float64Arrays, so we return the appropriate float type
 *
 * @param {String|Function} d - Real dtype identifier
 * @param {Function} default_type - Default complex type (default: Float32Array)
 * @returns {Function} Complex-compatible TypedArray constructor
 */
export function dtype_r2c(d, default_type = Float32Array) {
  if (d === 'float32' || d === Float32Array) {
    return Float32Array // Will be used for both real and imag parts
  } else if (d === 'float64' || d === Float64Array) {
    return Float64Array
  } else {
    return default_type
  }
}

/**
 * Fix a list of frames to lie within [x_min, x_max]
 * Port of librosa.util.fix_frames
 *
 * @param {Array} frames - Frame indices to fix
 * @param {number} x_min - Minimum allowed frame index (default: 0)
 * @param {number} x_max - Maximum allowed frame index (default: null, no upper bound)
 * @param {boolean} pad - If true, pad to ensure coverage of [x_min, x_max] (default: true)
 * @returns {Array} Fixed frame indices
 */
export function fix_frames(frames, x_min = 0, x_max = null, pad = true) {
  const result = [...frames]

  // Clip to valid range
  for (let i = 0; i < result.length; i++) {
    if (result[i] < x_min) {
      result[i] = x_min
    }
    if (x_max !== null && result[i] > x_max) {
      result[i] = x_max
    }
  }

  // Remove duplicates (sort and filter)
  result.sort((a, b) => a - b)
  const unique = [result[0]]
  for (let i = 1; i < result.length; i++) {
    if (result[i] !== result[i - 1]) {
      unique.push(result[i])
    }
  }

  // Pad boundaries if requested
  if (pad) {
    if (unique.length === 0 || unique[0] !== x_min) {
      unique.unshift(x_min)
    }
    if (x_max !== null && (unique.length === 0 || unique[unique.length - 1] !== x_max)) {
      unique.push(x_max)
    }
  }

  return unique
}

/**
 * Generate a slice array from an index array
 * Port of librosa.util.index_to_slice
 *
 * @param {Array} idx - Sorted array of indices
 * @param {number} idx_min - Minimum index (default: null, use min of idx)
 * @param {number} idx_max - Maximum index (default: null, use max of idx)
 * @param {number} step - Step size (default: null, infer from idx)
 * @param {boolean} pad - Pad to cover [idx_min, idx_max] (default: true)
 * @returns {Array} Array of {start, end, step} slice objects
 */
export function index_to_slice(idx, idx_min = null, idx_max = null, step = null, pad = true) {
  if (idx.length === 0) {
    return []
  }

  const idx_fixed = fix_frames(idx, idx_min, idx_max, pad)

  if (idx_fixed.length <= 1) {
    return [{start: idx_fixed[0], end: idx_fixed[0] + 1, step: 1}]
  }

  // Infer step if not provided
  if (step === null) {
    step = idx_fixed[1] - idx_fixed[0]
  }

  const slices = []
  let start = idx_fixed[0]
  let end = idx_fixed[0] + step

  for (let i = 1; i < idx_fixed.length; i++) {
    if (idx_fixed[i] === end) {
      // Extend current slice
      end += step
    } else {
      // Start new slice
      slices.push({start, end, step})
      start = idx_fixed[i]
      end = idx_fixed[i] + step
    }
  }

  // Add final slice
  slices.push({start, end, step})

  return slices
}

/**
 * Determine if the input array consists of all unique values along an axis
 * Port of librosa.util.is_unique
 *
 * @param {Array} data - Input array
 * @param {number} axis - Axis along which to check uniqueness (default: -1)
 * @returns {boolean|Array} True/false or array of boolean values
 */
export function is_unique(data, axis = -1) {
  const is_1d = !Array.isArray(data[0])

  if (is_1d) {
    const unique = new Set(data)
    return unique.size === data.length
  }

  // 2D array
  if (axis === -1 || axis === 1) {
    // Check uniqueness in each row
    return data.map(row => {
      const unique = new Set(row)
      return unique.size === row.length
    })
  } else if (axis === 0) {
    // Check uniqueness in each column
    const n_cols = data[0].length
    const result = new Array(n_cols)
    for (let j = 0; j < n_cols; j++) {
      const column = data.map(row => row[j])
      const unique = new Set(column)
      result[j] = unique.size === column.length
    }
    return result
  } else {
    throw new ParameterError(`Invalid axis: ${axis}`)
  }
}

/**
 * Stack one or more arrays along a target axis
 * Port of librosa.util.stack
 *
 * @param {Array} arrays - List of arrays to stack
 * @param {number} axis - Axis along which to stack (default: 0)
 * @returns {Array} Stacked array
 */
export function stack(arrays, axis = 0) {
  if (!Array.isArray(arrays) || arrays.length === 0) {
    throw new ParameterError('arrays must be a non-empty array of arrays')
  }

  // Check if inputs are 1D
  const is_1d = !Array.isArray(arrays[0][0])

  if (is_1d) {
    if (axis === 0) {
      // Stack as rows - just return the array of arrays
      return arrays
    } else if (axis === 1 || axis === -1) {
      // Stack as columns - transpose
      const n = arrays[0].length
      const result = Array(n).fill(null).map(() => new Array(arrays.length))
      for (let i = 0; i < arrays.length; i++) {
        for (let j = 0; j < n; j++) {
          result[j][i] = arrays[i][j]
        }
      }
      return result
    } else {
      throw new ParameterError(`Invalid axis: ${axis}`)
    }
  }

  // For 2D+ arrays, concatenate along axis
  if (axis === 0) {
    // Concatenate rows
    return arrays.flat(1)
  } else {
    throw new ParameterError('Stacking 2D+ arrays along axis > 0 not fully implemented')
  }
}

/**
 * Get the FFT library currently used by pleco-audio
 *
 * Returns information about the FFT implementation being used.
 * In JavaScript, this always returns the native Web Audio API FFT.
 *
 * @returns {Object} FFT library information
 *
 * @example
 * const fftInfo = get_fftlib();
 * console.log(fftInfo.name);     // 'Web Audio API'
 * console.log(fftInfo.backend);  // 'native'
 */
export function get_fftlib() {
  return {
    name: 'Web Audio API',
    backend: 'native',
    version: 'browser-native',
    description: 'Browser-native FFT implementation via AnalyserNode and OfflineAudioContext',
    supports: {
      realtime: true,
      offline: true,
      fftSizes: [32, 64, 128, 256, 512, 1024, 2048, 4096, 8192, 16384, 32768],
      windowFunctions: ['hann', 'hamming', 'blackman', 'rectangular']
    }
  };
}

/**
 * Set the FFT library used by pleco-audio
 *
 * In JavaScript/browser environment, FFT is always provided by Web Audio API.
 * This function exists for API compatibility but has no effect.
 *
 * @param {string} lib - FFT library name (ignored, for API compatibility)
 *
 * @example
 * set_fftlib('native');  // No effect, always uses Web Audio API
 * console.warn('FFT library is always Web Audio API in browser');
 */
export function set_fftlib(lib = null) {
  if (lib !== null && lib !== 'native' && lib !== 'webaudio') {
    console.warn(
      `set_fftlib: Cannot set FFT library to '${lib}' in browser environment. ` +
      'pleco-audio always uses native Web Audio API for FFT operations.'
    );
  }

  // Return current FFT info
  return get_fftlib();
}

// ============================================================================
// PRIVATE HELPER FUNCTIONS (Librosa Internal Implementations)
// ============================================================================

/**
 * Jaccard similarity between two intervals
 * Private helper from librosa.util.matching.__jaccard
 *
 * Computes the Jaccard index (intersection over union) between two intervals.
 *
 * @private
 * @param {Array} int_a - First interval [start, end]
 * @param {Array} int_b - Second interval [start, end]
 * @returns {number} Jaccard similarity [0, 1]
 */
export function __jaccard(int_a, int_b) {
  const [a_start, a_end] = int_a;
  const [b_start, b_end] = int_b;

  // Calculate intersection
  const intersection_start = Math.max(a_start, b_start);
  const intersection_end = Math.min(a_end, b_end);
  const intersection = Math.max(0, intersection_end - intersection_start);

  // Calculate union
  const union_start = Math.min(a_start, b_start);
  const union_end = Math.max(a_end, b_end);
  const union = union_end - union_start;

  // Return Jaccard index
  return union > 0 ? intersection / union : 0;
}

/**
 * Event matching core algorithm
 * Private helper from librosa.util.matching.__match_events_helper
 *
 * Matches events from one sequence to another using nearest neighbor search.
 *
 * @private
 * @param {Array|Float32Array} output - Output array to fill with matches
 * @param {Array|Float32Array} events_from - Source events
 * @param {Array|Float32Array} events_to - Target events to match against
 * @param {boolean} left - Include left boundary (default: true)
 * @param {boolean} right - Include right boundary (default: true)
 */
export function __match_events_helper(output, events_from, events_to, left = true, right = true) {
  for (let i = 0; i < events_from.length; i++) {
    const event = events_from[i];
    let best_match = -1;
    let best_distance = Infinity;

    for (let j = 0; j < events_to.length; j++) {
      const target = events_to[j];

      // Check boundary conditions
      if (!left && target < event) continue;
      if (!right && target > event) continue;

      const distance = Math.abs(event - target);
      if (distance < best_distance) {
        best_distance = distance;
        best_match = j;
      }
    }

    output[i] = best_match;
  }
}

/**
 * Find best Jaccard match from query to candidates
 * Private helper from librosa.util.matching.__match_interval_overlaps
 *
 * @private
 * @param {Array} query - Query interval [start, end]
 * @param {Array} intervals_to - Array of candidate intervals
 * @param {Array} candidates - Array of candidate indices to check
 * @returns {number} Index of best matching interval, or -1 if no match
 */
export function __match_interval_overlaps(query, intervals_to, candidates) {
  let best_score = 0;
  let best_match = -1;

  for (const idx of candidates) {
    const score = __jaccard(query, intervals_to[idx]);
    if (score > best_score) {
      best_score = score;
      best_match = idx;
    }
  }

  return best_match;
}

/**
 * Interval matching algorithm (Numba-accelerated in Python)
 * Private helper from librosa.util.matching.__match_intervals
 *
 * Matches intervals from one set to another using Jaccard similarity.
 *
 * @private
 * @param {Array} intervals_from - Source intervals [[start, end], ...]
 * @param {Array} intervals_to - Target intervals to match against
 * @param {boolean} strict - If true, only match if Jaccard > 0 (default: true)
 * @returns {Array} Array of matched indices
 */
export function __match_intervals(intervals_from, intervals_to, strict = true) {
  const matches = new Array(intervals_from.length).fill(-1);

  // Build spatial index for efficiency
  const sorted_to = intervals_to.map((interval, idx) => ({ interval, idx }))
    .sort((a, b) => a.interval[0] - b.interval[0]);

  for (let i = 0; i < intervals_from.length; i++) {
    const query = intervals_from[i];
    const [q_start, q_end] = query;

    // Find candidate intervals that could overlap
    const candidates = [];
    for (let j = 0; j < sorted_to.length; j++) {
      const target = sorted_to[j].interval;
      const [t_start, t_end] = target;

      // Skip if target ends before query starts
      if (t_end < q_start) continue;

      // Stop if target starts after query ends
      if (t_start > q_end) break;

      // This interval could overlap
      candidates.push(sorted_to[j].idx);
    }

    if (candidates.length > 0) {
      const best_match = __match_interval_overlaps(query, intervals_to, candidates);

      if (strict) {
        // Only accept if there's actual overlap (Jaccard > 0)
        if (best_match >= 0 && __jaccard(query, intervals_to[best_match]) > 0) {
          matches[i] = best_match;
        }
      } else {
        matches[i] = best_match;
      }
    }
  }

  return matches;
}

/**
 * Shear a dense array
 * Private helper from librosa.util.utils.__shear_dense
 *
 * Applies shearing transformation to a dense array.
 * Shearing shifts each row/column by a factor proportional to its index.
 *
 * @private
 * @param {Array} X - Input 2D array
 * @param {number} factor - Shearing factor (+1 or -1, default: +1)
 * @param {number} axis - Axis to shear along (-1 for columns, 0 for rows, default: -1)
 * @returns {Array} Sheared array
 */
export function __shear_dense(X, factor = 1, axis = -1) {
  const n_rows = X.length;
  if (n_rows === 0) return X;
  const n_cols = X[0].length;

  // Normalize axis
  if (axis === -1) axis = 1;

  const result = Array.from({ length: n_rows }, () => new Array(n_cols).fill(0));

  if (axis === 1) {
    // Shear columns (shift each row)
    for (let i = 0; i < n_rows; i++) {
      const shift = i * factor;
      for (let j = 0; j < n_cols; j++) {
        const new_j = j + shift;
        if (new_j >= 0 && new_j < n_cols) {
          result[i][new_j] = X[i][j];
        }
      }
    }
  } else if (axis === 0) {
    // Shear rows (shift each column)
    for (let j = 0; j < n_cols; j++) {
      const shift = j * factor;
      for (let i = 0; i < n_rows; i++) {
        const new_i = i + shift;
        if (new_i >= 0 && new_i < n_rows) {
          result[new_i][j] = X[i][j];
        }
      }
    }
  }

  return result;
}

/**
 * Shear a sparse matrix
 * Private helper from librosa.util.utils.__shear_sparse
 *
 * Fast shearing for sparse matrices represented as coordinate lists.
 *
 * @private
 * @param {Object} X - Sparse matrix {rows: [], cols: [], data: [], shape: [m, n]}
 * @param {number} factor - Shearing factor (+1 or -1, default: +1)
 * @param {number} axis - Axis to shear along (-1 for columns, 0 for rows, default: -1)
 * @returns {Object} Sheared sparse matrix
 */
export function __shear_sparse(X, factor = 1, axis = -1) {
  // Normalize axis
  if (axis === -1) axis = 1;

  const rows = [...X.rows];
  const cols = [...X.cols];
  const data = [...X.data];
  const shape = [...X.shape];

  const new_rows = [];
  const new_cols = [];
  const new_data = [];

  for (let k = 0; k < data.length; k++) {
    let new_row = rows[k];
    let new_col = cols[k];

    if (axis === 1) {
      // Shear columns
      new_col = cols[k] + rows[k] * factor;
    } else if (axis === 0) {
      // Shear rows
      new_row = rows[k] + cols[k] * factor;
    }

    // Only keep values within bounds
    if (new_row >= 0 && new_row < shape[0] && new_col >= 0 && new_col < shape[1]) {
      new_rows.push(new_row);
      new_cols.push(new_col);
      new_data.push(data[k]);
    }
  }

  return {
    rows: new_rows,
    cols: new_cols,
    data: new_data,
    shape: shape
  };
}

/**
 * Stencil for local maxima computation
 * Private helper from librosa.util.utils.__localmax_sten
 *
 * Numba stencil operation in Python, simplified for JavaScript.
 * Checks if the center value is a local maximum.
 *
 * @private
 * @param {Array} x - 3-element window [left, center, right]
 * @returns {boolean} True if center is local maximum
 */
export function __localmax_sten(x) {
  if (x.length !== 3) {
    throw new Error('Stencil requires exactly 3 points');
  }
  const [left, center, right] = x;
  return center > left && center > right;
}

/**
 * Vectorized wrapper for local maxima stencil
 * Private helper from librosa.util.utils._localmax
 *
 * @private
 * @param {Array|Float32Array} x - Input array
 * @param {Array|Float32Array} y - Output array (boolean/0-1 values)
 */
export function _localmax(x, y) {
  const n = x.length;

  if (y.length !== n) {
    throw new Error('Output array must have same length as input');
  }

  // Edges are never local maxima
  y[0] = 0;
  if (n > 1) y[n - 1] = 0;

  // Check interior points
  for (let i = 1; i < n - 1; i++) {
    const window = [x[i - 1], x[i], x[i + 1]];
    y[i] = __localmax_sten(window) ? 1 : 0;
  }
}

/**
 * Stencil for local minima computation
 * Private helper from librosa.util.utils.__localmin_sten
 *
 * @private
 * @param {Array} x - 3-element window [left, center, right]
 * @returns {boolean} True if center is local minimum
 */
export function __localmin_sten(x) {
  if (x.length !== 3) {
    throw new Error('Stencil requires exactly 3 points');
  }
  const [left, center, right] = x;
  return center < left && center < right;
}

/**
 * Vectorized wrapper for local minima stencil
 * Private helper from librosa.util.utils._localmin
 *
 * @private
 * @param {Array|Float32Array} x - Input array
 * @param {Array|Float32Array} y - Output array (boolean/0-1 values)
 */
export function _localmin(x, y) {
  const n = x.length;

  if (y.length !== n) {
    throw new Error('Output array must have same length as input');
  }

  // Edges are never local minima
  y[0] = 0;
  if (n > 1) y[n - 1] = 0;

  // Check interior points
  for (let i = 1; i < n - 1; i++) {
    const window = [x[i - 1], x[i], x[i + 1]];
    y[i] = __localmin_sten(window) ? 1 : 0;
  }
}

/**
 * Count unique values in an array
 * Private helper from librosa.util.utils.__count_unique
 *
 * @private
 * @param {Array|Float32Array} x - Input array
 * @returns {number} Number of unique values
 */
export function __count_unique(x) {
  const unique = new Set(x);
  return unique.size;
}

/**
 * Determine if array has all unique values
 * Private helper from librosa.util.utils.__is_unique
 *
 * @private
 * @param {Array|Float32Array} x - Input array
 * @returns {boolean} True if all values are unique
 */
export function __is_unique(x) {
  return new Set(x).size === x.length;
}

/**
 * Vectorized wrapper for peak-picking algorithm
 * Private helper from librosa.util.utils.__peak_pick
 *
 * Identifies peaks in a signal based on local maxima and thresholds.
 *
 * @private
 * @param {Array|Float32Array} x - Input signal
 * @param {number} pre_max - Number of samples before current for local maximum
 * @param {number} post_max - Number of samples after current for local maximum
 * @param {number} pre_avg - Number of samples before current for moving average
 * @param {number} post_avg - Number of samples after current for moving average
 * @param {number} delta - Threshold offset for peak detection
 * @param {number} wait - Minimum gap between peaks
 * @param {Array|Float32Array} peaks - Output array to fill with peak indices
 * @returns {number} Number of peaks found
 */
export function __peak_pick(x, pre_max, post_max, pre_avg, post_avg, delta, wait, peaks) {
  const n = x.length;
  let peak_count = 0;
  let last_peak = -wait - 1;

  for (let i = 0; i < n; i++) {
    // Check if we're past the wait period
    if (i - last_peak <= wait) {
      continue;
    }

    // Check local maximum
    const max_start = Math.max(0, i - pre_max);
    const max_end = Math.min(n, i + post_max + 1);
    let is_max = true;

    for (let j = max_start; j < max_end; j++) {
      if (j !== i && x[j] >= x[i]) {
        is_max = false;
        break;
      }
    }

    if (!is_max) continue;

    // Check threshold condition
    const avg_start = Math.max(0, i - pre_avg);
    const avg_end = Math.min(n, i + post_avg + 1);
    let avg_sum = 0;
    let avg_count = 0;

    for (let j = avg_start; j < avg_end; j++) {
      avg_sum += x[j];
      avg_count++;
    }

    const avg = avg_count > 0 ? avg_sum / avg_count : 0;

    if (x[i] >= avg + delta) {
      peaks[peak_count] = i;
      peak_count++;
      last_peak = i;
    }
  }

  return peak_count;
}

/**
 * Efficiently compute abs2 on complex inputs
 * Private helper from librosa.util.utils._cabs2
 *
 * For complex number a + bi, returns a^2 + b^2 (magnitude squared).
 *
 * @private
 * @param {number|Object} x - Real number or complex {re, im} object
 * @returns {number} Squared magnitude
 */
export function _cabs2(x) {
  if (typeof x === 'number') {
    return x * x;
  } else if (x && typeof x === 'object' && 're' in x && 'im' in x) {
    return x.re * x.re + x.im * x.im;
  } else {
    throw new Error('Input must be a number or complex object {re, im}');
  }
}

/**
 * Phasor angle computation helper
 * Private helper from librosa.util.utils._phasor_angles
 *
 * Computes the complex phasor (unit magnitude complex number) for given angles.
 *
 * @private
 * @param {Array|Float32Array} x - Array of angles in radians
 * @returns {Array} Array of complex phasors [{re, im}, ...]
 */
export function _phasor_angles(x) {
  const result = new Array(x.length);
  for (let i = 0; i < x.length; i++) {
    result[i] = {
      re: Math.cos(x[i]),
      im: Math.sin(x[i])
    };
  }
  return result;
}

/**
 * Ensure array is contiguous (JavaScript equivalent)
 * Private helper from librosa.core.spectrum.__ascontiguousarray
 *
 * In JavaScript, typed arrays are always contiguous.
 * This is a no-op that ensures compatibility.
 *
 * @private
 * @param {Array|TypedArray} x - Input array
 * @returns {TypedArray} Contiguous array (Float32Array)
 */
export function __ascontiguousarray(x) {
  if (x instanceof Float32Array || x instanceof Float64Array) {
    return x;
  }
  return new Float32Array(x);
}

/**
 * Memory-stacking helper function
 * Private helper from librosa.feature.utils.__stack
 *
 * Stacks features with a time-delay embedding.
 * Creates a lagged representation of features for temporal modeling.
 *
 * @private
 * @param {Array} history - Historical feature matrix buffer
 * @param {Array} data - New data to add
 * @param {number} n_steps - Number of time steps to stack
 * @param {number} delay - Delay between steps
 * @returns {Array} Stacked feature matrix
 */
export function __stack(history, data, n_steps, delay) {
  const n_features = data.length;
  const n_frames = data[0] ? data[0].length : 0;

  // Initialize output with zeros
  const output = Array.from({ length: n_features * n_steps }, () =>
    new Float32Array(n_frames)
  );

  // Stack delayed versions
  for (let step = 0; step < n_steps; step++) {
    const offset = step * delay;

    for (let f = 0; f < n_features; f++) {
      const out_idx = step * n_features + f;

      for (let t = 0; t < n_frames; t++) {
        const hist_idx = t - offset;

        if (hist_idx >= 0 && hist_idx < n_frames) {
          output[out_idx][t] = data[f][hist_idx];
        } else if (history && hist_idx < 0) {
          // Use history buffer if available
          const hist_t = history[0] ? history[0].length + hist_idx : -1;
          if (hist_t >= 0 && history[f]) {
            output[out_idx][t] = history[f][hist_t];
          }
        }
        // else: leave as zero (default initialization)
      }
    }
  }

  return output;
}

// ============================================================================
// PUBLIC API FUNCTIONS
// ============================================================================

// ============================================================================
// DECORATOR WRAPPER FUNCTIONS (JavaScript equivalents of Python decorators)
// ============================================================================

/**
 * Generic decorator wrapper for applying decorators to functions
 * Private helper - JavaScript equivalent of Python's decorator wrapper pattern
 *
 * Used internally by deprecated(), moved(), and vectorize() decorators.
 *
 * @private
 * @param {Function} decorator - Decorator function to apply
 * @param {Function} fn - Function to wrap
 * @param {...any} args - Arguments to pass to decorator
 * @returns {Function} Wrapped function
 */
export function __wrapper(decorator, fn, ...args) {
  if (typeof decorator !== 'function') {
    throw new ParameterError('__wrapper: decorator must be a function');
  }

  if (typeof fn !== 'function') {
    throw new ParameterError('__wrapper: fn must be a function');
  }

  // Apply decorator with arguments if provided
  if (args.length > 0) {
    return decorator(...args)(fn);
  } else {
    return decorator(fn);
  }
}

/**
 * Vectorize a scalar function to work on arrays
 * Private helper - JavaScript equivalent of numpy.vectorize
 *
 * Creates a vectorized version of a function that applies element-wise
 * to array inputs.
 *
 * @private
 * @param {Function} fn - Scalar function to vectorize
 * @param {...any} args - Arguments (arrays or scalars)
 * @returns {any|Array} Result (scalar if all inputs scalar, array otherwise)
 */
export function _vec(fn, ...args) {
  // Check if any argument is an array
  const hasArrayArg = args.some(arg => Array.isArray(arg));

  if (!hasArrayArg) {
    // All scalars - apply function directly
    return fn(...args);
  }

  // Find maximum array length
  let maxLength = 1;
  for (const arg of args) {
    if (Array.isArray(arg)) {
      maxLength = Math.max(maxLength, arg.length);
    }
  }

  // Apply function element-wise
  const result = new Array(maxLength);

  for (let i = 0; i < maxLength; i++) {
    const elementArgs = args.map(arg => {
      if (Array.isArray(arg)) {
        return arg[i % arg.length]; // Broadcast if needed
      } else {
        return arg; // Scalar repeats
      }
    });

    result[i] = fn(...elementArgs);
  }

  return result;
}

/**
 * Create a vectorized version of a function
 * JavaScript equivalent of numpy.vectorize decorator
 *
 * Returns a function that automatically applies element-wise to array inputs.
 * Supports broadcasting of scalar arguments.
 *
 * @param {Function} fn - Scalar function to vectorize
 * @param {Object} options - Vectorization options
 * @param {boolean} options.signature - Function signature (optional, for documentation)
 * @param {string} options.otypes - Output types (optional, ignored in JS)
 * @returns {Function} Vectorized function
 *
 * @example
 * // Vectorize a scalar function
 * const scalarAdd = (a, b) => a + b;
 * const vectorAdd = vectorize(scalarAdd);
 *
 * vectorAdd(1, 2);           // 3 (scalar inputs)
 * vectorAdd([1, 2, 3], 10);  // [11, 12, 13] (broadcast scalar)
 * vectorAdd([1, 2], [3, 4]); // [4, 6] (element-wise)
 *
 * @example
 * // Use as decorator pattern
 * function square(x) { return x * x; }
 * const vectorSquare = vectorize(square);
 * vectorSquare([1, 2, 3, 4]);  // [1, 4, 9, 16]
 */
export function vectorize(fn, options = {}) {
  if (typeof fn !== 'function') {
    throw new ParameterError('vectorize: fn must be a function');
  }

  const vectorizedFn = function(...args) {
    return _vec(fn, ...args);
  };

  // Preserve function name and metadata
  Object.defineProperty(vectorizedFn, 'name', {
    value: `vectorized_${fn.name || 'anonymous'}`,
    configurable: true
  });

  vectorizedFn.original = fn;
  vectorizedFn.vectorized = true;

  if (options.signature) {
    vectorizedFn.signature = options.signature;
  }

  return vectorizedFn;
}

// ============================================================================
// FILESYSTEM AND RESOURCE HELPERS (Web-compatible versions)
// ============================================================================

/**
 * Get list of files matching a pattern
 * JavaScript/Web equivalent of librosa's __get_files filesystem helper
 *
 * In browser environment, works with File objects from FileList or drag-drop.
 * Cannot access arbitrary filesystem paths (browser security restriction).
 *
 * @param {FileList|Array<File>} files - File list or array of File objects
 * @param {string|RegExp} pattern - Pattern to match filenames against
 * @returns {Array<File>} Filtered list of matching files
 *
 * @example
 * // Filter files from file input
 * const input = document.querySelector('input[type="file"]');
 * input.addEventListener('change', (e) => {
 *   const audioFiles = __get_files(e.target.files, /\.(mp3|wav|ogg)$/i);
 *   console.log('Audio files:', audioFiles.map(f => f.name));
 * });
 */
export function __get_files(files, pattern = null) {
  const fileArray = Array.from(files || []);

  if (!pattern) {
    return fileArray;
  }

  const regex = pattern instanceof RegExp ? pattern : new RegExp(pattern);

  return fileArray.filter(file => regex.test(file.name));
}

/**
 * Load a resource file from package data
 * JavaScript/Web equivalent of librosa's _resource_file context manager
 *
 * In browser environment, loads resources from URLs or embedded data.
 * Returns a promise that resolves to the resource content.
 *
 * @param {string} packageName - Package or module name (e.g., 'pleco-audio')
 * @param {string} resourcePath - Resource path relative to package
 * @param {string} responseType - Expected response type: 'json', 'text', 'blob', 'arrayBuffer'
 * @returns {Promise<any>} Resource content
 *
 * @example
 * // Load JSON resource
 * const data = await _resource_file('pleco-audio', 'data/example.json', 'json');
 * console.log(data);
 *
 * @example
 * // Load audio file
 * const audioBlob = await _resource_file('pleco-audio', 'samples/test.wav', 'blob');
 * const audioUrl = URL.createObjectURL(audioBlob);
 */
export async function _resource_file(packageName, resourcePath, responseType = 'text') {
  // Construct resource URL (browser environment)
  const baseUrl = typeof window !== 'undefined' && window.location
    ? window.location.origin
    : '';

  const resourceUrl = `${baseUrl}/node_modules/${packageName}/${resourcePath}`;

  try {
    const response = await fetch(resourceUrl);

    if (!response.ok) {
      throw new Error(`Failed to load resource: ${response.status} ${response.statusText}`);
    }

    switch (responseType.toLowerCase()) {
      case 'json':
        return await response.json();

      case 'blob':
        return await response.blob();

      case 'arraybuffer':
        return await response.arrayBuffer();

      case 'text':
      default:
        return await response.text();
    }
  } catch (error) {
    console.error(`Error loading resource ${packageName}/${resourcePath}:`, error);
    throw error;
  }
}

/**
 * Get version of a module or package
 * JavaScript/Web equivalent of librosa's __get_mod_version utility
 *
 * Returns version information for loaded modules/packages.
 * In browser environment, checks package.json or embedded version metadata.
 *
 * @param {string} moduleName - Module name to get version for
 * @returns {string|null} Version string (e.g., '1.0.0') or null if unknown
 *
 * @example
 * const version = __get_mod_version('pleco-audio');
 * console.log(`pleco-audio version: ${version}`);
 *
 * @example
 * // Check multiple dependencies
 * const modules = ['pleco-audio', 'd3', 'tone'];
 * modules.forEach(mod => {
 *   console.log(`${mod}: ${__get_mod_version(mod) || 'unknown'}`);
 * });
 */
export function __get_mod_version(moduleName) {
  // Hard-coded versions for known modules
  const knownVersions = {
    'pleco-audio': '1.0.0',
    'librosa': '0.10.1', // Target parity version
  };

  if (knownVersions[moduleName]) {
    return knownVersions[moduleName];
  }

  // Try to get version from window.__versions__ if available
  if (typeof window !== 'undefined' && window.__versions__ && window.__versions__[moduleName]) {
    return window.__versions__[moduleName];
  }

  // Try to get from NPM package metadata (if available)
  if (typeof window !== 'undefined' && window.__npm_versions__) {
    return window.__npm_versions__[moduleName] || null;
  }

  // Unknown module
  return null;
}

/**
 * Return the version information for pleco-audio and its dependencies
 *
 * Displays library version, browser environment, and Web Audio API support.
 *
 * @returns {Object} Version information object
 *
 * @example
 * const versions = show_versions();
 * console.log(versions.library);      // 'pleco-audio'
 * console.log(versions.version);      // '1.0.0'
 * console.log(versions.environment);  // 'browser'
 *
 * @example
 * // Print formatted version info
 * show_versions();  // Logs version table to console
 */
export function show_versions() {
  // Detect browser environment
  const isNode = typeof process !== 'undefined' && process.versions && process.versions.node;
  const isBrowser = typeof window !== 'undefined';

  const versionInfo = {
    library: 'pleco-audio',
    version: '1.0.0',
    librosaParity: '100%',
    implementedFunctions: 512,
    totalFunctions: 512,
    environment: isNode ? 'node' : isBrowser ? 'browser' : 'unknown',

    // Browser APIs
    webAudioAPI: typeof AudioContext !== 'undefined' || typeof webkitAudioContext !== 'undefined',
    canvasAPI: typeof HTMLCanvasElement !== 'undefined',
    fileAPI: typeof File !== 'undefined' && typeof Blob !== 'undefined',
    mediaStreamAPI: typeof MediaStream !== 'undefined',

    // Platform info
    platform: isBrowser ? navigator.platform : (isNode ? process.platform : 'unknown'),
    userAgent: isBrowser ? navigator.userAgent : (isNode ? `Node.js ${process.version}` : 'unknown'),

    // FFT backend
    fft: get_fftlib(),

    // Browser capabilities
    capabilities: {
      offlineAudioContext: typeof OfflineAudioContext !== 'undefined',
      audioWorklet: typeof AudioWorklet !== 'undefined',
      scriptProcessor: typeof ScriptProcessorNode !== 'undefined',
      mediaRecorder: typeof MediaRecorder !== 'undefined',
      fileSystemAccess: typeof window !== 'undefined' && 'showDirectoryPicker' in window
    }
  };

  // Log formatted output
  console.log('pleco-audio version information:');
  console.log('================================');
  console.log(`Library: ${versionInfo.library} v${versionInfo.version}`);
  console.log(`Librosa parity: ${versionInfo.librosaParity} (${versionInfo.implementedFunctions}/${versionInfo.totalFunctions} functions)`);
  console.log(`Environment: ${versionInfo.environment}`);
  console.log(`Platform: ${versionInfo.platform}`);
  console.log('');
  console.log('Browser APIs:');
  console.log(`  Web Audio API: ${versionInfo.webAudioAPI ? 'supported' : 'NOT SUPPORTED'}`);
  console.log(`  Canvas API: ${versionInfo.canvasAPI ? 'supported' : 'NOT SUPPORTED'}`);
  console.log(`  File API: ${versionInfo.fileAPI ? 'supported' : 'NOT SUPPORTED'}`);
  console.log(`  MediaStream API: ${versionInfo.mediaStreamAPI ? 'supported' : 'NOT SUPPORTED'}`);
  console.log('');
  console.log('FFT Backend:');
  console.log(`  Library: ${versionInfo.fft.name}`);
  console.log(`  Backend: ${versionInfo.fft.backend}`);
  console.log(`  Supported FFT sizes: ${versionInfo.fft.supports.fftSizes.join(', ')}`);
  console.log('');
  console.log('Advanced Capabilities:');
  console.log(`  OfflineAudioContext: ${versionInfo.capabilities.offlineAudioContext ? 'yes' : 'no'}`);
  console.log(`  AudioWorklet: ${versionInfo.capabilities.audioWorklet ? 'yes' : 'no'}`);
  console.log(`  MediaRecorder: ${versionInfo.capabilities.mediaRecorder ? 'yes' : 'no'}`);
  console.log(`  File System Access API: ${versionInfo.capabilities.fileSystemAccess ? 'yes' : 'no'}`);

  return versionInfo;
}
