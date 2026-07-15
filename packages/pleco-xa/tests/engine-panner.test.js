/**
 * tests/engine-panner.test.js — PlecoAudioListener + PlecoPannerNode (P19).
 *
 * Spec § The AudioListener Interface: nine a-rate AudioParams (defaults
 * forwardZ -1, upY 1, everything else 0) with per-quantum block caching
 * shared across PannerNodes, the context-singleton vend
 * (getContextListener — the body of the future BaseAudioContext.listener
 * getter), and the DEPRECATED setPosition/setOrientation conveniences
 * (equivalent to .value sets; NotSupportedError when a setValueCurveAtTime
 * automation is active, checked atomically).
 *
 * Spec § The PannerNode Interface + § Spatialization: six a-rate
 * position/orientation AudioParams, the exact azimuth algorithm (cardinal
 * directions land on exact ±90/0/180 degrees — asserted with toBe), the
 * equalpower clamp/wrap + mono/stereo branches, the three DistanceModelType
 * gain formulas (including the linear model's processing-time rolloffFactor
 * clamp and the refDistance = 0 → 0 rule), the sound-cone gain (unity /
 * outer / interpolated), the spec gain ordering (panning first, then
 * coneGain·distanceGain), attribute constraint errors (RangeError /
 * InvalidStateError / NotSupportedError at the spec's exact points), and
 * channel limitations (channelCount ≤ 2, channelCountMode 'max' forbidden).
 *
 * PanningModelType 'HRTF' is accepted as an enum value; selecting it renders
 * STEREO SILENCE — the engine's documented open parity gap (no HRTF
 * impulse-response dataset), never a silent equalpower substitution.
 */
import { describe, it, expect } from 'vitest'
import { PlecoOfflineContext } from '../src/engine/xa-offline-context.js'
import { PlecoPannerNode } from '../src/engine/nodes/xa-panner.js'
import { PlecoAudioListener, getContextListener } from '../src/engine/xa-listener.js'

const SR = 48000
const F32_MAX = 3.4028234663852886e38
const COS45 = Math.cos(Math.PI / 4) // equal-power center gain

const ctx = (length = 128) => new PlecoOfflineContext({ numberOfChannels: 2, length, sampleRate: SR })

/**
 * Render source → PannerNode → destination offline; returns [outL, outR].
 * `mono` renders a 1-channel source; `left`/`right` a 2-channel source.
 * `options` goes through PannerOptions; `setup(panner, listener, context)`
 * runs before rendering for listener moves and automation.
 */
function renderSpatial({ mono = null, left = null, right = null, options, setup = null, length = 128 } = {}) {
  const c = ctx(length)
  const channels = mono !== null ? 1 : 2
  const buf = c.createBuffer(channels, length, SR)
  if (mono !== null) buf.getChannelData(0).set(mono)
  else {
    buf.getChannelData(0).set(left)
    buf.getChannelData(1).set(right)
  }
  const src = c.createBufferSource()
  src.buffer = buf
  const panner = new PlecoPannerNode(c, options)
  if (setup !== null) setup(panner, getContextListener(c), c)
  src.connect(panner)
  panner.connect(c.destination)
  src.start(0)
  const out = c.renderSync()
  return [out.getChannelData(0), out.getChannelData(1)]
}

const monoIn = new Float32Array(128).fill(0.5)

describe('PlecoAudioListener — param surface (spec § AudioListener attributes)', () => {
  it('exposes nine AudioParams with the spec defaults (forwardZ -1, upY 1, rest 0)', () => {
    const l = getContextListener(ctx())
    expect(l.positionX.value).toBe(0)
    expect(l.positionY.value).toBe(0)
    expect(l.positionZ.value).toBe(0)
    expect(l.forwardX.value).toBe(0)
    expect(l.forwardY.value).toBe(0)
    expect(l.forwardZ.value).toBe(-1)
    expect(l.upX.value).toBe(0)
    expect(l.upY.value).toBe(1)
    expect(l.upZ.value).toBe(0)
  })

  it('all nine params are a-rate with the full single-float nominal range', () => {
    const l = getContextListener(ctx())
    for (const p of [l.positionX, l.positionY, l.positionZ, l.forwardX, l.forwardY, l.forwardZ, l.upX, l.upY, l.upZ]) {
      expect(p.automationRate).toBe('a-rate')
      expect(p.minValue).toBe(-F32_MAX)
      expect(p.maxValue).toBe(F32_MAX)
    }
  })

  it('param getters are readonly-stable: repeated gets return the same instance', () => {
    const l = getContextListener(ctx())
    expect(l.positionX).toBe(l.positionX)
    expect(l.forwardZ).toBe(l.forwardZ)
    expect(l.upY).toBe(l.upY)
  })

  it('getContextListener vends ONE listener per context (the future .listener getter body)', () => {
    const c = ctx()
    const l = getContextListener(c)
    expect(l).toBeInstanceOf(PlecoAudioListener)
    expect(getContextListener(c)).toBe(l)
  })

  it('distinct contexts get distinct listeners', () => {
    expect(getContextListener(ctx())).not.toBe(getContextListener(ctx()))
  })

  it("every PannerNode spatializes against the context's ONE listener", () => {
    const c = ctx()
    const p1 = new PlecoPannerNode(c)
    const p2 = new PlecoPannerNode(c)
    expect(p1._listener).toBe(getContextListener(c))
    expect(p2._listener).toBe(p1._listener)
  })
})

