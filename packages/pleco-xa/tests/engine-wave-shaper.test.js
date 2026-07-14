/**
 * tests/engine-wave-shaper.test.js — PlecoWaveShaperNode (P13).
 *
 * Spec § The WaveShaperNode Interface: nullable curve with the [[curve set]]
 * one-shot slot, internal-copy-on-set, the exact curve index math
 * (v = (N−1)/2·(x+1), end clamping, linear interpolation), OverSampleType
 * WebIDL enum semantics, and the implementation-defined 2x/4x oversampling
 * path (native half-band FIR stages) — asserted with an honest DSP check:
 * the aliased distortion product of a cubic shaper on a 10 kHz tone lands at
 * 18 kHz with 'none' and must be strongly attenuated with '2x'/'4x'.
 *
 * Hand-computed expectations use dyadic inputs (exact in float32) where
 * sample-exactness is claimed; everything else mirrors the spec math in a
 * reference function with Math.fround at the float32 store boundary.
 */
import { describe, it, expect } from 'vitest'
import { PlecoOfflineContext } from '../src/engine/xa-offline-context.js'
import { PlecoWaveShaperNode } from '../src/engine/nodes/xa-wave-shaper.js'

const SR = 48000

/** Spec § curve application algorithm, mirrored, with fround at the f32 store. */
function shapeRef(curve, x) {
  const N = curve.length
  const v = ((N - 1) / 2) * (x + 1)
  let y
  if (v < 0) y = curve[0]
  else if (v >= N - 1) y = curve[N - 1]
  else {
    const k = Math.floor(v)
    const f = v - k
    y = (1 - f) * curve[k] + f * curve[k + 1]
  }
  return Math.fround(y)
}

/** Render mono `inputSamples` through source → WaveShaper → destination, offline. */
function renderShaped(inputSamples, { curve = null, oversample = 'none', sampleRate = SR } = {}) {
  const length = inputSamples.length
  const ctx = new PlecoOfflineContext({ numberOfChannels: 1, length, sampleRate })
  const buf = ctx.createBuffer(1, length, sampleRate)
  buf.getChannelData(0).set(inputSamples)
  const src = ctx.createBufferSource()
  src.buffer = buf
  const shaper = new PlecoWaveShaperNode(ctx, { oversample })
  if (curve !== null) shaper.curve = curve
  src.connect(shaper)
  shaper.connect(ctx.destination)
  src.start(0)
  return ctx.renderSync().getChannelData(0)
}

/** Single-frequency amplitude estimate: |2/N · Σ x[n]·e^{−i2πf(n)/sr}| over an integer number of cycles. */
function binAmplitude(x, start, count, freq, sampleRate) {
  let re = 0
  let im = 0
  for (let n = 0; n < count; n++) {
    const ph = (2 * Math.PI * freq * (start + n)) / sampleRate
    re += x[start + n] * Math.cos(ph)
    im -= x[start + n] * Math.sin(ph)
  }
  return (2 / count) * Math.hypot(re, im)
}

const ctx = () => new PlecoOfflineContext({ numberOfChannels: 1, length: 128, sampleRate: SR })

describe('PlecoWaveShaperNode — attribute surface', () => {
  it('defaults: curve null, oversample "none", 1 input, 1 output, spec channel config', () => {
    const shaper = new PlecoWaveShaperNode(ctx())
    expect(shaper.curve).toBeNull()
    expect(shaper.oversample).toBe('none')
    expect(shaper.numberOfInputs).toBe(1)
    expect(shaper.numberOfOutputs).toBe(1)
    expect(shaper.channelCount).toBe(2)
    expect(shaper.channelCountMode).toBe('max')
    expect(shaper.channelInterpretation).toBe('speakers')
  })

  it('oversample: valid enum values are accepted', () => {
    const shaper = new PlecoWaveShaperNode(ctx())
    shaper.oversample = '2x'
    expect(shaper.oversample).toBe('2x')
    shaper.oversample = '4x'
    expect(shaper.oversample).toBe('4x')
    shaper.oversample = 'none'
    expect(shaper.oversample).toBe('none')
  })

  it('oversample: invalid enum assignment is silently ignored (WebIDL attribute semantics)', () => {
    const shaper = new PlecoWaveShaperNode(ctx())
    shaper.oversample = '3x'
    expect(shaper.oversample).toBe('none')
    shaper.oversample = '2x'
    shaper.oversample = 'garbage'
    expect(shaper.oversample).toBe('2x')
  })

  it('constructor dictionary path: invalid OverSampleType throws TypeError', () => {
    expect(() => new PlecoWaveShaperNode(ctx(), { oversample: '8x' })).toThrow(TypeError)
  })

  it('constructor applies WaveShaperOptions: curve (sequence<float>, copied) and oversample', () => {
    const shaper = new PlecoWaveShaperNode(ctx(), { curve: [-1, 0, 1], oversample: '4x' })
    expect(shaper.oversample).toBe('4x')
    expect(shaper.curve).toBeInstanceOf(Float32Array)
    expect(Array.from(shaper.curve)).toEqual([-1, 0, 1])
  })
})

