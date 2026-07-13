import { describe, it, expect } from 'vitest'
import { PlecoBaseContext } from '../src/engine/xa-base-context.js'
import { PlecoOfflineContext } from '../src/engine/xa-offline-context.js'
import { PlecoAudioParam } from '../src/engine/xa-param.js'
import { RENDER_QUANTUM } from '../src/engine/xa-constants.js'

// P04 — the AudioParam automation timeline: the five automation methods + two
// cancel methods (chaining, spec validation errors), the curve evaluator with
// the spec's exact interpolation formulas (linear, exponential, setTarget,
// setValueCurve sampling), automationRate a-rate/k-rate block fills, the
// float32 semantics of cancelAndHoldAtTime, and computedValue = intrinsic +
// mono-mixed connected input, clamped to [minValue, maxValue].

// SR chosen so one render quantum is exactly 128/8192 = 0.015625 s (binary-exact).
const SR = 8192
const BLOCK = RENDER_QUANTUM / SR // 0.015625

const makeCtx = () => new PlecoBaseContext({ sampleRate: SR, numberOfChannels: 1 })

const makeParam = (ctx, options = {}) => new PlecoAudioParam({ context: ctx, ...options })

/** A started buffer-source producing a constant `value` on `channels` channels. */
function makeConstSource(context, value, channels = 1, length = RENDER_QUANTUM * 4) {
  const buf = context.createBuffer(channels, length, SR)
  for (let c = 0; c < channels; c++) {
    buf.getChannelData(c).fill(Array.isArray(value) ? value[c] : value)
  }
  const s = context.createBufferSource()
  s.buffer = buf
  s.start(0)
  return s
}

const advance = (ctx, quanta = 1) => {
  for (let i = 0; i < quanta; i++) ctx.renderQuantum()
}

/** Assert fn throws a DOMException with the exact spec name. */
const throwsName = (fn, name) => {
  let caught = null
  try {
    fn()
  } catch (err) {
    caught = err
  }
  expect(caught).not.toBeNull()
  expect(caught).toBeInstanceOf(DOMException)
  expect(caught.name).toBe(name)
}

describe('PlecoAudioParam — chaining', () => {
  it('all seven automation methods return the param', () => {
    const p = makeParam(makeCtx(), { defaultValue: 1 })
    expect(p.setValueAtTime(1, 0)).toBe(p)
    expect(p.linearRampToValueAtTime(2, 1)).toBe(p)
    expect(p.exponentialRampToValueAtTime(1, 2)).toBe(p)
    expect(p.setTargetAtTime(0, 3, 0.1)).toBe(p)
    expect(p.setValueCurveAtTime([0, 1], 5, 1)).toBe(p)
    expect(p.cancelScheduledValues(4)).toBe(p)
    expect(p.cancelAndHoldAtTime(3.5)).toBe(p)
  })
})

