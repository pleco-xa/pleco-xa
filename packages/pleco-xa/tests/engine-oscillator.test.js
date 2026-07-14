/**
 * tests/engine-oscillator.test.js — PlecoPeriodicWave + PlecoOscillatorNode (P16).
 *
 * Spec § The PeriodicWave Interface: constructor algorithm cases (both / only
 * real / only imag / neither), IndexSizeError on length mismatch or length < 2,
 * WebIDL sequence<float> conversion (TypeError on non-finite, before the
 * algorithm's IndexSizeError), DC zeroing, internal copies, and
 * PeriodicWaveConstraints.disableNormalization against § Waveform
 * Normalization (fixed factor f = max |x̃(n)|).
 *
 * Spec § The OscillatorNode Interface: OscillatorType WebIDL enum semantics
 * with the InvalidStateError on direct type = 'custom', setPeriodicWave(),
 * OscillatorOptions rules (periodicWave wins over type; 'custom' without
 * periodicWave throws), frequency/detune a-rate params with spec nominal
 * ranges, computedOscFrequency = frequency · 2^(detune/1200), phase = the
 * definite integral of computedOscFrequency with phase 0 at the exact start
 * time, silence-but-phase-advance at |f| ≥ Nyquist, and the § Basic Waveform
 * Phase / § Oscillator Coefficients requirement that each built-in type
 * produces the SAME result as a PeriodicWave built from its Fourier series
 * with disableNormalization false.
 *
 * Reference expectations mirror the phase integral (out[n] = sin(2π·φₙ),
 * φₙ₊₁ = φₙ + f(n)/sr) rather than the closed form, so a-rate frequency
 * changes are exact; tolerances cover only the float32 wavetable store and
 * the cubic table readout (≪ 1e-5 for sine).
 */
import { describe, it, expect } from 'vitest'
import { PlecoOfflineContext } from '../src/engine/xa-offline-context.js'
import { PlecoOscillatorNode } from '../src/engine/nodes/xa-oscillator.js'
import {
  PlecoPeriodicWave,
  PERIODIC_WAVE_TABLE_SIZE,
  BUILTIN_SERIES_LENGTH,
} from '../src/engine/nodes/xa-periodic-wave.js'

const SR = 48000
const NYQUIST = SR / 2

const ctx = (length = 128, numberOfChannels = 1) =>
  new PlecoOfflineContext({ numberOfChannels, length, sampleRate: SR })

/** Render `length` mono frames of a configured oscillator, offline. */
function renderOsc(length, setup) {
  const c = ctx(length)
  const osc = setup(c)
  osc.connect(c.destination)
  return c.renderSync().getChannelData(0)
}

/**
 * Phase-integral mirror of the sine oscillator (spec: instantaneous phase is
 * the definite integral of computedOscFrequency, zero at the start time), with
 * the silence-at-|f|≥Nyquist rule applied per sample.
 */
function sineRef(freqAt, length, sr = SR) {
  const out = new Float64Array(length)
  let phase = 0
  const nyq = sr / 2
  for (let n = 0; n < length; n++) {
    const f = freqAt(n)
    out[n] = Math.abs(f) >= nyq ? 0 : Math.sin(2 * Math.PI * phase)
    phase += f / sr
    phase -= Math.floor(phase)
  }
  return out
}

/** Spec § Oscillator Coefficients — the imag (sine-term) series for each built-in type, length L. */
function builtinSeries(type, L) {
  const b = new Float32Array(L)
  for (let n = 1; n < L; n++) {
    switch (type) {
      case 'sine':
        b[n] = n === 1 ? 1 : 0
        break
      case 'square':
        b[n] = (2 / (n * Math.PI)) * (1 - (n % 2 === 0 ? 1 : -1))
        break
      case 'sawtooth':
        b[n] = ((n % 2 === 1 ? 1 : -1) * 2) / (n * Math.PI)
        break
      case 'triangle':
        b[n] = (8 * Math.sin((n * Math.PI) / 2)) / (Math.PI * n) ** 2
        break
    }
  }
  return b
}

