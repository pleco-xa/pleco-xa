/**
 * engine/xa-sink.js — THE SINK ADAPTER CONTRACT + PlecoNullSink + PlecoMockSink (P21).
 *
 * Pleco replaces Web Audio wholesale; the ONE thing it cannot replace is the
 * physical audio output. That irreducible seam is expressed as an injectable
 * SINK ADAPTER that PlecoAudioContext drives. Everything on the context side
 * of the seam (graph, clock, state machine, stats) is pure and headless; the
 * adapter owns the device. A later browser-session deliverable (P23 scope)
 * ships the REAL WebAudio/hardware adapter — because this contract is honored
 * by the NullSink and MockSink below and tested end-to-end against them, that
 * real adapter is a drop-in: no context code changes.
 *
 * ─────────────────────────────────────────────────────────────────────────────
 * THE SINK ADAPTER CONTRACT (normative for pleco adapters)
 * ─────────────────────────────────────────────────────────────────────────────
 * A sink adapter is any object with this surface:
 *
 *   open(format, callbacks) → undefined | Promise<undefined>
 *     Acquire the physical output resource ("acquire system resources" in
 *     spec terms). Throwing synchronously or rejecting IS the acquisition-
 *     failure signal — the context maps it onto the spec's failure paths
 *     (resume() rejection; InvalidAccessError during setSinkId()). Arguments:
 *       format = {
 *         sampleRate,         // context rate, Hz (device must resample if ≠)
 *         numberOfChannels,   // destination.channelCount AT open() time — a
 *                             //   SNAPSHOT, not a bound (see CHANNEL-COUNT
 *                             //   RENEGOTIATION below)
 *         renderQuantumSize,  // frames per pulled block (pleco: 128)
 *         sinkId,             // '' = default device, or a device-id string —
 *       }                     //   device selection is ADAPTER scope
 *       callbacks = {
 *         pull(),             // see THE CADENCE below
 *         onUnderrun(frames), // see UNDERRUN REPORTING below
 *         onError(error),     // see FAILURE REPORTING below
 *       }
 *
 *   close() → undefined | Promise<undefined>
 *     Release the physical output resource ("release system resources").
 *     MUST be idempotent — the context may call it on an already-closed sink.
 *
 *   outputLatency → number (seconds, readable property)
 *     The device output-latency estimate: the interval between the adapter
 *     handing a block to the host system and its first sample being produced
 *     by the device. Read live by AudioContext.outputLatency,
 *     getOutputTimestamp() and the playbackStats latency tracker; MAY change
 *     while open.
 *
 *   maxChannelCount → integer ≥ 1 (readable property)
 *     The device channel ceiling, surfaced as
 *     AudioDestinationNode.maxChannelCount on the realtime destination.
 *
 *   validateSinkId(id) → boolean (OPTIONAL member)
 *     Device-identifier validation (spec § Validating sinkId), consulted by
 *     AudioContext.setSinkId() for every non-empty device-id string: any
 *     return other than `true` rejects that setSinkId() with NotAllowedError.
 *     PERMISSIVE DEFAULT, stated explicitly: when the adapter does not
 *     implement this member, EVERY device id validates — the context cannot
 *     enumerate devices, so id-vetting is adapter scope, and an adapter that
 *     can enumerate SHOULD implement it (the default is documented here
 *     precisely so its permissiveness is a contract choice, never a silent
 *     fallback).
 *
 * THE CADENCE — the architecture's load-bearing rule: after a successful
 * open(), the SINK owns the render pacing. Whenever the device (or synthetic
 * clock) needs audio, the sink calls callbacks.pull(). The context responds
 * by rendering EXACTLY ONE quantum and returning it as an Array<Float32Array>
 * (one element per channel, renderQuantumSize frames each), or null when the
 * context is not running — on null the sink outputs silence and may idle.
 * The context NEVER paces itself (no setInterval, no timers of any kind);
 * the sink's callback cadence — a hardware callback, an AudioWorklet
 * process() tick, or a manually-stepped test loop — IS the clock. That is
 * exactly what makes the realtime context's math identical to the offline
 * context's: both are frame-counter machines, only the pull pacing differs.
 *
 * BLOCK-BUFFER OWNERSHIP — the channel Float32Arrays returned by pull() are
 * FRESHLY ALLOCATED for that quantum and become the SINK'S property on
 * return: the engine never writes into, reads back, or re-vends a handed-out
 * block (each quantum's mix is summed into new buffers). Adapters may
 * therefore retain, transfer (e.g. postMessage to a cross-thread worklet
 * ring) or mutate pulled arrays indefinitely without copying. The guarantee
 * is one-directional: the sink owns what pull() returned, but MUST NOT
 * assume two pulls ever share storage.
 *
 * CHANNEL-COUNT RENEGOTIATION — format.numberOfChannels is the realtime
 * destination's channelCount at open() time only. That attribute is MUTABLE
 * while the sink is open (up to maxChannelCount), and the context does NOT
 * re-open the sink when it changes: each pulled block simply carries the
 * destination's channelCount at pull time, anywhere in
 * [1, maxChannelCount] regardless of the opened format. Adapters MUST size
 * per-block from the returned array's length, never from the snapshot.
 *
 * UNDERRUN REPORTING — when the device consumed frames the engine did not
 * provide in time, the sink calls callbacks.onUnderrun(frames) ONCE per
 * continuous gap (one spec "underrun event"), with `frames` = the length of
 * the gap in sample-frames. The context accounts it in AudioPlaybackStats.
 *
 * FAILURE REPORTING — a device malfunction or disconnection AFTER a
 * successful open() is reported via callbacks.onError(error). The context
 * runs the spec's "Handling an error from System Audio Resources" steps
 * (release, suspend, fire `error`). Failures DURING open() are signalled by
 * throwing/rejecting from open(), never via onError.
 *
 * ─────────────────────────────────────────────────────────────────────────────
 * SHIPPED ADAPTERS
 * ─────────────────────────────────────────────────────────────────────────────
 * PlecoNullSink — the spec's AudioSinkType 'none' ("processed without being
 *   played through an audio output device"). No device, no timers: it renders
 *   on a synthetic cadence driven MANUALLY via step(n) — deterministic and
 *   headless by construction. PlecoAudioContext builds one internally
 *   whenever the current sink ID is AudioSinkInfo { type: 'none' }.
 *
 * PlecoMockSink — the test double: a manually-stepped PlecoNullSink that
 *   additionally RECORDS every pulled block (deep copies), counts opens/
 *   closes/pulls, exposes a mutable outputLatency, and can inject the two
 *   asynchronous fault paths (simulateUnderrun / simulateError) plus an
 *   open()-failure (failOpen). Tests drive the whole realtime lifecycle
 *   through it, synchronously.
 */
