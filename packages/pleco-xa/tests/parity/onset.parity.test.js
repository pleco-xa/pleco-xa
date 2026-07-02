import { describe, it, expect } from 'vitest'
import { loadFixture, expectClose } from './helpers.js'
import { onset_strength } from '../../src/scripts/xa-onset.js'

describe('parity: onset_strength vs librosa.onset.onset_strength', () => {
  const fx = loadFixture('onset_strength')
  for (const c of fx.cases) {
    const { signal, sr } = c.input
    it(`onset_strength(${signal}) matches librosa defaults (hop=512, mel log-power flux)`, () => {
      const y = new Float32Array(c.input.y)
      const env = onset_strength(y, { sr })
      expect(env.length, 'envelope length').toBe(c.expected.length)
      // Log-power differences of f32 mel spectra; measured max abs dev ~6e-6
      expectClose(env, c.expected, {
        label: 'onset-env',
        rtol: 1e-4,
        atol: 1e-5,
      })
    })

    it(`onset_strength(${signal}) accepts positional (y, sr, hop) call style`, () => {
      const y = new Float32Array(c.input.y)
      const env = onset_strength(y, sr, 512)
      expectClose(env, c.expected, {
        label: 'onset-env-positional',
        rtol: 1e-4,
        atol: 1e-5,
      })
    })
  }

  it('lag padding produces structural zeros at the head (lag + n_fft/(2*hop))', () => {
    const c = fx.cases[0]
    const env = onset_strength(new Float32Array(c.input.y), { sr: c.input.sr })
    // lag=1 + 2048 // (2*512) = 3 leading zeros minimum
    expect(env[0]).toBe(0)
    expect(env[1]).toBe(0)
    expect(env[2]).toBe(0)
  })
})
