/**
 * engine/xa-offline-context.js — PlecoOfflineAudioContext (spec: OfflineAudioContext)
 * + PlecoOfflineAudioCompletionEvent (spec: OfflineAudioCompletionEvent).
 *
 * The headless, deterministic render driver — a literal OfflineAudioContext
 * bounce minus the platform. Render the same graph twice ⇒ bit-identical
 * output. This is THE headless proof that pleco's audio engine runs under
 * `node script.js`.
 *
 * P07 spec surface (spec § The OfflineAudioContext Interface):
 * - BOTH constructor forms: (contextOptions) and
 *   (numberOfChannels, length, sampleRate). NotSupportedError when any value
 *   is zero, negative, or outside its nominal range (numberOfChannels [1, 32],
 *   length ≥ 1, sampleRate [3000, 768000] Hz); TypeError when the required
 *   OfflineAudioContextOptions members (length, sampleRate) are missing.
 * - readonly `length` attribute; the reference impl's `renderedBuffer`
 *   attribute and pleco's old public `numberOfChannels` attribute are NOT spec
 *   surface and are dropped (numberOfChannels lives on as the constructor
 *   option / internal `_numberOfChannels` only).
 * - genuinely async startRendering(): the [[rendering started]] slot guards a
 *   second call with an InvalidStateError rejection; rendering runs OFF the
 *   caller's synchronous frame (microtask — pleco's "rendering thread"
 *   analogue); resolves with the [[rendered buffer]].
 * - State transitions (with `statechange` via PlecoBaseContext._setState):
 *   'suspended' → 'running' (synchronously in startRendering — the control
 *   thread flips first, rendering follows on the microtask) → 'suspended' at
 *   each suspend point → 'running' on resume() → 'closed' at completion.
 *   Per spec § onstatechange, statechange for 'closed' fires BEFORE the
 *   `complete` event ("This event is fired before the complete event").
 * - suspend(suspendTime): the frame is quantized UP to the render-quantum
 *   boundary (ceil). InvalidStateError rejection when the quantized frame is
 *   negative, ≤ the current time, ≥ the total render duration, or already
 *   claimed by another suspend (spec allows ONE suspend per quantized frame);
 *   also when the context is closed. Note the spec-literal consequence:
 *   suspend(0) always rejects (frame 0 ≤ current time 0).
 * - resume(): rejects InvalidStateError only when closed or when
 *   [[rendering started]] is false; flips state synchronously and continues
 *   the render loop on a microtask. A resume while already running resolves.
 * - `complete` event (`oncomplete` handler attribute): a
 *   PlecoOfflineAudioCompletionEvent carrying readonly `renderedBuffer`,
 *   dispatched on a microtask AFTER the startRendering() promise resolves —
 *   the last event fired on the context.
 *
 * WebIDL-conversion seams — SPEC-ALIGNED for parity: `numberOfChannels` and
 * `length` are IDL `unsigned long`, converted by ES ToNumber then truncation
 * toward zero (a fractional length like 3276.8 becomes 3276, never a throw)
 * before the nominal-range checks — the same seam as PlecoAudioBuffer. Missing
 * required OfflineAudioContextOptions members (length, sampleRate) remain a
 * WebIDL TypeError; out-of-nominal-range values remain NotSupportedError.
 *
 * Pleco strictness (documented deviations from WebIDL coercion — no silent
 * fallbacks):
 * - suspendTime is IDL `double`: non-number or non-finite values reject with
 *   TypeError instead of being coerced.
 * - renderSizeHint (OfflineAudioContextOptions, union
 *   AudioContextRenderSizeCategory or unsigned long): an invalid enum string
 *   throws TypeError (constructor-dictionary rule); an integer outside
 *   [1, 6·sampleRate] throws NotSupportedError (spec § Supported Render
 *   Quantum Sizes); a non-integer number throws TypeError (no truncation).
 *   PARITY GAP (explicit, never silent): pleco's engine quantum is fixed at
 *   RENDER_QUANTUM (128) until configurable-quantum work lands (P21's
 *   renderSizeHint scope), so a spec-valid integer hint ≠ 128 throws
 *   NotSupportedError naming this limitation rather than silently rendering
 *   at 128.
 *
 * Internal engine API (non-spec, excluded from the parity surface):
 * - renderSync() — the original synchronous whole-buffer render. No state
 *   transitions, no suspend points, no events; kept for deterministic
 *   engine-internal renders and tests (same tier as
 *   PlecoBaseContext.renderQuantum()).
 * - The `PlecoOfflineContext` export is a TRANSITIONAL alias for the renamed
 *   class, kept only while non-owned test files still import the old name.
 */
