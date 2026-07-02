import { describe, it, expect, vi } from 'vitest'
import { AudioContext } from '../web-audio-test-api/index.js'
import { glitchBurst } from '../src/core/index.js'

function createBuffer() {
  const ctx = new AudioContext({ sampleRate: 44100 })
  return ctx.createBuffer(1, 44100 * 2, 44100)
}

describe('glitchBurst', () => {
  it('follows deterministic sequence when RNG is mocked', () => {
    vi.useFakeTimers()
    vi.setSystemTime(0)
    const buffer = createBuffer()
    const updates = []
    const randVals = [0.05, 0.5, 0.8, 0.9, 0.2, 0.3, 0.4, 0.6, 0.7, 0.85, 0.45, 0.55, 0.42, 0.48, 0.52, 0.41, 0.46, 0.51, 0.43, 0.47, 0.49, 0.44, 0.53, 0.54, 0.56, 0.57, 0.58, 0.59, 0.61, 0.62]
    vi.spyOn(Math, 'random').mockImplementation(() => randVals.shift() ?? 0)
    if (globalThis.performance) {
      vi.spyOn(globalThis.performance, 'now').mockImplementation(() => Date.now())
    } else {
      globalThis.performance = { now: () => Date.now() }
    }

    glitchBurst(buffer, {
      ctx: {},
      durationMs: 8000,
      minMs: 50, // Allow smaller loops
      onUpdate: (buf, loop, op, subOps) => {
        updates.push({
          loop: { startSample: loop.startSample, endSample: loop.endSample },
          op,
          subOps
        })
      }
    })

    // Advance timers by the duration plus a bit more to ensure completion
    vi.advanceTimersByTime(8200)

    expect(updates.length).toBeGreaterThanOrEqual(30)
    const tiny = updates.some(u => (u.loop.endSample - u.loop.startSample) / buffer.sampleRate <= 0.1)
    expect(tiny).toBe(true)


  })
})
