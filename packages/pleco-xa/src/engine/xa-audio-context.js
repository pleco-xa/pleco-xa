/**
 * engine/xa-audio-context.js — PlecoAudioContext (spec: AudioContext)
 * + PlecoAudioSinkInfo (spec: AudioSinkInfo)
 * + PlecoAudioPlaybackStats (spec: AudioPlaybackStats).
 *
 * The realtime driver: the same frame-counter engine as
 * PlecoOfflineAudioContext, paced not by an internal loop but by a SWAPPABLE
 * SINK ADAPTER (see xa-sink.js for the full contract). The context never
 * touches a timer — after resume() opens the sink, the sink calls pull()
 * whenever the device wants audio and the context renders exactly one
 * quantum per call. Because both drivers are pure functions of the frame
 * counter, a realtime context stepped N quanta produces bit-identical blocks
 * to an offline render of the same graph — the drop-in proof the tests pin.
 *
 * THE CONTROL-MESSAGE QUEUE: the spec runs lifecycle work as ordered control
 * messages on the rendering thread. Pleco keeps that shape single-threaded:
 * each lifecycle method runs its SYNCHRONOUS control-thread steps in the
 * call frame (closed-context guards, [[suspended by user]], the
 * masked-interruption uncover, the #controlState intent flip), then enqueues
 * its "control message" on an internal promise chain. Messages run strictly
 * in call order, so the returned promises settle in call order — the spec's
 * ordering guarantee without threads. The VISIBLE state attribute (and its
 * statechange event) flips inside the queued message, exactly like the
 * spec's queued media-element tasks.
 *
 * P21 spec surface (spec § The AudioContext Interface):
 * - constructor(contextOptions) with AudioContextOptions { latencyHint,
 *   sampleRate, sinkId, renderSizeHint } (validation below).
 * - baseLatency / outputLatency readonly attributes.
 * - resume() / suspend() / close() promise state machine, including the
 *   in-spec 'interrupted' AudioContextState (spec § Handling an interruption)
 *   via the host-facing _beginInterruption()/_endInterruption() primitives
 *   (underscore = pleco host API, excluded from the parity surface — the
 *   spec's trigger is the user agent, which headless pleco has no analogue
 *   for; the STATE VALUE and its transitions are fully in-spec).
 * - getOutputTimestamp() → AudioTimestamp { contextTime, performanceTime }
 *   correlated to the host high-resolution clock (performance.now()).
 * - sinkId attribute (cached-object rule) / setSinkId() / onsinkchange, with
 *   AudioSinkOptions { type } and AudioSinkInfo (AudioSinkType 'none').
 * - onerror + the spec's "Handling an error from System Audio Resources"
 *   steps, driven by the sink adapter's onError callback.
 * - playbackStats: AudioPlaybackStats (underrunDuration, underrunEvents,
 *   totalDuration, averageLatency, minimumLatency, maximumLatency,
 *   resetLatency(), toJSON()), fed by the sink's onUnderrun callback and a
 *   per-quantum latency sample.
 *
 * WebIDL rules kept (house rules): constructor-dictionary invalid enum →
 * TypeError; a null contextOptions is the empty dictionary; setSinkId is a
 * promise-returning method, so argument conversion errors surface as
 * TypeError REJECTIONS, never synchronous throws.
 *
 * Pleco strictness / documented divergences (no silent fallbacks):
 * - THE SINK IS INJECTED. AudioContextOptions grows one pleco extension
 *   member: `sink` — a sink adapter honoring the xa-sink.js contract, used
 *   for every device-bound output ('' or device-id sinkId). When the sink ID
 *   is AudioSinkOptions { type: 'none' } the context builds an internal
 *   PlecoNullSink instead (that IS the spec's 'none' semantics). Requesting
 *   device output with NO injected adapter throws NotSupportedError naming
 *   the missing adapter at construction (a browser would bind the default
 *   device here; pleco surfaces the gap instead of pretending — same rule as
 *   the P22 media-node shims). The real browser adapter is P23 scope.
 * - NOT ALLOWED TO START at construction: the spec lets a user agent gate
 *   the initial suspended→running transition on user activation, and pleco
 *   always gates — construction never auto-starts rendering; resume() is the
 *   explicit start. (This also keeps construction synchronous and pure.)
 *   Consequently [[sink ID]] first reflects the construction-time sinkId on
 *   the first successful resume(), per the spec's "start processing" steps.
 * - sampleRate defaults to 44100 Hz when unspecified (the spec consults the
 *   output device's preferred rate — device-preference is adapter scope, and
 *   a fixed documented default beats a hidden query).
 * - latencyHint: a double must be finite and >= 0, else TypeError (WebIDL
 *   would coerce). Pleco's deterministic interpretation ("at the browser's
 *   discretion" per spec): 'interactive' = 1 render quantum, 'balanced' = 2,
 *   'playback' = 4; a double is quantized UP to whole quanta (min 1). That
 *   quantum count / sampleRate is baseLatency.
 * - renderSizeHint: same rules and fixed-128 parity gap as
 *   PlecoOfflineAudioContext (invalid enum string → TypeError; non-integer
 *   number → TypeError; integer outside [1, 6·sampleRate] →
 *   NotSupportedError; spec-valid integer ≠ 128 → NotSupportedError naming
 *   the fixed-quantum limitation). 'hardware' resolves to 128.
 * - resume() failure (the sink adapter's open() throwing/rejecting) rejects
 *   with the adapter's error and reverts the control intent to 'suspended'
 *   (the spec leaves the control thread state dangling at 'running'; pleco
 *   keeps the slots coherent). EVERY such asynchronous revert (resume,
 *   setSinkId, _endInterruption, the sink-error handler) is guarded on the
 *   intent it is unwinding: a superseding close() wrote the terminal
 *   'closed', and closed contexts never revive.
 * - setSinkId on a closed context rejects InvalidStateError (the spec's
 *   algorithm is silent about closed contexts; implementations reject).
 * - setSinkId device-id validation: a non-empty device string is validated
 *   by the injected adapter's optional validateSinkId(id) → boolean; absent
 *   adapter (or false) → NotAllowedError rejection per spec. NotAllowedError
 *   is built locally pending an xa-errors.js factory (file owned elsewhere
 *   this slice — see integration notes).
 * - setSinkId on a non-running context records the new sink but defers
 *   resource acquisition to the next resume() (the spec acquires eagerly;
 *   observable surface — promise, sinkchange, state events — is identical).
 * - Events (statechange, sinkchange, error) dispatch SYNCHRONOUSLY inside
 *   the queued control message rather than via a further queued task (same
 *   collapse PlecoOfflineAudioContext documents); promise reactions still
 *   run after them, matching the spec's task-then-microtask ordering.
 * - The `error` Event dispatched for sink failures carries the underlying
 *   error as a non-spec `error` expando property (the spec fires a bare
 *   Event; dropping the cause would be a silent fallback).
 * - PlecoAudioPlaybackStats updates continuously; the spec's once-per-second
 *   refresh + visibility/microphone gating are browser privacy mitigations
 *   with no headless analogue (documented, not silently approximated).
 * - PlecoAudioSinkInfo / PlecoAudioPlaybackStats stay directly constructible
 *   for engine-internal composition (same documented deviation as
 *   PlecoAudioParam/PlecoAudioListener); the public surface only ever sees
 *   the context-vended instances.
 */