describe('PlecoWaveShaperNode — curve validation and [[curve set]]', () => {
  it('curve with length < 2 throws InvalidStateError (DOMException)', () => {
    const shaper = new PlecoWaveShaperNode(ctx())
    for (const bad of [new Float32Array(0), new Float32Array(1)]) {
      let err = null
      try {
        shaper.curve = bad
      } catch (e) {
        err = e
      }
      expect(err).toBeInstanceOf(DOMException)
      expect(err.name).toBe('InvalidStateError')
    }
    expect(shaper.curve).toBeNull() // failed set leaves the attribute untouched
  })

  it('constructor curve with length < 2 throws InvalidStateError too (same setter algorithm)', () => {
    let err = null
    try {
      new PlecoWaveShaperNode(ctx(), { curve: [0.3] })
    } catch (e) {
      err = e
    }
    expect(err).toBeInstanceOf(DOMException)
    expect(err.name).toBe('InvalidStateError')
  })

  it('non-Float32Array assignment throws TypeError (WebIDL Float32Array? attribute)', () => {
    const shaper = new PlecoWaveShaperNode(ctx())
    expect(() => {
      shaper.curve = [-1, 1]
    }).toThrow(TypeError)
  })

  it('[[curve set]]: a second non-null assignment throws InvalidStateError', () => {
    const shaper = new PlecoWaveShaperNode(ctx())
    shaper.curve = new Float32Array([-1, 1])
    let err = null
    try {
      shaper.curve = new Float32Array([0, 0.5])
    } catch (e) {
      err = e
    }
    expect(err).toBeInstanceOf(DOMException)
    expect(err.name).toBe('InvalidStateError')
    expect(Array.from(shaper.curve)).toEqual([-1, 1]) // first curve retained
  })

  it('[[curve set]]: null is always assignable but does NOT clear the slot', () => {
    const shaper = new PlecoWaveShaperNode(ctx())
    shaper.curve = new Float32Array([-1, 1])
    shaper.curve = null
    expect(shaper.curve).toBeNull()
    expect(() => {
      shaper.curve = new Float32Array([-1, 1])
    }).toThrow(DOMException)
  })

  it('[[curve set]]: a constructor-provided curve sets the slot', () => {
    const shaper = new PlecoWaveShaperNode(ctx(), { curve: [-1, 1] })
    expect(() => {
      shaper.curve = new Float32Array([0, 1])
    }).toThrow(DOMException)
  })

  it('failed length<2 set does not consume [[curve set]]', () => {
    const shaper = new PlecoWaveShaperNode(ctx())
    expect(() => {
      shaper.curve = new Float32Array(1)
    }).toThrow(DOMException)
    shaper.curve = new Float32Array([-1, 1]) // still allowed
    expect(Array.from(shaper.curve)).toEqual([-1, 1])
  })
})

