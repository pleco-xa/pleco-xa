/**
 * engine/xa-decode.js — native audio-data decode for
 * BaseAudioContext.decodeAudioData (spec § BaseAudioContext, "queue a decode
 * operation": decode the byte-stream to linear PCM, then resample to the
 * context's sample rate when the rates differ).
 *
 * SUPPORTED FORMATS (explicit, exhaustive — anything else is an EncodingError,
 * never a silent fallback):
 *   - RIFF/WAVE, fmt format 1 (integer PCM): 8-bit unsigned, 16/24/32-bit
 *     signed little-endian, mono and multi-channel (up to 32 channels, the
 *     engine's PlecoAudioBuffer ceiling)
 *   - RIFF/WAVE, fmt format 3 (IEEE float): 32-bit little-endian
 * Compressed containers (MP3/OGG/AAC/…) and WAVE_FORMAT_EXTENSIBLE are NOT
 * supported and reject with EncodingError.
 *
 * The 16/24/32-bit-int and float32 sample loops are delegated to
 * `decodeWav` in src/io/wav.js — the package's ONE WAV codec — so
 * decodeAudioData and the io layer can never drift apart on sample scaling.
 * Only the 8-bit unsigned path lives here, because io/wav.js does not decode
 * it (see the P06 deviation note: once io/wav.js grows format-1/8-bit support
 * this extra loop collapses into pure delegation). The RIFF walk below mirrors
 * io/wav.js's walk exactly (word-aligned chunks, last fmt/data chunk wins) but
 * exists separately to produce spec-typed EncodingError diagnostics and to
 * validate BEFORE handing off.
 */
import { decodeWav } from '../io/wav.js'
import { encodingError } from './xa-errors.js'

/** Engine channel ceiling — same value as PlecoAudioBuffer/PlecoNode (spec: "MUST support at least 32 channels"). */
const MAX_CHANNELS = 32

/**
 * Decode a RIFF/WAVE ArrayBuffer to planar Float32Array channels.
 * Every malformed, truncated, or unsupported input throws an EncodingError
 * DOMException (spec: decode failure → EncodingError).
 *
 * @param {ArrayBuffer} buffer — complete WAV file bytes.
 * @returns {{channels: Float32Array[], sampleRate: number}}
 */
