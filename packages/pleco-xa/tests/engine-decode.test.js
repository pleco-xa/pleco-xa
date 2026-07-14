import { describe, it, expect } from 'vitest'
import { decodeWavArrayBuffer, resampleLinearChannels } from '../src/engine/xa-decode.js'

// Direct unit coverage for the engine's decodeAudioData primitives
// (engine/xa-decode.js). The base-context suite drives the happy paths and a
// few error paths THROUGH decodeAudioData; these tests reach the exported
// helpers directly to exercise the RIFF-walk defensive branches that the
// public path guards before ever reaching (non-ArrayBuffer, sub-header
// length, truncated fmt chunk, missing fmt / data chunks, out-of-range
// channel count, non-positive sample rate) plus the resampler's own argument
// and identity-rate branches. Every malformed input must surface an
// EncodingError (spec: decode failure → EncodingError), never a silent
// fallback.

/** Assemble a word-aligned RIFF/WAVE ArrayBuffer from raw chunk bodies. */
function buildRiff(chunks) {
  let total = 4 // 'WAVE'
  for (const c of chunks) total += 8 + c.body.length + (c.body.length & 1)
  const buffer = new ArrayBuffer(8 + total)
  const view = new DataView(buffer)
  const u8 = new Uint8Array(buffer)
  const str = (off, s) => {
    for (let i = 0; i < s.length; i++) view.setUint8(off + i, s.charCodeAt(i))
  }
  str(0, 'RIFF')
  view.setUint32(4, total, true)
  str(8, 'WAVE')
  let off = 12
  for (const c of chunks) {
    str(off, c.id.padEnd(4))
    view.setUint32(off + 4, c.declaredSize ?? c.body.length, true)
    u8.set(c.body, off + 8)
    off += 8 + c.body.length + (c.body.length & 1)
  }
  return buffer
}

/** A 16-byte PCM `fmt ` chunk body with individually overridable fields. */
function fmtBody({ format = 1, numChannels = 1, sampleRate = 8000, bits = 16 } = {}) {
  const body = new Uint8Array(16)
  const v = new DataView(body.buffer)
  const blockAlign = numChannels * (bits / 8)
  v.setUint16(0, format, true)
  v.setUint16(2, numChannels, true)
  v.setUint32(4, sampleRate, true)
  v.setUint32(8, sampleRate * blockAlign, true)
  v.setUint16(12, blockAlign, true)
  v.setUint16(14, bits, true)
  return body
}

