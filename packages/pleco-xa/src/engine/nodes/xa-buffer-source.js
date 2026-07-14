/**
 * engine/nodes/xa-buffer-source.js — PlecoAudioBufferSourceNode (P08).
 *
 * Spec-shaped AudioBufferSourceNode (spec § The AudioBufferSourceNode
 * Interface + the normative § Playback of AudioBuffer Contents algorithm):
 * the looper's replay voice, playing a PlecoAudioBuffer through the graph via
 * a persistent fractional playhead with linear interpolation.
 *
 * buffer (nullable AudioBuffer attribute, spec "set the buffer attribute"):
 *   - Initially null. A non-Float32Array-backed duck type is rejected — the
 *     WebIDL `AudioBuffer?` type check is a TypeError.
 *   - The [[buffer set]] internal slot makes non-null assignment ONE-SHOT:
 *     once a non-null buffer has been assigned (setter OR constructor
 *     options), any further NON-NULL assignment throws InvalidStateError.
 *     Assigning null is always allowed and does not clear the slot.
 *   - Acquire-the-content: pleco's ownership model is this set-once slot
 *     itself (see xa-buffer.js header) — the node reads the live backing
 *     arrays; no fake ArrayBuffer detaching.
 *   - Per the spec playback algorithm's `if (buffer == null) stop =
 *     currentTime` line, a STARTED source whose buffer is still null when a
 *     quantum renders is force-stopped at that quantum ("force zero output
 *     for all time") and `ended` fires; a buffer assigned after start() but
 *     BEFORE the next rendered quantum plays normally (setter step 5,
 *     acquire-on-set with start already called).
 *
 * start(when, offset, duration): the three-argument overload. `offset` is a
 * playhead position in seconds (sub-sample precision — a fractional-frame
 * offset interpolates every output frame), silently clamped to
 * [0, buffer.duration] when the start time is reached; `duration` is seconds
 * of BUFFER CONTENT (independent of playbackRate, whole loop iterations
 * included), Infinity when omitted. Negative offset/duration → RangeError;
 * non-finite → TypeError (WebIDL restricted double, converted BEFORE the
 * [[source started]] InvalidStateError, which precedes the RangeError
 * constraints — the spec's step order). Rejecting non-number arguments
 * outright is deliberate pleco strictness, not spec behavior.
 *
 * loop / loopStart / loopEnd: the normative playback algorithm verbatim —
 * effective endpoints [actualLoopStart, actualLoopEnd) fall back to the whole
 * buffer when loopStart < 0, loopEnd ≤ 0, or loopStart ≥ loopEnd; loopEnd
 * clamps to the buffer duration; the enteredLoop latch and the wraparound
 * cursor = loopStart + ((cursor − loopStart) mod (loopEnd − loopStart))
 * (the algorithm's while-loops in closed form), sub-sample accurate. All
 * loop-related attributes are sampled once per render quantum (k-rate basis,
 * per the algorithm's preamble), so mid-flight changes take effect at the
 * next block. Reads that interpolate ACROSS actualLoopEnd splice against the
 * wrapped neighbor at loopStart (spec playbackSignal note). loopStart/loopEnd
 * are WebIDL `double` attributes: non-finite assignment → TypeError; `loop`
 * accepts only a real boolean (pleco strictness).
 *
 * playbackRate / detune: k-rate-fixed AudioParams (automation rate
 * constraint: changing the rate throws InvalidStateError), combined once per
 * render quantum as the compound parameter
 *     computedPlaybackRate = playbackRate · 2^(detune / 1200)
 * which drives the sub-sample playhead step (scaled by
 * bufferSampleRate/contextSampleRate so the cursor lives in buffer-sample
 * units). Negative rates play backward (loop direction respects the sign);
 * rate 0 is sample-and-hold.
 *
 * Output channel width tracks the CONTENT, not the channelCount attribute
 * (which stays at the interface default 2, spec node table: 0 in / 1 out,
 * cc 2, mode 'max', interpretation 'speakers'): the output has the buffer's
 * channel count, or one channel of silence when buffer is null, collapsing
 * back to one silent channel at the first quantum after the source ends.
 *
 * Ended semantics (through the P05 base): stop time, duration reached, or
 * content exhausted. A non-looping playhead OUTSIDE [0, buffer.duration) ends
 * the source only when it can never re-enter — i.e. it has left in its
 * direction of travel (forward past the end, or backward past 0). A playhead
 * that is out of range but heading BACK toward the buffer (a negative rate
 * whose start offset lands at/after the buffer end, per this file's
 * playbackrate-negative edge cases) renders silence and keeps advancing until
 * it re-enters, rather than ending prematurely; a zero rate outside the buffer
 * can never return and ends. Similarly spec-literal:
 * bufferTimeElapsed accumulates SIGNED (Σ computedPlaybackRate per rendered
 * frame, i.e. duration·contextSampleRate units), so a negative rate never
 * advances toward `duration`. The sub-sample start offset (_startFrame −
 * _startFrameExact) seeds both the playhead cursor and this sum, so a grain
 * that begins at a fractional frame is interpolated from its true start and
 * ends on the exact spec-computed frame (§ sub-sample accurate scheduling).
 */