describe('PlecoAudioListener — per-quantum block cache', () => {
  it('_quantum(now) returns the SAME preallocated block set on repeat pulls within a quantum', () => {
    const l = getContextListener(ctx())
    const b = l._quantum(0)
    expect(l._quantum(0)).toBe(b)
    expect(b.px).toHaveLength(128)
    expect(b.fz[0]).toBe(-1)
    expect(b.uy[127]).toBe(1)
  })

  it('a value change within the same quantum is not re-pulled (per-quantum semantics); the next quantum sees it', () => {
    const l = getContextListener(ctx())
    const b = l._quantum(0)
    expect(b.px[0]).toBe(0)
    l.positionX.value = 5
    expect(l._quantum(0).px[0]).toBe(0) // cached for this quantum
    expect(l._quantum(128 / SR).px[0]).toBe(5) // refreshed at the next quantum key
  })
})

describe('PlecoAudioListener — deprecated setPosition/setOrientation (flagged conveniences)', () => {
  it('setPosition(x, y, z) is equivalent to setting positionX/Y/Z .value', () => {
    const l = getContextListener(ctx())
    l.setPosition(1, 2, 3)
    expect(l.positionX.value).toBe(1)
    expect(l.positionY.value).toBe(2)
    expect(l.positionZ.value).toBe(3)
  })

  it('setOrientation(x, y, z, xUp, yUp, zUp) sets forward and up together', () => {
    const l = getContextListener(ctx())
    l.setOrientation(0, 0, 1, 1, 0, 0)
    expect(l.forwardX.value).toBe(0)
    expect(l.forwardY.value).toBe(0)
    expect(l.forwardZ.value).toBe(1)
    expect(l.upX.value).toBe(1)
    expect(l.upY.value).toBe(0)
    expect(l.upZ.value).toBe(0)
  })

  it('non-finite (or missing) arguments throw TypeError (WebIDL float)', () => {
    const l = getContextListener(ctx())
    expect(() => l.setPosition(NaN, 0, 0)).toThrow(TypeError)
    expect(() => l.setPosition(0, Infinity, 0)).toThrow(TypeError)
    expect(() => l.setPosition(1, 2)).toThrow(TypeError) // missing z
    expect(() => l.setOrientation(0, 0, -1, 0, NaN, 0)).toThrow(TypeError)
  })

  it('setPosition throws NotSupportedError when a setValueCurveAtTime window covers the call time — atomically', () => {
    const l = getContextListener(ctx())
    l.positionZ.setValueCurveAtTime([0, 1], 0, 1) // window [0, 1) contains currentTime 0
    let err = null
    try {
      l.setPosition(7, 8, 9)
    } catch (e) {
      err = e
    }
    expect(err).toBeInstanceOf(DOMException)
    expect(err.name).toBe('NotSupportedError')
    expect(l.positionX.value).toBe(0) // atomic: nothing was written
    expect(l.positionY.value).toBe(0)
  })

  it('setOrientation throws NotSupportedError when any of the six params has an active curve — atomically', () => {
    const l = getContextListener(ctx())
    l.upY.setValueCurveAtTime([1, 0.5], 0, 1)
    let err = null
    try {
      l.setOrientation(1, 0, 0, 0, 0, 1)
    } catch (e) {
      err = e
    }
    expect(err).toBeInstanceOf(DOMException)
    expect(err.name).toBe('NotSupportedError')
    expect(l.forwardX.value).toBe(0)
    expect(l.forwardZ.value).toBe(-1)
  })
})

