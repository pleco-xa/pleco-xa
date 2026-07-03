/**
 * Pleco-Xa io/wav — the ONE WAV codec.
 * Replaces three divergent encoders (xa-wav-encoder, audio-utils.exportBufferAsWav,
 * xa-file._encodeWAV), two of which wrote channel-block PCM under an interleaved
 * header (garbled stereo). Pure JS, runs in Node, browsers, and workers.
 */

/**
 * Encode planar channel data as an interleaved 16-bit PCM WAV file.
 * @param {Float32Array[]} channels - One Float32Array per channel (equal lengths)
 * @param {number} sampleRate
 * @returns {ArrayBuffer} Complete RIFF/WAVE file contents
 */
export function encodeWav(channels, sampleRate) {
  if (!Array.isArray(channels) || channels.length === 0) {
    throw new Error('encodeWav: channels must be a non-empty array of Float32Array')
  }
  const numChannels = channels.length
  const length = channels[0].length
  for (const ch of channels) {
    if (ch.length !== length) throw new Error('encodeWav: all channels must have equal length')
  }

  const bytesPerSample = 2
  const blockAlign = numChannels * bytesPerSample
  const dataSize = length * blockAlign
  const buffer = new ArrayBuffer(44 + dataSize)
  const view = new DataView(buffer)

  const writeString = (offset, str) => {
    for (let i = 0; i < str.length; i++) view.setUint8(offset + i, str.charCodeAt(i))
  }

  writeString(0, 'RIFF')
  view.setUint32(4, 36 + dataSize, true)
  writeString(8, 'WAVE')
  writeString(12, 'fmt ')
  view.setUint32(16, 16, true)
  view.setUint16(20, 1, true) // PCM
  view.setUint16(22, numChannels, true)
  view.setUint32(24, sampleRate, true)
  view.setUint32(28, sampleRate * blockAlign, true)
  view.setUint16(32, blockAlign, true)
  view.setUint16(34, 16, true)
  writeString(36, 'data')
  view.setUint32(40, dataSize, true)

  // Interleaved sample frames: [ch0, ch1, ...][ch0, ch1, ...]...
  let offset = 44
  for (let i = 0; i < length; i++) {
    for (let ch = 0; ch < numChannels; ch++) {
      const s = Math.max(-1, Math.min(1, channels[ch][i]))
      // Round (not truncate) to the nearest quantization level: halves the
      // per-sample error to ≤0.5 LSB and removes the toward-zero DC bias that
      // setInt16's implicit truncation introduces.
      view.setInt16(offset, Math.round(s < 0 ? s * 0x8000 : s * 0x7fff), true)
      offset += 2
    }
  }

  return buffer
}

/**
 * Decode a WAV file into planar Float32Array channels.
 * Supports PCM 16/24/32-bit int and 32-bit float, standard RIFF chunk walking.
 * @param {ArrayBuffer} buffer
 * @returns {{channels: Float32Array[], sampleRate: number}}
 */
export function decodeWav(buffer) {
  const view = new DataView(buffer)
  const tag = (off) => String.fromCharCode(view.getUint8(off), view.getUint8(off + 1), view.getUint8(off + 2), view.getUint8(off + 3))

  if (tag(0) !== 'RIFF' || tag(8) !== 'WAVE') {
    throw new Error('decodeWav: not a RIFF/WAVE file')
  }

  let fmt = null
  let dataOffset = -1
  let dataSize = 0
  let off = 12
  while (off + 8 <= view.byteLength) {
    const id = tag(off)
    const size = view.getUint32(off + 4, true)
    if (id === 'fmt ') {
      fmt = {
        format: view.getUint16(off + 8, true),
        numChannels: view.getUint16(off + 10, true),
        sampleRate: view.getUint32(off + 12, true),
        bitsPerSample: view.getUint16(off + 22, true),
      }
    } else if (id === 'data') {
      dataOffset = off + 8
      dataSize = size
    }
    off += 8 + size + (size & 1) // chunks are word-aligned
  }

  if (!fmt) throw new Error('decodeWav: missing fmt chunk')
  if (dataOffset < 0) throw new Error('decodeWav: missing data chunk')

  const { format, numChannels, sampleRate, bitsPerSample } = fmt
  const bytesPerSample = bitsPerSample / 8
  const frameCount = Math.floor(dataSize / (bytesPerSample * numChannels))
  const channels = Array.from({ length: numChannels }, () => new Float32Array(frameCount))

  let pos = dataOffset
  for (let i = 0; i < frameCount; i++) {
    for (let ch = 0; ch < numChannels; ch++) {
      let v
      if (format === 3 && bitsPerSample === 32) {
        v = view.getFloat32(pos, true)
      } else if (format === 1 && bitsPerSample === 16) {
        const s = view.getInt16(pos, true)
        v = s < 0 ? s / 0x8000 : s / 0x7fff
      } else if (format === 1 && bitsPerSample === 24) {
        let s = view.getUint8(pos) | (view.getUint8(pos + 1) << 8) | (view.getUint8(pos + 2) << 16)
        if (s & 0x800000) s |= ~0xffffff // sign-extend
        v = s < 0 ? s / 0x800000 : s / 0x7fffff
      } else if (format === 1 && bitsPerSample === 32) {
        const s = view.getInt32(pos, true)
        v = s < 0 ? s / 0x80000000 : s / 0x7fffffff
      } else {
        throw new Error(`decodeWav: unsupported format=${format} bits=${bitsPerSample}`)
      }
      channels[ch][i] = v
      pos += bytesPerSample
    }
  }

  return { channels, sampleRate }
}