import { PlecoBaseContext } from './xa-base-context.js'
import { RENDER_QUANTUM } from './xa-constants.js'
import { PlecoAudioBuffer, createPlecoAudioBuffer, toIntegralCount } from './xa-buffer.js'
import { invalidStateError, notSupportedError } from './xa-errors.js'

/** Spec: "MUST support at least 32 channels" — pleco's ceiling, same as PlecoAudioBuffer. */
const MAX_CHANNELS = 32
/** The AudioContextRenderSizeCategory enum values (spec § AudioContextRenderSizeCategory). */
const RENDER_SIZE_CATEGORIES = ['default', 'hardware']

/**
 * Spec OfflineAudioCompletionEvent: the Event subclass dispatched as the
 * `complete` event. OfflineAudioCompletionEventInit.renderedBuffer is a
 * REQUIRED, NON-NULLABLE AudioBuffer member (spec IDL: `required AudioBuffer
 * renderedBuffer`) — a missing dictionary, a missing member, and any value
 * that is not a PlecoAudioBuffer (null included) are all WebIDL conversion
 * TypeErrors.
 */
export class PlecoOfflineAudioCompletionEvent extends Event {
  #renderedBuffer

  constructor(type, eventInitDict) {
    if (
      eventInitDict === null ||
      typeof eventInitDict !== 'object' ||
      !(eventInitDict.renderedBuffer instanceof PlecoAudioBuffer)
    ) {
      throw new TypeError(
        'PlecoOfflineAudioCompletionEvent: eventInitDict.renderedBuffer is a required PlecoAudioBuffer member',
      )
    }
    super(type, eventInitDict)
    this.#renderedBuffer = eventInitDict.renderedBuffer
  }

  /** Readonly. The PlecoAudioBuffer containing the rendered audio data. */
  get renderedBuffer() {
    return this.#renderedBuffer
  }
}

export class PlecoOfflineAudioContext extends PlecoBaseContext {
  #length
  /** Spec [[rendering started]] slot — set true by the first startRendering(). */
  #renderingStarted = false
  /** Spec [[rendered buffer]] slot — allocated by startRendering() step 5. */
  #renderedBuffer = null
  #written = 0
  #resolveRender = null
  #rejectRender = null
  /** Quantized suspend frame → the resolve of that suspend()'s promise (spec: one per frame). */
  #suspendPoints = new Map()
  #oncomplete = null

