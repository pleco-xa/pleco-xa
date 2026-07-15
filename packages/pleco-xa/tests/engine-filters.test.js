/**
 * tests/engine-filters.test.js — PlecoBiquadFilterNode + PlecoIIRFilterNode (P14).
 *
 * BiquadFilterNode (spec § The BiquadFilterNode Interface / § Filters
 * Characteristics): all eight BiquadFilterType coefficient formulas checked
 * bit-exactly against an in-test mirror of the spec math (double-precision
 * direct-form I, float32 only at the output store), spec Q semantics proven
 * black-box through getFrequencyResponse with hand-derived EXACT gains
 * (lowpass |H(f₀)| = 10^(Q/20) — the dB-Q signature; peaking |H(f₀)| =
 * 10^(G/20); shelf edge gains A²; bandpass/notch/allpass unit/zero points),
 * the frequency×detune compound parameter, per-channel state independence,
 * the a-rate per-sample recompute path against a full param-timeline mirror,
 * IIR tail ring-out, and the getFrequencyResponse validation ladder + NaN
 * outside [0, Nyquist].
 *
 * IIRFilterNode (spec § The IIRFilterNode Interface): the mandatory
 * IIRFilterOptions validation ladder in binding-then-algorithm order
 * (TypeError → NotSupportedError → InvalidStateError), a₀ normalization
 * (bit-exact equivalence of scaled coefficient sets), hand-computed one-pole
 * and FIR outputs, bit-exact equivalence with PlecoBiquadFilterNode for the
 * same normalized coefficients, and getFrequencyResponse against closed-form
 * |H| for a two-tap FIR.
 */
import { describe, it, expect } from 'vitest'
import { PlecoOfflineContext } from '../src/engine/xa-offline-context.js'
import { PlecoBiquadFilterNode } from '../src/engine/nodes/xa-biquad-filter.js'
import { PlecoIIRFilterNode } from '../src/engine/nodes/xa-iir-filter.js'

const SR = 48000
const NYQUIST = SR / 2
const F32_MAX = 3.4028234663852886e38

const ctx = (length = 128, numberOfChannels = 1) =>
  new PlecoOfflineContext({ numberOfChannels, length, sampleRate: SR })

/**
 * Spec § Filters Characteristics, mirrored independently: the eight
 * coefficient formulas in double precision, normalized by a₀.
 * Q is in dB for lowpass/highpass; shelves use S = 1 and ignore Q.
 */
function refCoefficients(type, f0, Fs, Q, G) {
  const A = Math.pow(10, G / 40)
  const w0 = (2 * Math.PI * f0) / Fs
  const c = Math.cos(w0)
  const s = Math.sin(w0)
  const aQ = s / (2 * Q)
  const aQdB = s / (2 * Math.pow(10, Q / 20))
  const aS = (s / 2) * Math.sqrt((A + 1 / A) * (1 / 1 - 1) + 2)
  const rA = 2 * aS * Math.sqrt(A)
  let b0, b1, b2, a0, a1, a2
  switch (type) {
    case 'lowpass':
      ;[b0, b1, b2] = [(1 - c) / 2, 1 - c, (1 - c) / 2]
      ;[a0, a1, a2] = [1 + aQdB, -2 * c, 1 - aQdB]
      break
    case 'highpass':
      ;[b0, b1, b2] = [(1 + c) / 2, -(1 + c), (1 + c) / 2]
      ;[a0, a1, a2] = [1 + aQdB, -2 * c, 1 - aQdB]
      break
    case 'bandpass':
      ;[b0, b1, b2] = [aQ, 0, -aQ]
      ;[a0, a1, a2] = [1 + aQ, -2 * c, 1 - aQ]
      break
    case 'notch':
      ;[b0, b1, b2] = [1, -2 * c, 1]
      ;[a0, a1, a2] = [1 + aQ, -2 * c, 1 - aQ]
      break
    case 'allpass':
      ;[b0, b1, b2] = [1 - aQ, -2 * c, 1 + aQ]
      ;[a0, a1, a2] = [1 + aQ, -2 * c, 1 - aQ]
      break
    case 'peaking':
      ;[b0, b1, b2] = [1 + aQ * A, -2 * c, 1 - aQ * A]
      ;[a0, a1, a2] = [1 + aQ / A, -2 * c, 1 - aQ / A]
      break
    case 'lowshelf':
      b0 = A * (A + 1 - (A - 1) * c + rA)
      b1 = 2 * A * (A - 1 - (A + 1) * c)
      b2 = A * (A + 1 - (A - 1) * c - rA)
      a0 = A + 1 + (A - 1) * c + rA
      a1 = -2 * (A - 1 + (A + 1) * c)
      a2 = A + 1 + (A - 1) * c - rA
      break
    case 'highshelf':
      b0 = A * (A + 1 + (A - 1) * c + rA)
      b1 = -2 * A * (A - 1 + (A + 1) * c)
      b2 = A * (A + 1 + (A - 1) * c - rA)
      a0 = A + 1 - (A - 1) * c + rA
      a1 = 2 * (A - 1 - (A + 1) * c)
      a2 = A + 1 - (A - 1) * c - rA
      break
    default:
      throw new Error(`refCoefficients: unknown type ${type}`)
  }
  return { b0: b0 / a0, b1: b1 / a0, b2: b2 / a0, a1: a1 / a0, a2: a2 / a0 }
}

