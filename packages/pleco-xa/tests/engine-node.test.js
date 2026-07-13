import { describe, it, expect } from 'vitest'
import { PlecoBaseContext } from '../src/engine/xa-base-context.js'
import { PlecoOfflineContext } from '../src/engine/xa-offline-context.js'
import { PlecoNode, PlecoScheduledSourceNode } from '../src/engine/xa-node.js'
import { PlecoGainNode } from '../src/engine/nodes/xa-gain.js'
import { PlecoAudioParam } from '../src/engine/xa-param.js'
import { RENDER_QUANTUM } from '../src/engine/xa-constants.js'

// P03 — the AudioNode surface: EventTarget inheritance, both connect()
// overloads, ALL seven disconnect() overloads with spec-exact IndexSizeError /
// InvalidAccessError points, channelCount/channelCountMode/channelInterpretation
// (WebIDL enum semantics), AudioNodeOptions, and the per-input/per-output port
// infrastructure (multi-connection summing, zero-connection silence, fan-out
// memoization).

const SR = 44100

const makeCtx = (numberOfChannels = 1) => new PlecoBaseContext({ sampleRate: SR, numberOfChannels })

/** A started buffer-source producing a constant `value` on `channels` channels. */
function makeConstSource(context, value, channels = 1, length = RENDER_QUANTUM * 4) {
  const buf = context.createBuffer(channels, length, SR)
  for (let c = 0; c < channels; c++) {
    buf.getChannelData(c).fill(Array.isArray(value) ? value[c] : value)
  }
  const s = context.createBufferSource()
  s.buffer = buf
  s.start(0)
  return s
}

/** Is `from`'s output port `output` wired to `to`'s input port `input`? */
const wired = (from, output, to, input) =>
  from._outputs[output].connections.includes(to._inputs[input])

/** Assert fn throws a DOMException with the exact spec name. */
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

describe('PlecoNode — EventTarget inheritance', () => {
  it('is an EventTarget: addEventListener/dispatchEvent/removeEventListener work', () => {
    const ctx = makeCtx()
    const g = ctx.createGain()
    expect(g).toBeInstanceOf(EventTarget)
    let fired = 0
    const listener = () => fired++
    g.addEventListener('ended', listener)
    g.dispatchEvent(new Event('ended'))
    expect(fired).toBe(1)
    g.removeEventListener('ended', listener)
    g.dispatchEvent(new Event('ended'))
    expect(fired).toBe(1)
  })
})

describe('PlecoNode.connect', () => {
  it('connect(destinationNode) returns the destination — chainable', () => {
    const ctx = makeCtx()
    const s = makeConstSource(ctx, 0.25)
    const g = ctx.createGain()
    expect(s.connect(g)).toBe(g)
    expect(s.connect(g).connect(ctx.destination)).toBe(ctx.destination)
    expect(wired(s, 0, g, 0)).toBe(true)
    expect(wired(g, 0, ctx.destination, 0)).toBe(true)
  })

  it('connect(destinationParam) returns undefined and stores a bidirectional edge on the param input', () => {
    const ctx = makeCtx()
    const s = makeConstSource(ctx, 0.25)
    const g = ctx.createGain()
    expect(s.connect(g.gain)).toBeUndefined()
    expect(g.gain._input.connections).toContain(s._outputs[0])
    expect(s._outputs[0].connections).toContain(g.gain._input)
  })

  it('duplicate connections with the same termini are ignored (node and param)', () => {
    const ctx = makeCtx()
    const s = makeConstSource(ctx, 0.25)
    const g = ctx.createGain()
    s.connect(g)
    s.connect(g)
    expect(s._outputs[0].connections.length).toBe(1)
    s.connect(g.gain)
    s.connect(g.gain)
    expect(g.gain._input.connections.length).toBe(1)
  })

  it('a duplicate connect does not double the signal', () => {
    const ctx = new PlecoOfflineContext({ numberOfChannels: 1, length: RENDER_QUANTUM, sampleRate: SR })
    const s = makeConstSource(ctx, 0.25)
    s.connect(ctx.destination)
    s.connect(ctx.destination)
    const out = ctx.renderSync()
    expect(out.getChannelData(0)[0]).toBe(0.25)
  })

  it('throws IndexSizeError for out-of-range output/input indexes', () => {
    const ctx = makeCtx()
    const s = makeConstSource(ctx, 0.25)
    const g = ctx.createGain()
    throwsName(() => s.connect(g, 1), 'IndexSizeError')
    throwsName(() => s.connect(g, 0, 1), 'IndexSizeError')
    throwsName(() => s.connect(g.gain, 2), 'IndexSizeError')
    throwsName(() => s.connect(g, -1), 'IndexSizeError')
  })

  it('throws InvalidAccessError for cross-context connects (node and param)', () => {
    const ctxA = makeCtx()
    const ctxB = makeCtx()
    const s = makeConstSource(ctxA, 0.25)
    const gB = ctxB.createGain()
    throwsName(() => s.connect(gB), 'InvalidAccessError')
    throwsName(() => s.connect(gB.gain), 'InvalidAccessError')
  })

  it('throws TypeError for a destination that is neither node nor param', () => {
    const ctx = makeCtx()
    const s = makeConstSource(ctx, 0.25)
    expect(() => s.connect({})).toThrow(TypeError)
    expect(() => s.connect(null)).toThrow(TypeError)
  })
})

