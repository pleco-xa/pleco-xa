/**
 * engine/xa-node.js — PlecoNode (AudioNode base) + PlecoScheduledSourceNode.
 *
 * PlecoNode is spec-shaped AudioNode (spec § The AudioNode Interface): an
 * EventTarget carrying readonly context/numberOfInputs/numberOfOutputs, the
 * channelCount / channelCountMode / channelInterpretation attributes with
 * WebIDL enum semantics (invalid enum ASSIGNMENT is silently ignored — the one
 * WebIDL behavior we keep; the constructor dictionary path throws TypeError),
 * both connect() overloads and all SEVEN disconnect() overloads with the
 * spec's exact IndexSizeError / InvalidAccessError points. Edges live in
 * per-input / per-output port objects (xa-ports.js), stored bidirectionally;
 * connecting to a PlecoAudioParam stores the edge on the param's input port
 * for the automation slice (P04) to consume.
 *
 * The engine is a PULL graph: the destination pulls the graph once per render
 * quantum via _tick(); each node pulls each of its inputs (every connection
 * summed after up/down-mixing, per § channel-up-mixing-and-down-mixing),
 * processes, and returns a RENDER_QUANTUM-frame PlecoAudioBuffer. Output is
 * memoized per context.currentTime, so a node fanning out to several
 * consumers computes once per quantum. A re-entrancy guard mutes feedback
 * cycles to silence — the spec's DelayNode cycle rule is parity-later (P11);
 * the Echoplex's feedback is buffer-domain, not a graph cycle.
 */

import { RENDER_QUANTUM } from './xa-constants.js'
import { createPlecoAudioBuffer } from './xa-buffer.js'
import { PlecoAudioInput, PlecoAudioOutput } from './xa-ports.js'
import { PlecoAudioParam } from './xa-param.js'
import { indexSizeError, invalidAccessError, notSupportedError } from './xa-errors.js'

const CHANNEL_COUNT_MODES = ['max', 'clamped-max', 'explicit']
const CHANNEL_INTERPRETATIONS = ['speakers', 'discrete']

/** Spec: "An implementation MUST support at least 32 channels" — pleco supports exactly 32 (same ceiling as PlecoAudioBuffer). */
const MAX_CHANNELS = 32

/** Spec-mandated IndexSizeError for out-of-range connect/disconnect port indexes. */
function checkPortIndex(method, kind, index, count) {
  if (!Number.isInteger(index) || index < 0 || index >= count) {
    throw indexSizeError(`PlecoNode.${method}: ${kind} index ${index} out of range [0, ${count})`)
  }
}

export class PlecoNode extends EventTarget {
  #context
  #numberOfInputs
  #numberOfOutputs
  #channelCount
  #channelCountMode
  #channelInterpretation

  /**
   * @param {object} context — the owning PlecoBaseContext.
   * @param {object} [options] — structural shape (numberOfInputs/numberOfOutputs,
   *   fixed per node type) merged with AudioNodeOptions ({channelCount,
   *   channelCountMode, channelInterpretation}, spec § AudioNodeOptions).
   */
  constructor(
    context,
    {
      numberOfInputs = 1,
      numberOfOutputs = 1,
      channelCount = 2,
      channelCountMode = 'max',
      channelInterpretation = 'speakers',
    } = {},
  ) {
    if (context == null || typeof context.sampleRate !== 'number') {
      throw new TypeError('PlecoNode: a context is required')
    }
    super()
    if (!Number.isInteger(numberOfInputs) || numberOfInputs < 0) {
      throw new RangeError(`PlecoNode: numberOfInputs must be a non-negative integer, got ${numberOfInputs}`)
    }
    if (!Number.isInteger(numberOfOutputs) || numberOfOutputs < 0) {
      throw new RangeError(`PlecoNode: numberOfOutputs must be a non-negative integer, got ${numberOfOutputs}`)
    }
    // Constructor dictionary path: an invalid ChannelCountMode /
    // ChannelInterpretation in AudioNodeOptions is a WebIDL binding TypeError
    // (unlike attribute assignment, which silently ignores invalid strings).
    if (!CHANNEL_COUNT_MODES.includes(channelCountMode)) {
      throw new TypeError(
        `PlecoNode: channelCountMode must be 'max' | 'clamped-max' | 'explicit', got ${channelCountMode}`,
      )
    }
    if (!CHANNEL_INTERPRETATIONS.includes(channelInterpretation)) {
      throw new TypeError(
        `PlecoNode: channelInterpretation must be 'speakers' | 'discrete', got ${channelInterpretation}`,
      )
    }
    this.#context = context
    this.#numberOfInputs = numberOfInputs
    this.#numberOfOutputs = numberOfOutputs
    this.#channelCountMode = channelCountMode
    this.#channelInterpretation = channelInterpretation
    this.channelCount = channelCount // validated setter — NotSupportedError path

    this._inputs = []
    this._outputs = []
    for (let i = 0; i < numberOfInputs; i++) this._inputs.push(new PlecoAudioInput(this, i))
    for (let i = 0; i < numberOfOutputs; i++) this._outputs.push(new PlecoAudioOutput(this, i))

    this._cacheTime = -1
    this._cacheBlock = null
    this._ticking = false
  }

