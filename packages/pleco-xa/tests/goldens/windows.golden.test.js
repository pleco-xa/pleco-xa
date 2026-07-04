import { describe, it } from 'vitest'
import { loadFixture, expectClose } from './helpers.js'
import { hann_window, hamming_window, blackman_window } from '../../src/scripts/xa-fft.js'

const GEN = { hann: hann_window, hamming: hamming_window, blackman: blackman_window }

describe('golden: periodic windows (fftbins=true convention)', () => {
  const fx = loadFixture('windows')
  for (const c of fx.cases) {
    const { window, n } = c.input
    it(`${window}(${n}) matches reference ground truth`, () => {
      expectClose(GEN[window](n), c.expected, { label: `${window}(${n})`, rtol: 1e-6, atol: 1e-7 })
    })
  }
})
