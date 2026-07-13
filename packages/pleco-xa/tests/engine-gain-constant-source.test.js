import { describe, it, expect } from 'vitest'
import { PlecoBaseContext } from '../src/engine/xa-base-context.js'
import { PlecoGainNode } from '../src/engine/nodes/xa-gain.js'
import { PlecoConstantSourceNode } from '../src/engine/nodes/xa-constant-source.js'
import { PlecoScheduledSourceNode } from '../src/engine/xa-node.js'
import { PlecoAudioParam } from '../src/engine/xa-param.js'
import { RENDER_QUANTUM } from '../src/engine/xa-constants.js'

// P09 — GainNode: GainOptions {gain} + AudioNodeOptions constructor, readonly
// a-rate `gain` AudioParam, and the per-sample multiply against the REAL
// automation curve (spec § The GainNode Interface: "Each sample of each
// channel of the input data of the GainNode MUST be multiplied by the
// computedValue of the gain AudioParam"). Plus the NEW ConstantSourceNode
// (spec § The ConstantSourceNode Interface): AudioScheduledSourceNode subclass
// with a readonly `offset` AudioParam defaulting to 1, a single MONO output,
// and service as a modulation source into other AudioParams.

// SR chosen so one render quantum is exactly 128/8192 = 0.015625 s (binary-exact).
const SR = 8192
const BLOCK = RENDER_QUANTUM / SR // 0.015625

/** Frames-to-seconds for scheduling at exact (possibly fractional) frame positions. */
const t = (frames) => frames / SR

const F32_MAX = 3.4028234663852886e38

const makeCtx = (numberOfChannels = 1) => new PlecoBaseContext({ sampleRate: SR, numberOfChannels })

/** A started buffer-source producing a constant `value` on `channels` channels. */
function makeConstSource(context, value, channels = 1, length = RENDER_QUANTUM * 16) {
  const buf = context.createBuffer(channels, length, SR)
  for (let c = 0; c < channels; c++) {
    buf.getChannelData(c).fill(Array.isArray(value) ? value[c] : value)
  }
  const s = context.createBufferSource()
  s.buffer = buf
  s.start(0)
  return s
}

/** Awaiting one resolved promise runs every microtask queued before it — the ended dispatch included. */
const flushMicrotasks = () => Promise.resolve()