describe('PlecoPeriodicWave — constructor validation', () => {
  it('requires a context', () => {
    expect(() => new PlecoPeriodicWave()).toThrow(TypeError)
    expect(() => new PlecoPeriodicWave(null, {})).toThrow(TypeError)
  })

  it('null options convert to the empty dictionary (WebIDL) — equivalent to the built-in sine case', () => {
    const wave = new PlecoPeriodicWave(ctx(), null)
    const sine = new PlecoPeriodicWave(ctx(), {})
    expect(Array.from(wave._table)).toEqual(Array.from(sine._table))
  })

  it('real/imag length mismatch throws IndexSizeError', () => {
    const err = (() => {
      try {
        new PlecoPeriodicWave(ctx(), { real: [0, 1, 0], imag: [0, 1] })
      } catch (e) {
        return e
      }
    })()
    expect(err).toBeInstanceOf(DOMException)
    expect(err.name).toBe('IndexSizeError')
  })

  it('both given with length < 2 throws IndexSizeError', () => {
    expect(() => new PlecoPeriodicWave(ctx(), { real: [0], imag: [0] })).toThrow(/IndexSize|at least 2/)
    try {
      new PlecoPeriodicWave(ctx(), { real: [0], imag: [0] })
    } catch (e) {
      expect(e.name).toBe('IndexSizeError')
    }
  })

  it('only real with length < 2 throws IndexSizeError; likewise only imag', () => {
    try {
      new PlecoPeriodicWave(ctx(), { real: [1] })
    } catch (e) {
      expect(e.name).toBe('IndexSizeError')
    }
    try {
      new PlecoPeriodicWave(ctx(), { imag: [1] })
    } catch (e) {
      expect(e.name).toBe('IndexSizeError')
    }
    expect(() => new PlecoPeriodicWave(ctx(), { real: [1] })).toThrow()
    expect(() => new PlecoPeriodicWave(ctx(), { imag: [1] })).toThrow()
  })

  it('non-finite coefficients throw TypeError (WebIDL float conversion, before IndexSizeError)', () => {
    expect(() => new PlecoPeriodicWave(ctx(), { real: [0, NaN], imag: [0, 1] })).toThrow(TypeError)
    expect(() => new PlecoPeriodicWave(ctx(), { real: [0, 1], imag: [0, Infinity] })).toThrow(TypeError)
    expect(() => new PlecoPeriodicWave(ctx(), { imag: [0, -Infinity] })).toThrow(TypeError)
    // conversion precedes the algorithm: a non-finite element in a mismatched
    // pair still surfaces as the binding-layer TypeError
    expect(() => new PlecoPeriodicWave(ctx(), { real: [0, NaN, 0], imag: [0, 1] })).toThrow(TypeError)
  })

  it('non-numeric coefficients and non-sequence options throw TypeError (pleco strictness)', () => {
    expect(() => new PlecoPeriodicWave(ctx(), { real: [0, '1'], imag: [0, 1] })).toThrow(TypeError)
    expect(() => new PlecoPeriodicWave(ctx(), { real: 42, imag: [0, 1] })).toThrow(TypeError)
  })

  it('non-boolean disableNormalization throws TypeError (pleco strictness)', () => {
    expect(
      () => new PlecoPeriodicWave(ctx(), { real: [0, 1], imag: [0, 0], disableNormalization: 1 }),
    ).toThrow(TypeError)
  })

  it('supports coefficient arrays up to 8192 elements (spec MUST)', () => {
    const real = new Float32Array(8192)
    const imag = new Float32Array(8192)
    imag[1] = 1
    imag[8191] = 0.5
    const wave = new PlecoPeriodicWave(ctx(), { real, imag })
    // A table of the default size could not carry harmonic 8191 without
    // aliasing — the synthesis grows the table to keep every bin distinct.
    expect(wave._table.length).toBeGreaterThanOrEqual(2 * 8192)
    for (const v of wave._table) expect(Number.isFinite(v)).toBe(true)
  })
})