import { PlecoBaseContext } from './xa-base-context.js'
import { RENDER_QUANTUM } from './xa-constants.js'
import { PlecoAudioDestinationNode } from './nodes/xa-destination.js'
import { PlecoNullSink } from './xa-sink.js'
import { invalidStateError, invalidAccessError, notSupportedError } from './xa-errors.js'

/** The AudioContextLatencyCategory enum values (spec § AudioContextLatencyCategory). */
const LATENCY_CATEGORIES = ['balanced', 'interactive', 'playback']
/** Pleco's deterministic category → render-quantum-count mapping (documented in the header). */
const LATENCY_QUANTA = { interactive: 1, balanced: 2, playback: 4 }
/** The AudioContextRenderSizeCategory enum values — same as PlecoOfflineAudioContext. */
const RENDER_SIZE_CATEGORIES = ['default', 'hardware']
/** The AudioSinkType enum values (spec § AudioSinkType). */
const AUDIO_SINK_TYPES = ['none']

/**
 * DOMException named NotAllowedError — sink-identifier validation failure
 * (spec § Validating sinkId). Local pending an xa-errors.js factory: that
 * file is shared surface not owned by this slice.
 */
function notAllowedError(message) {
  return new DOMException(message, 'NotAllowedError')
}

/**
 * Spec AudioSinkInfo: information on the current audio output device, vended
 * ONLY through AudioContext.sinkId (cached — the attribute returns the same
 * object after caching, and setSinkId mutates the cached instance's type in
 * place per the spec's control-message steps).
 */
export class PlecoAudioSinkInfo {
  constructor(type) {
    if (!AUDIO_SINK_TYPES.includes(type)) {
      throw new TypeError(`PlecoAudioSinkInfo: type must be ${AUDIO_SINK_TYPES.join(' | ')}, got ${type}`)
    }
    this._type = type
  }

  /** Readonly. The AudioSinkType of the device. */
  get type() {
    return this._type
  }
}

