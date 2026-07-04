import { describe, it, expect } from 'vitest'
import { loadFixture, expectClose } from './helpers.js'
import {
  trim,
  split,
  preemphasis,
  deemphasis,
  remix,
  phase_vocoder,
  time_stretch,
  pitch_shift,
} from '../../src/effects/index.js'
import { stft } from '../../src/scripts/xa-fft.js'

describe('golden: effects.trim / effects.split vs committed reference fixtures', () => {
  const fx = loadFixture('effects')

  it('trim returns reference-exact indices (top_db=30)', () => {
    const c = fx.cases.find((k) => k.input.fn === 'trim')
    const y = new Float32Array(c.input.y)
    const [yTrimmed, index] = trim(y, { top_db: c.input.top_db })
    expect(index).toEqual(c.expected_index)
    expect(yTrimmed.length).toBe(c.expected_index[1] - c.expected_index[0])
    // the slice really is y[start:end]
    expect(yTrimmed[0]).toBe(y[index[0]])
    expect(yTrimmed[yTrimmed.length - 1]).toBe(y[index[1] - 1])
  })

  it('split returns reference-exact intervals (top_db=30)', () => {
    const c = fx.cases.find((k) => k.input.fn === 'split')
    const y = new Float32Array(c.input.y)
    expect(split(y, { top_db: c.input.top_db })).toEqual(c.expected_intervals)
  })

  it('trim of a silent signal (explicit ref) is the empty slice, not the full signal', () => {
    const y = new Float32Array(4096) // all zeros
    const [yTrimmed, index] = trim(y, { top_db: 60, ref: 1.0 })
    expect(index).toEqual([0, 0])
    expect(yTrimmed.length).toBe(0)
    expect(split(y, { top_db: 60, ref: 1.0 })).toEqual([])
  })
})

describe('golden: effects.preemphasis vs committed reference fixture', () => {
  const fx = loadFixture('effects')

  it('matches the reference exactly (coef=0.97, default zi=2*y[0]-y[1])', () => {
    const c = fx.cases.find((k) => k.input.fn === 'preemphasis')
    const y = new Float32Array(c.input.y)
    const out = preemphasis(y, { coef: c.input.coef })
    // achieved max abs deviation: 5.96e-8 (float32 rounding)
    expectClose(out, c.expected, { rtol: 1e-5, atol: 1e-6, label: 'preemphasis' })
  })

  it('deemphasis(preemphasis(x)) round-trips (reference guarantee)', () => {
    const x = new Float32Array(2000)
    for (let i = 0; i < x.length; i++) {
      x[i] = Math.sin((2 * Math.PI * 13 * i) / 512) + 0.3 * Math.cos((2 * Math.PI * 111 * i) / 512)
    }
    const back = deemphasis(preemphasis(x))
    let maxErr = 0
    for (let i = 0; i < x.length; i++) maxErr = Math.max(maxErr, Math.abs(back[i] - x[i]))
    expect(maxErr).toBeLessThan(1e-4)
  })

  it('block streaming chains via zf like the reference', () => {
    const x = new Float32Array(1500)
    for (let i = 0; i < x.length; i++) x[i] = Math.sin((2 * Math.PI * 7 * i) / 256)
    const whole = preemphasis(x)
    const [head, zf] = preemphasis(x.slice(0, 700), { return_zf: true })
    const tail = preemphasis(x.slice(700), { zi: zf })
    for (let i = 0; i < 700; i++) expect(head[i]).toBeCloseTo(whole[i], 6)
    for (let i = 0; i < tail.length; i++) expect(tail[i]).toBeCloseTo(whole[700 + i], 6)
  })
})