describe('PlecoPeriodicWave — wavetable synthesis', () => {
  it('imag fundamental yields a sine table: peak 1 at N/4, zero at 0 and N/2', () => {
    const wave = new PlecoPeriodicWave(ctx(), { real: [0, 0], imag: [0, 1] })
    const t = wave._table
    const N = t.length
    expect(N).toBe(PERIODIC_WAVE_TABLE_SIZE)
    expect(Math.abs(t[0])).toBeLessThan(1e-6)
    expect(t[N / 4]).toBeCloseTo(1, 6)
    expect(Math.abs(t[N / 2])).toBeLessThan(1e-6)
    expect(t[(3 * N) / 4]).toBeCloseTo(-1, 6)
  })

  it('real fundamental yields a cosine table: peak 1 at 0, -1 at N/2', () => {
    const wave = new PlecoPeriodicWave(ctx(), { real: [0, 1], imag: [0, 0] })
    const t = wave._table
    const N = t.length
    expect(t[0]).toBeCloseTo(1, 6)
    expect(t[N / 2]).toBeCloseTo(-1, 6)
    expect(Math.abs(t[N / 4])).toBeLessThan(1e-6)
  })

  it('normalization scales the peak to 1; disableNormalization keeps raw amplitude', () => {
    const normalized = new PlecoPeriodicWave(ctx(), { imag: [0, 0.25] })
    const raw = new PlecoPeriodicWave(ctx(), { imag: [0, 0.25], disableNormalization: true })
    const peak = (t) => t.reduce((m, v) => Math.max(m, Math.abs(v)), 0)
    expect(peak(normalized._table)).toBeCloseTo(1, 6)
    expect(peak(raw._table)).toBeCloseTo(0.25, 6)
  })

  it('the DC components real[0] and imag[0] are zeroed (spec constructor step)', () => {
    const withDC = new PlecoPeriodicWave(ctx(), { real: [100, 0], imag: [50, 1] })
    const without = new PlecoPeriodicWave(ctx(), { real: [0, 0], imag: [0, 1] })
    expect(withDC._table).toEqual(without._table)
  })

  it('missing imag defaults to zeros; missing real defaults to zeros', () => {
    const realOnly = new PlecoPeriodicWave(ctx(), { real: [0, 1] })
    const explicit = new PlecoPeriodicWave(ctx(), { real: [0, 1], imag: [0, 0] })
    expect(realOnly._table).toEqual(explicit._table)
    const imagOnly = new PlecoPeriodicWave(ctx(), { imag: [0, 1] })
    const explicit2 = new PlecoPeriodicWave(ctx(), { real: [0, 0], imag: [0, 1] })
    expect(imagOnly._table).toEqual(explicit2._table)
  })

  it('neither real nor imag: equivalent to the sine series {imag: [0, 1]}', () => {
    const defaulted = new PlecoPeriodicWave(ctx(), {})
    const sine = new PlecoPeriodicWave(ctx(), { real: [0, 0], imag: [0, 1] })
    expect(defaulted._table).toEqual(sine._table)
  })

  it('copies the coefficient arrays — later mutation has no effect (internal slots)', () => {
    const real = new Float32Array([0, 0.5])
    const imag = new Float32Array([0, 1])
    const wave = new PlecoPeriodicWave(ctx(), { real, imag })
    real.fill(9)
    imag.fill(9)
    const pristine = new PlecoPeriodicWave(ctx(), { real: [0, 0.5], imag: [0, 1] })
    expect(wave._table).toEqual(pristine._table)
  })
})

describe('PlecoOscillatorNode — attribute surface', () => {
  it('defaults: type sine, frequency 440, detune 0, spec node config', () => {
    const osc = new PlecoOscillatorNode(ctx())
    expect(osc.type).toBe('sine')
    expect(osc.frequency.value).toBe(440)
    expect(osc.frequency.defaultValue).toBe(440)
    expect(osc.detune.value).toBe(0)
    expect(osc.detune.defaultValue).toBe(0)
    expect(osc.numberOfInputs).toBe(0)
    expect(osc.numberOfOutputs).toBe(1)
    expect(osc.channelCount).toBe(2)
    expect(osc.channelCountMode).toBe('max')
    expect(osc.channelInterpretation).toBe('speakers')
  })

  it('frequency nominal range is ±Nyquist; detune is ±153600 (≈ 1200·log2(FLT_MAX))', () => {
    const osc = new PlecoOscillatorNode(ctx())
    expect(osc.frequency.minValue).toBe(-NYQUIST)
    expect(osc.frequency.maxValue).toBe(NYQUIST)
    expect(osc.detune.minValue).toBe(-153600)
    expect(osc.detune.maxValue).toBe(153600)
  })

  it('type accepts the four settable OscillatorType values', () => {
    const osc = new PlecoOscillatorNode(ctx())
    for (const t of ['square', 'sawtooth', 'triangle', 'sine']) {
      osc.type = t
      expect(osc.type).toBe(t)
    }
  })

  it('type: invalid enum assignment is silently ignored (WebIDL)', () => {
    const osc = new PlecoOscillatorNode(ctx())
    osc.type = 'noise'
    expect(osc.type).toBe('sine')
  })

  it("type: directly setting 'custom' throws InvalidStateError", () => {
    const osc = new PlecoOscillatorNode(ctx())
    try {
      osc.type = 'custom'
      expect.unreachable('should have thrown')
    } catch (e) {
      expect(e).toBeInstanceOf(DOMException)
      expect(e.name).toBe('InvalidStateError')
    }
    expect(osc.type).toBe('sine')
  })

  it("setPeriodicWave() sets type to 'custom'; type can be set back to a built-in", () => {
    const c = ctx()
    const osc = new PlecoOscillatorNode(c)
    osc.setPeriodicWave(new PlecoPeriodicWave(c, { imag: [0, 1] }))
    expect(osc.type).toBe('custom')
    osc.type = 'triangle'
    expect(osc.type).toBe('triangle')
  })

  it('setPeriodicWave() rejects non-PeriodicWave arguments with TypeError', () => {
    const osc = new PlecoOscillatorNode(ctx())
    expect(() => osc.setPeriodicWave({ _table: new Float32Array(8192) })).toThrow(TypeError)
    expect(() => osc.setPeriodicWave(null)).toThrow(TypeError)
  })
})

