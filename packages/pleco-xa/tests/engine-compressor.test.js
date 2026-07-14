/**
 * tests/engine-compressor.test.js — PlecoDynamicsCompressorNode (P15).
 *
 * Spec § The DynamicsCompressorNode Interface: five k-rate AudioParams with
 * fixed automation-rate constraints (threshold [-100,0] def -24, knee [0,40]
 * def 30, ratio [1,20] def 12, attack [0,1] def 0.003, release [0,1] def
 * 0.25), the readonly [[internal reduction]] readback, channelCount <= 2 with
 * channelCountMode 'max' forbidden (NotSupportedError), and the normative
 * processing model (§ DynamicsCompressorOptions Processing): 6 ms look-ahead
 * delay, EnvelopeFollower gain computer (metering, compression curve with
 * quadratic soft knee, attack/release smoothing), and makeup gain
 * ((1/curve(1))^0.6).
 *
 * The reference simulation below mirrors the spec algorithm with pleco's
 * documented implementation-defined choices (constant detector curve,
 * 10 dB-per-attack/release envelope rates, max-across-channels detector
 * input) in the same op order, so the full-signal comparisons are honest
 * end-to-end checks, not tautologies against the node's own internals.
 */
import { describe, it, expect } from 'vitest'
import { PlecoOfflineContext } from '../src/engine/xa-offline-context.js'
import { PlecoDynamicsCompressorNode } from '../src/engine/nodes/xa-dynamics-compressor.js'

const SR = 48000
const LOOK_AHEAD = Math.round(0.006 * SR) // 288 frames at 48 kHz

const ctx = () => new PlecoOfflineContext({ numberOfChannels: 1, length: 128, sampleRate: SR })

/** Spec "decibels to linear gain unit": 10^(v/20). */
function dbToLin(v) {
  return Math.pow(10, v / 20)
}

/** Spec "linear gain unit to decibel": v = 0 → -1000, else 20·log10(v). */
function linToDb(v) {
  return v === 0 ? -1000 : 20 * Math.log10(v)
}

/**
 * Spec § compression curve, mirrored: identity below the linear threshold,
 * quadratic soft knee over [threshold, threshold+knee] dB, then slope 1/ratio
 * in dB. Same formula and op order as the implementation.
 */
function makeShape(threshold, knee, ratio) {
  const slope = 1 / ratio
  const linearThreshold = dbToLin(threshold)
  const kneeEndDb = threshold + knee
  const kneeEndOutDb = threshold + knee + ((slope - 1) * knee) / 2
  return (x) => {
    if (x <= linearThreshold) return x
    const inDb = 20 * Math.log10(x)
    let outDb
    if (knee > 0 && inDb < kneeEndDb) {
      outDb = inDb + ((slope - 1) * (inDb - threshold) * (inDb - threshold)) / (2 * knee)
    } else {
      outDb = kneeEndOutDb + (inDb - kneeEndDb) * slope
    }
    return Math.pow(10, outDb / 20)
  }
}

/** Spec § computing the makeup gain: (1 / curve(1.0))^0.6. */
function makeupOf(threshold, knee, ratio) {
  return Math.pow(1 / makeShape(threshold, knee, ratio)(1), 0.6)
}

/**
 * Full EnvelopeFollower + look-ahead reference (spec § reduction-gain
 * algorithm), same implementation-defined choices and op order as the node.
 * Params are float32-rounded first — the k-rate computedValue the node samples
 * is float32.
 */