export function decodeWavArrayBuffer(buffer) {
  if (!(buffer instanceof ArrayBuffer)) {
    throw new TypeError(`decodeWavArrayBuffer: expected an ArrayBuffer, got ${buffer}`)
  }
  const view = new DataView(buffer)
  if (view.byteLength < 12) {
    throw encodingError(`decodeWavArrayBuffer: ${view.byteLength} bytes is too short to be a RIFF/WAVE file`)
  }
  const tag = (off) =>
    String.fromCharCode(view.getUint8(off), view.getUint8(off + 1), view.getUint8(off + 2), view.getUint8(off + 3))
  if (tag(0) !== 'RIFF' || tag(8) !== 'WAVE') {
    throw encodingError('decodeWavArrayBuffer: not a RIFF/WAVE byte-stream (unrecognized content)')
  }

  // Chunk walk — identical traversal to io/wav.js decodeWav (word-aligned,
  // last fmt/data chunk wins) so validation and delegated decode agree.
  let fmt = null
  let dataOffset = -1
  let dataSize = 0
  let off = 12
  while (off + 8 <= view.byteLength) {
    const id = tag(off)
    const size = view.getUint32(off + 4, true)
    if (id === 'fmt ') {
      if (off + 8 + 16 > view.byteLength) {
        throw encodingError('decodeWavArrayBuffer: truncated fmt chunk')
      }
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
    off += 8 + size + (size & 1)
  }

  if (fmt === null) throw encodingError('decodeWavArrayBuffer: missing fmt chunk')
  if (dataOffset < 0) throw encodingError('decodeWavArrayBuffer: missing data chunk')
  if (dataOffset + dataSize > view.byteLength) {
    throw encodingError(
      `decodeWavArrayBuffer: data chunk claims ${dataSize} bytes but only ${view.byteLength - dataOffset} remain (truncated file)`,
    )
  }

  const { format, numChannels, sampleRate, bitsPerSample } = fmt
  const supported = (format === 1 && [8, 16, 24, 32].includes(bitsPerSample)) || (format === 3 && bitsPerSample === 32)
  if (!supported) {
    throw encodingError(
      `decodeWavArrayBuffer: unsupported encoding format=${format} bits=${bitsPerSample} — ` +
        'supported: PCM (format 1) 8/16/24/32-bit int, IEEE float (format 3) 32-bit',
    )
  }
  if (numChannels < 1 || numChannels > MAX_CHANNELS) {
    throw encodingError(
      `decodeWavArrayBuffer: numChannels ${numChannels} outside the engine's supported range [1, ${MAX_CHANNELS}]`,
    )
  }
  if (sampleRate < 1) {
    throw encodingError(`decodeWavArrayBuffer: invalid sample rate ${sampleRate}`)
  }
  const bytesPerSample = bitsPerSample / 8
  const frameCount = Math.floor(dataSize / (bytesPerSample * numChannels))
  if (frameCount < 1) {
    throw encodingError('decodeWavArrayBuffer: data chunk decodes to zero sample frames')
  }

  // 8-bit unsigned PCM — the one loop io/wav.js doesn't have. Samples are
  // stored biased at 128; recenter to signed (byte − 128), then scale with
  // the SAME asymmetric convention as io/wav.js's 16/24/32-bit paths
  // (negative / 2^(n−1), positive / (2^(n−1) − 1)) so full-scale decodes to
  // exactly ±1.0 at every bit depth the codec handles. Known P23 delta:
  // browser decoders (ffmpeg / CoreAudio) scale int PCM symmetrically by
  // 1/2^(n−1), so positive samples differ from real decodeAudioData by up to
  // ~1 LSB — that is the package-wide convention choice, applied uniformly.
  if (bitsPerSample === 8) {
    const channels = Array.from({ length: numChannels }, () => new Float32Array(frameCount))
    let pos = dataOffset
    for (let i = 0; i < frameCount; i++) {
      for (let ch = 0; ch < numChannels; ch++) {
        const s = view.getUint8(pos) - 128
        channels[ch][i] = s < 0 ? s / 128 : s / 127
        pos += 1
      }
    }
    return { channels, sampleRate }
  }

  // Everything else: delegate to the package's canonical WAV codec. Any throw
  // it produces on these pre-validated bytes still surfaces as an
  // EncodingError so decodeAudioData's error contract holds.
  try {
    return decodeWav(buffer)
  } catch (err) {
    throw encodingError(`decodeWavArrayBuffer: WAV decode failed — ${err.message}`)
  }
}

/**
 * Resample planar Float32Array channels from `fromRate` to `toRate` by linear
 * interpolation (spec decode step 5.1: "resample it to the sample-rate of the
 * BaseAudioContext if it is different"). Output length is
 * max(1, round(frames · toRate / fromRate)); the last input frame is held for
 * positions past the final sample. Writing into Float32Array is the float32
 * boundary (implicit fround per element).
 *
 * @param {Float32Array[]} channels — planar input, equal lengths.
 * @param {number} fromRate — source sample rate (> 0).
 * @param {number} toRate — target sample rate (> 0).
 * @returns {Float32Array[]} planar output at `toRate`.
 */
export function resampleLinearChannels(channels, fromRate, toRate) {
  if (!(fromRate > 0) || !(toRate > 0)) {
    throw new RangeError(`resampleLinearChannels: rates must be positive, got ${fromRate} -> ${toRate}`)
  }
  if (fromRate === toRate) return channels
  const srcLength = channels[0].length
  const outLength = Math.max(1, Math.round((srcLength * toRate) / fromRate))
  const ratio = fromRate / toRate
  return channels.map((src) => {
    const out = new Float32Array(outLength)
    for (let i = 0; i < outLength; i++) {
      const pos = i * ratio
      const i0 = Math.min(Math.floor(pos), srcLength - 1)
      const i1 = Math.min(i0 + 1, srcLength - 1)
      const frac = pos - i0
      out[i] = src[i0] + frac * (src[i1] - src[i0])
    }
    return out
  })
}
