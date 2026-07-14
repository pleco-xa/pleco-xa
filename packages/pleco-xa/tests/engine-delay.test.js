/**
 * tests/engine-delay.test.js — PlecoDelayNode + the spec cycle rule (P11).
 *
 * Spec § The DelayNode Interface: a-rate delayTime clamped [0, maxDelayTime],
 * DelayOptions.maxDelayTime in (0, 180) with NotSupportedError, per-channel
 * ring buffers with linear-interpolated fractional reads, and the
 * § rendering-loop cycle rule — a cycle is legal only when it contains a
 * DelayNode (whose delayTime is then clamped to a minimum of one render
 * quantum, spec § DelayNode.delayTime); every other cycle is muted whole.
 *
 * The sample rate is 32768 Hz and all delay times are dyadic so every
 * expectation is EXACT in float32 — sample-exact impulse positions, exact
 * 0.5^n echo amplitudes, exact 0.5/0.5 fractional-read splits.
 */
import { describe, it, expect } from 'vitest'
import { PlecoOfflineAudioContext } from '../src/engine/xa-offline-context.js'
import { PlecoDelayNode } from '../src/engine/nodes/xa-delay.js'
import { PlecoAudioParam } from '../src/engine/xa-param.js'
import { RENDER_QUANTUM } from '../src/engine/xa-constants.js'

const SR = 32768 // dyadic sample rate: k/SR delay times are exact in float32

const makeCtx = (length = RENDER_QUANTUM, numberOfChannels = 1) =>
  new PlecoOfflineAudioContext({ numberOfChannels, length, sampleRate: SR })

/** A started AudioBufferSourceNode playing a mono buffer with a single 1.0 at `frame`. */
function impulseSource(ctx, frame = 0, length = RENDER_QUANTUM) {
  const buf = ctx.createBuffer(1, length, SR)
  buf.getChannelData(0)[frame] = 1
  const src = ctx.createBufferSource()
  src.buffer = buf
  src.start(0)
  return src
}

/** A started source playing one quantum of a constant DC value. */
function dcSource(ctx, value) {
  const buf = ctx.createBuffer(1, RENDER_QUANTUM, SR)
  buf.getChannelData(0).fill(value)
  const src = ctx.createBufferSource()
  src.buffer = buf
  src.start(0)
  return src
}

/** Index → value map of every non-zero sample. */
function nonZero(data) {
  const found = {}
  for (let i = 0; i < data.length; i++) if (data[i] !== 0) found[i] = data[i]
  return found
}

describe('PlecoDelayNode — constructor surface (DelayOptions)', () => {
  it('defaults: a-rate delayTime param with defaultValue 0, range [0, 1], spec node shape', () => {
    const d = new PlecoDelayNode(makeCtx())
    expect(d.delayTime).toBeInstanceOf(PlecoAudioParam)
    expect(d.delayTime.defaultValue).toBe(0)
    expect(d.delayTime.value).toBe(0)
    expect(d.delayTime.minValue).toBe(0)
    expect(d.delayTime.maxValue).toBe(1) // default maxDelayTime = 1
    expect(d.delayTime.automationRate).toBe('a-rate')
    expect(d.numberOfInputs).toBe(1)
    expect(d.numberOfOutputs).toBe(1)
    expect(d.channelCount).toBe(2)
    expect(d.channelCountMode).toBe('max')
    expect(d.channelInterpretation).toBe('speakers')
  })

  it('maxDelayTime becomes delayTime.maxValue', () => {
    const d = new PlecoDelayNode(makeCtx(), { maxDelayTime: 2 })
    expect(d.delayTime.maxValue).toBe(2)
  })

  it('DelayOptions.delayTime seeds the param value (float32-rounded)', () => {
    const d = new PlecoDelayNode(makeCtx(), { delayTime: 0.1 })
    expect(d.delayTime.value).toBe(Math.fround(0.1))
  })

  it('maxDelayTime at or below 0 → NotSupportedError', () => {
    for (const bad of [0, -1]) {
      let err = null
      try {
        new PlecoDelayNode(makeCtx(), { maxDelayTime: bad })
      } catch (e) {
        err = e
      }
      expect(err).toBeInstanceOf(DOMException)
      expect(err.name).toBe('NotSupportedError')
    }
  })

  it('maxDelayTime at or above 180 (three minutes) → NotSupportedError', () => {
    for (const bad of [180, 181, 1e6]) {
      let err = null
      try {
        new PlecoDelayNode(makeCtx(), { maxDelayTime: bad })
      } catch (e) {
        err = e
      }
      expect(err).toBeInstanceOf(DOMException)
      expect(err.name).toBe('NotSupportedError')
    }
  })

  it('maxDelayTime just inside the bounds is accepted', () => {
    expect(() => new PlecoDelayNode(makeCtx(), { maxDelayTime: 179.999 })).not.toThrow()
    expect(() => new PlecoDelayNode(makeCtx(), { maxDelayTime: 1e-4 })).not.toThrow()
  })

  it('non-finite maxDelayTime / delayTime → TypeError (WebIDL restricted double)', () => {
    for (const bad of [NaN, Infinity, -Infinity, '1']) {
      expect(() => new PlecoDelayNode(makeCtx(), { maxDelayTime: bad })).toThrow(TypeError)
      expect(() => new PlecoDelayNode(makeCtx(), { delayTime: bad })).toThrow(TypeError)
    }
  })

  it('invalid enum in the constructor dictionary → TypeError (house WebIDL rule)', () => {
    expect(() => new PlecoDelayNode(makeCtx(), { channelCountMode: 'bogus' })).toThrow(TypeError)
    expect(() => new PlecoDelayNode(makeCtx(), { channelInterpretation: 'bogus' })).toThrow(TypeError)
  })

  it('null options convert to the empty dictionary (WebIDL) — constructs with defaults', () => {
    const d = new PlecoDelayNode(makeCtx(), null)
    expect(d.delayTime.value).toBe(0)
    expect(d.delayTime.maxValue).toBe(1) // default maxDelayTime = 1
  })

  it('a non-object options argument → TypeError (WebIDL dictionary conversion)', () => {
    for (const bad of [42, 'x', true]) {
      expect(() => new PlecoDelayNode(makeCtx(), bad)).toThrow(TypeError)
    }
  })
})

