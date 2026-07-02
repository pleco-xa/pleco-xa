import { describe, it, expect } from 'vitest'
import { AudioContext } from '../web-audio-test-api/index.js'
import { reverseBufferSection } from '../src/core/index.js'

describe('reverseBufferSection', () => {
  it('reverses the given range on all channels', () => {
    const ctx = new AudioContext({ sampleRate: 44100 })
    const buffer = ctx.createBuffer(2, 4, 44100)
    buffer.getChannelData(0).set([1, 2, 3, 4])
    buffer.getChannelData(1).set([5, 6, 7, 8])

    reverseBufferSection(buffer, 0, buffer.length)

    expect(Array.from(buffer.getChannelData(0))).toEqual([4, 3, 2, 1])
    expect(Array.from(buffer.getChannelData(1))).toEqual([8, 7, 6, 5])
  })
})
