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
 * WebIDL-conversion seams — SPEC-ALIGNED for parity (deliberate reversal of the
 * old pleco "no silent coercion" house rule at the argument-conversion layer;
 * matching the browser IS the product here):
 * - The constructor argument is a REQUIRED `AudioBufferOptions` dictionary.
 *   Per WebIDL dictionary conversion, undefined/null map to an empty dictionary
 *   and any other non-object (Number, String, …) is a TypeError. A missing
 *   REQUIRED member (`length`, `sampleRate`) is a WebIDL TypeError — NOT the
 *   algorithm's NotSupportedError, which fires only for present-but-out-of-
 *   nominal-range values (spec § "new AudioBuffer()" step 1).
 * - `numberOfChannels` / `length` are IDL `unsigned long`: ES ToNumber then
 *   truncation toward zero (so a fractional length like 3276.8 becomes 3276,
 *   never a throw), THEN the nominal-range checks. Pleco does NOT apply the
 *   2^32 modulo wrap for these two: a value outside the nominal integer range
 *   (≤ 0, or > 32 channels, or a non-finite input) throws NotSupportedError
 *   rather than silently wrapping into a multi-gigabyte allocation — the one
 *   place the browser also effectively refuses (allocation failure). This IS
 *   the spec's error seam, kept fail-loud.
 * - `channel` / `channelNumber` are IDL `unsigned long`: ToNumber, truncate,
 *   and 2^32-wrap (full WebIDL), so an out-of-range or negative index lands as
 *   an IndexSizeError DOMException (spec § getChannelData/copyFromChannel/
 *   copyToChannel argumentdef) rather than a RangeError.
 * - `bufferOffset` is IDL `unsigned long` (default 0): full WebIDL conversion
 *   including the 2^32 wrap, so a negative offset wraps past the buffer end and
 *   the spec's clipping formula copies 0 frames WITHOUT throwing (matches the
 *   browser; was a RangeError under the old house rule).
 * - `source` / `destination` are plain IDL `Float32Array` (NOT `[AllowShared]`):
 *   a non-Float32Array is a TypeError, and a SharedArrayBuffer-backed view is
 *   rejected with a TypeError per the WebIDL buffer-source conversion.
 * - `sampleRate` is stored as float32 (Math.fround of ToNumber) per IDL `float`.
 */
import { notSupportedError, indexSizeError } from './xa-errors.js'

/** Spec nominal sample-rate range ("Supported Sample Rates"): [3000, 768000] Hz inclusive. */
const MIN_SAMPLE_RATE = 3000
const MAX_SAMPLE_RATE = 768000
/** Spec: "An implementation MUST support at least 32 channels" — pleco supports exactly 32. */
const MAX_CHANNELS = 32
/** 2^32 — the modulus of the WebIDL `unsigned long` conversion. */
const TWO_POW_32 = 4294967296

/**
 * IDL `unsigned long` conversion for a length / count: ES ToNumber then
 * truncate toward zero. A non-finite input (NaN, ±Infinity) yields NaN so the
 * caller's nominal-range check (`>= 1`) rejects it. Deliberately does NOT apply
 * the 2^32 modulo wrap — for length/numberOfChannels the wrap would turn a
 * negative into a huge positive and hide an out-of-range value; pleco keeps
 * those loud (NotSupportedError). ToNumber of a Symbol throws TypeError,
 * matching the browser.
 */
export function toIntegralCount(value) {
  const number = Number(value)
  return Number.isFinite(number) ? Math.trunc(number) : NaN
}

/**
 * Full IDL `unsigned long` conversion (ToNumber, truncate toward zero, reduce
 * modulo 2^32) — used for channel indices and bufferOffset, where the wrap is
 * exactly the browser behavior: a negative index becomes a large positive one
 * (→ IndexSizeError on the range check) and a negative bufferOffset wraps past
 * the buffer end (→ the clipping formula copies 0 frames, no throw).
 */
function toUnsignedLong(value) {
  const number = Number(value)
  if (!Number.isFinite(number)) return 0
  const wrapped = Math.trunc(number) % TWO_POW_32
  return wrapped < 0 ? wrapped + TWO_POW_32 : wrapped
}