describe('PlecoGainNode — GainOptions + AudioNodeOptions constructor', () => {
  it('defaults: readonly a-rate gain param (defaultValue 1, full float32 nominal range) + the spec node shape', () => {
    const g = new PlecoGainNode(makeCtx())
    expect(g.gain).toBeInstanceOf(PlecoAudioParam)
    expect(g.gain.defaultValue).toBe(1)
    expect(g.gain.value).toBe(1)
    expect(g.gain.automationRate).toBe('a-rate')
    expect(g.gain.minValue).toBe(-F32_MAX)
    expect(g.gain.maxValue).toBe(F32_MAX)
    // Spec node table: 1 in / 1 out, channelCount 2, mode 'max', interpretation 'speakers'.
    expect(g.numberOfInputs).toBe(1)
    expect(g.numberOfOutputs).toBe(1)
    expect(g.channelCount).toBe(2)
    expect(g.channelCountMode).toBe('max')
    expect(g.channelInterpretation).toBe('speakers')
  })

  it('gain is a READONLY attribute — assignment throws in strict mode', () => {
    const g = new PlecoGainNode(makeCtx())
    expect(() => {
      g.gain = 0
    }).toThrow(TypeError)
  })

  it('GainOptions.gain sets the param VALUE attribute, not its defaultValue (initialize-the-AudioNode step 3.1)', () => {
    const g = new PlecoGainNode(makeCtx(), { gain: 0.5 })
    expect(g.gain.value).toBe(0.5)
    expect(g.gain.defaultValue).toBe(1)
  })

  it('GainOptions.gain rounds at the float32 boundary (WebIDL float)', () => {
    const g = new PlecoGainNode(makeCtx(), { gain: 0.1 })
    expect(g.gain.value).toBe(Math.fround(0.1))
  })

  it('GainOptions.gain runs the value-attribute algorithm — a later ramp starts from the constructed value', () => {
    const ctx = makeCtx()
    const g = new PlecoGainNode(ctx, { gain: 0.5 })
    g.gain.linearRampToValueAtTime(1.5, BLOCK)
    makeConstSource(ctx, 1).connect(g)
    g.connect(ctx.destination)
    const out = ctx.renderQuantum().getChannelData(0)
    expect(out[0]).toBe(0.5) // ramp anchored at the constructor's setValueAtTime(0.5, 0)
    expect(out[64]).toBe(1.0) // 0.5 + (1.5 − 0.5)·64/128
    expect(out[127]).toBe(0.5 + (1.5 - 0.5) * (127 / 128))
  })

  it('non-finite / non-number gain in GainOptions throws TypeError', () => {
    const ctx = makeCtx()
    expect(() => new PlecoGainNode(ctx, { gain: NaN })).toThrow(TypeError)
    expect(() => new PlecoGainNode(ctx, { gain: Infinity })).toThrow(TypeError)
    expect(() => new PlecoGainNode(ctx, { gain: '0.5' })).toThrow(TypeError) // pleco strictness: no ToNumber coercion
  })

  it('null options convert to the empty dictionary (WebIDL) — constructs with defaults', () => {
    const g = new PlecoGainNode(makeCtx(), null)
    expect(g.gain.value).toBe(1)
    expect(g.channelCount).toBe(2)
    expect(g.channelCountMode).toBe('max')
  })

  it('AudioNodeOptions members apply; an invalid enum in the constructor dictionary throws TypeError', () => {
    const ctx = makeCtx()
    const g = new PlecoGainNode(ctx, {
      gain: 2,
      channelCount: 4,
      channelCountMode: 'explicit',
      channelInterpretation: 'discrete',
    })
    expect(g.gain.value).toBe(2)
    expect(g.channelCount).toBe(4)
    expect(g.channelCountMode).toBe('explicit')
    expect(g.channelInterpretation).toBe('discrete')
    expect(() => new PlecoGainNode(ctx, { channelCountMode: 'bogus' })).toThrow(TypeError)
    expect(() => new PlecoGainNode(ctx, { channelInterpretation: 'bogus' })).toThrow(TypeError)
  })
})

