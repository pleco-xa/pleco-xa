/**
 * engine/adapters/xa-browser-sink.js — PlecoBrowserAudioSink (P23).
 *
 * THE ONE IRREDUCIBLE SEAM, CLOSED. Pleco replaces Web Audio wholesale; the
 * single thing it structurally cannot replace is the physical audio output —
 * the actual DAC on the actual device. xa-sink.js expresses that seam as the
 * injectable SINK ADAPTER CONTRACT and proves the contract end-to-end against
 * the headless PlecoNullSink / PlecoMockSink. THIS file is the drop-in that
 * finally reaches real speakers: a sink adapter that borrows exactly one real
 * `AudioContext` — used only as a hardware clock + DAC handle, never as a
 * graph — and pumps pleco's own rendered quanta out through it. Because the
 * contract is honored to the letter, PlecoAudioContext needs zero changes to
 * go from silent-but-correct (P21/P22) to audible (P23).
 *
 * ─────────────────────────────────────────────────────────────────────────────
 * HOW IT HONORS THE CONTRACT (see xa-sink.js header for the normative spec)
 * ─────────────────────────────────────────────────────────────────────────────
 * open(format, callbacks) → Promise<undefined>
 *   Stands up ONE native `AudioContext({ sampleRate: format.sampleRate })` as
 *   the hardware clock, awaits its resume() (the browser gates that on a user
 *   gesture — the CALLER is responsible for invoking resume/open from within
 *   one; a rejection here is the contract's acquisition-failure signal), then
 *   creates a ScriptProcessorNode via
 *   `createScriptProcessor(1024, 0, format.numberOfChannels)` and connects it
 *   to the native destination. From that point the SPN's `onaudioprocess`
 *   callback IS THE CLOCK: each 1024-frame device block is filled by
 *   repeatedly pulling 128-frame pleco quanta from `callbacks.pull()`. The
 *   SPN is deprecated in favor of AudioWorklet, but it is deliberately chosen
 *   here — it needs no out-of-band module load, is universally supported, and
 *   its synchronous pull-per-block cadence is a perfect structural match for
 *   the contract's pacing seam.
 *
 * THE CADENCE / RING. A device block is 1024 frames = eight pleco quanta of
 *   128 frames. Each onaudioprocess tick splices pulled quanta into the block
 *   until it is full, carrying any partially-consumed quantum forward (the
 *   "ring") so the design stays correct even if the block size were ever not
 *   an exact multiple of the quantum. When `pull()` returns `null` (the
 *   context is not running) the adapter writes SILENCE for the remainder of
 *   the block and returns — it NEVER fabricates signal to cover the gap.
 *
 * CHANNEL-COUNT RENEGOTIATION. Every write is sized from the RETURNED quantum
 *   (its Float32Array length for frame count, its array length for channel
 *   count), never from the `format.numberOfChannels` snapshot taken at open()
 *   — the destination's channelCount is mutable while open. The SPN itself is
 *   fixed at its creation width (the browser will not resize a live SPN); when
 *   a renegotiated quantum carries FEWER channels than the device block, the
 *   surplus device channels are silenced (never fabricated); when it carries
 *   MORE, the extra channels cannot physically leave this SPN and are dropped.
 *
 * outputLatency → number (seconds). The live native `outputLatency` estimate
 *   plus this adapter's own ScriptProcessorNode buffering (bufferSize /
 *   sampleRate), which is real pipeline latency the contract asks us to
 *   report. 0 before a native context exists.
 * maxChannelCount → integer. The device ceiling, read live from the native
 *   `destination.maxChannelCount`; a documented default of 2 before the native
 *   context exists (see the rate-pinning note below for why pre-creating it
 *   matters).
 * type → 'browser'. This adapter's AudioSinkType-style tag.
 *
 * FAILURE REPORTING. Faults DURING open() are signalled by rejecting open().
 *   Faults AFTER a successful open() (the device/native context dying out from
 *   under us) are forwarded to `callbacks.onError` — best-effort, from the
 *   native context's own `statechange` (an unexpected transition to 'closed')
 *   and `error` events. A deliberate close() detaches those listeners and
 *   nulls the callbacks FIRST, so our own teardown never reports itself as a
 *   fault.
 *
 * close() → Promise<undefined>. Releases the physical resource: detaches
 *   listeners, silences + disconnects the SPN, and closes the native context.
 *   Idempotent — the fields are captured and nulled before awaiting, so a
 *   second (or concurrent) close() is a no-op.
 *
 * ─────────────────────────────────────────────────────────────────────────────
 * THE RATE-PINNING DANCE (why the constructor optionally pre-creates)
 * ─────────────────────────────────────────────────────────────────────────────
 * A native AudioContext may COERCE the requested sample rate — ask for 44100
 * on a 48000 device and you get 48000. Pleco's whole frame-counter identity
 * depends on the engine running at the DEVICE's true rate, so callers must pin
 * the pleco context to that true rate BEFORE constructing it. But the native
 * context (and therefore its true rate) is normally only born inside open().
 * To break that chicken-and-egg, the constructor accepts an optional
 * `{ sampleRate }`: when present it pre-creates the native context (suspended
 * — it is NOT resumed until open()), which makes the coerced `sampleRate` (and
 * the real `maxChannelCount`) READABLE before open(). The intended flow:
 *
 *     const sink = new PlecoBrowserAudioSink({ sampleRate: 44100 })
 *     const ctx  = new PlecoAudioContext({ sampleRate: sink.sampleRate, sink })
 *     // …later, inside a user gesture…
 *     await ctx.resume()   // → sink.open(), which just resumes + wires the SPN
 *
 * When constructed WITHOUT a sampleRate, the native context is born in open()
 * instead (and `sampleRate` reads `null`, `maxChannelCount` the default) — the
 * adapter still works, the caller simply forgoes pre-open rate discovery.
 *
 * ─────────────────────────────────────────────────────────────────────────────
 * HOUSE RULES
 * ─────────────────────────────────────────────────────────────────────────────
 * Zero runtime dependencies: the native `AudioContext` is a browser global,
 * resolved lazily from `globalThis` INSIDE the constructor/methods and NEVER
 * at module top level, so importing this module in Node (no DOM) is completely
 * safe — nothing touches a browser global until you actually construct-with-
 * rate or open() the sink. Fail-loud on real faults; no silent fallbacks.
 */