import { invalidStateError } from './xa-errors.js'

/**
 * AudioSinkType 'none' adapter: renders on a manually-driven synthetic
 * cadence and discards the audio. Zero timers — call step(n) to advance.
 */
export class PlecoNullSink {
  /** AudioSinkType tag for this adapter. */
  get type() {
    return 'none'
  }

  /**
   * @param {object} [options]
   * @param {number} [options.maxChannelCount=2] — reported channel ceiling.
   * @param {number} [options.outputLatency=0] — reported device latency, s.
   */
  constructor({ maxChannelCount = 2, outputLatency = 0 } = {}) {
    if (!Number.isInteger(maxChannelCount) || maxChannelCount < 1) {
      throw new TypeError(`PlecoNullSink: maxChannelCount must be an integer >= 1, got ${maxChannelCount}`)
    }
    if (typeof outputLatency !== 'number' || !Number.isFinite(outputLatency) || outputLatency < 0) {
      throw new TypeError(`PlecoNullSink: outputLatency must be a finite number >= 0, got ${outputLatency}`)
    }
    this._maxChannelCount = maxChannelCount
    this._outputLatency = outputLatency
    this._format = null
    this._callbacks = null
  }

  get maxChannelCount() {
    return this._maxChannelCount
  }

  /** Mutable on the adapter (devices drift); the context reads it live. */
  get outputLatency() {
    return this._outputLatency
  }