import { PlecoScheduledSourceNode, coerceNodeOptions } from '../xa-node.js'
import { PlecoAudioParam } from '../xa-param.js'
import { PlecoAudioBuffer, createPlecoAudioBuffer } from '../xa-buffer.js'
import { RENDER_QUANTUM } from '../xa-constants.js'
import { invalidStateError } from '../xa-errors.js'

/** WebIDL restricted double for times/positions: non-finite (or non-number, pleco strictness) → TypeError. */
function assertFiniteNumber(where, name, v) {
  if (typeof v !== 'number' || !Number.isFinite(v)) {
    throw new TypeError(`PlecoAudioBufferSourceNode.${where}: ${name} must be a finite number, got ${v}`)
  }
  return v
}

export class PlecoAudioBufferSourceNode extends PlecoScheduledSourceNode {
  #buffer = null
  #bufferSet = false // the spec's [[buffer set]] internal slot
  #loop = false
  #loopStart = 0
  #loopEnd = 0

  /**
   * @param {object} context — the owning PlecoBaseContext.
   * @param {object} [options] — AudioBufferSourceOptions: {buffer, detune,
   *   loop, loopEnd, loopStart, playbackRate}. Per the IDL this dictionary
   *   does NOT inherit AudioNodeOptions, so channel members are not options
   *   here (unknown members are ignored, WebIDL dictionary behavior).
   */
  constructor(context, options = {}) {
    // WebIDL dictionary conversion: a non-object 2nd argument is a TypeError
    // (spec-aligned conversion seam — must precede the spread below, which
    // would otherwise silently swallow a primitive).
    options = coerceNodeOptions(options)
    const { buffer, detune, loop = false, loopEnd = 0, loopStart = 0, playbackRate } = options
    // Spec node table: 0 inputs, 1 output, channelCount 2, mode 'max',
    // interpretation 'speakers' — exactly the PlecoNode defaults. The
    // channelCount ATTRIBUTE never mutates with the buffer (see header).
    super(context)

    this.playbackRate = new PlecoAudioParam({
      defaultValue: 1,
      automationRate: 'k-rate',
      fixedAutomationRate: true, // spec: has automation rate constraints
      context,
    })
    this.detune = new PlecoAudioParam({
      defaultValue: 0,
      automationRate: 'k-rate',
      fixedAutomationRate: true,
      context,
    })
    // Dictionary members are "the initial value for the X AudioParam" — set
    // through the value attribute (float32 boundary + the TypeError of the
    // WebIDL float conversion), leaving defaultValue at the spec default.
    if (playbackRate !== undefined) {
      this.playbackRate.value = assertFiniteNumber('constructor', 'options.playbackRate', playbackRate)
    }
    if (detune !== undefined) {
      this.detune.value = assertFiniteNumber('constructor', 'options.detune', detune)
    }
    // Attribute setters validate (loop boolean; loopStart/loopEnd restricted double).
    this.loop = loop
    this.loopStart = loopStart
    this.loopEnd = loopEnd
    if (buffer !== undefined && buffer !== null) {
      this.buffer = buffer // setter: type check + [[buffer set]]
    }

    // Playback state (spec algorithm variables).
    this._playheadStarted = false // the algorithm's `started` (distinct from [[source started]])
    this._enteredLoop = false
    this._cursor = 0 // playhead in BUFFER-SAMPLE units (fractional; spec bufferTime × bufSr)
    this._offsetSamples = 0 // the algorithm's (clamped) `offset`, for the enteredLoop checks
    // bufferTimeElapsed, measured as Σ computedPlaybackRate over rendered
    // frames (content-seconds × contextSampleRate). Accumulating the raw rate
    // sum — not the per-frame seconds (rate/sr) — keeps the duration boundary
    // EXACT for the common constant/block-constant integer rates (2·N, 0.5·N
    // are exact doubles), so a grain ends on precisely the spec-computed frame
    // instead of one late from float drift. Compared against duration·sr.
    this._elapsedRateSum = 0
    this._startOffset = 0 // start()'s offset argument, seconds
    this._startDuration = Infinity // start()'s duration argument, seconds of buffer content
    // k-rate scratch blocks for the compound parameter (one alloc, reused).
    this._rateBlock = new Float32Array(RENDER_QUANTUM)
    this._detuneBlock = new Float32Array(RENDER_QUANTUM)
  }

