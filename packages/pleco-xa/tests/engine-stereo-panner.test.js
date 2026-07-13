/**
 * tests/engine-stereo-panner.test.js — PlecoStereoPannerNode (P12).
 *
 * Spec § The StereoPannerNode Interface + § StereoPannerNode Panning:
 * a-rate `pan` AudioParam in [-1, 1] (default 0), the exact equal-power math
 * (mono x = (pan+1)/2 through cos/sin; the asymmetric stereo branches with
 * pan <= 0 mixing R into L and pan > 0 mixing L into R), output hard-coded to
 * stereo, and the constraint tables: channelCount > 2 → NotSupportedError,
 * channelCountMode 'max' → NotSupportedError (attribute AND constructor
 * dictionary paths).
 *
 * Sample-exact assertions mirror the spec math in reference functions doing
 * IDENTICAL double-precision arithmetic with Math.fround at the float32 store
 * boundary; dyadic pan values keep the param path exact. Tolerance-based
 * assertions (automation ramps, equal-power sweep) are marked as such.
 */
import { describe, it, expect } from 'vitest'
import { PlecoOfflineContext } from '../src/engine/xa-offline-context.js'
import { PlecoStereoPannerNode } from '../src/engine/nodes/xa-stereo-panner.js'

const SR = 48000
const HALF_PI = Math.PI / 2

const ctx = () => new PlecoOfflineContext({ numberOfChannels: 2, length: 128, sampleRate: SR })

/** Spec § StereoPannerNode Panning, mono branch, mirrored double-for-double. */
function panMonoRef(s, pan) {
  const p = Math.min(1, Math.max(-1, Math.fround(pan)))
  const x = (p + 1) / 2
  return [Math.fround(s * Math.cos(x * HALF_PI)), Math.fround(s * Math.sin(x * HALF_PI))]
}

/** Spec § StereoPannerNode Panning, stereo branches, mirrored double-for-double. */
function panStereoRef(l, r, pan) {
  const p = Math.min(1, Math.max(-1, Math.fround(pan)))
  const x = p <= 0 ? p + 1 : p
  const gainL = Math.cos(x * HALF_PI)
  const gainR = Math.sin(x * HALF_PI)
  if (p <= 0) return [Math.fround(l + r * gainL), Math.fround(r * gainR)]
  return [Math.fround(l * gainL), Math.fround(r + l * gainR)]
}

/**
 * Render source → StereoPanner → destination offline; returns [outL, outR].
 * `mono` renders a 1-channel source (the input port keeps it mono under
 * 'clamped-max'); `left`/`right` render a 2-channel source. `pan` goes through
 * StereoPannerOptions; `automate(panParam)` schedules automation instead.
 */
function renderPanned({ mono = null, left = null, right = null, pan, automate = null, length = 256 } = {}) {
  const c = new PlecoOfflineContext({ numberOfChannels: 2, length, sampleRate: SR })
  const channels = mono !== null ? 1 : 2
  const buf = c.createBuffer(channels, length, SR)
  if (mono !== null) buf.getChannelData(0).set(mono)
  else {
    buf.getChannelData(0).set(left)
    buf.getChannelData(1).set(right)
  }
  const src = c.createBufferSource()
  src.buffer = buf
  const panner = new PlecoStereoPannerNode(c, pan !== undefined ? { pan } : {})
  if (automate !== null) automate(panner.pan)
  src.connect(panner)
  panner.connect(c.destination)
  src.start(0)
  const out = c.renderSync()
  return [out.getChannelData(0), out.getChannelData(1)]
}

