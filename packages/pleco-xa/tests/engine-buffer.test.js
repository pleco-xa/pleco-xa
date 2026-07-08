import { describe, it, expect } from 'vitest'
import { PlecoBuffer, createPlecoBuffer } from '../src/engine/xa-buffer.js'

// Proof of the pleco-3.0 thesis: pleco's own AudioBuffer, running in Node with
// ZERO Web Audio (no AudioContext import anywhere in this test).

describe("PlecoBuffer — pleco's own AudioBuffer (headless, zero Web Audio)", () => {
  it('constructs with the AudioBuffer-shaped interface', () => {
    const b = new PlecoBuffer({ numberOfChannels: 2, length: 44100, sampleRate: 44100 })
    expect(b.numberOfChannels).toBe(2)
    expect(b.length).toBe(44100)
    expect(b.sampleRate).toBe(44100)
    expect(b.duration).toBeCloseTo(1.0)
    expect(b.getChannelData(0)).toBeInstanceOf(Float32Array)
    expect(b.getChannelData(1).length).toBe(44100)
  })

  it('satisfies the AudioBuffer-shaped contract playback/ops.js requires', () => {
    const b = createPlecoBuffer(1, 128, 48000)
    expect(typeof b.numberOfChannels).toBe('number')
    expect(typeof b.length).toBe('number')
    expect(typeof b.sampleRate).toBe('number')
    expect(typeof b.getChannelData).toBe('function')
    expect(b.getChannelData(0)).toBeInstanceOf(Float32Array)
  })

  it('copyToChannel / copyFromChannel round-trip with offset and clipping', () => {
    const b = new PlecoBuffer({ numberOfChannels: 1, length: 8, sampleRate: 44100 })
    const src = Float32Array.from([0.1, -0.2, 0.3, -0.4])
    b.copyToChannel(src, 0, 2)
    const expected = [0, 0, 0.1, -0.2, 0.3, -0.4, 0, 0].map((v) => Math.fround(v))
    expect(Array.from(b.getChannelData(0))).toEqual(expected)

    const out = new Float32Array(4)
    b.copyFromChannel(out, 0, 2)
    expect(Array.from(out)).toEqual([0.1, -0.2, 0.3, -0.4].map((v) => Math.fround(v)))
  })

  it('is a valid createBuffer factory for the offline DSP layer', () => {
    const out = createPlecoBuffer(2, 64, 44100)
    expect(out).toBeInstanceOf(PlecoBuffer)
    expect(out.numberOfChannels).toBe(2)
    expect(out.length).toBe(64)
  })

  it('throws on invalid construction / access — no silent fallbacks', () => {
    expect(() => new PlecoBuffer({ numberOfChannels: 0, length: 10, sampleRate: 44100 })).toThrow(RangeError)
    expect(() => new PlecoBuffer({ numberOfChannels: 1, length: 0, sampleRate: 44100 })).toThrow(RangeError)
    expect(() => new PlecoBuffer({ numberOfChannels: 1, length: 10, sampleRate: 0 })).toThrow(RangeError)
    expect(() => createPlecoBuffer(1, 8, 44100).getChannelData(5)).toThrow(RangeError)
    expect(() => createPlecoBuffer(1, 8, 44100).copyToChannel([1, 2, 3], 0)).toThrow(TypeError)
  })
})