describe('PlecoPannerNode — attribute surface and defaults', () => {
  it('node table: 1 input, 1 output, channelCount 2, mode "clamped-max", interpretation "speakers"', () => {
    const p = new PlecoPannerNode(ctx())
    expect(p.numberOfInputs).toBe(1)
    expect(p.numberOfOutputs).toBe(1)
    expect(p.channelCount).toBe(2)
    expect(p.channelCountMode).toBe('clamped-max')
    expect(p.channelInterpretation).toBe('speakers')
  })

  it('attribute defaults: equalpower / inverse / 1 / 10000 / 1 / 360 / 360 / 0', () => {
    const p = new PlecoPannerNode(ctx())
    expect(p.panningModel).toBe('equalpower')
    expect(p.distanceModel).toBe('inverse')
    expect(p.refDistance).toBe(1)
    expect(p.maxDistance).toBe(10000)
    expect(p.rolloffFactor).toBe(1)
    expect(p.coneInnerAngle).toBe(360)
    expect(p.coneOuterAngle).toBe(360)
    expect(p.coneOuterGain).toBe(0)
  })

  it('param defaults: position (0,0,0), orientation (1,0,0), all a-rate', () => {
    const p = new PlecoPannerNode(ctx())
    expect(p.positionX.value).toBe(0)
    expect(p.positionY.value).toBe(0)
    expect(p.positionZ.value).toBe(0)
    expect(p.orientationX.value).toBe(1)
    expect(p.orientationY.value).toBe(0)
    expect(p.orientationZ.value).toBe(0)
    for (const q of [p.positionX, p.positionY, p.positionZ, p.orientationX, p.orientationY, p.orientationZ]) {
      expect(q.automationRate).toBe('a-rate')
    }
  })

  it('null options convert to the empty dictionary (WebIDL) — constructs with defaults', () => {
    const p = new PlecoPannerNode(ctx(), null)
    expect(p.panningModel).toBe('equalpower')
    expect(p.orientationX.value).toBe(1)
  })

  it('PannerOptions initializes every member (orientationX explicitly 0 overrides its default 1)', () => {
    const p = new PlecoPannerNode(ctx(), {
      panningModel: 'HRTF',
      distanceModel: 'linear',
      positionX: 1,
      positionY: 2,
      positionZ: 3,
      orientationX: 0,
      orientationY: 4,
      orientationZ: 5,
      refDistance: 2,
      maxDistance: 100,
      rolloffFactor: 0.5,
      coneInnerAngle: 90,
      coneOuterAngle: 180,
      coneOuterGain: 0.25,
    })
    expect(p.panningModel).toBe('HRTF')
    expect(p.distanceModel).toBe('linear')
    expect(p.positionX.value).toBe(1)
    expect(p.positionY.value).toBe(2)
    expect(p.positionZ.value).toBe(3)
    expect(p.orientationX.value).toBe(0)
    expect(p.orientationY.value).toBe(4)
    expect(p.orientationZ.value).toBe(5)
    expect(p.refDistance).toBe(2)
    expect(p.maxDistance).toBe(100)
    expect(p.rolloffFactor).toBe(0.5)
    expect(p.coneInnerAngle).toBe(90)
    expect(p.coneOuterAngle).toBe(180)
    expect(p.coneOuterGain).toBe(0.25)
  })

  it('constructor dictionary: invalid PanningModelType / DistanceModelType strings throw TypeError', () => {
    expect(() => new PlecoPannerNode(ctx(), { panningModel: 'hrtf' })).toThrow(TypeError)
    expect(() => new PlecoPannerNode(ctx(), { distanceModel: 'quadratic' })).toThrow(TypeError)
  })

  it('constructor dictionary: non-finite position/orientation floats throw TypeError', () => {
    expect(() => new PlecoPannerNode(ctx(), { positionX: NaN })).toThrow(TypeError)
    expect(() => new PlecoPannerNode(ctx(), { orientationZ: Infinity })).toThrow(TypeError)
    expect(() => new PlecoPannerNode(ctx(), { positionY: '3' })).toThrow(TypeError)
  })

  it('constructor dictionary: distance/cone constraints throw at the spec error points', () => {
    expect(() => new PlecoPannerNode(ctx(), { refDistance: -1 })).toThrow(RangeError)
    expect(() => new PlecoPannerNode(ctx(), { maxDistance: 0 })).toThrow(RangeError)
    expect(() => new PlecoPannerNode(ctx(), { rolloffFactor: -0.5 })).toThrow(RangeError)
    for (const bad of [-0.1, 1.5]) {
      let err = null
      try {
        new PlecoPannerNode(ctx(), { coneOuterGain: bad })
      } catch (e) {
        err = e
      }
      expect(err).toBeInstanceOf(DOMException)
      expect(err.name).toBe('InvalidStateError')
    }
  })
})

describe('PlecoPannerNode — enum and double attribute semantics', () => {
  it("panningModel: 'HRTF' is a VALID enum value and assignable; invalid strings are silently ignored", () => {
    const p = new PlecoPannerNode(ctx())
    p.panningModel = 'HRTF'
    expect(p.panningModel).toBe('HRTF')
    p.panningModel = 'binaural'
    expect(p.panningModel).toBe('HRTF')
    p.panningModel = 'equalpower'
    expect(p.panningModel).toBe('equalpower')
  })

  it('distanceModel: all three values assignable; invalid strings silently ignored', () => {
    const p = new PlecoPannerNode(ctx())
    for (const m of ['linear', 'exponential', 'inverse']) {
      p.distanceModel = m
      expect(p.distanceModel).toBe(m)
    }
    p.distanceModel = 'log'
    expect(p.distanceModel).toBe('inverse')
  })

  it('refDistance: negative → RangeError; zero is allowed (spec: "set to a negative value")', () => {
    const p = new PlecoPannerNode(ctx())
    expect(() => (p.refDistance = -0.001)).toThrow(RangeError)
    expect(p.refDistance).toBe(1)
    p.refDistance = 0
    expect(p.refDistance).toBe(0)
  })

  it('maxDistance: zero or negative → RangeError (spec: "set to a non-positive value")', () => {
    const p = new PlecoPannerNode(ctx())
    expect(() => (p.maxDistance = 0)).toThrow(RangeError)
    expect(() => (p.maxDistance = -5)).toThrow(RangeError)
    expect(p.maxDistance).toBe(10000)
  })

  it('rolloffFactor: negative → RangeError; values above 1 are stored (the attribute reflects the set value)', () => {
    const p = new PlecoPannerNode(ctx())
    expect(() => (p.rolloffFactor = -1)).toThrow(RangeError)
    p.rolloffFactor = 7
    expect(p.rolloffFactor).toBe(7)
  })

  it('coneOuterGain: outside [0, 1] → InvalidStateError DOMException; non-finite → TypeError', () => {
    const p = new PlecoPannerNode(ctx())
    for (const bad of [-0.5, 1.0001]) {
      let err = null
      try {
        p.coneOuterGain = bad
      } catch (e) {
        err = e
      }
      expect(err).toBeInstanceOf(DOMException)
      expect(err.name).toBe('InvalidStateError')
    }
    expect(() => (p.coneOuterGain = NaN)).toThrow(TypeError)
    expect(p.coneOuterGain).toBe(0)
    p.coneOuterGain = 1
    expect(p.coneOuterGain).toBe(1)
  })

  it('coneInnerAngle/coneOuterAngle accept any finite double (outside [0,360] is spec-undefined); non-finite → TypeError', () => {
    const p = new PlecoPannerNode(ctx())
    p.coneInnerAngle = 720
    p.coneOuterAngle = -90
    expect(p.coneInnerAngle).toBe(720)
    expect(p.coneOuterAngle).toBe(-90)
    expect(() => (p.coneInnerAngle = Infinity)).toThrow(TypeError)
    expect(() => (p.coneOuterAngle = NaN)).toThrow(TypeError)
  })
})

