import { describe, it, expect } from 'vitest'
import { PlecoBaseContext } from '../src/engine/xa-base-context.js'
import { PlecoAudioDestinationNode } from '../src/engine/nodes/xa-destination.js'
import { PlecoAudioBuffer } from '../src/engine/xa-buffer.js'
import { RENDER_QUANTUM } from '../src/engine/xa-constants.js'
import { encodeWav } from '../src/io/wav.js'

// P06 — BaseAudioContext spec surface (spec § The BaseAudioContext Interface):
// the `state` attribute (AudioContextState, default 'suspended') + the
// internal _setState transition primitive dispatching the `statechange` Event
// through the EventTarget inheritance (onstatechange handler attribute AND
// addEventListener), the `renderQuantumSize` attribute ([[render quantum
// size]] slot), decodeAudioData() (native WAV/PCM decode, detach-the-
// ArrayBuffer transfer semantics, EncodingError/DataCloneError/
// InvalidStateError error matrix, resample-to-context-rate, legacy callbacks
// + promise), the "Supported Sample Rates" nominal range on construction —
// and AudioDestinationNode.maxChannelCount with the destination's
// channelCount/channelCountMode constraint rows (§ The AudioNode Interface,
// constraint tables): IndexSizeError outside [1, maxChannelCount], and
// InvalidStateError for ANY change on an offline destination.

const SR = 8000

const makeCtx = (numberOfChannels = 1) => new PlecoBaseContext({ sampleRate: SR, numberOfChannels })

/**
 * Build a RIFF/WAVE file from PLANAR channels of RAW stored sample values
 * (int16 values for bits=16, unsigned bytes for bits=8, float32 for
 * format=3 …) so every test can state the exact bytes on disk and compute the
 * expected decode by the format's own mapping.
 */
function wavBytes({ sampleRate = SR, format = 1, bits = 16, channels }) {
  const numChannels = channels.length
  const frameCount = channels[0].length
  const bytesPerSample = bits / 8
  const blockAlign = numChannels * bytesPerSample
  const dataSize = frameCount * blockAlign
  const buffer = new ArrayBuffer(44 + dataSize)
  const view = new DataView(buffer)
  const str = (off, s) => {
    for (let i = 0; i < s.length; i++) view.setUint8(off + i, s.charCodeAt(i))
  }
  str(0, 'RIFF')
  view.setUint32(4, 36 + dataSize, true)
  str(8, 'WAVE')
  str(12, 'fmt ')
  view.setUint32(16, 16, true)
  view.setUint16(20, format, true)
  view.setUint16(22, numChannels, true)
  view.setUint32(24, sampleRate, true)
  view.setUint32(28, sampleRate * blockAlign, true)
  view.setUint16(32, blockAlign, true)
  view.setUint16(34, bits, true)
  str(36, 'data')
  view.setUint32(40, dataSize, true)
  let off = 44
  for (let i = 0; i < frameCount; i++) {
    for (let ch = 0; ch < numChannels; ch++) {
      const v = channels[ch][i]
      if (format === 3) view.setFloat32(off, v, true)
      else if (bits === 8) view.setUint8(off, v)
      else if (bits === 16) view.setInt16(off, v, true)
      else if (bits === 32) view.setInt32(off, v, true)
      else if (bits === 24) {
        const u = v & 0xffffff
        view.setUint8(off, u & 0xff)
        view.setUint8(off + 1, (u >> 8) & 0xff)
        view.setUint8(off + 2, (u >> 16) & 0xff)
      }
      off += bytesPerSample
    }
  }
  return buffer
}

