import { describe, it, expect } from 'vitest'
import { PlecoBaseContext } from '../src/engine/xa-base-context.js'
import { PlecoScheduledSourceNode } from '../src/engine/xa-node.js'
import { RENDER_QUANTUM } from '../src/engine/xa-constants.js'

// P05 — AudioScheduledSourceNode spec semantics (spec § The
// AudioScheduledSourceNode Interface): the start()/stop() exception matrix
// (InvalidStateError via [[source started]], RangeError for negative when,
// TypeError for non-finite when — WebIDL restricted double conversion
// precedes the algorithm), sample-frame-accurate sub-quantum scheduling per the
// normative per-frame window (silent when currentTime < start or
// currentTime >= stop → startFrame = ceil(when·sr) inclusive, stopFrame =
// ceil(when·sr) exclusive), and the `ended` Event dispatched through the
// EventTarget inheritance — exactly once, asynchronously (queueMicrotask
// after the ending quantum, pleco's control-thread analogue).

const SR = 8000 // 1 frame = 1/8000 s → hand-computable frame positions

/** Frames-to-seconds for scheduling at exact (possibly fractional) frame positions. */
const t = (frames) => frames / SR

/**
 * Test source: writes the global ramp 1, 2, 3, ... into every frame the base
 * class activates, up to `limit` total frames of content. Lets every test
 * assert EXACT sample positions: output[k] === n means the n-th produced
 * frame landed on frame k of the block.
 */
class RampSource extends PlecoScheduledSourceNode {
  constructor(context, { limit = Infinity } = {}) {
    super(context, { channelCount: 1 })
    this._limit = limit
    this._producedTotal = 0
  }

  _dsp(output, offset, count) {
    const n = Math.min(count, this._limit - this._producedTotal)
    const d = output.getChannelData(0)
    for (let i = 0; i < n; i++) d[offset + i] = this._producedTotal + i + 1
    this._producedTotal += n
    return n
  }
}

const makeCtx = () => new PlecoBaseContext({ sampleRate: SR, numberOfChannels: 1 })

const makeSource = (opts) => {
  const ctx = makeCtx()
  const s = new RampSource(ctx, opts)
  s.connect(ctx.destination)
  return { ctx, s }
}

/** Awaiting one resolved promise runs every microtask queued before it — the ended dispatch included. */
const flushMicrotasks = () => Promise.resolve()

describe('AudioScheduledSourceNode — start()/stop() exception matrix', () => {
  it('start(when < 0) throws RangeError and does NOT set [[source started]] (step 2 aborts before step 3)', () => {
    const { s } = makeSource()
    expect(() => s.start(-1)).toThrow(RangeError)
    expect(() => s.start(-0.0001)).toThrow(RangeError)
    expect(() => s.start(0)).not.toThrow() // the failed calls consumed nothing
  })

  it('start(non-finite when) throws TypeError (WebIDL restricted double)', () => {
    const { s } = makeSource()
    expect(() => s.start(NaN)).toThrow(TypeError)
    expect(() => s.start(Infinity)).toThrow(TypeError)
    expect(() => s.start(-Infinity)).toThrow(TypeError)
    expect(() => s.start('1')).toThrow(TypeError) // pleco strictness: no ToNumber coercion
  })

  it('second start() throws an InvalidStateError DOMException', () => {
    const { s } = makeSource()
    s.start(0)
    let caught = null
    try {
      s.start(1)
    } catch (e) {
      caught = e
    }
    expect(caught).toBeInstanceOf(DOMException)
    expect(caught.name).toBe('InvalidStateError')
  })

  it('after a successful start, start(-1) is the InvalidStateError — the [[source started]] check (step 1) precedes the parameter constraint (step 2)', () => {
    const { s } = makeSource()
    s.start(0)
    expect(() => s.start(-1)).toThrow(DOMException)
    expect(() => s.start(-1)).toThrow(/InvalidStateError|already been called/)
  })

  it('stop() before start() throws an InvalidStateError DOMException — even with a negative when (step order)', () => {
    const { s } = makeSource()
    let caught = null
    try {
      s.stop(0)
    } catch (e) {
      caught = e
    }
    expect(caught).toBeInstanceOf(DOMException)
    expect(caught.name).toBe('InvalidStateError')
    expect(() => s.stop(-1)).toThrow(DOMException) // state check first, not RangeError
  })

  it('stop(when < 0) throws RangeError; stop(non-finite when) throws TypeError — after start', () => {
    const { s } = makeSource()
    s.start(0)
    expect(() => s.stop(-1)).toThrow(RangeError)
    expect(() => s.stop(NaN)).toThrow(TypeError)
    expect(() => s.stop(Infinity)).toThrow(TypeError)
  })

  it('stop() may be called repeatedly — the last invocation wins', () => {
    const { ctx, s } = makeSource()
    s.start(0)
    s.stop(t(120))
    s.stop(t(60)) // replaces the pending stop
    const out = ctx.renderQuantum().getChannelData(0)
    expect(out[59]).toBe(60)
    expect(out[60]).toBe(0)
  })
})