describe('PlecoPannerNode — channel limitations (shared with StereoPannerNode)', () => {
  it('channelCount > 2 throws NotSupportedError (attribute and constructor dictionary); 1 and 2 are assignable', () => {
    const p = new PlecoPannerNode(ctx())
    let err = null
    try {
      p.channelCount = 3
    } catch (e) {
      err = e
    }
    expect(err).toBeInstanceOf(DOMException)
    expect(err.name).toBe('NotSupportedError')
    expect(p.channelCount).toBe(2)
    p.channelCount = 1
    expect(p.channelCount).toBe(1)
    expect(() => new PlecoPannerNode(ctx(), { channelCount: 4 })).toThrow(DOMException)
    expect(new PlecoPannerNode(ctx(), { channelCount: 1 }).channelCount).toBe(1)
  })

  it("channelCountMode 'max' throws NotSupportedError (attribute and dictionary); invalid enum attr is ignored, dict is TypeError", () => {
    const p = new PlecoPannerNode(ctx())
    let err = null
    try {
      p.channelCountMode = 'max'
    } catch (e) {
      err = e
    }
    expect(err).toBeInstanceOf(DOMException)
    expect(err.name).toBe('NotSupportedError')
    p.channelCountMode = 'garbage'
    expect(p.channelCountMode).toBe('clamped-max')
    p.channelCountMode = 'explicit'
    expect(p.channelCountMode).toBe('explicit')
    expect(() => new PlecoPannerNode(ctx(), { channelCountMode: 'max' })).toThrow(DOMException)
    expect(() => new PlecoPannerNode(ctx(), { channelCountMode: 'maximal' })).toThrow(TypeError)
  })
})

describe('PlecoPannerNode — deprecated setPosition/setOrientation (flagged conveniences)', () => {
  it('setPosition/setOrientation set the corresponding param values', () => {
    const p = new PlecoPannerNode(ctx())
    p.setPosition(1, 2, 3)
    p.setOrientation(0, 0, -1)
    expect(p.positionX.value).toBe(1)
    expect(p.positionY.value).toBe(2)
    expect(p.positionZ.value).toBe(3)
    expect(p.orientationX.value).toBe(0)
    expect(p.orientationY.value).toBe(0)
    expect(p.orientationZ.value).toBe(-1)
  })

  it('non-finite arguments throw TypeError (WebIDL float)', () => {
    const p = new PlecoPannerNode(ctx())
    expect(() => p.setPosition(NaN, 0, 0)).toThrow(TypeError)
    expect(() => p.setOrientation(0, 0)).toThrow(TypeError) // missing z
  })

  it('an active setValueCurveAtTime on any touched param → NotSupportedError, atomically', () => {
    const p = new PlecoPannerNode(ctx())
    p.positionY.setValueCurveAtTime([0, 2], 0, 0.5)
    let err = null
    try {
      p.setPosition(9, 9, 9)
    } catch (e) {
      err = e
    }
    expect(err).toBeInstanceOf(DOMException)
    expect(err.name).toBe('NotSupportedError')
    expect(p.positionX.value).toBe(0)
    // Orientation params are untouched by the position curve — setOrientation still works.
    p.setOrientation(0, 1, 0)
    expect(p.orientationY.value).toBe(1)
  })
})

describe('PlecoPannerNode — azimuth: cardinal directions (spec § Azimuth and Elevation, exact)', () => {
  it('source at the listener (degenerate): azimuth 0 → equal-power center, distance gain 1', () => {
    const [outL, outR] = renderSpatial({ mono: monoIn })
    const ref = Math.fround(0.5 * COS45)
    for (const i of [0, 64, 127]) {
      expect(outL[i]).toBe(ref)
      expect(outR[i]).toBe(ref)
    }
  })

  it('source directly right (1, 0, 0): azimuth +90 exactly — outR is the input sample-exact, outL the cos(π/2) residue', () => {
    const [outL, outR] = renderSpatial({ mono: monoIn, options: { positionX: 1 } })
    for (const i of [0, 64, 127]) {
      expect(outR[i]).toBe(0.5) // sin(π/2) = 1, distance gain 1/(1+0) = 1, cone 1
      expect(Math.abs(outL[i])).toBeLessThan(1e-15)
    }
  })

  it('source directly left (-1, 0, 0): azimuth -90 exactly — outL is the input sample-exact, outR silent', () => {
    const [outL, outR] = renderSpatial({ mono: monoIn, options: { positionX: -1 } })
    for (const i of [0, 64, 127]) {
      expect(outL[i]).toBe(0.5) // cos(0) = 1 exactly
      expect(outR[i] === 0).toBe(true) // sin(0) = 0 exactly
    }
  })

  it('source straight ahead (0, 0, -1): azimuth 0 exactly — equal power', () => {
    const [outL, outR] = renderSpatial({ mono: monoIn, options: { positionZ: -1 } })
    const ref = Math.fround(0.5 * COS45)
    expect(outL[0]).toBe(ref)
    expect(outR[0]).toBe(ref)
  })

  it('source directly behind (0, 0, 1): wraps to azimuth 0 — equal power (mono has no front/back cue)', () => {
    const [outL, outR] = renderSpatial({ mono: monoIn, options: { positionZ: 1 } })
    const ref = Math.fround(0.5 * COS45)
    expect(outL[0]).toBe(ref)
    expect(outR[0]).toBe(ref)
  })

  it('source directly above (0, 1, 0): zero horizontal projection → azimuth 0 — equal power', () => {
    const [outL, outR] = renderSpatial({ mono: monoIn, options: { positionY: 1 } })
    const ref = Math.fround(0.5 * COS45)
    expect(outL[0]).toBe(ref)
    expect(outR[0]).toBe(ref)
  })

  it("degenerate listener basis (forward ∥ up): 'right' undefined → azimuth 0 — equal power", () => {
    const [outL, outR] = renderSpatial({
      mono: monoIn,
      options: { positionX: 1 },
      setup: (_, l) => l.setOrientation(0, 1, 0, 0, 1, 0),
    })
    const ref = Math.fround(0.5 * COS45)
    expect(outL[0]).toBe(ref)
    expect(outR[0]).toBe(ref)
  })
})

