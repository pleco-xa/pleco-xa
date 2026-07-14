/**
 * engine/nodes/xa-audio-worklet-node.js — PlecoAudioWorkletNode
 * (AudioWorkletNode) + PlecoAudioParamMap (AudioParamMap) + the
 * PlecoAudioWorkletProcessor base re-export (P20).
 *
 * Spec-shaped AudioWorkletNode (spec § The AudioWorkletNode Interface):
 * 1 input / 1 output BY DEFAULT (AudioWorkletNodeOptions.numberOfInputs /
 * numberOfOutputs override), channelCount 2 / channelCountMode 'max' /
 * channelInterpretation 'speakers'. Constructor order follows the spec
 * algorithm layered under WebIDL: the options-dictionary conversion
 * (TypeErrors — including the house ctor-dict invalid-enum rule) runs first,
 * then step 1's name lookup in the context's "node name to parameter
 * descriptor map" (unknown name → InvalidStateError), then step 3's
 * AudioNode initialization (super — an invalid channelCount's
 * NotSupportedError fires here), then step 4's configure-channels algorithm
 * (§ Configuring Channels with
 * AudioWorkletNodeOptions: both numberOfInputs and numberOfOutputs zero →
 * NotSupportedError; an outputChannelCount entry of 0 or > 32 →
 * NotSupportedError; outputChannelCount length ≠ numberOfOutputs →
 * IndexSizeError; absent outputChannelCount → single-in/single-out nodes get
 * a DYNAMIC output that follows the input's computedNumberOfChannels, every
 * other shape gets mono outputs).
 *
 * PROCESSOR PAIRING (single-thread analogue of the spec's queued control
 * message): the constructor creates the node↔processor MessageChannel (the
 * host's MessageChannel — Node's or the browser's), arms the
 * [=pending processor construction data=] slot with the processor-side port,
 * and constructs the registered class synchronously with the CONVERTED
 * options dictionary passed through structuredClone — the spec's
 * StructuredSerialize step, so a non-cloneable processorOptions member
 * throws DataCloneError synchronously from the node constructor, and the
 * processor can never share object identity with the caller's dictionary. A
 * processor-constructor exception does NOT abort node construction: per the
 * invoking-processor-constructor algorithm it queues a `processorerror`
 * ErrorEvent (PlecoErrorEvent — the flagged internal shim) and the node is
 * born dead (silence forever).
 *
 * RENDER CONTRACT (spec § rendering a graph, step 5.4 + the
 * AudioWorkletProcessCallback definition):
 * - `process` is looked up FRESH on the processor each quantum (Get
 *   semantics — getters and late assignment observed); not callable →
 *   TypeError completion → the error path.
 * - inputs: FrozenArray<FrozenArray<Float32Array>> — input n is [] (zero
 *   channels) when nothing actively feeds it. Pleco's liveness test is
 *   structural: an input with no connections, or whose connected sources
 *   have ALL ended, is empty; anything else presents its mixed block's
 *   channels (a connected-but-not-yet-started source still counts live —
 *   documented approximation of the spec's actively-processing propagation).
 *   Liveness is captured in _prepareQuantum, BEFORE the pull ticks the
 *   sources, so a source's final quantum still presents its channels.
 * - outputs: zero-filled Float32Arrays the author writes into — they ARE the
 *   node's output blocks' channel data (no copy; single-thread).
 * - parameters: a frozen ordered map of name → Float32Array holding the
 *   param's computedValue block; k-rate params are ALWAYS length 1, an
 *   a-rate param with no input connection whose block is constant is length
 *   1 (the spec's MAY), everything else is a full render-quantum block.
 * - lifetime: the processor's [=active source=] flag (initially true) is set
 *   to ToBoolean(process's return value) after every successful call. The
 *   node processes when the flag is true OR an input is live; with the flag
 *   false and no live inputs, process() is NOT invoked and the node outputs
 *   silence — but a later live input revives it (return-false does NOT kill
 *   the node, unlike the audiojs reference's permanent-death behavior).
 * - error path (process throws / not callable / constructor threw): fire
 *   `processorerror` at the node (queued as a microtask — the control-thread
 *   task analogue) EXACTLY ONCE, make THIS quantum's output silent (the
 *   spec's "make a silent output buffer available"), and output silence for
 *   the rest of the node's lifetime ([[callable process]] and active source
 *   both false, per the abrupt-completion steps).
 * - a live node registers in context._tailNodes so process() runs every
 *   quantum even with nothing pulling it (the active-source flag "causes the
 *   node to ... perform audio processing in the absence of any connected
 *   inputs" — the VU-meter shape with zero outputs relies on this); a dead
 *   node deregisters.
 * - a not-processing (but not dead) node outputs silence AT ITS CONFIGURED
 *   CHANNEL SHAPE rather than the spec's generic single silent channel —
 *   documented divergence shared with the audiojs reference; silent channels
 *   are sum-neutral.
 *
 * PlecoAudioParamMap is the spec's readonly-maplike<DOMString, AudioParam>:
 * entries/forEach/get/has/keys/values/@@iterator/size and nothing mutable.
 * Params are built from the registered parameterDescriptors (defaultValue /
 * minValue / maxValue / automationRate); AudioWorkletNodeOptions.parameterData
 * then sets the matching params' `value` ATTRIBUTE (the spec algorithm —
 * entries naming no descriptor are skipped, per spec). The map object is
 * constructible only engine-internally (same documented tier as
 * PlecoAudioParam).
 */

