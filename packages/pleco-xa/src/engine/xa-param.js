/**
 * engine/xa-param.js — PlecoAudioParam: the full automation timeline (P04).
 *
 * Implements the spec's AudioParam surface (spec § The AudioParam Interface):
 * the five automation methods (setValueAtTime, linearRampToValueAtTime,
 * exponentialRampToValueAtTime, setTargetAtTime, setValueCurveAtTime) plus the
 * two cancel methods (cancelScheduledValues, cancelAndHoldAtTime), each
 * returning the param for chaining; the automationRate attribute ('a-rate' |
 * 'k-rate', WebIDL enum-attribute semantics: invalid assignment is silently
 * ignored) with an optional fixed-rate constraint (spec § automation rate
 * constraints — an InvalidStateError when a constrained rate is changed); and
 * computedValue rendering: paramIntrinsicValue from the event timeline, plus
 * the mono-mixed input AudioParam buffer from connected node outputs, clamped
 * to the simple nominal range [minValue, maxValue] only at output time (the
 * automation itself runs unclamped, per § Computation of Value).
 *
 * The curve evaluator uses the spec's exact normative formulas:
 *   linear       v(t) = V0 + (V1 − V0)·(t − T0)/(T1 − T0)
 *   exponential  v(t) = V0·(V1/V0)^((t − T0)/(T1 − T0))   — V0 = 0 or
 *                opposite-sign endpoints hold V0 until T1, per spec
 *   setTarget    v(t) = V1 + (V0 − V1)·e^(−(t − T0)/τ)    — τ = 0 jumps to V1
 *   setValueCurve k = ⌊(N − 1)·(t − T0)/T_D⌋, linear interpolation between
 *                V[k] and V[k+1]; holds V[N−1] after T0 + T_D
 * Event times stay exact doubles (spec: automation event times are not
 * quantized); float32 rounding (Math.fround) is applied where the spec's
 * WebIDL says float — method value arguments, the value attribute, and the
 * values held by cancelAndHoldAtTime (the held value passes through float32
 * output, so subsequent automation starts from the rounded value).
 *
 * Two spec slots back the value attribute (spec § Computation of Value):
 * [[current value]] (this._value) is the REPORTING slot — the value getter
 * returns its contents unclamped (clamping applies only to computedValue at
 * output time), and fillBlock refreshes it to paramIntrinsicValue at each
 * block start — while the timeline's pre-first-event base ("the value set
 * directly to the value attribute", #directValue) is written only by the
 * constructor and the value setter and is what evaluate() falls back to
 * before the first event. Keeping the two separate stops the per-quantum
 * bookkeeping from feeding back into the timeline (which would re-anchor a
 * first-event setTargetAtTime's V0 at every block start).
 *
 * Errors follow the WebIDL binding layer: non-finite time arguments (their
 * IDL type is restricted `double`) throw TypeError; RangeError is reserved
 * for the spec's negative-time constraint. Rejecting non-number arguments
 * outright (e.g. setValueAtTime('1', 0)) instead of coercing via WebIDL
 * ToNumber is deliberate pleco strictness, not spec behavior.
 *
 * DEVIATION (recorded for P08): the spec's AudioParam has no constructor —
 * params are only vended by nodes. PlecoAudioParam stays publicly
 * constructible because nodes/xa-buffer-source.js (owned by a concurrent
 * slice) constructs playbackRate/detune via `new PlecoAudioParam(options)`;
 * P08 finishes the non-constructibility guard when it reworks that node.
 */

import { PlecoAudioPort } from './xa-ports.js'
import { RENDER_QUANTUM } from './xa-constants.js'
import { createPlecoAudioBuffer } from './xa-buffer.js'
import { mixInto } from './xa-channel-mixing.js'
import { invalidStateError, notSupportedError } from './xa-errors.js'

const F32_MAX = 3.4028234663852886e38