function referenceCompress(inputChannels, options = {}, sr = SR) {
  const threshold = Math.fround(options.threshold ?? -24)
  const knee = Math.fround(options.knee ?? 30)
  const ratio = Math.fround(options.ratio ?? 12)
  const attack = Math.fround(options.attack ?? 0.003)
  const release = Math.fround(options.release ?? 0.25)
  const shape = makeShape(threshold, knee, ratio)
  const makeup = Math.pow(1 / shape(1), 0.6)
  const attackFrames = attack * sr
  const releaseFrames = release * sr
  const attackRate = attackFrames === 0 ? 1 : 1 - Math.pow(10, -0.5 / attackFrames)
  const releaseRate = releaseFrames === 0 ? null : Math.pow(10, 0.5 / releaseFrames)
  const D = Math.round(0.006 * sr)
  const channels = inputChannels.length
  const length = inputChannels[0].length
  const outs = inputChannels.map(() => new Float32Array(length))
  const lines = inputChannels.map(() => new Float32Array(D))
  let w = 0
  let avg = 0
  let g = 1
  let reductionGain = g * makeup
  for (let i = 0; i < length; i++) {
    let peak = 0
    for (let c = 0; c < channels; c++) {
      const v = Math.abs(inputChannels[c][i])
      if (v > peak) peak = v
    }
    const attenuation = peak < 0.0001 ? 1 : shape(peak) / peak
    const releasing = attenuation > g
    avg += (attenuation - avg) * 1
    if (avg > 1) avg = 1
    if (releasing) g = releaseRate === null ? 1 : Math.min(1, g * releaseRate)
    else g += (avg - g) * attackRate
    reductionGain = g * makeup
    for (let c = 0; c < channels; c++) {
      const delayed = lines[c][w]
      lines[c][w] = inputChannels[c][i]
      outs[c][i] = delayed * reductionGain
    }
    w += 1
    if (w === D) w = 0
  }
  // Metering excludes the makeup stage (the envelope gain only): 0 at rest,
  // <= 0 when compressing — the reduction attribute prose + browser consensus
  // reading, mirrored from the node.
  return { outs, reduction: Math.fround(linToDb(g)) }
}

/** Render `inputChannels` through source → compressor → destination, offline. */
function renderCompressed(inputChannels, options = {}, sampleRate = SR) {
  const channels = inputChannels.length
  const length = inputChannels[0].length
  const context = new PlecoOfflineContext({ numberOfChannels: channels, length, sampleRate })
  const buf = context.createBuffer(channels, length, sampleRate)
  for (let c = 0; c < channels; c++) buf.getChannelData(c).set(inputChannels[c])
  const src = context.createBufferSource()
  src.buffer = buf
  const comp = new PlecoDynamicsCompressorNode(context, options)
  src.connect(comp)
  comp.connect(context.destination)
  src.start(0)
  const out = context.renderSync()
  return { out, comp }
}

function maxAbsDiff(a, b) {
  let m = 0
  for (let i = 0; i < a.length; i++) {
    const d = Math.abs(a[i] - b[i])
    if (d > m) m = d
  }
  return m
}

