/**
 * Remix functionality for JavaScript
 * Re-order time intervals in audio with zero-crossing alignment
 */

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
 * Remix audio by reordering time intervals
 * @param {Float32Array} y - Audio time series
 * @param {Array} intervals - Array of [start, end] sample indices to reorder
 * @param {boolean} align_zeros - Whether to align segments to zero crossings
 * @returns {Float32Array} Remixed audio
 */
export function remix(y, intervals, align_zeros = false) {
  // Validate intervals
  intervals = intervals.map((interval) => {
    if (interval[0] < 0 || interval[1] > y.length) {
      throw new Error('Interval exceeds audio bounds')
    }
    return interval
  })

  // Sort intervals by start time if needed
  intervals.sort((a, b) => a[0] - b[0])

  // Extract and concatenate intervals
  const segments = []

  for (let [start, end] of intervals) {
    // Convert to integer sample indices
    start = Math.floor(start)
    end = Math.floor(end)

    // Extract segment
    let segment = y.slice(start, end)

    // Align zeros if requested
    if (align_zeros && segment.length > 0) {
      // Find zero crossings
      const zero_start = find_zero_crossing(segment, 0, 1)
      const zero_end = find_zero_crossing(segment, segment.length - 1, -1)

      if (zero_start !== null && zero_end !== null) {
        segment = segment.slice(zero_start, zero_end + 1)
      }
    }

    segments.push(segment)
  }

  // Concatenate all segments
  const total_length = segments.reduce((sum, seg) => sum + seg.length, 0)
  const result = new Float32Array(total_length)

  let offset = 0
  for (let segment of segments) {
    result.set(segment, offset)
    offset += segment.length
  }

  return result
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
