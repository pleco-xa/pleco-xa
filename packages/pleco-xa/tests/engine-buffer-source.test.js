import { describe, it, expect } from 'vitest'
import { PlecoBaseContext } from '../src/engine/xa-base-context.js'
import { PlecoAudioBufferSourceNode } from '../src/engine/nodes/xa-buffer-source.js'
import { RENDER_QUANTUM } from '../src/engine/xa-constants.js'

// P08 — AudioBufferSourceNode completion (spec § The AudioBufferSourceNode
// Interface + § Playback of AudioBuffer Contents): nullable buffer with the
// [[buffer set]] InvalidStateError, AudioBufferSourceOptions, the
// start(when, offset, duration) overload with sub-sample offset, loop/
// loopStart/loopEnd with the normative wraparound
// (cursor = loopStart + ((cursor − loopStart) mod (loopEnd − loopStart))),
// and computedPlaybackRate = playbackRate · 2^(detune/1200) sampled k-rate
// once per render quantum, with both params constructed k-rate-fixed.
//
// SR = 8192 keeps every frame time k/8192 binary-exact, so cursor positions,
// elapsed-duration sums, and loop endpoints are all exact doubles and every
// assertion below is sample-exact (no epsilon).

const SR = 8192
const t = (frames) => frames / SR

const makeCtx = (channels = 1) => new PlecoBaseContext({ sampleRate: SR, numberOfChannels: channels })

/** Mono buffer whose samples are `values` (float32-exact test values only). */
function makeBuffer(ctx, values, sampleRate = SR) {
  const buf = ctx.createBuffer(1, values.length, sampleRate)
  buf.getChannelData(0).set(values)
  return buf
}

/** Ramp 1..n — every value exact in float32. */
const ramp = (n) => Array.from({ length: n }, (_, i) => i + 1)

/** Source → destination, one rendered quantum, channel 0. */
function renderOne(ctx) {
  return ctx.renderQuantum().getChannelData(0)
}

function makeSource(ctx, values, options) {
  const s = new PlecoAudioBufferSourceNode(ctx, options)
  if (values !== null) s.buffer = makeBuffer(ctx, values)
  s.connect(ctx.destination)
  return s
}

const flushMicrotasks = () => Promise.resolve()

/** Assert fn throws a DOMException with the exact spec name. */
const throwsName = (fn, name) => {
  let caught = null
  try {
    fn()
  } catch (err) {
    caught = err
  }
  expect(caught).toBeInstanceOf(DOMException)
  expect(caught.name).toBe(name)
}

describe('AudioBufferSourceNode — the nullable buffer attribute', () => {
  it('is initially null', () => {
    const s = new PlecoAudioBufferSourceNode(makeCtx())
    expect(s.buffer).toBe(null)
  })

  it('rejects a non-AudioBuffer with TypeError — including AudioBuffer-shaped duck types', () => {
    const s = new PlecoAudioBufferSourceNode(makeCtx())
    expect(() => (s.buffer = {})).toThrow(TypeError)
    expect(() => (s.buffer = { getChannelData: () => new Float32Array(4) })).toThrow(TypeError)
    expect(() => (s.buffer = 'buffer')).toThrow(TypeError)
  })

  it('re-setting a non-null buffer throws InvalidStateError ([[buffer set]]), not a plain Error', () => {
    const ctx = makeCtx()
    const s = new PlecoAudioBufferSourceNode(ctx)
    s.buffer = makeBuffer(ctx, [1, 2])
    throwsName(() => (s.buffer = makeBuffer(ctx, [3, 4])), 'InvalidStateError')
  })

  it('null assignment is always allowed, but [[buffer set]] persists — non-null after null still throws', () => {
    const ctx = makeCtx()
    const s = new PlecoAudioBufferSourceNode(ctx)
    s.buffer = null // null before anything is fine
    expect(s.buffer).toBe(null)
    const buf = makeBuffer(ctx, [1, 2])
    s.buffer = buf
    expect(s.buffer).toBe(buf)
    s.buffer = null // back to null — allowed
    expect(s.buffer).toBe(null)
    throwsName(() => (s.buffer = makeBuffer(ctx, [5, 6])), 'InvalidStateError')
  })

  it('channelCount stays at the interface default 2 — setting a buffer does not mutate it', () => {
    const ctx = makeCtx()
    const s = new PlecoAudioBufferSourceNode(ctx)
    expect(s.channelCount).toBe(2)
    expect(s.channelCountMode).toBe('max')
    expect(s.channelInterpretation).toBe('speakers')
    s.buffer = ctx.createBuffer(1, 8, SR) // mono buffer
    expect(s.channelCount).toBe(2) // interface default, untouched
  })

  it('output width tracks the buffer: mono buffer → 1-channel blocks, stereo buffer → 2-channel blocks', () => {
    const ctx = makeCtx(2)
    const s = new PlecoAudioBufferSourceNode(ctx)
    s.buffer = ctx.createBuffer(2, RENDER_QUANTUM * 2, SR)
    s.connect(ctx.destination)
    s.start(0)
    ctx.renderQuantum()
    expect(s._cacheBlock.numberOfChannels).toBe(2)
  })
})