  get context() {
    return this.#context
  }

  get numberOfInputs() {
    return this.#numberOfInputs
  }

  get numberOfOutputs() {
    return this.#numberOfOutputs
  }

  get channelCount() {
    return this.#channelCount
  }

  set channelCount(v) {
    if (!Number.isInteger(v) || v < 1 || v > MAX_CHANNELS) {
      throw notSupportedError(`PlecoNode: channelCount must be an integer in [1, ${MAX_CHANNELS}], got ${v}`)
    }
    this._validateChannelCount(v)
    this.#channelCount = v
  }

  get channelCountMode() {
    return this.#channelCountMode
  }

  set channelCountMode(v) {
    if (!CHANNEL_COUNT_MODES.includes(v)) return // WebIDL enum attribute: invalid assignment is silently ignored
    this._validateChannelCountMode(v)
    this.#channelCountMode = v
  }

  get channelInterpretation() {
    return this.#channelInterpretation
  }

  set channelInterpretation(v) {
    if (!CHANNEL_INTERPRETATIONS.includes(v)) return // WebIDL enum attribute: invalid assignment is silently ignored
    this._validateChannelInterpretation(v)
    this.#channelInterpretation = v
  }

  // Per-node constraint hooks (spec § channelCount constraints etc.) —
  // subclasses with additional constraints override these to throw.
  _validateChannelCount() {}
  _validateChannelCountMode() {}
  _validateChannelInterpretation() {}

  /**
   * connect(destinationNode, output = 0, input = 0) → destinationNode (chainable), or
   * connect(destinationParam, output = 0) → undefined (edge stored on the param's
   * input port for P04). Duplicate connections with the same termini are ignored.
   * Cross-context → InvalidAccessError; out-of-range indexes → IndexSizeError.
   */
  connect(destination, output = 0, input = 0) {
    if (destination instanceof PlecoAudioParam) {
      // Params carry the context of the node that owns them; a bare param
      // (no owner yet) has nothing to compare against, so only an ACTUAL
      // context mismatch is a spec violation.
      if (destination._context !== null && destination._context !== this.context) {
        throw invalidAccessError('PlecoNode.connect: cannot connect to an AudioParam from a different context')
      }
      checkPortIndex('connect', 'output', output, this.numberOfOutputs)
      this._outputs[output]._connect(destination._input)
      return undefined
    }
    if (!(destination instanceof PlecoNode)) {
      throw new TypeError('PlecoNode.connect: destination must be a PlecoNode or PlecoAudioParam')
    }
    if (destination.context !== this.context) {
      throw invalidAccessError('PlecoNode.connect: cannot connect nodes from different contexts')
    }
    checkPortIndex('connect', 'output', output, this.numberOfOutputs)
    checkPortIndex('connect', 'input', input, destination.numberOfInputs)
    this._outputs[output]._connect(destination._inputs[input])
    return destination
  }