/** Direct-form I in double, float32 at the output store — the node's exact arithmetic order. */
function runBiquadRef(input, coeffsAt) {
  const out = new Float32Array(input.length)
  let x1 = 0
  let x2 = 0
  let y1 = 0
  let y2 = 0
  for (let i = 0; i < input.length; i++) {
    const { b0, b1, b2, a1, a2 } = coeffsAt(i)
    const x = input[i]
    const y = b0 * x + b1 * x1 + b2 * x2 - a1 * y1 - a2 * y2
    x2 = x1
    x1 = x
    y2 = y1
    y1 = y
    out[i] = y
  }
  return out
}

/** Render mono `inputSamples` through source → makeNode(ctx) → destination, offline. */
function renderMono(inputSamples, makeNode, length = inputSamples.length) {
  const c = new PlecoOfflineContext({ numberOfChannels: 1, length, sampleRate: SR })
  const buf = c.createBuffer(1, inputSamples.length, SR)
  buf.getChannelData(0).set(inputSamples)
  const src = c.createBufferSource()
  src.buffer = buf
  const node = makeNode(c)
  src.connect(node)
  node.connect(c.destination)
  src.start(0)
  return c.renderSync().getChannelData(0)
}

/** Two-tone deterministic test signal (float32 via the array store). */
const TEST_INPUT = Float32Array.from(
  { length: 256 },
  (_, n) => 0.6 * Math.sin((2 * Math.PI * 440 * n) / SR) + 0.3 * Math.sin((2 * Math.PI * 3000 * n) / SR),
)

/** getFrequencyResponse for one frequency — returns {mag, phase}. */
function responseAt(node, f) {
  const freq = new Float32Array([f])
  const mag = new Float32Array(1)
  const phase = new Float32Array(1)
  node.getFrequencyResponse(freq, mag, phase)
  return { mag: mag[0], phase: phase[0] }
}

describe('PlecoBiquadFilterNode — attribute surface', () => {
  it('null options convert to the empty dictionary (WebIDL) — constructs with defaults', () => {
    const node = new PlecoBiquadFilterNode(ctx(), null)
    expect(node.type).toBe('lowpass')
    expect(node.frequency.value).toBe(350)
  })

  it('defaults: type lowpass, frequency 350, detune 0, Q 1, gain 0; spec node table config', () => {
    const node = new PlecoBiquadFilterNode(ctx())
    expect(node.type).toBe('lowpass')
    expect(node.frequency.value).toBe(350)
    expect(node.frequency.defaultValue).toBe(350)
    expect(node.detune.value).toBe(0)
    expect(node.Q.value).toBe(1)
    expect(node.gain.value).toBe(0)
    expect(node.numberOfInputs).toBe(1)
    expect(node.numberOfOutputs).toBe(1)
    expect(node.channelCount).toBe(2)
    expect(node.channelCountMode).toBe('max')
    expect(node.channelInterpretation).toBe('speakers')
  })

  it('params carry the spec nominal ranges and are a-rate', () => {
    const node = new PlecoBiquadFilterNode(ctx())
    expect(node.frequency.minValue).toBe(0)
    expect(node.frequency.maxValue).toBe(NYQUIST)
    expect(node.detune.maxValue).toBe(Math.fround(1200 * Math.log2(F32_MAX))) // ≈ ±153600
    expect(node.detune.minValue).toBe(-Math.fround(1200 * Math.log2(F32_MAX)))
    expect(node.detune.maxValue).toBe(153600) // the spec's ≈153600, exact in float32
    expect(node.Q.minValue).toBe(-Math.fround(F32_MAX))
    expect(node.Q.maxValue).toBe(Math.fround(F32_MAX))
    expect(node.gain.maxValue).toBe(Math.fround(40 * Math.log10(F32_MAX))) // ≈ 1541
    expect(node.gain.minValue).toBe(-Math.fround(F32_MAX))
    for (const p of [node.frequency, node.detune, node.Q, node.gain]) {
      expect(p.automationRate).toBe('a-rate')
    }
  })

  it('type accepts all eight BiquadFilterType values', () => {
    const node = new PlecoBiquadFilterNode(ctx())
    for (const t of ['lowpass', 'highpass', 'bandpass', 'lowshelf', 'highshelf', 'peaking', 'notch', 'allpass']) {
      node.type = t
      expect(node.type).toBe(t)
    }
  })

  it('invalid type ATTRIBUTE assignment is silently ignored (WebIDL enum semantics)', () => {
    const node = new PlecoBiquadFilterNode(ctx())
    node.type = 'bandstop'
    expect(node.type).toBe('lowpass')
    node.type = 'peaking'
    node.type = 'LOWPASS'
    expect(node.type).toBe('peaking')
  })

  it('invalid type in the CONSTRUCTOR dictionary throws TypeError', () => {
    expect(() => new PlecoBiquadFilterNode(ctx(), { type: 'bandstop' })).toThrow(TypeError)
  })

  it('constructor options set param VALUES; defaultValue stays the spec default', () => {
    const node = new PlecoBiquadFilterNode(ctx(), {
      type: 'peaking',
      frequency: 1000,
      detune: 100,
      Q: 2,
      gain: 3,
    })
    expect(node.type).toBe('peaking')
    expect(node.frequency.value).toBe(1000)
    expect(node.frequency.defaultValue).toBe(350)
    expect(node.detune.value).toBe(100)
    expect(node.detune.defaultValue).toBe(0)
    expect(node.Q.value).toBe(2)
    expect(node.Q.defaultValue).toBe(1)
    expect(node.gain.value).toBe(3)
    expect(node.gain.defaultValue).toBe(0)
  })

  it('non-finite constructor param value throws TypeError (WebIDL float)', () => {
    expect(() => new PlecoBiquadFilterNode(ctx(), { frequency: NaN })).toThrow(TypeError)
    expect(() => new PlecoBiquadFilterNode(ctx(), { Q: Infinity })).toThrow(TypeError)
    expect(() => new PlecoBiquadFilterNode(ctx(), { gain: -Infinity })).toThrow(TypeError)
  })
})