describe('AudioBufferSourceNode — AudioBufferSourceOptions constructor', () => {
  it('defaults: buffer null, loop false, loopStart 0, loopEnd 0, playbackRate 1, detune 0', () => {
    const s = new PlecoAudioBufferSourceNode(makeCtx())
    expect(s.buffer).toBe(null)
    expect(s.loop).toBe(false)
    expect(s.loopStart).toBe(0)
    expect(s.loopEnd).toBe(0)
    expect(s.playbackRate.value).toBe(1)
    expect(s.detune.value).toBe(0)
  })

  it('applies every dictionary member', () => {
    const ctx = makeCtx()
    const buf = makeBuffer(ctx, [1, 2, 3, 4])
    const s = new PlecoAudioBufferSourceNode(ctx, {
      buffer: buf,
      loop: true,
      loopStart: t(1),
      loopEnd: t(3),
      playbackRate: 2,
      detune: -1200,
    })
    expect(s.buffer).toBe(buf)
    expect(s.loop).toBe(true)
    expect(s.loopStart).toBe(t(1))
    expect(s.loopEnd).toBe(t(3))
    expect(s.playbackRate.value).toBe(2)
    expect(s.detune.value).toBe(-1200)
  })

  it('initial param values do not change defaultValue (playbackRate 1, detune 0)', () => {
    const s = new PlecoAudioBufferSourceNode(makeCtx(), { playbackRate: 0.5, detune: 600 })
    expect(s.playbackRate.defaultValue).toBe(1)
    expect(s.detune.defaultValue).toBe(0)
    expect(s.playbackRate.value).toBe(0.5)
    expect(s.detune.value).toBe(600)
  })

  it('a non-object options argument → TypeError (WebIDL dictionary conversion)', () => {
    const ctx = makeCtx()
    for (const bad of [42, 'x', true]) {
      expect(() => new PlecoAudioBufferSourceNode(ctx, bad)).toThrow(TypeError)
    }
    // null / undefined are the empty dictionary — not an error.
    expect(() => new PlecoAudioBufferSourceNode(ctx, null)).not.toThrow()
    expect(() => new PlecoAudioBufferSourceNode(ctx, undefined)).not.toThrow()
  })

  it('invalid dictionary members throw TypeError (constructor dictionary path)', () => {
    const ctx = makeCtx()
    expect(() => new PlecoAudioBufferSourceNode(ctx, { loop: 1 })).toThrow(TypeError)
    expect(() => new PlecoAudioBufferSourceNode(ctx, { loopStart: NaN })).toThrow(TypeError)
    expect(() => new PlecoAudioBufferSourceNode(ctx, { loopEnd: Infinity })).toThrow(TypeError)
    expect(() => new PlecoAudioBufferSourceNode(ctx, { playbackRate: Infinity })).toThrow(TypeError)
    expect(() => new PlecoAudioBufferSourceNode(ctx, { detune: 'high' })).toThrow(TypeError)
    expect(() => new PlecoAudioBufferSourceNode(ctx, { buffer: {} })).toThrow(TypeError)
  })

  it('options.buffer consumes [[buffer set]] — a later non-null set throws InvalidStateError', () => {
    const ctx = makeCtx()
    const s = new PlecoAudioBufferSourceNode(ctx, { buffer: makeBuffer(ctx, [1, 2]) })
    throwsName(() => (s.buffer = makeBuffer(ctx, [3, 4])), 'InvalidStateError')
  })

  it('options.buffer: null is allowed and does not consume [[buffer set]]', () => {
    const ctx = makeCtx()
    const s = new PlecoAudioBufferSourceNode(ctx, { buffer: null })
    expect(s.buffer).toBe(null)
    expect(() => (s.buffer = makeBuffer(ctx, [1, 2]))).not.toThrow()
  })

  it('loop attribute setters are strict: non-boolean loop / non-finite loopStart/loopEnd throw TypeError', () => {
    const s = new PlecoAudioBufferSourceNode(makeCtx())
    expect(() => (s.loop = 'yes')).toThrow(TypeError)
    expect(() => (s.loopStart = NaN)).toThrow(TypeError)
    expect(() => (s.loopEnd = -Infinity)).toThrow(TypeError)
    s.loopStart = -1 // negative is legal (spec: looping will begin at 0)
    expect(s.loopStart).toBe(-1)
  })
})