import { invalidStateError } from '../xa-errors.js'

/** ScriptProcessorNode block size (frames). A valid SPN size and an exact 8× the 128-frame quantum. */
const SCRIPT_PROCESSOR_BUFFER_SIZE = 1024
/** Reported channel ceiling before a native context exists to query the real one. */
const DEFAULT_MAX_CHANNEL_COUNT = 2

/**
 * Resolve the native `AudioContext` constructor from the host globals, lazily.
 * Called ONLY from the constructor/open() (never at module load), so a Node
 * import never trips over the missing global. Fail-loud when absent: this
 * adapter is meaningless without real Web Audio hardware.
 *
 * @returns {typeof AudioContext}
 */
function resolveNativeAudioContext() {
  const g = /** @type {any} */ (globalThis)
  const Ctor = g.AudioContext || g.webkitAudioContext
  if (typeof Ctor !== 'function') {
    throw new Error(
      'PlecoBrowserAudioSink: no global AudioContext — this adapter requires a browser (or Web Audio-capable) host',
    )
  }
  return Ctor
}

/**
 * The real browser hardware sink adapter (P23). Honors the pleco SINK ADAPTER
 * CONTRACT (xa-sink.js) by driving a single native AudioContext + one
 * ScriptProcessorNode as a bare clock/DAC for pleco's own rendered quanta.
 */
