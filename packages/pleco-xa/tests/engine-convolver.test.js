/**
 * tests/engine-convolver.test.js — PlecoConvolverNode (P18).
 *
 * Spec § The ConvolverNode Interface: buffer validation (1/2/4 channels +
 * context sampleRate match → NotSupportedError; re-assignment legal — no
 * one-shot slot; acquire-the-content snapshot), normalize semantics (the
 * spec's exact calculateNormalizationScale, sampled only when buffer is set),
 * the normative channel-response routings (1-ch per-input, 2-ch L/R, 4-ch
 * true-stereo matrix), partitioned frequency-domain convolution cross-checked
 * sample-exactly against a direct time-domain convolution computed in-test,
 * tail-time, channel-count-transition state preservation, and the
 * channelCount ≤ 2 / channelCountMode ≠ 'max' constraint tables.
 *
 * Float32 tolerance: the engine convolves via 256-point float64 FFTs with
 * float32-rounded (Math.fround) frequency-domain products and float32 block
 * stores, against a float64 direct convolution of float32-rounded operands.
 * The observed disagreement is bounded by a few float32 ulps of the running
 * sums; tests assert |diff| ≤ 2e-5 for dense random signals (documented
 * headroom over the ~1.3e-7 observed at peak amplitude ~2.9) and
 * |diff| ≤ 1e-6 for sparse delta-IR routing checks.
 */
import { describe, it, expect } from 'vitest'
import { PlecoBaseContext } from '../src/engine/xa-base-context.js'
import { PlecoOfflineContext } from '../src/engine/xa-offline-context.js'
import { PlecoConvolverNode } from '../src/engine/nodes/xa-convolver.js'
import { RENDER_QUANTUM } from '../src/engine/xa-constants.js'

const SR = 48000

const offline = (length, channels = 2) =>
  new PlecoOfflineContext({ numberOfChannels: channels, length, sampleRate: SR })

/** Capture a DOMException and assert its spec name. */
function expectDOMException(fn, name) {
  let caught = null
  try {
    fn()
  } catch (e) {
    caught = e
  }
  expect(caught).toBeInstanceOf(DOMException)
  expect(caught.name).toBe(name)
}

/** Deterministic pseudo-random values in [-1, 1] (LCG — reproducible fixtures). */
function pseudoRandom(n, seed = 1) {
  const out = new Float32Array(n)
  let s = seed >>> 0
  for (let i = 0; i < n; i++) {
    s = (1103515245 * s + 12345) >>> 0
    out[i] = (s / 4294967296) * 2 - 1
  }
  return out
}

/**
 * Direct time-domain linear convolution in float64 of float32-rounded
 * operands: y[n] = Σₖ h[k]·x[n−k]. The independent reference the engine's
 * partitioned frequency-domain path is cross-checked against.
 */
function directConvolve(x, h, outLen) {
  const y = new Float64Array(outLen)
  for (let n = 0; n < outLen; n++) {
    let acc = 0
    for (let k = 0; k < h.length; k++) {
      const i = n - k
      if (i >= 0 && i < x.length) acc += Math.fround(h[k]) * Math.fround(x[i])
    }
    y[n] = acc
  }
  return y
}

/** Mirror of the spec's calculateNormalizationScale (§ normalize) — the test-side oracle. */
function specNormalizationScale(channels, length, sampleRate) {
  const GainCalibration = 0.00125
  const GainCalibrationSampleRate = 44100
  const MinPower = 0.000125
  let power = 0
  for (const ch of channels) {
    for (let j = 0; j < length; j++) power += Math.fround(ch[j]) * Math.fround(ch[j])
  }
  power = Math.sqrt(power / (channels.length * length))
  if (!isFinite(power) || isNaN(power) || power < MinPower) power = MinPower
  let scale = 1 / power
  scale *= GainCalibration
  scale *= GainCalibrationSampleRate / sampleRate
  if (channels.length === 4) scale *= 0.5
  return scale
}

/** Build a PlecoAudioBuffer on `ctx` from an array of per-channel sample arrays. */
function makeBuffer(ctx, channels) {
  const buf = ctx.createBuffer(channels.length, channels[0].length, SR)
  channels.forEach((data, c) => buf.getChannelData(c).set(data))
  return buf
}

/**
 * Render source → convolver → destination offline. `input` and `ir` are
 * arrays of per-channel sample arrays. Returns the rendered stereo buffer
 * (the offline destination is explicit-2/'speakers', so a mono convolver
 * output lands identically in both channels).
 */
