/**
 * engine/xa-ports.js — per-input / per-output port objects for PlecoNode.
 *
 * Every AudioNode input and output is a port; a connection is a BIDIRECTIONAL
 * edge between an output port and an input port (or an AudioParam's input
 * port), stored on both ends so either side can enumerate and sever it. This
 * is the structure the spec's connect()/disconnect() overloads operate on,
 * and what lets numberOfInputs/numberOfOutputs exceed 1 (splitter/merger).
 *
 * Pulling: an output port pulls its owning node's _tick() (memoized per
 * currentTime on the node). An input port pulls EVERY connected output, then
 * sums the blocks after up/down-mixing each via mixInto() with the owning
 * node's channelInterpretation, into a block that is computedNumberOfChannels
 * wide (spec § ChannelCountMode). An input with zero connections is one
 * channel of silence (spec: "If the input has no connections then it has one
 * channel which is silent").
 */

import { RENDER_QUANTUM } from './xa-constants.js'
import { createPlecoAudioBuffer } from './xa-buffer.js'
import { mixInto, computeNumberOfChannels } from './xa-channel-mixing.js'

/**
 * Base port: one endpoint of the graph's bidirectional edges. `owner` is the
 * PlecoNode (or PlecoAudioParam, for a param's input) the port belongs to;
 * `index` is the port's position among its owner's inputs or outputs.
 */
export class PlecoAudioPort {
  constructor(owner, index) {
    this.owner = owner
    this.index = index
    this.connections = []
  }

  /** Add the edge this⇄other. Duplicate edges are ignored (spec). Returns whether an edge was added. */
  _connect(other) {
    if (this.connections.includes(other)) return false
    this.connections.push(other)
    other.connections.push(this)
    return true
  }

  /** Sever the edge this⇄other on BOTH ends. Returns whether an edge existed. */
  _disconnect(other) {
    const i = this.connections.indexOf(other)
    if (i === -1) return false
    this.connections.splice(i, 1)
    const j = other.connections.indexOf(this)
    if (j !== -1) other.connections.splice(j, 1)
    return true
  }

  /** Sever every edge touching this port. */
  _disconnectAll() {
    for (const other of this.connections.slice()) this._disconnect(other)
  }
}

/** An AudioNode input: pulls and mixes every connected output for the current quantum. */
export class PlecoAudioInput extends PlecoAudioPort {
  /**
   * Pull all connections and sum them into one computedNumberOfChannels-wide
   * block: pull each connected output's block, take the max source channel
   * count, resolve computedNumberOfChannels from the owning node's
   * channelCountMode/channelCount, then mixInto() (accumulating) each block
   * with the node's channelInterpretation. Zero connections ⇒ 1 ch silence.
   */
  _pull() {
    const node = this.owner
    const sampleRate = node.context.sampleRate
    if (this.connections.length === 0) {
      return createPlecoAudioBuffer(1, RENDER_QUANTUM, sampleRate)
    }
    const blocks = this.connections.map((out) => out._pull())
    let maxSourceChannels = 1
    for (const b of blocks) maxSourceChannels = Math.max(maxSourceChannels, b.numberOfChannels)
    const computed = computeNumberOfChannels(
      node.channelCountMode,
      node.channelCount,
      maxSourceChannels,
    )
    const dest = createPlecoAudioBuffer(computed, RENDER_QUANTUM, sampleRate)
    for (const b of blocks) mixInto(dest, b, node.channelInterpretation)
    return dest
  }
}

/** An AudioNode output: pulling it ticks the owning node (memoized per currentTime). */
export class PlecoAudioOutput extends PlecoAudioPort {
  _pull() {
    return this.owner._tick()
  }
}
