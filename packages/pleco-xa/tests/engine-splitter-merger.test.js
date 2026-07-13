import { describe, it, expect, vi } from 'vitest'
import { PlecoBaseContext } from '../src/engine/xa-base-context.js'
import { PlecoOfflineContext } from '../src/engine/xa-offline-context.js'
import { PlecoChannelSplitterNode } from '../src/engine/nodes/xa-channel-splitter.js'
import { PlecoChannelMergerNode } from '../src/engine/nodes/xa-channel-merger.js'
import { RENDER_QUANTUM } from '../src/engine/xa-constants.js'

// P10 — ChannelSplitterNode + ChannelMergerNode (spec § The ChannelSplitterNode
// Interface, § The ChannelMergerNode Interface, § createChannelSplitter /
// § createChannelMerger IndexSizeError bounds, and the locked-attribute
// constraint tables in § AudioNode Attributes), plus the per-output block
// support they force onto PlecoNode/_tickOutput (xa-node.js / xa-ports.js).

const SR = 44100

const makeCtx = (numberOfChannels = 1) => new PlecoBaseContext({ sampleRate: SR, numberOfChannels })

const makeOffline = (numberOfChannels, length = RENDER_QUANTUM) =>
  new PlecoOfflineContext({ numberOfChannels, length, sampleRate: SR })

/** A started buffer-source producing constant per-channel values. */
function makeConstSource(context, values, length = RENDER_QUANTUM * 4) {
  const channels = Array.isArray(values) ? values.length : 1
  const buf = context.createBuffer(channels, length, SR)
  for (let c = 0; c < channels; c++) {
    buf.getChannelData(c).fill(Array.isArray(values) ? values[c] : values)
  }
  const s = context.createBufferSource()
  s.buffer = buf
  s.start(0)
  return s
}

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

const expectAllSamples = (data, value) => {
  for (let i = 0; i < data.length; i++) {
    if (data[i] !== Math.fround(value)) {
      expect.fail(`sample ${i}: expected ${Math.fround(value)}, got ${data[i]}`)
    }
  }
  expect(data.length).toBeGreaterThan(0)
}

describe('PlecoChannelSplitterNode — construction (spec § ChannelSplitterOptions, § createChannelSplitter)', () => {
  it('defaults: 1 input, 6 outputs, channelCount 6, mode explicit, interpretation discrete', () => {
    const ctx = makeCtx()
    const s = new PlecoChannelSplitterNode(ctx)
    expect(s.numberOfInputs).toBe(1)
    expect(s.numberOfOutputs).toBe(6)
    expect(s.channelCount).toBe(6)
    expect(s.channelCountMode).toBe('explicit')
    expect(s.channelInterpretation).toBe('discrete')
  })

  it('numberOfOutputs comes from ChannelSplitterOptions and locks channelCount to it', () => {
    const ctx = makeCtx()
    for (const n of [1, 2, 32]) {
      const s = new PlecoChannelSplitterNode(ctx, { numberOfOutputs: n })
      expect(s.numberOfOutputs).toBe(n)
      expect(s.channelCount).toBe(n)
    }
  })

  it('IndexSizeError when numberOfOutputs is outside [1, 32]', () => {
    const ctx = makeCtx()
    throwsName(() => new PlecoChannelSplitterNode(ctx, { numberOfOutputs: 0 }), 'IndexSizeError')
    throwsName(() => new PlecoChannelSplitterNode(ctx, { numberOfOutputs: 33 }), 'IndexSizeError')
    throwsName(() => new PlecoChannelSplitterNode(ctx, { numberOfOutputs: -1 }), 'IndexSizeError')
    throwsName(() => new PlecoChannelSplitterNode(ctx, { numberOfOutputs: 2.5 }), 'IndexSizeError')
  })

  it('constructor dictionary violating a locked attribute throws InvalidStateError', () => {
    const ctx = makeCtx()
    throwsName(() => new PlecoChannelSplitterNode(ctx, { channelCount: 2 }), 'InvalidStateError')
    throwsName(() => new PlecoChannelSplitterNode(ctx, { channelCountMode: 'max' }), 'InvalidStateError')
    throwsName(
      () => new PlecoChannelSplitterNode(ctx, { channelInterpretation: 'speakers' }),
      'InvalidStateError',
    )
    // Passing the locked values explicitly is fine.
    const s = new PlecoChannelSplitterNode(ctx, {
      numberOfOutputs: 4,
      channelCount: 4,
      channelCountMode: 'explicit',
      channelInterpretation: 'discrete',
    })
    expect(s.channelCount).toBe(4)
  })

  it('constructor dictionary with an INVALID enum string throws TypeError (WebIDL conversion precedes the lock check)', () => {
    const ctx = makeCtx()
    for (const fn of [
      () => new PlecoChannelSplitterNode(ctx, { channelCountMode: 'bogus' }),
      () => new PlecoChannelSplitterNode(ctx, { channelInterpretation: 'bogus' }),
    ]) {
      let caught = null
      try {
        fn()
      } catch (err) {
        caught = err
      }
      expect(caught).toBeInstanceOf(TypeError)
      expect(caught).not.toBeInstanceOf(DOMException)
    }
  })

  it('ATTRIBUTE assignment of an invalid enum string is silently ignored (WebIDL enum attribute semantics)', () => {
    const ctx = makeCtx()
    const s = new PlecoChannelSplitterNode(ctx)
    s.channelCountMode = 'bogus' // no throw, no change
    expect(s.channelCountMode).toBe('explicit')
    s.channelInterpretation = 'bogus'
    expect(s.channelInterpretation).toBe('discrete')
  })
})