describe('BaseAudioContext — state attribute + statechange event', () => {
  it("defaults to 'suspended' and the context is an EventTarget", () => {
    const ctx = makeCtx()
    expect(ctx.state).toBe('suspended')
    expect(ctx).toBeInstanceOf(EventTarget)
  })

  it('_setState updates the slot and dispatches statechange to the onstatechange handler', () => {
    const ctx = makeCtx()
    const seen = []
    ctx.onstatechange = (e) => seen.push([e.type, e.target.state])
    ctx._setState('running')
    expect(ctx.state).toBe('running')
    expect(seen).toEqual([['statechange', 'running']])
  })

  it('statechange also reaches addEventListener subscribers (real EventTarget dispatch)', () => {
    const ctx = makeCtx()
    const seen = []
    ctx.addEventListener('statechange', (e) => seen.push(e.type))
    ctx.onstatechange = () => seen.push('handler')
    ctx._setState('running')
    ctx._setState('closed')
    expect(seen).toEqual(['statechange', 'handler', 'statechange', 'handler'])
    expect(ctx.state).toBe('closed')
  })

  it('a same-state _setState is a no-op — the event fires only on a change to a DIFFERENT state', () => {
    const ctx = makeCtx()
    let fired = 0
    ctx.onstatechange = () => fired++
    ctx._setState('suspended') // already suspended
    expect(fired).toBe(0)
    ctx._setState('running')
    ctx._setState('running')
    expect(fired).toBe(1)
  })

  it('_setState rejects a name outside the AudioContextState enum with TypeError, state untouched', () => {
    const ctx = makeCtx()
    expect(() => ctx._setState('paused')).toThrow(TypeError)
    expect(ctx.state).toBe('suspended')
  })

  it('onstatechange handler semantics: reassigning replaces, null (or non-function) unsubscribes', () => {
    const ctx = makeCtx()
    const seen = []
    const fn1 = () => seen.push('fn1')
    const fn2 = () => seen.push('fn2')
    ctx.onstatechange = fn1
    ctx.onstatechange = fn2
    expect(ctx.onstatechange).toBe(fn2)
    ctx._setState('running')
    expect(seen).toEqual(['fn2'])
    ctx.onstatechange = null
    expect(ctx.onstatechange).toBeNull()
    ctx._setState('suspended')
    expect(seen).toEqual(['fn2'])
    ctx.onstatechange = 'not a function'
    expect(ctx.onstatechange).toBeNull()
  })
})

describe('BaseAudioContext — renderQuantumSize', () => {
  it('returns the [[render quantum size]] slot — the fixed RENDER_QUANTUM (128)', () => {
    const ctx = makeCtx()
    expect(ctx.renderQuantumSize).toBe(RENDER_QUANTUM)
    expect(ctx.renderQuantumSize).toBe(128)
  })

  it('is readonly (getter-only — strict-mode assignment throws)', () => {
    const ctx = makeCtx()
    expect(() => {
      ctx.renderQuantumSize = 256
    }).toThrow(TypeError)
    expect(ctx.renderQuantumSize).toBe(128)
  })
})

describe('BaseAudioContext — sampleRate nominal range ("Supported Sample Rates")', () => {
  it('throws NotSupportedError outside [3000, 768000] Hz and for non-numbers', () => {
    for (const bad of [2999, 768001, 0, -44100, NaN, Infinity, undefined, '44100']) {
      let thrown = null
      try {
        new PlecoBaseContext({ sampleRate: bad })
      } catch (e) {
        thrown = e
      }
      expect(thrown, `sampleRate ${bad}`).toBeInstanceOf(DOMException)
      expect(thrown.name).toBe('NotSupportedError')
    }
  })

  it('accepts both boundaries and stores the rate as float32 (IDL float)', () => {
    expect(new PlecoBaseContext({ sampleRate: 3000 }).sampleRate).toBe(3000)
    expect(new PlecoBaseContext({ sampleRate: 768000 }).sampleRate).toBe(768000)
    const odd = 44100.4567
    expect(new PlecoBaseContext({ sampleRate: odd }).sampleRate).toBe(Math.fround(odd))
  })
})

