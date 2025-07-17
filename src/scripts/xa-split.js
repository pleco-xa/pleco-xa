/**
 * Librosa-style split functionality for JavaScript
 * Split audio into non-silent intervals
 */

/**
 * Split audio into non-silent intervals
 * @param {Float32Array} y - Audio time series
 * @param {number} top_db - Silence threshold in dB below reference
 * @param {number|null} ref - Reference power (auto-calculated if null)
 * @param {number} frame_length - Frame size for analysis
 * @param {number} hop_length - Frame hop size
 * @returns {Array} Array of [start, end] sample indices for non-silent intervals
 */
export function split(
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

  // Compute envelope
  const envelope = []
  for (let i = 0; i <= y.length - frame_length; i += hop_length) {
    const frame = y.slice(i, i + frame_length)
    const energy = Math.sqrt(
      frame.reduce((sum, x) => sum + x * x, 0) / frame_length,
    )
    envelope.push(energy)
  }

  // Find non-silent intervals
  const intervals = []
  let in_sound = false
  let start = 0

  for (let i = 0; i < envelope.length; i++) {
    if (!in_sound && envelope[i] >= threshold) {
      // Start of non-silent interval
      start = i * hop_length
      in_sound = true
    } else if (in_sound && envelope[i] < threshold) {
      // End of non-silent interval
      const end = Math.min(i * hop_length + frame_length, y.length)
      intervals.push([start, end])
      in_sound = false
    }
  }

  // Handle case where audio ends while still in sound
  if (in_sound) {
    intervals.push([start, y.length])
  }

  return intervals
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