function renderConvolved({ input, ir, length, options = {}, mutate = null, configure = null }) {
  const ctx = offline(length)
  const irBuf = ir === null ? null : makeBuffer(ctx, ir)
  const conv = new PlecoConvolverNode(ctx, { disableNormalization: true, ...options, buffer: irBuf })
  if (mutate) mutate(irBuf)
  if (configure) configure(conv, ctx)
  const srcBuf = makeBuffer(ctx, input)
  const src = ctx.createBufferSource()
  src.buffer = srcBuf
  src.connect(conv)
  conv.connect(ctx.destination)
  src.start(0)
  return ctx.renderSync()
}

const maxAbsDiff = (a, b, n) => {
  let m = 0
  for (let i = 0; i < n; i++) m = Math.max(m, Math.abs(a[i] - b[i]))
  return m
}

describe('PlecoConvolverNode — node shape & defaults', () => {
  it('is 1-in / 1-out with channelCount 2, mode "clamped-max", interpretation "speakers", buffer null, normalize true (spec node table)', () => {
    const conv = new PlecoConvolverNode(offline(128))
    expect(conv.numberOfInputs).toBe(1)
    expect(conv.numberOfOutputs).toBe(1)
    expect(conv.channelCount).toBe(2)
    expect(conv.channelCountMode).toBe('clamped-max')
    expect(conv.channelInterpretation).toBe('speakers')
    expect(conv.buffer).toBeNull()
    expect(conv.normalize).toBe(true)
  })

  it('null options convert to the empty dictionary (WebIDL) — constructs with defaults', () => {
    const conv = new PlecoConvolverNode(offline(128), null)
    expect(conv.buffer).toBeNull()
    expect(conv.normalize).toBe(true)
  })

  it('ConvolverOptions: disableNormalization inverts into normalize; buffer lands on the attribute', () => {
    const ctx = offline(128)
    const irBuf = makeBuffer(ctx, [[1, 0.5]])
    const conv = new PlecoConvolverNode(ctx, { buffer: irBuf, disableNormalization: true })
    expect(conv.normalize).toBe(false)
    expect(conv.buffer).toBe(irBuf)
  })

  it('AudioNodeOptions flow through: channelCount 1 and channelInterpretation "discrete" are accepted', () => {
    const conv = new PlecoConvolverNode(offline(128), { channelCount: 1, channelInterpretation: 'discrete' })
    expect(conv.channelCount).toBe(1)
    expect(conv.channelInterpretation).toBe('discrete')
  })

  it('constructor dictionary: channelCount 3 → NotSupportedError; channelCountMode "max" → NotSupportedError; out-of-enum mode → TypeError', () => {
    expectDOMException(() => new PlecoConvolverNode(offline(128), { channelCount: 3 }), 'NotSupportedError')
    expectDOMException(() => new PlecoConvolverNode(offline(128), { channelCountMode: 'max' }), 'NotSupportedError')
    expect(() => new PlecoConvolverNode(offline(128), { channelCountMode: 'bogus' })).toThrow(TypeError)
  })

  it('constructor dictionary: non-boolean disableNormalization → TypeError (pleco strictness)', () => {
    expect(() => new PlecoConvolverNode(offline(128), { disableNormalization: 1 })).toThrow(TypeError)
  })
})

describe('PlecoConvolverNode — channelCount / channelCountMode constraints (attribute paths)', () => {
  it('channelCount: 1 and 2 accepted, > 2 → NotSupportedError leaving the value unchanged', () => {
    const conv = new PlecoConvolverNode(offline(128))
    conv.channelCount = 1
    expect(conv.channelCount).toBe(1)
    conv.channelCount = 2
    expect(conv.channelCount).toBe(2)
    expectDOMException(() => (conv.channelCount = 3), 'NotSupportedError')
    expect(conv.channelCount).toBe(2)
  })

  it("channelCountMode: 'explicit' accepted, 'max' → NotSupportedError, invalid enum silently ignored", () => {
    const conv = new PlecoConvolverNode(offline(128))
    conv.channelCountMode = 'explicit'
    expect(conv.channelCountMode).toBe('explicit')
    expectDOMException(() => (conv.channelCountMode = 'max'), 'NotSupportedError')
    expect(conv.channelCountMode).toBe('explicit')
    conv.channelCountMode = 'not-a-mode' // WebIDL enum attribute: silently ignored
    expect(conv.channelCountMode).toBe('explicit')
  })
})

