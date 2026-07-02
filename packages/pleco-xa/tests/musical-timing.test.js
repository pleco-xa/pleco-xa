import { describe, it, expect } from 'vitest'
import { calculateBeatAlignment } from '../src/scripts/musical-timing.js'

describe('calculateBeatAlignment', () => {
  const bpm = 120

  it('gives perfect alignment for a 1 bar loop', () => {
    const loopLength = 2 // 4 beats at 120 BPM
    expect(calculateBeatAlignment(loopLength, bpm)).toBeCloseTo(1, 5)
  })

  it('scores a half-beat loop moderately', () => {
    const loopLength = 0.25 // half a beat
    expect(calculateBeatAlignment(loopLength, bpm)).toBeCloseTo(0.575, 3)
  })

  it('scores an offbeat loop slightly higher than a half-beat', () => {
    const loopLength = 0.3 // offbeat length
    expect(calculateBeatAlignment(loopLength, bpm)).toBeCloseTo(0.66, 2)
  })
})