describe('PlecoAudioParam — validation errors', () => {
  it('setValueAtTime: RangeError for negative times, TypeError for non-finite times (WebIDL restricted double) and non-finite values', () => {
    const p = makeParam(makeCtx())
    expect(() => p.setValueAtTime(1, -0.5)).toThrow(RangeError)
    expect(() => p.setValueAtTime(1, NaN)).toThrow(TypeError)
    expect(() => p.setValueAtTime(1, Infinity)).toThrow(TypeError)
    expect(() => p.setValueAtTime(NaN, 0)).toThrow(TypeError)
    expect(() => p.setValueAtTime(Infinity, 0)).toThrow(TypeError)
    expect(() => p.setValueAtTime('1', 0)).toThrow(TypeError) // pleco strictness: no ToNumber coercion
  })

  it('linearRampToValueAtTime: same time/value validation', () => {
    const p = makeParam(makeCtx())
    expect(() => p.linearRampToValueAtTime(1, -1)).toThrow(RangeError)
    expect(() => p.linearRampToValueAtTime(1, NaN)).toThrow(TypeError)
    expect(() => p.linearRampToValueAtTime(NaN, 1)).toThrow(TypeError)
  })

  it('exponentialRampToValueAtTime: RangeError for zero value (incl. float32 underflow); negative values allowed', () => {
    const p = makeParam(makeCtx(), { defaultValue: 1 })
    expect(() => p.exponentialRampToValueAtTime(0, 1)).toThrow(RangeError)
    expect(() => p.exponentialRampToValueAtTime(-0, 1)).toThrow(RangeError)
    expect(() => p.exponentialRampToValueAtTime(1e-46, 1)).toThrow(RangeError) // rounds to 0 in float32
    expect(() => p.exponentialRampToValueAtTime(-2, 1)).not.toThrow()
  })

  it('setTargetAtTime: RangeError for negative timeConstant/startTime, TypeError for non-finite timeConstant', () => {
    const p = makeParam(makeCtx())
    expect(() => p.setTargetAtTime(1, 0, -0.1)).toThrow(RangeError)
    expect(() => p.setTargetAtTime(1, -1, 0.1)).toThrow(RangeError)
    expect(() => p.setTargetAtTime(1, 0, NaN)).toThrow(TypeError)
    expect(() => p.setTargetAtTime(NaN, 0, 0.1)).toThrow(TypeError)
  })

  it('setValueCurveAtTime: InvalidStateError for <2 values, TypeError for bad entries, RangeError for bad times', () => {
    const p = makeParam(makeCtx())
    throwsName(() => p.setValueCurveAtTime([1], 0, 1), 'InvalidStateError')
    expect(() => p.setValueCurveAtTime([0, NaN], 0, 1)).toThrow(TypeError)
    expect(() => p.setValueCurveAtTime(null, 0, 1)).toThrow(TypeError)
    expect(() => p.setValueCurveAtTime([0, 1], -1, 1)).toThrow(RangeError)
    expect(() => p.setValueCurveAtTime([0, 1], 0, 0)).toThrow(RangeError)
    expect(() => p.setValueCurveAtTime([0, 1], 0, -1)).toThrow(RangeError)
    expect(() => p.setValueCurveAtTime([0, 1], 0, NaN)).toThrow(RangeError)
  })

  it('cancel methods: RangeError for negative cancelTime, TypeError for non-finite cancelTime', () => {
    const p = makeParam(makeCtx())
    expect(() => p.cancelScheduledValues(-1)).toThrow(RangeError)
    expect(() => p.cancelScheduledValues(NaN)).toThrow(TypeError)
    expect(() => p.cancelAndHoldAtTime(-1)).toThrow(RangeError)
    expect(() => p.cancelAndHoldAtTime(Infinity)).toThrow(TypeError)
  })
})

describe('PlecoAudioParam — setValueCurveAtTime overlap rules (NotSupportedError)', () => {
  it('an automation method at a time inside an existing curve [T, T+D) throws; T+D is allowed', () => {
    const p = makeParam(makeCtx())
    p.setValueCurveAtTime([0, 1], 1, 1) // occupies [1, 2)
    throwsName(() => p.setValueAtTime(1, 1.5), 'NotSupportedError')
    throwsName(() => p.setValueAtTime(1, 1), 'NotSupportedError') // T itself is contained
    throwsName(() => p.linearRampToValueAtTime(1, 1.5), 'NotSupportedError')
    throwsName(() => p.setTargetAtTime(1, 1.5, 0.1), 'NotSupportedError')
    expect(() => p.setValueAtTime(1, 2)).not.toThrow() // exactly at T+D — outside [T, T+D)
  })

  it('a new curve containing an existing event strictly inside (T, T+D) throws; boundary events are allowed', () => {
    const p = makeParam(makeCtx())
    p.setValueAtTime(1, 1.5)
    throwsName(() => p.setValueCurveAtTime([0, 1], 1, 1), 'NotSupportedError') // 1.5 ∈ (1, 2)
    expect(() => p.setValueCurveAtTime([0, 1], 1.5, 1)).not.toThrow() // curve exactly AT the event time is ok
    expect(() => p.setValueCurveAtTime([0, 1], 0.5, 1)).not.toThrow() // 1.5 is exactly T+D — not strictly inside
  })

  it('two overlapping curves throw; back-to-back curves are allowed', () => {
    const p = makeParam(makeCtx())
    p.setValueCurveAtTime([0, 1], 1, 1) // [1, 2)
    throwsName(() => p.setValueCurveAtTime([0, 1], 1.5, 1), 'NotSupportedError') // starts inside
    throwsName(() => p.setValueCurveAtTime([0, 1], 0.5, 1), 'NotSupportedError') // existing start strictly inside
    expect(() => p.setValueCurveAtTime([0, 1], 2, 1)).not.toThrow() // starts exactly at the end
  })

  it('setting .value while currentTime is inside an active curve throws NotSupportedError', () => {
    const p = makeParam(makeCtx(), { defaultValue: 0.5 })
    p.setValueCurveAtTime([0, 1], 0, 1) // [0, 1) contains currentTime 0
    throwsName(() => {
      p.value = 0.3
    }, 'NotSupportedError')
    expect(p.value).toBe(0.5) // unchanged
  })
})