  get buffer() {
    return this.#buffer
  }

  /**
   * Spec "To set the buffer attribute": WebIDL AudioBuffer? type check
   * (TypeError), then the [[buffer set]] one-shot gate (InvalidStateError on
   * a second NON-NULL assignment; null always allowed). Content acquisition
   * is the set-once slot itself (pleco ownership model, xa-buffer.js header).
   */
  set buffer(b) {
    if (b !== null && !(b instanceof PlecoAudioBuffer)) {
      throw new TypeError('PlecoAudioBufferSourceNode.buffer: value must be a PlecoAudioBuffer or null')
    }
    if (b !== null && this.#bufferSet) {
      throw invalidStateError(
        'PlecoAudioBufferSourceNode.buffer: buffer may only be set once ([[buffer set]])',
      )
    }
    if (b !== null) this.#bufferSet = true
    this.#buffer = b
  }

  get loop() {
    return this.#loop
  }

  set loop(v) {
    // WebIDL boolean; pleco strictness rejects truthy/falsy coercion.
    if (typeof v !== 'boolean') {
      throw new TypeError(`PlecoAudioBufferSourceNode.loop: value must be a boolean, got ${v}`)
    }
    this.#loop = v
  }

  get loopStart() {
    return this.#loopStart
  }

  set loopStart(v) {
    // Restricted double — negative or out-of-buffer values are LEGAL (the
    // playback algorithm falls back to whole-buffer endpoints).
    this.#loopStart = assertFiniteNumber('loopStart', 'value', v)
  }

  get loopEnd() {
    return this.#loopEnd
  }

  set loopEnd(v) {
    this.#loopEnd = assertFiniteNumber('loopEnd', 'value', v)
  }

  /**
   * start(when = 0, offset, duration) — spec § AudioBufferSourceNode start().
   * Argument conversion (TypeError, all three args) precedes the
   * [[source started]] InvalidStateError, which precedes the negative-value
   * RangeErrors (parameter constraints) — the spec's exact step order.
   */
  start(when = 0, offset = undefined, duration = undefined) {
    assertFiniteNumber('start', 'when', when)
    if (offset !== undefined) assertFiniteNumber('start', 'offset', offset)
    if (duration !== undefined) assertFiniteNumber('start', 'duration', duration)
    if (this._sourceStarted) {
      throw invalidStateError('PlecoAudioBufferSourceNode.start: start() has already been called on this source')
    }
    if (when < 0) {
      throw new RangeError(`PlecoAudioBufferSourceNode.start: when must be non-negative, got ${when}`)
    }
    if (offset !== undefined && offset < 0) {
      throw new RangeError(`PlecoAudioBufferSourceNode.start: offset must be non-negative, got ${offset}`)
    }
    if (duration !== undefined && duration < 0) {
      throw new RangeError(`PlecoAudioBufferSourceNode.start: duration must be non-negative, got ${duration}`)
    }
    this._startOffset = offset ?? 0
    this._startDuration = duration ?? Infinity
    super.start(when)
  }

