// @ts-check
/**
 * Audio time compression and manipulation
 * Part of Pleco Xa audio analysis engine
 */

import { debugLog } from './debug.js'

/**
 * Pitch-based audio compression (changes both pitch and tempo)
 * @param {AudioBuffer} audioBuffer - Input audio buffer
 * @param {number} ratio - Compression ratio (0.8 = 20% faster)
 * @returns {Promise<AudioBuffer>} Compressed audio buffer
 */
export async function pitchBasedCompress(audioBuffer, ratio) {
  // Simple resampling - changes both pitch and tempo
  const originalSampleRate = audioBuffer.sampleRate
  const newLength = Math.floor(audioBuffer.length * ratio)

  // Use standard AudioContext; throw if not available
  if (!window.AudioContext) {
    throw new Error('Web Audio API is not supported in this browser.')
  }
  const audioContext = new window.AudioContext()
  const compressedBuffer = audioContext.createBuffer(
    audioBuffer.numberOfChannels,
    newLength,
    originalSampleRate, // Keep original sample rate
  )

  for (let channel = 0; channel < audioBuffer.numberOfChannels; channel++) {
    const originalData = audioBuffer.getChannelData(channel)
    const compressedData = compressedBuffer.getChannelData(channel)

    // Simple linear interpolation resampling
    for (let i = 0; i < newLength; i++) {
      const sourceIndex = i / ratio
      const index = Math.floor(sourceIndex)
      const fraction = sourceIndex - index

      if (index + 1 < originalData.length) {
        compressedData[i] =
          originalData[index] * (1 - fraction) +
          originalData[index + 1] * fraction
      } else {
        compressedData[i] = originalData[index] || 0
      }
    }
  }

  return compressedBuffer
}

/**
 * Tempo-based audio compression (preserves pitch - placeholder)
 * @param {AudioBuffer} audioBuffer - Input audio buffer
 * @param {number} ratio - Compression ratio
 * @returns {Promise<AudioBuffer>} Compressed audio buffer
 */
export async function tempoBasedCompress(audioBuffer, ratio) {
  // Placeholder for more complex pitch-preserving time stretch
  // This would require algorithms like PSOLA or phase vocoder
  debugLog(
    'Tempo-based compression not fully implemented - falling back to pitch-based',
  )
  return await pitchBasedCompress(audioBuffer, ratio)
}