describe('PlecoAudioParam — curve evaluator (spec formulas, hand-computed)', () => {
  it('setValueAtTime: step function, later same-time event wins, ordering by time', () => {
    const p = makeParam(makeCtx(), { defaultValue: 0.25 })
    p.setValueAtTime(3, 1)
    p.setValueAtTime(1, 0.5)
    p.setValueAtTime(2, 0.5) // same time, scheduled later — wins
    expect(p._intrinsicValueAt(0.25)).toBe(0.25) // before all events: [[current value]]
    expect(p._intrinsicValueAt(0.5)).toBe(2)
    expect(p._intrinsicValueAt(0.75)).toBe(2)
    expect(p._intrinsicValueAt(1)).toBe(3)
    expect(p._intrinsicValueAt(9)).toBe(3)
  })

  it('linearRampToValueAtTime: v(t) = V0 + (V1 − V0)·(t − T0)/(T1 − T0), on float32 endpoints', () => {
    const p = makeParam(makeCtx())
    p.setValueAtTime(0.1, 0)
    p.linearRampToValueAtTime(0.9, 2)
    const V0 = Math.fround(0.1)
    const V1 = Math.fround(0.9)
    expect(p._intrinsicValueAt(0)).toBe(V0)
    expect(p._intrinsicValueAt(0.5)).toBe(V0 + (V1 - V0) * ((0.5 - 0) / (2 - 0)))
    expect(p._intrinsicValueAt(1.5)).toBe(V0 + (V1 - V0) * ((1.5 - 0) / (2 - 0)))
    expect(p._intrinsicValueAt(2)).toBe(V1)
    expect(p._intrinsicValueAt(5)).toBe(V1) // holds the end value
  })

  it('exponentialRampToValueAtTime: v(t) = V0·(V1/V0)^((t − T0)/(T1 − T0))', () => {
    const p = makeParam(makeCtx())
    p.setValueAtTime(1, 0)
    p.exponentialRampToValueAtTime(2, 1)
    expect(p._intrinsicValueAt(0.25)).toBe(1 * Math.pow(2 / 1, (0.25 - 0) / (1 - 0)))
    expect(p._intrinsicValueAt(0.5)).toBe(1 * Math.pow(2 / 1, (0.5 - 0) / (1 - 0)))
    expect(p._intrinsicValueAt(1)).toBe(2)
  })

  it('exponential ramp holds V0 when V0 = 0 or endpoints have opposite signs, then jumps to V1 at T1', () => {
    const zero = makeParam(makeCtx())
    zero.setValueAtTime(0, 0)
    zero.exponentialRampToValueAtTime(1, 1)
    expect(zero._intrinsicValueAt(0.5)).toBe(0)
    expect(zero._intrinsicValueAt(1)).toBe(1)

    const flip = makeParam(makeCtx())
    flip.setValueAtTime(1, 0)
    flip.exponentialRampToValueAtTime(-2, 1)
    expect(flip._intrinsicValueAt(0.5)).toBe(1)
    expect(flip._intrinsicValueAt(1)).toBe(-2)
    expect(flip._intrinsicValueAt(1.5)).toBe(-2)
  })

  it('setTargetAtTime: v(t) = V1 + (V0 − V1)·e^(−(t − T0)/τ); τ = 0 jumps to the target', () => {
    const p = makeParam(makeCtx())
    p.setValueAtTime(1, 0)
    p.setTargetAtTime(0.25, 0.5, 0.125)
    expect(p._intrinsicValueAt(0.4)).toBe(1) // before the setTarget starts
    expect(p._intrinsicValueAt(0.75)).toBe(0.25 + (1 - 0.25) * Math.exp(-(0.75 - 0.5) / 0.125))
    expect(p._intrinsicValueAt(2)).toBe(0.25 + (1 - 0.25) * Math.exp(-(2 - 0.5) / 0.125))

    const jump = makeParam(makeCtx())
    jump.setValueAtTime(1, 0)
    jump.setTargetAtTime(5, 0.5, 0)
    expect(jump._intrinsicValueAt(0.4)).toBe(1)
    expect(jump._intrinsicValueAt(0.5)).toBe(5)
  })

  it('setTarget ends at the time of the next event', () => {
    const p = makeParam(makeCtx())
    p.setValueAtTime(1, 0)
    p.setTargetAtTime(0, 0.25, 0.1)
    p.setValueAtTime(0.8, 0.5)
    expect(p._intrinsicValueAt(0.4)).toBe(0 + (1 - 0) * Math.exp(-(0.4 - 0.25) / Math.fround(0.1)))
    expect(p._intrinsicValueAt(0.5)).toBe(Math.fround(0.8))
    expect(p._intrinsicValueAt(0.6)).toBe(Math.fround(0.8))
  })

  it('setValueCurveAtTime: k = ⌊(N−1)(t−T0)/T_D⌋ with linear interpolation, holding V[N−1] after the end', () => {
    const p = makeParam(makeCtx())
    p.setValueCurveAtTime([0, 1, 2, 3], 1, 3) // N=4, x(t) = (t − 1)
    expect(p._intrinsicValueAt(1)).toBe(0)
    expect(p._intrinsicValueAt(1.4)).toBe(0 + (1 - 0) * (((4 - 1) * (1.4 - 1)) / 3)) // x, k = 0 — same double arithmetic as the sampler
    expect(p._intrinsicValueAt(2.5)).toBe(1.5)
    expect(p._intrinsicValueAt(4)).toBe(3)
    expect(p._intrinsicValueAt(9)).toBe(3)
  })

  it('setValueCurveAtTime interpolates between float32-rounded values and copies the input array', () => {
    const p = makeParam(makeCtx())
    const values = [0.1, 0.3]
    p.setValueCurveAtTime(values, 0, 1)
    values[1] = 99 // mutation after the call has no effect (internal copy)
    const V0 = Math.fround(0.1)
    const V1 = Math.fround(0.3)
    expect(p._intrinsicValueAt(0.5)).toBe(V0 + (V1 - V0) * 0.5)
    expect(p._intrinsicValueAt(2)).toBe(V1)
  })

  it('a ramp after a curve starts from the curve end (implicit setValueAtTime at T0 + T_D with V[N−1])', () => {
    const p = makeParam(makeCtx())
    p.setValueCurveAtTime([0, 0.5], 0, 1)
    p.linearRampToValueAtTime(1, 2)
    expect(p._intrinsicValueAt(1.5)).toBe(0.5 + (1 - 0.5) * ((1.5 - 1) / (2 - 1)))
  })

  it('a ramp with no preceding event behaves as setValueAtTime(currentValue, currentTime)', () => {
    const p = makeParam(makeCtx(), { defaultValue: 0.5 })
    p.linearRampToValueAtTime(1.5, 1)
    expect(p._intrinsicValueAt(0)).toBe(0.5)
    expect(p._intrinsicValueAt(0.5)).toBe(0.5 + (1.5 - 0.5) * ((0.5 - 0) / (1 - 0)))
    expect(p._intrinsicValueAt(1)).toBe(1.5)
  })

  it('a ramp scheduled after a NOT-YET-STARTED setTarget replaces it (T0 = setTarget start, V0 = value before)', () => {
    const p = makeParam(makeCtx())
    p.setValueAtTime(1, 0)
    p.setTargetAtTime(0, 0.5, 0.2)
    p.linearRampToValueAtTime(2, 1) // currentTime 0 < 0.5 — setTarget has not started
    // The exponential approach is GONE: values lie on the line (0.5, 1) → (1, 2).
    expect(p._intrinsicValueAt(0.6)).toBe(1 + (2 - 1) * ((0.6 - 0.5) / (1 - 0.5)))
    expect(p._intrinsicValueAt(0.75)).toBe(1 + (2 - 1) * ((0.75 - 0.5) / (1 - 0.5)))
    expect(p._intrinsicValueAt(0.5)).toBe(1)
  })

  it('a ramp scheduled while a setTarget IS RUNNING freezes it at the current time and value', () => {
    const ctx = makeCtx()
    const p = makeParam(ctx)
    const tau = BLOCK // 0.015625
    p.setValueAtTime(1, 0)
    p.setTargetAtTime(0, 0, tau)
    advance(ctx, 2) // currentTime = 2·BLOCK = 0.03125 — two time constants in
    const now = ctx.currentTime
    expect(now).toBe(0.03125)
    p.linearRampToValueAtTime(1, 0.0625)
    const vNow = 0 + (1 - 0) * Math.exp(-(now - 0) / tau) // e^{−2}
    expect(p._intrinsicValueAt(now)).toBe(vNow)
    const t = 0.046875 // halfway up the ramp
    expect(p._intrinsicValueAt(t)).toBe(vNow + (1 - vNow) * ((t - now) / (0.0625 - now)))
  })
})