  /**
   * Per-quantum window (the P05 base's algorithm) re-stated here because the
   * OUTPUT WIDTH tracks the content, not this.channelCount: the block has the
   * buffer's channel count while the source is live, one silent channel when
   * buffer is null or after the source has ended. Also applies the playback
   * algorithm's null-buffer line: `if (buffer == null) stop = currentTime`.
   */
  _process() {
    const buf = this.#buffer
    const width = buf !== null && !this._ended ? buf.numberOfChannels : 1
    const out = createPlecoAudioBuffer(width, RENDER_QUANTUM, this.context.sampleRate)
    if (this._ended || !this._sourceStarted) return out

    const blockStart = this.context._frame
    const blockEnd = blockStart + RENDER_QUANTUM

    if (buf === null) {
      // "force zero output for all time" — a stop at this block's start; the
      // stop-reached branch below then ends the source and queues `ended`.
      this._stopFrame = this._stopFrame === null ? blockStart : Math.min(this._stopFrame, blockStart)
    }

    const from = Math.max(this._startFrame, blockStart)
    const to = this._stopFrame === null ? blockEnd : Math.min(blockEnd, this._stopFrame)
    if (from < to) {
      const count = to - from
      const produced = this._dsp(out, from - blockStart, count)
      if (produced < count) {
        this._end() // buffer end / duration reached mid-window
        return out
      }
    }
    if (this._stopFrame !== null && this._stopFrame <= blockEnd) this._end()
    return out
  }

