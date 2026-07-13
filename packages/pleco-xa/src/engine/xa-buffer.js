/**
 * engine/xa-buffer.js — PlecoAudioBuffer: pleco's own AudioBuffer.
 *
 * The first stone of pleco-xa 3.0's Web-Audio-*replacement* engine. The Web Audio
 * API's AudioBuffer is nothing but a set of per-channel Float32Arrays plus a
 * sample rate; PlecoAudioBuffer is a faithful, zero-dependency, universal-runtime
 * reimplementation of that interface. It runs identically in Node, workers, and
 * the browser — no AudioContext, no DOM, no platform globals. Pleco's own graph
 * and render layer allocate and pass PlecoAudioBuffers everywhere; the browser's
 * AudioBuffer is only ever needed at the thin real-time output sink (and even
 * then a PlecoAudioBuffer's channel data feeds it directly).
 *
 * Spec shape (W3C Web Audio "The AudioBuffer Interface"):
 * - numberOfChannels / length / sampleRate / duration are READONLY attributes
 *   (private fields + getters — assignment throws in strict mode).
 * - Construction throws a NotSupportedError DOMException when an option lies
 *   outside its nominal range: sampleRate outside [3000, 768000] Hz inclusive
 *   ("Supported Sample Rates"), length < 1, numberOfChannels outside [1, 32]
 *   (the spec's "MUST support at least 32 channels" floor is our ceiling).
 * - getChannelData / copyToChannel / copyFromChannel throw an IndexSizeError
 *   DOMException for a channel index >= numberOfChannels.
 * - copyToChannel / copyFromChannel copy max(0, min(Nb − k, Nf)) frames and
 *   leave the remainder untouched (the spec's exact clipping formula).
 *
 * Acquire-the-content: the spec's "acquire the contents of an AudioBuffer"
 * operation (detach the ArrayBuffers previously returned by getChannelData,
 * hand immutable data to the render thread, re-attach copies) is deliberately
 * NOT emulated here — we do not fake ArrayBuffer detaching. Pleco's ownership
 * model is the node-side set-once acquire: PlecoAudioBufferSourceNode's
 * `buffer` setter (P08) is set-once, which is where content acquisition is
 * owned and enforced. getChannelData() returns the live backing Float32Array.
 *
 * Deliberate strictness deviations (documented; no WebIDL coercion layer, per
 * pleco's no-silent-fallback rule): where WebIDL `unsigned long` coercion
 * would silently truncate or wrap — non-integer numberOfChannels/length,
 * non-integer or negative channel index, negative bufferOffset (which per
 * WebIDL wraps to 2^32−1 and the spec's clipping formula then copies 0 frames
 * without error) — pleco instead throws with diagnostics (NotSupportedError /
 * IndexSizeError / RangeError as typed below). sampleRate is stored as
 * float32 (Math.fround) per the IDL's `float` type.
 */
import { notSupportedError, indexSizeError } from './xa-errors.js'

/** Spec nominal sample-rate range ("Supported Sample Rates"): [3000, 768000] Hz inclusive. */
const MIN_SAMPLE_RATE = 3000
const MAX_SAMPLE_RATE = 768000
/** Spec: "An implementation MUST support at least 32 channels" — pleco supports exactly 32. */
const MAX_CHANNELS = 32

/**
 * Pleco's own AudioBuffer. Constructed like the Web Audio `AudioBuffer`:
 *   new PlecoAudioBuffer({ numberOfChannels = 1, length, sampleRate })
 * `length` is in sample frames.
 */
export class PlecoAudioBuffer {
  #numberOfChannels
  #length
  #sampleRate
  #channels

