import { describe, it, expect } from 'vitest'
import { PlecoBaseContext } from '../src/engine/xa-base-context.js'
import { PlecoAnalyserNode } from '../src/engine/nodes/xa-analyser.js'
import { RENDER_QUANTUM } from '../src/engine/xa-constants.js'

// P17 — AnalyserNode (spec § The AnalyserNode Interface): pass-through +
// mono-down-mixed circular capture (§ Time-Domain Down-Mixing), the normative
// analysis algorithm (§ FFT Windowing and Smoothing over Time: Blackman window
// α = 0.16, X[k] = (1/N)Σ x̂[n]e^(−2πikn/N), X̂[k] = τX̂₋₁[k] + (1−τ)|X[k]|,
// Y[k] = 20log₁₀X̂[k]), the byte scaling/clamping formulas, and the full
// attribute validation matrix (IndexSizeError points per § Attributes).
//
// Hand-computed anchors (DC input of amplitude A, tau = 0): the Blackman
// window's own spectrum puts EXACT values in the first three bins —
// |X[0]| = a₀·A = 0.42A, |X[1]| = (a₁/2)·A = 0.25A, |X[2]| = (a₂/2)·A = 0.04A
// (cosine terms split across ±k) — so A = 0.5 gives 0.21 / 0.125 / 0.02.

const SR = 8000

const makeCtx = (channels = 1) => new PlecoBaseContext({ sampleRate: SR, numberOfChannels: channels })

/** Buffer-source → analyser graph fed with mono `values`, optionally leaving the analyser output unconnected. */
function feedMono(values, { analyser, connectOut = true } = {}) {
  const ctx = makeCtx()
  const a = new PlecoAnalyserNode(ctx, analyser)
  const buf = ctx.createBuffer(1, values.length, SR)
  buf.getChannelData(0).set(values)
  const src = ctx.createBufferSource()
  src.buffer = buf
  src.connect(a)
  if (connectOut) a.connect(ctx.destination)
  src.start(0)
  return { ctx, a, buf }
}

const renderQuanta = (ctx, n) => {
  for (let i = 0; i < n; i++) ctx.renderQuantum()
}

/**
 * Literal-spec reference: Blackman window (α = 0.16) → direct O(N²) DFT with
 * the spec kernel e^(−2πikn/N) and 1/N normalization → float32-rounded linear
 * magnitudes for k = 0..N/2−1. Mirrors the engine's float32 boundaries
 * (windowed samples and stored magnitudes are frounded) without sharing any
 * FFT code with the node under test.
 */
function specMagnitude(x) {
  const N = x.length
  const xw = new Float64Array(N)
  for (let n = 0; n < N; n++) {
    const w = 0.42 - 0.5 * Math.cos((2 * Math.PI * n) / N) + 0.08 * Math.cos((4 * Math.PI * n) / N)
    xw[n] = Math.fround(x[n] * w)
  }
  const out = new Float64Array(N / 2)
  for (let k = 0; k < N / 2; k++) {
    let re = 0
    let im = 0
    for (let n = 0; n < N; n++) {
      const t = (-2 * Math.PI * k * n) / N
      re += xw[n] * Math.cos(t)
      im += xw[n] * Math.sin(t)
    }
    out[k] = Math.fround(Math.sqrt(re * re + im * im) / N)
  }
  return out
}

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

