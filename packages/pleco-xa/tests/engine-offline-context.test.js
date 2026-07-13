import { describe, it, expect } from 'vitest'
import {
  PlecoOfflineAudioContext,
  PlecoOfflineContext,
  PlecoOfflineAudioCompletionEvent,
} from '../src/engine/xa-offline-context.js'
import { PlecoAudioBuffer } from '../src/engine/xa-buffer.js'
import { RENDER_QUANTUM } from '../src/engine/xa-constants.js'

// P07 — OfflineAudioContext spec parity (checklist section 7):
// both constructor forms with NotSupportedError validation, genuinely async
// startRendering() with the [[rendering started]] InvalidStateError guard and
// state transitions, suspend(suspendTime) quantized UP to render-quantum
// boundaries with microtask resume(), and the `complete` event carrying
// OfflineAudioCompletionEvent.renderedBuffer. renderSync() is demoted to
// internal engine API; the public numberOfChannels attribute is dropped.

const SR = 44100

/** Build a mono constant-1 source→gain→destination graph on `ctx`. Returns the gain node. */
function buildOnesGraph(ctx, frames) {
  const buf = ctx.createBuffer(1, frames, SR)
  buf.getChannelData(0).fill(1)
  const src = ctx.createBufferSource()
  src.buffer = buf
  const g = ctx.createGain()
  src.connect(g)
  g.connect(ctx.destination)
  src.start(0)
  return g
}

/** Flush the microtask queue completely (macrotask boundary). */
const flush = () => new Promise((resolve) => setTimeout(resolve, 0))