describe('BaseAudioContext.decodeAudioData — native WAV decode', () => {
  it('decodes 16-bit PCM mono sample-exact (each stored int16 maps by v<0 ? v/0x8000 : v/0x7fff)', async () => {
    const ctx = makeCtx()
    const stored = [-32768, -16384, -1, 0, 1, 16384, 32767]
    const buf = await ctx.decodeAudioData(wavBytes({ bits: 16, channels: [stored] }))
    expect(buf).toBeInstanceOf(PlecoAudioBuffer)
    expect(buf.numberOfChannels).toBe(1)
    expect(buf.length).toBe(stored.length)
    expect(buf.sampleRate).toBe(SR)
    expect(buf.duration).toBe(stored.length / SR)
    const expected = new Float32Array(stored.map((v) => (v < 0 ? v / 0x8000 : v / 0x7fff)))
    expect(buf.getChannelData(0)).toEqual(expected)
  })

  it('decodes 16-bit PCM stereo with exact channel separation (interleaved frames → planar channels)', async () => {
    const ctx = makeCtx(2)
    const left = [-32768, 0, 16384]
    const right = [32767, -16384, 0]
    const buf = await ctx.decodeAudioData(wavBytes({ bits: 16, channels: [left, right] }))
    expect(buf.numberOfChannels).toBe(2)
    expect(buf.getChannelData(0)).toEqual(new Float32Array(left.map((v) => (v < 0 ? v / 0x8000 : v / 0x7fff))))
    expect(buf.getChannelData(1)).toEqual(new Float32Array(right.map((v) => (v < 0 ? v / 0x8000 : v / 0x7fff))))
  })

  it('decodes 32-bit IEEE float WAV bit-exact', async () => {
    const ctx = makeCtx()
    const stored = [0, 0.25, -0.5, 1, -1, Math.fround(0.1)]
    const buf = await ctx.decodeAudioData(wavBytes({ format: 3, bits: 32, channels: [stored] }))
    expect(buf.getChannelData(0)).toEqual(new Float32Array(stored))
  })

  it("decodes 8-bit unsigned PCM with io/wav.js's asymmetric convention ((b − 128) < 0 ? /128 : /127)", async () => {
    const ctx = makeCtx()
    const stored = [0, 64, 128, 192, 255]
    const buf = await ctx.decodeAudioData(wavBytes({ bits: 8, channels: [stored] }))
    expect(buf.getChannelData(0)).toEqual(new Float32Array([-1, -0.5, 0, 64 / 127, 1]))
  })

  it('scales consistently across bit depths: full-scale 8-bit and 16-bit both decode to exactly ±1.0', async () => {
    const b8 = await makeCtx().decodeAudioData(wavBytes({ bits: 8, channels: [[255, 0]] }))
    const b16 = await makeCtx().decodeAudioData(wavBytes({ bits: 16, channels: [[32767, -32768]] }))
    expect(b8.getChannelData(0)).toEqual(new Float32Array([1, -1]))
    expect(b16.getChannelData(0)).toEqual(new Float32Array([1, -1]))
  })

  it('decodes 24-bit PCM sample-exact', async () => {
    const ctx = makeCtx()
    const stored = [-0x800000, -0x400000, 0, 0x400000, 0x7fffff]
    const buf = await ctx.decodeAudioData(wavBytes({ bits: 24, channels: [stored] }))
    const expected = new Float32Array(stored.map((v) => (v < 0 ? v / 0x800000 : v / 0x7fffff)))
    expect(buf.getChannelData(0)).toEqual(expected)
  })

  it('decodes 32-bit int PCM sample-exact', async () => {
    const ctx = makeCtx()
    const stored = [-0x80000000, -0x40000000, 0, 0x40000000, 0x7fffffff]
    const buf = await ctx.decodeAudioData(wavBytes({ bits: 32, channels: [stored] }))
    const expected = new Float32Array(stored.map((v) => (v < 0 ? v / 0x80000000 : v / 0x7fffffff)))
    expect(buf.getChannelData(0)).toEqual(expected)
  })

  it('round-trips the package encoder: encodeWav(io/wav.js) bytes decode back exactly on dyadic values', async () => {
    const ctx = makeCtx()
    const samples = new Float32Array([-1, -0.5, -0.25, 0, -0.75])
    const buf = await ctx.decodeAudioData(encodeWav([samples], SR))
    expect(buf.getChannelData(0)).toEqual(samples)
  })

  it('resamples UP to the context rate by linear interpolation (4000 Hz WAV into an 8000 Hz context)', async () => {
    const ctx = makeCtx()
    const ramp = [0, 0.25, 0.5, 0.75]
    const buf = await ctx.decodeAudioData(wavBytes({ sampleRate: 4000, format: 3, bits: 32, channels: [ramp] }))
    expect(buf.sampleRate).toBe(SR)
    expect(buf.length).toBe(8)
    // positions i·(4000/8000): midpoints interpolate, the last input frame holds
    expect(buf.getChannelData(0)).toEqual(new Float32Array([0, 0.125, 0.25, 0.375, 0.5, 0.625, 0.75, 0.75]))
  })

  it('resamples DOWN to the context rate (16000 Hz WAV into an 8000 Hz context lands on exact source frames)', async () => {
    const ctx = makeCtx()
    const ramp = [0, 0.125, 0.25, 0.375, 0.5, 0.625, 0.75, 0.875]
    const buf = await ctx.decodeAudioData(wavBytes({ sampleRate: 16000, format: 3, bits: 32, channels: [ramp] }))
    expect(buf.length).toBe(4)
    expect(buf.getChannelData(0)).toEqual(new Float32Array([0, 0.25, 0.5, 0.75]))
  })

  it('no resample when the WAV rate matches the context rate (float ramp untouched)', async () => {
    const ctx = makeCtx()
    const ramp = [0.1, 0.2, 0.3].map(Math.fround)
    const buf = await ctx.decodeAudioData(wavBytes({ sampleRate: SR, format: 3, bits: 32, channels: [ramp] }))
    expect(buf.getChannelData(0)).toEqual(new Float32Array(ramp))
  })
})

