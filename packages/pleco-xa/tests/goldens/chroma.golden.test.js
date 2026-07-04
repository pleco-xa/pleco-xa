import { describe, it, expect } from 'vitest'
import { loadFixture, expectClose } from './helpers.js'
import { chroma } from '../../src/filters/index.js'
import { chroma_stft, foldLogSpectrumToChroma } from '../../src/feature/chroma.js'

function flatten(matrix) {
  const rows = matrix.length
  const cols = matrix[0].length
  const out = new Float64Array(rows * cols)
  for (let r = 0; r < rows; r++) {
    for (let c = 0; c < cols; c++) out[r * cols + c] = matrix[r][c]
  }
  return out
}

describe('golden: chroma vs committed reference fixture (filters.chroma + feature.chroma_stft)', () => {
  const fx = loadFixture('chroma')

  for (const c of fx.cases) {
    if (c.input.signal === '__filterbank__') {
      it('filters.chroma(sr=22050, n_fft=2048) matches the reference filterbank', () => {
        const fb = chroma({ sr: c.input.sr, n_fft: c.input.n_fft })
        const [nChroma, nFreq] = c.expected_shape
        expect(fb.length, 'chroma rows').toBe(nChroma)
        expect(fb[0].length, 'freq bins').toBe(nFreq)
        // Deterministic filter math; only f32 quantization separates us
        // (achieved: 5.9e-8 rel / 3.0e-8 abs). Gaussian tails underflow f32
        // in the fixture — atol covers those.
        expectClose(flatten(fb), c.expected, {
          label: 'chroma-fb',
          rtol: 1e-6,
          atol: 1e-7,
        })
      })
    } else {
      const { signal, sr, n_fft, hop_length } = c.input
      it(`chroma_stft(${signal}) matches reference ground truth (incl. estimated tuning)`, () => {
        const y = new Float32Array(c.input.y)
        const C = chroma_stft(y, { sr, n_fft, hop_length })
        const [nChroma, nFrames] = c.expected_shape
        expect(C.length, 'chroma rows').toBe(nChroma)
        expect(C[0].length, 'frames').toBe(nFrames)
        // Full y-path incl. piptrack tuning estimation (must land on
        // the reference's 0.02 histogram bin). Achieved: 1.8e-6 rel / 2.5e-7 abs.
        expectClose(flatten(C), c.expected, {
          label: 'chroma_stft',
          rtol: 1e-4,
          atol: 1e-5,
        })
      })
    }
  }
})

describe('feature/chroma failure paths', () => {
  it('chroma_stft throws when neither y nor S is provided', () => {
    expect(() => chroma_stft(null, {})).toThrow(/either y or S/)
  })

  it('filters.chroma validates sr and n_fft', () => {
    expect(() => chroma({ sr: 0, n_fft: 2048 })).toThrow(/sr > 0/)
  })

  it('foldLogSpectrumToChroma rejects bins_per_octave !== n_chroma', () => {
    expect(() => foldLogSpectrumToChroma([[0]], 12, 36)).toThrow(/must equal/)
  })
})