describe('PlecoNode.disconnect — the seven spec overloads', () => {
  it('disconnect() severs OUTGOING connections only — inbound edges survive (regression pin)', () => {
    const ctx = makeCtx()
    const upstream = new PlecoGainNode(ctx)
    const a = new PlecoGainNode(ctx)
    const b = new PlecoGainNode(ctx)
    const p = new PlecoGainNode(ctx)
    upstream.connect(a) // inbound edge into a
    a.connect(b) // outgoing node edge
    a.connect(p.gain) // outgoing param edge
    a.disconnect()
    expect(a._outputs[0].connections.length).toBe(0) // all outgoing gone (node + param)
    expect(p.gain._input.connections.length).toBe(0)
    expect(wired(upstream, 0, a, 0)).toBe(true) // inbound untouched
  })

  it('disconnect(output) severs only that output; bad index throws IndexSizeError', () => {
    const ctx = makeCtx()
    const m = new PlecoNode(ctx, { numberOfInputs: 0, numberOfOutputs: 2 })
    const d0 = new PlecoGainNode(ctx)
    const d1 = new PlecoGainNode(ctx)
    m.connect(d0, 0)
    m.connect(d1, 1)
    m.disconnect(1)
    expect(wired(m, 0, d0, 0)).toBe(true)
    expect(wired(m, 1, d1, 0)).toBe(false)
    throwsName(() => m.disconnect(2), 'IndexSizeError')
  })

  it('disconnect(destinationNode) severs every edge to that node only; not-connected throws InvalidAccessError', () => {
    const ctx = makeCtx()
    const s = makeConstSource(ctx, 0.25)
    const g = ctx.createGain()
    const h = ctx.createGain()
    s.connect(g)
    s.connect(h)
    s.disconnect(g)
    expect(wired(s, 0, g, 0)).toBe(false)
    expect(wired(s, 0, h, 0)).toBe(true)
    throwsName(() => s.disconnect(g), 'InvalidAccessError')
  })

  it('disconnect(destinationNode, output) severs only that output→destination; wrong output throws InvalidAccessError', () => {
    const ctx = makeCtx()
    const m = new PlecoNode(ctx, { numberOfInputs: 0, numberOfOutputs: 2 })
    const d = new PlecoNode(ctx, { numberOfInputs: 2, numberOfOutputs: 1 })
    m.connect(d, 0, 0)
    m.connect(d, 1, 1)
    m.disconnect(d, 1)
    expect(wired(m, 0, d, 0)).toBe(true)
    expect(wired(m, 1, d, 1)).toBe(false)
    throwsName(() => m.disconnect(d, 1), 'InvalidAccessError')
    throwsName(() => m.disconnect(d, 7), 'IndexSizeError')
  })

  it('disconnect(destinationNode, output, input) severs exactly one edge; absent edge throws InvalidAccessError', () => {
    const ctx = makeCtx()
    const m = new PlecoNode(ctx, { numberOfInputs: 0, numberOfOutputs: 1 })
    const d = new PlecoNode(ctx, { numberOfInputs: 2, numberOfOutputs: 1 })
    m.connect(d, 0, 0)
    m.connect(d, 0, 1)
    m.disconnect(d, 0, 1)
    expect(wired(m, 0, d, 0)).toBe(true)
    expect(wired(m, 0, d, 1)).toBe(false)
    throwsName(() => m.disconnect(d, 0, 1), 'InvalidAccessError')
    throwsName(() => m.disconnect(d, 0, 9), 'IndexSizeError')
  })

  it('disconnect(destinationParam) severs the param edge; not-connected throws InvalidAccessError', () => {
    const ctx = makeCtx()
    const s = makeConstSource(ctx, 0.25)
    const g = ctx.createGain()
    s.connect(g.gain)
    s.disconnect(g.gain)
    expect(g.gain._input.connections.length).toBe(0)
    throwsName(() => s.disconnect(g.gain), 'InvalidAccessError')
  })

  it('disconnect(destinationParam, output) severs only that output; wrong output InvalidAccessError, bad index IndexSizeError', () => {
    const ctx = makeCtx()
    const m = new PlecoNode(ctx, { numberOfInputs: 0, numberOfOutputs: 2 })
    const g = ctx.createGain()
    m.connect(g.gain, 1)
    throwsName(() => m.disconnect(g.gain, 0), 'InvalidAccessError')
    throwsName(() => m.disconnect(g.gain, 5), 'IndexSizeError')
    m.disconnect(g.gain, 1)
    expect(g.gain._input.connections.length).toBe(0)
  })
})