  /**
   * Both spec constructor forms:
   *   new PlecoOfflineAudioContext({ numberOfChannels = 1, length, sampleRate, renderSizeHint = 'default' })
   *   new PlecoOfflineAudioContext(numberOfChannels, length, sampleRate)
   * The positional form is constructed "as if" the dictionary form were called
   * (spec § OfflineAudioContext(numberOfChannels, length, sampleRate)).
   */
  constructor(arg0, positionalLength, positionalSampleRate) {
    let numberOfChannels, length, sampleRate, renderSizeHint
    if (typeof arg0 === 'object' && arg0 !== null) {
      ;({ numberOfChannels = 1, length, sampleRate, renderSizeHint = 'default' } = arg0)
      if (length === undefined || sampleRate === undefined) {
        throw new TypeError(
          'PlecoOfflineAudioContext: required OfflineAudioContextOptions members (length, sampleRate) are missing',
        )
      }
    } else if (
      typeof arg0 === 'number' &&
      typeof positionalLength === 'number' &&
      typeof positionalSampleRate === 'number'
    ) {
      numberOfChannels = arg0
      length = positionalLength
      sampleRate = positionalSampleRate
      renderSizeHint = 'default'
    } else {
      throw new TypeError(
        'PlecoOfflineAudioContext: expected (contextOptions) or (numberOfChannels, length, sampleRate)',
      )
    }

    // WebIDL `unsigned long` conversion (ToNumber + truncate toward zero) for
    // numberOfChannels + length, THEN the spec's nominal-range checks —
    // identical seam to PlecoAudioBuffer. A fractional length like 3276.8
    // truncates to 3276 (never a throw); values outside the nominal integer
    // range (≤ 0, > 32 channels, non-finite) throw NotSupportedError rather
    // than the old strict non-integer rejection or a silent 2^32 wrap.
    const rawNumberOfChannels = numberOfChannels
    const rawLength = length
    numberOfChannels = toIntegralCount(rawNumberOfChannels)
    length = toIntegralCount(rawLength)
    if (!(numberOfChannels >= 1 && numberOfChannels <= MAX_CHANNELS)) {
      throw notSupportedError(
        `PlecoOfflineAudioContext: numberOfChannels must be in the nominal range [1, ${MAX_CHANNELS}], got ${rawNumberOfChannels}`,
      )
    }
    if (!(length >= 1)) {
      throw notSupportedError(
        `PlecoOfflineAudioContext: length must be a positive sample-frame count, got ${rawLength}`,
      )
    }
    super({ sampleRate, numberOfChannels }) // validates sampleRate (NotSupportedError) + builds the destination
    this.#length = length

    // renderSizeHint — validated in spec order AFTER sampleRate (constructor
    // step 4). See the file header for the pleco fixed-quantum parity gap.
    if (typeof renderSizeHint === 'string') {
      if (!RENDER_SIZE_CATEGORIES.includes(renderSizeHint)) {
        throw new TypeError(
          `PlecoOfflineAudioContext: renderSizeHint must be ${RENDER_SIZE_CATEGORIES.join(' | ')} or an integer, got '${renderSizeHint}'`,
        )
      }
      // 'default' and 'hardware' both resolve to the engine's fixed 128-frame quantum.
    } else if (typeof renderSizeHint === 'number') {
      if (!Number.isInteger(renderSizeHint)) {
        throw new TypeError(
          `PlecoOfflineAudioContext: an integer renderSizeHint must be an integer, got ${renderSizeHint}`,
        )
      }
      const maxQuantum = Math.floor(6 * this.sampleRate)
      if (renderSizeHint < 1 || renderSizeHint > maxQuantum) {
        throw notSupportedError(
          `PlecoOfflineAudioContext: renderSizeHint must be in [1, ${maxQuantum}] (6·sampleRate), got ${renderSizeHint}`,
        )
      }
      if (renderSizeHint !== RENDER_QUANTUM) {
        throw notSupportedError(
          `PlecoOfflineAudioContext: pleco's render quantum is fixed at ${RENDER_QUANTUM} frames (configurable renderSizeHint is a documented parity gap), got ${renderSizeHint}`,
        )
      }
    } else {
      throw new TypeError(
        `PlecoOfflineAudioContext: renderSizeHint must be ${RENDER_SIZE_CATEGORIES.join(' | ')} or an integer, got ${renderSizeHint}`,
      )
    }
  }

  /** Readonly. The size of the render in sample-frames — the constructor's `length`. */
  get length() {
    return this.#length
  }

  /**
   * `oncomplete` event-handler IDL attribute (event type `complete`), same
   * pattern as PlecoBaseContext.onstatechange: assigning subscribes,
   * reassigning replaces, null (or any non-function) unsubscribes.
   */
  get oncomplete() {
    return this.#oncomplete
  }