describe('PlecoDynamicsCompressorNode — attribute surface', () => {
  it('defaults: 1 input, 1 output, channelCount 2, mode "clamped-max", interpretation "speakers", reduction 0', () => {
    const comp = new PlecoDynamicsCompressorNode(ctx())
    expect(comp.numberOfInputs).toBe(1)
    expect(comp.numberOfOutputs).toBe(1)
    expect(comp.channelCount).toBe(2)
    expect(comp.channelCountMode).toBe('clamped-max')
    expect(comp.channelInterpretation).toBe('speakers')
    expect(comp.reduction).toBe(0)
  })

  it('the five AudioParams carry the spec defaults and nominal ranges', () => {
    const comp = new PlecoDynamicsCompressorNode(ctx())
    const table = [
      ['threshold', -24, -100, 0],
      ['knee', 30, 0, 40],
      ['ratio', 12, 1, 20],
      ['attack', Math.fround(0.003), 0, 1],
      ['release', 0.25, 0, 1],
    ]
    for (const [name, def, min, max] of table) {
      expect(comp[name].defaultValue).toBe(def)
      expect(comp[name].value).toBe(def)
      expect(comp[name].minValue).toBe(min)
      expect(comp[name].maxValue).toBe(max)
    }
  })

  it('all five params are k-rate with the spec automation-rate constraint (InvalidStateError on change)', () => {
    const comp = new PlecoDynamicsCompressorNode(ctx())
    for (const name of ['threshold', 'knee', 'ratio', 'attack', 'release']) {
      expect(comp[name].automationRate).toBe('k-rate')
      let err = null
      try {
        comp[name].automationRate = 'a-rate'
      } catch (e) {
        err = e
      }
      expect(err).toBeInstanceOf(DOMException)
      expect(err.name).toBe('InvalidStateError')
      comp[name].automationRate = 'garbage' // invalid enum assignment: silently ignored
      expect(comp[name].automationRate).toBe('k-rate')
    }
  })

  it('DynamicsCompressorOptions set param VALUES (float32-rounded), never the defaults', () => {
    const comp = new PlecoDynamicsCompressorNode(ctx(), {
      threshold: -50,
      knee: 10,
      ratio: 4,
      attack: 0.1,
      release: 0.5,
    })
    expect(comp.threshold.value).toBe(-50)
    expect(comp.knee.value).toBe(10)
    expect(comp.ratio.value).toBe(4)
    expect(comp.attack.value).toBe(Math.fround(0.1))
    expect(comp.release.value).toBe(0.5)
    expect(comp.threshold.defaultValue).toBe(-24)
    expect(comp.knee.defaultValue).toBe(30)
    expect(comp.ratio.defaultValue).toBe(12)
    expect(comp.attack.defaultValue).toBe(Math.fround(0.003))
    expect(comp.release.defaultValue).toBe(0.25)
  })

  it('option values outside the nominal range are stored unclamped (clamping happens at computedValue)', () => {
    const comp = new PlecoDynamicsCompressorNode(ctx(), { threshold: -150, ratio: 100 })
    expect(comp.threshold.value).toBe(-150)
    expect(comp.ratio.value).toBe(100)
  })

  it('non-finite option values throw TypeError (WebIDL float)', () => {
    for (const bad of [NaN, Infinity, -Infinity]) {
      expect(() => new PlecoDynamicsCompressorNode(ctx(), { threshold: bad })).toThrow(TypeError)
      expect(() => new PlecoDynamicsCompressorNode(ctx(), { attack: bad })).toThrow(TypeError)
    }
  })

  it('non-number option values throw TypeError (pleco strictness — no silent coercion)', () => {
    expect(() => new PlecoDynamicsCompressorNode(ctx(), { ratio: '4' })).toThrow(TypeError)
    expect(() => new PlecoDynamicsCompressorNode(ctx(), { release: null })).toThrow(TypeError)
  })

  it('null options convert to the empty dictionary (WebIDL) — constructs with defaults', () => {
    const comp = new PlecoDynamicsCompressorNode(ctx(), null)
    expect(comp.threshold.value).toBe(-24)
    expect(comp.channelCountMode).toBe('clamped-max')
  })

  it('reduction is readonly: assignment throws TypeError in strict mode', () => {
    const comp = new PlecoDynamicsCompressorNode(ctx())
    expect(() => {
      comp.reduction = -6
    }).toThrow(TypeError)
    expect(comp.reduction).toBe(0)
  })
})

describe('PlecoDynamicsCompressorNode — channel constraints', () => {
  it('channelCount > 2 throws NotSupportedError on assignment; 1 and 2 are accepted', () => {
    const comp = new PlecoDynamicsCompressorNode(ctx())
    let err = null
    try {
      comp.channelCount = 3
    } catch (e) {
      err = e
    }
    expect(err).toBeInstanceOf(DOMException)
    expect(err.name).toBe('NotSupportedError')
    expect(comp.channelCount).toBe(2)
    comp.channelCount = 1
    expect(comp.channelCount).toBe(1)
    comp.channelCount = 2
    expect(comp.channelCount).toBe(2)
  })

  it('constructor dictionary channelCount > 2 throws NotSupportedError', () => {
    let err = null
    try {
      new PlecoDynamicsCompressorNode(ctx(), { channelCount: 3 })
    } catch (e) {
      err = e
    }
    expect(err).toBeInstanceOf(DOMException)
    expect(err.name).toBe('NotSupportedError')
  })

  it("channelCountMode 'max' throws NotSupportedError on assignment; 'explicit' is accepted", () => {
    const comp = new PlecoDynamicsCompressorNode(ctx())
    let err = null
    try {
      comp.channelCountMode = 'max'
    } catch (e) {
      err = e
    }
    expect(err).toBeInstanceOf(DOMException)
    expect(err.name).toBe('NotSupportedError')
    expect(comp.channelCountMode).toBe('clamped-max')
    comp.channelCountMode = 'explicit'
    expect(comp.channelCountMode).toBe('explicit')
  })

  it('invalid channelCountMode assignment is silently ignored (WebIDL enum attribute)', () => {
    const comp = new PlecoDynamicsCompressorNode(ctx())
    comp.channelCountMode = 'garbage'
    expect(comp.channelCountMode).toBe('clamped-max')
  })

  it("constructor dictionary channelCountMode 'max' throws NotSupportedError; invalid enum throws TypeError", () => {
    let err = null
    try {
      new PlecoDynamicsCompressorNode(ctx(), { channelCountMode: 'max' })
    } catch (e) {
      err = e
    }
    expect(err).toBeInstanceOf(DOMException)
    expect(err.name).toBe('NotSupportedError')
    expect(() => new PlecoDynamicsCompressorNode(ctx(), { channelCountMode: 'garbage' })).toThrow(TypeError)
  })
})