describe('PlecoAudioParam — cancelScheduledValues', () => {
  it('removes events at/after cancelTime; earlier events survive', () => {
    const p = makeParam(makeCtx())
    p.setValueAtTime(1, 0)
    p.setValueAtTime(2, 0.5)
    p.setValueAtTime(3, 1)
    p.cancelScheduledValues(0.5)
    expect(p._intrinsicValueAt(2)).toBe(1)
  })

  it('an active ramp is cancelled whole — the pre-ramp value is restored (discontinuity)', () => {
    const p = makeParam(makeCtx())
    p.setValueAtTime(1, 0)
    p.linearRampToValueAtTime(3, 1)
    p.cancelScheduledValues(0.5) // ramp event time (1) ≥ 0.5 — removed
    expect(p._intrinsicValueAt(0.75)).toBe(1)
    expect(p._intrinsicValueAt(2)).toBe(1)
  })

  it('a setValueCurve is removed when cancelTime falls in [T0, T0+TD] (inclusive end)', () => {
    const p = makeParam(makeCtx())
    p.setValueAtTime(0.5, 0)
    p.setValueCurveAtTime([0, 1], 1, 1) // [1, 2]
    p.cancelScheduledValues(2) // exactly T0 + TD — still removed
    expect(p._intrinsicValueAt(1.5)).toBe(0.5)
  })
})