import { PlecoNode, CHANNEL_COUNT_MODES, CHANNEL_INTERPRETATIONS } from '../xa-node.js'
import { PlecoAudioParam } from '../xa-param.js'
import { RENDER_QUANTUM } from '../xa-constants.js'
import { createPlecoAudioBuffer } from '../xa-buffer.js'
import { indexSizeError, invalidStateError, notSupportedError } from '../xa-errors.js'
import {
  getContextAudioWorklet,
  PlecoAudioWorkletProcessor,
  PlecoErrorEvent,
  _setPendingProcessorConstructionData,
  _clearPendingProcessorConstructionData,
} from '../xa-audio-worklet.js'

// The processor base export: authors extending the base import it from the
// node module alongside the node (the P20 public pairing).
export { PlecoAudioWorkletProcessor }

/** Engine channel ceiling — same value as PlecoAudioBuffer/PlecoNode (spec: "MUST support at least 32 channels"). */
const MAX_CHANNELS = 32

/**
 * PlecoAudioParamMap — the spec's `readonly maplike<DOMString, AudioParam>`
 * (spec § AudioParamMap): entries, forEach, get, has, keys, values,
 * @@iterator and the size getter, with no mutation surface.
 */
export class PlecoAudioParamMap {
  #map

  /** @param {Map<string, PlecoAudioParam>} entries — engine-internal backing map (insertion-ordered). */
  constructor(entries) {
    if (!(entries instanceof Map)) {
      throw new TypeError('PlecoAudioParamMap: an engine-internal Map of entries is required')
    }
    this.#map = entries
  }

  get size() {
    return this.#map.size
  }

  get(name) {
    return this.#map.get(name)
  }

  has(name) {
    return this.#map.has(name)
  }

  entries() {
    return this.#map.entries()
  }

  keys() {
    return this.#map.keys()
  }

  values() {
    return this.#map.values()
  }

  forEach(callback, thisArg) {
    // readonly maplike forEach: callback(value, key, map) with THIS map as the third argument.
    for (const [k, v] of this.#map) callback.call(thisArg, v, k, this)
  }

  [Symbol.iterator]() {
    return this.#map.entries()
  }
}

/** Is every sample of this block the same value? (The parameters-length-1 constancy test.) */
function isConstantBlock(arr) {
  const v = arr[0]
  for (let i = 1; i < arr.length; i++) if (arr[i] !== v) return false
  return true
}

export class PlecoAudioWorkletNode extends PlecoNode {
  #parameters
  #paramMap
  #port
  #processor = null
  /** The processor's [=active source=] flag (spec: initially true). */
  #activeSource = true
  /** processorerror-then-silence: [[callable process]] and active source both irrecoverably false. */
  #dead = false
  #onprocessorerror = null
  /** Per-output channel counts (fixed shape), or the dynamic single-output marker. */
  #outputChannelCounts
  #dynamicOutput
  /** Per-input liveness captured in _prepareQuantum (pre-pull) — see the render contract. */
  #inputLive = []

