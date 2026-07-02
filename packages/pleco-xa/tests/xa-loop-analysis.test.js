import { describe, it, expect } from 'vitest'
import { xaLoopAnalysis } from '../src/scripts/loop-analyzer.js'
import { AudioContext } from 'web-audio-test-api'

// Minimal stub for OfflineAudioContext used in spectrum analysis
class MockOfflineAudioContext {
  constructor() {}
  createBufferSource() {
    return { connect: () => {}, start: () => {}, buffer: null }
  }
  createAnalyser() {
    return {
      fftSize: 0,
      frequencyBinCount: 1024,
      connect: () => {},
      getFloatFrequencyData: (arr) => arr.fill(0),
    }
  }
  get destination() {
    return {}
  }
  startRendering() {
    return Promise.resolve()
  }
}

global.OfflineAudioContext = MockOfflineAudioContext

function createLoopBuffer(loopLengthSeconds, repeats, sampleRate = 8000) {
  const ctx = new AudioContext({ sampleRate })
  const length = Math.floor(sampleRate * loopLengthSeconds * repeats)
  const buffer = ctx.createBuffer(1, length, sampleRate)
  const data = buffer.getChannelData(0)
  const segmentLength = Math.floor(sampleRate * loopLengthSeconds)

  for (let r = 0; r < repeats; r++) {
    for (let i = 0; i < segmentLength; i++) {
      const t = i / sampleRate
      data[r * segmentLength + i] = Math.sin(2 * Math.PI * 440 * t)
    }
  }
  return buffer
}

describe('xaLoopAnalysis', () => {
  it('returns analysis object with expected keys', async () => {
    const buffer = createLoopBuffer(0.5, 2)
    const result = await xaLoopAnalysis(buffer)

    expect(result).toEqual(
      expect.objectContaining({
        loopStart: expect.any(Number),
        loopEnd: expect.any(Number),
        confidence: expect.any(Number),
        bpm: expect.any(Number),
        barDuration: expect.any(Number),
        musicalInfo: expect.any(Object),
      }),
    )
  })
})
