/**
 * Audio time compression and manipulation
 * Part of Pleco Xa audio analysis engine
 *
 * Wave 5A: tempoBasedCompress now performs a REAL pitch-preserving time
 * stretch (stft → phase_vocoder → istft via src/effects/index.js) instead of
 * silently falling back to a pitch-changing resample. pitchBasedCompress
 * keeps its honest resample behavior (pitch and tempo change together).
 */

import { time_stretch } from '../effects/index.js'

/**
 * Package per-channel Float32Arrays as an AudioBuffer.
 * Uses the Web Audio API when available (browser); in Web-Audio-less
 * environments (Node tests, workers) it returns a structurally identical
 * plain object — same fields, same getChannelData/copyToChannel behavior —
 * so the audio-data contract holds everywhere.
 *
 * @param {Float32Array[]} channels - One Float32Array per channel (equal lengths)
 * @param {number} sampleRate - Sample rate for the buffer
 * @returns {AudioBuffer|Object} AudioBuffer (or structural equivalent)
 */
function packChannels(channels, sampleRate) {
  const length = channels[0].length
  const AudioContextCtor =
    typeof globalThis !== 'undefined' &&
    (globalThis.AudioContext || globalThis.webkitAudioContext)

  if (AudioContextCtor) {
    const ctx = new AudioContextCtor()
    const buffer = ctx.createBuffer(channels.length, length, sampleRate)
    for (let c = 0; c < channels.length; c++) {
      buffer.copyToChannel(channels[c], c)
    }
    if (typeof ctx.close === 'function') ctx.close()
    return buffer
  }

  return {
    numberOfChannels: channels.length,
    length,
    sampleRate,
    duration: length / sampleRate,
    getChannelData(c) {
      if (c < 0 || c >= channels.length) {
        throw new Error(`getChannelData: channel ${c} out of range`)
      }
      return channels[c]
    },
    copyToChannel(source, c) {
      channels[c].set(source.subarray(0, length))
    },
  }
}

/**
 * Pitch-based audio compression — a plain linear-interpolation resample kept
 * at the original sample rate, so PITCH AND TEMPO CHANGE TOGETHER (like
 * playing a record at the wrong speed). No anti-aliasing filter is applied.
 * Use tempoBasedCompress for pitch-preserving tempo change.
 *
 * @param {AudioBuffer} audioBuffer - Input audio buffer
 * @param {number} ratio - Length ratio (0.8 = 20% shorter, faster AND higher-pitched)
 * @returns {Promise<AudioBuffer>} Compressed audio buffer
 */
export async function pitchBasedCompress(audioBuffer, ratio) {
  if (!(ratio > 0)) {
    throw new Error('pitchBasedCompress: ratio must be a positive number')
  }
  const newLength = Math.floor(audioBuffer.length * ratio)
  const channels = []

  for (let channel = 0; channel < audioBuffer.numberOfChannels; channel++) {
    const originalData = audioBuffer.getChannelData(channel)
    const compressedData = new Float32Array(newLength)

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
    channels.push(compressedData)
  }

  return packChannels(channels, audioBuffer.sampleRate)
}

/**
 * Tempo-based audio compression — PITCH-PRESERVING time stretch via the
 * librosa-parity phase vocoder (src/effects/index.js time_stretch). Each
 * channel is stretched independently; output length is
 * round(input length * ratio) and the dominant pitch is unchanged.
 *
 * @param {AudioBuffer} audioBuffer - Input audio buffer
 * @param {number} ratio - Length ratio (0.8 = 20% shorter/faster, same pitch)
 * @returns {Promise<AudioBuffer>} Compressed audio buffer
 */
export async function tempoBasedCompress(audioBuffer, ratio) {
  if (!(ratio > 0)) {
    throw new Error('tempoBasedCompress: ratio must be a positive number')
  }

  // time_stretch rate > 1 speeds up: length * ratio ⇒ rate = 1 / ratio
  const rate = 1 / ratio
  const channels = []
  for (let channel = 0; channel < audioBuffer.numberOfChannels; channel++) {
    channels.push(time_stretch(audioBuffer.getChannelData(channel), rate))
  }

  return packChannels(channels, audioBuffer.sampleRate)
}