describe('PlecoOscillatorNode — OscillatorOptions constructor dictionary', () => {
  it('applies type, frequency, and detune', () => {
    const osc = new PlecoOscillatorNode(ctx(), { type: 'sawtooth', frequency: 220, detune: 100 })
    expect(osc.type).toBe('sawtooth')
    expect(osc.frequency.value).toBe(220)
    expect(osc.detune.value).toBe(100)
  })

  it('null options convert to the empty dictionary (WebIDL) — constructs with defaults', () => {
    const osc = new PlecoOscillatorNode(ctx(), null)
    expect(osc.type).toBe('sine')
    expect(osc.frequency.value).toBe(440)
    expect(osc.detune.value).toBe(0)
  })

  it('invalid type in the dictionary throws TypeError (WebIDL enum in constructor)', () => {
    expect(() => new PlecoOscillatorNode(ctx(), { type: 'noise' })).toThrow(TypeError)
  })

  it("type 'custom' without periodicWave throws InvalidStateError", () => {
    try {
      new PlecoOscillatorNode(ctx(), { type: 'custom' })
      expect.unreachable('should have thrown')
    } catch (e) {
      expect(e).toBeInstanceOf(DOMException)
      expect(e.name).toBe('InvalidStateError')
    }
  })

  it("periodicWave forces type 'custom', overriding any valid type member", () => {
    const c = ctx()
    const wave = new PlecoPeriodicWave(c, { imag: [0, 1] })
    expect(new PlecoOscillatorNode(c, { periodicWave: wave }).type).toBe('custom')
    expect(new PlecoOscillatorNode(c, { periodicWave: wave, type: 'square' }).type).toBe('custom')
  })

  it('a non-PeriodicWave periodicWave member throws TypeError', () => {
    expect(() => new PlecoOscillatorNode(ctx(), { periodicWave: 'sine' })).toThrow(TypeError)
  })

  it('non-finite frequency or detune throws TypeError', () => {
    expect(() => new PlecoOscillatorNode(ctx(), { frequency: NaN })).toThrow(TypeError)
    expect(() => new PlecoOscillatorNode(ctx(), { detune: Infinity })).toThrow(TypeError)
  })

  it('AudioNodeOptions pass through (channelCount et al.)', () => {
    const osc = new PlecoOscillatorNode(ctx(), {
      channelCount: 4,
      channelCountMode: 'explicit',
      channelInterpretation: 'discrete',
    })
    expect(osc.channelCount).toBe(4)
    expect(osc.channelCountMode).toBe('explicit')
    expect(osc.channelInterpretation).toBe('discrete')
  })
})