describe('AudioScheduledSourceNode — sample-frame-accurate scheduling', () => {
  it('frame-aligned start: when = 100/8000 s → first output at frame 100 exactly', () => {
    const { ctx, s } = makeSource()
    s.start(t(100))
    const out = ctx.renderQuantum().getChannelData(0)
    for (let i = 0; i < 100; i++) expect(out[i]).toBe(0)
    expect(out[100]).toBe(1)
    expect(out[127]).toBe(28)
  })

  it('sub-quantum, sub-FRAME start: when = 100.5/8000 s → first frame with time >= when is 101', () => {
    const { ctx, s } = makeSource()
    s.start(t(100.5))
    const out = ctx.renderQuantum().getChannelData(0)
    expect(out[100]).toBe(0) // frame 100 is at 100/8000 s < when → silent
    expect(out[101]).toBe(1) // ceil(100.5) — NOT Math.round's 100/101 coin flip
    expect(out[127]).toBe(27)
  })

  it('sub-frame start just past a frame: when = 100.25/8000 s → still frame 101', () => {
    const { ctx, s } = makeSource()
    s.start(t(100.25))
    const out = ctx.renderQuantum().getChannelData(0)
    expect(out[100]).toBe(0)
    expect(out[101]).toBe(1)
  })

  it('start in a later quantum at a sub-frame offset: when = 130.5 frames → quantum 1 frame 3', () => {
    const { ctx, s } = makeSource()
    s.start(t(130.5))
    const q0 = ctx.renderQuantum().getChannelData(0)
    expect(Array.from(q0)).toEqual(new Array(RENDER_QUANTUM).fill(0))
    const q1 = ctx.renderQuantum().getChannelData(0)
    expect(q1[2]).toBe(0) // frame 130 < 130.5
    expect(q1[3]).toBe(1) // frame 131 = ceil(130.5)
    expect(q1[127]).toBe(125)
  })

  it('frame-aligned stop is EXCLUSIVE: stop at 50/8000 s → frame 50 (time >= stop) is already silent', () => {
    const { ctx, s } = makeSource()
    s.start(0)
    s.stop(t(50))
    const out = ctx.renderQuantum().getChannelData(0)
    expect(out[49]).toBe(50) // last active frame: 49/8000 < stop
    expect(out[50]).toBe(0)
  })

  it('sub-frame stop: stop at 50.5/8000 s → frame 50 (time < stop) still sounds, 51 is silent', () => {
    const { ctx, s } = makeSource()
    s.start(0)
    s.stop(t(50.5))
    const out = ctx.renderQuantum().getChannelData(0)
    expect(out[50]).toBe(51)
    expect(out[51]).toBe(0)
  })

  it('sub-frame start AND stop in one quantum: [10.5, 20.5) frames → exactly frames 11..20 sound', () => {
    const { ctx, s } = makeSource()
    s.start(t(10.5))
    s.stop(t(20.5))
    const out = ctx.renderQuantum().getChannelData(0)
    expect(out[10]).toBe(0)
    expect(out[11]).toBe(1)
    expect(out[20]).toBe(10)
    expect(out[21]).toBe(0)
  })

  it('a start time in the past clamps to currentTime at the quantum that processes it', () => {
    const { ctx, s } = makeSource()
    ctx.renderQuantum() // clock now at frame 128; start(0) is in the past
    s.start(0)
    const out = ctx.renderQuantum().getChannelData(0)
    expect(out[0]).toBe(1) // plays immediately from the top of the processing quantum
    expect(out[127]).toBe(128)
  })

  it('a stop time in the past silences immediately at the quantum that processes it', async () => {
    const { ctx, s } = makeSource()
    s.start(0)
    ctx.renderQuantum() // frames 0..127 sound
    s.stop(0) // in the past
    const out = ctx.renderQuantum().getChannelData(0)
    expect(Array.from(out)).toEqual(new Array(RENDER_QUANTUM).fill(0))
    let ended = 0
    s.onended = () => ended++
    await flushMicrotasks()
    // EventTarget resolves listeners at DISPATCH time (the microtask), not at
    // queue time — so subscribing between the ending quantum and the flush
    // still receives the event.
    expect(ended).toBe(1)
  })

  it('stop at/before the start time: the source never plays, but ended still fires when the stop time is reached', async () => {
    const { ctx, s } = makeSource()
    let ended = 0
    s.onended = () => ended++
    s.start(t(1000)) // far future
    s.stop(t(10)) // before start
    const out = ctx.renderQuantum().getChannelData(0)
    expect(Array.from(out)).toEqual(new Array(RENDER_QUANTUM).fill(0))
    await flushMicrotasks()
    expect(ended).toBe(1)
    for (let q = 0; q < 10; q++) ctx.renderQuantum()
    await flushMicrotasks()
    expect(ended).toBe(1)
    expect(Array.from(ctx.renderQuantum().getChannelData(0))).toEqual(new Array(RENDER_QUANTUM).fill(0))
  })
})

