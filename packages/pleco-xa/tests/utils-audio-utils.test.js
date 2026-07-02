import { describe, it, expect } from 'vitest'
import {
  findZeroCrossing,
  findAudioStart,
  applyHannWindow,
} from '../src/scripts/audio-utils.js'

describe('findZeroCrossing', () => {
  it('returns the index where a positive to negative transition occurs', () => {
    const data = new Float32Array([0.1, 0.2, -0.1, -0.2])
    expect(findZeroCrossing(data, 0)).toBe(2)
  })

  it('returns the start index when no transition is found', () => {
    const data = new Float32Array([0.1, 0.2, -0.1, -0.2])
    expect(findZeroCrossing(data, 2)).toBe(2)
  })

  it('handles start index at end of array', () => {
    const data = new Float32Array([0.1, -0.1])
    expect(findZeroCrossing(data, 1)).toBe(1)
  })
})

describe('findAudioStart', () => {
  it('skips initial silence and returns zero crossing index', () => {
    const channelData = new Float32Array([0, 0, 0, 0.05, -0.05, -0.05])
    const sampleRate = 10 // windowSize = 1
    expect(findAudioStart(channelData, sampleRate)).toBe(4)
  })

  it('returns 0 when no audio above threshold is found', () => {
    const channelData = new Float32Array([0, 0, 0])
    const sampleRate = 10
    expect(findAudioStart(channelData, sampleRate)).toBe(0)
  })
})

describe('applyHannWindow', () => {
  it('applies a Hann window to the data', () => {
    const data = new Float32Array([1, 1, 1, 1])
    const result = applyHannWindow(data)
    // Hann window values for a 4-point window: 0, 0.75, 0.75, 0
    // When applied to [1, 1, 1, 1], we get [0, 0.75, 0.75, 0]
    expect(Array.from(result)).toEqual([0, 0.75, 0.75, 0])
  })
})