describe('PlecoWaveShaperNode — curve application (oversample "none")', () => {
  it('identity curve [-1, 1] passes a dyadic ramp through sample-exact', () => {
    // x = (i − 128)/128 ∈ [−1, 1): dyadic, exact in float32, and every step of
    // the spec math (v = ½(x+1), y = 2f − 1) is exact in double for these.
    const input = Float32Array.from({ length: 256 }, (_, i) => (i - 128) / 128)
    const out = renderShaped(input, { curve: new Float32Array([-1, 1]) })
    for (let i = 0; i < input.length; i++) expect(out[i]).toBe(input[i])
  })

  it('null curve is pass-through, sample-exact, including samples outside [-1, 1]', () => {
    const input = Float32Array.from([1.5, -2, 0.25, -0.75, 0, 1, -1, 0.001, ...new Array(120).fill(0.5)])
    const out = renderShaped(input, { curve: null })
    for (let i = 0; i < input.length; i++) expect(out[i]).toBe(input[i])
  })

  it('null curve is pass-through even with oversample "2x" (nothing to shape, nothing to resample)', () => {
    const input = Float32Array.from({ length: 256 }, (_, i) => (i - 128) / 128)
    const out = renderShaped(input, { curve: null, oversample: '2x' })
    for (let i = 0; i < input.length; i++) expect(out[i]).toBe(input[i])
  })

  it('hard-clip curve on a known dyadic ramp matches the spec math sample-for-sample', () => {
    const curve = new Float32Array([-0.5, -0.5, 0.5, 0.5])
    // Ramp −1.5 … +1.46875 in steps of 1/32 (dyadic) — exercises v<0 clamping,
    // v≥N−1 clamping, and interpolation across all three curve segments.
    const input = Float32Array.from({ length: 128 }, (_, i) => -1.5 + i / 32)
    const out = renderShaped(input, { curve })
    for (let i = 0; i < input.length; i++) expect(out[i]).toBe(shapeRef(curve, input[i]))
    // Spot checks, hand-computed: v = 1.5(x+1) over N=4.
    expect(out[0]).toBe(-0.5) // x = −1.5 → v = −0.75 < 0 → c₀
    expect(out[16]).toBe(-0.5) // x = −1 → v = 0, k=0, f=0 → c₀
    expect(out[48]).toBe(0) // x = 0 → v = 1.5, k=1, f=0.5 → ½(−0.5)+½(0.5) = 0
    expect(out[112]).toBe(0.5) // x = −1.5 + 112/32 = 2 → v = 4.5 ≥ 3 → c₃
  })

  it('3-point curve: odd length puts a curve value exactly at zero input; interpolation and end clamps hand-computed', () => {
    const curve = new Float32Array([-1, 0, 0.5]) // N=3 → v = x + 1
    const cases = [
      [-1.25, -1], // v = −0.25 < 0 → c₀
      [-1, -1], // v = 0, k=0, f=0 → c₀
      [-0.5, -0.5], // v = 0.5 → ½(−1) + ½(0) = −0.5
      [0, 0], // v = 1, k=1, f=0 → c₁ (center value at zero signal)
      [0.25, 0.125], // v = 1.25 → 0.75(0) + 0.25(0.5) = 0.125
      [1, 0.5], // v = 2 ≥ N−1 → c₂
      [2, 0.5], // v = 3 ≥ N−1 → c₂
    ]
    const input = Float32Array.from({ length: 128 }, (_, i) => (cases[i] ? cases[i][0] : 0))
    const out = renderShaped(input, { curve })
    cases.forEach(([, expected], i) => expect(out[i]).toBe(expected))
  })

  it('curve copy semantics: mutating the assigned array after set does not change the output', () => {
    const arr = new Float32Array([0.5, 0.5])
    const input = new Float32Array(128).fill(0.25)
    const length = input.length
    const c = new PlecoOfflineContext({ numberOfChannels: 1, length, sampleRate: SR })
    const buf = c.createBuffer(1, length, SR)
    buf.getChannelData(0).set(input)
    const src = c.createBufferSource()
    src.buffer = buf
    const shaper = new PlecoWaveShaperNode(c)
    shaper.curve = arr
    arr.fill(-1) // mutate AFTER assignment — must have no effect (internal copy)
    src.connect(shaper)
    shaper.connect(c.destination)
    src.start(0)
    const out = c.renderSync().getChannelData(0)
    for (let i = 0; i < length; i++) expect(out[i]).toBe(0.5)
  })

  it('a curve non-zero at zero input emits DC with NO input connected (spec note)', () => {
    const c = new PlecoOfflineContext({ numberOfChannels: 1, length: 128, sampleRate: SR })
    const shaper = new PlecoWaveShaperNode(c)
    shaper.curve = new Float32Array([1, 1])
    shaper.connect(c.destination) // nothing upstream: input is one channel of silence
    const out = c.renderSync().getChannelData(0)
    for (let i = 0; i < 128; i++) expect(out[i]).toBe(1)
  })
})