describe('PlecoPannerNode — stereo input branches (spec § equalpower step 5)', () => {
  const leftIn = Float32Array.from({ length: 128 }, (_, i) => (i - 64) / 64)
  const rightIn = Float32Array.from({ length: 128 }, (_, i) => (64 - i) / 128)

  it('azimuth +90 (source right): outR = inR + inL sample-exact, outL is the residue of inL', () => {
    const [outL, outR] = renderSpatial({ left: leftIn, right: rightIn, options: { positionX: 1 } })
    for (let i = 0; i < 128; i++) {
      expect(outR[i]).toBe(Math.fround(rightIn[i] + leftIn[i])) // gainR = sin(π/2) = 1
      expect(Math.abs(outL[i])).toBeLessThan(1e-15)
    }
  })

  it('azimuth -90 (source left): outL = inL + inR sample-exact, outR silent', () => {
    const [outL, outR] = renderSpatial({ left: leftIn, right: rightIn, options: { positionX: -1 } })
    for (let i = 0; i < 128; i++) {
      expect(outL[i]).toBe(Math.fround(leftIn[i] + rightIn[i])) // gainL = cos(0) = 1
      expect(outR[i] === 0).toBe(true)
    }
  })

  it('azimuth 0 (center): the pan ≤ 0 branch is the identity on the right channel (gainR = sin(π/2) = 1)', () => {
    const [, outR] = renderSpatial({ left: leftIn, right: rightIn })
    for (let i = 0; i < 128; i++) expect(outR[i]).toBe(rightIn[i])
  })
})

describe('PlecoPannerNode — distance models (spec § DistanceModelType, exact formulas)', () => {
  it('inverse (default): d = 10, ref 1, f 1 → gain 0.1', () => {
    const [, outR] = renderSpatial({ mono: monoIn, options: { positionX: 10 } })
    expect(outR[0]).toBeCloseTo(0.5 * 0.1, 7)
  })

  it('inverse: d below refDistance clamps to ref → gain exactly 1', () => {
    const [, outR] = renderSpatial({ mono: monoIn, options: { positionX: 0.5 } }) // azimuth +90, d = 0.5 < ref 1
    expect(outR[0]).toBe(0.5)
  })

  it('inverse: refDistance 0 → gain 0 regardless of d and f (spec rule) — silence', () => {
    const [outL, outR] = renderSpatial({ mono: monoIn, options: { positionX: 2, refDistance: 0 } })
    for (let i = 0; i < 128; i++) {
      expect(outL[i] === 0).toBe(true)
      expect(outR[i] === 0).toBe(true)
    }
  })

  it('linear: ref 1, max 10, d 5.5, f 1 → gain 0.5 (outR exactly 0.25 on 0.5 input)', () => {
    const [, outR] = renderSpatial({
      mono: monoIn,
      options: { distanceModel: 'linear', refDistance: 1, maxDistance: 10, positionX: 5.5 },
    })
    expect(outR[0]).toBe(0.25)
  })

  it('linear: rolloffFactor above 1 is clamped to 1 AT PROCESSING TIME — renders identically to f = 1', () => {
    const opts = { distanceModel: 'linear', refDistance: 1, maxDistance: 10, positionX: 5.5 }
    const [, ref] = renderSpatial({ mono: monoIn, options: { ...opts, rolloffFactor: 1 } })
    const [, clamped] = renderSpatial({ mono: monoIn, options: { ...opts, rolloffFactor: 3 } })
    expect(Array.from(clamped)).toEqual(Array.from(ref))
  })

  it('linear: d beyond maxDistance clamps → gain 1 - f (0 for f = 1 → silence; 0.5 for f = 0.5)', () => {
    const opts = { distanceModel: 'linear', refDistance: 1, maxDistance: 10, positionX: 20 }
    const [, silent] = renderSpatial({ mono: monoIn, options: { ...opts, rolloffFactor: 1 } })
    for (let i = 0; i < 128; i++) expect(silent[i] === 0).toBe(true)
    const [, half] = renderSpatial({ mono: monoIn, options: { ...opts, rolloffFactor: 0.5 } })
    expect(half[0]).toBe(0.25)
  })

  it("linear: d'ref = d'max degenerates to 1 - f (refDistance = maxDistance)", () => {
    const [, outR] = renderSpatial({
      mono: monoIn,
      options: { distanceModel: 'linear', refDistance: 5, maxDistance: 5, rolloffFactor: 0.5, positionX: 2 },
    })
    expect(outR[0]).toBe(0.25)
  })

  it('exponential: ref 1, f 2, d 4 → gain 4^-2 = 0.0625 (outR exactly 0.03125)', () => {
    const [, outR] = renderSpatial({
      mono: monoIn,
      options: { distanceModel: 'exponential', rolloffFactor: 2, positionX: 4 },
    })
    expect(outR[0]).toBe(0.03125)
  })

  it('exponential: refDistance 0 → gain 0 — silence', () => {
    const [, outR] = renderSpatial({
      mono: monoIn,
      options: { distanceModel: 'exponential', refDistance: 0, positionX: 4 },
    })
    for (let i = 0; i < 128; i++) expect(outR[i] === 0).toBe(true)
  })
})