describe('AudioBufferSourceNode — playbackRate/detune are k-rate-fixed AudioParams', () => {
  it('automationRate is k-rate on both, and the rate is FIXED: a-rate assignment throws InvalidStateError', () => {
    const s = new PlecoAudioBufferSourceNode(makeCtx())
    expect(s.playbackRate.automationRate).toBe('k-rate')
    expect(s.detune.automationRate).toBe('k-rate')
    throwsName(() => (s.playbackRate.automationRate = 'a-rate'), 'InvalidStateError')
    throwsName(() => (s.detune.automationRate = 'a-rate'), 'InvalidStateError')
  })

  it('invalid enum ASSIGNMENT to automationRate is silently ignored (WebIDL enum attribute)', () => {
    const s = new PlecoAudioBufferSourceNode(makeCtx())
    s.playbackRate.automationRate = 'bogus'
    expect(s.playbackRate.automationRate).toBe('k-rate')
  })
})

describe('AudioBufferSourceNode — start(when, offset, duration) validation', () => {
  it('negative offset or duration throws RangeError, consuming nothing', () => {
    const ctx = makeCtx()
    const s = makeSource(ctx, ramp(8))
    expect(() => s.start(0, -0.5)).toThrow(RangeError)
    expect(() => s.start(0, 0, -1)).toThrow(RangeError)
    expect(() => s.start(0)).not.toThrow() // the failed calls consumed nothing
  })

  it('a negative start time throws RangeError, consuming nothing', () => {
    const ctx = makeCtx()
    const s = makeSource(ctx, ramp(8))
    expect(() => s.start(-0.5)).toThrow(RangeError)
    expect(() => s.start(0)).not.toThrow() // the failed call consumed nothing
  })

  it('non-finite offset/duration throws TypeError (WebIDL restricted double)', () => {
    const ctx = makeCtx()
    const s = makeSource(ctx, ramp(8))
    expect(() => s.start(0, NaN)).toThrow(TypeError)
    expect(() => s.start(0, Infinity)).toThrow(TypeError)
    expect(() => s.start(0, 0, NaN)).toThrow(TypeError)
    expect(() => s.start(0, '1')).toThrow(TypeError) // pleco strictness: no ToNumber coercion
  })

  it('step order: TypeError (arg conversion) precedes InvalidStateError, which precedes RangeError', () => {
    const ctx = makeCtx()
    const s = makeSource(ctx, ramp(8))
    s.start(0)
    expect(() => s.start(0, NaN)).toThrow(TypeError) // conversion layer runs first
    throwsName(() => s.start(0, -1), 'InvalidStateError') // started check precedes the constraint
    throwsName(() => s.start(0, 1), 'InvalidStateError')
  })
})