describe('PlecoOscillatorNode — sine rendering', () => {
  it('renders a 440 Hz sine matching the phase-integral reference', () => {
    const out = renderOsc(256, (c) => {
      const osc = new PlecoOscillatorNode(c)
      osc.start(0)
      return osc
    })
    const ref = sineRef(() => 440, 256)
    for (let n = 0; n < 256; n++) {
      expect(Math.abs(out[n] - ref[n])).toBeLessThan(1e-5)
    }
  })

  it('phase is zero at the exact start time: out[0] = 0 with positive slope', () => {
    const out = renderOsc(128, (c) => {
      const osc = new PlecoOscillatorNode(c)
      osc.start(0)
      return osc
    })
    expect(out[0]).toBe(0)
    expect(out[1]).toBeGreaterThan(0)
  })

  it('a mid-block start renders silence before, phase 0 from the start frame', () => {
    const out = renderOsc(128, (c) => {
      const osc = new PlecoOscillatorNode(c, { frequency: 375 })
      osc.start(64 / SR)
      return osc
    })
    for (let n = 0; n < 64; n++) expect(out[n]).toBe(0)
    expect(out[64]).toBe(0) // sin(0)
    const ref = sineRef(() => 375, 64)
    for (let n = 64; n < 128; n++) {
      expect(Math.abs(out[n] - ref[n - 64])).toBeLessThan(1e-5)
    }
  })

  it('stop() silences from the stop frame and dispatches ended', async () => {
    const c = ctx(128)
    const osc = new PlecoOscillatorNode(c)
    let endedCount = 0
    osc.onended = () => endedCount++
    osc.connect(c.destination)
    osc.start(0)
    osc.stop(64 / SR)
    const out = c.renderSync().getChannelData(0)
    for (let n = 64; n < 128; n++) expect(out[n]).toBe(0)
    expect(out[1]).not.toBe(0)
    await Promise.resolve()
    expect(endedCount).toBe(1)
  })

  it('start() twice throws InvalidStateError (AudioScheduledSourceNode contract)', () => {
    const osc = new PlecoOscillatorNode(ctx())
    osc.start(0)
    expect(() => osc.start(0)).toThrow(/already/)
  })

  it('output is mono and up-mixes to both speaker channels', () => {
    const c = ctx(128, 2)
    const osc = new PlecoOscillatorNode(c)
    osc.connect(c.destination)
    osc.start(0)
    const buf = c.renderSync()
    const l = buf.getChannelData(0)
    const r = buf.getChannelData(1)
    expect(l[10]).not.toBe(0)
    expect(l).toEqual(r)
  })
})

describe('PlecoOscillatorNode — computedOscFrequency (frequency × detune)', () => {
  it('detune of 1200 cents doubles the frequency: 440 + 1200¢ === 880 sample-exact', () => {
    const a = renderOsc(256, (c) => {
      const osc = new PlecoOscillatorNode(c, { frequency: 440, detune: 1200 })
      osc.start(0)
      return osc
    })
    const b = renderOsc(256, (c) => {
      const osc = new PlecoOscillatorNode(c, { frequency: 880 })
      osc.start(0)
      return osc
    })
    expect(a).toEqual(b)
  })

  it('a-rate frequency change mid-block keeps the phase integral continuous', () => {
    const out = renderOsc(128, (c) => {
      const osc = new PlecoOscillatorNode(c)
      osc.frequency.setValueAtTime(375, 0)
      osc.frequency.setValueAtTime(750, 32 / SR)
      osc.start(0)
      return osc
    })
    const ref = sineRef((n) => (n < 32 ? 375 : 750), 128)
    for (let n = 0; n < 128; n++) {
      expect(Math.abs(out[n] - ref[n])).toBeLessThan(1e-5)
    }
  })

  it('frequency is clamped to ±Nyquist: an over-range value renders as Nyquist (silent)', () => {
    const out = renderOsc(128, (c) => {
      const osc = new PlecoOscillatorNode(c)
      osc.frequency.value = 100000 // clamps to 24000 at render — |f| ≥ Nyquist → silence
      osc.start(0)
      return osc
    })
    for (let n = 0; n < 128; n++) expect(out[n]).toBe(0)
  })

  it('computed frequency at or above Nyquist renders silence (detune pushing past the clamp)', () => {
    const out = renderOsc(128, (c) => {
      const osc = new PlecoOscillatorNode(c, { frequency: 20000, detune: 1200 }) // 40 kHz computed
      osc.start(0)
      return osc
    })
    for (let n = 0; n < 128; n++) expect(out[n]).toBe(0)
  })

  it('phase still advances during Nyquist silence (silence-but-phase-advance)', () => {
    const out = renderOsc(128, (c) => {
      const osc = new PlecoOscillatorNode(c)
      osc.frequency.setValueAtTime(NYQUIST, 0) // 0.5 cycles/sample — silent but advancing
      osc.frequency.setValueAtTime(375, 65 / SR) // 65 × 0.5 = 32.5 → resumes at phase 0.5
      osc.start(0)
      return osc
    })
    for (let n = 0; n < 65; n++) expect(out[n]).toBe(0)
    // Resuming at phase 0.5 flips the waveform: sin(π + x) = −sin(x).
    expect(out[66]).toBeLessThan(-0.04)
    const ref = sineRef((n) => (n < 65 ? NYQUIST : 375), 128)
    for (let n = 65; n < 128; n++) {
      expect(Math.abs(out[n] - ref[n])).toBeLessThan(1e-5)
    }
  })
})