describe('AnalyserNode — defaults & node shape', () => {
  it('carries the spec defaults: fftSize 2048, frequencyBinCount 1024, minDecibels -100, maxDecibels -30, smoothingTimeConstant 0.8', () => {
    const a = new PlecoAnalyserNode(makeCtx())
    expect(a.fftSize).toBe(2048)
    expect(a.frequencyBinCount).toBe(1024)
    expect(a.minDecibels).toBe(-100)
    expect(a.maxDecibels).toBe(-30)
    expect(a.smoothingTimeConstant).toBe(0.8)
  })

  it('is 1-in / 1-out with channelCount 2, channelCountMode max, channelInterpretation speakers (spec node table)', () => {
    const a = new PlecoAnalyserNode(makeCtx())
    expect(a.numberOfInputs).toBe(1)
    expect(a.numberOfOutputs).toBe(1)
    expect(a.channelCount).toBe(2)
    expect(a.channelCountMode).toBe('max')
    expect(a.channelInterpretation).toBe('speakers')
  })

  it('constructor applies AnalyserOptions and AudioNodeOptions', () => {
    const a = new PlecoAnalyserNode(makeCtx(), {
      fftSize: 64,
      minDecibels: -80,
      maxDecibels: -10,
      smoothingTimeConstant: 0.25,
      channelCount: 1,
    })
    expect(a.fftSize).toBe(64)
    expect(a.frequencyBinCount).toBe(32)
    expect(a.minDecibels).toBe(-80)
    expect(a.maxDecibels).toBe(-10)
    expect(a.smoothingTimeConstant).toBe(0.25)
    expect(a.channelCount).toBe(1)
  })

  it('constructor validates the dB pair jointly — a coherent pair straddling a default is accepted', () => {
    const a = new PlecoAnalyserNode(makeCtx(), { minDecibels: -20, maxDecibels: -10 })
    expect(a.minDecibels).toBe(-20)
    expect(a.maxDecibels).toBe(-10)
  })

  it('constructor rejects an incoherent dB pair, a bad fftSize, and an out-of-range smoothingTimeConstant', () => {
    expectDOMException(() => new PlecoAnalyserNode(makeCtx(), { minDecibels: -10, maxDecibels: -20 }), 'IndexSizeError')
    expectDOMException(() => new PlecoAnalyserNode(makeCtx(), { minDecibels: -30, maxDecibels: -30 }), 'IndexSizeError')
    expectDOMException(() => new PlecoAnalyserNode(makeCtx(), { fftSize: 100 }), 'IndexSizeError')
    expectDOMException(() => new PlecoAnalyserNode(makeCtx(), { smoothingTimeConstant: 1.5 }), 'IndexSizeError')
  })
})

describe('AnalyserNode — attribute validation matrix', () => {
  it('fftSize accepts every power of two in [32, 32768] and frequencyBinCount tracks it as fftSize/2', () => {
    const a = new PlecoAnalyserNode(makeCtx())
    for (let v = 32; v <= 32768; v *= 2) {
      a.fftSize = v
      expect(a.fftSize).toBe(v)
      expect(a.frequencyBinCount).toBe(v / 2)
    }
  })

  it('fftSize throws IndexSizeError for out-of-range, non-power-of-two, and non-integer values — leaving the value unchanged', () => {
    const a = new PlecoAnalyserNode(makeCtx())
    for (const bad of [16, 65536, 100, 0, -128, 2048.5, NaN, Infinity]) {
      expectDOMException(() => {
        a.fftSize = bad
      }, 'IndexSizeError')
      expect(a.fftSize).toBe(2048)
    }
  })

  it('minDecibels ≥ maxDecibels throws IndexSizeError (both == and >), value unchanged; valid values apply', () => {
    const a = new PlecoAnalyserNode(makeCtx())
    for (const bad of [-30, -20, 0]) {
      expectDOMException(() => {
        a.minDecibels = bad
      }, 'IndexSizeError')
      expect(a.minDecibels).toBe(-100)
    }
    a.minDecibels = -120
    expect(a.minDecibels).toBe(-120)
  })

  it('maxDecibels ≤ minDecibels throws IndexSizeError (both == and <), value unchanged; valid values apply', () => {
    const a = new PlecoAnalyserNode(makeCtx())
    for (const bad of [-100, -150]) {
      expectDOMException(() => {
        a.maxDecibels = bad
      }, 'IndexSizeError')
      expect(a.maxDecibels).toBe(-30)
    }
    a.maxDecibels = 0
    expect(a.maxDecibels).toBe(0)
  })

  it('smoothingTimeConstant outside [0, 1] throws IndexSizeError; the endpoints 0 and 1 are legal', () => {
    const a = new PlecoAnalyserNode(makeCtx())
    for (const bad of [-0.001, 1.001, -5, 2]) {
      expectDOMException(() => {
        a.smoothingTimeConstant = bad
      }, 'IndexSizeError')
      expect(a.smoothingTimeConstant).toBe(0.8)
    }
    a.smoothingTimeConstant = 0
    expect(a.smoothingTimeConstant).toBe(0)
    a.smoothingTimeConstant = 1
    expect(a.smoothingTimeConstant).toBe(1)
  })

  it('non-finite doubles are a TypeError (WebIDL restricted double), not IndexSizeError', () => {
    const a = new PlecoAnalyserNode(makeCtx())
    expect(() => {
      a.minDecibels = NaN
    }).toThrow(TypeError)
    expect(() => {
      a.maxDecibels = Infinity
    }).toThrow(TypeError)
    expect(() => {
      a.smoothingTimeConstant = NaN
    }).toThrow(TypeError)
  })

  it('frequencyBinCount is readonly — assignment throws TypeError and the value is untouched', () => {
    const a = new PlecoAnalyserNode(makeCtx())
    expect(() => {
      a.frequencyBinCount = 5
    }).toThrow(TypeError)
    expect(a.frequencyBinCount).toBe(1024)
  })

  it('the four data methods reject wrongly-typed arrays with TypeError', () => {
    const a = new PlecoAnalyserNode(makeCtx())
    expect(() => a.getFloatFrequencyData(new Uint8Array(4))).toThrow(TypeError)
    expect(() => a.getFloatTimeDomainData(new Uint8Array(4))).toThrow(TypeError)
    expect(() => a.getByteFrequencyData(new Float32Array(4))).toThrow(TypeError)
    expect(() => a.getByteTimeDomainData(new Float32Array(4))).toThrow(TypeError)
  })
})