describe('PlecoDynamicsCompressorNode — look-ahead delay and makeup gain', () => {
  it('threshold 0 (no compression, makeup 1): output is the input delayed exactly 6 ms, bit-exact, reduction 0', () => {
    const input = new Float32Array(1024).fill(0.25)
    const { out, comp } = renderCompressed([input], { threshold: 0 })
    const data = out.getChannelData(0)
    for (let i = 0; i < LOOK_AHEAD; i++) expect(data[i]).toBe(0)
    for (let i = LOOK_AHEAD; i < 1024; i++) expect(data[i]).toBe(0.25)
    expect(comp.reduction).toBe(0)
  })

  it('sub-threshold signal passes at unity envelope gain times the makeup gain, after the look-ahead', () => {
    // 0.01 = -40 dB, below the default -24 dB threshold → attenuation 1;
    // only the makeup stage ((1/curve(1))^0.6) scales the signal.
    const input = new Float32Array(1024).fill(0.01)
    const { out } = renderCompressed([input])
    const data = out.getChannelData(0)
    const makeup = makeupOf(-24, 30, 12)
    for (let i = 0; i < LOOK_AHEAD; i++) expect(data[i]).toBe(0)
    for (let i = LOOK_AHEAD; i < 1024; i++) {
      expect(data[i]).toBeCloseTo(0.01 * makeup, 6)
    }
  })

  it('tail-time: the look-ahead delay keeps draining after the source goes silent', () => {
    // Signal for 512 frames inside a 1024-frame render: frames [512, 512+D)
    // must still carry the delayed signal (spec node table: tail-time Yes).
    const input = new Float32Array(1024)
    input.fill(0.25, 0, 512)
    const { out } = renderCompressed([input], { threshold: 0 })
    const data = out.getChannelData(0)
    for (let i = 512; i < 512 + LOOK_AHEAD; i++) expect(data[i]).toBe(0.25)
    for (let i = 512 + LOOK_AHEAD; i < 1024; i++) expect(data[i]).toBe(0)
  })
})