describe('PlecoOscillatorNode — built-in waveforms', () => {
  it.each(['sine', 'square', 'sawtooth', 'triangle'])(
    "built-in '%s' equals a PeriodicWave built from its spec Fourier series (normalized)",
    (type) => {
      const builtIn = renderOsc(256, (c) => {
        const osc = new PlecoOscillatorNode(c, { type, frequency: 375 })
        osc.start(0)
        return osc
      })
      const viaWave = renderOsc(256, (c) => {
        const osc = new PlecoOscillatorNode(c, { frequency: 375 })
        osc.setPeriodicWave(
          new PlecoPeriodicWave(c, {
            real: new Float32Array(BUILTIN_SERIES_LENGTH),
            imag: builtinSeries(type, BUILTIN_SERIES_LENGTH),
            disableNormalization: false,
          }),
        )
        osc.start(0)
        return osc
      })
      expect(builtIn).toEqual(viaWave)
    },
  )

  it('square: positive first half-period, negative second (odd function, positive slope at 0)', () => {
    const out = renderOsc(128, (c) => {
      const osc = new PlecoOscillatorNode(c, { type: 'square', frequency: 375 }) // period = 128 frames
      osc.start(0)
      return osc
    })
    expect(out[32]).toBeGreaterThan(0.5) // t = T/4
    expect(out[96]).toBeLessThan(-0.5) // t = 3T/4
    expect(Math.abs(out[32] + out[96])).toBeLessThan(1e-5) // odd symmetry
  })

  it('sawtooth: ramps upward through the first half-period, wraps negative after', () => {
    const out = renderOsc(128, (c) => {
      const osc = new PlecoOscillatorNode(c, { type: 'sawtooth', frequency: 375 })
      osc.start(0)
      return osc
    })
    expect(out[16]).toBeGreaterThan(out[8])
    expect(out[32]).toBeGreaterThan(out[16])
    expect(out[48]).toBeGreaterThan(out[32])
    expect(out[66]).toBeLessThan(0) // just past the wrap at T/2
  })

  it('triangle: peaks near ±1 at T/4 and 3T/4 (normalized)', () => {
    const out = renderOsc(128, (c) => {
      const osc = new PlecoOscillatorNode(c, { type: 'triangle', frequency: 375 })
      osc.start(0)
      return osc
    })
    expect(out[32]).toBeGreaterThan(0.98)
    expect(out[96]).toBeLessThan(-0.98)
    expect(Math.abs(out[0])).toBeLessThan(1e-5)
    expect(Math.abs(out[64])).toBeLessThan(1e-5)
  })

  it('a custom {imag: [0, 1]} PeriodicWave renders identically to the built-in sine', () => {
    const builtIn = renderOsc(256, (c) => {
      const osc = new PlecoOscillatorNode(c)
      osc.start(0)
      return osc
    })
    const custom = renderOsc(256, (c) => {
      const osc = new PlecoOscillatorNode(c, {
        periodicWave: new PlecoPeriodicWave(c, { imag: [0, 1] }),
      })
      osc.start(0)
      return osc
    })
    expect(custom).toEqual(builtIn)
  })
})