describe('BaseAudioContext.decodeAudioData — transfer semantics + error matrix', () => {
  it("DETACHES the caller's ArrayBuffer (spec step 3.2 — byteLength 0 after the call)", async () => {
    const ctx = makeCtx()
    const bytes = wavBytes({ bits: 16, channels: [[0, 1, 2]] })
    expect(bytes.byteLength).toBeGreaterThan(0)
    const promise = ctx.decodeAudioData(bytes)
    expect(bytes.byteLength).toBe(0) // detached synchronously, before decode completes
    await promise
  })

  it('an already-detached ArrayBuffer rejects with DataCloneError and invokes errorCallback with the same error (step 4)', async () => {
    const ctx = makeCtx()
    const bytes = wavBytes({ bits: 16, channels: [[0, 1, 2]] })
    await ctx.decodeAudioData(bytes) // detaches
    let cbErr = null
    const p = ctx.decodeAudioData(bytes, null, (e) => {
      cbErr = e
    })
    const rejection = await p.then(
      () => null,
      (e) => e,
    )
    expect(rejection).toBeInstanceOf(DOMException)
    expect(rejection.name).toBe('DataCloneError')
    await Promise.resolve() // errorCallback is queued as a task analogue
    expect(cbErr).toBe(rejection)
  })

  it("a closed context rejects with InvalidStateError WITHOUT detaching the buffer (step-1 analogue precedes step 3.2)", async () => {
    const ctx = makeCtx()
    ctx._setState('closed')
    const bytes = wavBytes({ bits: 16, channels: [[0, 1, 2]] })
    let cbErr = null
    const rejection = await ctx
      .decodeAudioData(bytes, null, (e) => {
        cbErr = e
      })
      .then(
        () => null,
        (e) => e,
      )
    expect(rejection).toBeInstanceOf(DOMException)
    expect(rejection.name).toBe('InvalidStateError')
    expect(bytes.byteLength).toBeGreaterThan(0) // NOT detached
    await Promise.resolve()
    expect(cbErr).toBe(rejection)
  })

  it('unrecognized bytes (not RIFF/WAVE) reject with EncodingError', async () => {
    const ctx = makeCtx()
    const junk = new Uint8Array(64).fill(0xab).buffer
    const rejection = await ctx.decodeAudioData(junk).then(
      () => null,
      (e) => e,
    )
    expect(rejection).toBeInstanceOf(DOMException)
    expect(rejection.name).toBe('EncodingError')
  })

  it('a truncated data chunk rejects with EncodingError', async () => {
    const ctx = makeCtx()
    const bytes = wavBytes({ bits: 16, channels: [[0, 1, 2, 3]] })
    const truncated = bytes.slice(0, bytes.byteLength - 4) // data chunk now claims more than remains
    const rejection = await ctx.decodeAudioData(truncated).then(
      () => null,
      (e) => e,
    )
    expect(rejection.name).toBe('EncodingError')
  })

  it('an unsupported encoding (compressed format tag / odd bit depth) rejects with EncodingError — no silent fallback', async () => {
    const ctx = makeCtx()
    for (const [format, bits] of [
      [2, 16], // ADPCM
      [0xfffe, 32], // WAVE_FORMAT_EXTENSIBLE
      [1, 12],
      [3, 64],
    ]) {
      const bytes = wavBytes({ bits: 16, channels: [[0, 1]] })
      new DataView(bytes).setUint16(20, format, true)
      new DataView(bytes).setUint16(34, bits, true)
      const rejection = await ctx.decodeAudioData(bytes).then(
        () => null,
        (e) => e,
      )
      expect(rejection.name, `format ${format}/${bits}`).toBe('EncodingError')
    }
  })

  it('a WAV whose data chunk holds zero sample frames rejects with EncodingError (PlecoAudioBuffer cannot be empty)', async () => {
    const ctx = makeCtx()
    const bytes = wavBytes({ bits: 16, channels: [[0]] })
    new DataView(bytes).setUint32(40, 0, true) // data size 0
    const rejection = await ctx.decodeAudioData(bytes.slice(0, 44)).then(
      () => null,
      (e) => e,
    )
    expect(rejection.name).toBe('EncodingError')
  })

  it('a non-ArrayBuffer audioData rejects with TypeError (WebIDL binding as rejection)', async () => {
    const ctx = makeCtx()
    for (const bad of [null, undefined, 'bytes', new Uint8Array(4), 42]) {
      const rejection = await ctx.decodeAudioData(bad).then(
        () => null,
        (e) => e,
      )
      expect(rejection, `audioData ${bad}`).toBeInstanceOf(TypeError)
    }
  })

  it('non-function callbacks reject with TypeError before anything is detached', async () => {
    const ctx = makeCtx()
    const bytes = wavBytes({ bits: 16, channels: [[0, 1]] })
    const r1 = await ctx.decodeAudioData(bytes, 'cb').then(
      () => null,
      (e) => e,
    )
    const r2 = await ctx.decodeAudioData(bytes, null, 42).then(
      () => null,
      (e) => e,
    )
    expect(r1).toBeInstanceOf(TypeError)
    expect(r2).toBeInstanceOf(TypeError)
    expect(bytes.byteLength).toBeGreaterThan(0)
  })
})

