/**
 * engine/xa-buffer.js — PlecoBuffer: pleco's own AudioBuffer.
 *
 * The first stone of pleco-xa 3.0's Web-Audio-*replacement* engine. The Web Audio
 * API's AudioBuffer is nothing but a set of per-channel Float32Arrays plus a
 * sample rate; PlecoBuffer is a faithful, zero-dependency, universal-runtime
 * reimplementation of that interface. It runs identically in Node, workers, and
 * the browser — no AudioContext, no DOM, no platform globals. Pleco's own graph
 * and render layer allocate and pass PlecoBuffers everywhere; the browser's
 * AudioBuffer is only ever needed at the thin real-time output sink (and even
 * then a PlecoBuffer's channel data feeds it directly).
 *
 * Contract: AudioBuffer-shaped — { numberOfChannels, length, sampleRate,
 * duration, getChannelData(channel) } — so it drops straight into
 * playback/ops.js (which already declares that exact contract) and satisfies any
 * consumer written against AudioBuffer.
 */

const isPosInt = (n) => Number.isInteger(n) && n > 0

/**
 * Pleco's own AudioBuffer. Constructed like the Web Audio `AudioBuffer`:
 *   new PlecoBuffer({ numberOfChannels = 1, length, sampleRate })
 * `length` is in sample frames.
 */
export class PlecoBuffer {
  constructor({ numberOfChannels = 1, length, sampleRate } = {}) {
    if (!isPosInt(numberOfChannels)) {
      throw new RangeError(
        `PlecoBuffer: numberOfChannels must be a positive integer, got ${numberOfChannels}`,
      )
    }
    if (!isPosInt(length)) {
      throw new RangeError(
        `PlecoBuffer: length must be a positive integer sample count, got ${length}`,
      )
    }
    if (!Number.isFinite(sampleRate) || sampleRate <= 0) {
      throw new RangeError(
        `PlecoBuffer: sampleRate must be a positive finite number, got ${sampleRate}`,
      )
    }
    this.numberOfChannels = numberOfChannels
    this.length = length
    this.sampleRate = sampleRate
    this._channels = []
    for (let c = 0; c < numberOfChannels; c++) {
      this._channels.push(new Float32Array(length))
    }
  }

  /** Seconds. */
  get duration() {
    return this.length / this.sampleRate
  }

  /** The live Float32Array backing `channel` (mutable, like AudioBuffer.getChannelData). */
  getChannelData(channel) {
    if (!Number.isInteger(channel) || channel < 0 || channel >= this.numberOfChannels) {
      throw new RangeError(
        `PlecoBuffer.getChannelData: channel ${channel} out of range [0, ${this.numberOfChannels})`,
      )
    }
    return this._channels[channel]
  }

  /**
   * Copy `source` into `channelNumber`, starting at `bufferOffset` frames.
   * Mirrors AudioBuffer.copyToChannel; clips to the channel length.
   */
  copyToChannel(source, channelNumber, bufferOffset = 0) {
    if (!(source instanceof Float32Array)) {
      throw new TypeError('PlecoBuffer.copyToChannel: source must be a Float32Array')
    }
    if (!Number.isInteger(bufferOffset) || bufferOffset < 0) {
      throw new RangeError(
        `PlecoBuffer.copyToChannel: bufferOffset must be a non-negative integer, got ${bufferOffset}`,
      )
    }
    const dest = this.getChannelData(channelNumber)
    const n = Math.min(source.length, dest.length - bufferOffset)
    for (let i = 0; i < n; i++) dest[bufferOffset + i] = source[i]
  }

  /**
   * Copy from `channelNumber` (starting at `bufferOffset` frames) into
   * `destination`. Mirrors AudioBuffer.copyFromChannel; clips to available data.
   */
  copyFromChannel(destination, channelNumber, bufferOffset = 0) {
    if (!(destination instanceof Float32Array)) {
      throw new TypeError('PlecoBuffer.copyFromChannel: destination must be a Float32Array')
    }
    if (!Number.isInteger(bufferOffset) || bufferOffset < 0) {
      throw new RangeError(
        `PlecoBuffer.copyFromChannel: bufferOffset must be a non-negative integer, got ${bufferOffset}`,
      )
    }
    const src = this.getChannelData(channelNumber)
    const n = Math.min(destination.length, src.length - bufferOffset)
    for (let i = 0; i < n; i++) destination[i] = src[bufferOffset + i]
  }
}

/**
 * Allocation factory matching the `(numberOfChannels, length, sampleRate)`
 * signature that playback/ops.js's injectable `createBuffer` expects — so
 * PlecoBuffer is a drop-in allocator for the whole offline DSP layer:
 *   halfSpeedLoop(buf, loop, { createBuffer: createPlecoBuffer })
 */
export function createPlecoBuffer(numberOfChannels, length, sampleRate) {
  return new PlecoBuffer({ numberOfChannels, length, sampleRate })
}
