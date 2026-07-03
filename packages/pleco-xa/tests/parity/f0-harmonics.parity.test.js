import { describe, it } from 'vitest'
import { loadFixture, expectClose } from './helpers.js'
import { f0_harmonics } from '../../src/scripts/xa-harmonic.js'

function reshape(flat, [rows, cols]) {
  const m = []
  for (let r = 0; r < rows; r++) m.push(flat.slice(r * cols, (r + 1) * cols))
  return m
}

describe('parity: f0_harmonics (scalar/array f0, finite-freq filtering)', () => {
  const fx = loadFixture('f0_harmonics')
  for (const c of fx.cases) {
    it(`${c.input.name} matches librosa`, () => {
      const x = reshape(c.input.x, c.input.x_shape)
      // fixture stores non-finite freqs as null (JSON) — restore ±Inf.
      const freqs = c.input.freqs.map((v) => (v === null ? Infinity : v))
      const out = f0_harmonics(x, c.input.f0, freqs, c.input.harmonics)
      const flat = out.flat()
      expectClose(flat, c.expected, { label: c.input.name, rtol: 1e-5, atol: 1e-5 })
    })
  }
})