describe('PlecoOfflineAudioContext — constructors', () => {
  it('options form: constructs with {numberOfChannels, length, sampleRate}', () => {
    const ctx = new PlecoOfflineAudioContext({ numberOfChannels: 2, length: 384, sampleRate: SR })
    expect(ctx.length).toBe(384)
    expect(ctx.sampleRate).toBe(SR)
    expect(ctx.state).toBe('suspended')
    expect(ctx.destination.channelCount).toBe(2)
  })

  it('options form: numberOfChannels defaults to 1', () => {
    const ctx = new PlecoOfflineAudioContext({ length: 128, sampleRate: SR })
    expect(ctx.destination.channelCount).toBe(1)
  })

  it('positional form: constructs with (numberOfChannels, length, sampleRate)', () => {
    const ctx = new PlecoOfflineAudioContext(2, 384, SR)
    expect(ctx.length).toBe(384)
    expect(ctx.sampleRate).toBe(SR)
    expect(ctx.destination.channelCount).toBe(2)
  })

  it('length is a readonly attribute', () => {
    const ctx = new PlecoOfflineAudioContext(1, 128, SR)
    expect(() => {
      ctx.length = 999
    }).toThrow(TypeError)
    expect(ctx.length).toBe(128)
  })

  it('the non-spec public numberOfChannels attribute is gone', () => {
    const ctx = new PlecoOfflineAudioContext({ numberOfChannels: 2, length: 128, sampleRate: SR })
    expect(ctx.numberOfChannels).toBeUndefined()
  })

  it('options form: missing required length/sampleRate members → TypeError', () => {
    expect(() => new PlecoOfflineAudioContext({ sampleRate: SR })).toThrow(TypeError)
    expect(() => new PlecoOfflineAudioContext({ length: 128 })).toThrow(TypeError)
    expect(() => new PlecoOfflineAudioContext({})).toThrow(TypeError)
  })

  it('no arguments / wrong argument shapes → TypeError', () => {
    expect(() => new PlecoOfflineAudioContext()).toThrow(TypeError)
    expect(() => new PlecoOfflineAudioContext(2, 384)).toThrow(TypeError) // positional missing sampleRate
    expect(() => new PlecoOfflineAudioContext('2', 384, SR)).toThrow(TypeError)
  })

  it('numberOfChannels outside [1, 32] → NotSupportedError (both forms)', () => {
    for (const bad of [0, -1, 33]) {
      let err
      try {
        new PlecoOfflineAudioContext({ numberOfChannels: bad, length: 128, sampleRate: SR })
      } catch (e) {
        err = e
      }
      expect(err).toBeInstanceOf(DOMException)
      expect(err.name).toBe('NotSupportedError')
    }
    expect(() => new PlecoOfflineAudioContext(0, 128, SR)).toThrow(DOMException)
  })

  it('length zero or negative → NotSupportedError', () => {
    for (const bad of [0, -128]) {
      let err
      try {
        new PlecoOfflineAudioContext(1, bad, SR)
      } catch (e) {
        err = e
      }
      expect(err).toBeInstanceOf(DOMException)
      expect(err.name).toBe('NotSupportedError')
    }
  })

  it('sampleRate outside the nominal range [3000, 768000] → NotSupportedError', () => {
    for (const bad of [2999, 768001, -44100]) {
      let err
      try {
        new PlecoOfflineAudioContext(1, 128, bad)
      } catch (e) {
        err = e
      }
      expect(err).toBeInstanceOf(DOMException)
      expect(err.name).toBe('NotSupportedError')
    }
  })

  it("renderSizeHint 'default', 'hardware', and 128 are accepted (quantum stays 128)", () => {
    for (const hint of ['default', 'hardware', 128]) {
      const ctx = new PlecoOfflineAudioContext({ length: 128, sampleRate: SR, renderSizeHint: hint })
      expect(ctx.renderQuantumSize).toBe(RENDER_QUANTUM)
    }
  })

  it('renderSizeHint with an invalid enum string → TypeError (constructor-dictionary rule)', () => {
    expect(() => new PlecoOfflineAudioContext({ length: 128, sampleRate: SR, renderSizeHint: 'huge' })).toThrow(
      TypeError,
    )
  })

  it('renderSizeHint integer outside [1, 6·sampleRate] → NotSupportedError', () => {
    for (const bad of [0, -1, 6 * SR + 1]) {
      let err
      try {
        new PlecoOfflineAudioContext({ length: 128, sampleRate: SR, renderSizeHint: bad })
      } catch (e) {
        err = e
      }
      expect(err).toBeInstanceOf(DOMException)
      expect(err.name).toBe('NotSupportedError')
    }
  })

  it('renderSizeHint valid integer ≠ 128 → NotSupportedError (documented pleco fixed-quantum gap, never silent)', () => {
    let err
    try {
      new PlecoOfflineAudioContext({ length: 128, sampleRate: SR, renderSizeHint: 256 })
    } catch (e) {
      err = e
    }
    expect(err).toBeInstanceOf(DOMException)
    expect(err.name).toBe('NotSupportedError')
  })

  it('renderSizeHint non-integer number or other type → TypeError (pleco strictness, no coercion)', () => {
    expect(() => new PlecoOfflineAudioContext({ length: 128, sampleRate: SR, renderSizeHint: 128.5 })).toThrow(
      TypeError,
    )
    expect(() => new PlecoOfflineAudioContext({ length: 128, sampleRate: SR, renderSizeHint: {} })).toThrow(TypeError)
  })

  it('deprecated PlecoOfflineContext alias still resolves to the renamed class (transitional)', () => {
    expect(PlecoOfflineContext).toBe(PlecoOfflineAudioContext)
  })
})