  /**
   * @param {object} context — the owning PlecoBaseContext.
   * @param {string} name — key into the context's node-name → parameter-descriptor map.
   * @param {object} [options] — AudioWorkletNodeOptions merged with AudioNodeOptions.
   */
  constructor(context, name, options = {}) {
    // WebIDL: null (like undefined) is the empty dictionary.
    const opts = options ?? {}
    // ---- WebIDL argument + dictionary conversion tier (all TypeError) ----
    if (context == null || typeof context.sampleRate !== 'number') {
      throw new TypeError('PlecoAudioWorkletNode: a context is required')
    }
    if (typeof name !== 'string') {
      throw new TypeError(`PlecoAudioWorkletNode: name must be a string, got ${name}`)
    }
    if (typeof opts !== 'object') {
      throw new TypeError(`PlecoAudioWorkletNode: options must be a dictionary object, got ${opts}`)
    }
    const numberOfInputs = opts.numberOfInputs === undefined ? 1 : opts.numberOfInputs
    const numberOfOutputs = opts.numberOfOutputs === undefined ? 1 : opts.numberOfOutputs
    if (!Number.isInteger(numberOfInputs) || numberOfInputs < 0) {
      throw new TypeError(
        `PlecoAudioWorkletNode: numberOfInputs must be a non-negative integer, got ${numberOfInputs}`,
      )
    }
    if (!Number.isInteger(numberOfOutputs) || numberOfOutputs < 0) {
      throw new TypeError(
        `PlecoAudioWorkletNode: numberOfOutputs must be a non-negative integer, got ${numberOfOutputs}`,
      )
    }
    let outputChannelCount = null
    if (opts.outputChannelCount !== undefined) {
      // sequence<unsigned long> conversion — non-iterable or non-integer entries are TypeErrors.
      if (opts.outputChannelCount == null || typeof opts.outputChannelCount[Symbol.iterator] !== 'function') {
        throw new TypeError('PlecoAudioWorkletNode: outputChannelCount must be a sequence of unsigned integers')
      }
      outputChannelCount = []
      for (const v of opts.outputChannelCount) {
        if (!Number.isInteger(v) || v < 0) {
          throw new TypeError(
            `PlecoAudioWorkletNode: outputChannelCount entries must be non-negative integers, got ${v}`,
          )
        }
        outputChannelCount.push(v)
      }
    }
    if (opts.parameterData !== undefined) {
      // record<DOMString, double> — values are restricted doubles (non-finite → TypeError).
      if (opts.parameterData === null || typeof opts.parameterData !== 'object') {
        throw new TypeError('PlecoAudioWorkletNode: parameterData must be a record of finite numbers')
      }
      for (const [k, v] of Object.entries(opts.parameterData)) {
        if (typeof v !== 'number' || !Number.isFinite(v)) {
          throw new TypeError(`PlecoAudioWorkletNode: parameterData['${k}'] must be a finite number, got ${v}`)
        }
      }
    }
    if (opts.processorOptions !== undefined && (opts.processorOptions === null || typeof opts.processorOptions !== 'object')) {
      throw new TypeError('PlecoAudioWorkletNode: processorOptions must be an object')
    }
    // House ctor-dict enum rule, checked here so the dictionary tier stays
    // ahead of the algorithm's InvalidStateError name lookup (same pattern
    // as nodes/xa-channel-splitter.js).
    const channelCountMode = opts.channelCountMode ?? 'max'
    if (!CHANNEL_COUNT_MODES.includes(channelCountMode)) {
      throw new TypeError(
        `PlecoAudioWorkletNode: channelCountMode must be 'max' | 'clamped-max' | 'explicit', got ${channelCountMode}`,
      )
    }
    const channelInterpretation = opts.channelInterpretation ?? 'speakers'
    if (!CHANNEL_INTERPRETATIONS.includes(channelInterpretation)) {
      throw new TypeError(
        `PlecoAudioWorkletNode: channelInterpretation must be 'speakers' | 'discrete', got ${channelInterpretation}`,
      )
    }

    // ---- Spec algorithm step 1: name lookup → InvalidStateError ----
    const worklet = getContextAudioWorklet(context)
    const descriptors = worklet._parameterDescriptorMap.get(name)
    if (descriptors === undefined) {
      throw invalidStateError(
        `PlecoAudioWorkletNode: no processor named '${name}' is registered on this context (addModule/registerProcessor first)`,
      )
    }

    // ---- Spec algorithm step 3: initialize the AudioNode (super) — the
    // channelCount/channelCountMode setters' errors fire HERE, before the
    // configure-channels checks below (observable exception-type order). ----
    super(context, {
      numberOfInputs,
      numberOfOutputs,
      channelCount: opts.channelCount ?? 2,
      channelCountMode,
      channelInterpretation,
    })

    // ---- Spec algorithm step 4: configure input, output and output
    // channels (§ Configuring Channels). Throwing here aborts construction
    // safely — the node is not yet registered anywhere (tail-set
    // registration happens last). ----
    if (numberOfInputs === 0 && numberOfOutputs === 0) {
      throw notSupportedError('PlecoAudioWorkletNode: numberOfInputs and numberOfOutputs cannot both be zero')
    }
    if (outputChannelCount !== null) {
      for (const v of outputChannelCount) {
        if (v === 0 || v > MAX_CHANNELS) {
          throw notSupportedError(
            `PlecoAudioWorkletNode: outputChannelCount entries must be in [1, ${MAX_CHANNELS}], got ${v}`,
          )
        }
      }
      if (outputChannelCount.length !== numberOfOutputs) {
        throw indexSizeError(
          `PlecoAudioWorkletNode: outputChannelCount length ${outputChannelCount.length} must equal numberOfOutputs ${numberOfOutputs}`,
        )
      }
    }

    // Output shape: explicit outputChannelCount fixes each output; absent,
    // the 1-in/1-out node follows the input's computedNumberOfChannels
    // dynamically (initial count 1) and every other shape is mono outputs.
    if (outputChannelCount !== null) {
      this.#dynamicOutput = false
      this.#outputChannelCounts = outputChannelCount.slice()
    } else if (numberOfInputs === 1 && numberOfOutputs === 1) {
      this.#dynamicOutput = true
      this.#outputChannelCounts = [1]
    } else {
      this.#dynamicOutput = false
      this.#outputChannelCounts = new Array(numberOfOutputs).fill(1)
    }

    // ---- AudioParamMap from the registered descriptors ----
    this.#paramMap = new Map()
    for (const d of descriptors) {
      this.#paramMap.set(
        d.name,
        new PlecoAudioParam({
          defaultValue: d.defaultValue,
          minValue: d.minValue,
          maxValue: d.maxValue,
          automationRate: d.automationRate,
          context,
        }),
      )
    }
    if (opts.parameterData !== undefined) {
      // Spec: parameterData sets the matching params' value ATTRIBUTE;
      // entries naming no descriptor are skipped (spec algorithm).
      for (const [k, v] of Object.entries(opts.parameterData)) {
        const param = this.#paramMap.get(k)
        if (param !== undefined) param.value = v
      }
    }
    this.#parameters = new PlecoAudioParamMap(this.#paramMap)