describe('PlecoDynamicsCompressorNode — spec algorithm end-to-end (reference mirror)', () => {
  it('mono composite signal matches the spec-algorithm reference sample-for-sample', () => {
    const length = 4096
    const input = new Float32Array(length)
    for (let i = 0; i < length; i++) {
      const env = i < 1024 ? 0.02 : i < 2560 ? 0.7 : 0.05
      input[i] = Math.fround(env * Math.sin((2 * Math.PI * 440 * i) / SR))
    }
    const options = { threshold: -30, knee: 6, ratio: 8, attack: 0.01, release: 0.05 }
    const { out, comp } = renderCompressed([input], options)
    const ref = referenceCompress([input], options)
    expect(maxAbsDiff(out.getChannelData(0), ref.outs[0])).toBeLessThan(1e-6)
    expect(comp.reduction).toBeCloseTo(ref.reduction, 5)
  })

  it('hard knee (knee 0) matches the reference and engages only above threshold', () => {
    const length = 2048
    const input = new Float32Array(length)
    input.fill(0.02, 0, 1024) // -34 dB: below the -20 dB threshold
    input.fill(0.5, 1024) // -6 dB: above it
    const options = { threshold: -20, knee: 0, ratio: 4, attack: 0.001, release: 0.1 }
    const { out, comp } = renderCompressed([input], options)
    const ref = referenceCompress([input], options)
    expect(maxAbsDiff(out.getChannelData(0), ref.outs[0])).toBeLessThan(1e-6)
    expect(comp.reduction).toBeCloseTo(ref.reduction, 5)
  })

  it('stereo is linked: the max-across-channels detector applies ONE gain to both channels', () => {
    const length = 4096
    const loud = new Float32Array(length)
    const quiet = new Float32Array(length)
    for (let i = 0; i < length; i++) {
      loud[i] = Math.fround(0.8 * Math.sin((2 * Math.PI * 220 * i) / SR))
      quiet[i] = 0.01
    }
    const options = { threshold: -40, knee: 0, ratio: 10, attack: 0.003, release: 0.25 }
    const { out } = renderCompressed([loud, quiet], options)
    const ref = referenceCompress([loud, quiet], options)
    expect(maxAbsDiff(out.getChannelData(0), ref.outs[0])).toBeLessThan(1e-6)
    expect(maxAbsDiff(out.getChannelData(1), ref.outs[1])).toBeLessThan(1e-6)
    // The quiet channel alone would ride at unity envelope gain (× makeup);
    // linked to the loud channel it must be ducked well below that.
    const makeup = makeupOf(-40, 0, 10)
    const settled = out.getChannelData(1)[length - 1]
    expect(settled).toBeLessThan(0.5 * 0.01 * makeup)
    expect(settled).toBeGreaterThan(0)
  })

  it('rendering is deterministic — two renders are bit-identical, including reduction', () => {
    const input = Float32Array.from({ length: 2048 }, (_, i) =>
      Math.fround(0.6 * Math.sin((2 * Math.PI * 330 * i) / SR)),
    )
    const a = renderCompressed([input])
    const b = renderCompressed([input])
    expect(Array.from(a.out.getChannelData(0))).toEqual(Array.from(b.out.getChannelData(0)))
    expect(a.comp.reduction).toBe(b.comp.reduction)
  })
})

describe('PlecoDynamicsCompressorNode — gain computer behavior', () => {
  it('steady-state output of a constant over-threshold signal is curve(x) × makeup', () => {
    // threshold -40 dB, hard knee, ratio 4, input 0.5 (-6 dB):
    // out dB = -40 + 34/4 = -31.5 → the compressor holds shape(0.5) × makeup.
    const input = new Float32Array(4096).fill(0.5)
    const { out } = renderCompressed([input], { threshold: -40, knee: 0, ratio: 4 })
    const shape = makeShape(-40, 0, 4)
    const makeup = makeupOf(-40, 0, 4)
    const expected = shape(0.5) * makeup
    const data = out.getChannelData(0)
    for (let i = 3500; i < 4096; i++) {
      expect(data[i]).toBeCloseTo(expected, 4)
    }
  })

  it('attack: a slower attack leaves the gain higher shortly after an onset', () => {
    const length = 4096
    const onset = 256
    const input = new Float32Array(length)
    input.fill(0.5, onset)
    const opts = { threshold: -40, knee: 0, ratio: 4, release: 0.25 }
    const fast = renderCompressed([input], { ...opts, attack: 0.003 }).out.getChannelData(0)
    const slow = renderCompressed([input], { ...opts, attack: 0.2 }).out.getChannelData(0)
    // Probe just after the loud signal emerges from the look-ahead delay: the
    // fast attack has already ducked the gain, the slow one has barely moved.
    const probe = onset + LOOK_AHEAD + 10
    expect(slow[probe]).toBeGreaterThan(fast[probe] * 1.5)
  })

  it('attack 0 is instant: the gain sits at its steady value as soon as the loud signal emerges', () => {
    const length = 2048
    const onset = 256
    const input = new Float32Array(length)
    input.fill(0.5, onset)
    const { out } = renderCompressed([input], { threshold: -40, knee: 0, ratio: 4, attack: 0 })
    const expected = makeShape(-40, 0, 4)(0.5) * makeupOf(-40, 0, 4)
    const data = out.getChannelData(0)
    for (let i = onset + LOOK_AHEAD; i < onset + LOOK_AHEAD + 64; i++) {
      expect(data[i]).toBeCloseTo(expected, 5)
    }
  })

  it('release: a slower release keeps the gain lower for longer after the loud passage ends', () => {
    const length = 8192
    const quietStart = 2048
    const input = new Float32Array(length)
    input.fill(0.5, 0, quietStart)
    input.fill(0.01, quietStart)
    const opts = { threshold: -40, knee: 0, ratio: 4, attack: 0.003 }
    const fast = renderCompressed([input], { ...opts, release: 0.02 }).out.getChannelData(0)
    const slow = renderCompressed([input], { ...opts, release: 0.25 }).out.getChannelData(0)
    const probe = quietStart + LOOK_AHEAD + 500
    expect(fast[probe]).toBeGreaterThan(slow[probe] * 1.5)
  })

  it('release 0 is instant: the envelope snaps back to unity as soon as the signal drops', () => {
    const length = 4096
    const quietStart = 2048
    const input = new Float32Array(length)
    input.fill(0.5, 0, quietStart)
    input.fill(0.01, quietStart)
    const { out } = renderCompressed([input], { threshold: -40, knee: 0, ratio: 4, attack: 0.003, release: 0 })
    const makeup = makeupOf(-40, 0, 4)
    const data = out.getChannelData(0)
    // The quiet signal emerges from the delay LOOK_AHEAD frames after
    // quietStart; the gain snapped to 1 already at quietStart (undelayed
    // detector), so those samples ride at 0.01 × makeup immediately.
    for (let i = quietStart + LOOK_AHEAD; i < quietStart + LOOK_AHEAD + 64; i++) {
      expect(data[i]).toBeCloseTo(0.01 * makeup, 6)
    }
  })
})