describe('PlecoPannerNode — sound cone (spec § Sound Cones)', () => {
  // Source in front of the listener at (0, 0, -1); listener → source direction is (0, 0, -1),
  // source → listener direction is (0, 0, 1). Azimuth 0 → equal-power center gains.
  const front = { positionZ: -1 }
  const center = Math.fround(0.5 * COS45)

  it('default cone (360/360) is unity gain even when the source points away from the listener', () => {
    const [outL] = renderSpatial({ mono: monoIn, options: { ...front, orientationZ: -1, orientationX: 0 } })
    expect(outL[0]).toBe(center)
  })

  it('source pointing AT the listener (orientation (0,0,1)) inside the inner cone → unity', () => {
    const [outL] = renderSpatial({
      mono: monoIn,
      options: { ...front, orientationX: 0, orientationZ: 1, coneInnerAngle: 90, coneOuterAngle: 180, coneOuterGain: 0.25 },
    })
    expect(outL[0]).toBe(center)
  })

  it('source pointing AWAY (angle 180 ≥ outer half-angle) → coneOuterGain', () => {
    const [outL, outR] = renderSpatial({
      mono: monoIn,
      options: { ...front, orientationX: 0, orientationZ: -1, coneInnerAngle: 90, coneOuterAngle: 180, coneOuterGain: 0.25 },
    })
    expect(outL[0]).toBeCloseTo(center * 0.25, 7)
    expect(outR[0]).toBeCloseTo(center * 0.25, 7)
  })

  it('between the cones: linear interpolation (1-x) + coneOuterGain·x (angle 90, inner 90, outer 270 → 0.625)', () => {
    const [outL] = renderSpatial({
      mono: monoIn,
      options: { ...front, orientationX: 1, orientationZ: 0, coneInnerAngle: 90, coneOuterAngle: 270, coneOuterGain: 0.25 },
    })
    expect(outL[0]).toBeCloseTo(center * 0.625, 7)
  })

  it('zero orientation vector → no cone → unity gain', () => {
    const [outL] = renderSpatial({
      mono: monoIn,
      options: { ...front, orientationX: 0, coneInnerAngle: 90, coneOuterAngle: 180, coneOuterGain: 0.25 },
    })
    expect(outL[0]).toBe(center) // orientation (0,0,0): spec's "no cone specified" exit
  })

  it('source AT the listener with an active cone → unity cone gain (no defined direction, inside every cone)', () => {
    // Default positions (0,0,0) place the source exactly on the listener, so the
    // listener→source vector has zero magnitude: the cone algorithm has no
    // direction to measure an angle against and returns unity, regardless of a
    // narrow, low-gain cone that would otherwise attenuate.
    const [outL, outR] = renderSpatial({
      mono: monoIn,
      options: { coneInnerAngle: 10, coneOuterAngle: 20, coneOuterGain: 0 },
    })
    // Azimuth 0 (sMag 0 → center) and distance 0 (inverse gain 1); cone gain 1
    // leaves the equal-power center image fully intact rather than silencing it.
    const centerCenter = Math.fround(0.5 * COS45)
    expect(outL[0]).toBe(centerCenter)
    expect(outR[0]).toBe(centerCenter)
  })
})

describe('PlecoPannerNode — a-rate/k-rate automation (spec: equalpower params are a-rate)', () => {
  it('a-rate positionX side-flip inside ONE quantum: left half → center sample → right half', () => {
    const dc = new Float32Array(128).fill(0.5)
    const [outL, outR] = renderSpatial({
      mono: dc,
      setup: (p, _, c) => {
        p.positionX.setValueAtTime(-1, 0)
        p.positionX.linearRampToValueAtTime(1, 128 / c.sampleRate)
      },
    })
    // Frame 0: pos -1 → full left. Frame 64: pos 0 → source at listener → center. Frame 100: pos > 0 → full right.
    expect(outL[0]).toBe(0.5)
    expect(outR[0] === 0).toBe(true)
    expect(outL[64]).toBe(Math.fround(0.5 * COS45))
    expect(outR[64]).toBe(Math.fround(0.5 * COS45))
    expect(outR[100]).toBe(0.5)
    expect(Math.abs(outL[100])).toBeLessThan(1e-15)
  })

  it('a-rate distance ramp: inverse gain tracks position PER SAMPLE (monotonically decreasing)', () => {
    const dc = new Float32Array(128).fill(0.5)
    const [, outR] = renderSpatial({
      mono: dc,
      setup: (p, _, c) => {
        p.positionX.setValueAtTime(1, 0)
        p.positionX.linearRampToValueAtTime(11, 128 / c.sampleRate)
      },
    })
    // At frame i, d = 1 + 10i/128 → outR = 0.5/d (azimuth +90 all along).
    for (const i of [0, 32, 64, 127]) {
      expect(outR[i]).toBeCloseTo(0.5 / (1 + (10 * i) / 128), 6)
    }
    expect(outR[1]).toBeLessThan(outR[0])
    expect(outR[127]).toBeLessThan(outR[64])
  })

  it('k-rate positionX: the first-frame value holds for the whole quantum', () => {
    const dc = new Float32Array(256).fill(0.5)
    const [outL, outR] = renderSpatial({
      mono: dc,
      length: 256,
      setup: (p, _, c) => {
        p.positionX.automationRate = 'k-rate'
        p.positionX.setValueAtTime(-1, 0)
        p.positionX.linearRampToValueAtTime(1, 256 / c.sampleRate)
      },
    })
    // Quantum 0 (frames 0..127): pos sampled at frame 0 = -1 → hard left throughout.
    for (const i of [0, 64, 127]) {
      expect(outL[i]).toBe(0.5)
      expect(outR[i] === 0).toBe(true)
    }
    // Quantum 1 (frames 128..255): pos sampled at frame 128 = 0 → center throughout.
    for (const i of [128, 200, 255]) {
      expect(outL[i]).toBe(Math.fround(0.5 * COS45))
      expect(outR[i]).toBe(Math.fround(0.5 * COS45))
    }
  })
})