describe('AudioBufferSourceNode — offset and duration playback', () => {
  it('offset supplies the initial playhead: start(0, 4 frames) plays buf[4..] and ends', async () => {
    const ctx = makeCtx()
    const s = makeSource(ctx, ramp(16))
    let ended = 0
    s.onended = () => ended++
    s.start(0, t(4))
    const out = renderOne(ctx)
    for (let i = 0; i < 12; i++) expect(out[i]).toBe(5 + i) // buf[4]..buf[15]
    expect(out[12]).toBe(0)
    await flushMicrotasks()
    expect(ended).toBe(1)
  })

  it('sub-sample offset: start(0, 0.5 frames) interpolates every output frame', () => {
    const ctx = makeCtx()
    const s = makeSource(ctx, [0, 10, 20, 30, 40, 50, 60, 70])
    s.start(0, 0.5 / SR)
    const out = renderOne(ctx)
    expect(out[0]).toBe(5) // (0 + 10)/2
    expect(out[1]).toBe(15)
    expect(out[5]).toBe(55)
    expect(out[6]).toBe(65) // (60 + 70)/2 at cursor 6.5
    // cursor 7.5: the last sample buf[7]=70 with its continuation linearly
    // extrapolated past the buffer end (2·70 − buf[6] = 80) at frac 0.5 → 75.
    expect(out[7]).toBe(75)
    expect(out[8]).toBe(0) // cursor 8.5 ≥ len → exhausted
  })

  it('offset is silently clamped to the buffer duration: a huge offset exhausts immediately', async () => {
    const ctx = makeCtx()
    const s = makeSource(ctx, ramp(8))
    let ended = 0
    s.onended = () => ended++
    s.start(0, 999)
    const out = renderOne(ctx)
    expect(Array.from(out)).toEqual(new Array(RENDER_QUANTUM).fill(0))
    await flushMicrotasks()
    expect(ended).toBe(1)
  })

  it('duration is seconds of BUFFER CONTENT: duration 10 frames at rate 1 → exactly 10 output frames', async () => {
    const ctx = makeCtx()
    const s = makeSource(ctx, ramp(64))
    let ended = 0
    s.onended = () => ended++
    s.start(0, 0, t(10))
    const out = renderOne(ctx)
    expect(out[9]).toBe(10)
    expect(out[10]).toBe(0)
    await flushMicrotasks()
    expect(ended).toBe(1)
  })

  it('duration at half speed: 5 frames of content at rate 0.5 → 10 output frames (spec example)', () => {
    const ctx = makeCtx()
    const s = makeSource(ctx, Array.from({ length: 32 }, (_, i) => i), { playbackRate: 0.5 })
    s.start(0, 0, t(5))
    const out = renderOne(ctx)
    for (let i = 0; i < 10; i++) expect(out[i]).toBe(i * 0.5) // interpolated half-steps
    expect(out[10]).toBe(0)
  })

  it('duration counts whole loop iterations: 4-frame full-buffer loop, duration 8 frames → 2 passes then ended', async () => {
    const ctx = makeCtx()
    const s = makeSource(ctx, [1, 2, 3, 4], { loop: true })
    let ended = 0
    s.onended = () => ended++
    s.start(0, 0, t(8))
    const out = renderOne(ctx)
    expect(Array.from(out.slice(0, 9))).toEqual([1, 2, 3, 4, 1, 2, 3, 4, 0])
    await flushMicrotasks()
    expect(ended).toBe(1)
  })
})