describe('PlecoStereoPannerNode — attribute surface', () => {
  it('defaults: 1 input, 1 output, channelCount 2, mode "clamped-max", interpretation "speakers"', () => {
    const panner = new PlecoStereoPannerNode(ctx())
    expect(panner.numberOfInputs).toBe(1)
    expect(panner.numberOfOutputs).toBe(1)
    expect(panner.channelCount).toBe(2)
    expect(panner.channelCountMode).toBe('clamped-max')
    expect(panner.channelInterpretation).toBe('speakers')
  })

  it('null options convert to the empty dictionary (WebIDL) — constructs with defaults', () => {
    const panner = new PlecoStereoPannerNode(ctx(), null)
    expect(panner.pan.value).toBe(0)
    expect(panner.channelCountMode).toBe('clamped-max')
  })

  it('pan param: defaultValue 0, minValue -1, maxValue 1, a-rate, value 0', () => {
    const panner = new PlecoStereoPannerNode(ctx())
    expect(panner.pan.defaultValue).toBe(0)
    expect(panner.pan.minValue).toBe(-1)
    expect(panner.pan.maxValue).toBe(1)
    expect(panner.pan.automationRate).toBe('a-rate')
    expect(panner.pan.value).toBe(0)
  })

  it('pan automationRate is NOT rate-constrained (k-rate is assignable)', () => {
    const panner = new PlecoStereoPannerNode(ctx())
    panner.pan.automationRate = 'k-rate'
    expect(panner.pan.automationRate).toBe('k-rate')
  })

  it('StereoPannerOptions.pan sets the initial value; defaultValue stays 0', () => {
    const panner = new PlecoStereoPannerNode(ctx(), { pan: 0.5 })
    expect(panner.pan.value).toBe(0.5)
    expect(panner.pan.defaultValue).toBe(0)
  })

  it('StereoPannerOptions.pan: non-finite or non-number throws TypeError (WebIDL float)', () => {
    for (const bad of [NaN, Infinity, -Infinity, '0.5', {}]) {
      expect(() => new PlecoStereoPannerNode(ctx(), { pan: bad })).toThrow(TypeError)
    }
  })

  it('AudioNodeOptions flow through: channelInterpretation "discrete" is applied', () => {
    const panner = new PlecoStereoPannerNode(ctx(), { channelInterpretation: 'discrete' })
    expect(panner.channelInterpretation).toBe('discrete')
  })

  it('constructor dictionary: invalid ChannelInterpretation throws TypeError', () => {
    expect(() => new PlecoStereoPannerNode(ctx(), { channelInterpretation: 'surround' })).toThrow(TypeError)
  })
})

describe('PlecoStereoPannerNode — channelCount constraints (spec table: > 2 → NotSupportedError)', () => {
  it('setting channelCount above 2 throws NotSupportedError and leaves the value untouched', () => {
    const panner = new PlecoStereoPannerNode(ctx())
    for (const bad of [3, 4, 32]) {
      let err = null
      try {
        panner.channelCount = bad
      } catch (e) {
        err = e
      }
      expect(err).toBeInstanceOf(DOMException)
      expect(err.name).toBe('NotSupportedError')
    }
    expect(panner.channelCount).toBe(2)
  })

  it('channelCount 1 and 2 are assignable', () => {
    const panner = new PlecoStereoPannerNode(ctx())
    panner.channelCount = 1
    expect(panner.channelCount).toBe(1)
    panner.channelCount = 2
    expect(panner.channelCount).toBe(2)
  })

  it('constructor dictionary: channelCount > 2 throws NotSupportedError, <= 2 is accepted', () => {
    let err = null
    try {
      new PlecoStereoPannerNode(ctx(), { channelCount: 4 })
    } catch (e) {
      err = e
    }
    expect(err).toBeInstanceOf(DOMException)
    expect(err.name).toBe('NotSupportedError')
    expect(new PlecoStereoPannerNode(ctx(), { channelCount: 1 }).channelCount).toBe(1)
  })
})

describe("PlecoStereoPannerNode — channelCountMode constraints (spec table: 'max' → NotSupportedError)", () => {
  it("setting channelCountMode 'max' throws NotSupportedError and leaves the mode untouched", () => {
    const panner = new PlecoStereoPannerNode(ctx())
    let err = null
    try {
      panner.channelCountMode = 'max'
    } catch (e) {
      err = e
    }
    expect(err).toBeInstanceOf(DOMException)
    expect(err.name).toBe('NotSupportedError')
    expect(panner.channelCountMode).toBe('clamped-max')
  })

  it("'explicit' and 'clamped-max' are assignable", () => {
    const panner = new PlecoStereoPannerNode(ctx())
    panner.channelCountMode = 'explicit'
    expect(panner.channelCountMode).toBe('explicit')
    panner.channelCountMode = 'clamped-max'
    expect(panner.channelCountMode).toBe('clamped-max')
  })

  it('invalid enum ATTRIBUTE assignment is silently ignored (WebIDL enum semantics)', () => {
    const panner = new PlecoStereoPannerNode(ctx())
    panner.channelCountMode = 'garbage'
    expect(panner.channelCountMode).toBe('clamped-max')
  })

  it("constructor dictionary: channelCountMode 'max' throws NotSupportedError", () => {
    let err = null
    try {
      new PlecoStereoPannerNode(ctx(), { channelCountMode: 'max' })
    } catch (e) {
      err = e
    }
    expect(err).toBeInstanceOf(DOMException)
    expect(err.name).toBe('NotSupportedError')
  })

  it('constructor dictionary: an invalid ChannelCountMode string throws TypeError (enum conversion runs first)', () => {
    expect(() => new PlecoStereoPannerNode(ctx(), { channelCountMode: 'maximal' })).toThrow(TypeError)
  })

  it("constructor dictionary: 'explicit' is accepted", () => {
    expect(new PlecoStereoPannerNode(ctx(), { channelCountMode: 'explicit' }).channelCountMode).toBe('explicit')
  })
})