describe('PlecoBiquadFilterNode — all eight coefficient formulas (bit-exact vs spec mirror)', () => {
  // freq 1000, detune 0, Q 5, gain 6 — all exact in float32, so the node's
  // param blocks feed the SAME doubles into the SAME formulas as the mirror.
  const F0 = 1000
  const Q = 5
  const G = 6
  for (const type of ['lowpass', 'highpass', 'bandpass', 'lowshelf', 'highshelf', 'peaking', 'notch', 'allpass']) {
    it(`"${type}" matches the spec formulas sample-for-sample (double DFI, float32 store)`, () => {
      const out = renderMono(TEST_INPUT, (c) => new PlecoBiquadFilterNode(c, { type, frequency: F0, Q, gain: G }))
      const coeffs = refCoefficients(type, F0, SR, Q, G)
      const expected = runBiquadRef(TEST_INPUT, () => coeffs)
      for (let i = 0; i < expected.length; i++) expect(out[i]).toBe(expected[i])
    })
  }

  it('detune is the spec compound parameter: frequency 500 + detune 1200 ≡ frequency 1000 (bit-exact)', () => {
    const detuned = renderMono(
      TEST_INPUT,
      (c) => new PlecoBiquadFilterNode(c, { type: 'lowpass', frequency: 500, detune: 1200, Q: 5 }),
    )
    const direct = renderMono(TEST_INPUT, (c) => new PlecoBiquadFilterNode(c, { type: 'lowpass', frequency: 1000, Q: 5 }))
    for (let i = 0; i < direct.length; i++) expect(detuned[i]).toBe(direct[i])
  })

  it('per-channel direct-form state: channel 1 (delayed impulse) is channel 0 shifted, not cross-contaminated', () => {
    const DELAY = 10
    const length = 128
    const c = ctx(length, 2)
    const buf = c.createBuffer(2, length, SR)
    buf.getChannelData(0)[0] = 1
    buf.getChannelData(1)[DELAY] = 1
    const src = c.createBufferSource()
    src.buffer = buf
    const node = new PlecoBiquadFilterNode(c, { type: 'lowpass', frequency: 2000, Q: 10 })
    src.connect(node)
    node.connect(c.destination)
    src.start(0)
    const out = c.renderSync()
    const ch0 = out.getChannelData(0)
    const ch1 = out.getChannelData(1)
    for (let i = 0; i < DELAY; i++) expect(ch1[i]).toBe(0)
    for (let i = DELAY; i < length; i++) expect(ch1[i]).toBe(ch0[i - DELAY])
  })

  it('tail-time: a resonant lowpass keeps ringing after its 128-frame input ends (IIR tail drains through the pull graph)', () => {
    const impulse = new Float32Array(128)
    impulse[0] = 1
    const out = renderMono(impulse, (c) => new PlecoBiquadFilterNode(c, { type: 'lowpass', frequency: 1000, Q: 30 }), 512)
    let lateEnergy = 0
    for (let i = 256; i < 384; i++) lateEnergy = Math.max(lateEnergy, Math.abs(out[i]))
    expect(lateEnergy).toBeGreaterThan(0)
  })
})

