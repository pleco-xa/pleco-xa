import { describe, it, expect } from 'vitest'
import { PlecoAudioBuffer, createPlecoAudioBuffer } from '../src/engine/xa-buffer.js'
import { PlecoBaseContext } from '../src/engine/xa-base-context.js'

// Proof of the pleco-3.0 thesis: pleco's own AudioBuffer, running in Node with
// ZERO Web Audio (no AudioContext import anywhere in this test).

describe("PlecoAudioBuffer — pleco's own AudioBuffer (headless, zero Web Audio)", () => {
  it('constructs with the AudioBuffer-shaped interface', () => {
    const b = new PlecoAudioBuffer({ numberOfChannels: 2, length: 44100, sampleRate: 44100 })
    expect(b.numberOfChannels).toBe(2)
    expect(b.length).toBe(44100)
    expect(b.sampleRate).toBe(44100)
    expect(b.duration).toBeCloseTo(1.0)
    expect(b.getChannelData(0)).toBeInstanceOf(Float32Array)
    expect(b.getChannelData(1).length).toBe(44100)
  })

  it('satisfies the AudioBuffer-shaped contract playback/ops.js requires', () => {
    const b = createPlecoAudioBuffer(1, 128, 48000)
    expect(typeof b.numberOfChannels).toBe('number')
    expect(typeof b.length).toBe('number')
    expect(typeof b.sampleRate).toBe('number')
    expect(typeof b.getChannelData).toBe('function')
    expect(b.getChannelData(0)).toBeInstanceOf(Float32Array)
  })

  it('copyToChannel / copyFromChannel round-trip with offset and clipping', () => {
    const b = new PlecoAudioBuffer({ numberOfChannels: 1, length: 8, sampleRate: 44100 })
    const src = Float32Array.from([0.1, -0.2, 0.3, -0.4])
    b.copyToChannel(src, 0, 2)
    const expected = [0, 0, 0.1, -0.2, 0.3, -0.4, 0, 0].map((v) => Math.fround(v))
    expect(Array.from(b.getChannelData(0))).toEqual(expected)

    const out = new Float32Array(4)
    b.copyFromChannel(out, 0, 2)
    expect(Array.from(out)).toEqual([0.1, -0.2, 0.3, -0.4].map((v) => Math.fround(v)))
  })

  it('copyToChannel / copyFromChannel copy max(0, min(Nb − k, Nf)) frames — spec clipping formula', () => {
    const b = new PlecoAudioBuffer({ numberOfChannels: 1, length: 4, sampleRate: 44100 })
    // bufferOffset beyond the buffer end: zero frames copied, no throw, nothing modified
    b.copyToChannel(Float32Array.from([1, 2]), 0, 4)
    expect(Array.from(b.getChannelData(0))).toEqual([0, 0, 0, 0])

    b.getChannelData(0).set([1, 2, 3, 4])
    const out = Float32Array.from([9, 9, 9])
    b.copyFromChannel(out, 0, 4)
    expect(Array.from(out)).toEqual([9, 9, 9]) // untouched — 0 frames available at offset 4
  })

  it('is a valid createBuffer factory for the offline DSP layer', () => {
    const out = createPlecoAudioBuffer(2, 64, 44100)
    expect(out).toBeInstanceOf(PlecoAudioBuffer)
    expect(out.numberOfChannels).toBe(2)
    expect(out.length).toBe(64)
  })
})