describe('AudioScheduledSourceNode — the ended Event', () => {
  it('fires exactly once, ASYNCHRONOUSLY — never inside the render pull, once per source after flushing microtasks', async () => {
    const { ctx, s } = makeSource()
    let ended = 0
    s.onended = () => ended++
    s.start(0)
    s.stop(t(64))
    ctx.renderQuantum()
    expect(ended).toBe(0) // queued, not yet dispatched — the control-thread analogue
    await flushMicrotasks()
    expect(ended).toBe(1)
    ctx.renderQuantum()
    ctx.renderQuantum()
    await flushMicrotasks()
    expect(ended).toBe(1) // exactly once
  })

  it('dispatches a real Event through the EventTarget inheritance, to BOTH onended and addEventListener', async () => {
    const { ctx, s } = makeSource()
    const seen = []
    s.onended = (ev) => seen.push(['onended', ev])
    s.addEventListener('ended', (ev) => seen.push(['listener', ev]))
    s.start(0)
    s.stop(t(10))
    ctx.renderQuantum()
    await flushMicrotasks()
    expect(seen.length).toBe(2)
    const [[, ev1], [, ev2]] = seen
    expect(ev1).toBeInstanceOf(Event)
    expect(ev1.type).toBe('ended')
    expect(ev1.target).toBe(s)
    expect(ev2).toBe(ev1) // one dispatch, both subscription paths
    expect(seen.map(([who]) => who).sort()).toEqual(['listener', 'onended'])
  })

  it('fires when content is exhausted (produced < count), at the exact exhaustion frame', async () => {
    const { ctx, s } = makeSource({ limit: 200 })
    let ended = 0
    s.addEventListener('ended', () => ended++)
    s.start(0)
    ctx.renderQuantum() // frames 0..127 → 128 frames of content
    const q1 = ctx.renderQuantum().getChannelData(0)
    expect(q1[71]).toBe(200) // 200th and last content frame lands on frame 199 = quantum-1 frame 71
    expect(q1[72]).toBe(0)
    expect(ended).toBe(0)
    await flushMicrotasks()
    expect(ended).toBe(1)
    ctx.renderQuantum()
    await flushMicrotasks()
    expect(ended).toBe(1)
  })

  it('onended has event-handler IDL semantics: reassigning replaces the previous handler', async () => {
    const { ctx, s } = makeSource()
    let h1 = 0
    let h2 = 0
    const first = () => h1++
    const second = () => h2++
    s.onended = first
    expect(s.onended).toBe(first)
    s.onended = second // replaces — first is unsubscribed
    expect(s.onended).toBe(second)
    s.start(0)
    s.stop(t(5))
    ctx.renderQuantum()
    await flushMicrotasks()
    expect(h1).toBe(0)
    expect(h2).toBe(1)
  })

  it('onended = null unsubscribes; non-function assignment reads back as null', async () => {
    const { ctx, s } = makeSource()
    let calls = 0
    s.onended = () => calls++
    s.onended = null
    expect(s.onended).toBe(null)
    s.onended = 'not a function'
    expect(s.onended).toBe(null)
    s.start(0)
    s.stop(t(5))
    ctx.renderQuantum()
    await flushMicrotasks()
    expect(calls).toBe(0)
  })

  it('onended replacement does not disturb independent addEventListener subscribers', async () => {
    const { ctx, s } = makeSource()
    let viaListener = 0
    let viaHandler = 0
    s.addEventListener('ended', () => viaListener++)
    s.onended = () => viaHandler++
    s.onended = null
    s.onended = () => viaHandler++
    s.start(0)
    s.stop(t(5))
    ctx.renderQuantum()
    await flushMicrotasks()
    expect(viaListener).toBe(1)
    expect(viaHandler).toBe(1)
  })
})