describe('PlecoBiquadFilterNode — degenerate coefficients (z-transform limits, browser/WPT parity)', () => {
  // The linear-Q types (bandpass/notch/allpass/peaking) carry α_Q = sin(ω₀)/(2Q).
  // At Q = 0 the raw spec formula is ∞ → NaN; at f₀ = 0 or f₀ = Nyquist it is
  // degenerate. Browsers (and the WPT biquad-filters.js reference) substitute
  // the analytic z-transform limits, producing finite output. These assert
  // pleco does the same, matching WPT biquad-{allpass,bandpass,notch,peaking}.
  const impulse = Float32Array.from({ length: 64 }, (_, n) => (n === 0 ? 1 : 0))

  const finiteRender = (type, frequency, Q, gain) => {
    const out = renderMono(impulse, (c) => new PlecoBiquadFilterNode(c, { type, frequency, Q, gain }), 64)
    for (let i = 0; i < out.length; i++) expect(Number.isFinite(out[i])).toBe(true)
    return out
  }

  it('Q = 0 never yields non-finite output (the WPT "Got 19662 non-finite values" failure)', () => {
    for (const type of ['bandpass', 'notch', 'allpass', 'peaking']) {
      finiteRender(type, NYQUIST * 0.5, 0, 1)
    }
  })

  it('Q = 0 z-transform limits: bandpass→wire, notch→silence, allpass→−1, peaking→A² (impulse[0])', () => {
    const g = 10
    const A = Math.pow(10, g / 40)
    expect(finiteRender('bandpass', NYQUIST * 0.5, 0, g)[0]).toBe(1) // wire: b0 = 1
    expect(finiteRender('notch', NYQUIST * 0.5, 0, g)[0]).toBe(0) // silence: all zero
    expect(finiteRender('allpass', NYQUIST * 0.5, 0, g)[0]).toBe(-1) // sign flip: b0 = −1
    expect(finiteRender('peaking', NYQUIST * 0.5, 0, g)[0]).toBe(Math.fround(A * A)) // fixed gain A²
  })

  it('frequency boundaries f₀ = 0 and f₀ = Nyquist give the reference degenerate filters', () => {
    // bandpass/notch/allpass/peaking at the boundaries: reference maps to
    // {bandpass→0, notch→wire, allpass→wire, peaking→wire}.
    for (const f0 of [0, NYQUIST]) {
      expect(finiteRender('bandpass', f0, 10, 1)[0]).toBe(0)
      expect(finiteRender('notch', f0, 10, 1)[0]).toBe(1)
      expect(finiteRender('allpass', f0, 10, 1)[0]).toBe(1)
      expect(finiteRender('peaking', f0, 10, 10)[0]).toBe(1)
    }
  })

  it('detune automation past Nyquist stays finite (WPT biquad-automation automate-detune)', () => {
    // computedFrequency = frequency · 2^(detune/1200) is clamped to Nyquist;
    // beyond that the bandpass degenerates to the reference zero filter.
    const out = renderMono(
      TEST_INPUT,
      (c) => {
        const node = new PlecoBiquadFilterNode(c, { type: 'bandpass', frequency: 4400 })
        node.detune.setValueAtTime(-12000, 0)
        node.detune.linearRampToValueAtTime(12000, 128 / SR)
        return node
      },
      256,
    )
    for (let i = 0; i < out.length; i++) expect(Number.isFinite(out[i])).toBe(true)
  })
})

describe('PlecoBiquadFilterNode — a-rate automation (per-sample coefficient recompute)', () => {
  it('a frequency ramp matches a full per-sample mirror of param timeline + coefficients + DFI', () => {
    const LENGTH = 256 // two render quanta — the ramp spans both
    const T1 = LENGTH / SR
    const out = renderMono(
      TEST_INPUT,
      (c) => {
        const node = new PlecoBiquadFilterNode(c, { type: 'lowpass', Q: 5 })
        node.frequency.setValueAtTime(200, 0)
        node.frequency.linearRampToValueAtTime(2000, T1)
        return node
      },
      LENGTH,
    )
    // Mirror: param value at sample n is the spec linear-ramp formula, float32
    // at the param block store; coefficients recomputed from that per sample.
    const freqAt = (n) => {
      const t = n / SR
      return Math.fround(t >= T1 ? 2000 : 200 + (2000 - 200) * (t / T1))
    }
    const expected = runBiquadRef(TEST_INPUT, (n) => refCoefficients('lowpass', freqAt(n), SR, 5, 0))
    for (let i = 0; i < LENGTH; i++) expect(out[i]).toBe(expected[i])
    // Honesty guard: the ramped output really differs from a constant-frequency render.
    const constant = renderMono(TEST_INPUT, (c) => new PlecoBiquadFilterNode(c, { type: 'lowpass', frequency: 200, Q: 5 }), LENGTH)
    expect(out.some((v, i) => v !== constant[i])).toBe(true)
  })

  it('constant-value automation takes the same result as the untouched fast path (bit-exact)', () => {
    const plain = renderMono(TEST_INPUT, (c) => new PlecoBiquadFilterNode(c, { type: 'lowpass' }))
    const automated = renderMono(TEST_INPUT, (c) => {
      const node = new PlecoBiquadFilterNode(c, { type: 'lowpass' })
      node.frequency.setValueAtTime(350, 0)
      return node
    })
    for (let i = 0; i < plain.length; i++) expect(automated[i]).toBe(plain[i])
  })
})