describe('PlecoNode — channel attributes + AudioNodeOptions', () => {
  it('defaults: channelCount 2, channelCountMode "max", channelInterpretation "speakers"', () => {
    const ctx = makeCtx()
    const n = new PlecoNode(ctx)
    expect(n.channelCount).toBe(2)
    expect(n.channelCountMode).toBe('max')
    expect(n.channelInterpretation).toBe('speakers')
    expect(n.numberOfInputs).toBe(1)
    expect(n.numberOfOutputs).toBe(1)
    expect(n.context).toBe(ctx)
  })

  it('AudioNodeOptions in the constructor take effect', () => {
    const ctx = makeCtx()
    const n = new PlecoGainNode(ctx, {
      channelCount: 4,
      channelCountMode: 'explicit',
      channelInterpretation: 'discrete',
    })
    expect(n.channelCount).toBe(4)
    expect(n.channelCountMode).toBe('explicit')
    expect(n.channelInterpretation).toBe('discrete')
  })

  it('invalid enum values in constructor options throw TypeError (dictionary path)', () => {
    const ctx = makeCtx()
    expect(() => new PlecoGainNode(ctx, { channelCountMode: 'bogus' })).toThrow(TypeError)
    expect(() => new PlecoGainNode(ctx, { channelInterpretation: 'bogus' })).toThrow(TypeError)
  })

  it('invalid enum ASSIGNMENT is silently ignored; valid assignment takes effect (WebIDL enum semantics)', () => {
    const ctx = makeCtx()
    const g = ctx.createGain()
    g.channelCountMode = 'bogus'
    expect(g.channelCountMode).toBe('max')
    g.channelCountMode = 'clamped-max'
    expect(g.channelCountMode).toBe('clamped-max')
    g.channelInterpretation = 'nonsense'
    expect(g.channelInterpretation).toBe('speakers')
    g.channelInterpretation = 'discrete'
    expect(g.channelInterpretation).toBe('discrete')
  })

  it('channelCount setter throws NotSupportedError for zero, >32, and non-integers', () => {
    const ctx = makeCtx()
    const g = ctx.createGain()
    for (const bad of [0, -1, 33, 1.5, NaN]) {
      throwsName(() => {
        g.channelCount = bad
      }, 'NotSupportedError')
    }
    g.channelCount = 32
    expect(g.channelCount).toBe(32)
  })

  it('context/numberOfInputs/numberOfOutputs are readonly (getters only)', () => {
    const ctx = makeCtx()
    const g = ctx.createGain()
    expect(() => {
      g.numberOfInputs = 5
    }).toThrow(TypeError)
    expect(() => {
      g.context = null
    }).toThrow(TypeError)
  })
})