    // ---- Entangled node ↔ processor MessagePorts (the host's MessageChannel) ----
    const channel = new MessageChannel()
    this.#port = channel.port1

    // ---- The converted options dictionary, StructuredSerialize'd for the
    // processor (spec steps 9–10 — synchronous, so a non-cloneable
    // processorOptions throws DataCloneError from THIS constructor). ----
    const optionsObject = { numberOfInputs, numberOfOutputs }
    if (outputChannelCount !== null) optionsObject.outputChannelCount = outputChannelCount.slice()
    if (opts.parameterData !== undefined) optionsObject.parameterData = opts.parameterData
    if (opts.processorOptions !== undefined) optionsObject.processorOptions = opts.processorOptions
    if (opts.channelCount !== undefined) optionsObject.channelCount = opts.channelCount
    if (opts.channelCountMode !== undefined) optionsObject.channelCountMode = channelCountMode
    if (opts.channelInterpretation !== undefined) optionsObject.channelInterpretation = channelInterpretation
    const clonedOptions = structuredClone(optionsObject)

    // ---- Construct the processor (single-thread control-message analogue) ----
    const ProcessorCtor = worklet._globalScope._processorCtorMap.get(name)
    _setPendingProcessorConstructionData({ port: channel.port2 })
    try {
      this.#processor = new ProcessorCtor(clonedOptions)
    } catch (err) {
      // Spec: constructor exceptions fire processorerror at the node; the
      // node itself is created, born dead.
      this.#fail(err)
    } finally {
      _clearPendingProcessorConstructionData()
    }

