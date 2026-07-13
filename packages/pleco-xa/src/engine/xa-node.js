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
import { indexSizeError, invalidAccessError, invalidStateError, notSupportedError } from './xa-errors.js'

// Exported so subclasses that must pre-validate the constructor dictionary
// BEFORE super() (locked-attribute nodes: splitter/merger) reproduce the same
// WebIDL enum-conversion TypeError from the same single source of truth.
export const CHANNEL_COUNT_MODES = ['max', 'clamped-max', 'explicit']
export const CHANNEL_INTERPRETATIONS = ['speakers', 'discrete']

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
   * The block for output port `outputIndex` this quantum. Output ports pull
   * through here (xa-ports.js) so nodes whose outputs carry DIFFERENT signals
   * (ChannelSplitterNode is the first) can override it; the default ignores
   * the index and returns the node's single memoized _tick() block, so every
   * single-output node behaves exactly as before. Overrides keep the
   * per-currentTime memoization by computing through _tick() (whose _process
   * may return the full per-output set) and selecting per index.
   */
  _tickOutput() {
    return this._tick()
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
 * Convert a scheduled time (seconds) to its first active render frame: the
 * smallest integer frame f with f/sampleRate >= when, i.e. ceil(when *
 * sampleRate) — with a float-precision snap so a `when` computed as
 * frame/sampleRate lands on exactly that frame instead of drifting one frame
 * late from double rounding. Used for both bounds because the spec's playback
 * window (§ Playback of AudioBuffer Contents, per-frame condition
 * `currentTime < start || currentTime >= stop` → silent) makes the start frame
 * INCLUSIVE-at->=start and the stop frame the same ceil taken EXCLUSIVE.
 */
function frameCeil(v) {
  const r = Math.round(v)
  return Math.abs(v - r) < 1e-8 ? r : Math.ceil(v)
}

/**
 * PlecoScheduledSourceNode — spec-shaped AudioScheduledSourceNode
 * (spec § The AudioScheduledSourceNode Interface): start(when)/stop(when)
 * windowing on the frame clock, sample-frame-accurate at sub-quantum offsets.
 * Subclasses implement _dsp(output, offset, count) to generate up to `count`
 * frames starting at `offset` in the block; the base decides where in each
 * quantum the source is active, zero-pads the rest (the buffer starts silent),
 * and dispatches an `ended` Event exactly once when the source stops (stop
 * time reached, or content exhausted — `produced < count`).
 *
 * start()/stop() follow the spec algorithms: the [[source started]] slot gates
 * InvalidStateError (start twice / stop before start, checked BEFORE the
 * parameter constraint per the algorithms' step order); a non-finite `when` is
 * a TypeError (WebIDL restricted `double` conversion precedes the algorithm)
 * and a negative `when` is the spec's RangeError constraint. Rejecting
 * non-number `when` outright (e.g. start('1')) instead of coercing via WebIDL
 * ToNumber is deliberate pleco strictness, not spec behavior. Times in the
 * past clamp to currentTime at the quantum that processes them — the max/min
 * against the block window IS that clamp. Per the spec, repeated stop() calls
 * replace the pending stop time (last invocation wins), and a stop time at or
 * before the start time means the source never plays but `ended` still fires
 * when the stop time is reached.
 *
 * A started source registers itself in the context's tail set
 * (context._tailNodes) so renderQuantum() ticks it even when nothing pulls it
 * — the spec defines "playing" purely by currentTime against the start/stop
 * times, with no connectivity condition, so `ended` must fire for a source
 * that was never connected or was disconnected before its stop time. _end()
 * deregisters it; per-quantum memoization makes the extra tick a no-op for
 * sources the destination already pulled.
 *
 * The spec queues the `ended` Event from the control thread once the render
 * thread passes the stop frame; pleco's single-thread analogue dispatches it
 * via queueMicrotask after the quantum that ended the source, so it never
 * fires synchronously inside the render pull. `onended` is an event-handler
 * IDL attribute backed by the EventTarget inheritance: assigning subscribes,
 * reassigning replaces, null (or any non-function) unsubscribes.
 */
export class PlecoScheduledSourceNode extends PlecoNode {
  #onended = null

  constructor(context, options = {}) {
    super(context, { ...options, numberOfInputs: 0 })
    this._sourceStarted = false // the spec's [[source started]] slot
    this._startFrame = null
    this._stopFrame = null
    this._ended = false
  }

  get onended() {
    return this.#onended
  }

  set onended(fn) {
    if (this.#onended !== null) this.removeEventListener('ended', this.#onended)
    this.#onended = typeof fn === 'function' ? fn : null
    if (this.#onended !== null) this.addEventListener('ended', this.#onended)
  }

  start(when = 0) {
    // WebIDL restricted `double` conversion precedes the algorithm: non-finite
    // → TypeError. (Non-number rejection is pleco strictness — see class doc.)
    if (typeof when !== 'number' || !Number.isFinite(when)) {
      throw new TypeError(`PlecoScheduledSourceNode.start: when must be a finite number, got ${when}`)
    }
    // Spec start() step 1: [[source started]] already true → InvalidStateError.
    if (this._sourceStarted) {
      throw invalidStateError('PlecoScheduledSourceNode.start: start() has already been called on this source')
    }
    // Spec start() step 2 (parameter constraints): negative when → RangeError,
    // aborting BEFORE [[source started]] is set.
    if (when < 0) {
      throw new RangeError(`PlecoScheduledSourceNode.start: when must be non-negative, got ${when}`)
    }
    this._sourceStarted = true
    this._startFrame = frameCeil(when * this.context.sampleRate)
    // A started source is live regardless of connectivity: register as a
    // context tail node so renderQuantum() keeps ticking it and the
    // stop/exhaustion window (→ `ended`) is evaluated even when nothing
    // pulls it. Removed in _end().
    this.context._tailNodes.add(this)
  }

  stop(when = 0) {
    if (typeof when !== 'number' || !Number.isFinite(when)) {
      throw new TypeError(`PlecoScheduledSourceNode.stop: when must be a finite number, got ${when}`)
    }
    // Spec stop() step 1: [[source started]] not true → InvalidStateError.
    if (!this._sourceStarted) {
      throw invalidStateError('PlecoScheduledSourceNode.stop: stop() may not be called before start()')
    }
    if (when < 0) {
      throw new RangeError(`PlecoScheduledSourceNode.stop: when must be non-negative, got ${when}`)
    }
    this._stopFrame = frameCeil(when * this.context.sampleRate) // last invocation wins (spec)
  }

  _process() {
    const out = createPlecoAudioBuffer(this.channelCount, RENDER_QUANTUM, this.context.sampleRate)
    if (this._ended || !this._sourceStarted) return out

    const blockStart = this.context._frame
    const blockEnd = blockStart + RENDER_QUANTUM
    // Past times clamp to currentTime at the quantum that processes them:
    // the max/min against [blockStart, blockEnd) is exactly that clamp.
    const from = Math.max(this._startFrame, blockStart)
    const to = this._stopFrame === null ? blockEnd : Math.min(blockEnd, this._stopFrame)

    if (from < to) {
      const count = to - from
      const produced = this._dsp(out, from - blockStart, count)
      if (produced < count) {
        this._end() // content exhausted mid-window
        return out
      }
    }
    // Stop time reached within (or before) this quantum — including a stop
    // scheduled at/before the start time, where the source never plays.
    if (this._stopFrame !== null && this._stopFrame <= blockEnd) this._end()
    return out
  }

  _end() {
    if (this._ended) return
    this._ended = true
    this.context._tailNodes.delete(this)
    // Control-thread analogue: the spec queues the ended Event to the control
    // thread; in pleco's single-thread engine it is queued as a microtask after
    // the quantum that ended the source, never synchronously inside the pull.
    queueMicrotask(() => this.dispatchEvent(new Event('ended')))
  }

  /** Override: write up to `count` frames into `output` at `offset`; return frames produced. */
  _dsp() {
    return 0
  }
}