export class PlecoBrowserAudioSink {
  /**
   * @param {object} [options]
   * @param {number} [options.sampleRate] — when provided, pre-create the
   *   native AudioContext at this requested rate (suspended) so the coerced
   *   `sampleRate` / real `maxChannelCount` are readable BEFORE open(). Omit to
   *   defer native-context creation to open().
   */
  constructor({ sampleRate } = {}) {
    /** The native AudioContext used purely as hardware clock + DAC handle (or null). */
    this._native = null
    /** The ScriptProcessorNode whose onaudioprocess pulls pleco quanta (or null). */
    this._spn = null
    /** The contract callbacks handed to open() ({ pull, onUnderrun, onError }); null ⇒ not open. */
    this._callbacks = null
    /** The partially-consumed pulled quantum carried across the fill loop (the "ring"), or null. */
    this._quantum = null
    /** Frames already emitted out of `this._quantum`. */
    this._quantumOffset = 0
    /** Fixed SPN block size (frames). */
    this._bufferSize = SCRIPT_PROCESSOR_BUFFER_SIZE

    // Bind the hot/callback paths once so add/removeEventListener see one ref.
    this._render = this._render.bind(this)
    this._handleNativeStateChange = this._handleNativeStateChange.bind(this)
    this._handleNativeError = this._handleNativeError.bind(this)

    // Optional pre-creation for the rate-pinning dance (header). Suspended:
    // a fresh AudioContext is not resumed here — open() does that.
    if (sampleRate !== undefined) {
      const NativeAudioContext = resolveNativeAudioContext()
      this._native = new NativeAudioContext({ sampleRate })
    }
  }

  // ── Contract attributes ──────────────────────────────────────────────────

  /** AudioSinkType-style tag for this adapter. */
  get type() {
    return 'browser'
  }

  /** True between a successful open() and the next close(). */
  get isOpen() {
    return this._callbacks !== null
  }

  /**
   * The device's true (possibly coerced) sample rate — readable pre-open when
   * the constructor pre-created the native context, `null` otherwise (no
   * native context yet, or after close()). Callers pin the pleco context to
   * this value BEFORE constructing it (see the rate-pinning dance).
   */
  get sampleRate() {
    return this._native === null ? null : this._native.sampleRate
  }

  /**
   * The underlying native AudioContext (the hardware clock/DAC handle), or
   * `null` before it exists / after close(). Exposed so a caller can share the
   * SAME native context with a companion capture graph (e.g. a live mic feed),
   * keeping the whole pipeline on one clock and one rate.
   */
  get nativeContext() {
    return this._native
  }

  /**
   * Contract outputLatency (seconds): the live native output-latency estimate
   * plus this adapter's ScriptProcessorNode buffering — both are real
   * pipeline latency between handing a block to the host and it reaching the
   * device. 0 while no native context exists.
   */
  get outputLatency() {
    if (this._native === null) return 0
    const deviceLatency = typeof this._native.outputLatency === 'number' ? this._native.outputLatency : 0
    return deviceLatency + this._bufferSize / this._native.sampleRate
  }

  /**
   * Contract maxChannelCount: the device channel ceiling, read live from the
   * native destination once it exists; the documented default before then.
   */
  get maxChannelCount() {
    if (this._native === null) return DEFAULT_MAX_CHANNEL_COUNT
    return this._native.destination.maxChannelCount
  }

  // ── Contract lifecycle ───────────────────────────────────────────────────