describe('PlecoChannelSplitterNode — locked attributes (spec constraint tables)', () => {
  it('changing channelCount throws InvalidStateError; re-assigning the locked value passes', () => {
    const ctx = makeCtx()
    const s = new PlecoChannelSplitterNode(ctx, { numberOfOutputs: 4 })
    throwsName(() => {
      s.channelCount = 2
    }, 'InvalidStateError')
    s.channelCount = 4 // no-op re-assignment of the locked value
    expect(s.channelCount).toBe(4)
  })

  it("changing channelCountMode from 'explicit' throws InvalidStateError", () => {
    const ctx = makeCtx()
    const s = new PlecoChannelSplitterNode(ctx)
    throwsName(() => {
      s.channelCountMode = 'max'
    }, 'InvalidStateError')
    throwsName(() => {
      s.channelCountMode = 'clamped-max'
    }, 'InvalidStateError')
    s.channelCountMode = 'explicit'
    expect(s.channelCountMode).toBe('explicit')
  })

  it("changing channelInterpretation from 'discrete' throws InvalidStateError", () => {
    const ctx = makeCtx()
    const s = new PlecoChannelSplitterNode(ctx)
    throwsName(() => {
      s.channelInterpretation = 'speakers'
    }, 'InvalidStateError')
    s.channelInterpretation = 'discrete'
    expect(s.channelInterpretation).toBe('discrete')
  })
})