describe('PlecoBiquadFilterNode — getFrequencyResponse (spec Q semantics, hand-derived exact gains)', () => {
  it('lowpass: |H(f₀)| = 10^(Q/20) EXACTLY — the dB-Q signature (Q = 20 dB → gain 10 at cutoff)', () => {
    const node = new PlecoBiquadFilterNode(ctx(), { type: 'lowpass', frequency: 1000, Q: 20 })
    expect(responseAt(node, 1000).mag).toBeCloseTo(10, 3)
    // and DC gain is exactly 1 (num(0)/den(0) = 2(1−c)/2(1−c))
    expect(responseAt(node, 0).mag).toBeCloseTo(1, 6)
  })

  it('lowpass dB-Q vs linear-Q disambiguation: Q = 2 gives cutoff gain 10^(2/20) ≈ 1.259, NOT 2', () => {
    const node = new PlecoBiquadFilterNode(ctx(), { type: 'lowpass', frequency: 1000, Q: 2 })
    const { mag } = responseAt(node, 1000)
    expect(mag).toBeCloseTo(Math.pow(10, 2 / 20), 4)
    expect(Math.abs(mag - 2)).toBeGreaterThan(0.5)
  })

  it('highpass: |H(Nyquist)| = 1 exactly and |H(f₀)| = 10^(Q/20) (dB Q)', () => {
    const node = new PlecoBiquadFilterNode(ctx(), { type: 'highpass', frequency: 1000, Q: 20 })
    expect(responseAt(node, NYQUIST).mag).toBeCloseTo(1, 5)
    expect(responseAt(node, 1000).mag).toBeCloseTo(10, 3)
  })

  it('bandpass: |H(f₀)| = 1 and phase(f₀) = 0 exactly (linear Q)', () => {
    const node = new PlecoBiquadFilterNode(ctx(), { type: 'bandpass', frequency: 1000, Q: 8 })
    const { mag, phase } = responseAt(node, 1000)
    expect(mag).toBeCloseTo(1, 5)
    expect(phase).toBeCloseTo(0, 5)
  })

  it('notch: |H(f₀)| = 0', () => {
    const node = new PlecoBiquadFilterNode(ctx(), { type: 'notch', frequency: 1000, Q: 8 })
    expect(responseAt(node, 1000).mag).toBeLessThan(1e-6)
    expect(responseAt(node, 100).mag).toBeCloseTo(1, 2)
  })

  it('allpass: |H| = 1 at every frequency', () => {
    const node = new PlecoBiquadFilterNode(ctx(), { type: 'allpass', frequency: 1000, Q: 2 })
    for (const f of [0, 100, 1000, 5000, 12000, NYQUIST]) {
      expect(responseAt(node, f).mag).toBeCloseTo(1, 5)
    }
  })

  it('peaking: |H(f₀)| = 10^(G/20) exactly (A² algebra), G = 6 dB', () => {
    const node = new PlecoBiquadFilterNode(ctx(), { type: 'peaking', frequency: 1000, Q: 4, gain: 6 })
    expect(responseAt(node, 1000).mag).toBeCloseTo(Math.pow(10, 6 / 20), 4)
    expect(responseAt(node, 0).mag).toBeCloseTo(1, 4)
  })

  it('lowshelf: |H(0)| = 10^(G/20) (= A²) and |H(Nyquist)| = 1 (S = 1 shelf slope)', () => {
    const node = new PlecoBiquadFilterNode(ctx(), { type: 'lowshelf', frequency: 1000, gain: 6 })
    expect(responseAt(node, 0).mag).toBeCloseTo(Math.pow(10, 6 / 20), 4)
    expect(responseAt(node, NYQUIST).mag).toBeCloseTo(1, 4)
  })

  it('highshelf: |H(0)| = 1 and |H(Nyquist)| = 10^(G/20) (S = 1 shelf slope)', () => {
    const node = new PlecoBiquadFilterNode(ctx(), { type: 'highshelf', frequency: 1000, gain: -6 })
    expect(responseAt(node, 0).mag).toBeCloseTo(1, 4)
    expect(responseAt(node, NYQUIST).mag).toBeCloseTo(Math.pow(10, -6 / 20), 4)
  })

  it('lowshelf/highshelf ignore Q entirely (S = 1): responses identical for wildly different Q', () => {
    const a = new PlecoBiquadFilterNode(ctx(), { type: 'lowshelf', frequency: 1000, gain: 6, Q: 0.1 })
    const b = new PlecoBiquadFilterNode(ctx(), { type: 'lowshelf', frequency: 1000, gain: 6, Q: 100 })
    for (const f of [100, 1000, 10000]) {
      expect(responseAt(a, f).mag).toBe(responseAt(b, f).mag)
      expect(responseAt(a, f).phase).toBe(responseAt(b, f).phase)
    }
  })

  it('detune shifts the response peak: frequency 500 + detune 1200 responds like frequency 1000', () => {
    const detuned = new PlecoBiquadFilterNode(ctx(), { type: 'lowpass', frequency: 500, detune: 1200, Q: 20 })
    expect(responseAt(detuned, 1000).mag).toBeCloseTo(10, 3)
  })

  it('response is sampled from the CURRENT param values (post-construction changes count)', () => {
    const node = new PlecoBiquadFilterNode(ctx(), { type: 'lowpass', frequency: 1000, Q: 20 })
    node.frequency.value = 2000
    expect(responseAt(node, 2000).mag).toBeCloseTo(10, 3)
  })

  it('frequencies outside [0, Nyquist] → NaN in BOTH arrays at that index; in-range neighbors untouched', () => {
    const node = new PlecoBiquadFilterNode(ctx())
    const freq = new Float32Array([-1, NYQUIST + 1, 1000, 0, NYQUIST])
    const mag = new Float32Array(5)
    const phase = new Float32Array(5)
    node.getFrequencyResponse(freq, mag, phase)
    expect(mag[0]).toBeNaN()
    expect(phase[0]).toBeNaN()
    expect(mag[1]).toBeNaN()
    expect(phase[1]).toBeNaN()
    expect(Number.isFinite(mag[2])).toBe(true)
    expect(Number.isFinite(phase[2])).toBe(true)
    expect(Number.isFinite(mag[3])).toBe(true) // 0 Hz is in range
    expect(Number.isFinite(mag[4])).toBe(true) // Nyquist is in range
  })

  it('non-Float32Array arguments throw TypeError', () => {
    const node = new PlecoBiquadFilterNode(ctx())
    const f32 = new Float32Array(2)
    expect(() => node.getFrequencyResponse([100, 200], f32, f32)).toThrow(TypeError)
    expect(() => node.getFrequencyResponse(f32, new Float64Array(2), f32)).toThrow(TypeError)
    expect(() => node.getFrequencyResponse(f32, f32, null)).toThrow(TypeError)
  })

  it('length mismatch throws InvalidAccessError (DOMException)', () => {
    const node = new PlecoBiquadFilterNode(ctx())
    let err = null
    try {
      node.getFrequencyResponse(new Float32Array(3), new Float32Array(2), new Float32Array(3))
    } catch (e) {
      err = e
    }
    expect(err).toBeInstanceOf(DOMException)
    expect(err.name).toBe('InvalidAccessError')
    err = null
    try {
      node.getFrequencyResponse(new Float32Array(3), new Float32Array(3), new Float32Array(4))
    } catch (e) {
      err = e
    }
    expect(err).toBeInstanceOf(DOMException)
    expect(err.name).toBe('InvalidAccessError')
  })
})

