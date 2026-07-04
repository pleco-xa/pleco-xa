import { describe, it, expect } from 'vitest'
import { pyin } from '../../src/scripts/xa-pitch.js'
import { loadFixture } from './helpers.js'

const fixture = loadFixture('pyin')

// Generation parameters of the committed reference fixture (pyin.json).
const fmin = 80
const fmax = 500
const frame_length = 2048
const hop_length = 512

/** Frames the reference is confident about — allow the two 220↔330 boundary
 *  frames and the first/last silence-onset frame to differ (pyin is
 *  probabilistic and voicing is genuinely ambiguous exactly at a
 *  pitch/silence transition). */
function isBoundary(i, expVoiced) {
  const prev = i > 0 ? expVoiced[i - 1] : expVoiced[i]
  const next = i < expVoiced.length - 1 ? expVoiced[i + 1] : expVoiced[i]
  return expVoiced[i] !== prev || expVoiced[i] !== next
}

describe('pyin golden vs committed reference fixture (probabilistic YIN / HMM-Viterbi)', () => {
  const c = fixture.cases[0]
  const y = Float32Array.from(c.input.y)
  const sr = c.input.sr

  const { f0, voiced_flag, voiced_prob } = pyin(y, fmin, fmax, sr, {
    frame_length,
    hop_length,
  })

  it('produces reference-shaped typed-array outputs', () => {
    expect(f0).toBeInstanceOf(Float64Array)
    expect(voiced_prob).toBeInstanceOf(Float64Array)
    expect(f0.length).toBe(c.n_frames)
    expect(voiced_flag.length).toBe(c.n_frames)
    expect(voiced_prob.length).toBe(c.n_frames)
    // voiced_prob is a probability on every frame.
    for (let i = 0; i < voiced_prob.length; i++) {
      expect(voiced_prob[i]).toBeGreaterThanOrEqual(0)
      expect(voiced_prob[i]).toBeLessThanOrEqual(1)
    }
  })

  it('voiced/unvoiced classification matches the reference off the transition frames', () => {
    const expVoiced = c.expected_voiced
    for (let i = 0; i < expVoiced.length; i++) {
      if (isBoundary(i, expVoiced)) continue // ambiguous transition frame
      expect(
        voiced_flag[i],
        `frame ${i} voicing (got ${voiced_flag[i]}, want ${expVoiced[i]})`,
      ).toBe(expVoiced[i])
    }
  })

  it('unvoiced f0 is NaN, voiced f0 is finite (reference fill_na=NaN contract)', () => {
    for (let i = 0; i < f0.length; i++) {
      if (voiced_flag[i]) expect(Number.isFinite(f0[i]), `frame ${i} voiced f0 finite`).toBe(true)
      else expect(Number.isNaN(f0[i]), `frame ${i} unvoiced f0 NaN`).toBe(true)
    }
  })

  it('voiced f0 is within ~1 semitone of the reference on the clear tones', () => {
    const exp = c.expected_f0
    const expVoiced = c.expected_voiced
    let worst = { i: -1, semi: 0 }
    for (let i = 0; i < f0.length; i++) {
      // Only score frames the reference voiced AND we voiced AND not a boundary.
      if (!expVoiced[i] || !voiced_flag[i] || isBoundary(i, expVoiced)) continue
      if (exp[i] == null || Number.isNaN(f0[i])) continue
      const semi = Math.abs(12 * Math.log2(f0[i] / exp[i]))
      if (semi > worst.semi) worst = { i, semi, got: f0[i], want: exp[i] }
    }
    // The achieved deviation is effectively 0 (grid-exact), well under 1 semitone.
    expect(
      worst.semi,
      `worst voiced f0 deviation at frame ${worst.i}: got ${worst.got}, want ${worst.want}`,
    ).toBeLessThan(1.0)
  })

  it('rejects infeasible parameters (fmax > Nyquist) instead of guessing', () => {
    expect(() => pyin(y, 80, sr, sr)).toThrow(/Nyquist/)
    expect(() => pyin(y, 500, 80, sr)).toThrow(/less than fmax/)
  })
})