describe('PlecoAudioParam — cancelAndHoldAtTime (spec algorithm + float32 hold)', () => {
  it('a pending linear ramp is truncated at t_c with the float32-rounded value it would have had', () => {
    const p = makeParam(makeCtx())
    p.setValueAtTime(0, 0)
    p.linearRampToValueAtTime(1, 1)
    const tc = 1 / 3
    p.cancelAndHoldAtTime(tc)
    const held = Math.fround(0 + (1 - 0) * ((tc - 0) / (1 - 0))) // fround(1/3)
    expect(p._intrinsicValueAt(0.5)).toBe(held)
    expect(p._intrinsicValueAt(9)).toBe(held)
    // Mid-ramp still interpolates — now toward the float32 endpoint at t_c.
    const t = 1 / 6
    expect(p._intrinsicValueAt(t)).toBe(0 + (held - 0) * ((t - 0) / (tc - 0)))
  })

  it('a pending exponential ramp is truncated the same way, keeping the exponential shape', () => {
    const p = makeParam(makeCtx())
    p.setValueAtTime(1, 0)
    p.exponentialRampToValueAtTime(4, 1)
    p.cancelAndHoldAtTime(0.5)
    const held = Math.fround(1 * Math.pow(4 / 1, 0.5)) // fround(2) = 2
    expect(held).toBe(2)
    expect(p._intrinsicValueAt(0.75)).toBe(2)
    expect(p._intrinsicValueAt(0.25)).toBe(1 * Math.pow(2 / 1, (0.25 - 0) / (0.5 - 0)))
  })

  it('an active setTarget gets an implicit float32 setValueAtTime at t_c', () => {
    const p = makeParam(makeCtx())
    p.setValueAtTime(1, 0)
    p.setTargetAtTime(0, 0, 0.5)
    p.cancelAndHoldAtTime(1)
    const held = Math.fround(0 + (1 - 0) * Math.exp(-(1 - 0) / 0.5)) // fround(e^{−2})
    expect(p._intrinsicValueAt(2)).toBe(held)
    expect(p._intrinsicValueAt(0.5)).toBe(Math.exp(-(0.5 - 0) / 0.5)) // pre-t_c curve untouched
  })

  it('a setValueCurve is truncated but MUST produce the same output as the original within the window', () => {
    const p = makeParam(makeCtx())
    p.setValueCurveAtTime([0, 1, 2, 3, 4], 0, 4) // v(t) = t on [0, 4]
    p.cancelAndHoldAtTime(2.5)
    expect(p._intrinsicValueAt(2)).toBe(2) // identical to the original curve
    expect(p._intrinsicValueAt(2.5)).toBe(2.5)
    expect(p._intrinsicValueAt(3)).toBe(2.5) // held at the truncation value
    expect(p._intrinsicValueAt(10)).toBe(2.5)
  })

  it('events strictly after t_c are removed; events at t_c survive; the timeline value at t_c holds', () => {
    const p = makeParam(makeCtx())
    p.setValueAtTime(1, 0)
    p.setValueAtTime(2, 1)
    p.setValueAtTime(5, 2)
    p.cancelAndHoldAtTime(1)
    expect(p._intrinsicValueAt(1)).toBe(2) // event exactly at t_c is kept
    expect(p._intrinsicValueAt(3)).toBe(2)
  })
})

