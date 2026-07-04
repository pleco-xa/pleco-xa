import { describe, it, expect } from 'vitest'
import { loadFixture, expectClose } from './helpers.js'
import { mfcc } from '../../src/feature/mfcc.js'

function flatten(matrix) {
  const rows = matrix.length
  const cols = matrix[0].length
  const out = new Float64Array(rows * cols)
  for (let r = 0; r < rows; r++) {
    for (let c = 0; c < cols; c++) out[r * cols + c] = matrix[r][c]
  }
  return out
}

describe('golden: mfcc vs committed reference fixture', () => {
  const fx = loadFixture('mfcc')

  for (const c of fx.cases) {
    const { signal, sr, n_mfcc } = c.input
    it(`mfcc(${signal}, n_mfcc=${n_mfcc}) matches reference ground truth`, () => {
      const y = new Float32Array(c.input.y)
      const M = mfcc(y, { sr, n_mfcc })
      const [nMfcc, nFrames] = c.expected_shape
      expect(M.length, 'mfcc rows').toBe(nMfcc)
      expect(M[0].length, 'mfcc frames').toBe(nFrames)
      // MFCCs are dB-scale (values span roughly [-600, +100] here), so the
      // tolerance is absolute, sized against that range: achieved max
      // deviation through the full y → f32 stft → mel → power_to_db → DCT
      // pipeline is 8.7e-5 abs (worst of both signals). atol 1e-3 gives
      // ~10x headroom while staying at 0.0001% of the value range.
      expectClose(flatten(M), c.expected, { label: 'mfcc', rtol: 0, atol: 1e-3 })
    })
  }
})

describe('feature/mfcc failure paths and options', () => {
  it('throws when neither y nor S is provided', () => {
    expect(() => mfcc(null, {})).toThrow(/either y or S/)
  })

  it('throws on negative lifter', () => {
    expect(() => mfcc(null, { S: [[0, 0]], lifter: -1 })).toThrow(/lifter/)
  })

  it('throws on unsupported dct_type', () => {
    expect(() => mfcc(null, { S: [[0, 0]], dct_type: 3 })).toThrow(/dct_type/)
  })

  it('applies reference lifter weights: 1 + (L/2)·sin(π(k+1)/L)', () => {
    // Log-mel with a single frame: column of ones ⇒ mfcc = DCT-II ortho of ones,
    // which is [sqrt(N), 0, 0, ...]; lifter scales row k by the (k+1) weight.
    const nMels = 8
    const S = Array.from({ length: nMels }, () => [1])
    const L = 4
    const base = mfcc(null, { S, n_mfcc: 4 })
    const lifted = mfcc(null, { S, n_mfcc: 4, lifter: L })
    for (let k = 0; k < 4; k++) {
      const w = 1 + (L / 2) * Math.sin((Math.PI * (k + 1)) / L)
      expect(lifted[k][0]).toBeCloseTo(base[k][0] * w, 12)
    }
  })
})