/**
 * Time arguments are WebIDL restricted `double`s: non-finite (NaN/±Infinity)
 * is a binding-layer TypeError, before the spec's argumentdef constraint can
 * run; RangeError is only the negative-time constraint. (Rejecting non-number
 * types instead of ToNumber coercion is pleco strictness — see file header.)
 */
function assertTime(method, name, t) {
  if (typeof t !== 'number' || !Number.isFinite(t)) {
    throw new TypeError(`PlecoAudioParam.${method}: ${name} must be a finite number, got ${t}`)
  }
  if (t < 0) {
    throw new RangeError(`PlecoAudioParam.${method}: ${name} must be non-negative, got ${t}`)
  }
}

/** WebIDL float conversion: non-finite throws TypeError; finite values round to float32. */
function toFloatValue(method, name, v) {
  if (typeof v !== 'number' || !Number.isFinite(v)) {
    throw new TypeError(`PlecoAudioParam.${method}: ${name} must be a finite number, got ${v}`)
  }
  return Math.fround(v)
}

function clampTo(v, min, max) {
  return Math.min(max, Math.max(min, v))
}

/**
 * paramIntrinsicValue at time `t` from a sorted event list (spec § Computation
 * of Value). `fallback` is the timeline's pre-first-event base — "the value
 * set directly to the value attribute" (#directValue), NEVER the per-quantum
 * [[current value]] bookkeeping. `limit` restricts evaluation to
 * events[0, limit) — used recursively so a setTarget's V0 is the value the
 * timeline had just before the setTarget started.
 */
function evaluate(events, t, fallback, limit = events.length) {
  let prevIdx = -1
  let next = null
  for (let i = 0; i < limit; i++) {
    if (events[i].time <= t) prevIdx = i
    else {
      next = events[i]
      break
    }
  }
  if (prevIdx === -1) return fallback
  const prev = events[prevIdx]

  if (next !== null && (next.type === 'linearRamp' || next.type === 'exponentialRamp')) {
    // Ramp segment: T0/V0 come from the end of the previous event. A curve's
    // effective end is T0 + T_D (the spec's implicit setValueAtTime there).
    const T0 = prev.type === 'setValueCurve' ? prev.time + prev.duration : prev.time
    if (t < T0) return valueFromEvent(events, prevIdx, t, fallback) // still inside the previous curve window
    const V0 = valueFromEvent(events, prevIdx, T0, fallback)
    const T1 = next.time
    const V1 = next.value
    if (T1 <= T0) return V0 // degenerate segment — value jumps to V1 at T1 (t < T1 here)
    if (next.type === 'linearRamp') {
      return V0 + (V1 - V0) * ((t - T0) / (T1 - T0))
    }
    // exponential: V0 = 0 or opposite signs hold V0 for T0 ≤ t < T1, per spec
    if (V0 === 0 || V0 < 0 !== V1 < 0) return V0
    return V0 * Math.pow(V1 / V0, (t - T0) / (T1 - T0))
  }
  return valueFromEvent(events, prevIdx, t, fallback)
}

/** Value contributed by events[i] (the last event at or before `t`) at time `t`. */
function valueFromEvent(events, i, t, fallback) {
  const e = events[i]
  switch (e.type) {
    case 'setValue':
    case 'linearRamp':
    case 'exponentialRamp':
      return e.value
    case 'setValueCurve': {
      // `duration` is the effective window (cancelAndHoldAtTime may truncate
      // it); `sampleDuration` is the ORIGINAL duration the sampling formula
      // must keep using so a truncated curve produces the same output.
      const end = e.time + e.duration
      const tt = t < end ? t : end
      const N = e.values.length
      const x = ((N - 1) * (tt - e.time)) / e.sampleDuration
      const k = Math.floor(x)
      if (k >= N - 1) return e.values[N - 1]
      return e.values[k] + (e.values[k + 1] - e.values[k]) * (x - k)
    }
    case 'setTarget': {
      // V0 is the value just before the setTarget starts — the timeline
      // evaluated at e.time using only the events preceding this one.
      const v0 = evaluate(events, e.time, fallback, i)
      if (e.timeConstant === 0) return e.target // spec: τ = 0 jumps immediately to the target
      return e.target + (v0 - e.target) * Math.exp(-(t - e.time) / e.timeConstant)
    }
    default:
      throw invalidStateError(`PlecoAudioParam: unknown automation event type '${e.type}'`)
  }
}

