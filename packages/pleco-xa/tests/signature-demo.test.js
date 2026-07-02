import { describe, it, expect, beforeAll } from 'vitest'
import { signatureDemo } from '../src/core/index.js'
import { AudioContext } from '../web-audio-test-api/index.js'

// Mock the global AudioContext to prevent the web-audio-test-api from trying to create a real one
beforeAll(() => {
  if (typeof window !== 'undefined') {
    window.AudioContext = AudioContext
    window.webkitAudioContext = AudioContext
  }
})

describe('signatureDemo', () => {
  it('produces the canonical signature choreography', () => {
    const ctx = new AudioContext({ sampleRate: 44100 })
    const buffer = ctx.createBuffer(1, 44100, 44100)
    const steps = signatureDemo(buffer)
    const ops = steps.map(s => s.op)

    // Self-golden: exact current choreography (narrow down → move/reverse → grow back → finish)
    expect(ops).toEqual([
      'half', 'half', 'half', 'reverse',
      'move forward', 'reverse', 'move forward', 'reverse',
      'double', 'reverse', 'double', 'reverse', 'double',
      'move forward', 'reverse',
    ])
    for (const s of steps) expect(typeof s.fn).toBe('function')
  })
})