    // A live worklet node processes every quantum regardless of connectivity
    // (the active-source contract) — register as a context tail node.
    if (!this.#dead) context._tailNodes.add(this)
  }

  /** Readonly. The node's AudioParamMap built from the registered parameterDescriptors. */
  get parameters() {
    return this.#parameters
  }

  /** Readonly. The node-side MessagePort paired with the processor's port. */
  get port() {
    return this.#port
  }

  /**
   * `onprocessorerror` event-handler IDL attribute (event type
   * `processorerror`), the house handler pattern: assigning subscribes,
   * reassigning replaces, null (or any non-function) unsubscribes.
   */
  get onprocessorerror() {
    return this.#onprocessorerror
  }

  set onprocessorerror(fn) {
    if (this.#onprocessorerror !== null) this.removeEventListener('processorerror', this.#onprocessorerror)
    this.#onprocessorerror = typeof fn === 'function' ? fn : null
    if (this.#onprocessorerror !== null) this.addEventListener('processorerror', this.#onprocessorerror)
  }

  /**
   * The processorerror-then-silence path (spec abrupt-completion steps):
   * [[callable process]] and active source both false forever, deregister
   * from the tail set, and fire `processorerror` (an ErrorEvent — the
   * PlecoErrorEvent shim) EXACTLY ONCE, queued as a microtask (the queued
   * control-thread task analogue — never synchronously inside the pull).
   */
  #fail(err) {
    if (this.#dead) return
    this.#dead = true
    this.#activeSource = false
    this.context._tailNodes.delete(this)
    queueMicrotask(() =>
      this.dispatchEvent(
        new PlecoErrorEvent('processorerror', {
          message: err instanceof Error ? err.message : String(err),
          error: err,
        }),
      ),
    )
  }

  /**
   * Capture per-input liveness BEFORE the input ports are pulled: pulling
   * ticks the sources, and a source ending DURING this quantum must still
   * present its final block's channels to process(). An input is live when
   * it has a connection whose owning node has not ended.
   */
  _prepareQuantum() {
    this.#inputLive = this._inputs.map(
      (inp) => inp.connections.length > 0 && !inp.connections.every((out) => out.owner._ended === true),
    )
  }

  /** Fresh zero-filled output blocks for this quantum (dynamic single-output follows the live input's channels). */
  #makeOutputBuffers(inputBlocks) {
    const sr = this.context.sampleRate
    if (this.#dynamicOutput) {
      const ch = this.#inputLive[0] === true ? inputBlocks[0].numberOfChannels : 1
      return [createPlecoAudioBuffer(ch, RENDER_QUANTUM, sr)]
    }
    return this.#outputChannelCounts.map((c) => createPlecoAudioBuffer(c, RENDER_QUANTUM, sr))
  }