  set outputLatency(seconds) {
    if (typeof seconds !== 'number' || !Number.isFinite(seconds) || seconds < 0) {
      throw new TypeError(`PlecoNullSink: outputLatency must be a finite number >= 0, got ${seconds}`)
    }
    this._outputLatency = seconds
  }

  /** True between a successful open() and the next close(). */
  get isOpen() {
    return this._callbacks !== null
  }

  /** Contract open(): a 'none' sink has no device — acquisition always succeeds. */
  open(format, callbacks) {
    this._format = format
    this._callbacks = callbacks
  }

  /** Contract close(): idempotent release. */
  close() {
    this._format = null
    this._callbacks = null
  }

  /**
   * The synthetic cadence: perform `n` pull cycles synchronously. Each cycle
   * calls callbacks.pull() once (rendering one quantum on the context) and
   * discards the block. Returns the number of NON-NULL blocks pulled (a
   * suspended context answers null — those cycles render nothing).
   */
  step(n = 1) {
    if (this._callbacks === null) {
      throw invalidStateError(`${this.constructor.name}.step: the sink is not open`)
    }
    if (!Number.isInteger(n) || n < 1) {
      throw new TypeError(`${this.constructor.name}.step: n must be an integer >= 1, got ${n}`)
    }
    let rendered = 0
    for (let i = 0; i < n; i++) {
      const block = this._callbacks.pull()
      if (block !== null) rendered += this._consume(block)
    }
    return rendered
  }

  /** Internal per-block hook — the null sink discards; PlecoMockSink records. Returns 1 when consumed. */
  _consume(_block) {
    return 1
  }
}

/**
 * The manually-stepped test adapter: PlecoNullSink + block recording + fault
 * injection. See the file header for the exact contract it exercises.
 */
export class PlecoMockSink extends PlecoNullSink {
  /**
   * @param {object} [options] — PlecoNullSink options, plus:
   * @param {boolean} [options.failOpen=false] — make open() throw (the
   *   resource-acquisition-failure path). One-shot per assignment: stays
   *   true until the test clears it.
   */
  constructor({ failOpen = false, ...rest } = {}) {
    super(rest)
    this.failOpen = failOpen === true
    /** Deep copies of every non-null pulled block: Array<Array<Float32Array>>. */
    this.blocks = []
    /** Every format object passed to open(), in order. */
    this.openFormats = []
    this.openCount = 0
    this.closeCount = 0
    this.pullCount = 0
  }

  get type() {
    return 'mock'
  }

  open(format, callbacks) {
    if (this.failOpen) {
      throw new Error('PlecoMockSink: simulated resource-acquisition failure (failOpen)')
    }
    this.openCount += 1
    this.openFormats.push(format)
    // pullCount tracks EVERY cadence cycle (null answers included); `blocks`
    // records only rendered ones (via _consume).
    super.open(format, {
      ...callbacks,
      pull: () => {
        this.pullCount += 1
        return callbacks.pull()
      },
    })
  }

  close() {
    // Count only real releases so tests can assert idempotence cheaply.
    if (this.isOpen) this.closeCount += 1
    super.close()
  }

  _consume(block) {
    this.blocks.push(block.map((ch) => ch.slice()))
    return 1
  }

  /** Inject one spec "underrun event" of `frames` sample-frames. */
  simulateUnderrun(frames) {
    if (this._callbacks === null) {
      throw invalidStateError('PlecoMockSink.simulateUnderrun: the sink is not open')
    }
    if (!Number.isInteger(frames) || frames < 1) {
      throw new TypeError(`PlecoMockSink.simulateUnderrun: frames must be an integer >= 1, got ${frames}`)
    }
    this._callbacks.onUnderrun(frames)
  }

  /** Inject a post-open device failure (the callbacks.onError contract path). */
  simulateError(error) {
    if (this._callbacks === null) {
      throw invalidStateError('PlecoMockSink.simulateError: the sink is not open')
    }
    this._callbacks.onError(error)
  }
}