describe('BaseAudioContext.decodeAudioData — legacy callbacks + promise interplay', () => {
  it('successCallback receives the SAME buffer the promise resolves with, and never synchronously', async () => {
    const ctx = makeCtx()
    let cbBuf = null
    const p = ctx.decodeAudioData(wavBytes({ bits: 16, channels: [[0, 1, 2]] }), (b) => {
      cbBuf = b
    })
    expect(cbBuf).toBeNull() // decoding-thread analogue: nothing settles in the caller's frame
    const buf = await p
    expect(cbBuf).toBe(buf)
  })

  it('errorCallback receives the SAME EncodingError the promise rejects with', async () => {
    const ctx = makeCtx()
    let cbErr = null
    const rejection = await ctx
      .decodeAudioData(new Uint8Array(16).fill(7).buffer, null, (e) => {
        cbErr = e
      })
      .then(
        () => null,
        (e) => e,
      )
    expect(rejection.name).toBe('EncodingError')
    expect(cbErr).toBe(rejection)
  })

  it('promise-only usage works with both callbacks omitted (they are optional/null per the IDL)', async () => {
    const ctx = makeCtx()
    const buf = await ctx.decodeAudioData(wavBytes({ bits: 16, channels: [[-32768]] }))
    expect(buf.getChannelData(0)).toEqual(new Float32Array([-1]))
  })
})