describe('AnalyserNode — capture & time-domain data', () => {
  it('getFloatTimeDomainData round-trips a mono quantum sample-exactly', () => {
    const ramp = Float32Array.from({ length: RENDER_QUANTUM }, (_, i) => i + 1)
    const { ctx, a } = feedMono(ramp, { analyser: { fftSize: 128 } })
    renderQuanta(ctx, 1)
    const td = new Float32Array(128)
    a.getFloatTimeDomainData(td)
    expect(td).toEqual(ramp)
  })

  it('keeps capturing when the output is left unconnected (spec: this output may be left unconnected)', () => {
    const ramp = Float32Array.from({ length: RENDER_QUANTUM }, (_, i) => i + 1)
    const { ctx, a } = feedMono(ramp, { analyser: { fftSize: 128 }, connectOut: false })
    renderQuanta(ctx, 1)
    const td = new Float32Array(128)
    a.getFloatTimeDomainData(td)
    expect(td).toEqual(ramp)
  })

  it('returns the MOST RECENT fftSize frames — older frames scroll out of the window', () => {
    const ramp = Float32Array.from({ length: 256 }, (_, i) => i + 1)
    const { ctx, a } = feedMono(ramp, { analyser: { fftSize: 128 } })
    renderQuanta(ctx, 2)
    const td = new Float32Array(128)
    a.getFloatTimeDomainData(td)
    for (let i = 0; i < 128; i++) expect(td[i]).toBe(129 + i)
  })

  it('history survives an fftSize INCREASE — past frames beyond the old window become visible (spec § fftSize)', () => {
    const ramp = Float32Array.from({ length: 256 }, (_, i) => i + 1)
    const { ctx, a } = feedMono(ramp, { analyser: { fftSize: 128 } })
    renderQuanta(ctx, 2)
    a.fftSize = 256
    const td = new Float32Array(256)
    a.getFloatTimeDomainData(td)
    expect(td).toEqual(ramp)
  })

  it('down-mixes a stereo input to mono via the speakers rule 0.5·(L + R), independent of node channel settings', () => {
    const ctx = makeCtx(2)
    const a = new PlecoAnalyserNode(ctx, { fftSize: 128 })
    const buf = ctx.createBuffer(2, 128, SR)
    buf.getChannelData(0).fill(0.8)
    buf.getChannelData(1).fill(0.4)
    const src = ctx.createBufferSource()
    src.buffer = buf
    src.connect(a)
    a.connect(ctx.destination)
    src.start(0)
    renderQuanta(ctx, 1)
    const td = new Float32Array(128)
    a.getFloatTimeDomainData(td)
    const expected = Math.fround(0.5 * (Math.fround(0.8) + Math.fround(0.4)))
    for (let i = 0; i < 128; i++) expect(td[i]).toBe(expected)
  })

  it("capture ignores the node's channel settings (explicit/1/discrete still captures 0.5·(L + R)) while the OUTPUT follows them", () => {
    const ctx = makeCtx(2)
    const a = new PlecoAnalyserNode(ctx, {
      fftSize: 128,
      channelCount: 1,
      channelCountMode: 'explicit',
      channelInterpretation: 'discrete',
    })
    const buf = ctx.createBuffer(2, 128, SR)
    buf.getChannelData(0).fill(0.8)
    buf.getChannelData(1).fill(0.4)
    const src = ctx.createBufferSource()
    src.buffer = buf
    src.connect(a)
    a.connect(ctx.destination)
    src.start(0)
    const block = ctx.renderQuantum()
    // The pass-through output honours explicit/1/discrete: channel 0 only
    // (0.8), then mono → stereo speakers up-mix at the destination (L = R).
    expect(block.numberOfChannels).toBe(2)
    for (const c of [0, 1]) {
      expect(block.getChannelData(c)[0]).toBe(Math.fround(0.8))
    }
    // The capture is the spec-fixed 1/'max'/'speakers' mix — 0.5·(L + R),
    // NOT the node-settings mix (which would be 0.8, channel 0 only).
    const td = new Float32Array(128)
    a.getFloatTimeDomainData(td)
    const expected = Math.fround(0.5 * (Math.fround(0.8) + Math.fround(0.4)))
    for (let i = 0; i < 128; i++) expect(td[i]).toBe(expected)
  })

  it('passes the stream through UN-PROCESSED: a stereo input reaches the destination untouched', () => {
    const ctx = makeCtx(2)
    const a = new PlecoAnalyserNode(ctx)
    const buf = ctx.createBuffer(2, 128, SR)
    buf.getChannelData(0).fill(0.8)
    buf.getChannelData(1).fill(0.4)
    const src = ctx.createBufferSource()
    src.buffer = buf
    src.connect(a)
    a.connect(ctx.destination)
    src.start(0)
    const block = ctx.renderQuantum()
    expect(block.numberOfChannels).toBe(2)
    expect(block.getChannelData(0)).toEqual(buf.getChannelData(0))
    expect(block.getChannelData(1)).toEqual(buf.getChannelData(1))
  })

  it('a fresh analyser reads silence: float time-domain all 0, bytes all 128, frequency all -Infinity', () => {
    const a = new PlecoAnalyserNode(makeCtx(), { fftSize: 32 })
    const td = new Float32Array(32)
    a.getFloatTimeDomainData(td)
    expect(td.every((v) => v === 0)).toBe(true)
    const bt = new Uint8Array(32)
    a.getByteTimeDomainData(bt)
    expect(bt.every((v) => v === 128)).toBe(true)
    const f = new Float32Array(16)
    a.getFloatFrequencyData(f)
    expect(f.every((v) => v === -Infinity)).toBe(true)
    const bf = new Uint8Array(16)
    a.getByteFrequencyData(bf)
    expect(bf.every((v) => v === 0)).toBe(true)
  })

  it('a shorter array gets only its length; a longer array leaves the excess untouched (both domains)', () => {
    const ramp = Float32Array.from({ length: RENDER_QUANTUM }, (_, i) => i + 1)
    const { ctx, a } = feedMono(ramp, { analyser: { fftSize: 128 } })
    renderQuanta(ctx, 1)

    const short = new Float32Array(4)
    a.getFloatTimeDomainData(short)
    expect(Array.from(short)).toEqual([1, 2, 3, 4])

    const long = new Float32Array(132).fill(999)
    a.getFloatTimeDomainData(long)
    expect(long[127]).toBe(128)
    for (let i = 128; i < 132; i++) expect(long[i]).toBe(999)

    const fShort = new Float32Array(4).fill(999)
    a.getFloatFrequencyData(fShort)
    expect(fShort.every((v) => v !== 999)).toBe(true)
    const fLong = new Float32Array(68).fill(999)
    a.getFloatFrequencyData(fLong)
    for (let i = 64; i < 68; i++) expect(fLong[i]).toBe(999)

    const bLong = new Uint8Array(132).fill(7)
    a.getByteTimeDomainData(bLong)
    for (let i = 128; i < 132; i++) expect(bLong[i]).toBe(7)
  })

  it('getByteTimeDomainData applies b = ⌊128·(1 + x)⌋ with clamping to [0, 255] at known values', () => {
    const values = new Float32Array(128)
    values.set([0, 0.5, -0.25, 1, -1, 0.75])
    const { ctx, a } = feedMono(values, { analyser: { fftSize: 128 } })
    renderQuanta(ctx, 1)
    const bt = new Uint8Array(128)
    a.getByteTimeDomainData(bt)
    // ⌊128·(1+x)⌋: 0→128 · 0.5→192 · −0.25→96 · 1→256→clip 255 · −1→0 · 0.75→224
    expect(Array.from(bt.subarray(0, 6))).toEqual([128, 192, 96, 255, 0, 224])
    expect(bt[6]).toBe(128) // trailing silence
  })
})