describe('PlecoConvolverNode — buffer attribute validation & re-assignment', () => {
  it('accepts 1-, 2-, and 4-channel impulse responses; rejects 3 and 5 channels with NotSupportedError', () => {
    const ctx = offline(128)
    const conv = new PlecoConvolverNode(ctx)
    for (const nch of [1, 2, 4]) {
      conv.buffer = ctx.createBuffer(nch, 8, SR)
      expect(conv.buffer.numberOfChannels).toBe(nch)
    }
    expectDOMException(() => (conv.buffer = ctx.createBuffer(3, 8, SR)), 'NotSupportedError')
    expectDOMException(() => (conv.buffer = ctx.createBuffer(5, 8, SR)), 'NotSupportedError')
  })

  it('rejects an impulse response whose sampleRate differs from the context sampleRate (NotSupportedError)', () => {
    const ctx = offline(128)
    const conv = new PlecoConvolverNode(ctx)
    expectDOMException(() => (conv.buffer = ctx.createBuffer(1, 8, 44100)), 'NotSupportedError')
  })

  it('rejects a non-AudioBuffer, non-null value with TypeError', () => {
    const conv = new PlecoConvolverNode(offline(128))
    expect(() => (conv.buffer = { numberOfChannels: 1, sampleRate: SR })).toThrow(TypeError)
  })

  it('re-assignment is legal (no one-shot slot, unlike AudioBufferSourceNode): non-null → non-null, → null, → non-null again', () => {
    const ctx = offline(128)
    const conv = new PlecoConvolverNode(ctx)
    const a = makeBuffer(ctx, [[1]])
    const b = makeBuffer(ctx, [[0.5, 0.25]])
    conv.buffer = a
    conv.buffer = b
    expect(conv.buffer).toBe(b)
    conv.buffer = null
    expect(conv.buffer).toBeNull()
    conv.buffer = a
    expect(conv.buffer).toBe(a)
  })

  it('rendering uses the LAST assigned buffer after a re-assignment', () => {
    const out = renderConvolved({
      input: [[1]],
      ir: [[1]], // assigned via options first…
      length: 128,
      configure: (conv, ctx) => {
        conv.buffer = makeBuffer(ctx, [[0, 0.25]]) // …then replaced pre-render
      },
    })
    const ch0 = out.getChannelData(0)
    expect(Math.abs(ch0[0])).toBeLessThanOrEqual(1e-6)
    expect(Math.abs(ch0[1] - 0.25)).toBeLessThanOrEqual(1e-6)
  })

  it('acquire-the-content: mutating the AudioBuffer after assignment never reaches the node (snapshot at set time)', () => {
    const out = renderConvolved({
      input: [[1]],
      ir: [[0.5]],
      length: 128,
      mutate: (irBuf) => irBuf.getChannelData(0).fill(0), // post-set sabotage
    })
    expect(Math.abs(out.getChannelData(0)[0] - 0.5)).toBeLessThanOrEqual(1e-6)
  })

  it('normalize setter is a strict boolean (TypeError on anything else)', () => {
    const conv = new PlecoConvolverNode(offline(128))
    conv.normalize = false
    expect(conv.normalize).toBe(false)
    expect(() => (conv.normalize = 'true')).toThrow(TypeError)
    expect(() => (conv.normalize = 0)).toThrow(TypeError)
  })
})