describe('PlecoPannerNode — listener wiring (spec § AudioListener Processing)', () => {
  it('moving the listener right of the source (listener.positionX = 1) pans hard LEFT', () => {
    const [outL, outR] = renderSpatial({
      mono: monoIn,
      setup: (_, l) => (l.positionX.value = 1),
    })
    expect(outL[0]).toBe(0.5)
    expect(outR[0] === 0).toBe(true)
  })

  it('listener facing +z (setOrientation(0,0,1,0,1,0)): a source at (1,0,0) is now on the listener LEFT', () => {
    const [outL, outR] = renderSpatial({
      mono: monoIn,
      options: { positionX: 1 },
      setup: (_, l) => l.setOrientation(0, 0, 1, 0, 1, 0),
    })
    expect(outL[0]).toBeCloseTo(0.5, 10)
    expect(Math.abs(outR[0])).toBeLessThan(1e-15)
  })

  it('a node connected to a listener param modulates spatialization (ConstantSource → listener.positionX)', () => {
    const [outL, outR] = renderSpatial({
      mono: monoIn,
      setup: (_, l, c) => {
        const cs = c.createConstantSource() // offset defaults to 1
        cs.connect(l.positionX)
        cs.start(0)
      },
    })
    // computed listener.positionX = 0 + 1 → source at origin sits LEFT of the listener.
    expect(outL[0]).toBe(0.5)
    expect(outR[0] === 0).toBe(true)
  })

  it('a-rate listener automation: listener.positionX ramp flips the image per sample within one quantum', () => {
    const dc = new Float32Array(128).fill(0.5)
    const [outL, outR] = renderSpatial({
      mono: dc,
      setup: (_, l, c) => {
        l.positionX.setValueAtTime(-1, 0)
        l.positionX.linearRampToValueAtTime(1, 128 / c.sampleRate)
      },
    })
    // Listener left of source → source on the RIGHT; listener right of source → source on the LEFT.
    expect(outR[0]).toBe(0.5)
    expect(outL[0] < 1e-15).toBe(true)
    expect(outL[100]).toBe(0.5)
    expect(outR[100] === 0).toBe(true)
  })

  it('two panners share one listener and both render correctly in the same graph (per-quantum cache)', () => {
    const c = ctx()
    const buf = c.createBuffer(1, 128, SR)
    buf.getChannelData(0).fill(0.5)
    const src = c.createBufferSource()
    src.buffer = buf
    const p1 = new PlecoPannerNode(c, { positionX: 1 }) // hard right
    const p2 = new PlecoPannerNode(c, { positionX: -1 }) // hard left
    src.connect(p1)
    src.connect(p2)
    p1.connect(c.destination)
    p2.connect(c.destination)
    src.start(0)
    const out = c.renderSync()
    // Destination sums: L carries p2's full-left 0.5, R carries p1's full-right 0.5.
    expect(out.getChannelData(0)[0]).toBeCloseTo(0.5, 10)
    expect(out.getChannelData(1)[0]).toBeCloseTo(0.5, 10)
  })
})

describe("PlecoPannerNode — 'HRTF': explicit open parity gap (never an equalpower substitution)", () => {
  it("panningModel 'HRTF' renders STEREO SILENCE for a non-silent input", () => {
    const [outL, outR] = renderSpatial({ mono: monoIn, options: { panningModel: 'HRTF', positionX: 1 } })
    for (let i = 0; i < 128; i++) {
      expect(outL[i] === 0).toBe(true)
      expect(outR[i] === 0).toBe(true)
    }
  })

  it("switching back to 'equalpower' restores panned output", () => {
    const p = new PlecoPannerNode(ctx(), { panningModel: 'HRTF' })
    p.panningModel = 'equalpower'
    expect(p.panningModel).toBe('equalpower')
    const [outL, outR] = renderSpatial({
      mono: monoIn,
      options: { panningModel: 'HRTF' },
      setup: (panner) => (panner.panningModel = 'equalpower'),
    })
    expect(outL[0]).toBe(Math.fround(0.5 * COS45))
    expect(outR[0]).toBe(Math.fround(0.5 * COS45))
  })
})