describe('PlecoGainNode — per-sample multiply against the automation curve', () => {
  it('setValueAtTime steps land at exact frames WITHIN one quantum', () => {
    const ctx = makeCtx()
    const g = ctx.createGain()
    makeConstSource(ctx, 1).connect(g)
    g.connect(ctx.destination)
    g.gain.setValueAtTime(2, 0)
    g.gain.setValueAtTime(3, t(64))
    const out = ctx.renderQuantum().getChannelData(0)
    expect(out[0]).toBe(2)
    expect(out[63]).toBe(2)
    expect(out[64]).toBe(3)
    expect(out[127]).toBe(3)
  })

  it('a linearRamp shapes the audio PER SAMPLE (a-rate) — every frame gets its own curve value', () => {
    const ctx = makeCtx()
    const g = ctx.createGain()
    makeConstSource(ctx, 1).connect(g)
    g.connect(ctx.destination)
    g.gain.setValueAtTime(0, 0)
    g.gain.linearRampToValueAtTime(1, BLOCK)
    const out = ctx.renderQuantum().getChannelData(0)
    for (let i = 0; i < RENDER_QUANTUM; i++) expect(out[i]).toBe(i / 128)
  })

  it('a setValueCurveAtTime curve is applied per sample through the multiply', () => {
    const ctx = makeCtx()
    const g = ctx.createGain()
    makeConstSource(ctx, 1).connect(g)
    g.connect(ctx.destination)
    g.gain.setValueCurveAtTime([0, 1, 0], 0, BLOCK)
    const out = ctx.renderQuantum().getChannelData(0)
    expect(out[0]).toBe(0)
    expect(out[32]).toBe(0.5) // x = 2·32/128 = 0.5 → between curve[0] and curve[1]
    expect(out[64]).toBe(1) // x = 1 → curve[1]
    expect(out[96]).toBe(0.5) // x = 1.5 → halfway back down
    expect(out[127]).toBe(Math.fround(1 - (2 * 127) / 128 + 1)) // x = 1.984375 → 0.015625
  })

  it('multiplies EVERY channel by the same computedValue block', () => {
    const ctx = makeCtx(2)
    const g = new PlecoGainNode(ctx, { gain: 2 })
    makeConstSource(ctx, [0.5, 0.25], 2).connect(g)
    g.connect(ctx.destination)
    const block = ctx.renderQuantum()
    const L = block.getChannelData(0)
    const R = block.getChannelData(1)
    for (let i = 0; i < RENDER_QUANTUM; i++) {
      expect(L[i]).toBe(1)
      expect(R[i]).toBe(0.5)
    }
  })

  it('k-rate gain samples the FIRST frame of each block for the whole block', () => {
    const ctx = makeCtx()
    const g = ctx.createGain()
    makeConstSource(ctx, 1).connect(g)
    g.connect(ctx.destination)
    g.gain.automationRate = 'k-rate'
    g.gain.setValueAtTime(0, 0)
    g.gain.linearRampToValueAtTime(1, 2 * BLOCK)
    const q0 = ctx.renderQuantum().getChannelData(0)
    for (const v of q0) expect(v).toBe(0) // frame 0 → 0, held for the block
    const q1 = ctx.renderQuantum().getChannelData(0)
    for (const v of q1) expect(v).toBe(0.5) // frame 128 → mid-ramp, held for the block
  })

  it('automation advances on the ABSOLUTE context clock across quanta', () => {
    const ctx = makeCtx()
    const g = ctx.createGain()
    makeConstSource(ctx, 1).connect(g)
    g.connect(ctx.destination)
    g.gain.setValueAtTime(0.25, 0)
    g.gain.setValueAtTime(0.75, BLOCK)
    const q0 = ctx.renderQuantum().getChannelData(0)
    expect(q0[0]).toBe(0.25)
    expect(q0[127]).toBe(0.25)
    const q1 = ctx.renderQuantum().getChannelData(0)
    expect(q1[0]).toBe(0.75)
    expect(q1[127]).toBe(0.75)
  })

  it('a modulation input into gain.gain sums with the intrinsic automation value (computedValue)', () => {
    const ctx = makeCtx()
    const g = ctx.createGain()
    makeConstSource(ctx, 1).connect(g)
    g.connect(ctx.destination)
    g.gain.setValueAtTime(0.5, 0)
    makeConstSource(ctx, 0.25).connect(g.gain)
    const out = ctx.renderQuantum().getChannelData(0)
    for (const v of out) expect(v).toBe(0.75)
  })
})

describe('PlecoConstantSourceNode — interface shape + ConstantSourceOptions', () => {
  it('is an AudioScheduledSourceNode with the spec node shape: 0 in / 1 out, cc 2 / max / speakers', () => {
    const s = new PlecoConstantSourceNode(makeCtx())
    expect(s).toBeInstanceOf(PlecoScheduledSourceNode)
    expect(s.numberOfInputs).toBe(0)
    expect(s.numberOfOutputs).toBe(1)
    expect(s.channelCount).toBe(2)
    expect(s.channelCountMode).toBe('max')
    expect(s.channelInterpretation).toBe('speakers')
  })

  it('offset: readonly a-rate AudioParam with defaultValue 1 and the full float32 nominal range', () => {
    const s = new PlecoConstantSourceNode(makeCtx())
    expect(s.offset).toBeInstanceOf(PlecoAudioParam)
    expect(s.offset.defaultValue).toBe(1)
    expect(s.offset.value).toBe(1)
    expect(s.offset.automationRate).toBe('a-rate')
    expect(s.offset.minValue).toBe(-F32_MAX)
    expect(s.offset.maxValue).toBe(F32_MAX)
    expect(() => {
      s.offset = 0
    }).toThrow(TypeError)
  })

  it('ConstantSourceOptions.offset sets the param VALUE (float32-rounded); defaultValue stays 1', () => {
    const s = new PlecoConstantSourceNode(makeCtx(), { offset: 0.1 })
    expect(s.offset.value).toBe(Math.fround(0.1))
    expect(s.offset.defaultValue).toBe(1)
  })

  it('non-finite / non-number offset throws TypeError', () => {
    const ctx = makeCtx()
    expect(() => new PlecoConstantSourceNode(ctx, { offset: NaN })).toThrow(TypeError)
    expect(() => new PlecoConstantSourceNode(ctx, { offset: -Infinity })).toThrow(TypeError)
    expect(() => new PlecoConstantSourceNode(ctx, { offset: '1' })).toThrow(TypeError) // pleco strictness
  })

  it('ConstantSourceOptions does NOT extend AudioNodeOptions — such members are ignored (WebIDL unknown dictionary members)', () => {
    const s = new PlecoConstantSourceNode(makeCtx(), { channelCount: 7, channelCountMode: 'bogus' })
    expect(s.channelCount).toBe(2) // untouched — not a ConstantSourceOptions member
    expect(s.channelCountMode).toBe('max') // and no TypeError for the bogus enum either
  })

  it('inherits the scheduled-source exception matrix: second start / stop-before-start → InvalidStateError', () => {
    const s = new PlecoConstantSourceNode(makeCtx())
    expect(() => s.stop()).toThrow(DOMException)
    s.start(0)
    let caught = null
    try {
      s.start(0)
    } catch (e) {
      caught = e
    }
    expect(caught).toBeInstanceOf(DOMException)
    expect(caught.name).toBe('InvalidStateError')
  })
})