describe('PlecoConvolverNode — normalize energy scaling (spec calculateNormalizationScale)', () => {
  const impulse = () => {
    const x = new Float32Array(1)
    x[0] = 1
    return [x]
  }

  it('normalize=true pre-scales the impulse response by the spec scale (unit-impulse input reproduces scale·IR)', () => {
    const ir = [0.5, -0.25, 0.125, 0.0625, -0.5, 0.25, -0.125, 0.03125]
    const scale = specNormalizationScale([ir], ir.length, SR)
    const out = renderConvolved({ input: impulse(), ir: [ir], length: 128, options: { disableNormalization: false } })
    const ch0 = out.getChannelData(0)
    for (let n = 0; n < ir.length; n++) {
      expect(Math.abs(ch0[n] - Math.fround(scale * ir[n]))).toBeLessThanOrEqual(1e-8)
    }
  })

  it('MinPower overload clamp: a vanishingly quiet IR is scaled by 1/MinPower · GainCalibration · 44100/sampleRate', () => {
    const ir = [1e-6, 0, 0, 0]
    const scale = specNormalizationScale([ir], ir.length, SR) // power clamps to MinPower
    expect(scale).toBeCloseTo((1 / 0.000125) * 0.00125 * (44100 / SR), 12)
    const out = renderConvolved({ input: impulse(), ir: [ir], length: 128, options: { disableNormalization: false } })
    expect(Math.abs(out.getChannelData(0)[0] - Math.fround(scale * 1e-6))).toBeLessThanOrEqual(1e-10)
  })

  it('4-channel IR gets the true-stereo 0.5 compensation', () => {
    const irCh = [
      [0.5, 0, 0, 0],
      [0, 0.5, 0, 0],
      [0, 0, 0.5, 0],
      [0, 0, 0, 0.5],
    ]
    const scale = specNormalizationScale(irCh, 4, SR)
    const scaleNo4 = specNormalizationScale([irCh[0], irCh[1]], 4, SR) // same per-channel power, no 0.5
    expect(scale).toBeCloseTo(scaleNo4 * 0.5, 12)
    const out = renderConvolved({ input: impulse(), ir: irCh, length: 128, options: { disableNormalization: false } })
    // mono input feeds both branches: L = in∗(IR₀ + IR₂), R = in∗(IR₁ + IR₃) — scaled deltas at lags 0/2 and 1/3.
    const L = out.getChannelData(0)
    const R = out.getChannelData(1)
    for (const [ch, lags] of [
      [L, [0, 2]],
      [R, [1, 3]],
    ]) {
      for (const lag of lags) expect(Math.abs(ch[lag] - Math.fround(scale * 0.5))).toBeLessThanOrEqual(1e-8)
    }
  })

  it('normalize changes take effect only at the NEXT buffer set (spec § normalize) — toggling never touches the live IR', () => {
    const ir = [[0.5, 0.25]]
    const out = renderConvolved({
      input: impulse(),
      ir,
      length: 128,
      options: { disableNormalization: true },
      configure: (conv) => {
        conv.normalize = true // live IR stays unnormalized until buffer is re-set
      },
    })
    expect(Math.abs(out.getChannelData(0)[0] - 0.5)).toBeLessThanOrEqual(1e-6)

    const scale = specNormalizationScale(ir, 2, SR)
    const reset = renderConvolved({
      input: impulse(),
      ir,
      length: 128,
      options: { disableNormalization: true },
      configure: (conv, ctx) => {
        conv.normalize = true
        conv.buffer = makeBuffer(ctx, ir) // re-set: NOW the flag applies
      },
    })
    expect(Math.abs(reset.getChannelData(0)[0] - Math.fround(scale * 0.5))).toBeLessThanOrEqual(1e-8)
  })
})

describe('PlecoConvolverNode — sample-exact convolution vs direct time-domain reference', () => {
  it('mono signal ∗ multi-segment mono IR matches the direct convolution within the documented float32 tolerance', () => {
    // 300-sample signal (spans 3 quanta) ∗ 150-tap IR (2 partitions, non-multiple
    // of the render quantum) — exercises segmentation, ring history, and tails.
    const x = pseudoRandom(300, 7)
    const h = pseudoRandom(150, 11).map((v) => v * 0.25)
    const outLen = 449 // 300 + 150 − 1
    const expected = directConvolve(x, Float32Array.from(h), outLen)
    const out = renderConvolved({ input: [x], ir: [Float32Array.from(h)], length: 512 })
    const got = out.getChannelData(0)
    expect(maxAbsDiff(got, expected, outLen)).toBeLessThanOrEqual(2e-5)
    // Everything past the convolution's support is exactly-silent territory.
    for (let n = outLen; n < 512; n++) expect(Math.abs(got[n])).toBeLessThanOrEqual(2e-5)
    // Sanity: the fixture actually has signal to disagree about.
    expect(Math.max(...expected.map(Math.abs))).toBeGreaterThan(0.5)
  })

  it('tail-time: output continues for the length of the buffer after the input goes silent', () => {
    // 1-quantum impulse source, IR = δ at lag 300 (3 partitions): the response
    // lands two full quanta after the source has ended.
    const x = new Float32Array(RENDER_QUANTUM)
    x[0] = 1
    const h = new Float32Array(301)
    h[300] = 1
    const out = renderConvolved({ input: [x], ir: [h], length: 512 })
    const got = out.getChannelData(0)
    expect(Math.abs(got[300] - 1)).toBeLessThanOrEqual(1e-6)
    for (let n = 0; n < 300; n++) expect(Math.abs(got[n])).toBeLessThanOrEqual(1e-6)
  })
})