describe('PlecoStereoPannerNode — mono input panning (spec x = (pan+1)/2)', () => {
  // Dyadic samples: exact in float32, so mirror comparisons can be `toBe`.
  const monoIn = Float32Array.from({ length: 256 }, (_, i) => (i - 128) / 128)

  it('pan 0 (center): both channels carry input · cos(π/4) = input · sin(π/4), mirror-exact', () => {
    const [outL, outR] = renderPanned({ mono: monoIn, pan: 0 })
    for (let i = 0; i < monoIn.length; i++) {
      const [refL, refR] = panMonoRef(monoIn[i], 0)
      expect(outL[i]).toBe(refL)
      expect(outR[i]).toBe(refR)
    }
  })

  it('pan -1 (full left): outL is the input sample-exact, outR is silent', () => {
    const [outL, outR] = renderPanned({ mono: monoIn, pan: -1 })
    for (let i = 0; i < monoIn.length; i++) {
      expect(outL[i]).toBe(monoIn[i]) // cos(0) = 1 exactly
      expect(outR[i] === 0).toBe(true) // sin(0) = 0 exactly (±0 both accepted)
    }
  })

  it('pan +1 (full right): outR is the input sample-exact, outL is the cos(π/2) double-precision residue', () => {
    const [outL, outR] = renderPanned({ mono: monoIn, pan: 1 })
    for (let i = 0; i < monoIn.length; i++) {
      expect(outR[i]).toBe(monoIn[i]) // sin(π/2) = 1 exactly
      expect(Math.abs(outL[i])).toBeLessThan(1e-15) // cos(π/2) ≈ 6.12e-17, not exactly 0
    }
  })

  it('pan ±0.5: mirror-exact against the spec math', () => {
    for (const pan of [-0.5, 0.5]) {
      const [outL, outR] = renderPanned({ mono: monoIn, pan })
      for (let i = 0; i < monoIn.length; i++) {
        const [refL, refR] = panMonoRef(monoIn[i], pan)
        expect(outL[i]).toBe(refL)
        expect(outR[i]).toBe(refR)
      }
    }
  })

  it('equal-power law: outL² + outR² = input² across the pan range (tolerance 1e-6)', () => {
    const dc = new Float32Array(256).fill(0.5)
    for (const pan of [-1, -0.75, -0.25, 0, 0.25, 0.75, 1]) {
      const [outL, outR] = renderPanned({ mono: dc, pan })
      expect(outL[0] * outL[0] + outR[0] * outR[0]).toBeCloseTo(0.25, 6)
    }
  })
})

describe('PlecoStereoPannerNode — stereo input panning (asymmetric spec branches)', () => {
  const leftIn = Float32Array.from({ length: 256 }, (_, i) => (i - 128) / 128)
  const rightIn = Float32Array.from({ length: 256 }, (_, i) => (128 - i) / 256)

  it('pan 0: identity — outR is inR sample-exact; outL matches the mirror (inL + inR·cos(π/2) residue)', () => {
    const [outL, outR] = renderPanned({ left: leftIn, right: rightIn, pan: 0 })
    for (let i = 0; i < leftIn.length; i++) {
      const [refL, refR] = panStereoRef(leftIn[i], rightIn[i], 0)
      expect(outL[i]).toBe(refL)
      expect(outR[i]).toBe(refR)
      expect(outR[i]).toBe(rightIn[i]) // pan<=0 branch: gainR = sin(π/2) = 1 exactly
    }
  })

  it('pan -1 (full left): outL = inL + inR sample-exact, outR silent', () => {
    const [outL, outR] = renderPanned({ left: leftIn, right: rightIn, pan: -1 })
    for (let i = 0; i < leftIn.length; i++) {
      expect(outL[i]).toBe(Math.fround(leftIn[i] + rightIn[i])) // gainL = cos(0) = 1
      expect(outR[i] === 0).toBe(true) // gainR = sin(0) = 0
    }
  })

  it('pan +1 (full right): outR = inR + inL sample-exact, outL is the cos(π/2) residue of inL', () => {
    const [outL, outR] = renderPanned({ left: leftIn, right: rightIn, pan: 1 })
    for (let i = 0; i < leftIn.length; i++) {
      expect(outR[i]).toBe(Math.fround(rightIn[i] + leftIn[i])) // gainR = sin(π/2) = 1
      expect(Math.abs(outL[i])).toBeLessThan(1e-15)
    }
  })

  it('pan -0.5 (R mixes into L) and +0.5 (L mixes into R): mirror-exact on both branches', () => {
    for (const pan of [-0.5, 0.5]) {
      const [outL, outR] = renderPanned({ left: leftIn, right: rightIn, pan })
      for (let i = 0; i < leftIn.length; i++) {
        const [refL, refR] = panStereoRef(leftIn[i], rightIn[i], pan)
        expect(outL[i]).toBe(refL)
        expect(outR[i]).toBe(refR)
      }
    }
  })
})