describe('PlecoOfflineAudioContext — startRendering()', () => {
  it('resolves with a PlecoAudioBuffer of exactly `length` frames, sample-exact', async () => {
    const ctx = new PlecoOfflineAudioContext({ numberOfChannels: 1, length: 384, sampleRate: SR })
    const buf = ctx.createBuffer(1, 320, SR)
    buf.getChannelData(0).forEach((_, i, a) => (a[i] = i))
    const src = ctx.createBufferSource()
    src.buffer = buf
    const g = ctx.createGain()
    g.gain.value = 0.5
    src.connect(g)
    g.connect(ctx.destination)
    src.start(0)

    const out = await ctx.startRendering()
    expect(out).toBeInstanceOf(PlecoAudioBuffer)
    expect(out.length).toBe(384)
    expect(out.numberOfChannels).toBe(1)
    expect(out.sampleRate).toBe(SR)
    const d = out.getChannelData(0)
    for (let i = 0; i < 320; i++) expect(d[i]).toBe(Math.fround(i * 0.5))
    for (let i = 320; i < 384; i++) expect(d[i]).toBe(0)
  })

  it('is genuinely async: no frames are rendered in the caller’s synchronous frame', async () => {
    const ctx = new PlecoOfflineAudioContext({ numberOfChannels: 1, length: 256, sampleRate: SR })
    buildOnesGraph(ctx, 256)
    const p = ctx.startRendering()
    expect(ctx.currentTime).toBe(0) // nothing rendered yet
    expect(ctx.state).toBe('running') // but the control-thread state flipped synchronously
    await p
    expect(ctx.currentTime).toBeGreaterThanOrEqual(256 / SR)
  })

  it('transitions state suspended → running → closed, firing statechange each time', async () => {
    const ctx = new PlecoOfflineAudioContext({ numberOfChannels: 1, length: 128, sampleRate: SR })
    const seen = []
    ctx.onstatechange = () => seen.push(ctx.state)
    expect(ctx.state).toBe('suspended')
    await ctx.startRendering()
    expect(ctx.state).toBe('closed')
    expect(seen).toEqual(['running', 'closed'])
  })

  it('a second startRendering() rejects with InvalidStateError ([[rendering started]] guard)', async () => {
    const ctx = new PlecoOfflineAudioContext({ numberOfChannels: 1, length: 128, sampleRate: SR })
    const first = ctx.startRendering()
    await expect(ctx.startRendering()).rejects.toMatchObject({ name: 'InvalidStateError' })
    await first
    await expect(ctx.startRendering()).rejects.toMatchObject({ name: 'InvalidStateError' })
  })

  it('renders an empty graph to silence of exactly `length` frames', async () => {
    const ctx = new PlecoOfflineAudioContext({ numberOfChannels: 2, length: 200, sampleRate: SR }) // non-quantum-multiple
    const out = await ctx.startRendering()
    expect(out.length).toBe(200)
    expect(out.numberOfChannels).toBe(2)
    for (let c = 0; c < 2; c++) {
      expect(Array.from(out.getChannelData(c))).toEqual(new Array(200).fill(0))
    }
  })

  it('matches the internal renderSync() output bit-for-bit on an identical graph', async () => {
    const make = () => {
      const ctx = new PlecoOfflineAudioContext({ numberOfChannels: 1, length: 384, sampleRate: SR })
      const buf = ctx.createBuffer(1, 320, SR)
      buf.getChannelData(0).forEach((_, i, a) => (a[i] = i))
      const src = ctx.createBufferSource()
      src.buffer = buf
      const g = ctx.createGain()
      g.gain.value = 0.5
      src.connect(g)
      g.connect(ctx.destination)
      src.start(0)
      return ctx
    }
    const sync = Array.from(make().renderSync().getChannelData(0))
    const async_ = Array.from((await make().startRendering()).getChannelData(0))
    expect(async_).toEqual(sync)
  })
})