describe('AudioBufferSourceNode — loop / loopStart / loopEnd', () => {
  it('default endpoints (0, 0) loop the whole buffer', () => {
    const ctx = makeCtx()
    const s = makeSource(ctx, ramp(8), { loop: true })
    s.start(0)
    const out = renderOne(ctx)
    for (let i = 0; i < RENDER_QUANTUM; i++) expect(out[i]).toBe((i % 8) + 1)
  })

  it('loopStart/loopEnd bound the loop body [loopStart, loopEnd): head plays once, region repeats', () => {
    const ctx = makeCtx()
    const s = makeSource(ctx, ramp(16), { loop: true, loopStart: t(4), loopEnd: t(8) })
    s.start(0)
    const out = renderOne(ctx)
    expect(Array.from(out.slice(0, 4))).toEqual([1, 2, 3, 4]) // head, played once
    for (let i = 4; i < RENDER_QUANTUM; i++) expect(out[i]).toBe(5 + ((i - 4) % 4)) // 5,6,7,8 forever
  })

  it('invalid endpoints (loopStart ≥ loopEnd) fall back to the whole buffer', () => {
    const ctx = makeCtx()
    const s = makeSource(ctx, ramp(8), { loop: true, loopStart: t(6), loopEnd: t(2) })
    s.start(0)
    const out = renderOne(ctx)
    for (let i = 0; i < RENDER_QUANTUM; i++) expect(out[i]).toBe((i % 8) + 1)
  })

  it('loopEnd beyond the buffer clamps to the buffer end', () => {
    const ctx = makeCtx()
    const s = makeSource(ctx, ramp(8), { loop: true, loopStart: t(4), loopEnd: t(100) })
    s.start(0)
    const out = renderOne(ctx)
    expect(Array.from(out.slice(0, 12))).toEqual([1, 2, 3, 4, 5, 6, 7, 8, 5, 6, 7, 8])
  })

  it('loop attributes are k-rate: clearing loop mid-flight plays out to the buffer end, then ends', async () => {
    const ctx = makeCtx()
    const s = makeSource(ctx, ramp(RENDER_QUANTUM + 32), { loop: true })
    let ended = 0
    s.onended = () => ended++
    s.start(0)
    renderOne(ctx) // quantum 1: frames 1..128, still heading toward the loop end
    s.loop = false
    const out = renderOne(ctx)
    for (let i = 0; i < 32; i++) expect(out[i]).toBe(RENDER_QUANTUM + 1 + i) // remaining tail
    expect(out[32]).toBe(0)
    await flushMicrotasks()
    expect(ended).toBe(1)
  })

  it('sub-sample loopEnd: the wraparound is cursor = loopStart + ((cursor − loopStart) mod span)', () => {
    const ctx = makeCtx()
    const s = makeSource(ctx, [0, 1, 2, 3, 4, 5, 6, 7], { loop: true, loopEnd: 2.5 / SR })
    s.start(0)
    const out = renderOne(ctx)
    // cursor: 0,1,2 → 3 wraps to 0.5 → 1.5 → 2.5 wraps to 0 → period 5
    expect(Array.from(out.slice(0, 10))).toEqual([0, 1, 2, 0.5, 1.5, 0, 1, 2, 0.5, 1.5])
  })

  it('loop splice interpolation: a fractional read across loopEnd interpolates against the wrapped neighbor', () => {
    const ctx = makeCtx()
    const s = makeSource(ctx, [0, 1, 2, 3, 4, 5, 6, 7], {
      loop: true,
      loopEnd: 2.5 / SR,
      playbackRate: 0.75,
    })
    s.start(0)
    const out = renderOne(ctx)
    // cursors 0, .75, 1.5, 2.25, 3→wrap .5
    // at 2.25 the neighbor frame 3 ≥ loopEnd 2.5 wraps to position 0.5 (value 0.5):
    // v = 2 + (0.5 − 2)·0.25 = 1.625
    expect(Array.from(out.slice(0, 5))).toEqual([0, 0.75, 1.5, 1.625, 0.5])
  })

  it('offset ≥ loopEnd with positive rate: playback begins AT loopEnd (spec algorithm, loop never entered)', async () => {
    const ctx = makeCtx()
    const s = makeSource(ctx, ramp(16), { loop: true, loopStart: t(4), loopEnd: t(8) })
    let ended = 0
    s.onended = () => ended++
    s.start(0, t(12))
    const out = renderOne(ctx)
    // algorithm-literal: offset clamps to loopEnd (frame 8), enteredLoop never
    // becomes true for a forward playhead, so the tail plays out and the source ends
    expect(Array.from(out.slice(0, 9))).toEqual([9, 10, 11, 12, 13, 14, 15, 16, 0])
    await flushMicrotasks()
    expect(ended).toBe(1)
  })

  it('negative playbackRate loops backward from loopEnd side: wrap adds the span below loopStart', () => {
    const ctx = makeCtx()
    const s = makeSource(ctx, ramp(16), {
      loop: true,
      loopStart: t(2),
      loopEnd: t(6),
      playbackRate: -1,
    })
    s.start(0, t(4))
    const out = renderOne(ctx)
    // cursor 4,3,2 then 1 < loopStart wraps to 5 → data 5,4,3,6 repeating
    expect(Array.from(out.slice(0, 8))).toEqual([5, 4, 3, 6, 5, 4, 3, 6])
  })

  it('negative playbackRate without loop plays back to the buffer head, then ends', async () => {
    const ctx = makeCtx()
    const s = makeSource(ctx, ramp(16), { playbackRate: -1 })
    let ended = 0
    s.onended = () => ended++
    s.start(0, t(4))
    const out = renderOne(ctx)
    expect(Array.from(out.slice(0, 6))).toEqual([5, 4, 3, 2, 1, 0])
    await flushMicrotasks()
    expect(ended).toBe(1)
  })

  it('stop() mid-loop silences at the stop frame and fires ended', async () => {
    const ctx = makeCtx()
    const s = makeSource(ctx, ramp(4), { loop: true })
    let ended = 0
    s.onended = () => ended++
    s.start(0)
    s.stop(t(20))
    const out = renderOne(ctx)
    expect(out[19]).toBe(4) // frame 19 = 5th loop pass, buf[3]
    expect(out[20]).toBe(0)
    await flushMicrotasks()
    expect(ended).toBe(1)
  })
})