describe('PlecoConvolverNode — spec channel-response routing', () => {
  // Delta impulse responses at distinct lags with dyadic gains: the expected
  // outputs are delayed/scaled copies, computable exactly.
  const d = (lag, gain, len = 12) => {
    const h = new Float32Array(len)
    h[lag] = gain
    return h
  }
  const x1 = pseudoRandom(64, 3)
  const x2 = pseudoRandom(64, 5)

  it('mono input ∗ 1-ch IR → MONO output (the only mono-output case)', () => {
    const ctx = new PlecoBaseContext({ sampleRate: SR, numberOfChannels: 2 })
    const conv = new PlecoConvolverNode(ctx, { disableNormalization: true, buffer: makeBuffer(ctx, [d(0, 1)]) })
    const srcBuf = makeBuffer(ctx, [x1])
    const src = ctx.createBufferSource()
    src.buffer = srcBuf
    src.connect(conv)
    conv.connect(ctx.destination)
    src.start(0)
    ctx.renderQuantum()
    // White-box width check: the node's memoized block for this quantum.
    expect(conv._cacheBlock.numberOfChannels).toBe(1)
  })

  it('stereo input ∗ 1-ch IR → stereo output, each channel convolved independently with the mono IR', () => {
    const h = d(3, 0.5)
    const out = renderConvolved({ input: [x1, x2], ir: [h], length: 128 })
    const expL = directConvolve(x1, h, 128)
    const expR = directConvolve(x2, h, 128)
    expect(maxAbsDiff(out.getChannelData(0), expL, 128)).toBeLessThanOrEqual(1e-6)
    expect(maxAbsDiff(out.getChannelData(1), expR, 128)).toBeLessThanOrEqual(1e-6)
  })

  it('mono input ∗ 2-ch IR → stereo output: L = in∗IR₀, R = in∗IR₁ (mono feeds both branches)', () => {
    const h0 = d(3, 0.5)
    const h1 = d(5, 0.25)
    const out = renderConvolved({ input: [x1], ir: [h0, h1], length: 128 })
    expect(maxAbsDiff(out.getChannelData(0), directConvolve(x1, h0, 128), 128)).toBeLessThanOrEqual(1e-6)
    expect(maxAbsDiff(out.getChannelData(1), directConvolve(x1, h1, 128), 128)).toBeLessThanOrEqual(1e-6)
  })

  it('stereo input ∗ 2-ch IR → stereo output: L = inL∗IR₀, R = inR∗IR₁', () => {
    const h0 = d(3, 0.5)
    const h1 = d(5, 0.25)
    const out = renderConvolved({ input: [x1, x2], ir: [h0, h1], length: 128 })
    expect(maxAbsDiff(out.getChannelData(0), directConvolve(x1, h0, 128), 128)).toBeLessThanOrEqual(1e-6)
    expect(maxAbsDiff(out.getChannelData(1), directConvolve(x2, h1, 128), 128)).toBeLessThanOrEqual(1e-6)
  })

  it('stereo input ∗ 4-ch IR → matrix "true" stereo: L = inL∗IR₀ + inR∗IR₂, R = inL∗IR₁ + inR∗IR₃', () => {
    const h0 = d(1, 0.5)
    const h1 = d(3, 0.25)
    const h2 = d(5, 0.125)
    const h3 = d(7, 0.0625)
    const out = renderConvolved({ input: [x1, x2], ir: [h0, h1, h2, h3], length: 128 })
    const [y0, y1, y2, y3] = [directConvolve(x1, h0, 128), directConvolve(x1, h1, 128), directConvolve(x2, h2, 128), directConvolve(x2, h3, 128)]
    const expL = y0.map((v, n) => v + y2[n])
    const expR = y1.map((v, n) => v + y3[n])
    expect(maxAbsDiff(out.getChannelData(0), expL, 128)).toBeLessThanOrEqual(1e-6)
    expect(maxAbsDiff(out.getChannelData(1), expR, 128)).toBeLessThanOrEqual(1e-6)
  })

  it('mono input ∗ 4-ch IR → stereo output: L = in∗(IR₀+IR₂), R = in∗(IR₁+IR₃)', () => {
    const h0 = d(1, 0.5)
    const h1 = d(3, 0.25)
    const h2 = d(5, 0.125)
    const h3 = d(7, 0.0625)
    const out = renderConvolved({ input: [x1], ir: [h0, h1, h2, h3], length: 128 })
    const [y0, y1, y2, y3] = [directConvolve(x1, h0, 128), directConvolve(x1, h1, 128), directConvolve(x1, h2, 128), directConvolve(x1, h3, 128)]
    const expL = y0.map((v, n) => v + y2[n])
    const expR = y1.map((v, n) => v + y3[n])
    expect(maxAbsDiff(out.getChannelData(0), expL, 128)).toBeLessThanOrEqual(1e-6)
    expect(maxAbsDiff(out.getChannelData(1), expR, 128)).toBeLessThanOrEqual(1e-6)
  })

  it('null buffer → a single channel of silence, even with live input', () => {
    const ctx = new PlecoBaseContext({ sampleRate: SR, numberOfChannels: 1 })
    const conv = new PlecoConvolverNode(ctx)
    const srcBuf = makeBuffer(ctx, [x1])
    const src = ctx.createBufferSource()
    src.buffer = srcBuf
    src.connect(conv)
    conv.connect(ctx.destination)
    src.start(0)
    const block = ctx.renderQuantum()
    expect(conv._cacheBlock.numberOfChannels).toBe(1)
    for (let i = 0; i < RENDER_QUANTUM; i++) expect(block.getChannelData(0)[i]).toBe(0)
  })
})