describe('PlecoDelayNode — delay-line DSP (no cycle)', () => {
  it('delayTime 0 is an exact passthrough (write-then-read)', () => {
    const ctx = makeCtx(RENDER_QUANTUM)
    const d = new PlecoDelayNode(ctx)
    impulseSource(ctx, 3).connect(d)
    d.connect(ctx.destination)
    const out = ctx.renderSync().getChannelData(0)
    expect(nonZero(out)).toEqual({ 3: 1 })
  })

  it('integer delay: an impulse re-emerges exactly delayTime·sampleRate frames later (tail after the source ends)', () => {
    const ctx = makeCtx(512)
    const d = new PlecoDelayNode(ctx)
    d.delayTime.value = 256 / SR // 256 samples, exact in float32
    impulseSource(ctx, 0).connect(d) // source buffer is 128 frames — long gone by frame 256
    d.connect(ctx.destination)
    const out = ctx.renderSync().getChannelData(0)
    expect(nonZero(out)).toEqual({ 256: 1 })
  })

  it('fractional delay: 64.5 samples splits the impulse 0.5/0.5 across adjacent frames (linear interpolation)', () => {
    const ctx = makeCtx(RENDER_QUANTUM)
    const d = new PlecoDelayNode(ctx)
    d.delayTime.value = 129 / 65536 // 64.5 samples, exact in float32
    impulseSource(ctx, 0).connect(d)
    d.connect(ctx.destination)
    const out = ctx.renderSync().getChannelData(0)
    expect(nonZero(out)).toEqual({ 64: 0.5, 65: 0.5 })
  })

  it('delayTime is clamped to maxDelayTime at output time; the value attribute stays unclamped', () => {
    const ctx = makeCtx(512)
    const d = new PlecoDelayNode(ctx, { maxDelayTime: 256 / SR })
    d.delayTime.value = 0.5 // way past maxDelayTime — nominal-range clamp applies at output
    impulseSource(ctx, 0).connect(d)
    d.connect(ctx.destination)
    const out = ctx.renderSync().getChannelData(0)
    expect(nonZero(out)).toEqual({ 256: 1 })
    expect(d.delayTime.value).toBe(0.5) // [[current value]] reporting is unclamped
  })

  it('a-rate: a mid-block setValueAtTime step changes the read offset per sample-frame', () => {
    const ctx = makeCtx(256)
    const d = new PlecoDelayNode(ctx)
    d.delayTime.setValueAtTime(0, 0)
    d.delayTime.setValueAtTime(64 / SR, 64 / SR) // step INSIDE the first render quantum
    impulseSource(ctx, 0).connect(d)
    d.connect(ctx.destination)
    const out = ctx.renderSync().getChannelData(0)
    // frame 0: delay 0 → passthrough; frame 64: delay 64 → reads frame 0 again
    expect(nonZero(out)).toEqual({ 0: 1, 64: 1 })
  })

  it('k-rate: the whole quantum uses the first sample-frame value', () => {
    const ctx = makeCtx(256)
    const d = new PlecoDelayNode(ctx)
    d.delayTime.automationRate = 'k-rate'
    d.delayTime.setValueAtTime(0, 0)
    d.delayTime.setValueAtTime(64 / SR, 64 / SR) // ignored until the next quantum's first frame
    impulseSource(ctx, 0).connect(d)
    d.connect(ctx.destination)
    const out = ctx.renderSync().getChannelData(0)
    expect(nonZero(out)).toEqual({ 0: 1 }) // no re-read at frame 64
  })

  it('stereo: per-channel ring buffers delay each channel independently; output width = input width', () => {
    const ctx = makeCtx(384, 2)
    const d = new PlecoDelayNode(ctx)
    d.delayTime.value = RENDER_QUANTUM / SR
    const buf = ctx.createBuffer(2, RENDER_QUANTUM, SR)
    buf.getChannelData(0)[0] = 1
    buf.getChannelData(1)[10] = 1
    const src = ctx.createBufferSource()
    src.buffer = buf
    src.start(0)
    src.connect(d)
    d.connect(ctx.destination)
    const out = ctx.renderSync()
    expect(nonZero(out.getChannelData(0))).toEqual({ 128: 1 })
    expect(nonZero(out.getChannelData(1))).toEqual({ 138: 1 })
  })

  it('the output width tracks the DELAYED input; still-silent history reads as mono (spec § DelayNode, issue #25)', () => {
    // A one-quantum delay fed a stereo block. The first quantum reads history
    // that predates any input → a single channel of silence (NOT the stereo
    // width of the input that has already arrived); the next quantum reads
    // back that stereo block → stereo output. (Resolution of web-audio-api
    // issue #25: DelayNode output channelCount matches the delayed input.)
    const ctx = makeCtx(2 * RENDER_QUANTUM, 2)
    const d = new PlecoDelayNode(ctx)
    d.delayTime.value = RENDER_QUANTUM / SR // exactly one render quantum
    const buf = ctx.createBuffer(2, RENDER_QUANTUM, SR)
    buf.getChannelData(0).fill(0.5)
    buf.getChannelData(1).fill(0.25)
    const src = ctx.createBufferSource()
    src.buffer = buf
    src.start(0)
    src.connect(d)
    d.connect(ctx.destination)

    ctx.renderQuantum() // quantum 0 — reads unwritten history
    expect(d._cacheBlock.numberOfChannels).toBe(1)
    expect(nonZero(d._cacheBlock.getChannelData(0))).toEqual({})

    ctx.renderQuantum() // quantum 1 — reads back the delayed stereo block
    expect(d._cacheBlock.numberOfChannels).toBe(2)
    expect(d._cacheBlock.getChannelData(0)[0]).toBe(0.5)
    expect(d._cacheBlock.getChannelData(1)[0]).toBe(0.25)
  })

  it('the ring grows to the widest channel count seen and never shrinks (grow-only capacity)', () => {
    const d = new PlecoDelayNode(makeCtx())
    d._ensureCapacity(1)
    expect(d._ring.length).toBe(1)
    d._ensureCapacity(2)
    expect(d._ring.length).toBe(2)
    d._ensureCapacity(1) // never shrinks below the widest layout seen
    expect(d._ring.length).toBe(2)
  })
})