describe('AnalyserNode — frequency data: Blackman window, FFT, dB conversion', () => {
  it('a pure sine on bin 16 (N = 128) peaks at bin 16 and matches the literal-spec DFT reference on every bin', () => {
    const N = 128
    const k0 = 16
    const x = Float32Array.from({ length: N }, (_, n) => Math.sin((2 * Math.PI * k0 * n) / N))
    const { ctx, a } = feedMono(x, { analyser: { fftSize: N, smoothingTimeConstant: 0 } })
    renderQuanta(ctx, 1)

    const freq = new Float32Array(N / 2)
    a.getFloatFrequencyData(freq)

    // frequency → bin math: argmax lands exactly on k0 = f·N/sampleRate
    let argmax = 0
    for (let k = 1; k < N / 2; k++) if (freq[k] > freq[argmax]) argmax = k
    expect(argmax).toBe(k0)

    // windowed sine peak: |X[k0]| ≈ a₀/2 = 0.21 → ≈ −13.56 dB (window-leakage tolerant)
    expect(freq[k0]).toBeCloseTo(20 * Math.log10(0.21), 1)

    // every bin matches the direct-DFT spec reference in the LINEAR domain
    const td = new Float32Array(N)
    a.getFloatTimeDomainData(td)
    const ref = specMagnitude(td)
    for (let k = 0; k < N / 2; k++) {
      const linear = freq[k] === -Infinity ? 0 : Math.pow(10, freq[k] / 20)
      expect(Math.abs(linear - ref[k])).toBeLessThan(2e-6)
    }

    // outside the Blackman mainlobe (±3 bins) everything sits at least 40 dB below the peak
    for (let k = 0; k < N / 2; k++) {
      if (Math.abs(k - k0) > 3) expect(freq[k]).toBeLessThan(freq[k0] - 40)
    }
  })

  it('assembles the analysis window across render quanta: a bin-32 sine over two quanta (N = 256) peaks at bin 32', () => {
    const N = 256
    const k0 = 32
    const x = Float32Array.from({ length: N }, (_, n) => Math.sin((2 * Math.PI * k0 * n) / N))
    const { ctx, a } = feedMono(x, { analyser: { fftSize: N, smoothingTimeConstant: 0 } })
    renderQuanta(ctx, 2)
    const freq = new Float32Array(N / 2)
    a.getFloatFrequencyData(freq)
    let argmax = 0
    for (let k = 1; k < N / 2; k++) if (freq[k] > freq[argmax]) argmax = k
    expect(argmax).toBe(k0)
    expect(freq[k0]).toBeCloseTo(20 * Math.log10(0.21), 1)
  })

  it('DC input exposes the exact spec Blackman coefficients: bins 0/1/2 = a₀·A, (a₁/2)·A, (a₂/2)·A', () => {
    const { ctx, a } = feedMono(new Float32Array(128).fill(0.5), {
      analyser: { fftSize: 128, smoothingTimeConstant: 0 },
    })
    renderQuanta(ctx, 1)
    const freq = new Float32Array(64)
    a.getFloatFrequencyData(freq)
    expect(freq[0]).toBeCloseTo(20 * Math.log10(0.21), 3) // 0.42·0.5  → −13.5556 dB
    expect(freq[1]).toBeCloseTo(20 * Math.log10(0.125), 3) // 0.25·0.5 → −18.0618 dB
    expect(freq[2]).toBeCloseTo(20 * Math.log10(0.02), 3) // 0.04·0.5  → −33.9794 dB
    // beyond the window's own spectrum only FFT round-off remains
    for (let k = 3; k < 64; k++) expect(freq[k]).toBeLessThan(-100)
  })

  it('getByteFrequencyData applies b = ⌊255/(dB_max − dB_min)·(Y − dB_min)⌋ with clamping — exact at the hand-computed bins', () => {
    const { ctx, a } = feedMono(new Float32Array(128).fill(0.5), {
      analyser: { fftSize: 128, smoothingTimeConstant: 0 },
    })
    renderQuanta(ctx, 1)
    const bytes = new Uint8Array(64)
    a.getByteFrequencyData(bytes)
    // defaults −100/−30: Y₀ = −13.56 and Y₁ = −18.06 exceed maxDecibels → 255;
    // Y₂ = −33.9794 → ⌊(255/70)·(−33.9794 + 100)⌋ = ⌊240.503⌋ = 240; noise bins < −100 dB → 0
    expect(bytes[0]).toBe(255)
    expect(bytes[1]).toBe(255)
    expect(bytes[2]).toBe(240)
    for (let k = 3; k < 64; k++) expect(bytes[k]).toBe(0)
  })

  it('byte frequency scaling follows the CURRENT minDecibels/maxDecibels', () => {
    const { ctx, a } = feedMono(new Float32Array(128).fill(0.5), {
      analyser: { fftSize: 128, smoothingTimeConstant: 0 },
    })
    renderQuanta(ctx, 1)
    a.minDecibels = -40
    a.maxDecibels = -20
    const bytes = new Uint8Array(64)
    a.getByteFrequencyData(bytes)
    // Y₂ = −33.9794 → ⌊(255/20)·(−33.9794 + 40)⌋ = ⌊76.76⌋ = 76; Y₀, Y₁ > −20 → 255
    expect(bytes[0]).toBe(255)
    expect(bytes[1]).toBe(255)
    expect(bytes[2]).toBe(76)
    expect(bytes[10]).toBe(0)
  })

  it('zeroes the whole block when the analysis window contains a non-finite sample (spec: X̂[k] NaN/±∞ → 0)', () => {
    const values = new Float32Array(128).fill(0.5)
    values[5] = NaN
    const { ctx, a } = feedMono(values, { analyser: { fftSize: 128, smoothingTimeConstant: 0 } })
    renderQuanta(ctx, 1)
    const freq = new Float32Array(64)
    a.getFloatFrequencyData(freq)
    expect(freq.every((v) => v === -Infinity)).toBe(true)
    // the time-domain data itself is NOT sanitized — the capture is verbatim
    const td = new Float32Array(128)
    a.getFloatTimeDomainData(td)
    expect(Number.isNaN(td[5])).toBe(true)
  })
})