describe('golden: phase_vocoder vs committed reference fixture (n_fft=512, hop=128)', () => {
  const fx = loadFixture('phase_vocoder')

  for (const c of fx.cases) {
    it(`rate=${c.input.rate}: shape exact, magnitudes within 1e-3, complex within 1e-3 of spectral peak`, () => {
      const y = new Float32Array(c.input.y)
      const D = stft(y, c.input.n_fft, c.input.hop_length, null, 'hann', true, 'constant')
      const out = phase_vocoder(D, c.input.rate, {
        hop_length: c.input.hop_length,
        n_fft: c.input.n_fft,
      })

      const [nFreq, nSteps] = c.expected_shape
      expect(out.length, 'freq bins').toBe(nFreq)
      expect(out[0].length, 'time steps').toBe(nSteps)

      let peak = 0
      for (let i = 0; i < c.expected_real.length; i++) {
        peak = Math.max(peak, Math.hypot(c.expected_real[i], c.expected_imag[i]))
      }

      // Per-bin magnitude is the drift-free quantity: gate at rtol=atol=1e-3.
      // Achieved worst ratio: 9.3e-4 (both rates).
      // Complex values inherit accumulated phase; float32 FFT angle noise
      // (~6e-6 rad/frame) drifts linearly and is chaotic at noise-floor bins,
      // so the complex gate is |Δz| <= 1e-3*peak + 1e-3*|z|.
      // Achieved worst |Δz|: 6.1e-2 = 4.9e-4 of peak (rate 0.5),
      //                      5.8e-2 = 4.6e-4 of peak (rate 2.0).
      let worstMag = { ratio: 0 }
      let worstCpx = { ratio: 0 }
      for (let f = 0; f < nFreq; f++) {
        for (let t = 0; t < nSteps; t++) {
          const i = f * nSteps + t
          const er = c.expected_real[i]
          const ei = c.expected_imag[i]
          const emag = Math.hypot(er, ei)
          const gmag = Math.hypot(out[f][t].real, out[f][t].imag)

          const magRatio = Math.abs(gmag - emag) / (1e-3 + 1e-3 * emag)
          if (magRatio > worstMag.ratio) worstMag = { ratio: magRatio, f, t }

          const dev = Math.hypot(out[f][t].real - er, out[f][t].imag - ei)
          const cpxRatio = dev / (1e-3 * peak + 1e-3 * emag)
          if (cpxRatio > worstCpx.ratio) worstCpx = { ratio: cpxRatio, f, t, dev }
        }
      }
      expect(worstMag.ratio, `magnitude worst offender at f=${worstMag.f},t=${worstMag.t}`).toBeLessThan(1)
      expect(worstCpx.ratio, `complex worst offender at f=${worstCpx.f},t=${worstCpx.t} (|dz|=${worstCpx.dev})`).toBeLessThan(1)
    })
  }

  it('throws on rate <= 0', () => {
    const D = [[{ real: 1, imag: 0 }, { real: 0, imag: 1 }]]
    expect(() => phase_vocoder(D, 0)).toThrow()
    expect(() => phase_vocoder(D, -1)).toThrow()
  })
})

describe('golden: time_stretch output contract', () => {
  const fx = loadFixture('phase_vocoder')
  const y = new Float32Array(fx.cases[0].input.y)

  for (const rate of [0.5, 2.0, 1.37]) {
    it(`rate=${rate}: length == round(n/rate) and all samples finite`, () => {
      const out = time_stretch(y, rate)
      expect(out.length).toBe(Math.round(y.length / rate))
      for (let i = 0; i < out.length; i++) {
        if (!Number.isFinite(out[i])) {
          expect.fail(`non-finite sample at ${i}: ${out[i]}`)
        }
      }
    })
  }

  it('throws on rate <= 0', () => {
    expect(() => time_stretch(y, 0)).toThrow()
    expect(() => time_stretch(y, -0.5)).toThrow()
  })

  it('pitch_shift preserves duration and validates bins_per_octave', () => {
    const out = pitch_shift(y, 22050, 3)
    expect(out.length).toBe(y.length)
    expect(() => pitch_shift(y, 22050, 3, { bins_per_octave: 0 })).toThrow()
    expect(() => pitch_shift(y, 22050, 3, { bins_per_octave: 1.5 })).toThrow()
  })
})

describe('unit: remix preserves caller order (the beat-reversal contract)', () => {
  it('reversed intervals actually reverse the audio (align_zeros=false)', () => {
    const y = new Float32Array(200)
    for (let i = 0; i < 200; i++) y[i] = i
    const out = remix(y, [[100, 200], [0, 100]], { align_zeros: false })
    expect(out.length).toBe(200)
    expect(out[0]).toBe(100) // second half first
    expect(out[99]).toBe(199)
    expect(out[100]).toBe(0) // first half second
    expect(out[199]).toBe(99)
  })

  it('align_zeros=true (default) snaps to zero crossings without reordering', () => {
    // 4 cycles of a sine; intervals given in reversed order must stay reversed
    const y = new Float32Array(400)
    for (let i = 0; i < 400; i++) y[i] = Math.sin((2 * Math.PI * i) / 100)
    const out = remix(y, [[200, 400], [0, 200]])
    expect(out.length).toBeGreaterThan(0)
    // first output sample comes from the [200, 400] slice region, snapped to a
    // zero crossing — i.e. remix did NOT sort the intervals back
    expect(Math.abs(out[0])).toBeLessThan(0.07)
    // energy is preserved to within crossing-snap jitter
    expect(out.length).toBeGreaterThan(390)
    expect(out.length).toBeLessThanOrEqual(400)
  })

  it('throws on out-of-bounds intervals', () => {
    const y = new Float32Array(100)
    expect(() => remix(y, [[0, 101]], { align_zeros: false })).toThrow()
    expect(() => remix(y, [[-1, 50]], { align_zeros: false })).toThrow()
  })
})
