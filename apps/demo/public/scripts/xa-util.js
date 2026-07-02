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
export const validAudio = cache(20)((y, mono = true) => {
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
  if (mono && y.length > 0 && Array.isArray(y[0])) {
    throw new ParameterError('Audio data must be mono (1D array)')
  }

  return true
})

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
export const normalize = cache(40)((
  S,
  { norm = Infinity, axis = 0, threshold = null, fill = null } = {},
) => {
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

  // For 1D arrays
  if (!Array.isArray(S[0])) {
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
})

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
  // JavaScript uses double precision floats
  return Number.EPSILON
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
  while (Array.isArray(current)) {
    shape.push(current.length)
    current = current[0]
  }
  return shape
}

function flatten(arr) {
  if (!Array.isArray(arr)) return [arr]
  return arr.flat(Infinity)
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
