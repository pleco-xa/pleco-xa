import { describe, it, expect } from 'vitest'
import { rqa } from '../../src/sequence/rqa.js'
import { loadFixture } from './helpers.js'

const fixture = loadFixture('rqa')

/** Reshape a flat row-major array into nested rows. */
function reshape(flat, [rows, cols]) {
  const out = []
  for (let i = 0; i < rows; i++) {
    out.push(flat.slice(i * cols, (i + 1) * cols))
  }
  return out
}

describe('rqa parity vs librosa 0.11 (librosa.sequence.rqa)', () => {
  for (const c of fixture.cases) {
    const { name, R, shape, gap_onset, gap_extend, knight_moves } = c.input

    it(`${name}: exact path agreement`, () => {
      const sim = reshape(R, shape)
      const { path } = rqa(sim, {
        gapOnset: gap_onset,
        gapExtend: gap_extend,
        knightMoves: knight_moves,
        backtrack: true,
      })
      expect(path).toEqual(c.expected_path)
    })

    it(`${name}: score max matches`, () => {
      const sim = reshape(R, shape)
      const { score } = rqa(sim, {
        gapOnset: gap_onset,
        gapExtend: gap_extend,
        knightMoves: knight_moves,
        backtrack: false,
      })
      let max = -Infinity
      for (const row of score) {
        for (const v of row) if (v > max) max = v
      }
      expect(max).toBeCloseTo(c.expected_score_max, 10)
    })
  }

  it('throws on negative gap penalties', () => {
    expect(() => rqa([[1, 0], [0, 1]], { gapOnset: -1 })).toThrow()
    expect(() => rqa([[1, 0], [0, 1]], { gapExtend: -1 })).toThrow()
  })

  it('returns an empty path for an all-zero similarity matrix', () => {
    const { path } = rqa([
      [0, 0, 0],
      [0, 0, 0],
      [0, 0, 0],
    ])
    expect(path).toEqual([])
  })
})