describe('AudioBufferSourceNode — computedPlaybackRate (k-rate compound parameter)', () => {
  it('detune 1200 cents doubles the rate: computedPlaybackRate = 1 · 2^(1200/1200) = 2', () => {
    const ctx = makeCtx()
    const s = makeSource(ctx, Array.from({ length: 64 }, (_, i) => i), { detune: 1200 })
    s.start(0)
    const out = renderOne(ctx)
    for (let i = 0; i < 32; i++) expect(out[i]).toBe(2 * i)
  })

  it('playbackRate and detune compound: rate 2 · 2^(−1200/1200) = 1', () => {
    const ctx = makeCtx()
    const s = makeSource(ctx, ramp(32), { playbackRate: 2, detune: -1200 })
    s.start(0)
    const out = renderOne(ctx)
    for (let i = 0; i < 32; i++) expect(out[i]).toBe(i + 1)
  })

  it('k-rate sampling at the block start: automation scheduled mid-block does NOT split the block', () => {
    const ctx = makeCtx()
    const s = makeSource(
      ctx,
      Array.from({ length: 4 * RENDER_QUANTUM }, (_, i) => i),
    )
    s.playbackRate.setValueAtTime(1, 0)
    s.playbackRate.setValueAtTime(2, t(64)) // mid-quantum — k-rate ignores it until the next block
    s.start(0)
    const q0 = renderOne(ctx)
    for (let i = 0; i < RENDER_QUANTUM; i++) expect(q0[i]).toBe(i) // whole block at rate 1
    const q1 = renderOne(ctx)
    for (let i = 0; i < 16; i++) expect(q1[i]).toBe(RENDER_QUANTUM + 2 * i) // next block at rate 2
  })

  it('a block-aligned setValueAtTime takes effect exactly at that quantum', () => {
    const ctx = makeCtx()
    const s = makeSource(
      ctx,
      Array.from({ length: 4 * RENDER_QUANTUM }, (_, i) => i),
    )
    s.playbackRate.setValueAtTime(1, 0)
    s.playbackRate.setValueAtTime(2, t(RENDER_QUANTUM))
    s.start(0)
    const q0 = renderOne(ctx)
    expect(q0[RENDER_QUANTUM - 1]).toBe(RENDER_QUANTUM - 1)
    const q1 = renderOne(ctx)
    expect(q1[0]).toBe(RENDER_QUANTUM) // cursor carried over
    expect(q1[1]).toBe(RENDER_QUANTUM + 2) // now stepping by 2
  })

  it('buffer sampleRate ≠ context rate: a half-rate buffer steps 0.5 with interpolated midpoints', () => {
    const ctx = makeCtx()
    const s = new PlecoAudioBufferSourceNode(ctx)
    s.buffer = makeBuffer(
      ctx,
      Array.from({ length: 32 }, (_, i) => 2 * i),
      SR / 2,
    )
    s.connect(ctx.destination)
    s.start(0)
    const out = renderOne(ctx)
    for (let i = 0; i < 32; i++) expect(out[i]).toBe(i) // 0, 1(interp), 2, 3(interp)...
  })

  it('playbackRate 0 holds the playhead: sample-and-hold forever, never ends', () => {
    const ctx = makeCtx()
    const s = makeSource(ctx, ramp(16), { playbackRate: 0 })
    s.start(0, t(4))
    const q0 = renderOne(ctx)
    const q1 = renderOne(ctx)
    for (let i = 0; i < RENDER_QUANTUM; i++) {
      expect(q0[i]).toBe(5)
      expect(q1[i]).toBe(5)
    }
  })
})

