/**
 * Remix functionality for JavaScript.
 * SHIM (Wave 5A): remix() delegates to the canonical librosa-parity
 * implementation in src/effects/index.js. The legacy local implementation
 * SORTED intervals by start time, which defeated reordering — librosa's
 * canonical remix use case (beat reversal) was a no-op through it. The
 * canonical remix preserves caller order and defaults align_zeros=true,
 * snapping boundaries to zero crossings of the whole signal (librosa
 * match_events semantics) instead of shrinking each segment.
 */

import { remix as remixCanonical } from '../effects/index.js'

/**
 * Helper function to find zero crossings
 * @param {Float32Array} y - Audio data
 * @param {number} start - Starting index
 * @param {number} direction - Search direction (1 for forward, -1 for backward)
 * @returns {number|null} Zero crossing index or null if not found
 */
export function find_zero_crossing(y, start, direction) {
  let i = start

  while (i >= 0 && i < y.length - 1) {
    if ((y[i] <= 0 && y[i + 1] > 0) || (y[i] >= 0 && y[i + 1] < 0)) {
      return i
    }
    i += direction
  }

  return null
}

/**
 * Remix audio by reordering time intervals (caller order preserved).
 * @param {Float32Array} y - Audio time series
 * @param {Array<number[]>} intervals - [start, end) sample intervals, in output order
 * @param {boolean} align_zeros - Snap boundaries to zero crossings of y (librosa default: true)
 * @returns {Float32Array} Remixed audio
 */
export function remix(y, intervals, align_zeros = true) {
  return remixCanonical(y, intervals, { align_zeros })
}

/**
 * Simple crossfade between two audio segments
 * @param {Float32Array} seg1 - First audio segment
 * @param {Float32Array} seg2 - Second audio segment
 * @param {number} fade_samples - Number of samples for crossfade
 * @returns {Float32Array} Crossfaded audio
 */
export function crossfade(seg1, seg2, fade_samples = 1024) {
  const result = new Float32Array(seg1.length + seg2.length - fade_samples)

  // Copy first segment
  result.set(seg1.slice(0, seg1.length - fade_samples))

  // Crossfade region
  const fade_start = seg1.length - fade_samples
  for (let i = 0; i < fade_samples; i++) {
    const alpha = i / fade_samples // 0 to 1
    const sample1 = seg1[seg1.length - fade_samples + i]
    const sample2 = seg2[i]
    result[fade_start + i] = sample1 * (1 - alpha) + sample2 * alpha
  }

  // Copy rest of second segment
  result.set(seg2.slice(fade_samples), fade_start + fade_samples)

  return result
}