  /**
   * All seven spec overloads (spec § AudioNode/disconnect):
   *   disconnect()                          — ALL outgoing connections from every output
   *   disconnect(output)                    — all outgoing from one output
   *   disconnect(destinationNode)           — every output → every input of destinationNode
   *   disconnect(destinationNode, output)   — one output → every input of destinationNode
   *   disconnect(destinationNode, output, input) — one output → one input
   *   disconnect(destinationParam)          — every output → destinationParam
   *   disconnect(destinationParam, output)  — one output → destinationParam
   * Named destination not actually connected → InvalidAccessError;
   * out-of-range indexes → IndexSizeError. Only OUTGOING edges are touched —
   * inbound connections to this node always survive.
   */
  disconnect(destination, output, input) {
    if (destination === undefined) {
      for (const port of this._outputs) port._disconnectAll()
      return
    }
    if (typeof destination === 'number') {
      checkPortIndex('disconnect', 'output', destination, this.numberOfOutputs)
      this._outputs[destination]._disconnectAll()
      return
    }
    if (destination instanceof PlecoAudioParam) {
      if (output !== undefined) {
        checkPortIndex('disconnect', 'output', output, this.numberOfOutputs)
        if (!this._outputs[output]._disconnect(destination._input)) {
          throw invalidAccessError(`PlecoNode.disconnect: output ${output} is not connected to the given AudioParam`)
        }
        return
      }
      let found = false
      for (const port of this._outputs) if (port._disconnect(destination._input)) found = true
      if (!found) {
        throw invalidAccessError('PlecoNode.disconnect: this node is not connected to the given AudioParam')
      }
      return
    }
    if (!(destination instanceof PlecoNode)) {
      throw new TypeError('PlecoNode.disconnect: destination must be a PlecoNode, PlecoAudioParam, or output index')
    }
    if (output !== undefined) checkPortIndex('disconnect', 'output', output, this.numberOfOutputs)
    if (input !== undefined) checkPortIndex('disconnect', 'input', input, destination.numberOfInputs)

    if (output !== undefined && input !== undefined) {
      if (!this._outputs[output]._disconnect(destination._inputs[input])) {
        throw invalidAccessError(
          `PlecoNode.disconnect: output ${output} is not connected to input ${input} of the given node`,
        )
      }
      return
    }
    if (output !== undefined) {
      let found = false
      for (const inp of destination._inputs) if (this._outputs[output]._disconnect(inp)) found = true
      if (!found) {
        throw invalidAccessError(`PlecoNode.disconnect: output ${output} is not connected to the given node`)
      }
      return
    }
    let found = false
    for (const port of this._outputs) {
      for (const inp of destination._inputs) if (port._disconnect(inp)) found = true
    }
    if (!found) {
      throw invalidAccessError('PlecoNode.disconnect: this node is not connected to the given node')
    }
  }

  _tick() {
    const now = this.context.currentTime
    if (this._cacheBlock !== null && this._cacheTime === now) return this._cacheBlock
    if (this._ticking) {
      // feedback cycle — mute to silence (the DelayNode cycle rule is P11)
      return createPlecoAudioBuffer(this.channelCount, RENDER_QUANTUM, this.context.sampleRate)
    }
    this._ticking = true
    let block
    try {
      block = this._process(...this._inputs.map((port) => port._pull()))
    } finally {
      this._ticking = false
    }
    this._cacheTime = now
    this._cacheBlock = block
    return block
  }

  /**
   * Override to transform the pulled input block(s) — one argument per input,
   * each already summed and up/down-mixed. Default passes the first input
   * through (silence if the node has no inputs).
   */
  _process(input) {
    return input ?? createPlecoAudioBuffer(this.channelCount, RENDER_QUANTUM, this.context.sampleRate)
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
    super(context, { ...options, numberOfInputs: 0 })
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
    const out = createPlecoAudioBuffer(this.channelCount, RENDER_QUANTUM, this.context.sampleRate)
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