describe('AudioDestinationNode — maxChannelCount + channel constraints', () => {
  it("the context's destination reports maxChannelCount equal to the construction channel count", () => {
    const ctx = makeCtx(2)
    expect(ctx.destination.maxChannelCount).toBe(2)
    expect(ctx.destination.channelCount).toBe(2)
    expect(ctx.destination.channelCountMode).toBe('explicit')
    expect(ctx.destination.channelInterpretation).toBe('speakers')
  })

  it('maxChannelCount is readonly (getter-only — strict-mode assignment throws)', () => {
    const ctx = makeCtx(2)
    expect(() => {
      ctx.destination.maxChannelCount = 8
    }).toThrow(TypeError)
    expect(ctx.destination.maxChannelCount).toBe(2)
  })

  it('offline destination: changing channelCount throws InvalidStateError; same-value assignment is fine', () => {
    const ctx = makeCtx(2)
    let thrown = null
    try {
      ctx.destination.channelCount = 1
    } catch (e) {
      thrown = e
    }
    expect(thrown).toBeInstanceOf(DOMException)
    expect(thrown.name).toBe('InvalidStateError')
    expect(ctx.destination.channelCount).toBe(2)
    ctx.destination.channelCount = 2 // not a change — allowed
    expect(ctx.destination.channelCount).toBe(2)
  })

  it('offline destination: changing channelCountMode throws InvalidStateError; same-value assignment is fine', () => {
    const ctx = makeCtx(1)
    let thrown = null
    try {
      ctx.destination.channelCountMode = 'max'
    } catch (e) {
      thrown = e
    }
    expect(thrown).toBeInstanceOf(DOMException)
    expect(thrown.name).toBe('InvalidStateError')
    expect(ctx.destination.channelCountMode).toBe('explicit')
    ctx.destination.channelCountMode = 'explicit'
    expect(ctx.destination.channelCountMode).toBe('explicit')
  })

  it('mutable (realtime-style) destination: any channelCount in [1, maxChannelCount] is accepted', () => {
    const ctx = makeCtx(1)
    const dest = new PlecoAudioDestinationNode(ctx, { channelCount: 2, maxChannelCount: 8, immutable: false })
    expect(dest.maxChannelCount).toBe(8)
    dest.channelCount = 8
    expect(dest.channelCount).toBe(8)
    dest.channelCount = 1
    expect(dest.channelCount).toBe(1)
  })

  it('mutable destination: channelCount above maxChannelCount throws IndexSizeError', () => {
    const ctx = makeCtx(1)
    const dest = new PlecoAudioDestinationNode(ctx, { channelCount: 2, maxChannelCount: 8, immutable: false })
    let thrown = null
    try {
      dest.channelCount = 9
    } catch (e) {
      thrown = e
    }
    expect(thrown).toBeInstanceOf(DOMException)
    expect(thrown.name).toBe('IndexSizeError')
    expect(dest.channelCount).toBe(2)
  })

  it('construction with channelCount > maxChannelCount throws IndexSizeError', () => {
    const ctx = makeCtx(1)
    let thrown = null
    try {
      new PlecoAudioDestinationNode(ctx, { channelCount: 4, maxChannelCount: 2 })
    } catch (e) {
      thrown = e
    }
    expect(thrown).toBeInstanceOf(DOMException)
    expect(thrown.name).toBe('IndexSizeError')
  })

  it('construction with an invalid maxChannelCount option throws RangeError (internal option misuse)', () => {
    const ctx = makeCtx(1)
    for (const bad of [0, -1, 33, 1.5, NaN, '8']) {
      expect(() => new PlecoAudioDestinationNode(ctx, { channelCount: 1, maxChannelCount: bad }), `max ${bad}`).toThrow(
        RangeError,
      )
    }
  })
})