  constructor({ numberOfChannels = 1, length, sampleRate } = {}) {
    if (!Number.isInteger(numberOfChannels) || numberOfChannels < 1 || numberOfChannels > MAX_CHANNELS) {
      throw notSupportedError(
        `PlecoAudioBuffer: numberOfChannels must be an integer in [1, ${MAX_CHANNELS}], got ${numberOfChannels}`,
      )
    }
    if (!Number.isInteger(length) || length < 1) {
      throw notSupportedError(
        `PlecoAudioBuffer: length must be a positive integer sample-frame count, got ${length}`,
      )
    }
    // IDL declares sampleRate a `float` — round to float32 first, then range-check.
    const rate = typeof sampleRate === 'number' ? Math.fround(sampleRate) : NaN
    if (!(rate >= MIN_SAMPLE_RATE && rate <= MAX_SAMPLE_RATE)) {
      throw notSupportedError(
        `PlecoAudioBuffer: sampleRate must be in the nominal range [${MIN_SAMPLE_RATE}, ${MAX_SAMPLE_RATE}] Hz, got ${sampleRate}`,
      )
    }
    this.#numberOfChannels = numberOfChannels
    this.#length = length
    this.#sampleRate = rate
    this.#channels = []
    for (let c = 0; c < numberOfChannels; c++) {
      this.#channels.push(new Float32Array(length))
    }
  }

  /** Readonly. The number of discrete audio channels. */
  get numberOfChannels() {
    return this.#numberOfChannels
  }

  /** Readonly. Length of the PCM audio data in sample-frames. */
  get length() {
    return this.#length
  }

  /** Readonly. The sample-rate for the PCM audio data in samples per second. */
  get sampleRate() {
    return this.#sampleRate
  }

  /** Readonly. Duration of the PCM audio data in seconds (length / sampleRate). */
  get duration() {
    return this.#length / this.#sampleRate
  }

  /** The live Float32Array backing `channel` (mutable, like AudioBuffer.getChannelData). */
  getChannelData(channel) {
    if (!Number.isInteger(channel) || channel < 0 || channel >= this.#numberOfChannels) {
      throw indexSizeError(
        `PlecoAudioBuffer.getChannelData: channel ${channel} out of range [0, ${this.#numberOfChannels})`,
      )
    }
    return this.#channels[channel]
  }

  /**
   * Copy `source` into `channelNumber`, starting at `bufferOffset` frames.
   * Mirrors AudioBuffer.copyToChannel: copies max(0, min(Nb − k, Nf)) frames,
   * leaving the rest of the channel untouched.
   */
  copyToChannel(source, channelNumber, bufferOffset = 0) {
    if (!(source instanceof Float32Array)) {
      throw new TypeError('PlecoAudioBuffer.copyToChannel: source must be a Float32Array')
    }
    if (!Number.isInteger(bufferOffset) || bufferOffset < 0) {
      throw new RangeError(
        `PlecoAudioBuffer.copyToChannel: bufferOffset must be a non-negative integer, got ${bufferOffset}`,
      )
    }
    const dest = this.getChannelData(channelNumber)
    const n = Math.max(0, Math.min(dest.length - bufferOffset, source.length))
    for (let i = 0; i < n; i++) dest[bufferOffset + i] = source[i]
  }

  /**
   * Copy from `channelNumber` (starting at `bufferOffset` frames) into
   * `destination`. Mirrors AudioBuffer.copyFromChannel: copies
   * max(0, min(Nb − k, Nf)) frames, leaving the rest of `destination` untouched.
   */
  copyFromChannel(destination, channelNumber, bufferOffset = 0) {
    if (!(destination instanceof Float32Array)) {
      throw new TypeError('PlecoAudioBuffer.copyFromChannel: destination must be a Float32Array')
    }
    if (!Number.isInteger(bufferOffset) || bufferOffset < 0) {
      throw new RangeError(
        `PlecoAudioBuffer.copyFromChannel: bufferOffset must be a non-negative integer, got ${bufferOffset}`,
      )
    }
    const src = this.getChannelData(channelNumber)
    const n = Math.max(0, Math.min(src.length - bufferOffset, destination.length))
    for (let i = 0; i < n; i++) destination[i] = src[bufferOffset + i]
  }
}

/**
 * Allocation factory matching the `(numberOfChannels, length, sampleRate)`
 * signature that playback/ops.js's injectable `createBuffer` expects — so
 * PlecoAudioBuffer is a drop-in allocator for the whole offline DSP layer:
 *   halfSpeedLoop(buf, loop, { createBuffer: createPlecoAudioBuffer })
 */
export function createPlecoAudioBuffer(numberOfChannels, length, sampleRate) {
  return new PlecoAudioBuffer({ numberOfChannels, length, sampleRate })
}