  /**
   * Contract open(format, callbacks): acquire the physical output. Throwing or
   * rejecting IS the acquisition-failure signal (the context maps it onto the
   * spec's resume()/setSinkId() failure paths).
   *
   * @param {{ sampleRate:number, numberOfChannels:number, renderQuantumSize:number, sinkId:string }} format
   * @param {{ pull:()=>Array<Float32Array>|null, onUnderrun:(frames:number)=>void, onError:(error:any)=>void }} callbacks
   * @returns {Promise<void>}
   */
  async open(format, callbacks) {
    if (this._callbacks !== null) {
      throw invalidStateError('PlecoBrowserAudioSink.open: the sink is already open')
    }

    // Reuse a pre-created native context; otherwise stand one up now. When it
    // was pre-created, the caller was supposed to pin the pleco context to
    // this.sampleRate — a mismatch means the engine would run at the wrong
    // rate (pitch/speed error), so refuse loudly rather than detune silently.
    const preCreated = this._native !== null
    if (preCreated) {
      if (format.sampleRate !== this._native.sampleRate) {
        throw new Error(
          `PlecoBrowserAudioSink.open: format.sampleRate ${format.sampleRate} ≠ the pre-created device rate ` +
            `${this._native.sampleRate} — pin the pleco context to sink.sampleRate before constructing it`,
        )
      }
    } else {
      const NativeAudioContext = resolveNativeAudioContext()
      this._native = new NativeAudioContext({ sampleRate: format.sampleRate })
      // Symmetric with the pre-created branch: the device may COERCE the rate
      // (ask 44100 on a 48000 device and get 48000). Pleco's frame-counter
      // identity requires the engine to run at the device's TRUE rate, so a
      // coercion here means the pleco context (already pinned to format.sampleRate)
      // would detune — refuse LOUDLY rather than fall back silently. The
      // rate-pinning dance (construct with { sampleRate } first) avoids this.
      if (this._native.sampleRate !== format.sampleRate) {
        const coerced = this._native.sampleRate
        const orphan = this._native
        this._native = null
        try {
          orphan.close()
        } catch (_) {
          /* nothing to release */
        }
        throw new Error(
          `PlecoBrowserAudioSink.open: device coerced sampleRate ${format.sampleRate} → ${coerced}; ` +
            'construct PlecoBrowserAudioSink({ sampleRate }) and pin the pleco context to sink.sampleRate before opening',
        )
      }
    }

    try {
      // User-gesture gated by the CALLER; a rejection is the failure signal.
      await this._native.resume()

      // Honor a specific output-device request; '' = default device. A rejection
      // is an acquisition failure (the contract's InvalidAccessError-during-
      // setSinkId path). Skipped where the host lacks setSinkId.
      if (format.sinkId && typeof this._native.setSinkId === 'function') {
        await this._native.setSinkId(format.sinkId)
      }

      // The bare pull-driver: 0 inputs, format.numberOfChannels outputs.
      const spn = this._native.createScriptProcessor(this._bufferSize, 0, format.numberOfChannels)

      // Publish state BEFORE connecting (connect is what starts the ticks).
      this._callbacks = callbacks
      this._quantum = null
      this._quantumOffset = 0
      this._spn = spn
      spn.onaudioprocess = this._render
      this._attachFaultForwarding()
      spn.connect(this._native.destination)
    } catch (err) {
      // Roll back to a reusable state; only tear down a native context WE just
      // created (leave a pre-created one intact for a retry — it holds the
      // pinned rate).
      this._callbacks = null
      if (this._native !== null) this._detachFaultForwarding()
      if (this._spn !== null) {
        this._spn.onaudioprocess = null
        try {
          this._spn.disconnect()
        } catch (_) {
          /* never connected */
        }
        this._spn = null
      }
      if (!preCreated && this._native !== null) {
        const orphan = this._native
        this._native = null
        try {
          await orphan.close()
        } catch (_) {
          /* already dead */
        }
      }
      throw err
    }
  }

  /**
   * Contract close(): release the physical output. Idempotent — fields are
   * captured and nulled before any await, so a second/concurrent call no-ops.
   *
   * @returns {Promise<void>}
   */
  async close() {
    // Null callbacks FIRST: this both silences any in-flight render tick and
    // disarms fault forwarding, so our own teardown is never reported as a
    // device fault.
    this._callbacks = null
    const spn = this._spn
    const native = this._native
    this._spn = null
    this._native = null
    this._quantum = null
    this._quantumOffset = 0

    if (native !== null) this._detachFaultForwardingOn(native)
    if (spn !== null) {
      spn.onaudioprocess = null
      try {
        spn.disconnect()
      } catch (_) {
        /* already disconnected */
      }
    }
    if (native !== null && native.state !== 'closed') {
      await native.close()
    }
  }