describe('PlecoAudioParam — automationRate', () => {
  it("defaults to 'a-rate'; valid assignment takes effect; invalid assignment is silently ignored", () => {
    const p = makeParam(makeCtx())
    expect(p.automationRate).toBe('a-rate')
    p.automationRate = 'k-rate'
    expect(p.automationRate).toBe('k-rate')
    p.automationRate = 'bogus'
    expect(p.automationRate).toBe('k-rate')
  })

  it('a fixed-rate param throws InvalidStateError when the rate is CHANGED; same-value assignment is fine', () => {
    const p = makeParam(makeCtx(), { automationRate: 'k-rate', fixedAutomationRate: true })
    expect(p.automationRate).toBe('k-rate')
    expect(() => {
      p.automationRate = 'k-rate'
    }).not.toThrow()
    throwsName(() => {
      p.automationRate = 'a-rate'
    }, 'InvalidStateError')
  })

  it('constructor rejects an invalid automationRate with TypeError', () => {
    expect(() => makeParam(makeCtx(), { automationRate: 'x-rate' })).toThrow(TypeError)
  })
})

describe('PlecoAudioParam — fillBlock: a-rate vs k-rate', () => {
  it('a-rate: a ramp across one block yields per-sample values (i/128, exact in float32)', () => {
    const ctx = makeCtx()
    const p = makeParam(ctx)
    p.setValueAtTime(0, 0)
    p.linearRampToValueAtTime(1, BLOCK)
    const out = p.fillBlock(new Float32Array(RENDER_QUANTUM), 0)
    for (let i = 0; i < RENDER_QUANTUM; i++) expect(out[i]).toBe(i / 128)
    // The next block sits past the ramp end — constant 1.
    const out2 = p.fillBlock(new Float32Array(RENDER_QUANTUM), BLOCK)
    for (const v of out2) expect(v).toBe(1)
  })

  it('k-rate: the whole block is filled with the value at the FIRST sample-frame', () => {
    const ctx = makeCtx()
    const p = makeParam(ctx, { automationRate: 'k-rate' })
    p.setValueAtTime(0, 0)
    p.linearRampToValueAtTime(1, BLOCK)
    const out = p.fillBlock(new Float32Array(RENDER_QUANTUM), 0)
    for (const v of out) expect(v).toBe(0) // value at t = 0
    const out2 = p.fillBlock(new Float32Array(RENDER_QUANTUM), BLOCK)
    for (const v of out2) expect(v).toBe(1) // value at the second block start
  })

  it('constant fast path: no events fills fround(clamped value)', () => {
    const p = makeParam(makeCtx(), { defaultValue: 0.1 })
    const out = p.fillBlock(new Float32Array(RENDER_QUANTUM), 0)
    for (const v of out) expect(v).toBe(Math.fround(0.1))
  })

  it('computedValue is clamped to [minValue, maxValue] while the automation runs unclamped (spec example)', () => {
    const ctx = makeCtx()
    const p = makeParam(ctx, { minValue: 0, maxValue: 1 })
    p.setValueAtTime(0, 0)
    p.linearRampToValueAtTime(4, BLOCK) // slope 4 — unclamped math, clamped output
    const out = p.fillBlock(new Float32Array(RENDER_QUANTUM), 0)
    for (let i = 0; i < RENDER_QUANTUM; i++) expect(out[i]).toBe(Math.min(1, i / 32))
  })

  it('fillBlock sets [[current value]] to the intrinsic value at the block start', () => {
    const ctx = makeCtx()
    const p = makeParam(ctx)
    p.setValueAtTime(0, 0)
    p.linearRampToValueAtTime(1, 2 * BLOCK)
    p.fillBlock(new Float32Array(RENDER_QUANTUM), BLOCK) // second block — mid-ramp
    expect(p.value).toBe(0.5)
  })

  it('setTargetAtTime as the FIRST event: V0 stays anchored at the pre-event value across quanta', () => {
    // Regression: the per-quantum [[current value]] update must NOT feed back
    // into the timeline as a fresh V0 at each block start (which compounded
    // the decay: block 1 first sample e^{-0.5} instead of e^{-0.25}, etc.).
    const ctx = makeCtx()
    const p = makeParam(ctx, { defaultValue: 1 })
    const tau = 4 * BLOCK // 0.0625 s — the decay spans several quanta
    p.setTargetAtTime(0, 0, tau)
    for (let q = 0; q < 3; q++) {
      const out = p.fillBlock(new Float32Array(RENDER_QUANTUM), q * BLOCK)
      for (let i = 0; i < RENDER_QUANTUM; i++) {
        const t = (q * RENDER_QUANTUM + i) / SR
        // spec § setTargetAtTime: v(t) = V1 + (V0 − V1)·e^{−(t − T0)/τ} with
        // V0 = 1 (the value directly set on the attribute), T0 = 0, V1 = 0.
        expect(out[i]).toBe(Math.fround(0 + (1 - 0) * Math.exp(-(t - 0) / tau)))
      }
    }
  })
})