/** Is the timeline constant from time `t` onward? (No pending events, no live setTarget/curve.) */
function isFlatAfter(events, t) {
  if (events.length === 0) return true
  for (const e of events) if (e.time > t) return false
  const last = events[events.length - 1]
  if (last.type === 'setTarget') return false
  if (last.type === 'setValueCurve' && t < last.time + last.duration) return false
  return true
}

export class PlecoAudioParam {
  #defaultValue
  #minValue
  #maxValue
  // The timeline's pre-first-event base: "the value set directly to the value
  // attribute" (spec § Computation of Value, step 1). Written ONLY by the
  // constructor and the value setter — never by per-quantum rendering.
  #directValue

  /**
   * `context` is the owning node's BaseAudioContext (used by
   * PlecoNode.connect for the spec's cross-context InvalidAccessError check
   * and for the automation clock); `_input` is the param's input port —
   * node→param connections land here as bidirectional edges (xa-ports.js).
   * `automationRate` seeds the attribute ('a-rate' default);
   * `fixedAutomationRate: true` applies the spec's automation rate constraint
   * (changing the rate throws InvalidStateError).
   */
  constructor({
    defaultValue = 0,
    minValue = -F32_MAX,
    maxValue = F32_MAX,
    automationRate = 'a-rate',
    fixedAutomationRate = false,
    context = null,
  } = {}) {
    if (automationRate !== 'a-rate' && automationRate !== 'k-rate') {
      throw new TypeError(
        `PlecoAudioParam: automationRate must be 'a-rate' | 'k-rate', got ${automationRate}`,
      )
    }
    this.#defaultValue = Math.fround(defaultValue)
    this.#minValue = Math.fround(minValue)
    this.#maxValue = Math.fround(maxValue)
    this._automationRate = automationRate
    this._fixedAutomationRate = fixedAutomationRate === true
    this._value = this.#defaultValue // the spec's [[current value]] slot (reporting)
    this.#directValue = this.#defaultValue // the timeline's pre-first-event base
    this._context = context
    this._events = [] // automation events, ascending .time, same-time events in insertion order
    this._input = new PlecoAudioPort(this, 0)
  }

  get defaultValue() {
    return this.#defaultValue
  }

  get minValue() {
    return this.#minValue
  }

  get maxValue() {
    return this.#maxValue
  }

  get automationRate() {
    return this._automationRate
  }

  set automationRate(v) {
    if (v !== 'a-rate' && v !== 'k-rate') return // WebIDL enum attribute: invalid assignment is silently ignored
    if (this._fixedAutomationRate && v !== this._automationRate) {
      throw invalidStateError(
        `PlecoAudioParam: automationRate is fixed at '${this._automationRate}' for this param`,
      )
    }
    this._automationRate = v
  }

  get value() {
    // Spec: "Getting this attribute returns the contents of the
    // [[current value]] slot" — UNCLAMPED. Clamping to the nominal range
    // applies only to computedValue at output time (§ Computation of Value).
    return Math.fround(this._value)
  }

  set value(v) {
    if (typeof v !== 'number' || !Number.isFinite(v)) {
      throw new TypeError(`AudioParam.value must be a finite number, got ${v}`)
    }
    const f = Math.fround(v)
    // Spec: setting value assigns [[current value]] AND calls
    // setValueAtTime(value, currentTime); its exceptions (NotSupportedError
    // inside an active curve) propagate — leaving both slots untouched.
    this.setValueAtTime(f, this._now)
    this._value = f
    this.#directValue = f
  }

