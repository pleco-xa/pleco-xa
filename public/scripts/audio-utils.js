/**
 * Audio utility functions for processing and manipulating audio data.
 */
// @ts-check
/**
 * Create a loopable AudioBuffer with custom waveform, multichannel support, and export options.
 *
 * @param {Object} options - Options for buffer creation.
 * @param {number} options.loopLengthSeconds - Length of each loop in seconds.
 * @param {number} options.sampleRate - Sample rate of the buffer (default: 44100).
 * @param {function} options.waveformFn - Function to generate waveform values (default: 440Hz sine wave).
 * @param {number} options.channels - Number of audio channels (default: 1).
 * @param {boolean} options.loopable - Whether to set loop points for seamless looping (default: false).
 * @param {number} options.repeats - Number of times to repeat the loop.
 * @returns {AudioBuffer | {buffer: AudioBuffer, loopStart: number, loopEnd: number}} - The generated AudioBuffer or an object with buffer and loop points if loopable.
 */
export function createLoopBuffer({
  loopLengthSeconds,
  repeats,
  sampleRate = 44100,
  waveformFn = (t) => Math.sin(2 * Math.PI * 440 * t),
  channels = 1,
  loopable = false,
}) {
  const ctx = new AudioContext({ sampleRate })
  const segmentLength = Math.floor(sampleRate * loopLengthSeconds)
  const totalLength = segmentLength * repeats
  const buffer = ctx.createBuffer(channels, totalLength, sampleRate)

  for (let ch = 0; ch < channels; ch++) {
    const data = buffer.getChannelData(ch)
    for (let r = 0; r < repeats; r++) {
      const start = r * segmentLength
      for (let i = 0; i < segmentLength; i++) {
        const t = i / sampleRate
        data[start + i] = waveformFn(t)
      }
    }
  }

  if (loopable) {
    // AudioBuffer does not support loopStart/loopEnd properties.
    // Loop points should be set on the AudioBufferSourceNode when playing:
    // source.loop = true;
    // source.loopStart = 0;
    // source.loopEnd = loopLengthSeconds * repeats;
    // Optionally, you can return loop points for use during playback:
    return {
      buffer,
      loopStart: 0,
      loopEnd: loopLengthSeconds * repeats,
    }
  }

  return buffer
}

/**
 * Export an AudioBuffer as a .wav file.
 *
 * @param {AudioBuffer} buffer - The AudioBuffer to export.
 * @returns {Blob} - A Blob representing the .wav file.
 */
export function exportBufferAsWav(buffer) {
  const numChannels = buffer.numberOfChannels
  const sampleRate = buffer.sampleRate
  const length = buffer.length
  const wavBuffer = new ArrayBuffer(44 + length * numChannels * 2)
  const view = new DataView(wavBuffer)

  // Write WAV header
  const writeString = (offset, str) => {
    for (let i = 0; i < str.length; i++) {
      view.setUint8(offset + i, str.charCodeAt(i))
    }
  }

  writeString(0, 'RIFF')
  view.setUint32(4, 36 + length * numChannels * 2, true)
  writeString(8, 'WAVE')
  writeString(12, 'fmt ')
  view.setUint32(16, 16, true)
  view.setUint16(20, 1, true)
  view.setUint16(22, numChannels, true)
  view.setUint32(24, sampleRate, true)
  view.setUint32(28, sampleRate * numChannels * 2, true)
  view.setUint16(32, numChannels * 2, true)
  view.setUint16(34, 16, true)
  writeString(36, 'data')
  view.setUint32(40, length * numChannels * 2, true)

  // Write PCM data
  let offset = 44
  for (let ch = 0; ch < numChannels; ch++) {
    const data = buffer.getChannelData(ch)
    for (let i = 0; i < length; i++) {
      const sample = Math.max(-1, Math.min(1, data[i]))
      view.setInt16(
        offset,
        sample < 0 ? sample * 0x8000 : sample * 0x7fff,
        true,
      )
      offset += 2
    }
  }

  return new Blob([view], { type: 'audio/wav' })
}

/**
 * Compute the Root Mean Square (RMS) energy of an audio buffer.
 *
 * @param {AudioBuffer} audioBuffer - The AudioBuffer to analyze.
 * @returns {number} - The RMS energy value.
 */