describe('PlecoChannelMergerNode — construction (spec § ChannelMergerOptions, § createChannelMerger)', () => {
  it('defaults: 6 inputs, 1 output, channelCount 1, mode explicit, interpretation speakers', () => {
    const ctx = makeCtx()
    const m = new PlecoChannelMergerNode(ctx)
    expect(m.numberOfInputs).toBe(6)
    expect(m.numberOfOutputs).toBe(1)
    expect(m.channelCount).toBe(1)
    expect(m.channelCountMode).toBe('explicit')
    expect(m.channelInterpretation).toBe('speakers')
  })

  it('numberOfInputs comes from ChannelMergerOptions', () => {
    const ctx = makeCtx()
    for (const n of [1, 2, 32]) {
      expect(new PlecoChannelMergerNode(ctx, { numberOfInputs: n }).numberOfInputs).toBe(n)
    }
  })

  it('IndexSizeError when numberOfInputs is outside [1, 32]', () => {
    const ctx = makeCtx()
    throwsName(() => new PlecoChannelMergerNode(ctx, { numberOfInputs: 0 }), 'IndexSizeError')
    throwsName(() => new PlecoChannelMergerNode(ctx, { numberOfInputs: 33 }), 'IndexSizeError')
    throwsName(() => new PlecoChannelMergerNode(ctx, { numberOfInputs: -3 }), 'IndexSizeError')
    throwsName(() => new PlecoChannelMergerNode(ctx, { numberOfInputs: 1.5 }), 'IndexSizeError')
  })

  it('constructor dictionary violating a locked attribute throws InvalidStateError', () => {
    const ctx = makeCtx()
    throwsName(() => new PlecoChannelMergerNode(ctx, { channelCount: 2 }), 'InvalidStateError')
    throwsName(() => new PlecoChannelMergerNode(ctx, { channelCountMode: 'max' }), 'InvalidStateError')
  })

  it('constructor dictionary with an INVALID enum string throws TypeError (WebIDL conversion precedes the lock check)', () => {
    const ctx = makeCtx()
    for (const fn of [
      () => new PlecoChannelMergerNode(ctx, { channelCountMode: 'bogus' }),
      () => new PlecoChannelMergerNode(ctx, { channelInterpretation: 'bogus' }),
    ]) {
      let caught = null
      try {
        fn()
      } catch (err) {
        caught = err
      }
      expect(caught).toBeInstanceOf(TypeError)
      expect(caught).not.toBeInstanceOf(DOMException)
    }
  })

  it('ATTRIBUTE assignment of an invalid enum string is silently ignored (WebIDL enum attribute semantics)', () => {
    const ctx = makeCtx()
    const m = new PlecoChannelMergerNode(ctx)
    m.channelCountMode = 'bogus' // no throw, no change
    expect(m.channelCountMode).toBe('explicit')
    m.channelInterpretation = 'bogus'
    expect(m.channelInterpretation).toBe('speakers')
  })

  it('locked attributes: channelCount and channelCountMode throw InvalidStateError on change', () => {
    const ctx = makeCtx()
    const m = new PlecoChannelMergerNode(ctx)
    throwsName(() => {
      m.channelCount = 2
    }, 'InvalidStateError')
    throwsName(() => {
      m.channelCountMode = 'max'
    }, 'InvalidStateError')
    m.channelCount = 1
    m.channelCountMode = 'explicit'
    expect(m.channelCount).toBe(1)
    expect(m.channelCountMode).toBe('explicit')
  })

  it('channelInterpretation is NOT locked (spec constrains only ChannelSplitterNode)', () => {
    const ctx = makeCtx()
    const m = new PlecoChannelMergerNode(ctx)
    m.channelInterpretation = 'discrete'
    expect(m.channelInterpretation).toBe('discrete')
    m.channelInterpretation = 'speakers'
    expect(m.channelInterpretation).toBe('speakers')
  })
})

describe('split → merge round trip (per-output blocks end to end)', () => {
  it('stereo split into two mono streams and re-merged is sample-exact', () => {
    const ctx = makeOffline(2)
    const src = makeConstSource(ctx, [0.25, -0.5])
    const splitter = new PlecoChannelSplitterNode(ctx, { numberOfOutputs: 2 })
    const merger = new PlecoChannelMergerNode(ctx, { numberOfInputs: 2 })
    src.connect(splitter)
    splitter.connect(merger, 0, 0)
    splitter.connect(merger, 1, 1)
    merger.connect(ctx.destination)
    const out = ctx.renderSync()
    expectAllSamples(out.getChannelData(0), 0.25)
    expectAllSamples(out.getChannelData(1), -0.5)
  })

  it('cross-wiring splitter outputs through the merger swaps the channels', () => {
    const ctx = makeOffline(2)
    const src = makeConstSource(ctx, [0.25, -0.5])
    const splitter = new PlecoChannelSplitterNode(ctx, { numberOfOutputs: 2 })
    const merger = new PlecoChannelMergerNode(ctx, { numberOfInputs: 2 })
    src.connect(splitter)
    splitter.connect(merger, 0, 1) // L → output channel 1
    splitter.connect(merger, 1, 0) // R → output channel 0
    merger.connect(ctx.destination)
    const out = ctx.renderSync()
    expectAllSamples(out.getChannelData(0), -0.5)
    expectAllSamples(out.getChannelData(1), 0.25)
  })
})

describe('PlecoChannelSplitterNode — output semantics', () => {
  it('outputs beyond the input channel count are silence; active outputs carry their channel', () => {
    const ctx = makeOffline(1)
    const src = makeConstSource(ctx, 0.75) // mono
    const splitter = new PlecoChannelSplitterNode(ctx, { numberOfOutputs: 4 })
    src.connect(splitter)
    splitter.connect(ctx.destination, 2) // beyond the mono input — silent output
    const silent = ctx.renderSync()
    expectAllSamples(silent.getChannelData(0), 0)

    const ctx2 = makeOffline(1)
    const src2 = makeConstSource(ctx2, 0.75)
    const splitter2 = new PlecoChannelSplitterNode(ctx2, { numberOfOutputs: 4 })
    src2.connect(splitter2)
    splitter2.connect(ctx2.destination, 0) // active output 0 = the mono channel
    const active = ctx2.renderSync()
    expectAllSamples(active.getChannelData(0), 0.75)
  })

  it('every splitter output is a mono block', () => {
    const ctx = makeCtx()
    const src = makeConstSource(ctx, [0.1, 0.2])
    const splitter = new PlecoChannelSplitterNode(ctx, { numberOfOutputs: 3 })
    src.connect(splitter)
    for (let k = 0; k < 3; k++) {
      expect(splitter._tickOutput(k).numberOfChannels).toBe(1)
    }
  })
})