describe('PlecoAudioParam — value attribute float32/event semantics', () => {
  it('the value getter returns the float32-rounded [[current value]]', () => {
    const p = makeParam(makeCtx())
    p.value = 0.1
    expect(p.value).toBe(Math.fround(0.1))
  })

  it('setting .value schedules a SetValue event at currentTime (a later ramp starts from it)', () => {
    const p = makeParam(makeCtx())
    p.value = 0.25
    p.linearRampToValueAtTime(0.75, 1)
    expect(p._intrinsicValueAt(0.5)).toBe(0.25 + (0.75 - 0.25) * 0.5)
  })

  it('the value getter returns [[current value]] UNCLAMPED — clamping applies only to computedValue at output', () => {
    const ctx = makeCtx()
    const p = makeParam(ctx, { minValue: 0, maxValue: 1 })
    p.value = 5
    expect(p.value).toBe(5) // spec: "returns the contents of the [[current value]] slot" — not clamp(5)
    const out = p.fillBlock(new Float32Array(RENDER_QUANTUM), 0)
    for (const v of out) expect(v).toBe(1) // the OUTPUT stays clamped to the nominal range
    expect(p.value).toBe(5) // still the slot readback after rendering
  })

  it('a ramp with no preceding event on an out-of-range param starts from the ACTUAL current value, not the clamp', () => {
    const p = makeParam(makeCtx(), { defaultValue: 4, minValue: 0, maxValue: 1 })
    p.linearRampToValueAtTime(0, 2)
    // Implicit setValueAtTime(current value = 4, 0): mid-ramp lies on the
    // line (0, 4) → (2, 0), un-clamped ("the automation is run as if there
    // were no clamping at all").
    expect(p._intrinsicValueAt(1)).toBe(2)
  })
})