describe('PlecoStereoPannerNode — a-rate automation and clamping', () => {
  it('a-rate linear ramp -1 → 1 pans per SAMPLE, not per block (tolerance 1e-6)', () => {
    const dc = new Float32Array(256).fill(1)
    const [outL, outR] = renderPanned({
      mono: dc,
      automate: (pan) => {
        pan.setValueAtTime(-1, 0)
        pan.linearRampToValueAtTime(1, 256 / SR)
      },
    })
    for (const i of [0, 1, 64, 127, 128, 129, 192, 255]) {
      const panAt = -1 + (2 * i) / 256 // ramp value at frame i
      const x = (panAt + 1) / 2
      expect(outL[i]).toBeCloseTo(Math.cos(x * HALF_PI), 6)
      expect(outR[i]).toBeCloseTo(Math.sin(x * HALF_PI), 6)
    }
    // Per-sample motion inside a single render quantum (frames 0..127).
    expect(outR[1]).toBeGreaterThan(outR[0])
    expect(outR[127]).toBeGreaterThan(outR[64])
  })

  it('k-rate: the first-frame pan value holds for the whole render quantum', () => {
    const dc = new Float32Array(256).fill(1)
    const [outL, outR] = renderPanned({
      mono: dc,
      automate: (pan) => {
        pan.automationRate = 'k-rate'
        pan.setValueAtTime(-1, 0)
        pan.linearRampToValueAtTime(1, 256 / SR)
      },
    })
    // Quantum 0 (frames 0..127): pan sampled at frame 0 = -1 → hard left.
    for (let i = 0; i < 128; i++) {
      expect(outL[i]).toBe(1)
      expect(outR[i] === 0).toBe(true)
    }
    // Quantum 1 (frames 128..255): pan sampled at frame 128 = 0 → equal power.
    for (let i = 128; i < 256; i++) {
      expect(outL[i]).toBeCloseTo(Math.SQRT1_2, 6)
      expect(outR[i]).toBeCloseTo(Math.SQRT1_2, 6)
    }
  })

  it('computedValue clamps to [-1, 1]: pan.value = 5 renders bit-identical to pan = 1', () => {
    const monoIn = Float32Array.from({ length: 256 }, (_, i) => (i - 128) / 128)
    const [clampedL, clampedR] = renderPanned({ mono: monoIn, automate: (pan) => (pan.value = 5) })
    const [refL, refR] = renderPanned({ mono: monoIn, pan: 1 })
    expect(Array.from(clampedL)).toEqual(Array.from(refL))
    expect(Array.from(clampedR)).toEqual(Array.from(refR))
  })
})

describe('PlecoStereoPannerNode — output shape', () => {
  it('output is hard-coded stereo: a mono source still produces two distinct channels', () => {
    const monoIn = new Float32Array(256).fill(0.5)
    const [outL, outR] = renderPanned({ mono: monoIn, pan: 0.5 })
    // x = 0.75: gainL = cos(3π/8) ≈ 0.3827, gainR = sin(3π/8) ≈ 0.9239.
    expect(outL[0]).toBeCloseTo(0.5 * Math.cos(0.75 * HALF_PI), 6)
    expect(outR[0]).toBeCloseTo(0.5 * Math.sin(0.75 * HALF_PI), 6)
    expect(outL[0]).not.toBe(outR[0])
  })

  it('an unconnected input pans one channel of silence: output is stereo silence', () => {
    const c = new PlecoOfflineContext({ numberOfChannels: 2, length: 128, sampleRate: SR })
    const panner = new PlecoStereoPannerNode(c, { pan: -0.5 })
    panner.connect(c.destination)
    const out = c.renderSync()
    for (let ch = 0; ch < 2; ch++) {
      const data = out.getChannelData(ch)
      for (let i = 0; i < 128; i++) expect(data[i] === 0).toBe(true)
    }
  })
})
