import { describe, it, expect } from 'vitest'
import { loadFixture, expectClose } from './helpers.js'
import { fft, ifft, stft, istft } from '../../src/scripts/xa-fft.js'

describe('unit: fft/ifft round-trip (the imaginary-discard regression)', () => {
  it('ifft(fft(x)) recovers a real signal', () => {
    const x = new Float32Array(512)
    for (let i = 0; i < x.length; i++) x[i] = Math.sin((2 * Math.PI * 13 * i) / 512) + 0.5 * Math.cos((2 * Math.PI * 40 * i) / 512)
    const back = ifft(fft(x))
    let maxErr = 0
    for (let i = 0; i < x.length; i++) {
      maxErr = Math.max(maxErr, Math.abs(back[i].real - x[i]), Math.abs(back[i].imag))
    }
    expect(maxErr).toBeLessThan(1e-5)
  })

  it('ifft preserves complex (nonzero-phase) input — not just the real part', () => {
    // A spectrum whose inverse depends on imaginary components:
    // start from a complex time signal, fft it, invert, compare.
    const N = 64
    const sig = Array.from({ length: N }, (_, i) => ({
      real: Math.cos((2 * Math.PI * 5 * i) / N),
      imag: Math.sin((2 * Math.PI * 3 * i) / N),
    }))
    // forward transform of complex input via ifft identity: fft(x) = N * conj(ifft(conj(x)))
    const conj = sig.map(b => ({ real: b.real, imag: -b.imag }))
    const inv = ifft(conj)
    const spec = inv.map(b => ({ real: b.real * N, imag: -b.imag * N }))
    const back = ifft(spec)
    let maxErr = 0
    for (let i = 0; i < N; i++) {
      maxErr = Math.max(maxErr, Math.abs(back[i].real - sig[i].real), Math.abs(back[i].imag - sig[i].imag))
    }
    expect(maxErr).toBeLessThan(1e-6)
  })
})

describe('parity: stft magnitude vs librosa', () => {
  const fx = loadFixture('stft')
  for (const c of fx.cases) {
    it(`stft(${c.input.signal}) magnitudes match librosa (n_fft=512, hop=128)`, () => {
      const y = new Float32Array(c.input.y)
      const D = stft(y, c.input.n_fft, c.input.hop_length, null, 'hann', true, 'constant')
      const [nFreq, nFrames] = c.expected_shape
      expect(D.length, 'freq bins').toBe(nFreq)
      expect(D[0].length, 'frames').toBe(nFrames)
      const mag = new Float64Array(nFreq * nFrames)
      for (let f = 0; f < nFreq; f++) {
        for (let t = 0; t < nFrames; t++) {
          const b = D[f][t]
          mag[f * nFrames + t] = Math.hypot(b.real, b.imag)
        }
      }
      // f32 accumulation over 512-point frames: allow small absolute slack
      expectClose(mag, c.expected_mag, { label: 'stft-mag', rtol: 2e-3, atol: 2e-3 })
    })
  }
})

describe('parity: istft(stft(y)) round-trip', () => {
  const fx = loadFixture('istft_roundtrip')
  const c = fx.cases[0]
  it('reconstructs the sine within tolerance', () => {
    const y = new Float32Array(c.input.y)
    const D = stft(y, c.input.n_fft, c.input.hop_length, null, 'hann', true, 'constant')
    const yHat = istft(D, c.input.hop_length, null, 'hann', true, y.length)
    let maxErr = 0
    for (let i = 0; i < y.length; i++) maxErr = Math.max(maxErr, Math.abs(yHat[i] - y[i]))
    expect(maxErr).toBeLessThan(1e-3)
  })
})