describe('PlecoAudioParam — computedValue with connected inputs', () => {
  it('a mono input sums with the intrinsic value', () => {
    const ctx = makeCtx()
    const p = makeParam(ctx, { defaultValue: 0.5 })
    makeConstSource(ctx, 0.25).connect(p)
    const out = p.fillBlock(new Float32Array(RENDER_QUANTUM))
    for (const v of out) expect(v).toBe(0.75)
  })

  it('a stereo input is down-mixed to mono before summing (0.5·(L+R))', () => {
    const ctx = makeCtx()
    const p = makeParam(ctx, { defaultValue: 0 })
    makeConstSource(ctx, [0.25, 0.5], 2).connect(p)
    const out = p.fillBlock(new Float32Array(RENDER_QUANTUM))
    for (const v of out) expect(v).toBe(0.375)
  })

  it('multiple inputs sum, and the result is clamped to the nominal range', () => {
    const ctx = makeCtx()
    const p = makeParam(ctx, { defaultValue: 0.5, minValue: 0, maxValue: 1 })
    makeConstSource(ctx, 2).connect(p)
    makeConstSource(ctx, 3).connect(p)
    const out = p.fillBlock(new Float32Array(RENDER_QUANTUM))
    for (const v of out) expect(v).toBe(1) // 0.5 + 5 → clamp to maxValue
  })

  it('a NaN sum is replaced by defaultValue (spec § Computation of Value)', () => {
    const ctx = makeCtx()
    const p = makeParam(ctx, { defaultValue: 0.5 })
    makeConstSource(ctx, NaN).connect(p)
    const out = p.fillBlock(new Float32Array(RENDER_QUANTUM))
    for (const v of out) expect(v).toBe(0.5)
  })

  it('a k-rate param also sums its input (sampled at the first frame)', () => {
    const ctx = makeCtx()
    const p = makeParam(ctx, { defaultValue: 0.5, automationRate: 'k-rate' })
    makeConstSource(ctx, 0.25).connect(p)
    const out = p.fillBlock(new Float32Array(RENDER_QUANTUM))
    for (const v of out) expect(v).toBe(0.75)
  })
})

describe('PlecoAudioParam — end-to-end through PlecoGainNode', () => {
  it('an a-rate gain ramp shapes the audio per sample', () => {
    const ctx = new PlecoOfflineContext({ numberOfChannels: 1, length: RENDER_QUANTUM, sampleRate: SR })
    const g = ctx.createGain()
    makeConstSource(ctx, 1).connect(g)
    g.connect(ctx.destination)
    g.gain.setValueAtTime(0, 0)
    g.gain.linearRampToValueAtTime(1, BLOCK)
    const out = ctx.renderSync().getChannelData(0)
    for (let i = 0; i < RENDER_QUANTUM; i++) expect(out[i]).toBe(i / 128)
  })

  it('gain automation advances with the context clock across quanta', () => {
    const ctx = new PlecoOfflineContext({ numberOfChannels: 1, length: RENDER_QUANTUM * 2, sampleRate: SR })
    const g = ctx.createGain()
    makeConstSource(ctx, 1).connect(g)
    g.connect(ctx.destination)
    g.gain.setValueAtTime(0.25, 0)
    g.gain.setValueAtTime(0.75, BLOCK) // steps exactly at the second block
    const out = ctx.renderSync().getChannelData(0)
    expect(out[0]).toBe(0.25)
    expect(out[RENDER_QUANTUM - 1]).toBe(0.25)
    expect(out[RENDER_QUANTUM]).toBe(0.75)
    expect(out[RENDER_QUANTUM * 2 - 1]).toBe(0.75)
  })

  it('an audio-rate signal connected to gain.gain modulates the gain (intrinsic + input)', () => {
    const ctx = new PlecoOfflineContext({ numberOfChannels: 1, length: RENDER_QUANTUM, sampleRate: SR })
    const g = ctx.createGain()
    makeConstSource(ctx, 0.5).connect(g)
    g.connect(ctx.destination)
    g.gain.value = 0.5
    makeConstSource(ctx, 0.25).connect(g.gain)
    const out = ctx.renderSync().getChannelData(0)
    for (const v of out) expect(v).toBe(0.375) // 0.5 · (0.5 + 0.25)
  })
})