describe('PlecoConstantSourceNode — rendering', () => {
  it('outputs silence before start(), the offset value once started', () => {
    const ctx = makeCtx()
    const s = new PlecoConstantSourceNode(ctx, { offset: 0.5 })
    s.connect(ctx.destination)
    const q0 = ctx.renderQuantum().getChannelData(0)
    for (const v of q0) expect(v).toBe(0)
    s.start(BLOCK) // start of the second quantum
    const q1 = ctx.renderQuantum().getChannelData(0)
    for (const v of q1) expect(v).toBe(0.5)
  })

  it('the single output is MONO — one channel, independent of the channelCount attribute', () => {
    const ctx = makeCtx()
    const s = new PlecoConstantSourceNode(ctx)
    s.start(0)
    expect(s._tick().numberOfChannels).toBe(1)
  })

  it('the mono output up-mixes as mono — replicated into BOTH channels of a stereo destination', () => {
    const ctx = makeCtx(2) // destination: channelCount 2, mode 'explicit'
    const s = new PlecoConstantSourceNode(ctx, { offset: 0.5 })
    s.connect(ctx.destination)
    s.start(0)
    const block = ctx.renderQuantum()
    const L = block.getChannelData(0)
    const R = block.getChannelData(1)
    for (let i = 0; i < RENDER_QUANTUM; i++) {
      expect(L[i]).toBe(0.5) // a 2-ch output with a silent second channel would leave R at 0
      expect(R[i]).toBe(0.5)
    }
  })

  it('start/stop window at sample-frame accuracy (sub-frame times ceil per the per-frame condition)', () => {
    const ctx = makeCtx()
    const s = new PlecoConstantSourceNode(ctx)
    s.connect(ctx.destination)
    s.start(t(100.5))
    s.stop(t(120.5))
    const out = ctx.renderQuantum().getChannelData(0)
    expect(out[100]).toBe(0)
    expect(out[101]).toBe(1) // first frame with time >= start
    expect(out[120]).toBe(1) // 120/8192 < stop → still sounds
    expect(out[121]).toBe(0)
  })

  it('never exhausts — still emitting after many quanta, then ends exactly once on stop()', async () => {
    const ctx = makeCtx()
    const s = new PlecoConstantSourceNode(ctx)
    s.connect(ctx.destination)
    let ended = 0
    s.onended = () => ended++
    s.start(0)
    for (let q = 0; q < 10; q++) {
      const out = ctx.renderQuantum().getChannelData(0)
      expect(out[0]).toBe(1)
      expect(out[127]).toBe(1)
    }
    await flushMicrotasks()
    expect(ended).toBe(0)
    s.stop(t(10 * RENDER_QUANTUM + 64))
    const out = ctx.renderQuantum().getChannelData(0)
    expect(out[63]).toBe(1)
    expect(out[64]).toBe(0)
    await flushMicrotasks()
    expect(ended).toBe(1)
    ctx.renderQuantum()
    await flushMicrotasks()
    expect(ended).toBe(1)
  })

  it('offset automation is a-rate per sample on the ABSOLUTE clock — a source started mid-ramp joins the ramp at context time', () => {
    const ctx = makeCtx()
    const s = new PlecoConstantSourceNode(ctx)
    s.connect(ctx.destination)
    s.offset.setValueAtTime(0, 0)
    s.offset.linearRampToValueAtTime(1, BLOCK)
    s.start(t(64))
    const out = ctx.renderQuantum().getChannelData(0)
    expect(out[63]).toBe(0) // before start: silent, not ramp value
    expect(out[64]).toBe(0.5) // ramp value AT frame 64, not at "64 frames after start"
    expect(out[127]).toBe(127 / 128)
  })

  it('offset automation advances across quanta', () => {
    const ctx = makeCtx()
    const s = new PlecoConstantSourceNode(ctx)
    s.connect(ctx.destination)
    s.offset.setValueAtTime(0.25, 0)
    s.offset.setValueAtTime(0.75, BLOCK)
    s.start(0)
    const q0 = ctx.renderQuantum().getChannelData(0)
    expect(q0[127]).toBe(0.25)
    const q1 = ctx.renderQuantum().getChannelData(0)
    expect(q1[0]).toBe(0.75)
  })
})