/** True when `view` is a TypedArray backed by a SharedArrayBuffer (rejected by plain `Float32Array` IDL). */
function isSharedArrayBufferView(view) {
  return typeof SharedArrayBuffer !== 'undefined' && view.buffer instanceof SharedArrayBuffer
}

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

  constructor(options) {
    // WebIDL dictionary conversion of the REQUIRED `options` argument:
    // undefined/null → empty dictionary; any other non-object → TypeError.
    // (Functions are objects in WebIDL, hence the `typeof === 'function'` arm.)
    if (
      options !== undefined &&
      options !== null &&
      typeof options !== 'object' &&
      typeof options !== 'function'
    ) {
      throw new TypeError(
        `PlecoAudioBuffer: options must be an AudioBufferOptions dictionary, got ${typeof options}`,
      )
    }
    const opts = options === undefined || options === null ? {} : options

    // Required members `length` and `sampleRate`: a member whose value reads
    // undefined is "not present"; a missing required member is a WebIDL
    // TypeError (distinct from the algorithm's NotSupportedError below).
    if (opts.length === undefined) {
      throw new TypeError("PlecoAudioBuffer: required AudioBufferOptions member 'length' is missing")
    }
    if (opts.sampleRate === undefined) {
      throw new TypeError("PlecoAudioBuffer: required AudioBufferOptions member 'sampleRate' is missing")
    }

    // WebIDL argument conversion (unsigned long / float) precedes the spec
    // algorithm's nominal-range checks.
    const numberOfChannels = toIntegralCount(opts.numberOfChannels === undefined ? 1 : opts.numberOfChannels)
    const length = toIntegralCount(opts.length)
    const rate = Math.fround(Number(opts.sampleRate))

    if (!(numberOfChannels >= 1 && numberOfChannels <= MAX_CHANNELS)) {
      throw notSupportedError(
        `PlecoAudioBuffer: numberOfChannels must be in the nominal range [1, ${MAX_CHANNELS}], got ${opts.numberOfChannels}`,
      )
    }
    if (!(length >= 1)) {
      throw notSupportedError(
        `PlecoAudioBuffer: length must be a positive sample-frame count, got ${opts.length}`,
      )
    }
    if (!(rate >= MIN_SAMPLE_RATE && rate <= MAX_SAMPLE_RATE)) {
      throw notSupportedError(
        `PlecoAudioBuffer: sampleRate must be in the nominal range [${MIN_SAMPLE_RATE}, ${MAX_SAMPLE_RATE}] Hz, got ${opts.sampleRate}`,
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
    const index = toUnsignedLong(channel)
    if (index >= this.#numberOfChannels) {
      throw indexSizeError(
        `PlecoAudioBuffer.getChannelData: channel ${channel} out of range [0, ${this.#numberOfChannels})`,
      )
    }
    return this.#channels[index]
  }

  /**
   * Copy `source` into `channelNumber`, starting at `bufferOffset` frames.
   * Mirrors AudioBuffer.copyToChannel: copies max(0, min(Nb − k, Nf)) frames,
   * leaving the rest of the channel untouched.
   */
  copyToChannel(source, channelNumber, bufferOffset = 0) {
    if (!(source instanceof Float32Array) || isSharedArrayBufferView(source)) {
      throw new TypeError('PlecoAudioBuffer.copyToChannel: source must be a non-shared Float32Array')
    }
    const dest = this.getChannelData(channelNumber) // IDL unsigned long index → IndexSizeError
    const offset = toUnsignedLong(bufferOffset) // negative wraps past the end → 0 frames
    const n = Math.max(0, Math.min(dest.length - offset, source.length))
    for (let i = 0; i < n; i++) dest[offset + i] = source[i]
  }

  /**
   * Copy from `channelNumber` (starting at `bufferOffset` frames) into
   * `destination`. Mirrors AudioBuffer.copyFromChannel: copies
   * max(0, min(Nb − k, Nf)) frames, leaving the rest of `destination` untouched.
   */
  copyFromChannel(destination, channelNumber, bufferOffset = 0) {
    if (!(destination instanceof Float32Array) || isSharedArrayBufferView(destination)) {
      throw new TypeError('PlecoAudioBuffer.copyFromChannel: destination must be a non-shared Float32Array')
    }
    const src = this.getChannelData(channelNumber) // IDL unsigned long index → IndexSizeError
    const offset = toUnsignedLong(bufferOffset) // negative wraps past the end → 0 frames
    const n = Math.max(0, Math.min(src.length - offset, destination.length))
    for (let i = 0; i < n; i++) destination[i] = src[offset + i]
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