describe('PlecoOfflineAudioContext — complete event (OfflineAudioCompletionEvent)', () => {
  it('fires `complete` with renderedBuffer === the promise result, after the promise resolves, after statechange', async () => {
    const ctx = new PlecoOfflineAudioContext({ numberOfChannels: 1, length: 128, sampleRate: SR })
    const order = []
    let eventBuffer = null
    ctx.addEventListener('statechange', () => order.push(`statechange:${ctx.state}`))
    ctx.oncomplete = (e) => {
      order.push('complete')
      eventBuffer = e.renderedBuffer
      expect(e).toBeInstanceOf(PlecoOfflineAudioCompletionEvent)
      expect(e).toBeInstanceOf(Event)
      expect(e.type).toBe('complete')
    }
    const rendered = await ctx.startRendering().then((b) => {
      order.push('resolved')
      return b
    })
    await flush()
    expect(order).toEqual(['statechange:running', 'statechange:closed', 'resolved', 'complete'])
    expect(eventBuffer).toBe(rendered)
  })

  it('oncomplete handler attribute: reassignment replaces, null unsubscribes', async () => {
    const ctx = new PlecoOfflineAudioContext({ numberOfChannels: 1, length: 128, sampleRate: SR })
    let a = 0
    let b = 0
    ctx.oncomplete = () => a++
    ctx.oncomplete = () => b++
    ctx.oncomplete = ctx.oncomplete // self-assignment stays subscribed
    await ctx.startRendering()
    await flush()
    expect(a).toBe(0)
    expect(b).toBe(1)

    const ctx2 = new PlecoOfflineAudioContext({ numberOfChannels: 1, length: 128, sampleRate: SR })
    let c = 0
    ctx2.oncomplete = () => c++
    ctx2.oncomplete = null
    await ctx2.startRendering()
    await flush()
    expect(c).toBe(0)
  })

  it('PlecoOfflineAudioCompletionEvent is constructible; renderedBuffer is readonly and required', () => {
    const buf = new PlecoAudioBuffer({ numberOfChannels: 1, length: 128, sampleRate: SR })
    const ev = new PlecoOfflineAudioCompletionEvent('complete', { renderedBuffer: buf })
    expect(ev.type).toBe('complete')
    expect(ev.renderedBuffer).toBe(buf)
    expect(() => {
      ev.renderedBuffer = null
    }).toThrow(TypeError)
    expect(() => new PlecoOfflineAudioCompletionEvent('complete')).toThrow(TypeError)
    expect(() => new PlecoOfflineAudioCompletionEvent('complete', {})).toThrow(TypeError)
  })

  it('renderedBuffer is a required NON-NULLABLE AudioBuffer — null and non-buffer values throw TypeError (WebIDL)', () => {
    // Spec IDL: `required AudioBuffer renderedBuffer` — the member being
    // PRESENT is not enough; null and any non-AudioBuffer value must fail the
    // WebIDL type conversion with TypeError, exactly like a missing member.
    for (const bad of [null, undefined, 42, 'buffer', {}, [], new Float32Array(128)]) {
      expect(() => new PlecoOfflineAudioCompletionEvent('complete', { renderedBuffer: bad })).toThrow(TypeError)
    }
  })
})

