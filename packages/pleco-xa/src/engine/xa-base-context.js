/**
 * engine/xa-base-context.js — PlecoBaseContext.
 *
 * The frame clock + the single render step every driver shares. `currentTime` is
 * a PURE derivation of an integer frame counter (never a wall clock) — that is
 * exactly what makes offline and realtime graph math identical, and what lets a
 * later browser sink slot under the same renderQuantum() as a drop-in.
 *
 * The frame advances AFTER the pull, so `currentTime` during a block equals the
 * block's START — the invariant the per-node memo and scheduled-event windowing
 * both rely on.
 */
import { RENDER_QUANTUM } from './xa-constants.js'
import { PlecoAudioDestinationNode } from './nodes/xa-destination.js'
import { PlecoGainNode } from './nodes/xa-gain.js'
import { PlecoAudioBufferSourceNode } from './nodes/xa-buffer-source.js'
import { createPlecoAudioBuffer } from './xa-buffer.js'

export class PlecoBaseContext {
  constructor({ sampleRate, numberOfChannels = 1 } = {}) {
    // P06 tightens this to the spec's nominal range [3000, 768000] Hz with a
    // NotSupportedError ("Supported Sample Rates" applies to contexts too);
    // until then buffer allocation at this rate enforces it indirectly.
    if (!Number.isFinite(sampleRate) || sampleRate <= 0) {
      throw new RangeError(`PlecoBaseContext: sampleRate must be a positive finite number, got ${sampleRate}`)
    }
    this._sampleRate = sampleRate
    this._numberOfChannels = numberOfChannels
    this._frame = 0
    // Started scheduled sources register here (xa-node.js start()/_end()) so
    // renderQuantum() ticks them even when nothing pulls them — a source's
    // stop/exhaustion window (and its `ended` event) is connectivity-
    // independent per the spec. Double-ticking a pulled source is a no-op
    // thanks to the per-quantum memo.
    this._tailNodes = new Set()
    this._destination = new PlecoAudioDestinationNode(this, { channelCount: numberOfChannels })
  }

  get sampleRate() {
    return this._sampleRate
  }

  get currentTime() {
    return this._frame / this._sampleRate
  }

  get destination() {
    return this._destination
  }

  /**
   * BaseAudioContext.createBuffer(numberOfChannels, length, sampleRate) —
   * zero-initialized PlecoAudioBuffer. Throws a NotSupportedError DOMException
   * if any argument is zero, negative, or outside its nominal range (same
   * validation path as the PlecoAudioBuffer constructor).
   */
  createBuffer(numberOfChannels, length, sampleRate) {
    return createPlecoAudioBuffer(numberOfChannels, length, sampleRate)
  }

  createGain() {
    // Factory algorithm sets only passed parameters — createGain takes none,
    // so the node keeps the spec GainNode defaults (channelCount 2, mode 'max').
    return new PlecoGainNode(this)
  }

  createBufferSource() {
    return new PlecoAudioBufferSourceNode(this)
  }

  /** The one engine step: pull the graph from the sink, tick tail nodes, advance the clock. */
  renderQuantum() {
    const block = this._destination._tick()
    for (const tail of this._tailNodes) tail._tick()
    this._frame += RENDER_QUANTUM
    return block
  }
}