describe('PlecoAudioListener — context guard', () => {
  it('requires a context (TypeError on null / non-context)', () => {
    expect(() => new PlecoAudioListener(null)).toThrow(TypeError)
    expect(() => new PlecoAudioListener({})).toThrow(TypeError)
  })
})

describe('PlecoPannerNode — azimuth quadrant coverage (equalpower wrap branches)', () => {
  // A source BEHIND and to the RIGHT of the default listener (forward (0,0,-1),
  // right (1,0,0)): the source→listener projection lands in the rear-right
  // quadrant, so _azimuth's internal angle is > 270° (the `450 - azimuth`
  // return branch) and the resulting azimuth of +135° trips the `azimuth > 90`
  // wrap to 45° — a still-right-biased image, not a front-center one.
  it('rear-right source wraps to a right-biased equal-power pan (azimuth 135 → 45)', () => {
    const [outL, outR] = renderSpatial({ mono: monoIn, options: { positionX: 1, positionZ: 1 } })
    expect(outL[0]).toBeGreaterThan(0)
    expect(outR[0]).toBeGreaterThan(outL[0]) // right-biased
    // Post-wrap azimuth 45° → mono x = (45+90)/180 = 0.75 → gainR/gainL = tan(3π/8),
    // a ratio the distance gain (equal on both channels) cannot change.
    expect(outR[0] / outL[0]).toBeCloseTo(Math.tan((3 * Math.PI) / 8), 5)
  })
})

describe('PlecoPannerNode — spatialization with a tilted listener-up vector', () => {
  // Tilt the listener up to (1,1,1): listenerRight = forward × up = (1,-1,0), a
  // diagonal right axis. A source placed exactly along ±that axis must still pan
  // fully to that side — the azimuth math resolves to ±90° even when the right
  // vector is not world-axis-aligned. (This drives the same acos-argument path
  // as the equal-power gains; the defensive dotR clamps there never fire because
  // q is renormalized to a unit vector immediately before the dot — see report.)
  const tiltUp = (_, l) => {
    l.upX.value = 1
    l.upY.value = 1
    l.upZ.value = 1
  }

  it('source along the diagonal +right axis pans hard RIGHT (azimuth +90)', () => {
    const [outL, outR] = renderSpatial({
      mono: monoIn,
      options: { positionX: 1, positionY: -1, positionZ: 0, refDistance: 2 },
      setup: tiltUp,
    })
    expect(outR[0]).toBeCloseTo(0.5, 12) // distance gain 1 (d < refDistance)
    expect(Math.abs(outL[0])).toBeLessThan(1e-15)
  })

  it('source along the diagonal -right axis pans hard LEFT (azimuth -90)', () => {
    const [outL, outR] = renderSpatial({
      mono: monoIn,
      options: { positionX: -1, positionY: 1, positionZ: 0, refDistance: 2 },
      setup: tiltUp,
    })
    expect(outL[0]).toBeCloseTo(0.5, 12)
    expect(Math.abs(outR[0])).toBeLessThan(1e-15)
  })
})

describe('PlecoPannerNode — sound cone acos clamp (float-safety at exact (anti)parallel)', () => {
  // A source at (-1,-1,-1) gives a listener→source vector t = (1,1,1); an
  // orientation of ±(1,1,1) is exactly (anti)parallel to it. The normalized dot
  // (t·o)/(|t||o|) = ±3 / (√3·√3) rounds to ±1.0000000000000002 in float64, so
  // BOTH acos-argument clamps in _coneGain fire. Rendering the two orientations
  // against an identical position isolates the cone gain: the only difference is
  // coneGain 1 (inside the inner cone) vs coneOuterGain (past the outer cone).
  it('parallel orientation clamps to +1 (inside inner cone → unity); antiparallel clamps to -1 (past outer → coneOuterGain)', () => {
    const base = {
      positionX: -1,
      positionY: -1,
      positionZ: -1,
      coneInnerAngle: 0,
      coneOuterAngle: 90,
      coneOuterGain: 0.5,
    }
    const [aL, aR] = renderSpatial({
      mono: monoIn,
      options: { ...base, orientationX: 1, orientationY: 1, orientationZ: 1 },
    })
    const [bL, bR] = renderSpatial({
      mono: monoIn,
      options: { ...base, orientationX: -1, orientationY: -1, orientationZ: -1 },
    })
    let compared = 0
    for (let i = 0; i < 128; i++) {
      if (Math.abs(aL[i]) > 1e-12) {
        expect(bL[i] / aL[i]).toBeCloseTo(0.5, 6)
        compared++
      }
      if (Math.abs(aR[i]) > 1e-12) {
        expect(bR[i] / aR[i]).toBeCloseTo(0.5, 6)
        compared++
      }
    }
    expect(compared).toBeGreaterThan(0) // guard against an all-silent comparison
  })
})

describe('PlecoPannerNode — linear distance below refDistance (near-field clamp)', () => {
  // A source CLOSER than refDistance clamps d up to d'ref, so the linear-model
  // numerator (d − d'ref) is zero and the distance gain is exactly 1 — no
  // attenuation, no boost. (The complementary d > d'max clamp is covered above.)
  it('d < refDistance clamps to refDistance → distance gain 1 (unattenuated)', () => {
    const [, outR] = renderSpatial({
      mono: monoIn,
      options: { distanceModel: 'linear', refDistance: 5, maxDistance: 10, rolloffFactor: 1, positionX: 2 },
    })
    // Source hard right (azimuth +90) → mono outR = 0.5·sin(π/2) = 0.5; gain 1 leaves it.
    expect(outR[0]).toBe(0.5)
  })
})