describe('PlecoConstantSourceNode — as a modulation source into other AudioParams', () => {
  it('an offset ramp drives gain.gain per sample (constructible-AudioParam usage, spec § ConstantSourceNode)', () => {
    const ctx = makeCtx()
    const g = ctx.createGain()
    makeConstSource(ctx, 1).connect(g)
    g.connect(ctx.destination)
    g.gain.setValueAtTime(0, 0) // intrinsic 0 → computed = modulation input alone
    const mod = new PlecoConstantSourceNode(ctx)
    mod.offset.setValueAtTime(0, 0)
    mod.offset.linearRampToValueAtTime(1, BLOCK)
    mod.connect(g.gain)
    mod.start(0)
    const out = ctx.renderQuantum().getChannelData(0)
    for (let i = 0; i < RENDER_QUANTUM; i++) expect(out[i]).toBe(i / 128)
  })

  it('a constant offset sums with the param intrinsic value', () => {
    const ctx = makeCtx()
    const g = ctx.createGain()
    makeConstSource(ctx, 1).connect(g)
    g.connect(ctx.destination)
    g.gain.setValueAtTime(0.5, 0)
    const mod = new PlecoConstantSourceNode(ctx, { offset: 0.25 })
    mod.connect(g.gain)
    mod.start(0)
    const out = ctx.renderQuantum().getChannelData(0)
    for (const v of out) expect(v).toBe(0.75)
  })

  it('an UNSTARTED ConstantSourceNode connected to a param contributes silence', () => {
    const ctx = makeCtx()
    const g = ctx.createGain()
    makeConstSource(ctx, 1).connect(g)
    g.connect(ctx.destination)
    const mod = new PlecoConstantSourceNode(ctx, { offset: 0.25 }) // never started
    mod.connect(g.gain)
    const out = ctx.renderQuantum().getChannelData(0)
    for (const v of out) expect(v).toBe(1) // gain intrinsic 1 + 0
  })

  it('a STOPPED ConstantSourceNode stops contributing at its stop frame', () => {
    const ctx = makeCtx()
    const g = ctx.createGain()
    makeConstSource(ctx, 1).connect(g)
    g.connect(ctx.destination)
    g.gain.setValueAtTime(0, 0)
    const mod = new PlecoConstantSourceNode(ctx, { offset: 0.5 })
    mod.connect(g.gain)
    mod.start(0)
    mod.stop(t(64))
    const out = ctx.renderQuantum().getChannelData(0)
    expect(out[0]).toBe(0.5)
    expect(out[63]).toBe(0.5)
    expect(out[64]).toBe(0)
    expect(out[127]).toBe(0)
  })
})