/**
 * Spec AudioPlaybackStats: underrun + latency statistics for the context's
 * playback path. Exactly one instance per PlecoAudioContext ([[playback
 * stats]]), vended via context.playbackStats. Underruns arrive from the sink
 * adapter's onUnderrun(frames) callback; a latency sample is taken once per
 * rendered quantum from the live sink outputLatency.
 */
export class PlecoAudioPlaybackStats {
  #context
  #underrunDuration = 0
  #underrunEvents = 0
  #latencySum = 0
  #latencyCount = 0
  #minimumLatency = 0
  #maximumLatency = 0
  #lastLatency = null

  constructor(context) {
    this.#context = context
  }

  /** Readonly. Total duration (s) of all underrun events ([[underrun duration]]). */
  get underrunDuration() {
    return this.#underrunDuration
  }

  /** Readonly. Total number of underrun events ([[underrun events]]). */
  get underrunEvents() {
    return this.#underrunEvents
  }

  /** Readonly. [[total duration]] = [[underrun duration]] + currentTime (spec definition). */
  get totalDuration() {
    return this.#underrunDuration + this.#context.currentTime
  }

  /** Readonly. Average output latency (s) over the currently tracked interval. */
  get averageLatency() {
    return this.#latencyCount === 0 ? 0 : this.#latencySum / this.#latencyCount
  }

  /** Readonly. Minimum output latency (s) over the currently tracked interval. */
  get minimumLatency() {
    return this.#minimumLatency
  }

  /** Readonly. Maximum output latency (s) over the currently tracked interval. */
  get maximumLatency() {
    return this.#maximumLatency
  }

  /**
   * Spec resetLatency(): restart the tracked interval at the current time,
   * seeding average/minimum/maximum with the latency of the last played
   * frame (0 if none has played yet).
   */
  resetLatency() {
    const current = this.#lastLatency ?? 0
    this.#latencySum = current
    this.#latencyCount = 1
    this.#minimumLatency = current
    this.#maximumLatency = current
  }

  /** Spec [Default] toJSON(): the six stat attributes as a plain object. */
  toJSON() {
    return {
      underrunDuration: this.underrunDuration,
      underrunEvents: this.underrunEvents,
      totalDuration: this.totalDuration,
      averageLatency: this.averageLatency,
      minimumLatency: this.minimumLatency,
      maximumLatency: this.maximumLatency,
    }
  }