  /**
   * The normative playback algorithm for one active window: `count` frames at
   * block offset `offset`, every frame already inside [start, stop). Returns
   * frames produced; producing fewer than `count` ends the source (base).
   */
  _dsp(output, offset, count) {
    const buf = this.#buffer
    if (buf === null) return count // unreachable via _process (null forces a stop); kept total
    const len = buf.length
    const bufSr = buf.sampleRate

    // k-rate: playbackRate and detune sampled once, at the block's first
    // frame, combined as computedPlaybackRate = rate · 2^(detune/1200).
    const blockTime = this.context.currentTime
    const rate = this.playbackRate.fillBlock(this._rateBlock, blockTime)[0]
    const cents = this.detune.fillBlock(this._detuneBlock, blockTime)[0]
    const computedRate = rate * Math.pow(2, cents / 1200)
    // Playhead step per output frame, in buffer-sample units:
    // dt·computedRate seconds of content × bufSr samples per second.
    const step = (bufSr / this.context.sampleRate) * computedRate

    // Loop endpoints, also k-rate (algorithm preamble): effective
    // [actualLoopStart, actualLoopEnd) in buffer-sample units, whole buffer
    // when the endpoints are unset/invalid.
    const loop = this.#loop
    let loopStartS = 0
    let loopEndS = len
    if (loop) {
      if (this.#loopStart >= 0 && this.#loopEnd > 0 && this.#loopStart < this.#loopEnd) {
        loopStartS = this.#loopStart * bufSr
        loopEndS = Math.min(this.#loopEnd * bufSr, len)
      }
    } else {
      // "If the loop flag is false, remove any record of the loop having been entered"
      this._enteredLoop = false
    }
    const span = loopEndS - loopStartS

    if (!this._playheadStarted) {
      // Offset is "silently clamped to [0, duration]" when the start time is
      // reached (non-negative already guaranteed by start()'s RangeError),
      // then loop-clamped per the algorithm's started branch.
      let cursor = Math.min(this._startOffset, buf.duration) * bufSr
      if (loop && computedRate >= 0 && cursor >= loopEndS) cursor = loopEndS
      if (loop && computedRate < 0 && cursor < loopStartS) cursor = loopStartS
      // Sub-sample accurate start (spec § sub-sample scheduling): the source
      // began at the fractional frame _startFrameExact, but the first rendered
      // frame is its ceil (_startFrame). By that frame the playhead has already
      // advanced (_startFrame − _startFrameExact) context frames of content, so
      // seed the cursor and the elapsed sum with that partial step instead of
      // snapping the start to the integer frame.
      // Clamp to ≥ 0: when the exact start sits a hair ABOVE the integer frame
      // that frameCeil snapped it to, the raw difference is a sub-ULP negative
      // that would push the cursor below 0 and trip the buffer-bounds check,
      // dropping the grain's first frame entirely (an aligned start has no real
      // sub-sample offset).
      const subFrame = Math.max(0, this._startFrame - this._startFrameExact) // ∈ [0, 1)
      cursor += subFrame * step
      this._elapsedRateSum = subFrame * computedRate
      this._cursor = cursor
      this._offsetSamples = cursor // the algorithm mutates `offset`; entered checks use the clamped value
      this._playheadStarted = true
    }

    // Grain end target in the elapsed-sum's units (duration·sr). Infinity when
    // duration was omitted. A small tolerance absorbs the single rounding of
    // the multiply so a frame-aligned boundary resolves as "reached" (the sum
    // itself is exact for integer rates); it is orders of magnitude below one
    // frame's rate step, so it never silences a legitimately-playing frame.
    const durationTarget = this._startDuration * this.context.sampleRate - 1e-6

    const channels = buf.numberOfChannels
    const srcs = []
    const dsts = []
    for (let c = 0; c < channels; c++) {
      srcs.push(buf.getChannelData(c))
      dsts.push(output.getChannelData(c))
    }

    for (let j = 0; j < count; j++) {
      // duration reached → this frame (and all after) silent; producing
      // j < count frames makes the base end the source.
      if (this._elapsedRateSum >= durationTarget) return j

      if (loop) {
        if (!this._enteredLoop) {
          // playback began before/within the loop and the playhead has passed loopStart,
          if (this._offsetSamples < loopEndS && this._cursor >= loopStartS) this._enteredLoop = true
          // or began after the loop and the playhead has come back before loopEnd.
          if (this._offsetSamples >= loopEndS && this._cursor < loopEndS) this._enteredLoop = true
        }
        if (this._enteredLoop && (this._cursor >= loopEndS || this._cursor < loopStartS)) {
          // The algorithm's while-loops in closed form:
          // cursor = loopStart + ((cursor − loopStart) mod span), result in [loopStart, loopEnd).
          this._cursor = loopStartS + ((((this._cursor - loopStartS) % span) + span) % span)
        }
      }

      const cursor = this._cursor
      if (!(cursor >= 0 && cursor < len)) {
        // Playhead outside the buffer. If it is moving further away (or the
        // rate is 0) it can never re-enter → content exhausted, end here. If it
        // is instead heading back toward the buffer — a negative rate whose
        // start offset lands at or past the buffer end — emit silence this
        // frame (dst is already 0) and keep advancing until the playhead
        // re-enters (spec § Playback: out-of-range frames are silent, not the
        // end of playback, unless the playhead can never return).
        const heading = (cursor < 0 && step > 0) || (cursor >= len && step < 0)
        if (!heading) return j
      } else {
        const i0 = Math.floor(cursor)
        const frac = cursor - i0
        if (frac === 0) {
          // Exact frame — lossless copy (the rate-1 path stays bit-exact).
          for (let c = 0; c < channels; c++) dsts[c][offset + j] = srcs[c][i0]
        } else {
          const i1 = i0 + 1
          // Loop splice (spec playbackSignal): a neighbor at/after actualLoopEnd
          // wraps to the equivalent position after loopStart, itself interpolated.
          const splice = loop && this._enteredLoop && i1 >= loopEndS
          let p = 0
          let k = 0
          let kf = 0
          if (splice) {
            p = loopStartS + (i1 - loopEndS)
            k = Math.floor(p)
            kf = p - k
          }
          for (let c = 0; c < channels; c++) {
            const data = srcs[c]
            const a = data[i0]
            let b
            if (splice) {
              const s0 = k >= 0 && k < len ? data[k] : 0
              const s1 = k + 1 < len ? data[k + 1] : s0
              b = kf === 0 ? s0 : s0 + (s1 - s0) * kf
            } else if (i1 < len) {
              b = data[i1]
            } else if (i0 >= 1) {
              // Past the last frame of a non-looping buffer: linearly
              // extrapolate the continuation (2·data[i0] − data[i0−1]) rather
              // than holding data[i0]. A buffer stitched to a successor ABSN
              // then keeps the signal's slope across the seam instead of
              // plateauing (spec resamples across the buffer end; WPT
              // "Extrapolation at end of AudioBuffer").
              b = 2 * a - data[i0 - 1]
            } else {
              b = a // single-frame buffer — nothing to extrapolate from
            }
            dsts[c][offset + j] = a + (b - a) * frac
          }
        }
      }

      this._cursor += step
      this._elapsedRateSum += computedRate // Σ computedPlaybackRate; SIGNED, spec-literal
    }
    return count
  }
}