describe('PlecoChannelMergerNode — input semantics', () => {
  it('unconnected inputs contribute one silent channel each, in order', () => {
    const ctx = makeOffline(3)
    const src = makeConstSource(ctx, 0.5)
    const merger = new PlecoChannelMergerNode(ctx, { numberOfInputs: 3 })
    src.connect(merger, 0, 1) // only input 1 connected
    merger.connect(ctx.destination)
    const out = ctx.renderSync()
    expectAllSamples(out.getChannelData(0), 0)
    expectAllSamples(out.getChannelData(1), 0.5)
    expectAllSamples(out.getChannelData(2), 0)
  })

  it('a stereo input is downmixed to mono per the mixing rule before merging (cc 1, explicit, speakers)', () => {
    const ctx = makeOffline(2)
    const src = makeConstSource(ctx, [0.5, 0.25]) // stereo → mono: 0.5 * (L + R) = 0.375
    const merger = new PlecoChannelMergerNode(ctx, { numberOfInputs: 2 })
    src.connect(merger, 0, 0)
    merger.connect(ctx.destination)
    const out = ctx.renderSync()
    expectAllSamples(out.getChannelData(0), 0.375)
    expectAllSamples(out.getChannelData(1), 0)
  })

  it('output always has exactly numberOfInputs channels', () => {
    const ctx = makeCtx()
    const merger = new PlecoChannelMergerNode(ctx, { numberOfInputs: 5 })
    expect(merger._tickOutput(0).numberOfChannels).toBe(5)
  })
})

describe('per-output memoization (the P03-deferred contract)', () => {
  it('two splitter outputs feeding two destinations in ONE graph render correctly in one render', () => {
    // src(L=0.25, R=-0.5) → splitter ⇒ out0 → gainA(×2) → merger.in0,
    //                                  out1 → gainB(×1) → merger.in1 → destination.
    const ctx = makeOffline(2)
    const src = makeConstSource(ctx, [0.25, -0.5])
    const splitter = new PlecoChannelSplitterNode(ctx, { numberOfOutputs: 2 })
    const gainA = ctx.createGain()
    const gainB = ctx.createGain()
    gainA.gain.value = 2
    const merger = new PlecoChannelMergerNode(ctx, { numberOfInputs: 2 })
    src.connect(splitter)
    splitter.connect(gainA, 0)
    splitter.connect(gainB, 1)
    gainA.connect(merger, 0, 0)
    gainB.connect(merger, 0, 1)
    merger.connect(ctx.destination)
    const out = ctx.renderSync()
    expectAllSamples(out.getChannelData(0), 0.5) // 0.25 × 2 — proves gainA saw channel 0 only
    expectAllSamples(out.getChannelData(1), -0.5) // proves gainB saw channel 1 only
  })

  it('the split set is computed once per quantum even with multiple consumers', () => {
    const ctx = makeCtx()
    const src = makeConstSource(ctx, [0.1, 0.2])
    const splitter = new PlecoChannelSplitterNode(ctx, { numberOfOutputs: 2 })
    const gainA = ctx.createGain()
    const gainB = ctx.createGain()
    src.connect(splitter)
    splitter.connect(gainA, 0)
    splitter.connect(gainB, 1)
    gainA.connect(ctx.destination)
    gainB.connect(ctx.destination)
    const spy = vi.spyOn(splitter, '_process')
    ctx.renderQuantum()
    expect(spy).toHaveBeenCalledTimes(1)
    ctx.renderQuantum()
    expect(spy).toHaveBeenCalledTimes(2) // fresh compute on the NEXT quantum
  })

  it('single-output nodes are untouched by the port change: _tickOutput(0) is the memoized _tick block', () => {
    const ctx = makeCtx()
    const g = ctx.createGain()
    const src = makeConstSource(ctx, 0.5)
    src.connect(g)
    expect(g._tickOutput(0)).toBe(g._tick())
  })
})