describe('PlecoConvolverNode — overlap state across channel-count transitions (1-ch IR)', () => {
  /**
   * Quantum 0 renders MONO (impulse at frame 60 through a mono source);
   * before quantum 1 a silent STEREO source joins, widening the input to two
   * channels. The IR carries deltas at lags 120 (its response to frame 60
   * lands at frame 180 — carried by the OVERLAP TAIL) and 138 (landing at
   * frame 198 — carried by the input-spectrum RING). Both must survive the
   * pair-state transition.
   */
  function transitionRender(interpretation) {
    const ctx = new PlecoBaseContext({ sampleRate: SR, numberOfChannels: 2 })
    const h = new Float32Array(139)
    h[120] = 1
    h[138] = 1
    const conv = new PlecoConvolverNode(ctx, {
      disableNormalization: true,
      buffer: makeBuffer(ctx, [h]),
      channelInterpretation: interpretation,
    })
    conv.connect(ctx.destination)
    const x = new Float32Array(RENDER_QUANTUM)
    x[60] = 1
    const mono = ctx.createBufferSource()
    mono.buffer = makeBuffer(ctx, [x])
    mono.connect(conv)
    mono.start(0)
    ctx.renderQuantum() // quantum 0: mono input, response still in flight
    const silentStereo = ctx.createBufferSource()
    silentStereo.buffer = ctx.createBuffer(2, RENDER_QUANTUM, SR) // never started: 2 silent channels
    silentStereo.connect(conv) // widens computedNumberOfChannels to 2 from quantum 1
    ctx.renderQuantum() // quantum 1: frames 128..255
    return conv._cacheBlock
  }

  it("'speakers': the mono history sounds in BOTH channels — tail (frame 180) and ring (frame 198) both preserved", () => {
    const block = transitionRender('speakers')
    expect(block.numberOfChannels).toBe(2)
    for (let c = 0; c < 2; c++) {
      const ch = block.getChannelData(c)
      expect(Math.abs(ch[180 - 128] - 1)).toBeLessThanOrEqual(1e-6)
      expect(Math.abs(ch[198 - 128] - 1)).toBeLessThanOrEqual(1e-6)
    }
  })

  it("'discrete': the surviving pair keeps its state; the NEW channel starts from silent history", () => {
    const block = transitionRender('discrete')
    expect(block.numberOfChannels).toBe(2)
    const ch0 = block.getChannelData(0)
    const ch1 = block.getChannelData(1)
    expect(Math.abs(ch0[180 - 128] - 1)).toBeLessThanOrEqual(1e-6)
    expect(Math.abs(ch0[198 - 128] - 1)).toBeLessThanOrEqual(1e-6)
    for (let i = 0; i < RENDER_QUANTUM; i++) expect(Math.abs(ch1[i])).toBeLessThanOrEqual(1e-6)
  })
})