  set oncomplete(fn) {
    if (this.#oncomplete !== null) this.removeEventListener('complete', this.#oncomplete)
    this.#oncomplete = typeof fn === 'function' ? fn : null
    if (this.#oncomplete !== null) this.addEventListener('complete', this.#oncomplete)
  }

  /**
   * Spec startRendering() → Promise<PlecoAudioBuffer>.
   *
   * Control-thread steps run synchronously: the [[rendering started]] guard
   * (second call → InvalidStateError rejection), allocation of the
   * [[rendered buffer]] (an allocation failure rejects rather than throws,
   * spec step 6), and the state flip to 'running'. The render loop itself —
   * the "begin offline rendering" rendering-thread analogue — runs on a
   * microtask, so no frames are ever rendered in the caller's synchronous
   * frame. Resolves with the rendered buffer, then fires `complete` (see
   * #pump for the exact ordering).
   */
  startRendering() {
    if (this.#renderingStarted) {
      return Promise.reject(
        invalidStateError('PlecoOfflineAudioContext.startRendering: rendering has already started'),
      )
    }
    this.#renderingStarted = true
    try {
      this.#renderedBuffer = createPlecoAudioBuffer(this._numberOfChannels, this.#length, this.sampleRate)
    } catch (err) {
      return Promise.reject(err)
    }
    this.#written = 0
    this._setState('running')
    return new Promise((resolve, reject) => {
      this.#resolveRender = resolve
      this.#rejectRender = reject
      queueMicrotask(() => this.#pump())
    })
  }

  /**
   * Spec suspend(suspendTime) → Promise<undefined>, resolved when rendering
   * actually reaches the suspend point (never at schedule time).
   *
   * The suspend frame is suspendTime quantized UP (ceil) to the next
   * render-quantum boundary. Rejection ladder (spec § suspend argumentdef,
   * all InvalidStateError): quantized frame negative, ≤ the current time,
   * ≥ the total render duration, or already scheduled by another suspend for
   * the same quantized frame; plus a closed-context guard. Pleco strictness:
   * non-number / non-finite suspendTime rejects with TypeError (no coercion).
   */
  suspend(suspendTime) {
    if (typeof suspendTime !== 'number' || !Number.isFinite(suspendTime)) {
      return Promise.reject(
        new TypeError(`PlecoOfflineAudioContext.suspend: suspendTime must be a finite number, got ${suspendTime}`),
      )
    }
    if (this.state === 'closed') {
      return Promise.reject(invalidStateError('PlecoOfflineAudioContext.suspend: the context is closed'))
    }
    // Quantize UP to the render-quantum boundary (spec: "rounded up to the
    // nearest render quantum boundary").
    const frame = Math.ceil((suspendTime * this.sampleRate) / RENDER_QUANTUM) * RENDER_QUANTUM
    if (suspendTime < 0 || frame < 0) {
      return Promise.reject(
        invalidStateError(`PlecoOfflineAudioContext.suspend: suspendTime must be non-negative, got ${suspendTime}`),
      )
    }
    if (frame <= this._frame) {
      return Promise.reject(
        invalidStateError(
          `PlecoOfflineAudioContext.suspend: quantized frame ${frame} is less than or equal to the current time (frame ${this._frame})`,
        ),
      )
    }
    if (frame >= this.#length) {
      return Promise.reject(
        invalidStateError(
          `PlecoOfflineAudioContext.suspend: quantized frame ${frame} is greater than or equal to the total render duration (${this.#length} frames)`,
        ),
      )
    }
    if (this.#suspendPoints.has(frame)) {
      return Promise.reject(
        invalidStateError(
          `PlecoOfflineAudioContext.suspend: another suspend is already scheduled at quantized frame ${frame}`,
        ),
      )
    }
    return new Promise((resolve) => {
      this.#suspendPoints.set(frame, resolve)
    })
  }

  /**
   * Spec resume() → Promise<undefined>. Rejects with InvalidStateError only
   * when the context is closed or [[rendering started]] is false. The state
   * flips to 'running' synchronously (the control-thread step); the render
   * loop continues on a microtask. Resuming an already-running context
   * resolves (the control message is a no-op).
   */
  resume() {
    if (this.state === 'closed') {
      return Promise.reject(invalidStateError('PlecoOfflineAudioContext.resume: the context is closed'))
    }
    if (!this.#renderingStarted) {
      return Promise.reject(
        invalidStateError('PlecoOfflineAudioContext.resume: startRendering() has not been called'),
      )
    }
    if (this.state === 'running') return Promise.resolve()
    this._setState('running')
    return new Promise((resolve) => {
      queueMicrotask(() => {
        this.#pump()
        resolve()
      })
    })
  }

  /**
   * The offline render loop (the "rendering thread" analogue) — one call per
   * running span. Before each quantum it checks for a suspend point at the
   * current frame: on a hit the state flips to 'suspended' (statechange) and
   * that suspend()'s promise resolves; resume() re-enters here. At completion:
   * state → 'closed' (statechange fires BEFORE `complete`, per spec
   * § onstatechange), the startRendering() promise resolves with the
   * [[rendered buffer]], and the `complete` PlecoOfflineAudioCompletionEvent
   * is dispatched on a subsequent microtask — the last event on the context.
   */
  #pump() {
    try {
      while (this.#written < this.#length) {
        const resolveSuspend = this.#suspendPoints.get(this._frame)
        if (resolveSuspend !== undefined) {
          this.#suspendPoints.delete(this._frame)
          this._setState('suspended')
          resolveSuspend()
          return
        }
        const block = this.renderQuantum()
        const n = Math.min(RENDER_QUANTUM, this.#length - this.#written)
        // An unconnected destination input pulls the spec's single channel of
        // silence (block can carry fewer channels than the context) — blit
        // what the block has; the rendered buffer is already zero-initialized.
        const channels = Math.min(block.numberOfChannels, this._numberOfChannels)
        for (let c = 0; c < channels; c++) {
          this.#renderedBuffer.getChannelData(c).set(block.getChannelData(c).subarray(0, n), this.#written)
        }
        this.#written += n
      }
    } catch (err) {
      // A graph-processing failure closes the context and rejects the render
      // promise with the original error (reference-impl behavior; the spec
      // leaves offline render failure unspecified).
      this._setState('closed')
      this.#rejectRender(err)
      return
    }
    const buffer = this.#renderedBuffer
    this._setState('closed')
    this.#resolveRender(buffer)
    queueMicrotask(() =>
      this.dispatchEvent(new PlecoOfflineAudioCompletionEvent('complete', { renderedBuffer: buffer })),
    )
  }

  /**
   * INTERNAL ENGINE API (non-spec, excluded from the parity surface — see
   * file header). Synchronous whole-buffer render: no state transitions, no
   * suspend points, no events, no [[rendering started]] interaction.
   * Deterministic — render twice ⇒ bit-identical output.
   */
  renderSync() {
    const out = createPlecoAudioBuffer(this._numberOfChannels, this.#length, this.sampleRate)
    let written = 0
    while (written < this.#length) {
      const block = this.renderQuantum()
      const n = Math.min(RENDER_QUANTUM, this.#length - written)
      // Same silent-channel rule as #pump: an unconnected destination input
      // pulls a mono silence block — blit only the channels the block carries.
      const channels = Math.min(block.numberOfChannels, this._numberOfChannels)
      for (let c = 0; c < channels; c++) {
        out.getChannelData(c).set(block.getChannelData(c).subarray(0, n), written)
      }
      written += n
    }
    return out
  }
}

/**
 * TRANSITIONAL alias for the pre-P07 class name (checklist naming
 * normalization: PlecoOfflineContext → PlecoOfflineAudioContext). Kept only
 * because non-owned test files still import the old name; remove once every
 * import site says PlecoOfflineAudioContext.
 */
export { PlecoOfflineAudioContext as PlecoOfflineContext }