  /**
   * The frozen parameters argument: name → Float32Array of the param's
   * computedValue block. k-rate → always length 1; a-rate constant with no
   * input connection → length 1 (the spec's MAY); otherwise the full block.
   */
  #renderParameters() {
    const parameters = {}
    const now = this.context.currentTime
    for (const [name, param] of this.#paramMap) {
      const block = param.fillBlock(new Float32Array(RENDER_QUANTUM), now)
      if (param.automationRate === 'k-rate') {
        parameters[name] = new Float32Array([block[0]])
      } else if (param._input.connections.length === 0 && isConstantBlock(block)) {
        parameters[name] = new Float32Array([block[0]])
      } else {
        parameters[name] = block
      }
    }
    return Object.freeze(parameters)
  }

  /**
   * One render-quantum call into the author's process() (spec § rendering a
   * graph, step 5.4). Returns true when the outputs carry authored audio,
   * false when the error path zeroed them.
   */
  #invokeProcess(inputBlocks, outBlocks) {
    // inputs: input n is [] (zero channels) when nothing live feeds it.
    const inputs = inputBlocks.map((block, i) => {
      if (this.#inputLive[i] !== true) return Object.freeze([])
      const chans = []
      for (let c = 0; c < block.numberOfChannels; c++) chans.push(block.getChannelData(c))
      return Object.freeze(chans)
    })
    Object.freeze(inputs)
    // outputs: the author writes straight into the output blocks' channel data.
    const outputs = outBlocks.map((block) => {
      const chans = []
      for (let c = 0; c < block.numberOfChannels; c++) chans.push(block.getChannelData(c))
      return Object.freeze(chans)
    })
    Object.freeze(outputs)
    const parameters = this.#renderParameters()

    let result
    try {
      // Spec: Get(O, "process") FRESH each call, then IsCallable.
      const processFn = this.#processor.process
      if (typeof processFn !== 'function') {
        throw new TypeError(`PlecoAudioWorkletNode: the processor's 'process' property is not callable`)
      }
      result = processFn.call(this.#processor, inputs, outputs, parameters)
    } catch (err) {
      // Abrupt completion: silent output THIS quantum too — zero whatever
      // the author wrote before throwing.
      this.#fail(err)
      for (const block of outBlocks) {
        for (let c = 0; c < block.numberOfChannels; c++) block.getChannelData(c).fill(0)
      }
      return false
    }
    // Active source ← ToBoolean(callResult): no return value means false.
    this.#activeSource = Boolean(result)
    return true
  }

  /**
   * Per-quantum processing under the pull graph. The node processes when the
   * active source flag is set OR any input is live; otherwise (and forever
   * once dead) it outputs silence without invoking process(). Returns the
   * single output block directly, the per-output block array for multi-output
   * shapes (_tickOutput selects), or a placeholder silent block for
   * zero-output nodes (never consumed as audio — the node is ticked through
   * the tail set for its side effects).
   */
  _process(...inputBlocks) {
    const outBlocks = this.#makeOutputBuffers(inputBlocks)
    if (!this.#dead && (this.#activeSource || this.#inputLive.some((live) => live === true))) {
      this.#invokeProcess(inputBlocks, outBlocks)
    }
    if (this.numberOfOutputs === 1) return outBlocks[0]
    if (this.numberOfOutputs === 0) return createPlecoAudioBuffer(1, RENDER_QUANTUM, this.context.sampleRate)
    return outBlocks
  }

  /** Select this output's block from the memoized per-quantum set (splitter pattern for multi-output shapes). */
  _tickOutput(outputIndex) {
    const block = this._tick()
    if (Array.isArray(block)) return block[outputIndex]
    if (this.numberOfOutputs === 1) return block
    // Cycle-mute fallback: _tick() replaced the set with one silent block —
    // answer with shaped silence for this output.
    return createPlecoAudioBuffer(
      this.#outputChannelCounts[outputIndex] ?? 1,
      RENDER_QUANTUM,
      this.context.sampleRate,
    )
  }
}
