/**
 * Librosa-style trim functionality for JavaScript
 * Remove leading and trailing silence from audio
 */

/**
 * Remove leading and trailing silence from audio
 * @param {Float32Array} y - Audio time series
 * @param {number} top_db - Silence threshold in dB below reference
 * @param {number|null} ref - Reference power (auto-calculated if null)
 * @param {number} frame_length - Frame size for analysis
 * @param {number} hop_length - Frame hop size
 * @returns {Object} Object with trimmed audio and indices
 */
export function trim(
  y,
  top_db = 60,
  ref = null,
  frame_length = 2048,
  hop_length = 512,
) {
  // Calculate reference power if not provided
  if (ref === null) {
    ref = Math.max(...y.map((x) => Math.abs(x)))
  }

  // Convert to power and then to dB
  const threshold = Math.pow(10, -top_db / 20) * ref

  // Compute envelope using frame-based energy
  const envelope = []
  for (let i = 0; i <= y.length - frame_length; i += hop_length) {
    const frame = y.slice(i, i + frame_length)
    const energy = Math.sqrt(
      frame.reduce((sum, x) => sum + x * x, 0) / frame_length,
    )
    envelope.push(energy)
  }

  // Find non-silent regions
  let start_frame = 0
  let end_frame = envelope.length - 1

  // Find first non-silent frame
  for (let i = 0; i < envelope.length; i++) {
    if (envelope[i] >= threshold) {
      start_frame = i
      break
    }
  }

  // Find last non-silent frame
  for (let i = envelope.length - 1; i >= 0; i--) {
    if (envelope[i] >= threshold) {
      end_frame = i
      break
    }
  }

  // Convert frame indices to sample indices
  const start_sample = start_frame * hop_length
  const end_sample = Math.min(end_frame * hop_length + frame_length, y.length)

  // Return trimmed audio and indices
  return {
    y_trimmed: y.slice(start_sample, end_sample),
    index: [start_sample, end_sample],
  }
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