export function computeRMS(audioBuffer) {
  const numChannels = audioBuffer.numberOfChannels
  let totalSumOfSquares = 0
  let totalSamples = 0

  for (let channel = 0; channel < numChannels; channel++) {
    const data = audioBuffer.getChannelData(channel)
    const length = data.length
    let sumOfSquares = 0

    for (let i = 0; i < length; i++) {
      sumOfSquares += data[i] * data[i]
    }

    totalSumOfSquares += sumOfSquares
    totalSamples += length
  }

  if (totalSamples === 0) return 0
  return Math.sqrt(totalSumOfSquares / totalSamples)
}

/**
 * Define multiple loop points for playback.
 *
 * @param {AudioBuffer} buffer - The AudioBuffer to use.
 * @param {number} loopLengthSeconds - Length of each loop in seconds.
 * @param {number} repeats - Number of loops to define.
 * @returns {Array<{loopStart: number, loopEnd: number}>} - Array of loop points.
 */
export function defineMultipleLoopPoints(buffer, loopLengthSeconds, repeats) {
  const loopPoints = []

  for (let i = 0; i < repeats; i++) {
    const loopStart = i * loopLengthSeconds
    const loopEnd = (i + 1) * loopLengthSeconds
    loopPoints.push({ loopStart, loopEnd })
  }

  return loopPoints
}

export function computePeak(audioBuffer) {
  const channels = audioBuffer.numberOfChannels || 1
  let peak = 0
  for (let ch = 0; ch < channels; ch++) {
    const data = audioBuffer.getChannelData(ch)
    for (let i = 0; i < data.length; i++) {
      const val = Math.abs(data[i])
      if (val > peak) peak = val
    }
  }
  return peak
}

export function computeZeroCrossingRate(audioBuffer) {
  const channels = audioBuffer.numberOfChannels || 1
  let totalRate = 0

  for (let ch = 0; ch < channels; ch++) {
    const data = audioBuffer.getChannelData(ch)
    let crossings = 0

    for (let i = 1; i < data.length; i++) {
      if (
        (data[i - 1] >= 0 && data[i] < 0) ||
        (data[i - 1] < 0 && data[i] >= 0)
      ) {
        crossings++
      }
    }
    totalRate += crossings / data.length

  }

  return channels ? totalRate / channels : 0
}

export function reverseBufferSection(buffer, start, end) {
  for (let c = 0; c < buffer.numberOfChannels; c++) {
    const data = buffer.getChannelData(c)
    let i = 0
    let j = end - start - 1
    while (i < j) {
      const a = data[start + i]
      data[start + i] = data[start + j]
      data[start + j] = a
      i++
      j--
    }
  }
  return buffer
}

export function findZeroCrossing(data, startIndex) {
  for (let i = startIndex + 1; i < data.length; i++) {
    if ((data[i - 1] >= 0 && data[i] < 0) || (data[i - 1] < 0 && data[i] >= 0)) {
      return i - 1
    }
  }
  return startIndex
}

export function findAllZeroCrossings(data, start = 0) {
  const indices = []
  for (let i = Math.max(1, start); i < data.length; i++) {
    if ((data[i - 1] >= 0 && data[i] < 0) || (data[i - 1] < 0 && data[i] >= 0)) {
      indices.push(i)
    }
  }
  return indices
}

export function findAudioStart(channelData, sampleRate, threshold = 0.02) {
  for (let i = 0; i < channelData.length; i++) {
    if (Math.abs(channelData[i]) >= threshold) {
      return findZeroCrossing(channelData, i)
    }
  }
  return 0
}

export function applyHannWindow(audioData) {
  const len = audioData.length
  const result = new Float32Array(len)
  for (let i = 0; i < len; i++) {
    const w = 0.5 * (1 - Math.cos((2 * Math.PI * i) / (len - 1)))
    result[i] = audioData[i] * w
  }
  return result
}

// Example usage:
// const buffer = createLoopBuffer({
// //   loopLengthSeconds: 2,
// //   repeats: 5,
// //   sampleRate: 44100,
// //   waveformFn: (t) => Math.sin(2 * Math.PI * 440 * t),
// //   channels: 1,
// //   loopable: true,
// // });
//
// const loopPoints = defineMultipleLoopPoints(buffer.buffer, 2, 5);
// console.log('Defined loop points:', loopPoints);
