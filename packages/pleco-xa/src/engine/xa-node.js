/**
 * engine/xa-node.js — PlecoNode (graph node base) + PlecoScheduledSourceNode.
 *
 * The engine is a PULL graph: the destination pulls the graph once per render
 * quantum via _tick(); each node pulls-and-sums its inputs, processes them, and
 * returns a RENDER_QUANTUM-frame PlecoBuffer. Output is memoized per
 * context.currentTime, so a node feeding several consumers computes once per
 * quantum. A re-entrancy guard mutes feedback cycles to silence — true cycle
 * resolution (the deferred DelayNode read/write split) is parity-later; the
 * Echoplex's feedback is buffer-domain, not a graph cycle, so the guard suffices.
 */

import { RENDER_QUANTUM } from './xa-constants.js'
import { createPlecoBuffer } from './xa-buffer.js'
import { mixInto } from './xa-channel-mixing.js'

export class PlecoNode {
  constructor(context, { numberOfInputs = 1, numberOfOutputs = 1, channelCount = 1 } = {}) {
    if (context == null) throw new TypeError('PlecoNode: a context is required')
    this.context = context
    this.numberOfInputs = numberOfInputs
    this.numberOfOutputs = numberOfOutputs
    this.channelCount = channelCount
    this._sources = [] // upstream nodes feeding this node's input
    this._cacheTime = -1
    this._cacheBlock = null
    this._ticking = false
  }

  /** Wire this node's output into `destination`'s input. Returns `destination` (chainable). */
  connect(destination) {
    if (destination == null || typeof destination._tick !== 'function') {
      throw new TypeError('PlecoNode.connect: destination must be a node')
    }
    if (!destination._sources.includes(this)) destination._sources.push(this)
    return destination
  }

  /** Remove this node as an input of `destination` (or clear this node's inbound edges). */
  disconnect(destination) {
    if (destination === undefined) {
      this._sources = []
      return
    }
    destination._sources = destination._sources.filter((s) => s !== this)
  }

  /** Sum all upstream outputs into one channelCount-wide block for this quantum. */
  _pullInputs() {
    const out = createPlecoBuffer(this.channelCount, RENDER_QUANTUM, this.context.sampleRate)
    for (const src of this._sources) mixInto(out, src._tick())
    return out
  }

  _tick() {
    const now = this.context.currentTime
    if (this._cacheBlock !== null && this._cacheTime === now) return this._cacheBlock
    if (this._ticking) {
      // feedback cycle — mute to silence (real cycle resolution is parity-later)
      return createPlecoBuffer(this.channelCount, RENDER_QUANTUM, this.context.sampleRate)
    }
    this._ticking = true
    let block
    try {
      block = this._process(this._pullInputs())
    } finally {
      this._ticking = false
    }
    this._cacheTime = now
    this._cacheBlock = block
    return block
  }

  /** Override to transform the summed input block. Default passes it through. */
  _process(input) {
    return input
  }
}

/**
 * PlecoScheduledSourceNode — start(when)/stop(when) windowing on the frame clock.
 * Subclasses implement _dsp(output, offset, count) to generate up to `count`
 * frames starting at `offset` in the block; the base decides where in each
 * quantum the source is active, zero-pads the rest (the buffer starts silent),
 * and fires `ended` exactly once when the source is exhausted or stopped.
 */
export class PlecoScheduledSourceNode extends PlecoNode {
  constructor(context, options = {}) {
    super(context, { numberOfInputs: 0, ...options })
    this._startFrame = null
    this._stopFrame = null
    this._ended = false
    this.onended = null
  }

  start(when = 0) {
    if (this._startFrame !== null) throw new Error('start() already called')
    this._startFrame = Math.round(when * this.context.sampleRate)
  }

  stop(when = 0) {
    if (this._startFrame === null) throw new Error('stop() called before start()')
    this._stopFrame = Math.round(when * this.context.sampleRate)
  }

  _process() {
    const out = createPlecoBuffer(this.channelCount, RENDER_QUANTUM, this.context.sampleRate)
    if (this._ended || this._startFrame === null) return out

    const blockStart = this.context._frame
    const blockEnd = blockStart + RENDER_QUANTUM
    const from = Math.max(this._startFrame, blockStart)
    const to = this._stopFrame === null ? blockEnd : Math.min(blockEnd, this._stopFrame)

    if (from >= to) {
      if (this._stopFrame !== null && blockStart >= this._stopFrame) this._end()
      return out
    }

    const offset = from - blockStart
    const count = to - from
    const produced = this._dsp(out, offset, count)
    if (produced < count || (this._stopFrame !== null && to >= this._stopFrame)) this._end()
    return out
  }

  _end() {
    if (this._ended) return
    this._ended = true
    if (typeof this.onended === 'function') this.onended()
  }

  /** Override: write up to `count` frames into `output` at `offset`; return frames produced. */
  _dsp() {
    return 0
  }
}