describe('PlecoWaveShaperNode — oversampling (2x / 4x, native half-band FIR)', () => {
  // Cubic shaper via a dense curve: x³ on a pure tone makes exactly one
  // distortion product at 3f₀. With f₀ = 10 kHz at 48 kHz, 3f₀ = 30 kHz is
  // above Nyquist and ALIASES to 18 kHz when shaping at the context rate
  // ('none'). Shaping at 96 kHz ('2x') represents 30 kHz honestly and the
  // half-band down-sampling filter removes it before decimation.
  const N_CURVE = 4097
  const cubicCurve = Float32Array.from({ length: N_CURVE }, (_, i) => {
    const t = -1 + (2 * i) / (N_CURVE - 1)
    return t * t * t
  })
  const F0 = 10000
  const ALIAS = 18000 // 48000 − 30000
  const AMP = 0.9
  const SKIP = 512 // past FIR warm-up + ~31 frames of group delay
  const WINDOW = 4800 // integer cycles of every multiple of 10 Hz at 48 kHz
  const LENGTH = SKIP + WINDOW

  const tone = Float32Array.from({ length: LENGTH }, (_, n) => AMP * Math.sin((2 * Math.PI * F0 * n) / SR))

  it('"2x" output stays bounded and finite through a hard-clip curve', () => {
    const clip = new Float32Array([-0.5, -0.5, 0.5, 0.5])
    const out = renderShaped(tone, { curve: clip, oversample: '2x' })
    for (let i = 0; i < out.length; i++) {
      expect(Number.isFinite(out[i])).toBe(true)
      expect(Math.abs(out[i])).toBeLessThanOrEqual(1) // clip at ±0.5 + filter ringing head-room
    }
  })

  it('"2x" attenuates the aliased distortion product at 18 kHz vs "none" while keeping the fundamental', () => {
    const outNone = renderShaped(tone, { curve: cubicCurve, oversample: 'none' })
    const out2x = renderShaped(tone, { curve: cubicCurve, oversample: '2x' })

    const aliasNone = binAmplitude(outNone, SKIP, WINDOW, ALIAS, SR)
    const alias2x = binAmplitude(out2x, SKIP, WINDOW, ALIAS, SR)
    // 'none': the 3rd harmonic of x³ has amplitude A³/4 ≈ 0.182 and lands
    // aliased at 18 kHz — assert it is really there before claiming a win.
    expect(aliasNone).toBeGreaterThan(0.15)
    // '2x': the half-band FIR stopband (~70 dB past 0.294·fs) must crush it.
    // 0.02 (−34 dB) is a deliberately coarse-but-honest bound.
    expect(alias2x).toBeLessThan(0.02 * aliasNone)

    // Passband honesty: the 10 kHz fundamental (3A³/4 ≈ 0.547) survives 2x.
    const fundNone = binAmplitude(outNone, SKIP, WINDOW, F0, SR)
    const fund2x = binAmplitude(out2x, SKIP, WINDOW, F0, SR)
    expect(fundNone).toBeGreaterThan(0.5)
    expect(fund2x).toBeGreaterThan(0.95 * fundNone)
    expect(fund2x).toBeLessThan(1.05 * fundNone)
  })

  it('"4x" runs, stays finite, and suppresses the alias at least as coarsely as "2x"', () => {
    const outNone = renderShaped(tone, { curve: cubicCurve, oversample: 'none' })
    const out4x = renderShaped(tone, { curve: cubicCurve, oversample: '4x' })
    for (let i = 0; i < out4x.length; i++) expect(Number.isFinite(out4x[i])).toBe(true)
    const aliasNone = binAmplitude(outNone, SKIP, WINDOW, ALIAS, SR)
    const alias4x = binAmplitude(out4x, SKIP, WINDOW, ALIAS, SR)
    expect(alias4x).toBeLessThan(0.02 * aliasNone)
  })

  it('oversampled rendering is deterministic — two renders are bit-identical', () => {
    const a = renderShaped(tone, { curve: cubicCurve, oversample: '2x' })
    const b = renderShaped(tone, { curve: cubicCurve, oversample: '2x' })
    expect(Array.from(a)).toEqual(Array.from(b))
  })
})

describe('PlecoWaveShaperNode — WaveShaperOptions.curve conversion', () => {
  it('a non-sequence curve option throws TypeError', () => {
    const ctx = new PlecoOfflineContext({ numberOfChannels: 1, length: 128, sampleRate: 48000 })
    expect(() => new PlecoWaveShaperNode(ctx, { curve: 42 })).toThrow(TypeError)
    expect(() => new PlecoWaveShaperNode(ctx, { curve: {} })).toThrow(TypeError) // object without a numeric length
  })
})