  // ── Internal: the pull cadence (the clock) ───────────────────────────────

  /**
   * The ScriptProcessorNode callback — pleco's render clock. Fills the
   * device's output block by pulling 128-frame quanta, honoring the null-⇒-
   * silence and channel-renegotiation rules of the contract.
   *
   * @param {{ outputBuffer: AudioBuffer }} event
   */
  _render(event) {
    const output = event.outputBuffer
    const blockLength = output.length
    const outChannels = output.numberOfChannels

    // Grab each device channel's backing Float32Array once (stable per block).
    const dst = new Array(outChannels)
    for (let c = 0; c < outChannels; c++) dst[c] = output.getChannelData(c)

    const cb = this._callbacks
    // Torn down mid-tick (close() during a hardware callback): pure silence.
    if (cb === null) {
      for (let c = 0; c < outChannels; c++) dst[c].fill(0)
      return
    }

    let filled = 0
    while (filled < blockLength) {
      // Refill the ring when the carried quantum is exhausted.
      if (this._quantum === null) {
        const q = cb.pull()
        if (q === null) {
          // Contract: not running ⇒ silence the remainder, never fabricate.
          for (let c = 0; c < outChannels; c++) dst[c].fill(0, filled)
          return
        }
        this._quantum = q
        this._quantumOffset = 0
      }

      const quantum = this._quantum
      // Size the write from the RETURNED quantum, not the open() snapshot.
      const quantumChannels = quantum.length
      const quantumFrames = quantum[0].length
      const count = Math.min(quantumFrames - this._quantumOffset, blockLength - filled)

      for (let c = 0; c < outChannels; c++) {
        if (c < quantumChannels) {
          dst[c].set(quantum[c].subarray(this._quantumOffset, this._quantumOffset + count), filled)
        } else {
          // Device has more channels than this quantum carries: silence the
          // surplus (never fabricate). A quantum WIDER than the device drops
          // its extra channels — the SPN cannot output beyond its fixed width.
          dst[c].fill(0, filled, filled + count)
        }
      }

      this._quantumOffset += count
      filled += count
      if (this._quantumOffset >= quantumFrames) {
        this._quantum = null
        this._quantumOffset = 0
      }
    }
  }

  // ── Internal: post-open fault forwarding ─────────────────────────────────

  /** Arm native-fault forwarding on the current native context. */
  _attachFaultForwarding() {
    const native = this._native
    if (native === null) return
    native.addEventListener('statechange', this._handleNativeStateChange)
    native.addEventListener('error', this._handleNativeError)
  }

  /** Disarm forwarding on the current native context (used on open() rollback). */
  _detachFaultForwarding() {
    if (this._native !== null) this._detachFaultForwardingOn(this._native)
  }

  /**
   * Disarm forwarding on a specific native context (used by close(), which has
   * already nulled `this._native`).
   *
   * @param {AudioContext} native
   */
  _detachFaultForwardingOn(native) {
    native.removeEventListener('statechange', this._handleNativeStateChange)
    native.removeEventListener('error', this._handleNativeError)
  }

  /** Native `statechange`: an UNEXPECTED close ⇒ the device was lost. */
  _handleNativeStateChange() {
    const native = this._native
    if (native !== null && native.state === 'closed' && this._callbacks !== null) {
      this._reportFault(new Error('PlecoBrowserAudioSink: the native AudioContext closed unexpectedly (device lost)'))
    }
  }

  /** Native `error` (where supported): forward the underlying cause. */
  _handleNativeError(event) {
    const cause =
      event && event.error ? event.error : new Error('PlecoBrowserAudioSink: the native AudioContext reported an error')
    this._reportFault(cause)
  }

  /** Forward a post-open fault to the contract's onError, if still open. */
  _reportFault(error) {
    const cb = this._callbacks
    if (cb !== null && typeof cb.onError === 'function') cb.onError(error)
  }
}