describe('PlecoOscillatorNode — band-limited synthesis (anti-aliasing)', () => {
  const BLSR = 8192 // low rate so a 256 Hz square's naïve upper partials would alias

  /** Render `length` mono frames of a `type` oscillator at `freq`, sample rate BLSR. */
  function renderBL(type, freq, length) {
    const c = new PlecoOfflineContext({ numberOfChannels: 1, length, sampleRate: BLSR })
    const osc = new PlecoOscillatorNode(c, { type, frequency: freq })
    osc.connect(c.destination)
    osc.start(0)
    return c.renderSync().getChannelData(0)
  }

  /**
   * Amplitude of the `harmonic`-th partial via a direct DFT bin, given the signal
   * spans `periods` whole fundamental cycles (bin = harmonic·periods). Only valid
   * BELOW the Nyquist bin N/2 — bins above it are conjugate mirror images.
   */
  function harmonicAmp(x, harmonic, periods) {
    const N = x.length
    const k = harmonic * periods
    let re = 0
    let im = 0
    for (let i = 0; i < N; i++) {
      const a = (-2 * Math.PI * k * i) / N
      re += x[i] * Math.cos(a)
      im += x[i] * Math.sin(a)
    }
    return (2 * Math.hypot(re, im)) / N
  }

  it('256 Hz square at 8192 Hz keeps harmonics 1..11 and culls the rest below Nyquist (Chrome band-limit)', () => {
    // period = 8192/256 = 32 frames; 512 frames = 16 whole cycles ⇒ exact DFT bins.
    const out = renderBL('square', 256, 512)
    const periods = 16
    // Kept partials follow the ideal square series b[n] = 4/(nπ), scaled by the
    // shared normalization — present and in the right ratio.
    for (const [h, ideal] of [
      [1, 4 / Math.PI],
      [3, 4 / (3 * Math.PI)],
      [5, 4 / (5 * Math.PI)],
      [7, 4 / (7 * Math.PI)],
      [9, 4 / (9 * Math.PI)],
      [11, 4 / (11 * Math.PI)],
    ]) {
      const amp = harmonicAmp(out, h, periods)
      expect(amp).toBeGreaterThan(0.05)
      // ratio to the fundamental matches the ideal square (band-limit only caps
      // the harmonic count; it does not reshape the retained partials).
      const ratio = amp / harmonicAmp(out, 1, periods)
      expect(Math.abs(ratio - ideal / (4 / Math.PI))).toBeLessThan(1e-3)
    }
    // Harmonics 13 and 15 sit BELOW Nyquist (3328, 3840 Hz < 4096) yet are culled
    // for the mip-map's inter-range headroom — a single 64-harmonic table would
    // keep them AND alias partials 17..63 back on top of these bins. Their being
    // silent proves the synthesis is band-limited, not aliased.
    expect(harmonicAmp(out, 13, periods)).toBeLessThan(1e-4)
    expect(harmonicAmp(out, 15, periods)).toBeLessThan(1e-4)
  })

  it('the harmonic ceiling adapts to pitch: a 128 Hz square keeps partials that 256 Hz culls', () => {
    // Same waveform an octave lower ⇒ twice the sub-Nyquist headroom ⇒ ~twice the
    // partials. period = 64 frames, 512 frames = 8 whole cycles.
    const out = renderBL('square', 128, 512)
    const periods = 8
    // h13, h15, h21, h23 — culled at 256 Hz — are now retained.
    for (const h of [13, 15, 21, 23]) {
      expect(harmonicAmp(out, h, periods)).toBeGreaterThan(0.02)
    }
    // …and the ceiling still bites: h25 and above are culled.
    expect(harmonicAmp(out, 25, periods)).toBeLessThan(1e-4)
    expect(harmonicAmp(out, 27, periods)).toBeLessThan(1e-4)
  })

  it('a high-fundamental square collapses to its fundamental (no aliased partials), amplitude bounded', () => {
    // 1024 Hz at 8192 Hz: only harmonics 1..2 clear the anti-aliasing headroom,
    // and the square has no even partials, so the output reduces to a clean sine.
    // period = 8 frames, 512 frames = 64 whole cycles.
    const out = renderBL('square', 1024, 512)
    const periods = 64
    expect(harmonicAmp(out, 1, periods)).toBeGreaterThan(0.5)
    expect(harmonicAmp(out, 3, periods)).toBeLessThan(1e-4) // 3072 Hz < Nyquist, still culled
    // No aliasing means no runaway: the peak stays at the normalized sine level.
    for (const v of out) expect(Math.abs(v)).toBeLessThanOrEqual(1.1)
  })

  it('the fundamental is NEVER culled to silence, even at very high fundamentals below Nyquist', () => {
    // Regression: the mip-map must not over-cull — a high fundamental (still
    // below the 4096 Hz Nyquist at SR 8192) must retain its fundamental partial.
    for (const f of [1500, 3000, 3900]) {
      const out = renderBL('sine', f, 512)
      const peak = Math.max(...Array.from(out).map((v) => Math.abs(v)))
      expect(peak, `sine ${f}Hz fundamental`).toBeGreaterThan(0.9) // ~1.0, not silenced
    }
  })
})