describe('PlecoOfflineAudioContext — suspend(suspendTime) / resume()', () => {
  it('suspends at the quantized-UP quantum boundary; graph edits during suspension are audible', async () => {
    const ctx = new PlecoOfflineAudioContext({ numberOfChannels: 1, length: 256, sampleRate: SR })
    const g = buildOnesGraph(ctx, 256)
    g.gain.value = 1
    const suspended = ctx.suspend(64 / SR) // 64 frames quantizes UP to frame 128
    const renderP = ctx.startRendering()
    await suspended
    expect(ctx.state).toBe('suspended')
    expect(ctx.currentTime).toBe(RENDER_QUANTUM / SR) // exactly one quantum in
    g.gain.value = 0.25
    await ctx.resume()
    const out = await renderP
    const d = out.getChannelData(0)
    for (let i = 0; i < 128; i++) expect(d[i]).toBe(1)
    for (let i = 128; i < 256; i++) expect(d[i]).toBe(0.25)
  })

  it('fires statechange on suspension and again on resume', async () => {
    const ctx = new PlecoOfflineAudioContext({ numberOfChannels: 1, length: 256, sampleRate: SR })
    const seen = []
    ctx.onstatechange = () => seen.push(ctx.state)
    const suspended = ctx.suspend(1 / SR)
    const renderP = ctx.startRendering()
    await suspended
    await ctx.resume()
    await renderP
    expect(seen).toEqual(['running', 'suspended', 'running', 'closed'])
  })

  it('supports multiple suspend points at distinct quantized frames', async () => {
    const ctx = new PlecoOfflineAudioContext({ numberOfChannels: 1, length: 384, sampleRate: SR })
    const hits = []
    const s1 = ctx.suspend(1 / SR).then(() => hits.push(ctx.currentTime * SR))
    const s2 = ctx.suspend(129 / SR).then(() => hits.push(ctx.currentTime * SR))
    const renderP = ctx.startRendering()
    await s1
    await ctx.resume()
    await s2
    await ctx.resume()
    await renderP
    expect(hits).toEqual([128, 256])
  })

  it('suspend promise resolves only when rendering reaches the boundary — not at schedule time', async () => {
    const ctx = new PlecoOfflineAudioContext({ numberOfChannels: 1, length: 256, sampleRate: SR })
    let resolved = false
    const suspended = ctx.suspend(1 / SR).then(() => (resolved = true))
    await flush() // rendering has not started; the suspend must still be pending
    expect(resolved).toBe(false)
    const renderP = ctx.startRendering()
    await suspended
    expect(resolved).toBe(true)
    await ctx.resume()
    await renderP
  })

  it('suspend rejects with InvalidStateError for negative, ≤ current time, ≥ duration, or duplicate frames', async () => {
    const ctx = new PlecoOfflineAudioContext({ numberOfChannels: 1, length: 384, sampleRate: SR })
    await expect(ctx.suspend(-1)).rejects.toMatchObject({ name: 'InvalidStateError' })
    // quantized frame 0 ≤ current time 0 (spec: "less than or equal to the current time")
    await expect(ctx.suspend(0)).rejects.toMatchObject({ name: 'InvalidStateError' })
    // ≥ total render duration: frame 384 ≥ length 384
    await expect(ctx.suspend(384 / SR)).rejects.toMatchObject({ name: 'InvalidStateError' })
    const ok = ctx.suspend(1 / SR)
    // second suspend quantizing to the SAME frame 128
    await expect(ctx.suspend(2 / SR)).rejects.toMatchObject({ name: 'InvalidStateError' })
    const renderP = ctx.startRendering()
    await ok
    await ctx.resume()
    await renderP
  })

  it('suspend rejects with TypeError for non-finite or non-number suspendTime (pleco strictness)', async () => {
    const ctx = new PlecoOfflineAudioContext({ numberOfChannels: 1, length: 256, sampleRate: SR })
    for (const bad of [NaN, Infinity, -Infinity, '0.001', null, undefined]) {
      await expect(ctx.suspend(bad)).rejects.toBeInstanceOf(TypeError)
    }
  })

  it('suspend and resume reject with InvalidStateError once the context is closed', async () => {
    const ctx = new PlecoOfflineAudioContext({ numberOfChannels: 1, length: 128, sampleRate: SR })
    await ctx.startRendering()
    expect(ctx.state).toBe('closed')
    await expect(ctx.suspend(1 / SR)).rejects.toMatchObject({ name: 'InvalidStateError' })
    await expect(ctx.resume()).rejects.toMatchObject({ name: 'InvalidStateError' })
  })

  it('resume rejects with InvalidStateError before startRendering ([[rendering started]] false)', async () => {
    const ctx = new PlecoOfflineAudioContext({ numberOfChannels: 1, length: 128, sampleRate: SR })
    await expect(ctx.resume()).rejects.toMatchObject({ name: 'InvalidStateError' })
  })

  it('resume while already running resolves (spec rejects only closed / not-started)', async () => {
    const ctx = new PlecoOfflineAudioContext({ numberOfChannels: 1, length: 128, sampleRate: SR })
    const renderP = ctx.startRendering()
    await expect(ctx.resume()).resolves.toBeUndefined()
    await renderP
  })

  it('resume flips state synchronously; rendering continues on a microtask', async () => {
    const ctx = new PlecoOfflineAudioContext({ numberOfChannels: 1, length: 256, sampleRate: SR })
    const suspended = ctx.suspend(1 / SR)
    const renderP = ctx.startRendering()
    await suspended
    const timeAtSuspend = ctx.currentTime
    const p = ctx.resume()
    expect(ctx.state).toBe('running') // control-thread state flips synchronously
    expect(ctx.currentTime).toBe(timeAtSuspend) // but no frames rendered yet
    await p
    await renderP
    expect(ctx.state).toBe('closed')
  })
})
