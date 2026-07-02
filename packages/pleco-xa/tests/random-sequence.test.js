import { describe, it, expect } from 'vitest'
import { AudioContext } from '../web-audio-test-api/index.js'
import { randomSequence } from '../src/core/loopPlayground.js'

describe('randomSequence', () => {
  it('uses weighted actions deterministically via injected rng and respects durationMs', () => {
    const ctx = new AudioContext({ sampleRate: 44100 })
    const buffer = ctx.createBuffer(1, 44100, 44100)
    // weights: move 32 / half 20 / double 16 / reverse 12 / reset 20 (cumulative 32/52/68/80/100)
    const randVals = [0.1, 0.4, 0.6, 0.75]
    const rng = () => randVals.shift() ?? 0
    const seq = randomSequence(buffer, { durationMs: 500, steps: 4, rng, warmup: 0 })
    expect(seq.length).toBe(4)
    const ops = seq.map(fn => fn.op)
    expect(ops).toEqual(['move', 'half', 'double', 'reverse'])
    const res = seq[0]()
    const len = (res.loop.endSample - res.loop.startSample) / buffer.sampleRate
    expect(len).toBeLessThanOrEqual(0.5)
  })

  it('applies the 90% half warmup bias by default', () => {
    const ctx = new AudioContext({ sampleRate: 44100 })
    const buffer = ctx.createBuffer(1, 44100, 44100)
    const rng = () => 0.5 // < 0.9 → 'half' during warmup
    const seq = randomSequence(buffer, { steps: 4, rng })
    expect(seq.map(fn => fn.op)).toEqual(['half', 'half', 'half', 'half'])
  })
})
