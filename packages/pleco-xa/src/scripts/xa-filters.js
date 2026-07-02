/**
 * Audio filters for JavaScript
 * Preemphasis and deemphasis filtering
 */

/**
 * Apply first-order differencing filter (high-pass)
 * @param {Float32Array} y - Audio time series
 * @param {number} coef - Filter coefficient (typically 0.97)
 * @param {number|null} zi - Initial filter state
 * @param {boolean} return_zf - Whether to return final filter state
 * @returns {Float32Array|Object} Filtered audio or object with audio and final state
 */
export function preemphasis(y, coef = 0.97, zi = null, return_zf = false) {
  // Apply pre-emphasis filter: y[n] = x[n] - coef * x[n-1]
  const y_out = new Float32Array(y.length)

  // Initialize filter state
  let z = zi !== null ? zi : 0

  // Apply filter
  for (let n = 0; n < y.length; n++) {
    if (n === 0) {
      y_out[n] = y[n] - coef * z
      z = y[n]
    } else {
      y_out[n] = y[n] - coef * y[n - 1]
    }
  }

  // Final filter state
  const zf = y[y.length - 1]

  if (return_zf) {
    return { y: y_out, zf: zf }
  } else {
    return y_out
  }
}

/**
 * Apply inverse of preemphasis filter (low-pass)
 * @param {Float32Array} y - Audio time series
 * @param {number} coef - Filter coefficient (typically 0.97)
 * @param {number|null} zi - Initial filter state
 * @param {boolean} return_zf - Whether to return final filter state
 * @returns {Float32Array|Object} Filtered audio or object with audio and final state
 */
export function deemphasis(y, coef = 0.97, zi = null, return_zf = false) {
  // Apply de-emphasis filter: y[n] = x[n] + coef * y[n-1]
  const y_out = new Float32Array(y.length)

  // Initialize filter state
  let z = zi !== null ? zi : 0

  // Apply filter
  for (let n = 0; n < y.length; n++) {
    if (n === 0) {
      y_out[n] = y[n] + coef * z
    } else {
      y_out[n] = y[n] + coef * y_out[n - 1]
    }
  }

  // Final filter state
  const zf = y_out[y_out.length - 1]

  if (return_zf) {
    return { y: y_out, zf: zf }
  } else {
    return y_out
  }
}

/**
 * Simple high-pass filter
 * @param {Float32Array} y - Audio time series
 * @param {number} cutoff - Cutoff frequency (normalized 0-1)
 * @returns {Float32Array} Filtered audio
 */
export function highpass(y, cutoff = 0.1) {
  const alpha = Math.exp(-2 * Math.PI * cutoff)
  const y_out = new Float32Array(y.length)

  y_out[0] = y[0]
  for (let n = 1; n < y.length; n++) {
    y_out[n] = alpha * y_out[n - 1] + alpha * (y[n] - y[n - 1])
  }

  return y_out
}

/**
 * Simple low-pass filter
 * @param {Float32Array} y - Audio time series
 * @param {number} cutoff - Cutoff frequency (normalized 0-1)
 * @returns {Float32Array} Filtered audio
 */
export function lowpass(y, cutoff = 0.1) {
  const alpha = Math.exp(-2 * Math.PI * cutoff)
  const y_out = new Float32Array(y.length)

  y_out[0] = y[0]
  for (let n = 1; n < y.length; n++) {
    y_out[n] = alpha * y_out[n - 1] + (1 - alpha) * y[n]
  }

  return y_out
}