describe('PlecoDynamicsCompressorNode — reduction metering', () => {
  it('heavy compression drives reduction strongly negative, matching the spec metering step', () => {
    const input = new Float32Array(4096).fill(0.9)
    const options = { threshold: -40, knee: 0, ratio: 20, attack: 0.003, release: 0.25 }
    const { comp } = renderCompressed([input], options)
    const ref = referenceCompress([input], options)
    expect(comp.reduction).toBeCloseTo(ref.reduction, 5)
    expect(comp.reduction).toBeLessThan(-10)
  })

  it('after processing pure silence the metering reads 0 dB — the makeup stage is EXCLUDED (attribute prose + browser consensus)', () => {
    // Spec-internal conflict, resolved in favor of the prose: algorithm
    // step 10 literally meters the reduction gain (which includes the makeup
    // stage, ≈ +5.28 dB at the defaults), but the reduction attribute's own
    // normative sentence says "if fed no signal the value will be 0 (no gain
    // reduction)" and every shipping browser meters the envelope gain only.
    // Pleco meters the compressor gain excluding makeup: exactly 0 at rest.
    const input = new Float32Array(1024) // all zeros
    const { comp } = renderCompressed([input])
    expect(comp.reduction).toBe(0)
  })

  it('reduction is never positive — the envelope gain is clamped to 1, so the meter reads <= 0', () => {
    const input = new Float32Array(4096).fill(0.9)
    const { comp } = renderCompressed([input], { threshold: -40, knee: 0, ratio: 20 })
    expect(comp.reduction).toBeLessThanOrEqual(0)
  })

  it('reduction is a float32 value (IDL float boundary)', () => {
    const input = new Float32Array(2048).fill(0.7)
    const { comp } = renderCompressed([input], { threshold: -30, knee: 12, ratio: 6 })
    expect(comp.reduction).toBe(Math.fround(comp.reduction))
  })
})