describe('PlecoAudioBuffer — spec-shaped validation (NotSupportedError / IndexSizeError DOMExceptions)', () => {
  const throwsName = (fn, name) => {
    let caught = null
    try {
      fn()
    } catch (err) {
      caught = err
    }
    expect(caught).not.toBeNull()
    expect(caught).toBeInstanceOf(DOMException)
    expect(caught.name).toBe(name)
  }

  it('throws NotSupportedError for numberOfChannels outside [1, 32]', () => {
    throwsName(() => new PlecoAudioBuffer({ numberOfChannels: 0, length: 10, sampleRate: 44100 }), 'NotSupportedError')
    throwsName(() => new PlecoAudioBuffer({ numberOfChannels: -1, length: 10, sampleRate: 44100 }), 'NotSupportedError')
    throwsName(() => new PlecoAudioBuffer({ numberOfChannels: 33, length: 10, sampleRate: 44100 }), 'NotSupportedError')
    throwsName(() => new PlecoAudioBuffer({ numberOfChannels: 1.5, length: 10, sampleRate: 44100 }), 'NotSupportedError')
    // 32 channels MUST be supported (spec floor)
    expect(new PlecoAudioBuffer({ numberOfChannels: 32, length: 10, sampleRate: 44100 }).numberOfChannels).toBe(32)
  })

  it('throws NotSupportedError for zero/negative/non-integer length', () => {
    throwsName(() => new PlecoAudioBuffer({ numberOfChannels: 1, length: 0, sampleRate: 44100 }), 'NotSupportedError')
    throwsName(() => new PlecoAudioBuffer({ numberOfChannels: 1, length: -8, sampleRate: 44100 }), 'NotSupportedError')
    throwsName(() => new PlecoAudioBuffer({ numberOfChannels: 1, length: 7.5, sampleRate: 44100 }), 'NotSupportedError')
    throwsName(() => new PlecoAudioBuffer({ numberOfChannels: 1, sampleRate: 44100 }), 'NotSupportedError')
  })

  it("throws NotSupportedError for sampleRate outside the spec's nominal range [3000, 768000] Hz", () => {
    throwsName(() => new PlecoAudioBuffer({ numberOfChannels: 1, length: 10, sampleRate: 2999 }), 'NotSupportedError')
    throwsName(() => new PlecoAudioBuffer({ numberOfChannels: 1, length: 10, sampleRate: 768001 }), 'NotSupportedError')
    throwsName(() => new PlecoAudioBuffer({ numberOfChannels: 1, length: 10, sampleRate: 0 }), 'NotSupportedError')
    throwsName(() => new PlecoAudioBuffer({ numberOfChannels: 1, length: 10, sampleRate: NaN }), 'NotSupportedError')
    throwsName(() => new PlecoAudioBuffer({ numberOfChannels: 1, length: 10, sampleRate: Infinity }), 'NotSupportedError')
    // inclusive bounds are supported
    expect(new PlecoAudioBuffer({ numberOfChannels: 1, length: 10, sampleRate: 3000 }).sampleRate).toBe(3000)
    expect(new PlecoAudioBuffer({ numberOfChannels: 1, length: 10, sampleRate: 768000 }).sampleRate).toBe(768000)
  })

  it('throws IndexSizeError (not RangeError) for a bad channel index in all three channel accessors', () => {
    const b = createPlecoAudioBuffer(2, 8, 44100)
    throwsName(() => b.getChannelData(2), 'IndexSizeError')
    throwsName(() => b.getChannelData(-1), 'IndexSizeError')
    throwsName(() => b.copyToChannel(new Float32Array(4), 2), 'IndexSizeError')
    throwsName(() => b.copyFromChannel(new Float32Array(4), 2), 'IndexSizeError')
  })

  it('keeps native TypeError / RangeError where the spec does not mandate a DOMException', () => {
    const b = createPlecoAudioBuffer(1, 8, 44100)
    expect(() => b.copyToChannel([1, 2, 3], 0)).toThrow(TypeError)
    expect(() => b.copyFromChannel([1, 2, 3], 0)).toThrow(TypeError)
    expect(() => b.copyToChannel(new Float32Array(2), 0, -1)).toThrow(RangeError)
    expect(() => b.copyFromChannel(new Float32Array(2), 0, -1)).toThrow(RangeError)
  })

  it('numberOfChannels / length / sampleRate / duration are readonly', () => {
    const b = new PlecoAudioBuffer({ numberOfChannels: 2, length: 16, sampleRate: 48000 })
    expect(() => { b.numberOfChannels = 4 }).toThrow(TypeError)
    expect(() => { b.length = 99 }).toThrow(TypeError)
    expect(() => { b.sampleRate = 44100 }).toThrow(TypeError)
    expect(() => { b.duration = 1 }).toThrow(TypeError)
    expect(b.numberOfChannels).toBe(2)
    expect(b.length).toBe(16)
    expect(b.sampleRate).toBe(48000)
    expect(b.duration).toBe(16 / 48000)
  })
})

describe('PlecoBaseContext.createBuffer — the BaseAudioContext factory (headless)', () => {
  it('returns a zero-initialized PlecoAudioBuffer of the requested shape', () => {
    const ctx = new PlecoBaseContext({ sampleRate: 44100, numberOfChannels: 1 })
    const b = ctx.createBuffer(2, 256, 48000)
    expect(b).toBeInstanceOf(PlecoAudioBuffer)
    expect(b.numberOfChannels).toBe(2)
    expect(b.length).toBe(256)
    expect(b.sampleRate).toBe(48000) // buffer rate is independent of the context rate
    expect(Array.from(b.getChannelData(0))).toEqual(new Array(256).fill(0))
    expect(Array.from(b.getChannelData(1))).toEqual(new Array(256).fill(0))
  })

  it('shares the NotSupportedError validation path with the PlecoAudioBuffer constructor', () => {
    const ctx = new PlecoBaseContext({ sampleRate: 44100, numberOfChannels: 1 })
    for (const bad of [
      () => ctx.createBuffer(0, 128, 44100),
      () => ctx.createBuffer(33, 128, 44100),
      () => ctx.createBuffer(1, 0, 44100),
      () => ctx.createBuffer(1, 128, 2999),
      () => ctx.createBuffer(1, 128, 768001),
    ]) {
      let caught = null
      try {
        bad()
      } catch (err) {
        caught = err
      }
      expect(caught).toBeInstanceOf(DOMException)
      expect(caught.name).toBe('NotSupportedError')
    }
  })

  it('stores sampleRate as float32 (IDL declares `float`)', () => {
    const b = new PlecoAudioBuffer({ numberOfChannels: 1, length: 8, sampleRate: 44100.123 })
    expect(b.sampleRate).toBe(Math.fround(44100.123))
    expect(b.duration).toBe(8 / Math.fround(44100.123))
  })
})
