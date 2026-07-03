/**
 * Split functionality for JavaScript.
 * SHIM (Wave 5A): delegates to the canonical implementation
 * in src/effects/index.js (fixture-gated: effects.json). The legacy local
 * implementation used peak sample amplitude as the silence reference and
 * extended interval ends by a full frame — repaired in the canonical module.
 */

import { split as splitCanonical } from '../effects/index.js'

/**
 * Split audio into non-silent intervals.
 * @param {Float32Array} y - Audio time series
 * @param {number} top_db - Silence threshold in dB below reference
 * @param {number|null} ref - Reference amplitude (max frame RMS if null)
 * @param {number} frame_length - Frame size for analysis
 * @param {number} hop_length - Frame hop size
 * @returns {Array<number[]>} Array of [start, end) sample intervals for non-silent regions
 */
export function split(
  y,
  top_db = 60,
  ref = null,
  frame_length = 2048,
  hop_length = 512,
) {
  return splitCanonical(y, { top_db, ref, frame_length, hop_length })
}

/**
 * Get non-silent segments for visualization with Web Audio API
 * @param {AudioBuffer} audioBuffer - Input audio buffer
 * @param {number} top_db - Silence threshold in dB
 * @returns {Array} Array of segment objects with time and sample info
 */
export function getNonSilentSegments(audioBuffer, top_db = 60) {
  const channelData = audioBuffer.getChannelData(0)
  const sampleRate = audioBuffer.sampleRate
  const intervals = split(channelData, top_db)

  // Convert to time intervals
  return intervals.map(([start, end]) => ({
    startTime: start / sampleRate,
    endTime: end / sampleRate,
    startSample: start,
    endSample: end,
    duration: (end - start) / sampleRate,
  }))
}
