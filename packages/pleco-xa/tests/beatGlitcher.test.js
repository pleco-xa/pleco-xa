import { describe, it, expect, vi } from 'vitest'
import { startBeatGlitch } from '../src/core/beatGlitcher.js'

vi.mock('../src/scripts/analysis/BPMDetector.ts', () => ({
  fastBPMDetect: () => 120
}))

vi.mock('../src/core/loopPlayground.js', () => ({
  randomSequence: (buffer, { steps }) => {
    const fn = () => ({ buffer, loop: { start: 0, end: 1 }, op: 'noop' })
    return new Array(steps).fill(fn)
  }
}))

describe('startBeatGlitch', () => {
  it('triggers onUpdate once per bar', () => {
    vi.useFakeTimers()
    const audioBuffer = {
      getChannelData: () => new Float32Array(1),
      numberOfChannels: 1,
      sampleRate: 44100,
      length: 44100
    }
    const onUpdate = vi.fn()
    const stop = startBeatGlitch(audioBuffer, { maxOpsPerBar: 1, onUpdate })
    vi.advanceTimersByTime(4000 + 50)
    stop()
    expect(onUpdate).toHaveBeenCalledTimes(2)
  })
})