describe('PlecoDynamicsCompressorNode — spec-pinned behavior (independent closed form)', () => {
  // These pins assert the SPEC-DEFINED, non-delegated semantics against values
  // derived from first principles — NOT via makeShape/referenceCompress (the
  // node's own mirror). They are the honest "we match the spec algorithm, not
  // Chrome's private kernel" guarantee: the spec delegates the knee SHAPE, the
  // detector curve and the envelope-rate shape to the UA, but it pins these
  // exactly, and pleco meets them to float32 precision.

  /**
   * Spec § compression curve, hard-knee (knee 0) closed form, written directly
   * from the normative law (identity below the linear threshold; slope 1/ratio
   * in dB above, anchored continuous at threshold) — structurally independent
   * of the node's makeShape.
   */
  function specHardKnee(threshold, ratio) {
    const linTh = Math.pow(10, threshold / 20)
    return (x) => {
      if (x <= linTh) return x
      const inDb = 20 * Math.log10(x)
      const outDb = threshold + (inDb - threshold) / ratio
      return Math.pow(10, outDb / 20)
    }
  }
  /** Spec § computing the makeup gain, from the independent hard-knee curve. */
  function specMakeup(threshold, ratio) {
    return Math.pow(1 / specHardKnee(threshold, ratio)(1), 0.6)
  }
  /** Mean |output| over the settled tail of a constant-input render. */
  function steadyMeanAbs(x, options) {
    const length = 4096
    const input = new Float32Array(length).fill(x)
    const { out } = renderCompressed([input], options)
    const data = out.getChannelData(0)
    let s = 0
    let n = 0
    for (let i = 3500; i < length; i++) {
      s += Math.abs(data[i])
      n++
    }
    return s / n
  }

  it('below the linear threshold there is NO reduction: envelope gain is exactly 1, reduction exactly 0', () => {
    // Spec § compression curve part 1: f(x) = x (identity) up to the linear
    // threshold ⇒ attenuation 1 ⇒ compressor gain pinned at 1 ⇒ meter 0 dB.
    const threshold = -24
    const x = Math.pow(10, threshold / 20) * 0.99 // 1% below the linear threshold
    const input = new Float32Array(2048).fill(x)
    const { out, comp } = renderCompressed([input], { threshold, knee: 0, ratio: 12 })
    expect(comp.reduction).toBe(0)
    // Output is the input × makeup only (unity envelope gain), after look-ahead.
    const makeup = specMakeup(threshold, 12)
    const data = out.getChannelData(0)
    for (let i = LOOK_AHEAD; i < 2048; i++) expect(data[i]).toBeCloseTo(x * makeup, 6)
  })

  it('the ratio law holds exactly: a `ratio` dB change in input yields a 1 dB change in output (§ ratio)', () => {
    // Spec § ratio attribute: "The amount of dB change in input for a 1 dB
    // change in output." Two over-threshold constants spaced `ratio` dB apart
    // must sit exactly 1 dB apart at the output (makeup cancels — same params).
    const threshold = -40
    const ratio = 4
    const options = { threshold, knee: 0, ratio, attack: 0.001, release: 0.25 }
    const inDbA = 20 * Math.log10(0.1)
    const xA = 0.1
    const xB = Math.pow(10, (inDbA + ratio) / 20)
    const outDbA = 20 * Math.log10(steadyMeanAbs(xA, options))
    const outDbB = 20 * Math.log10(steadyMeanAbs(xB, options))
    expect(outDbB - outDbA).toBeCloseTo(1, 2)
  })

  it('the soft-knee curve is monotonically increasing and continuous across the knee (§ compression curve MUST)', () => {
    // Spec § compression curve: the whole function MUST be monotonically
    // increasing and continuous (and piece-wise differentiable). Probe the
    // effective curve via settled output across a fine sweep spanning the knee
    // (threshold -40, knee 24 ⇒ knee end -16 dB): output must strictly increase,
    // with no discontinuity (bounded second difference of the output level).
    const options = { threshold: -40, knee: 24, ratio: 6, attack: 0.0005, release: 0.3 }
    const pts = []
    for (let db = -60; db <= -6; db += 1) {
      pts.push([db, steadyMeanAbs(Math.pow(10, db / 20), options)])
    }
    for (let i = 1; i < pts.length; i++) {
      expect(pts[i][1], `output must increase at ${pts[i][0]} dB`).toBeGreaterThan(pts[i - 1][1])
    }
    let maxSlopeJump = 0
    for (let i = 1; i < pts.length - 1; i++) {
      const s1 = 20 * Math.log10(pts[i][1] / pts[i - 1][1])
      const s2 = 20 * Math.log10(pts[i + 1][1] / pts[i][1])
      maxSlopeJump = Math.max(maxSlopeJump, Math.abs(s2 - s1))
    }
    // A continuous, piece-wise-differentiable curve has no slope discontinuity;
    // on a 1 dB grid the second difference stays small (observed ≈ 0.035).
    expect(maxSlopeJump).toBeLessThan(0.1)
  })

  it('attack timing: the gain–target gap shrinks by exactly 10 dB per `attack` seconds (§ attack attribute)', () => {
    // Spec § attack: "The amount of time (in seconds) to reduce the gain by
    // 10 dB." With a constant over-threshold input the detector average is fixed,
    // so the envelope gain closes on its target geometrically; the residual gap
    // measured `attack` seconds apart must be a 10 dB ratio (10^-0.5).
    const threshold = -40
    const ratio = 4
    const attack = 0.02
    const attackFrames = Math.round(attack * SR)
    const length = LOOK_AHEAD + 4 * attackFrames + 256
    const input = new Float32Array(length).fill(0.5)
    const { out } = renderCompressed([input], { threshold, knee: 0, ratio, attack, release: 0.5 })
    const data = out.getChannelData(0)
    const makeup = specMakeup(threshold, ratio)
    const gTarget = specHardKnee(threshold, ratio)(0.5) / 0.5
    // Recover the envelope gain from the settled delayed carrier (input = 0.5).
    const gAt = (i) => data[i] / (0.5 * makeup)
    const i1 = LOOK_AHEAD + 40
    const gap1 = gAt(i1) - gTarget
    const gap2 = gAt(i1 + attackFrames) - gTarget
    expect(gap2 / gap1).toBeCloseTo(Math.pow(10, -0.5), 3)
  })

  it('release timing: the gain rises by exactly 10 dB per `release` seconds (§ release attribute)', () => {
    // Spec § release: "The amount of time (in seconds) to increase the gain by
    // 10 dB." After the signal drops to a sub-threshold-but-nonzero carrier the
    // envelope gain rises multiplicatively toward unity; sampled `release`
    // seconds apart the ratio must be +10 dB (10^0.5).
    const threshold = -40
    const ratio = 4
    const release = 0.02
    const releaseFrames = Math.round(release * SR)
    const loud = 2048
    const length = loud + LOOK_AHEAD + 4 * releaseFrames + 256
    const input = new Float32Array(length)
    input.fill(0.5, 0, loud)
    input.fill(0.02, loud) // -34 dB carrier: below threshold ⇒ attenuation 1
    const { out } = renderCompressed([input], { threshold, knee: 0, ratio, attack: 0.001, release })
    const data = out.getChannelData(0)
    const makeup = specMakeup(threshold, ratio)
    const gAt = (i) => data[i] / (0.02 * makeup)
    const i1 = loud + LOOK_AHEAD + 20
    expect(gAt(i1 + releaseFrames) / gAt(i1)).toBeCloseTo(Math.pow(10, 0.5), 3)
  })

  it('reduction metering equals 20·log10(steady envelope gain), from the independent spec curve', () => {
    // Spec § metering + the reduction attribute: the meter reports the envelope
    // gain in dB. At steady state that gain is the attenuation curve(x)/x, so
    // reduction must equal 20·log10(curve(x)/x) computed from the independent
    // hard-knee law — pinning threshold, ratio AND the metering conversion.
    const threshold = -40
    const ratio = 8
    const x = 0.9
    const input = new Float32Array(8192).fill(x)
    const { comp } = renderCompressed([input], { threshold, knee: 0, ratio, attack: 0.001, release: 0.05 })
    const gTarget = specHardKnee(threshold, ratio)(x) / x
    expect(comp.reduction).toBeCloseTo(20 * Math.log10(gTarget), 3)
  })
})

describe('PlecoDynamicsCompressorNode — k-rate automation', () => {
  it('automating threshold down mid-render increases compression for later blocks', () => {
    const length = 8192
    const input = new Float32Array(length).fill(0.1) // -20 dB: above -80, below -24
    const context = new PlecoOfflineContext({ numberOfChannels: 1, length, sampleRate: SR })
    const buf = context.createBuffer(1, length, SR)
    buf.getChannelData(0).set(input)
    const src = context.createBufferSource()
    src.buffer = buf
    const comp = new PlecoDynamicsCompressorNode(context)
    comp.threshold.setValueAtTime(-80, 2048 / SR)
    src.connect(comp)
    comp.connect(context.destination)
    src.start(0)
    const data = context.renderSync().getChannelData(0)
    const mean = (from, to) => {
      let s = 0
      for (let i = from; i < to; i++) s += Math.abs(data[i])
      return s / (to - from)
    }
    const before = mean(1024, 2000) // threshold -24: signal passes at unity × makeup
    const after = mean(6000, 8000) // threshold -80: heavily compressed
    expect(after).toBeLessThan(before * 0.5)
    expect(after).toBeGreaterThan(0)
  })
})