describe('AudioScheduledSourceNode — ended without being pulled (context tail registration)', () => {
  // Spec: "the ended event is dispatched when the stop time determined by
  // stop() is reached" — no connectivity condition; "playing" is defined
  // purely by currentTime against the start/stop times.

  it('ended fires for a started source that is NEVER connected, once the clock passes its stop time', async () => {
    const ctx = makeCtx()
    const s = new RampSource(ctx)
    let ended = 0
    s.onended = () => ended++
    s.start(0)
    s.stop(t(64))
    ctx.renderQuantum() // nothing pulls the source — renderQuantum ticks it as a tail node
    expect(ended).toBe(0) // still asynchronous (queued, not dispatched)
    await flushMicrotasks()
    expect(ended).toBe(1)
    ctx.renderQuantum()
    await flushMicrotasks()
    expect(ended).toBe(1) // exactly once — _end() deregisters the tail
  })

  it('ended fires for a source disconnected before its stop time is reached', async () => {
    const { ctx, s } = makeSource()
    let ended = 0
    s.onended = () => ended++
    s.start(0)
    s.stop(t(200)) // stop lands in the second quantum
    ctx.renderQuantum()
    s.disconnect() // no longer pulled by the destination
    ctx.renderQuantum()
    await flushMicrotasks()
    expect(ended).toBe(1)
  })

  it('ended fires on content exhaustion for an unconnected source', async () => {
    const ctx = makeCtx()
    const s = new RampSource(ctx, { limit: 100 })
    let ended = 0
    s.onended = () => ended++
    s.start(0)
    ctx.renderQuantum() // 100 < 128 frames of content — exhausted in the first quantum
    await flushMicrotasks()
    expect(ended).toBe(1)
  })
})

describe('AudioScheduledSourceNode — the upgraded base through PlecoAudioBufferSourceNode', () => {
  it('buffer-source content lands at the exact sub-quantum start frame with the spec exception surface', async () => {
    const ctx = makeCtx()
    const s = ctx.createBufferSource()
    const buf = ctx.createBuffer(1, 16, SR)
    buf.getChannelData(0).forEach((_, i, a) => (a[i] = i + 1))
    s.buffer = buf
    s.connect(ctx.destination)
    expect(() => s.stop()).toThrow(DOMException) // InvalidStateError before start
    let ended = 0
    s.onended = () => ended++
    s.start(t(100.5))
    const out = ctx.renderQuantum().getChannelData(0)
    expect(out[100]).toBe(0)
    expect(out[101]).toBe(1) // buf[0] at frame ceil(100.5) = 101
    expect(out[116]).toBe(16) // buf[15] at frame 116
    expect(out[117]).toBe(0) // exhausted
    expect(() => s.start(0)).toThrow(DOMException) // InvalidStateError on restart
    expect(ended).toBe(0)
    await flushMicrotasks()
    expect(ended).toBe(1)
  })
})
