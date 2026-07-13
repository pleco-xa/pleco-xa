/**
 * engine/xa-offline-context.js — PlecoOfflineContext.
 *
 * The headless, deterministic render driver: a synchronous loop over
 * renderQuantum() that blits each block into a fixed-length PlecoAudioBuffer. No
 * timers, no sink, zero Web Audio — a literal OfflineAudioContext bounce minus
 * the platform. Render twice ⇒ bit-identical output. This is THE headless proof
 * that pleco's audio engine runs under `node script.js`.
 */
import { PlecoBaseContext } from './xa-base-context.js'
import { RENDER_QUANTUM } from './xa-constants.js'
import { createPlecoAudioBuffer } from './xa-buffer.js'

export class PlecoOfflineContext extends PlecoBaseContext {
  constructor({ numberOfChannels = 1, length, sampleRate } = {}) {
    super({ sampleRate, numberOfChannels })
    if (!Number.isInteger(length) || length <= 0) {
      throw new RangeError(`PlecoOfflineContext: length must be a positive integer, got ${length}`)
    }
    this.numberOfChannels = numberOfChannels
    this.length = length
  }

  /** Render the whole graph to a PlecoAudioBuffer of exactly `length` frames. Deterministic. */
  renderSync() {
    const out = createPlecoAudioBuffer(this.numberOfChannels, this.length, this.sampleRate)
    let written = 0
    while (written < this.length) {
      const block = this.renderQuantum()
      const n = Math.min(RENDER_QUANTUM, this.length - written)
      for (let c = 0; c < this.numberOfChannels; c++) {
        out.getChannelData(c).set(block.getChannelData(c).subarray(0, n), written)
      }
      written += n
    }
    return out
  }

  /** Spec-parity async wrapper around renderSync(). */
  startRendering() {
    return Promise.resolve(this.renderSync())
  }
}