describe('AudioBufferSourceNode — null buffer and output-width lifecycle', () => {
  it('a started source with a null buffer outputs one channel of silence and ends at the first rendered quantum', async () => {
    const ctx = makeCtx()
    const s = makeSource(ctx, null)
    let ended = 0
    s.onended = () => ended++
    s.start(0)
    const out = renderOne(ctx)
    expect(Array.from(out)).toEqual(new Array(RENDER_QUANTUM).fill(0))
    expect(s._cacheBlock.numberOfChannels).toBe(1)
    await flushMicrotasks()
    expect(ended).toBe(1)
  })

  it('a buffer assigned after start() but before rendering plays (acquire-on-set with start already called)', () => {
    const ctx = makeCtx()
    const s = new PlecoAudioBufferSourceNode(ctx)
    s.connect(ctx.destination)
    s.start(0)
    s.buffer = makeBuffer(ctx, ramp(8))
    const out = renderOne(ctx)
    expect(Array.from(out.slice(0, 8))).toEqual([1, 2, 3, 4, 5, 6, 7, 8])
  })

  it('after the source ends, the output collapses to a single silent channel at the next quantum', async () => {
    const ctx = makeCtx(2)
    const s = new PlecoAudioBufferSourceNode(ctx)
    const buf = ctx.createBuffer(2, 8, SR)
    buf.getChannelData(0).fill(1)
    buf.getChannelData(1).fill(2)
    s.buffer = buf
    s.connect(ctx.destination)
    s.start(0)
    ctx.renderQuantum() // ends mid-quantum (8 < 128)
    expect(s._cacheBlock.numberOfChannels).toBe(2) // the ending quantum keeps the buffer width
    ctx.renderQuantum()
    expect(s._cacheBlock.numberOfChannels).toBe(1) // next quantum: one channel of silence
    await flushMicrotasks()
  })
})