describe('decodeWavArrayBuffer — RIFF-walk defensive branches', () => {
  it('a non-ArrayBuffer argument throws TypeError (the WebIDL binding guard)', () => {
    expect(() => decodeWavArrayBuffer(new Uint8Array(64))).toThrow(TypeError)
    expect(() => decodeWavArrayBuffer(42)).toThrow(TypeError)
    expect(() => decodeWavArrayBuffer(null)).toThrow(TypeError)
  })

  it('fewer than 12 bytes is too short to be RIFF/WAVE → EncodingError', () => {
    const err = catchThrow(() => decodeWavArrayBuffer(new ArrayBuffer(8)))
    expect(err).toBeInstanceOf(DOMException)
    expect(err.name).toBe('EncodingError')
  })

  it('a declared fmt chunk that runs past the end of the buffer → EncodingError (truncated fmt)', () => {
    // 12-byte RIFF header + a 'fmt ' id/size header but only 4 body bytes: the
    // walk needs off + 24 bytes for the 16-byte fmt body and throws.
    const buffer = new ArrayBuffer(24)
    const view = new DataView(buffer)
    const str = (off, s) => {
      for (let i = 0; i < s.length; i++) view.setUint8(off + i, s.charCodeAt(i))
    }
    str(0, 'RIFF')
    view.setUint32(4, 16, true)
    str(8, 'WAVE')
    str(12, 'fmt ')
    view.setUint32(16, 16, true) // claims a full 16-byte body that isn't present
    const err = catchThrow(() => decodeWavArrayBuffer(buffer))
    expect(err.name).toBe('EncodingError')
    expect(err.message).toMatch(/truncated fmt/)
  })

  it('a WAVE stream with no fmt chunk → EncodingError (missing fmt)', () => {
    const buffer = buildRiff([{ id: 'data', body: new Uint8Array(8) }])
    const err = catchThrow(() => decodeWavArrayBuffer(buffer))
    expect(err.name).toBe('EncodingError')
    expect(err.message).toMatch(/missing fmt/)
  })

  it('a WAVE stream with a fmt chunk but no data chunk → EncodingError (missing data)', () => {
    const buffer = buildRiff([{ id: 'fmt ', body: fmtBody() }])
    const err = catchThrow(() => decodeWavArrayBuffer(buffer))
    expect(err.name).toBe('EncodingError')
    expect(err.message).toMatch(/missing data/)
  })

  it('a channel count outside [1, 32] → EncodingError', () => {
    for (const numChannels of [0, 33]) {
      const buffer = buildRiff([
        { id: 'fmt ', body: fmtBody({ numChannels }) },
        { id: 'data', body: new Uint8Array(8) },
      ])
      const err = catchThrow(() => decodeWavArrayBuffer(buffer))
      expect(err.name, `numChannels ${numChannels}`).toBe('EncodingError')
      expect(err.message).toMatch(/numChannels/)
    }
  })

  it('a non-positive sample rate → EncodingError', () => {
    const buffer = buildRiff([
      { id: 'fmt ', body: fmtBody({ sampleRate: 0 }) },
      { id: 'data', body: new Uint8Array(8) },
    ])
    const err = catchThrow(() => decodeWavArrayBuffer(buffer))
    expect(err.name).toBe('EncodingError')
    expect(err.message).toMatch(/sample rate/)
  })

  it('a well-formed 16-bit PCM stream still decodes through the direct entry point', () => {
    const body = new Uint8Array(4) // two mono int16 frames
    new DataView(body.buffer).setInt16(0, 0x7fff, true)
    new DataView(body.buffer).setInt16(2, -0x8000, true)
    const buffer = buildRiff([
      { id: 'fmt ', body: fmtBody({ sampleRate: 8000 }) },
      { id: 'data', body },
    ])
    const { channels, sampleRate } = decodeWavArrayBuffer(buffer)
    expect(sampleRate).toBe(8000)
    expect(channels).toHaveLength(1)
    expect(Array.from(channels[0])).toEqual([1, -1])
  })
})

describe('resampleLinearChannels — argument + identity-rate branches', () => {
  it('a non-positive source or target rate throws RangeError', () => {
    const chans = [new Float32Array([0, 1, 2, 3])]
    expect(() => resampleLinearChannels(chans, 0, 8000)).toThrow(RangeError)
    expect(() => resampleLinearChannels(chans, 8000, 0)).toThrow(RangeError)
    expect(() => resampleLinearChannels(chans, -1, 8000)).toThrow(RangeError)
    expect(() => resampleLinearChannels(chans, 8000, -1)).toThrow(RangeError)
  })

  it('equal from/to rates return the SAME channel arrays untouched (identity fast path)', () => {
    const chans = [new Float32Array([0, 1, 2, 3])]
    expect(resampleLinearChannels(chans, 8000, 8000)).toBe(chans)
  })

  it('a genuine rate change interpolates to the resampled length', () => {
    const chans = [new Float32Array([0, 1, 2, 3])] // 4 frames at 4 Hz
    const out = resampleLinearChannels(chans, 4, 8) // upsample ×2 → 8 frames
    expect(out).toHaveLength(1)
    expect(out[0]).toHaveLength(8)
    expect(out[0][0]).toBe(0)
    expect(out[0][2]).toBe(1) // input frame 1 lands at output frame 2
  })
})

/** Run `fn`, returning the thrown error (or failing if nothing throws). */
function catchThrow(fn) {
  try {
    fn()
  } catch (e) {
    return e
  }
  throw new Error('expected the call to throw')
}