describe('the cycle rule — cycles are legal only when they contain a DelayNode', () => {
  /**
   * The canonical feedback echo:
   *   impulse → g → destination
   *             g → delay → fb(0.5) → g
   * Expected: 0.5^n echo train spaced one delay apart.
   */
  function feedbackEcho(length, delaySeconds) {
    const ctx = makeCtx(length)
    const g = ctx.createGain()
    const delay = new PlecoDelayNode(ctx)
    const fb = ctx.createGain()
    fb.gain.value = 0.5
    if (delaySeconds !== null) delay.delayTime.value = delaySeconds
    impulseSource(ctx, 0).connect(g)
    g.connect(ctx.destination)
    g.connect(delay)
    delay.connect(fb)
    fb.connect(g) // the cycle: g → delay → fb → g
    return ctx.renderSync().getChannelData(0)
  }

  it('a DelayNode cycle renders (not muted): one-quantum feedback echo decays by 0.5 per pass', () => {
    const out = feedbackEcho(5 * RENDER_QUANTUM, RENDER_QUANTUM / SR)
    expect(nonZero(out)).toEqual({ 0: 1, 128: 0.5, 256: 0.25, 384: 0.125, 512: 0.0625 })
  })

  it('inside a cycle, delayTime is clamped to a minimum of ONE render quantum (spec § DelayNode.delayTime)', () => {
    const out = feedbackEcho(4 * RENDER_QUANTUM, null) // delayTime stays 0
    expect(nonZero(out)).toEqual({ 0: 1, 128: 0.5, 256: 0.25, 384: 0.125 })
  })

  it('a longer in-cycle delay is honored as-is (no clamp above one quantum)', () => {
    const out = feedbackEcho(6 * RENDER_QUANTUM, (2 * RENDER_QUANTUM) / SR)
    expect(nonZero(out)).toEqual({ 0: 1, 256: 0.5, 512: 0.25 })
  })

  it('re-entry at a NON-delay node: the deferred write commits this-quantum data, not a stale memo', () => {
    // Same cycle as feedbackEcho (g → delay → fb → g) but the destination taps
    // fb, so the pull re-enters the cycle at fb and g consumes fb's
    // PREVIOUS-quantum provisional. The deferred DelayWriter flush must
    // invalidate g's tainted memo and recompute it against the settled ring
    // read (spec § DelayNode processing: the DelayReader is a source) — the
    // echo train through fb is 0.5^n every quantum. Before the stale-memo
    // invalidation this rendered {128: 0.5, 384: 0.25} (echoes at DOUBLE
    // spacing, alternate quanta writing silence into the ring).
    const ctx = makeCtx(4 * RENDER_QUANTUM)
    const g = ctx.createGain()
    const delay = new PlecoDelayNode(ctx)
    const fb = ctx.createGain()
    fb.gain.value = 0.5
    delay.delayTime.value = RENDER_QUANTUM / SR
    impulseSource(ctx, 0).connect(g)
    g.connect(delay)
    delay.connect(fb)
    fb.connect(g) // the cycle: g → delay → fb → g
    fb.connect(ctx.destination) // tap the cycle at fb, NOT at g
    const out = ctx.renderSync().getChannelData(0)
    expect(nonZero(out)).toEqual({ 128: 0.5, 256: 0.25, 384: 0.125 })
  })

  it('destination tapping the delay directly (re-entry AT the delay) gets the exact ring read', () => {
    // impulse → g → delay → destination, with delay → fb(0.5) → g feedback.
    const ctx = makeCtx(3 * RENDER_QUANTUM)
    const g = ctx.createGain()
    const delay = new PlecoDelayNode(ctx)
    const fb = ctx.createGain()
    fb.gain.value = 0.5
    delay.delayTime.value = RENDER_QUANTUM / SR
    impulseSource(ctx, 0).connect(g)
    g.connect(delay)
    delay.connect(ctx.destination)
    delay.connect(fb)
    fb.connect(g)
    const out = ctx.renderSync().getChannelData(0)
    expect(nonZero(out)).toEqual({ 128: 1, 256: 0.5 })
  })

  it('a DelayNode-free cycle mutes EVERY node in the cycle — a fed cycle node contributes silence', () => {
    // dc(0.5) → g1 → destination with g1 ⇄ g2 cycle; dc(0.25) → g3 → destination stays live.
    const ctx = makeCtx(RENDER_QUANTUM)
    const g1 = ctx.createGain()
    const g2 = ctx.createGain()
    const g3 = ctx.createGain()
    dcSource(ctx, 0.5).connect(g1)
    g1.connect(g2)
    g2.connect(g1) // the illegal cycle
    g1.connect(ctx.destination)
    dcSource(ctx, 0.25).connect(g3)
    g3.connect(ctx.destination)
    const out = ctx.renderSync().getChannelData(0)
    // g1 is muted whole (NOT source + silence): only g3's 0.25 reaches the sink.
    expect(Array.from(out)).toEqual(new Array(RENDER_QUANTUM).fill(0.25))
  })

  it('an unstable delay cycle (feedback gain 1) keeps circulating without decay', () => {
    const ctx = makeCtx(4 * RENDER_QUANTUM)
    const g = ctx.createGain()
    const delay = new PlecoDelayNode(ctx)
    delay.delayTime.value = RENDER_QUANTUM / SR
    impulseSource(ctx, 0).connect(g)
    g.connect(ctx.destination)
    g.connect(delay)
    delay.connect(g) // unity feedback
    const out = ctx.renderSync().getChannelData(0)
    expect(nonZero(out)).toEqual({ 0: 1, 128: 1, 256: 1, 384: 1 })
  })

  it('the deferred-write queue drains every quantum (context registry is empty after a render)', () => {
    const ctx = makeCtx(2 * RENDER_QUANTUM)
    const g = ctx.createGain()
    const delay = new PlecoDelayNode(ctx)
    impulseSource(ctx, 0).connect(g)
    g.connect(delay)
    delay.connect(g)
    g.connect(ctx.destination)
    ctx.renderSync()
    expect(ctx._delayDeferredWrites).toEqual([])
  })
})
