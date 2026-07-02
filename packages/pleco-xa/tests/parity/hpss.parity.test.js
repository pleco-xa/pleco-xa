import { describe, it, expect } from 'vitest'
import { loadFixture, expectClose } from './helpers.js'
import { hpss, softmask } from '../../src/decompose/index.js'
import { hpss as effectsHpss, harmonic, percussive } from '../../src/effects/index.js'
import { stft } from '../../src/scripts/xa-fft.js'

const fx = loadFixture('hpss')
const c = fx.cases[0]

function magnitudeSpectrogram() {
  const y = new Float32Array(c.input.y)
  const D = stft(y, c.input.n_fft, c.input.hop_length, null, 'hann', true, 'constant')
  return D.map((row) => Float64Array.from(row, (b) => Math.hypot(b.real, b.imag)))
}

function flatten(M) {
  const nFreq = M.length
  const nTime = M[0].length
  const out = new Float64Array(nFreq * nTime)
  for (let f = 0; f < nFreq; f++) {
    for (let t = 0; t < nTime; t++) out[f * nTime + t] = M[f][t]
  }
  return out
}

describe('parity: decompose.hpss vs librosa (magnitude S, n_fft=512, hop=128)', () => {
  const S = magnitudeSpectrogram()
  const [nFreq, nTime] = c.expected_shape

  it('input spectrogram has the fixture shape', () => {
    expect(S.length).toBe(nFreq)
    expect(S[0].length).toBe(nTime)
  })

  it('default margin: H and P match librosa (masked components)', () => {
    const { harmonic: H, percussive: P } = hpss(S)
    // achieved worst abs deviation: 1.61e-5 (inherits stft float32 parity)
    expectClose(flatten(H), c.H, { rtol: 1e-3, atol: 1e-4, label: 'hpss-H' })
    expectClose(flatten(P), c.P, { rtol: 1e-3, atol: 1e-4, label: 'hpss-P' })
  })

  it('margin=2.0: H and P match librosa', () => {
    const { harmonic: H, percussive: P } = hpss(S, { margin: 2.0 })
    // achieved worst abs deviation: 1.41e-5
    expectClose(flatten(H), c.H_margin2, { rtol: 1e-3, atol: 1e-4, label: 'hpss-H-margin2' })
    expectClose(flatten(P), c.P_margin2, { rtol: 1e-3, atol: 1e-4, label: 'hpss-P-margin2' })
  })

  it('H + P reconstructs S exactly at margin=1 (masked components, not raw medians)', () => {
    const { harmonic: H, percussive: P } = hpss(S)
    let worst = 0
    for (let f = 0; f < nFreq; f++) {
      for (let t = 0; t < nTime; t++) {
        worst = Math.max(worst, Math.abs(H[f][t] + P[f][t] - S[f][t]))
      }
    }
    expect(worst).toBeLessThan(1e-9)
  })

  it('mask=true returns masks in [0, 1] that sum to 1 at margin=1', () => {
    const { harmonic: mH, percussive: mP } = hpss(S, { mask: true })
    for (let f = 0; f < nFreq; f += 16) {
      for (let t = 0; t < nTime; t += 8) {
        expect(mH[f][t]).toBeGreaterThanOrEqual(0)
        expect(mH[f][t]).toBeLessThanOrEqual(1)
        expect(mH[f][t] + mP[f][t]).toBeCloseTo(1, 9)
      }
    }
  })

  it('throws on margin < 1 and on empty input', () => {
    expect(() => hpss(S, { margin: 0.5 })).toThrow()
    expect(() => hpss([])).toThrow()
  })

  it('complex input: components carry the original phase (H+P ≈ D)', () => {
    const y = new Float32Array(c.input.y)
    const D = stft(y, c.input.n_fft, c.input.hop_length, null, 'hann', true, 'constant')
    const { harmonic: Dh, percussive: Dp } = hpss(D)
    let worst = 0
    for (let f = 0; f < D.length; f += 8) {
      for (let t = 0; t < D[0].length; t += 4) {
        worst = Math.max(
          worst,
          Math.abs(Dh[f][t].real + Dp[f][t].real - D[f][t].real),
          Math.abs(Dh[f][t].imag + Dp[f][t].imag - D[f][t].imag),
        )
      }
    }
    expect(worst).toBeLessThan(1e-9)
  })
})

describe('unit: softmask (librosa.util.softmask semantics)', () => {
  it('matches the librosa docstring example (power=2)', () => {
    const X = [[2, 2, 2], [2, 2, 2], [2, 2, 2]]
    const Xref = [[0, 0, 1], [1, 1, 1], [4, 2, 1]]
    const m = softmask(X, Xref, { power: 2 })
    const expected = [[1, 1, 0.8], [0.8, 0.8, 0.8], [0.2, 0.5, 0.8]]
    for (let i = 0; i < 3; i++) {
      for (let j = 0; j < 3; j++) expect(m[i][j]).toBeCloseTo(expected[i][j], 6)
    }
  })

  it('power=Infinity gives a hard mask with ties favoring the reference', () => {
    const m = softmask([[2, 1, 0.5]], [[1, 1, 1]], { power: Infinity })
    expect(Array.from(m[0])).toEqual([1, 0, 0])
  })

  it('throws on negative input and non-positive power', () => {
    expect(() => softmask([[-1]], [[1]], {})).toThrow()
    expect(() => softmask([[1]], [[1]], { power: 0 })).toThrow()
  })
})

describe('parity: waveform-level effects.hpss (stft → mask → istft)', () => {
  const y = new Float32Array(c.input.y)
  const opts = { n_fft: c.input.n_fft, hop_length: c.input.hop_length }

  it('harmonic + percussive ≈ y with matched length', () => {
    const { harmonic: yh, percussive: yp } = effectsHpss(y, opts)
    expect(yh.length).toBe(y.length)
    expect(yp.length).toBe(y.length)
    // H+P == D at margin 1, so istft(H)+istft(P) reconstructs y (within the
    // parity-gated istft round-trip error; edges of the OLA are the loosest)
    let worst = 0
    for (let i = c.input.n_fft; i < y.length - c.input.n_fft; i++) {
      worst = Math.max(worst, Math.abs(yh[i] + yp[i] - y[i]))
    }
    expect(worst).toBeLessThan(1e-3)
  })

  it('harmonic()/percussive() agree with hpss() components', () => {
    const { harmonic: yh, percussive: yp } = effectsHpss(y, opts)
    const h = harmonic(y, opts)
    const p = percussive(y, opts)
    expect(h.length).toBe(y.length)
    expect(p.length).toBe(y.length)
    for (let i = 0; i < y.length; i += 997) {
      expect(h[i]).toBeCloseTo(yh[i], 9)
      expect(p[i]).toBeCloseTo(yp[i], 9)
    }
  })
})
