/**
 * Librosa-style trim functionality for JavaScript.
 * SHIM (Wave 5A): delegates to the canonical librosa-parity implementation
 * in src/effects/index.js (fixture-gated: effects.json). The legacy local
 * implementation used peak sample amplitude as the silence reference (librosa
 * uses max frame RMS), extended the end index by a full frame, and spread the
 * whole signal through Math.max — all repaired in the canonical module.
 */

import { trim as trimCanonical } from '../effects/index.js'

/**
 * Remove leading and trailing silence from audio.
 * @param {Float32Array} y - Audio time series
 * @param {number} top_db - Silence threshold in dB below reference
 * @param {number|null} ref - Reference amplitude (max frame RMS if null)
 * @param {number} frame_length - Frame size for analysis
 * @param {number} hop_length - Frame hop size
 * @returns {{y_trimmed: Float32Array, index: number[]}} Trimmed audio and [start, end).
 *   All-silent input yields an empty y_trimmed with index [0, 0] (librosa semantics).
 */
export function trim(
  y,
  top_db = 60,
  ref = null,
  frame_length = 2048,
  hop_length = 512,
) {
  const [y_trimmed, index] = trimCanonical(y, { top_db, ref, frame_length, hop_length })
  return { y_trimmed, index }
}

/**
 * Auto-trim audio buffer for Web Audio API
 * @param {AudioContext} audioContext - Web Audio context
 * @param {AudioBuffer} audioBuffer - Input audio buffer
 * @param {number} top_db - Silence threshold in dB
 * @returns {AudioBuffer} Trimmed audio buffer
 */
export function autoTrimBuffer(audioContext, audioBuffer, top_db = 30) {
  const channelData = audioBuffer.getChannelData(0)
  const trimResult = trim(channelData, top_db)

  // Create new buffer with trimmed audio
  const newBuffer = audioContext.createBuffer(
    audioBuffer.numberOfChannels,
    trimResult.y_trimmed.length,
    audioBuffer.sampleRate,
  )

  // Copy trimmed data to all channels
  for (let channel = 0; channel < audioBuffer.numberOfChannels; channel++) {
    if (channel === 0) {
      newBuffer.copyToChannel(trimResult.y_trimmed, channel)
    } else {
      // For other channels, trim the same region
      const originalChannel = audioBuffer.getChannelData(channel)
      const trimmedChannel = originalChannel.slice(
        trimResult.index[0],
        trimResult.index[1],
      )
      newBuffer.copyToChannel(trimmedChannel, channel)
    }
  }

  return newBuffer
}