  /** Engine-internal: one latency sample per rendered quantum (from the sink). */
  _recordLatency(seconds) {
    if (this.#latencyCount === 0) {
      this.#minimumLatency = seconds
      this.#maximumLatency = seconds
    } else {
      if (seconds < this.#minimumLatency) this.#minimumLatency = seconds
      if (seconds > this.#maximumLatency) this.#maximumLatency = seconds
    }
    this.#latencySum += seconds
    this.#latencyCount += 1
    this.#lastLatency = seconds
  }

  /** Engine-internal: one underrun EVENT of `frames` sample-frames (from the sink). */
  _recordUnderrun(frames) {
    this.#underrunDuration += frames / this.#context.sampleRate
    this.#underrunEvents += 1
  }
}

export class PlecoAudioContext extends PlecoBaseContext {
  /** The number of render quanta of internal latency (drives baseLatency). */
  #latencyQuanta
  /** The injected device-bound sink adapter, or null when none was provided. */
  #deviceSink
  /** Lazily-built internal PlecoNullSink for AudioSinkType 'none'. */
  #nullSink = null
  /** The adapter currently opened (null while no resources are acquired). */
  #activeSink = null
  /** [[sink ID]] — '' or the cached PlecoAudioSinkInfo (visible attribute). */
  #sinkIdSlot = ''
  /** [[sink ID at construction]] — applied to [[sink ID]] on first start. */
  #sinkIdAtConstruction = ''
  /** True once [[sink ID]] is authoritative: after the first start ("start
   *  processing" promotes [[sink ID at construction]]) or the first
   *  setSinkId() (which writes [[sink ID]] directly per spec). */
  #sinkIdEstablished = false
  /** [[control thread state]] — flipped SYNCHRONOUSLY in method preludes.
   *  The visible state attribute (base _state) flips in the queued message;
   *  the two diverge only mid-queue and during a masked interruption. */
  #controlState = 'suspended'
  /** [[state before interruption]]. */
  #stateBeforeInterruption = null
  /** [[suspended by user]]. */
  #suspendedByUser = false
  /** [[playback stats]]. */
  #playbackStats
  /** True once the first quantum has been rendered (getOutputTimestamp zeros rule). */
  #renderedAnyBlock = false
  /** The control-message queue: lifecycle ops run strictly in call order. */
  #opQueue = Promise.resolve()
  #onsinkchange = null
  #onerror = null

  /**
   * new PlecoAudioContext(contextOptions) — AudioContextOptions plus the
   * pleco `sink` adapter extension (see the file header). `null` and
   * `undefined` are the empty dictionary.
   */
  constructor(contextOptions = {}) {
    if (contextOptions === null) contextOptions = {}
    if (typeof contextOptions !== 'object') {
      throw new TypeError(
        `PlecoAudioContext: contextOptions must be an AudioContextOptions dictionary, got ${contextOptions}`,
      )
    }
    const {
      latencyHint = 'interactive',
      sampleRate = 44100,
      sinkId = '',
      renderSizeHint = 'default',
      sink = null,
    } = contextOptions

    // latencyHint: AudioContextLatencyCategory or double (ctor-dict rules).
    let latencyQuanta
    if (typeof latencyHint === 'string') {
      if (!LATENCY_CATEGORIES.includes(latencyHint)) {
        throw new TypeError(
          `PlecoAudioContext: latencyHint must be ${LATENCY_CATEGORIES.join(' | ')} or a double, got '${latencyHint}'`,
        )
      }
      latencyQuanta = LATENCY_QUANTA[latencyHint]
    } else if (typeof latencyHint === 'number') {
      if (!Number.isFinite(latencyHint) || latencyHint < 0) {
        throw new TypeError(
          `PlecoAudioContext: a double latencyHint must be finite and non-negative, got ${latencyHint}`,
        )
      }
      // Quantize UP to whole render quanta, minimum one (documented pleco interpretation).
      latencyQuanta = Math.max(1, Math.ceil((latencyHint * sampleRate) / RENDER_QUANTUM))
    } else {
      throw new TypeError(
        `PlecoAudioContext: latencyHint must be ${LATENCY_CATEGORIES.join(' | ')} or a double, got ${latencyHint}`,
      )
    }

    // sinkId: DOMString or AudioSinkOptions { required AudioSinkType type }.
    let sinkDescriptor // '' | device-id string | PlecoAudioSinkInfo
    if (typeof sinkId === 'string') {
      sinkDescriptor = sinkId
    } else if (typeof sinkId === 'object' && sinkId !== null) {
      if (!AUDIO_SINK_TYPES.includes(sinkId.type)) {
        throw new TypeError(
          `PlecoAudioContext: AudioSinkOptions.type is required and must be ${AUDIO_SINK_TYPES.join(' | ')}, got ${sinkId.type}`,
        )
      }
      sinkDescriptor = new PlecoAudioSinkInfo(sinkId.type)
    } else {
      throw new TypeError(`PlecoAudioContext: sinkId must be a DOMString or AudioSinkOptions, got ${sinkId}`)
    }

    // The pleco sink-adapter extension: shape-check up front, loudly.
    if (
      sink !== null &&
      (typeof sink !== 'object' || typeof sink.open !== 'function' || typeof sink.close !== 'function')
    ) {
      throw new TypeError(
        'PlecoAudioContext: options.sink must be a sink adapter with open() and close() (see engine/xa-sink.js)',
      )
    }

    // Validates sampleRate (NotSupportedError outside [3000, 768000]) and
    // builds the offline-shaped destination this constructor replaces below.
    super({ sampleRate, numberOfChannels: 2 })

    // renderSizeHint — validated in spec order AFTER sampleRate, same rules
    // and fixed-quantum parity gap as PlecoOfflineAudioContext.
    if (typeof renderSizeHint === 'string') {
      if (!RENDER_SIZE_CATEGORIES.includes(renderSizeHint)) {
        throw new TypeError(
          `PlecoAudioContext: renderSizeHint must be ${RENDER_SIZE_CATEGORIES.join(' | ')} or an integer, got '${renderSizeHint}'`,
        )
      }
      // 'default' and 'hardware' both resolve to the engine's fixed 128-frame quantum.
    } else if (typeof renderSizeHint === 'number') {
      if (!Number.isInteger(renderSizeHint)) {
        throw new TypeError(`PlecoAudioContext: an integer renderSizeHint must be an integer, got ${renderSizeHint}`)
      }
      const maxQuantum = Math.floor(6 * this.sampleRate)
      if (renderSizeHint < 1 || renderSizeHint > maxQuantum) {
        throw notSupportedError(
          `PlecoAudioContext: renderSizeHint must be in [1, ${maxQuantum}] (6·sampleRate), got ${renderSizeHint}`,
        )
      }
      if (renderSizeHint !== RENDER_QUANTUM) {
        throw notSupportedError(
          `PlecoAudioContext: pleco's render quantum is fixed at ${RENDER_QUANTUM} frames (configurable renderSizeHint is a documented parity gap), got ${renderSizeHint}`,
        )
      }
    } else {
      throw new TypeError(
        `PlecoAudioContext: renderSizeHint must be ${RENDER_SIZE_CATEGORIES.join(' | ')} or an integer, got ${renderSizeHint}`,
      )
    }

    this.#latencyQuanta = latencyQuanta
    this.#deviceSink = sink
    this.#sinkIdAtConstruction = sinkDescriptor

    // No silent fallback: device-bound output ('' or a device id) with no
    // injected adapter cannot exist headless — surface it at construction.
    const constructionAdapter = this.#adapterFor(sinkDescriptor)

    // Replace the base's offline-shaped destination with the realtime one:
    // mutable channel config, hardware ceiling from the sink adapter
    // (spec § AudioDestinationNode: realtime maxChannelCount is the device's).
    const maxChannelCount = constructionAdapter.maxChannelCount ?? 2
    this._destination = new PlecoAudioDestinationNode(this, {
      channelCount: Math.min(2, maxChannelCount),
      maxChannelCount,
      immutable: false,
    })

    this.#playbackStats = new PlecoAudioPlaybackStats(this)
  }

  // ── Internal plumbing ─────────────────────────────────────────────────────

  /** Enqueue a control message; the chain survives rejections, promises settle in call order. */
  #enqueue(message) {
    const run = this.#opQueue.then(message)
    this.#opQueue = run.then(
      () => undefined,
      () => undefined,
    )
    return run
  }