describe('AnalyserNode — smoothing over time', () => {
  // τ = 0.5, DC 0.5 → |X[0]| = 0.21: first block X̂ = 0.5·0.21 = 0.105
  // (−19.5762 dB); a silent second block halves it → 0.0525 (−25.5968 dB).
  it('X̂[k] = τ·X̂₋₁[k] + (1−τ)·|X[k]| across two captures — hand-computed at τ = 0.5', () => {
    const { ctx, a } = feedMono(new Float32Array(128).fill(0.5), {
      analyser: { fftSize: 128, smoothingTimeConstant: 0.5 },
    })
    renderQuanta(ctx, 1)
    const f1 = new Float32Array(64)
    a.getFloatFrequencyData(f1)
    expect(f1[0]).toBeCloseTo(-19.5762, 3)

    renderQuanta(ctx, 1) // source exhausted → this quantum is silence
    const f2 = new Float32Array(64)
    a.getFloatFrequencyData(f2)
    expect(f2[0]).toBeCloseTo(-25.5968, 3)
    // halving is uniform: every finite bin drops by exactly 20·log₁₀2 ≈ 6.0206 dB
    for (const k of [0, 1, 2]) expect(f2[k]).toBeCloseTo(f1[k] - 6.0206, 3)
  })

  it('within one render quantum the frequency data is computed once — a repeat call returns the SAME data, not a re-smoothed one', () => {
    const { ctx, a } = feedMono(new Float32Array(256).fill(0.5), {
      analyser: { fftSize: 128, smoothingTimeConstant: 0.5 },
    })
    renderQuanta(ctx, 1)
    const f1 = new Float32Array(64)
    a.getFloatFrequencyData(f1)
    const f2 = new Float32Array(64)
    a.getFloatFrequencyData(f2) // same quantum — must NOT advance X̂₋₁ to 0.1575 (−16.05 dB)
    expect(f2).toEqual(f1)
    const bytes = new Uint8Array(64)
    a.getByteFrequencyData(bytes) // byte read shares the same per-quantum computation
    expect(bytes[0]).toBe(255)
  })

  it('the smoothing recursion advances once per quantum: a second DC quantum yields X̂ = 0.5·0.105 + 0.5·0.21 = 0.1575', () => {
    const { ctx, a } = feedMono(new Float32Array(256).fill(0.5), {
      analyser: { fftSize: 128, smoothingTimeConstant: 0.5 },
    })
    renderQuanta(ctx, 1)
    const f1 = new Float32Array(64)
    a.getFloatFrequencyData(f1)
    expect(f1[0]).toBeCloseTo(-19.5762, 3)
    a.fftSize = 128 // SAME value — spec resets only on a change to a DIFFERENT value
    renderQuanta(ctx, 1)
    const f2 = new Float32Array(64)
    a.getFloatFrequencyData(f2)
    expect(f2[0]).toBeCloseTo(-16.0544, 3) // 20·log₁₀(0.1575)
  })

  it('changing fftSize to a different value resets X̂₋₁ to zero (spec § fftSize)', () => {
    const { ctx, a } = feedMono(new Float32Array(256).fill(0.5), {
      analyser: { fftSize: 128, smoothingTimeConstant: 0.5 },
    })
    renderQuanta(ctx, 1)
    const f1 = new Float32Array(64)
    a.getFloatFrequencyData(f1)
    expect(f1[0]).toBeCloseTo(-19.5762, 3)
    a.fftSize = 256
    a.fftSize = 128 // round-trip through a different value — smoothing state is gone
    renderQuanta(ctx, 1)
    const f2 = new Float32Array(64)
    a.getFloatFrequencyData(f2)
    expect(f2[0]).toBeCloseTo(-19.5762, 3) // 0.5·0 + 0.5·0.21 again, NOT 0.1575
  })

  it('τ = 1 freezes the previous block: from a zero start the spectrum stays at -Infinity dB despite input', () => {
    const { ctx, a } = feedMono(new Float32Array(128).fill(0.5), {
      analyser: { fftSize: 128, smoothingTimeConstant: 1 },
    })
    renderQuanta(ctx, 1)
    const freq = new Float32Array(64)
    a.getFloatFrequencyData(freq)
    expect(freq.every((v) => v === -Infinity)).toBe(true)
  })
})