describe('PlecoNode — input mixing through the port infrastructure', () => {
  it('sums multiple connections to one input', () => {
    const ctx = new PlecoOfflineContext({ numberOfChannels: 1, length: RENDER_QUANTUM, sampleRate: SR })
    makeConstSource(ctx, 0.25).connect(ctx.destination)
    makeConstSource(ctx, 0.5).connect(ctx.destination)
    const out = ctx.renderSync()
    for (const v of out.getChannelData(0)) expect(v).toBe(0.75)
  })

  it('an input with zero connections is ONE channel of silence', () => {
    const ctx = new PlecoOfflineContext({ numberOfChannels: 1, length: RENDER_QUANTUM, sampleRate: SR })
    const g = ctx.createGain()
    g.connect(ctx.destination)
    const pulled = g._inputs[0]._pull()
    expect(pulled.numberOfChannels).toBe(1)
    expect(Array.from(ctx.renderSync().getChannelData(0))).toEqual(new Array(RENDER_QUANTUM).fill(0))
  })

  it('computedNumberOfChannels follows channelCountMode (max / clamped-max / explicit)', () => {
    const ctx = makeCtx()
    const stereo = makeConstSource(ctx, [0.25, 0.5], 2)
    const g = new PlecoGainNode(ctx, { channelCount: 1 })
    stereo.connect(g)
    g.channelCountMode = 'max' // channelCount ignored → follows the stereo source
    expect(g._inputs[0]._pull().numberOfChannels).toBe(2)
    g.channelCountMode = 'clamped-max' // clamped to channelCount = 1
    expect(g._inputs[0]._pull().numberOfChannels).toBe(1)
    g.channelCountMode = 'explicit'
    expect(g._inputs[0]._pull().numberOfChannels).toBe(1)
  })

  it('speakers interpretation down-mixes stereo→mono with the spec equation (0.5·(L+R))', () => {
    const ctx = new PlecoOfflineContext({ numberOfChannels: 1, length: RENDER_QUANTUM, sampleRate: SR })
    makeConstSource(ctx, [0.25, 0.5], 2).connect(ctx.destination) // destination: explicit, 1 ch
    const out = ctx.renderSync()
    for (const v of out.getChannelData(0)) expect(v).toBe(0.375) // 0.5 * (0.25 + 0.5), exact in f32
  })

  it('speakers up-mixes mono→stereo (copied to L and R); discrete fills then zeroes', () => {
    const speakers = new PlecoOfflineContext({ numberOfChannels: 2, length: RENDER_QUANTUM, sampleRate: SR })
    makeConstSource(speakers, 0.5).connect(speakers.destination)
    const a = speakers.renderSync()
    expect(a.getChannelData(0)[0]).toBe(0.5)
    expect(a.getChannelData(1)[0]).toBe(0.5)

    const discrete = new PlecoOfflineContext({ numberOfChannels: 2, length: RENDER_QUANTUM, sampleRate: SR })
    discrete.destination.channelInterpretation = 'discrete'
    makeConstSource(discrete, 0.5).connect(discrete.destination)
    const b = discrete.renderSync()
    expect(b.getChannelData(0)[0]).toBe(0.5)
    expect(b.getChannelData(1)[0]).toBe(0)
  })
})

describe('PlecoNode — memoization and cycle guard survive the port rework', () => {
  it('fan-out (one output → two destinations) computes once per quantum and both paths carry the signal', () => {
    const ctx = new PlecoOfflineContext({ numberOfChannels: 1, length: RENDER_QUANTUM, sampleRate: SR })
    const s = makeConstSource(ctx, 0.25)
    const g1 = ctx.createGain()
    const g2 = ctx.createGain()
    s.connect(g1)
    s.connect(g2)
    g1.connect(ctx.destination)
    g2.connect(ctx.destination)
    let processCalls = 0
    const orig = s._process.bind(s)
    s._process = (...args) => {
      processCalls++
      return orig(...args)
    }
    const block = ctx.renderQuantum()
    expect(processCalls).toBe(1) // memoized: pulled by g1 AND g2, computed once
    expect(block.getChannelData(0)[0]).toBe(0.5) // both paths summed at the destination
  })

  it('a feedback cycle is muted to silence instead of recursing (guard retained for P11)', () => {
    const ctx = new PlecoOfflineContext({ numberOfChannels: 1, length: RENDER_QUANTUM, sampleRate: SR })
    const g1 = ctx.createGain()
    const g2 = ctx.createGain()
    g1.connect(g2)
    g2.connect(g1) // cycle
    g1.connect(ctx.destination)
    const out = ctx.renderSync()
    expect(Array.from(out.getChannelData(0))).toEqual(new Array(RENDER_QUANTUM).fill(0))
  })
})

describe('PlecoScheduledSourceNode — structural shape after the port rework', () => {
  it('is a source node: 0 inputs, 1 output, and still an EventTarget', () => {
    const ctx = makeCtx()
    const s = ctx.createBufferSource()
    expect(s).toBeInstanceOf(PlecoScheduledSourceNode)
    expect(s).toBeInstanceOf(EventTarget)
    expect(s.numberOfInputs).toBe(0)
    expect(s.numberOfOutputs).toBe(1)
    expect(s._inputs.length).toBe(0)
    expect(s._outputs.length).toBe(1)
  })

  it('node params carry their owner context for the cross-context check', () => {
    const ctx = makeCtx()
    const g = ctx.createGain()
    const s = ctx.createBufferSource()
    expect(g.gain).toBeInstanceOf(PlecoAudioParam)
    expect(g.gain._context).toBe(ctx)
    expect(s.playbackRate._context).toBe(ctx)
    expect(s.detune._context).toBe(ctx)
  })
})