describe('PlecoIIRFilterNode — IIRFilterOptions validation ladder', () => {
  it('missing options dictionary throws TypeError', () => {
    expect(() => new PlecoIIRFilterNode(ctx())).toThrow(TypeError)
    expect(() => new PlecoIIRFilterNode(ctx(), null)).toThrow(TypeError)
  })

  it('missing required feedforward or feedback throws TypeError', () => {
    expect(() => new PlecoIIRFilterNode(ctx(), { feedback: [1] })).toThrow(TypeError)
    expect(() => new PlecoIIRFilterNode(ctx(), { feedforward: [1] })).toThrow(TypeError)
  })

  it('non-finite coefficient throws TypeError (sequence<double> binding)', () => {
    expect(() => new PlecoIIRFilterNode(ctx(), { feedforward: [NaN], feedback: [1] })).toThrow(TypeError)
    expect(() => new PlecoIIRFilterNode(ctx(), { feedforward: [1], feedback: [Infinity] })).toThrow(TypeError)
  })

  it('non-number coefficient throws TypeError (pleco strictness — no ToNumber coercion)', () => {
    expect(() => new PlecoIIRFilterNode(ctx(), { feedforward: ['1'], feedback: [1] })).toThrow(TypeError)
  })

  it('empty array throws NotSupportedError', () => {
    for (const options of [
      { feedforward: [], feedback: [1] },
      { feedforward: [1], feedback: [] },
    ]) {
      let err = null
      try {
        new PlecoIIRFilterNode(ctx(), options)
      } catch (e) {
        err = e
      }
      expect(err).toBeInstanceOf(DOMException)
      expect(err.name).toBe('NotSupportedError')
    }
  })

  it('more than 20 coefficients throws NotSupportedError; exactly 20 is accepted', () => {
    const twentyOne = new Array(21).fill(0.01)
    let err = null
    try {
      new PlecoIIRFilterNode(ctx(), { feedforward: twentyOne, feedback: [1] })
    } catch (e) {
      err = e
    }
    expect(err).toBeInstanceOf(DOMException)
    expect(err.name).toBe('NotSupportedError')
    err = null
    try {
      new PlecoIIRFilterNode(ctx(), { feedforward: [1], feedback: twentyOne })
    } catch (e) {
      err = e
    }
    expect(err.name).toBe('NotSupportedError')
    const twenty = new Array(20).fill(0.01)
    expect(() => new PlecoIIRFilterNode(ctx(), { feedforward: twenty, feedback: [1, ...new Array(19).fill(0.01)] })).not.toThrow()
  })

  it('all-zero feedforward throws InvalidStateError', () => {
    let err = null
    try {
      new PlecoIIRFilterNode(ctx(), { feedforward: [0, 0, 0], feedback: [1] })
    } catch (e) {
      err = e
    }
    expect(err).toBeInstanceOf(DOMException)
    expect(err.name).toBe('InvalidStateError')
  })

  it('feedback[0] === 0 throws InvalidStateError', () => {
    let err = null
    try {
      new PlecoIIRFilterNode(ctx(), { feedforward: [1], feedback: [0, 0.5] })
    } catch (e) {
      err = e
    }
    expect(err).toBeInstanceOf(DOMException)
    expect(err.name).toBe('InvalidStateError')
  })

  it('ladder order: binding TypeError (non-finite) wins over length constraints', () => {
    // feedback is empty AND feedforward is non-finite — conversion runs first.
    expect(() => new PlecoIIRFilterNode(ctx(), { feedforward: [NaN], feedback: [] })).toThrow(TypeError)
    // feedforward is empty AND feedback is non-finite — both convert before lengths.
    expect(() => new PlecoIIRFilterNode(ctx(), { feedforward: [], feedback: [NaN] })).toThrow(TypeError)
  })

  it('ladder order: NotSupportedError (length) wins over InvalidStateError (all-zero)', () => {
    let err = null
    try {
      new PlecoIIRFilterNode(ctx(), { feedforward: new Array(21).fill(0), feedback: [1] })
    } catch (e) {
      err = e
    }
    expect(err.name).toBe('NotSupportedError')
  })

  it('spec node table config: 1 input, 1 output, channelCount 2, max, speakers', () => {
    const node = new PlecoIIRFilterNode(ctx(), { feedforward: [1], feedback: [1] })
    expect(node.numberOfInputs).toBe(1)
    expect(node.numberOfOutputs).toBe(1)
    expect(node.channelCount).toBe(2)
    expect(node.channelCountMode).toBe('max')
    expect(node.channelInterpretation).toBe('speakers')
  })
})

