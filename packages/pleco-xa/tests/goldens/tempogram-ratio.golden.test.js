import { describe, it, expect } from 'vitest'
import { loadFixture, expectClose } from './helpers.js'
import { tempogram_ratio, tempogram } from '../../src/scripts/xa-tempogram.js'
import { tempo_frequencies } from '../../src/scripts/xa-convert.js'

/**
 * Golden gate against the committed reference fixture
 * (tools/goldens/tempogram_ratio.json):
 *
 *   tgr = reference tempogram_ratio(y=y, sr=22050, hop_length=512)
 *
 * with the default Prockup'15 13-factor table, expected shape [13, 173].
 *
 * The feeding tempogram is itself golden-gated (tempo_beats.json), so any
 * slack there is inherited. Measured here on the fixture signal, that slack
 * is negligible: max abs deviation 7.6e-8, max rel deviation 2.5e-7 for the
 * energy-bearing bins — ~4 orders of magnitude inside the 2e-3 gate below.
 * (Every element passes on atol alone: 7.6e-8 < 2e-3.)
 *
 * DIVERGENCE NOTE (verified, see module JSDoc): the exported
 * xa-harmonic.f0_harmonics does NOT reproduce the reference on this grid —
 * the tempo axis is descending with a +Inf head, which that helper brackets
 * ascending-in-place and fills as out-of-bounds, returning all-zeros. So
 * tempogram_ratio interpolates with its own reference-faithful static-grid
 * routine (filter finite -> sort ascending -> linear interp -> fill_value ->
 * nan_to_num), not the shared f0_harmonics.
 */
function flatten(matrix) {
  const rows = matrix.length
  const cols = matrix[0].length
  const out = new Float64Array(rows * cols)
  for (let r = 0; r < rows; r++) {
    for (let c = 0; c < cols; c++) out[r * cols + c] = matrix[r][c]
  }
  return out
}

describe('golden: tempogram_ratio vs committed reference fixture', () => {
  const fx = loadFixture('tempogram_ratio')
  const c = fx.cases[0]
  const y = new Float32Array(c.input.y)
  const sr = c.input.sr
  const hop_length = c.input.hop_length

  it('matches reference shape [13, 173]', () => {
    const out = tempogram_ratio({ y, sr, hop_length })
    expect(out.length, 'n_factors').toBe(c.expected_shape[0])
    expect(out[0].length, 'n_frames').toBe(c.expected_shape[1])
  })

  it('matches reference values (rtol 2e-3, atol 2e-3)', () => {
    const out = tempogram_ratio({ y, sr, hop_length })
    expectClose(flatten(out), c.expected, {
      label: 'tempogram_ratio',
      rtol: 2e-3,
      atol: 2e-3,
    })
  })

  it('returns typed-array rows (Float64Array first-class)', () => {
    const out = tempogram_ratio({ y, sr, hop_length })
    expect(out[0]).toBeInstanceOf(Float64Array)
  })

  it('accepts a pre-computed tempogram and reproduces the y-path result', () => {
    const tg = tempogram(y, sr, null, hop_length, 384, true, 'hann', Infinity)
    const fromTg = tempogram_ratio({ tg, sr, hop_length })
    const fromY = tempogram_ratio({ y, sr, hop_length })
    expect(fromTg.length).toBe(fromY.length)
    for (let h = 0; h < fromTg.length; h++) {
      expectClose(fromTg[h], fromY[h], { label: `tg-path row ${h}`, rtol: 0, atol: 0 })
    }
  })

  it('accepts caller-supplied freqs (tempo_frequencies) identically', () => {
    const tg = tempogram(y, sr, null, hop_length, 384, true, 'hann', Infinity)
    const freqs = tempo_frequencies(tg.length, hop_length, sr)
    const withFreqs = tempogram_ratio({ tg, sr, hop_length, freqs })
    const withoutFreqs = tempogram_ratio({ tg, sr, hop_length })
    for (let h = 0; h < withFreqs.length; h++) {
      expectClose(withFreqs[h], withoutFreqs[h], { label: `freqs row ${h}`, rtol: 0, atol: 0 })
    }
  })

  it('aggregate collapses the time axis to one value per factor', () => {
    const mean = (row) => {
      let s = 0
      for (let i = 0; i < row.length; i++) s += row[i]
      return s / row.length
    }
    const full = tempogram_ratio({ y, sr, hop_length })
    const agg = tempogram_ratio({ y, sr, hop_length, aggregate: mean })
    expect(agg).toBeInstanceOf(Float64Array)
    expect(agg.length).toBe(full.length)
    for (let h = 0; h < full.length; h++) {
      expect(agg[h]).toBeCloseTo(mean(full[h]), 12)
    }
  })
})

describe('tempogram_ratio failure paths (never fabricate)', () => {
  const smallTg = Array.from({ length: 8 }, () => new Float64Array(4))

  it('throws on non-positive sr', () => {
    expect(() => tempogram_ratio({ tg: smallTg, sr: 0 })).toThrow(/sr=/)
  })

  it('throws on non-integer hop_length', () => {
    expect(() => tempogram_ratio({ tg: smallTg, hop_length: 1.5 })).toThrow(/hop_length/)
  })

  it('throws on non-positive start_bpm / std_bpm', () => {
    expect(() => tempogram_ratio({ tg: smallTg, start_bpm: 0 })).toThrow(/start_bpm/)
    expect(() => tempogram_ratio({ tg: smallTg, std_bpm: -1 })).toThrow(/std_bpm/)
  })

  it('throws on unsupported interpolation kind', () => {
    expect(() => tempogram_ratio({ tg: smallTg, kind: 'cubic' })).toThrow(/kind=/)
  })

  it('throws when aggregate is not a function', () => {
    expect(() => tempogram_ratio({ tg: smallTg, aggregate: 'mean' })).toThrow(/aggregate/)
  })

  it('throws on a malformed tempogram', () => {
    expect(() => tempogram_ratio({ tg: [new Float64Array(4)] })).toThrow(/n_lags>=2/)
  })

  it('throws on freqs length mismatch', () => {
    expect(() => tempogram_ratio({ tg: smallTg, freqs: new Float64Array(3) })).toThrow(/freqs length/)
  })

  it('throws on bpm length mismatch', () => {
    expect(() => tempogram_ratio({ tg: smallTg, bpm: new Float64Array(99) })).toThrow(/bpm length/)
  })

  it('throws when neither y, onset_envelope, nor tg is provided', () => {
    expect(() => tempogram_ratio({})).toThrow(/y or onset_envelope/)
  })
})