  /** Context clock for clamping event times ("clamped to currentTime"). Bare params sit at t = 0. */
  get _now() {
    return this._context !== null ? this._context.currentTime : 0
  }

  /** paramIntrinsicValue at time `t` — automation timeline only, pre-clamp, pre-input. */
  _intrinsicValueAt(t) {
    return evaluate(this._events, t, this.#directValue)
  }

  /** Insert after any events with the same time (spec ordering rule). */
  _insertEvent(event) {
    const events = this._events
    let i = events.length
    while (i > 0 && events[i - 1].time > event.time) i--
    events.splice(i, 0, event)
    return event
  }

  /** Spec: NotSupportedError if an automation method is called at a time inside an existing curve's [T, T+D). */
  _assertOutsideCurves(method, t) {
    for (const e of this._events) {
      if (e.type === 'setValueCurve' && t >= e.time && t < e.time + e.duration) {
        throw notSupportedError(
          `PlecoAudioParam.${method}: time ${t} lies inside an existing setValueCurve [${e.time}, ${e.time + e.duration})`,
        )
      }
    }
  }

  setValueAtTime(value, startTime) {
    const v = toFloatValue('setValueAtTime', 'value', value)
    assertTime('setValueAtTime', 'startTime', startTime)
    const t = Math.max(startTime, this._now)
    this._assertOutsideCurves('setValueAtTime', t)
    this._insertEvent({ type: 'setValue', time: t, value: v })
    return this
  }

  linearRampToValueAtTime(value, endTime) {
    return this._addRamp('linearRamp', 'linearRampToValueAtTime', value, endTime)
  }

  exponentialRampToValueAtTime(value, endTime) {
    return this._addRamp('exponentialRamp', 'exponentialRampToValueAtTime', value, endTime)
  }

  /**
   * Shared ramp scheduling. Two spec rules are resolved at schedule time:
   * (1) a ramp with no preceding event behaves as if setValueAtTime(current
   * value, currentTime) had been called — materialized as an implicit
   * setValue event; (2) a ramp whose preceding event is a setTarget takes T0
   * and V0 "from the current time and value of the SetTarget automation" — a
   * not-yet-started setTarget is replaced by a setValue pinned at its start
   * time and pre-start value, a running one is frozen with a setValue at the
   * current time and value. Both keep the curve continuous, per spec.
   */
  _addRamp(type, method, value, endTime) {
    const v = toFloatValue(method, 'value', value)
    assertTime(method, 'endTime', endTime)
    if (type === 'exponentialRamp' && v === 0) {
      throw new RangeError(`PlecoAudioParam.${method}: value must be non-zero`)
    }
    const t = Math.max(endTime, this._now)
    this._assertOutsideCurves(method, t)

    const events = this._events
    let idx = events.length
    while (idx > 0 && events[idx - 1].time > t) idx--
    if (idx === 0) {
      // "value is the current value of the attribute" — the UNCLAMPED
      // [[current value]] slot, via the (unclamped) getter.
      this._insertEvent({ type: 'setValue', time: this._now, value: this.value })
    } else {
      const prev = events[idx - 1]
      if (prev.type === 'setTarget') {
        const now = this._now
        if (prev.time >= now) {
          // setTarget has not started: the ramp effectively replaces it.
          const vBefore = evaluate(events, prev.time, this.#directValue, idx - 1)
          events[idx - 1] = { type: 'setValue', time: prev.time, value: vBefore }
        } else {
          // setTarget is running: freeze it at the current time and value.
          this._insertEvent({ type: 'setValue', time: now, value: evaluate(events, now, this.#directValue) })
        }
      }
    }
    this._insertEvent({ type, time: t, value: v })
    return this
  }

  setTargetAtTime(target, startTime, timeConstant) {
    const v = toFloatValue('setTargetAtTime', 'target', target)
    assertTime('setTargetAtTime', 'startTime', startTime)
    if (typeof timeConstant !== 'number' || !Number.isFinite(timeConstant)) {
      throw new TypeError(
        `PlecoAudioParam.setTargetAtTime: timeConstant must be a finite number, got ${timeConstant}`,
      )
    }
    const tau = Math.fround(timeConstant)
    if (tau < 0) {
      throw new RangeError(
        `PlecoAudioParam.setTargetAtTime: timeConstant must be non-negative, got ${timeConstant}`,
      )
    }
    const t = Math.max(startTime, this._now)
    this._assertOutsideCurves('setTargetAtTime', t)
    this._insertEvent({ type: 'setTarget', time: t, target: v, timeConstant: tau })
    return this
  }

  setValueCurveAtTime(values, startTime, duration) {
    if (values == null || typeof values.length !== 'number') {
      throw new TypeError('PlecoAudioParam.setValueCurveAtTime: values must be a sequence of floats')
    }
    // sequence<float>: an internal float32 copy — later mutation of the passed
    // array has no effect (spec), and each element is float32-rounded.
    const curve = new Float32Array(values.length)
    for (let i = 0; i < values.length; i++) {
      curve[i] = toFloatValue('setValueCurveAtTime', `values[${i}]`, values[i])
    }
    assertTime('setValueCurveAtTime', 'startTime', startTime)
    if (typeof duration !== 'number' || !Number.isFinite(duration) || duration <= 0) {
      throw new RangeError(
        `PlecoAudioParam.setValueCurveAtTime: duration must be a strictly positive finite number, got ${duration}`,
      )
    }
    if (curve.length < 2) {
      throw invalidStateError(
        `PlecoAudioParam.setValueCurveAtTime: values must contain at least 2 elements, got ${curve.length}`,
      )
    }
    const t = Math.max(startTime, this._now)
    this._assertOutsideCurves('setValueCurveAtTime', t)
    const end = t + duration
    for (const e of this._events) {
      if (e.time > t && e.time < end) {
        throw notSupportedError(
          `PlecoAudioParam.setValueCurveAtTime: an existing event at ${e.time} lies strictly inside (${t}, ${end})`,
        )
      }
    }
    this._insertEvent({ type: 'setValueCurve', time: t, duration, sampleDuration: duration, values: curve })
    return this
  }

  cancelScheduledValues(cancelTime) {
    assertTime('cancelScheduledValues', 'cancelTime', cancelTime)
    const tc = Math.max(cancelTime, this._now)
    // Remove events at/after tc; a setValueCurve whose [T0, T0+TD] contains tc
    // is removed whole (spec).
    this._events = this._events.filter((e) => {
      if (e.time >= tc) return false
      if (e.type === 'setValueCurve' && tc <= e.time + e.duration) return false
      return true
    })
    return this
  }

  cancelAndHoldAtTime(cancelTime) {
    assertTime('cancelAndHoldAtTime', 'cancelTime', cancelTime)
    const tc = Math.max(cancelTime, this._now)
    const events = this._events
    // E1: last event at or before tc; E2: first event after tc (spec algorithm).
    let i2 = -1
    for (let i = 0; i < events.length; i++) {
      if (events[i].time > tc) {
        i2 = i
        break
      }
    }
    const E2 = i2 === -1 ? null : events[i2]
    const E1 = i2 === -1 ? (events.length > 0 ? events[events.length - 1] : null) : i2 > 0 ? events[i2 - 1] : null

    let dropCurve = null
    if (E2 !== null && (E2.type === 'linearRamp' || E2.type === 'exponentialRamp')) {
      // Rewrite E2 to the same kind of ramp ending at tc with the value the
      // original ramp would have had there — float32-rounded, because held
      // values pass through float32 output.
      E2.value = Math.fround(evaluate(events, tc, this.#directValue))
      E2.time = tc
    } else if (E1 !== null) {
      if (E1.type === 'setTarget') {
        // Implicit setValueAtTime at tc with the setTarget's value there.
        this._insertEvent({ type: 'setValue', time: tc, value: Math.fround(evaluate(events, tc, this.#directValue)) })
      } else if (E1.type === 'setValueCurve' && tc < E1.time + E1.duration) {
        if (tc <= E1.time) {
          // cancelAndHold exactly at the curve's START (tc === E1.time): the
          // curve never takes effect. Browsers (and the WPT audioparam-cancel-
          // and-hold "cancel setValueCurve now" case) hold the value the
          // timeline had just BEFORE the curve, not the curve's V[0]. The
          // spec's literal "new duration = tc − t₃ = 0" would instead sample
          // V[0]; pleco resolves toward observable browser behavior by dropping
          // the curve so the preceding events supply the held value.
          dropCurve = E1
        } else {
          // Truncate the curve window to [t3, tc] — sampleDuration keeps the
          // original duration so the truncated span reproduces the original output.
          E1.duration = tc - E1.time
        }
      }
    }
    // Remove all events after tc; also drop a curve cancelled at its own start.
    this._events = this._events.filter((e) => e.time <= tc && e !== dropCurve)
    return this
  }

  /**
   * Render this quantum's computedValue block into `out` (a RENDER_QUANTUM-
   * length Float32Array), starting at context time `startTime` (the block
   * start): paramIntrinsicValue from the timeline, plus the mono-mixed input
   * AudioParam buffer (every connected output summed then down-mixed to one
   * channel, spec § rendering loop), NaN sums replaced by defaultValue, then
   * clamped to [minValue, maxValue]. a-rate evaluates per sample-frame;
   * k-rate samples once at the first frame and fills the block. Also sets
   * [[current value]] to the intrinsic value at the block start (spec
   * § Computation of Value). Returns `out`.
   */
  fillBlock(out, startTime = this._context !== null ? this._context.currentTime : 0) {
    const events = this._events
    const conns = this._input.connections
    const hasInput = conns.length > 0

    // Constant fast path: no automation, no modulation input — the intrinsic
    // value IS the directly-set value; refresh [[current value]] to it.
    if (!hasInput && events.length === 0) {
      this._value = this.#directValue
      out.fill(Math.fround(clampTo(this.#directValue, this.#minValue, this.#maxValue)))
      return out
    }
    if (this._context === null) {
      throw invalidStateError(
        'PlecoAudioParam.fillBlock: rendering automation or input connections requires an owning context',
      )
    }
    const sr = this._context.sampleRate
    const min = this.#minValue
    const max = this.#maxValue
    const def = this.#defaultValue

    let inputData = null
    if (hasInput) {
      const mono = createPlecoAudioBuffer(1, RENDER_QUANTUM, sr)
      for (const port of conns) mixInto(mono, port._pull(), 'speakers')
      inputData = mono.getChannelData(0)
    }

    // [[current value]] ← intrinsic at block start. This is REPORTING output
    // only (the value getter); the timeline keeps evaluating against
    // #directValue — feeding _value back in would re-anchor a first-event
    // setTarget's V0 at every block start, compounding the decay.
    const intrinsicStart = evaluate(events, startTime, this.#directValue)
    this._value = Math.fround(intrinsicStart)

    if (this._automationRate === 'k-rate') {
      // k-rate: sampled at the very first sample-frame, used for the whole block.
      let v = intrinsicStart + (inputData !== null ? inputData[0] : 0)
      if (Number.isNaN(v)) v = def
      out.fill(Math.fround(clampTo(v, min, max)))
      return out
    }

    // a-rate constant fast path: timeline flat from here on, nothing to modulate.
    if (inputData === null && isFlatAfter(events, startTime)) {
      out.fill(Math.fround(clampTo(intrinsicStart, min, max)))
      return out
    }

    const f0 = Math.round(startTime * sr)
    for (let i = 0; i < out.length; i++) {
      let v = evaluate(events, (f0 + i) / sr, this.#directValue)
      if (inputData !== null) v += inputData[i]
      if (Number.isNaN(v)) v = def
      out[i] = clampTo(v, min, max)
    }
    return out
  }
}