describe('PlecoIIRFilterNode — processing (a₀ normalization, native DFI kernel)', () => {
  it('identity filter (b = [1], a = [1]) passes the input through sample-exact', () => {
    const out = renderMono(TEST_INPUT, (c) => new PlecoIIRFilterNode(c, { feedforward: [1], feedback: [1] }))
    for (let i = 0; i < TEST_INPUT.length; i++) expect(out[i]).toBe(TEST_INPUT[i])
  })

  it('a₀ normalization: scaled coefficient sets are bit-identical (÷ a₀ = ÷ 2, exact)', () => {
    const scaled = renderMono(
      TEST_INPUT,
      (c) => new PlecoIIRFilterNode(c, { feedforward: [0.5, 0.5], feedback: [2, 0.5] }),
    )
    const normalized = renderMono(
      TEST_INPUT,
      (c) => new PlecoIIRFilterNode(c, { feedforward: [0.25, 0.25], feedback: [1, 0.25] }),
    )
    for (let i = 0; i < TEST_INPUT.length; i++) expect(scaled[i]).toBe(normalized[i])
  })

  it('one-pole smoother y(n) = 0.5·x(n) + 0.5·y(n−1): impulse response is 0.5^(n+1), hand-computed', () => {
    const impulse = new Float32Array(64)
    impulse[0] = 1
    const out = renderMono(impulse, (c) => new PlecoIIRFilterNode(c, { feedforward: [0.5], feedback: [1, -0.5] }))
    for (let n = 0; n < 64; n++) expect(out[n]).toBe(Math.fround(Math.pow(0.5, n + 1)))
  })

  it('two-tap FIR (b = [0.5, 0.5], a = [1]) is the exact moving average on a dyadic ramp', () => {
    const input = Float32Array.from({ length: 128 }, (_, i) => i / 64)
    const out = renderMono(input, (c) => new PlecoIIRFilterNode(c, { feedforward: [0.5, 0.5], feedback: [1] }))
    expect(out[0]).toBe(0)
    for (let n = 1; n < 128; n++) expect(out[n]).toBe(Math.fround(0.5 * input[n] + 0.5 * input[n - 1]))
  })

  it('matches PlecoBiquadFilterNode bit-exactly when fed the same normalized coefficients', () => {
    const coeffs = refCoefficients('lowpass', 1000, SR, 5, 0)
    const iirOut = renderMono(
      TEST_INPUT,
      (c) =>
        new PlecoIIRFilterNode(c, {
          feedforward: [coeffs.b0, coeffs.b1, coeffs.b2],
          feedback: [1, coeffs.a1, coeffs.a2],
        }),
    )
    const biquadOut = renderMono(TEST_INPUT, (c) => new PlecoBiquadFilterNode(c, { type: 'lowpass', frequency: 1000, Q: 5 }))
    for (let i = 0; i < TEST_INPUT.length; i++) expect(iirOut[i]).toBe(biquadOut[i])
  })

  it('per-channel state independence: delayed impulse channel is the shifted twin', () => {
    const DELAY = 7
    const length = 128
    const c = ctx(length, 2)
    const buf = c.createBuffer(2, length, SR)
    buf.getChannelData(0)[0] = 1
    buf.getChannelData(1)[DELAY] = 1
    const src = c.createBufferSource()
    src.buffer = buf
    const node = new PlecoIIRFilterNode(c, { feedforward: [0.5], feedback: [1, -0.5] })
    src.connect(node)
    node.connect(c.destination)
    src.start(0)
    const out = c.renderSync()
    const ch0 = out.getChannelData(0)
    const ch1 = out.getChannelData(1)
    for (let i = 0; i < DELAY; i++) expect(ch1[i]).toBe(0)
    for (let i = DELAY; i < length; i++) expect(ch1[i]).toBe(ch0[i - DELAY])
  })

  it('tail-time: a slow one-pole keeps draining after its 128-frame input ends', () => {
    const impulse = new Float32Array(128)
    impulse[0] = 1
    const out = renderMono(
      impulse,
      (c) => new PlecoIIRFilterNode(c, { feedforward: [0.01], feedback: [1, -0.99] }),
      512,
    )
    let late = 0
    for (let i = 256; i < 512; i++) late = Math.max(late, Math.abs(out[i]))
    expect(late).toBeGreaterThan(0)
  })
})