  /** Resolve a sink descriptor ('' | device-id | AudioSinkInfo) to its adapter. */
  #adapterFor(descriptor) {
    if (descriptor instanceof PlecoAudioSinkInfo) {
      // AudioSinkType 'none': the internal null sink IS the spec semantics.
      if (this.#nullSink === null) this.#nullSink = new PlecoNullSink()
      return this.#nullSink
    }
    if (this.#deviceSink === null) {
      throw notSupportedError(
        `PlecoAudioContext: sinkId '${descriptor}' needs a device-bound output, but no sink adapter was injected ` +
          "(pass options.sink, or sinkId: { type: 'none' } for deviceless rendering — see engine/xa-sink.js)",
      )
    }
    return this.#deviceSink
  }

  /** The current sink target: [[sink ID]] once established, else the construction-time request. */
  #currentDescriptor() {
    return this.#sinkIdEstablished ? this.#sinkIdSlot : this.#sinkIdAtConstruction
  }

  /** The sink-format handed to adapter.open() for `descriptor`. */
  #formatFor(descriptor) {
    return {
      sampleRate: this.sampleRate,
      numberOfChannels: this._destination.channelCount,
      renderQuantumSize: RENDER_QUANTUM,
      sinkId: typeof descriptor === 'string' ? descriptor : '',
    }
  }

  /** The callbacks handed to adapter.open() — the pacing seam (see xa-sink.js). */
  #callbacks() {
    return {
      pull: () => this.#pull(),
      onUnderrun: (frames) => this.#playbackStats._recordUnderrun(frames),
      onError: (error) => this.#handleSinkError(error),
    }
  }

  /**
   * One cadence cycle, invoked BY the sink: render exactly one quantum and
   * hand back its channel data, or answer null while not running (the sink
   * outputs silence). Also samples the live output latency into
   * playbackStats — pleco's continuous analogue of the spec's stat refresh.
   */
  #pull() {
    if (this.state !== 'running') return null
    const block = this.renderQuantum()
    this.#renderedAnyBlock = true
    this.#playbackStats._recordLatency(this.outputLatency)
    const channels = []
    for (let c = 0; c < block.numberOfChannels; c++) channels.push(block.getChannelData(c))
    return channels
  }

  /** Acquire system resources: open the adapter for the CURRENT sink target. */
  async #acquire() {
    const descriptor = this.#currentDescriptor()
    const adapter = this.#adapterFor(descriptor)
    if (this.#activeSink === adapter) return
    await adapter.open(this.#formatFor(descriptor), this.#callbacks())
    this.#activeSink = adapter
    if (!this.#sinkIdEstablished) {
      // Spec "start processing": [[sink ID]] ← [[sink ID at construction]].
      this.#sinkIdEstablished = true
      this.#sinkIdSlot = this.#sinkIdAtConstruction
    }
  }

  /** Release system resources: close whatever adapter is open. Idempotent. */
  async #release() {
    const adapter = this.#activeSink
    this.#activeSink = null
    if (adapter !== null) await adapter.close()
  }

  /**
   * Spec § Handling an error from System Audio Resources, driven by the sink
   * adapter's onError callback: while running/interrupted → release, flip to
   * 'suspended' and fire `error` then `statechange`; while suspended → fire
   * `error` only. Runs immediately (the reporting sink is the pacing thread).
   */
  #handleSinkError(error) {
    const event = new Event('error')
    // Documented pleco extension: keep the cause (a bare Event would drop it).
    event.error = error
    if (this.state === 'running' || this.state === 'interrupted') {
      void this.#release()
      this.dispatchEvent(event)
      this.#suspendedByUser = false
      // Guarded revert: a close() whose control message is still queued has
      // already made the control state terminal — 'closed' is forever, the
      // sink failure must not resurrect the context as suspendable.
      if (this.#controlState !== 'closed') this.#controlState = 'suspended'
      this.#stateBeforeInterruption = null
      this._setState('suspended')
      return
    }
    if (this.state === 'suspended') {
      this.dispatchEvent(event)
    }
  }

  // ── Attributes ────────────────────────────────────────────────────────────

  /**
   * Readonly. Seconds of processing latency between the destination and the
   * audio subsystem — pleco's deterministic latencyHint mapping (header).
   */
  get baseLatency() {
    return (this.#latencyQuanta * RENDER_QUANTUM) / this.sampleRate
  }

  /**
   * Readonly. The current output-device latency estimate, read live from the
   * sink adapter that services the current sink target (0 for 'none').
   */
  get outputLatency() {
    return this.#adapterFor(this.#currentDescriptor()).outputLatency ?? 0
  }

  /** Readonly. [[sink ID]]: '' or the cached PlecoAudioSinkInfo (same object after caching). */
  get sinkId() {
    return this.#sinkIdSlot
  }

  /** Spec [SameObject] playbackStats — the [[playback stats]] slot. */
  get playbackStats() {
    return this.#playbackStats
  }

  /** `onsinkchange` event-handler IDL attribute (event type `sinkchange`). */
  get onsinkchange() {
    return this.#onsinkchange
  }

  set onsinkchange(fn) {
    if (this.#onsinkchange !== null) this.removeEventListener('sinkchange', this.#onsinkchange)
    this.#onsinkchange = typeof fn === 'function' ? fn : null
    if (this.#onsinkchange !== null) this.addEventListener('sinkchange', this.#onsinkchange)
  }

  /** `onerror` event-handler IDL attribute (event type `error`). */
  get onerror() {
    return this.#onerror
  }

  set onerror(fn) {
    if (this.#onerror !== null) this.removeEventListener('error', this.#onerror)
    this.#onerror = typeof fn === 'function' ? fn : null
    if (this.#onerror !== null) this.addEventListener('error', this.#onerror)
  }

  // ── Methods ───────────────────────────────────────────────────────────────

  /**
   * Spec getOutputTimestamp() → AudioTimestamp { contextTime,
   * performanceTime }. Both members are zero until the first block renders.
   * After that, contextTime is the frame the output DEVICE is playing now —
   * currentTime minus the total pipeline latency (baseLatency +
   * outputLatency), clamped at 0 — so currentTime always exceeds it (spec
   * invariant). performanceTime correlates that frame to the host
   * high-resolution clock: performance.now() for a frame playing now, offset
   * into the future while the pipeline is still priming (clamped case).
   */
  getOutputTimestamp() {
    if (!this.#renderedAnyBlock) return { contextTime: 0, performanceTime: 0 }
    const pipeline = this.baseLatency + this.outputLatency
    const contextTime = Math.max(0, this.currentTime - pipeline)
    const primingOffset = Math.max(0, pipeline - this.currentTime)
    return { contextTime, performanceTime: performance.now() + primingOffset * 1000 }
  }

  /**
   * Spec resume() → Promise<undefined>: acquire the sink and move to
   * 'running'. Rejects InvalidStateError when closed, and — per the spec's
   * interruption steps — when a masked interruption (one that began while
   * suspended) is uncovered: the state attribute then flips to 'interrupted'
   * with a statechange before the rejection. resume() during a VISIBLE
   * interruption is NOT the masked case (spec step 5 requires the state
   * attribute to read 'suspended'): it proceeds and attempts to take the
   * output back. Pleco is "allowed to start" exactly when resume() is
   * called — the explicit start gate (header). Acquisition failure rejects
   * with the adapter's error.
   */
  resume() {
    // Synchronous control-thread steps.
    if (this.#controlState === 'closed') {
      return Promise.reject(invalidStateError('PlecoAudioContext.resume: the context is closed'))
    }
    this.#suspendedByUser = false
    if (this.state === 'suspended' && this.#controlState === 'interrupted') {
      // Uncover a masked interruption: make it visible, record the run
      // intent for _endInterruption, refuse to resume during it.
      this.#stateBeforeInterruption = 'running'
      this._setState('interrupted')
      return Promise.reject(invalidStateError('PlecoAudioContext.resume: the context is interrupted'))
    }
    this.#controlState = 'running'
    // The control message.
    return this.#enqueue(async () => {
      if (this.state === 'running') return
      try {
        await this.#acquire()
      } catch (err) {
        // Guarded revert: only unwind the 'running' intent THIS call set. A
        // superseding close() (or suspend()) already rewrote the control
        // state — 'closed' is terminal and must never be clobbered back to
        // 'suspended' (a closed context could otherwise be revived).
        if (this.#controlState === 'running') this.#controlState = 'suspended'
        throw err
      }
      this._setState('running')
    })
  }

  /**
   * Spec suspend() → Promise<undefined>: release the sink and move to
   * 'suspended'. Resolves with no other effect when already suspended;
   * rejects InvalidStateError when closed. Suspending during an interruption
   * records 'suspended' as the state to restore afterwards (and ends the
   * masked/visible distinction: the context is user-suspended now).
   */
  suspend() {
    if (this.#controlState === 'closed') {
      return Promise.reject(invalidStateError('PlecoAudioContext.suspend: the context is closed'))
    }
    this.#suspendedByUser = true
    if (this.#controlState === 'interrupted') {
      this.#stateBeforeInterruption = 'suspended'
    }
    this.#controlState = 'suspended'
    return this.#enqueue(async () => {
      await this.#release()
      this._setState('suspended')
    })
  }

  /**
   * Spec close() → Promise<undefined>: release the sink and move to
   * 'closed' (statechange fires; currentTime stops advancing because the
   * pull answers null). A second close() rejects InvalidStateError per the
   * spec's control-thread step 3.
   */
  close() {
    if (this.#controlState === 'closed') {
      return Promise.reject(invalidStateError('PlecoAudioContext.close: the context is already closed'))
    }
    this.#controlState = 'closed'
    this.#stateBeforeInterruption = null
    return this.#enqueue(async () => {
      await this.#release()
      this._setState('closed')
    })
  }

  /**
   * Spec setSinkId((DOMString or AudioSinkOptions) sinkId) → Promise.
   * Promise-returning method: conversion/validation failures are REJECTIONS
   * (TypeError for a malformed argument or invalid enum, NotAllowedError for
   * a device id that cannot be validated, InvalidAccessError when acquiring
   * the new sink fails, InvalidStateError on a closed context). Equal-value
   * calls resolve with no sinkchange — compared BOTH before enqueueing AND
   * again at message-run time (the spec's control-message steps 3–4), so
   * back-to-back equal calls collapse to one swap. Ordering while running, per the spec's
   * control-message steps: statechange('suspended') → acquire →
   * sinkchange → statechange('running'), with the promise reaction after all
   * three (events dispatch synchronously inside the control message).
   */
  setSinkId(sinkId) {
    // Argument conversion (WebIDL union) — TypeError rejections.
    let target // '' | device-id string | 'none' (an AudioSinkOptions.type)
    let isOptions = false
    if (typeof sinkId === 'string') {
      target = sinkId
    } else if (typeof sinkId === 'object' && sinkId !== null) {
      if (!AUDIO_SINK_TYPES.includes(sinkId.type)) {
        return Promise.reject(
          new TypeError(
            `PlecoAudioContext.setSinkId: AudioSinkOptions.type is required and must be ${AUDIO_SINK_TYPES.join(' | ')}, got ${sinkId.type}`,
          ),
        )
      }
      target = sinkId.type
      isOptions = true
    } else {
      return Promise.reject(
        new TypeError(`PlecoAudioContext.setSinkId: sinkId must be a DOMString or AudioSinkOptions, got ${sinkId}`),
      )
    }
    // Documented divergence: the spec's algorithm never checks closed;
    // implementations (and pleco) reject rather than acquire for a dead context.
    if (this.#controlState === 'closed') {
      return Promise.reject(invalidStateError('PlecoAudioContext.setSinkId: the context is closed'))
    }
    // Equality short-circuit (spec step 2): resolve immediately, no sinkchange.
    if (!isOptions && typeof this.#sinkIdSlot === 'string' && this.#sinkIdSlot === target) {
      return Promise.resolve()
    }
    if (isOptions && this.#sinkIdSlot instanceof PlecoAudioSinkInfo && this.#sinkIdSlot.type === target) {
      return Promise.resolve()
    }
    // Sink identifier validation (spec § Validating sinkId) → NotAllowedError.
    if (!isOptions && target !== '') {
      if (this.#deviceSink === null) {
        return Promise.reject(
          notAllowedError(
            `PlecoAudioContext.setSinkId: device id '${target}' cannot be validated — no sink adapter was injected`,
          ),
        )
      }
      if (typeof this.#deviceSink.validateSinkId === 'function' && this.#deviceSink.validateSinkId(target) !== true) {
        return Promise.reject(
          notAllowedError(
            `PlecoAudioContext.setSinkId: device id '${target}' did not validate against the sink adapter`,
          ),
        )
      }
    }
    if (!isOptions && target === '' && this.#deviceSink === null) {
      // '' = default DEVICE: same missing-adapter rule as construction.
      return Promise.reject(
        notSupportedError(
          "PlecoAudioContext.setSinkId: sinkId '' needs a device-bound output, but no sink adapter was injected " +
            '(pass options.sink at construction — see engine/xa-sink.js)',
        ),
      )
    }

    // The control message.
    return this.#enqueue(async () => {
      // Spec "run a control message for setSinkId" steps 3–4: repeat the
      // equality comparison against [[sink ID]] AT MESSAGE-RUN TIME — an
      // earlier queued setSinkId may already have made this call's target
      // current. Equal means resolve with no events (no release/acquire, no
      // sinkchange, no statechange bracket).
      if (!isOptions && typeof this.#sinkIdSlot === 'string' && this.#sinkIdSlot === target) return
      if (isOptions && this.#sinkIdSlot instanceof PlecoAudioSinkInfo && this.#sinkIdSlot.type === target) return
      const descriptor = isOptions
        ? this.#sinkIdSlot instanceof PlecoAudioSinkInfo
          ? this.#sinkIdSlot // cached-object rule: mutated in place below
          : new PlecoAudioSinkInfo(target)
        : target
      const wasRunning = this.state === 'running'
      // Pause the renderer + release the current sink (spec control-message steps).
      await this.#release()
      if (wasRunning) this._setState('suspended')
      // Acquire the new sink eagerly only when we were rendering; otherwise
      // the next resume() acquires (documented divergence in the header).
      if (wasRunning) {
        const adapter = this.#adapterFor(descriptor)
        try {
          await adapter.open(this.#formatFor(descriptor), this.#callbacks())
        } catch (err) {
          // Guarded revert: keep the slots coherent with the visible
          // 'suspended' UNLESS a superseding close() made the control state
          // terminal — 'closed' is forever.
          if (this.#controlState !== 'closed') this.#controlState = 'suspended'
          throw invalidAccessError(
            `PlecoAudioContext.setSinkId: acquiring the new sink failed — ${err && err.message ? err.message : err}`,
          )
        }
        this.#activeSink = adapter
      }
      // Update [[sink ID]] (mutating the cached AudioSinkInfo when both are info objects).
      if (isOptions && this.#sinkIdSlot instanceof PlecoAudioSinkInfo) {
        this.#sinkIdSlot._type = target
      } else {
        this.#sinkIdSlot = descriptor
      }
      this.#sinkIdEstablished = true
      this.dispatchEvent(new Event('sinkchange'))
      if (wasRunning) this._setState('running')
    })
  }

  // ── Host-facing interruption primitives (pleco host API — see header) ─────

  /**
   * Spec § Handling an interruption, begin: while running → release the
   * sink, remember 'running', flip to 'interrupted' (statechange); while
   * suspended → remember 'suspended' and mark the control state interrupted
   * WITHOUT touching the visible attribute or firing statechange (the
   * spec's privacy rule — a masked interruption). No-op while closed or
   * already interrupted.
   */
  _beginInterruption() {
    if (this.#controlState === 'closed' || this.#controlState === 'interrupted') {
      return Promise.resolve()
    }
    const before = this.#controlState // 'running' | 'suspended'
    this.#stateBeforeInterruption = before
    this.#controlState = 'interrupted'
    return this.#enqueue(async () => {
      if (before === 'running') {
        await this.#release()
        this._setState('interrupted')
      }
      // masked (suspended) interruption: no release needed, no event.
    })
  }

  /**
   * Spec § Handling an interruption, end: restore [[state before
   * interruption]] — reacquire and run (statechange) when it is 'running'
   * (including the case where resume() during the interruption recorded the
   * run intent); return to 'suspended' otherwise (statechange only if the
   * visible attribute actually changes). No-op unless currently interrupted.
   */
  _endInterruption() {
    if (this.#controlState !== 'interrupted') return Promise.resolve()
    const restore = this.#stateBeforeInterruption ?? 'suspended'
    this.#stateBeforeInterruption = null
    this.#controlState = restore
    return this.#enqueue(async () => {
      if (restore === 'running') {
        try {
          await this.#acquire()
        } catch (err) {
          // Guarded revert: only unwind the 'running' intent THIS call
          // restored — never a superseding close()'s terminal 'closed'.
          if (this.#controlState === 'running') this.#controlState = 'suspended'
          throw err
        }
        this._setState('running')
        return
      }
      this._setState('suspended')
    })
  }

  /**
   * INTERNAL ENGINE API (excluded from the parity surface): the currently
   * targeted sink adapter — lets hosts/tests drive a context that switched
   * to the internal 'none' sink (PlecoNullSink.step) and inspect the seam.
   */
  get _sink() {
    return this.#adapterFor(this.#currentDescriptor())
  }
}
