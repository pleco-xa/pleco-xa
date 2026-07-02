import { describe, it, expect, vi } from 'vitest'
import { AudioContext } from '../web-audio-test-api/index.js'
import { randomLocal } from '../src/core/index.js'

function createBuffer() {
  const ctx = new AudioContext({ sampleRate: 44100 })
  return ctx.createBuffer(1, 44100, 44100)
}

describe('randomLocal', () => {
  it('performs a series of local operations', () => {
    const buffer = createBuffer()
    let loop = { startSample: 0, endSample: buffer.length }
    vi.spyOn(Math, 'random').mockReturnValue(0.1)
    const res = randomLocal(buffer, loop, { minMs: 100 })
    expect(res.op).toBe('randomLocal')
    expect(res.subOps.length).toBeGreaterThanOrEqual(3)
    expect(res.loop.endSample).toBeLessThanOrEqual(buffer.length)
  })
})