describe('PlecoIIRFilterNode — getFrequencyResponse', () => {
  it('two-tap FIR b = [0.5, 0.5]: |H(f)| = cos(πf/Fs), phase = −πf/Fs (closed form)', () => {
    const node = new PlecoIIRFilterNode(ctx(), { feedforward: [0.5, 0.5], feedback: [1] })
    for (const f of [0, 6000, 12000, 18000, NYQUIST]) {
      const w = (Math.PI * f) / SR
      const { mag, phase } = responseAt(node, f)
      expect(mag).toBeCloseTo(Math.abs(Math.cos(w)), 5)
      if (f > 0 && f < NYQUIST) expect(phase).toBeCloseTo(-w, 5)
    }
    expect(responseAt(node, 0).mag).toBeCloseTo(1, 6)
    expect(responseAt(node, NYQUIST).mag).toBeLessThan(1e-6)
  })

  it('a₀ normalization cancels in the response: scaled and normalized sets answer identically', () => {
    const a = new PlecoIIRFilterNode(ctx(), { feedforward: [0.5, 0.5], feedback: [2, 0.5] })
    const b = new PlecoIIRFilterNode(ctx(), { feedforward: [0.25, 0.25], feedback: [1, 0.25] })
    for (const f of [100, 1000, 10000]) {
      expect(responseAt(a, f).mag).toBe(responseAt(b, f).mag)
      expect(responseAt(a, f).phase).toBe(responseAt(b, f).phase)
    }
  })

  it('frequencies outside [0, Nyquist] → NaN in both arrays at that index', () => {
    const node = new PlecoIIRFilterNode(ctx(), { feedforward: [0.5, 0.5], feedback: [1] })
    const freq = new Float32Array([-0.5, NYQUIST + 0.5, 440])
    const mag = new Float32Array(3)
    const phase = new Float32Array(3)
    node.getFrequencyResponse(freq, mag, phase)
    expect(mag[0]).toBeNaN()
    expect(phase[0]).toBeNaN()
    expect(mag[1]).toBeNaN()
    expect(phase[1]).toBeNaN()
    expect(Number.isFinite(mag[2])).toBe(true)
  })

  it('non-Float32Array arguments throw TypeError; length mismatch throws InvalidAccessError', () => {
    const node = new PlecoIIRFilterNode(ctx(), { feedforward: [1], feedback: [1] })
    const f32 = new Float32Array(2)
    expect(() => node.getFrequencyResponse([100], f32, f32)).toThrow(TypeError)
    let err = null
    try {
      node.getFrequencyResponse(new Float32Array(2), new Float32Array(3), new Float32Array(2))
    } catch (e) {
      err = e
    }
    expect(err).toBeInstanceOf(DOMException)
    expect(err.name).toBe('InvalidAccessError')
  })
})

describe('PlecoIIRFilterNode — non-array-like coefficient sequence', () => {
  it('a present-but-non-array-like feedforward/feedback throws TypeError', () => {
    expect(() => new PlecoIIRFilterNode(ctx(), { feedforward: 42, feedback: [1] })).toThrow(TypeError)
    expect(() => new PlecoIIRFilterNode(ctx(), { feedforward: [1], feedback: true })).toThrow(TypeError)
  })
})
