import { describe, it, expect } from 'vitest'
import { detectBPM } from '../src/scripts/analysis/BPMDetector.ts'

function createPulseSample(bpm, sampleRate, durationSeconds) {
  const length = Math.floor(sampleRate * durationSeconds)
  const data = new Float32Array(length)
  const samplesPerBeat = (sampleRate * 60) / bpm

  for (let i = 0; i < length; i += samplesPerBeat) {
    data[Math.floor(i)] = 1 // simple impulse on each beat
  }

  // Create a mock AudioBuffer for testing
  const mockAudioBuffer = {
    getChannelData: () => data,
    numberOfChannels: 1,
    sampleRate: sampleRate,
    length: data.length,
  }

  return mockAudioBuffer
}

describe('detectBPM', () => {
  it('returns an object with bpm and confidence for a short synthetic sample', async () => {
    const sampleRate = 44100
    const audioBuffer = createPulseSample(120, sampleRate, 2)

    const result = await detectBPM(audioBuffer)

    expect(result).toEqual(
      expect.objectContaining({
        bpm: expect.any(Number),
        confidence: expect.any(Number),
      }),
    )
  })
})
