import { describe, it, expect } from 'vitest'
import {
  PlecoAudioContext,
  PlecoAudioSinkInfo,
  PlecoAudioPlaybackStats,
} from '../src/engine/xa-audio-context.js'
import { PlecoNullSink, PlecoMockSink } from '../src/engine/xa-sink.js'
import { PlecoOfflineAudioContext } from '../src/engine/xa-offline-context.js'
import { RENDER_QUANTUM } from '../src/engine/xa-constants.js'

// P21 — AudioContext spec parity (checklist section 21), fully headless:
// AudioContextOptions validation, the resume/suspend/close promise state
// machine including 'interrupted', sink-paced rendering through the
// xa-sink.js adapter contract (MockSink manually stepped — the drop-in
// proof against an equivalent offline render), getOutputTimestamp
// correlation, playbackStats accounting, the sinkId/setSinkId/onsinkchange
// surface with AudioSinkType 'none', and the onerror sink-failure path.

const SR = 44100

/** A fresh context wired to a fresh PlecoMockSink. */
function mockContext(options = {}) {
  const sink = new PlecoMockSink(options.mock ?? {})
  const ctx = new PlecoAudioContext({ sink, ...options.ctx })
  return { ctx, sink }
}

/** Connect a looping mono ramp source → gain(0.5) → destination on `ctx`. */
function buildRampGraph(ctx) {
  const buf = ctx.createBuffer(1, 4 * RENDER_QUANTUM, ctx.sampleRate)
  const data = buf.getChannelData(0)
  for (let i = 0; i < data.length; i++) data[i] = i / data.length
  const src = ctx.createBufferSource()
  src.buffer = buf
  src.loop = true
  const g = ctx.createGain()
  g.gain.value = 0.5
  src.connect(g)
  g.connect(ctx.destination)
  src.start(0)
}

describe('PlecoAudioContext construction — AudioContextOptions validation', () => {
  it('constructs with an injected sink adapter: suspended, stereo destination, 44100 default rate', () => {
    const { ctx, sink } = mockContext()
    expect(ctx.state).toBe('suspended')
    expect(ctx.sampleRate).toBe(44100)
    expect(ctx.currentTime).toBe(0)
    expect(ctx.destination.channelCount).toBe(2)
    expect(ctx.destination.maxChannelCount).toBe(2)
    expect(ctx.renderQuantumSize).toBe(RENDER_QUANTUM)
    expect(sink.openCount).toBe(0) // never allowed to start at construction
  })

  it("sinkId { type: 'none' } constructs WITHOUT any injected adapter (internal NullSink)", () => {
    const ctx = new PlecoAudioContext({ sinkId: { type: 'none' } })
    expect(ctx.state).toBe('suspended')
    expect(ctx._sink).toBeInstanceOf(PlecoNullSink)
    expect(ctx.sinkId).toBe('') // [[sink ID]] not yet established (never started)
  })

  it('device-bound output with no injected adapter throws NotSupportedError naming the gap', () => {
    expect(() => new PlecoAudioContext()).toThrowError(
      expect.objectContaining({ name: 'NotSupportedError' }),
    )
    expect(() => new PlecoAudioContext({ sinkId: 'device-7' })).toThrowError(
      expect.objectContaining({ name: 'NotSupportedError' }),
    )
    expect(() => new PlecoAudioContext()).toThrow(/sink adapter/)
  })

  it('null contextOptions is the empty dictionary (house WebIDL rule)', () => {
    // Empty dict ⇒ default '' sinkId ⇒ device-bound ⇒ the same missing-adapter error.
    expect(() => new PlecoAudioContext(null)).toThrowError(
      expect.objectContaining({ name: 'NotSupportedError' }),
    )
  })

  it('non-object contextOptions throws TypeError', () => {
    expect(() => new PlecoAudioContext(42)).toThrow(TypeError)
    expect(() => new PlecoAudioContext('interactive')).toThrow(TypeError)
  })

  it('latencyHint: invalid enum string throws TypeError (ctor-dict rule)', () => {
    expect(() => mockContext({ ctx: { latencyHint: 'fastest' } })).toThrow(TypeError)
  })

  it('latencyHint: non-string non-number, negative, and non-finite doubles throw TypeError', () => {
    expect(() => mockContext({ ctx: { latencyHint: true } })).toThrow(TypeError)
    expect(() => mockContext({ ctx: { latencyHint: -0.01 } })).toThrow(TypeError)
    expect(() => mockContext({ ctx: { latencyHint: NaN } })).toThrow(TypeError)
    expect(() => mockContext({ ctx: { latencyHint: Infinity } })).toThrow(TypeError)
  })

  it('baseLatency maps categories to whole render quanta: interactive 1, balanced 2, playback 4', () => {
    expect(mockContext({ ctx: { latencyHint: 'interactive' } }).ctx.baseLatency).toBe(RENDER_QUANTUM / SR)
    expect(mockContext({ ctx: { latencyHint: 'balanced' } }).ctx.baseLatency).toBe((2 * RENDER_QUANTUM) / SR)
    expect(mockContext({ ctx: { latencyHint: 'playback' } }).ctx.baseLatency).toBe((4 * RENDER_QUANTUM) / SR)
  })

  it('a double latencyHint quantizes UP to whole quanta with a one-quantum floor', () => {
    // 0.02 s at 44100 = 882 frames → 7 quanta (896 frames).
    const { ctx } = mockContext({ ctx: { latencyHint: 0.02 } })
    expect(ctx.baseLatency).toBe((7 * RENDER_QUANTUM) / SR)
    // 0 s still yields the one-quantum floor.
    const { ctx: ctx0 } = mockContext({ ctx: { latencyHint: 0 } })
    expect(ctx0.baseLatency).toBe(RENDER_QUANTUM / SR)
  })

  it('sampleRate outside the nominal range [3000, 768000] throws NotSupportedError', () => {
    expect(() => mockContext({ ctx: { sampleRate: 2999 } })).toThrowError(
      expect.objectContaining({ name: 'NotSupportedError' }),
    )
    expect(() => mockContext({ ctx: { sampleRate: 768001 } })).toThrowError(
      expect.objectContaining({ name: 'NotSupportedError' }),
    )
    expect(mockContext({ ctx: { sampleRate: 48000 } }).ctx.sampleRate).toBe(48000)
  })

  it('sinkId: invalid AudioSinkOptions.type and malformed sinkId throw TypeError', () => {
    expect(() => mockContext({ ctx: { sinkId: { type: 'speaker' } } })).toThrow(TypeError)
    expect(() => mockContext({ ctx: { sinkId: {} } })).toThrow(TypeError)
    expect(() => mockContext({ ctx: { sinkId: 42 } })).toThrow(TypeError)
    expect(() => mockContext({ ctx: { sinkId: null } })).toThrow(TypeError)
  })

  it("renderSizeHint: invalid enum string → TypeError; 'default'/'hardware' → fixed 128", () => {
    expect(() => mockContext({ ctx: { renderSizeHint: 'huge' } })).toThrow(TypeError)
    expect(mockContext({ ctx: { renderSizeHint: 'default' } }).ctx.renderQuantumSize).toBe(128)
    expect(mockContext({ ctx: { renderSizeHint: 'hardware' } }).ctx.renderQuantumSize).toBe(128)
  })

  it('renderSizeHint: non-integer → TypeError; out of range → NotSupportedError; ≠128 → the documented fixed-quantum gap', () => {
    expect(() => mockContext({ ctx: { renderSizeHint: 128.5 } })).toThrow(TypeError)
    expect(() => mockContext({ ctx: { renderSizeHint: 0 } })).toThrowError(
      expect.objectContaining({ name: 'NotSupportedError' }),
    )
    expect(() => mockContext({ ctx: { renderSizeHint: 6 * SR + 1 } })).toThrowError(
      expect.objectContaining({ name: 'NotSupportedError' }),
    )
    expect(() => mockContext({ ctx: { renderSizeHint: 256 } })).toThrowError(/fixed at 128/)
    expect(mockContext({ ctx: { renderSizeHint: 128 } }).ctx.renderQuantumSize).toBe(128)
  })

  it('a malformed options.sink adapter throws TypeError', () => {
    expect(() => new PlecoAudioContext({ sink: { open: () => {} } })).toThrow(TypeError)
    expect(() => new PlecoAudioContext({ sink: 'speakers' })).toThrow(TypeError)
  })

  it("the realtime destination takes the sink's maxChannelCount and stays mutable", () => {
    const { ctx } = mockContext({ mock: { maxChannelCount: 6 } })
    expect(ctx.destination.maxChannelCount).toBe(6)
    expect(ctx.destination.channelCount).toBe(2)
    ctx.destination.channelCount = 6 // realtime destination: mutable up to the ceiling
    expect(ctx.destination.channelCount).toBe(6)
    expect(() => {
      ctx.destination.channelCount = 7
    }).toThrowError(expect.objectContaining({ name: 'IndexSizeError' }))
  })
})

describe('PlecoAudioContext state machine — resume()/suspend()/close()', () => {
  it('resume() opens the sink, flips to running (one statechange), establishes [[sink ID]]', async () => {
    const { ctx, sink } = mockContext()
    const states = []
    ctx.onstatechange = () => states.push(ctx.state)
    await ctx.resume()
    expect(ctx.state).toBe('running')
    expect(sink.openCount).toBe(1)
    expect(sink.openFormats[0]).toEqual({
      sampleRate: SR,
      numberOfChannels: 2,
      renderQuantumSize: RENDER_QUANTUM,
      sinkId: '',
    })
    expect(states).toEqual(['running'])
    expect(ctx.sinkId).toBe('') // [[sink ID at construction]] promoted
  })

  it('resume() while running resolves with no extra statechange or reopen', async () => {
    const { ctx, sink } = mockContext()
    await ctx.resume()
    const states = []
    ctx.onstatechange = () => states.push(ctx.state)
    await ctx.resume()
    expect(states).toEqual([])
    expect(sink.openCount).toBe(1)
  })

  it('suspend() closes the sink and flips to suspended; suspend() when suspended is a no-op resolve', async () => {
    const { ctx, sink } = mockContext()
    await ctx.suspend() // already suspended: resolves, no event, no sink activity
    expect(ctx.state).toBe('suspended')
    expect(sink.closeCount).toBe(0)
    await ctx.resume()
    const states = []
    ctx.onstatechange = () => states.push(ctx.state)
    await ctx.suspend()
    expect(ctx.state).toBe('suspended')
    expect(sink.closeCount).toBe(1)
    expect(states).toEqual(['suspended'])
  })

  it('close() releases the sink, fires statechange, and every later lifecycle call rejects InvalidStateError', async () => {
    const { ctx, sink } = mockContext()
    await ctx.resume()
    const states = []
    ctx.onstatechange = () => states.push(ctx.state)
    await ctx.close()
    expect(ctx.state).toBe('closed')
    expect(sink.closeCount).toBe(1)
    expect(states).toEqual(['closed'])
    await expect(ctx.close()).rejects.toMatchObject({ name: 'InvalidStateError' })
    await expect(ctx.resume()).rejects.toMatchObject({ name: 'InvalidStateError' })
    await expect(ctx.suspend()).rejects.toMatchObject({ name: 'InvalidStateError' })
    await expect(ctx.setSinkId({ type: 'none' })).rejects.toMatchObject({ name: 'InvalidStateError' })
  })

  it('lifecycle promises settle strictly in call order (the control-message queue)', async () => {
    const { ctx } = mockContext()
    const order = []
    const p1 = ctx.resume().then(() => order.push('resume1'))
    const p2 = ctx.suspend().then(() => order.push('suspend'))
    const p3 = ctx.resume().then(() => order.push('resume2'))
    await Promise.all([p1, p2, p3])
    expect(order).toEqual(['resume1', 'suspend', 'resume2'])
    expect(ctx.state).toBe('running')
  })

  it('interleaved lifecycle calls fire statechange in call order too', async () => {
    const { ctx } = mockContext()
    const states = []
    ctx.onstatechange = () => states.push(ctx.state)
    await Promise.all([ctx.resume(), ctx.suspend(), ctx.resume(), ctx.close()])
    expect(states).toEqual(['running', 'suspended', 'running', 'closed'])
  })

  it("resume() rejects with the adapter's error when acquisition fails, and stays suspended", async () => {
    const { ctx, sink } = mockContext()
    sink.failOpen = true
    await expect(ctx.resume()).rejects.toThrow(/simulated resource-acquisition failure/)
    expect(ctx.state).toBe('suspended')
    // Recovers once the device comes back.
    sink.failOpen = false
    await ctx.resume()
    expect(ctx.state).toBe('running')
  })
})

describe("PlecoAudioContext 'closed' is terminal — async-revert races never revive it", () => {
  it('close() during a pending resume() acquisition failure: state stays closed, later lifecycle calls reject', async () => {
    const { ctx, sink } = mockContext()
    const states = []
    ctx.onstatechange = () => states.push(ctx.state)
    sink.failOpen = true
    const resumeP = ctx.resume() // 'running' intent, control message queued
    const closeP = ctx.close() // supersedes synchronously: terminal 'closed' intent
    await expect(resumeP).rejects.toThrow(/simulated resource-acquisition failure/)
    await closeP
    expect(ctx.state).toBe('closed')
    expect(states).toEqual(['closed'])
    // The guarded revert must NOT have clobbered 'closed' back to 'suspended':
    // a later resume() rejects InvalidStateError instead of reviving the context.
    sink.failOpen = false
    await expect(ctx.resume()).rejects.toMatchObject({ name: 'InvalidStateError' })
    await expect(ctx.suspend()).rejects.toMatchObject({ name: 'InvalidStateError' })
    expect(ctx.state).toBe('closed')
    expect(states).toEqual(['closed']) // no statechange fires after close
  })

  it('close() racing a setSinkId() acquisition failure: state stays closed, no revival', async () => {
    const { ctx, sink } = mockContext()
    await ctx.resume()
    await ctx.setSinkId({ type: 'none' }) // running on the internal null sink
    sink.failOpen = true // the swap back to the device sink will fail
    const states = []
    ctx.onstatechange = () => states.push(ctx.state)
    const swapP = ctx.setSinkId('') // control message queued
    const closeP = ctx.close() // supersedes synchronously
    await expect(swapP).rejects.toMatchObject({ name: 'InvalidAccessError' })
    await closeP
    expect(ctx.state).toBe('closed')
    // The swap's suspend bracket precedes the close — nothing fires after 'closed'.
    expect(states).toEqual(['suspended', 'closed'])
    sink.failOpen = false
    await expect(ctx.resume()).rejects.toMatchObject({ name: 'InvalidStateError' })
    expect(ctx.state).toBe('closed')
    expect(states).toEqual(['suspended', 'closed'])
  })

  it('a sink error racing a pending close() cannot revive the context (guarded sink-error handler)', async () => {
    const { ctx, sink } = mockContext()
    await ctx.resume()
    const states = []
    ctx.onstatechange = () => states.push(ctx.state)
    const closeP = ctx.close() // terminal intent set synchronously, message queued
    sink.simulateError(new Error('device unplugged')) // fires BEFORE the close message runs
    await closeP
    expect(ctx.state).toBe('closed')
    expect(states).toEqual(['suspended', 'closed'])
    await expect(ctx.resume()).rejects.toMatchObject({ name: 'InvalidStateError' })
    expect(ctx.state).toBe('closed')
    expect(states).toEqual(['suspended', 'closed']) // no statechange after close
  })
})

describe("PlecoAudioContext 'interrupted' state (spec § Handling an interruption)", () => {
  it('interruption while running: release + statechange to interrupted; end: reacquire + running', async () => {
    const { ctx, sink } = mockContext()
    await ctx.resume()
    const states = []
    ctx.onstatechange = () => states.push(ctx.state)
    await ctx._beginInterruption()
    expect(ctx.state).toBe('interrupted')
    expect(sink.closeCount).toBe(1)
    await ctx._endInterruption()
    expect(ctx.state).toBe('running')
    expect(sink.openCount).toBe(2)
    expect(states).toEqual(['interrupted', 'running'])
  })

  it('a masked interruption (begun while suspended) does NOT touch the visible state or fire statechange', async () => {
    const { ctx } = mockContext()
    const states = []
    ctx.onstatechange = () => states.push(ctx.state)
    await ctx._beginInterruption()
    expect(ctx.state).toBe('suspended') // privacy rule: attribute unchanged
    expect(states).toEqual([])
    await ctx._endInterruption()
    expect(ctx.state).toBe('suspended')
    expect(states).toEqual([]) // no attribute change ⇒ no event
  })

  it('resume() during a masked interruption uncovers it: statechange to interrupted + InvalidStateError rejection', async () => {
    const { ctx } = mockContext()
    await ctx._beginInterruption()
    const states = []
    ctx.onstatechange = () => states.push(ctx.state)
    await expect(ctx.resume()).rejects.toMatchObject({ name: 'InvalidStateError' })
    expect(ctx.state).toBe('interrupted')
    expect(states).toEqual(['interrupted'])
    // The rejected resume() recorded the run intent (spec: [[state before
    // interruption]] ← 'running'): ending the interruption resumes playback.
    await ctx._endInterruption()
    expect(ctx.state).toBe('running')
  })

  it('suspend() during an interruption wins: the context restores to suspended, not running', async () => {
    const { ctx } = mockContext()
    await ctx.resume()
    await ctx._beginInterruption()
    await ctx.suspend()
    expect(ctx.state).toBe('suspended')
    await ctx._endInterruption() // interruption already superseded: no-op
    expect(ctx.state).toBe('suspended')
  })

  it('_beginInterruption is a no-op while closed or already interrupted', async () => {
    const { ctx, sink } = mockContext()
    await ctx.resume()
    await ctx._beginInterruption()
    await ctx._beginInterruption()
    expect(sink.closeCount).toBe(1)
    const { ctx: closedCtx } = mockContext()
    await closedCtx.close()
    await closedCtx._beginInterruption()
    expect(closedCtx.state).toBe('closed')
  })
})

describe('PlecoAudioContext render loop — sink-paced pulls (the adapter seam)', () => {
  it('the sink cadence drives the clock: each step renders one quantum and advances currentTime', async () => {
    const { ctx, sink } = mockContext()
    await ctx.resume()
    expect(ctx.currentTime).toBe(0)
    sink.step(3)
    expect(ctx.currentTime).toBe((3 * RENDER_QUANTUM) / SR)
    expect(sink.pullCount).toBe(3)
    expect(sink.blocks).toHaveLength(3)
  })

  it('drop-in proof: manually stepped realtime blocks are bit-identical to an offline render of the same graph', async () => {
    const QUANTA = 8
    // Offline reference.
    const off = new PlecoOfflineAudioContext({ numberOfChannels: 2, length: QUANTA * RENDER_QUANTUM, sampleRate: SR })
    buildRampGraph(off)
    const reference = await off.startRendering()
    // Realtime, paced by manual MockSink stepping.
    const { ctx, sink } = mockContext()
    buildRampGraph(ctx)
    await ctx.resume()
    sink.step(QUANTA)
    expect(sink.blocks).toHaveLength(QUANTA)
    for (let q = 0; q < QUANTA; q++) {
      const block = sink.blocks[q]
      expect(block).toHaveLength(2) // stereo destination
      for (let c = 0; c < 2; c++) {
        const expected = reference.getChannelData(c).subarray(q * RENDER_QUANTUM, (q + 1) * RENDER_QUANTUM)
        expect(block[c]).toEqual(Float32Array.from(expected))
      }
    }
  })

  it('a sink that keeps pulling while the context is not running gets null (renders nothing)', async () => {
    // A minimal hand-rolled adapter proving the contract's null-answer rule
    // (PlecoMockSink can't reach it: the context closes it on suspend).
    let callbacks = null
    const sloppySink = {
      outputLatency: 0,
      maxChannelCount: 2,
      open: (format, cbs) => {
        callbacks = cbs
      },
      close: () => {}, // deliberately keeps the callbacks around
    }
    const ctx = new PlecoAudioContext({ sink: sloppySink })
    await ctx.resume()
    expect(callbacks.pull()).not.toBeNull()
    await ctx.suspend()
    const t = ctx.currentTime
    expect(callbacks.pull()).toBeNull()
    expect(ctx.currentTime).toBe(t) // no clock advance while suspended
  })

  it('rendering resumes exactly where it left off across suspend/resume (frame-counter purity)', async () => {
    const QUANTA = 6
    const off = new PlecoOfflineAudioContext({ numberOfChannels: 2, length: QUANTA * RENDER_QUANTUM, sampleRate: SR })
    buildRampGraph(off)
    const reference = await off.startRendering()
    const { ctx, sink } = mockContext()
    buildRampGraph(ctx)
    await ctx.resume()
    sink.step(2)
    await ctx.suspend()
    await ctx.resume()
    sink.step(4)
    const joined = new Float32Array(QUANTA * RENDER_QUANTUM)
    sink.blocks.forEach((block, q) => joined.set(block[0], q * RENDER_QUANTUM))
    expect(joined).toEqual(reference.getChannelData(0))
  })
})

describe('PlecoAudioContext.getOutputTimestamp()', () => {
  it('returns zeros before the graph has processed any block', async () => {
    const { ctx } = mockContext()
    expect(ctx.getOutputTimestamp()).toEqual({ contextTime: 0, performanceTime: 0 })
    await ctx.resume() // still zero blocks rendered
    expect(ctx.getOutputTimestamp()).toEqual({ contextTime: 0, performanceTime: 0 })
  })

  it('correlates contextTime to currentTime minus the pipeline latency, and performanceTime to performance.now()', async () => {
    const outputLatency = (2 * RENDER_QUANTUM) / SR
    const { ctx, sink } = mockContext({ mock: { outputLatency } })
    await ctx.resume()
    sink.step(10)
    const before = performance.now()
    const ts = ctx.getOutputTimestamp()
    const after = performance.now()
    expect(ts.contextTime).toBeCloseTo(ctx.currentTime - (ctx.baseLatency + outputLatency), 12)
    expect(ts.contextTime).toBeLessThan(ctx.currentTime) // spec invariant
    expect(ts.performanceTime).toBeGreaterThanOrEqual(before)
    expect(ts.performanceTime).toBeLessThanOrEqual(after)
  })

  it('clamps contextTime at 0 while the pipeline is still priming', async () => {
    const { ctx, sink } = mockContext({ mock: { outputLatency: 1 } }) // 1 s device latency
    await ctx.resume()
    sink.step(1) // currentTime ≪ pipeline latency
    const ts = ctx.getOutputTimestamp()
    expect(ts.contextTime).toBe(0)
    expect(ctx.currentTime).toBeGreaterThan(ts.contextTime)
    expect(ts.performanceTime).toBeGreaterThan(performance.now()) // frame 0 plays in the future
  })
})

describe('PlecoAudioContext.playbackStats — AudioPlaybackStats', () => {
  it('is the [SameObject] PlecoAudioPlaybackStats instance with zeroed initial slots', () => {
    const { ctx } = mockContext()
    expect(ctx.playbackStats).toBeInstanceOf(PlecoAudioPlaybackStats)
    expect(ctx.playbackStats).toBe(ctx.playbackStats)
    expect(ctx.playbackStats.underrunDuration).toBe(0)
    expect(ctx.playbackStats.underrunEvents).toBe(0)
    expect(ctx.playbackStats.totalDuration).toBe(0)
    expect(ctx.playbackStats.averageLatency).toBe(0)
    expect(ctx.playbackStats.minimumLatency).toBe(0)
    expect(ctx.playbackStats.maximumLatency).toBe(0)
  })

  it('totalDuration = underrunDuration + currentTime (spec definition)', async () => {
    const { ctx, sink } = mockContext()
    await ctx.resume()
    sink.step(10)
    expect(ctx.playbackStats.totalDuration).toBeCloseTo((10 * RENDER_QUANTUM) / SR, 12)
    sink.simulateUnderrun(RENDER_QUANTUM)
    expect(ctx.playbackStats.totalDuration).toBeCloseTo((11 * RENDER_QUANTUM) / SR, 12)
  })

  it('each onUnderrun call is one underrun EVENT; durations accumulate in seconds', async () => {
    const { ctx, sink } = mockContext()
    await ctx.resume()
    sink.simulateUnderrun(256)
    sink.simulateUnderrun(128)
    expect(ctx.playbackStats.underrunEvents).toBe(2)
    expect(ctx.playbackStats.underrunDuration).toBeCloseTo(384 / SR, 12)
  })

  it('tracks minimum/maximum/average latency across the sink drift', async () => {
    const { ctx, sink } = mockContext({ mock: { outputLatency: 0.01 } })
    await ctx.resume()
    sink.step(1) // sample 0.01
    sink.outputLatency = 0.03
    sink.step(1) // sample 0.03
    sink.outputLatency = 0.02
    sink.step(1) // sample 0.02
    expect(ctx.playbackStats.minimumLatency).toBeCloseTo(0.01, 12)
    expect(ctx.playbackStats.maximumLatency).toBeCloseTo(0.03, 12)
    expect(ctx.playbackStats.averageLatency).toBeCloseTo(0.02, 12)
  })

  it('resetLatency() restarts the tracked interval seeded with the last played latency', async () => {
    const { ctx, sink } = mockContext({ mock: { outputLatency: 0.01 } })
    await ctx.resume()
    sink.step(1)
    sink.outputLatency = 0.05
    sink.step(1)
    ctx.playbackStats.resetLatency()
    expect(ctx.playbackStats.minimumLatency).toBeCloseTo(0.05, 12)
    expect(ctx.playbackStats.maximumLatency).toBeCloseTo(0.05, 12)
    expect(ctx.playbackStats.averageLatency).toBeCloseTo(0.05, 12)
    sink.outputLatency = 0.02
    sink.step(1)
    expect(ctx.playbackStats.minimumLatency).toBeCloseTo(0.02, 12)
    expect(ctx.playbackStats.maximumLatency).toBeCloseTo(0.05, 12)
  })

  it('resetLatency() before any playback seeds the interval with 0', () => {
    const { ctx } = mockContext()
    ctx.playbackStats.resetLatency()
    expect(ctx.playbackStats.minimumLatency).toBe(0)
    expect(ctx.playbackStats.maximumLatency).toBe(0)
    expect(ctx.playbackStats.averageLatency).toBe(0)
  })

  it('toJSON() returns the six stat attributes as a plain object (spec [Default] toJSON)', async () => {
    const { ctx, sink } = mockContext({ mock: { outputLatency: 0.01 } })
    await ctx.resume()
    sink.step(2)
    sink.simulateUnderrun(128)
    const json = ctx.playbackStats.toJSON()
    expect(json).toEqual({
      underrunDuration: ctx.playbackStats.underrunDuration,
      underrunEvents: 1,
      totalDuration: ctx.playbackStats.totalDuration,
      averageLatency: 0.01,
      minimumLatency: 0.01,
      maximumLatency: 0.01,
    })
    expect(JSON.parse(JSON.stringify(ctx.playbackStats))).toEqual(json)
  })
})

describe('PlecoAudioContext sinkId / setSinkId() / onsinkchange', () => {
  it("setSinkId({ type: 'none' }) swaps to the internal NullSink and fires sinkchange", async () => {
    const { ctx, sink } = mockContext()
    await ctx.resume()
    let sinkchanges = 0
    ctx.onsinkchange = () => sinkchanges++
    await ctx.setSinkId({ type: 'none' })
    expect(sinkchanges).toBe(1)
    expect(ctx.sinkId).toBeInstanceOf(PlecoAudioSinkInfo)
    expect(ctx.sinkId.type).toBe('none')
    expect(ctx.sinkId).toBe(ctx.sinkId) // cached-object rule
    expect(sink.closeCount).toBe(1) // the device sink was released
    expect(ctx._sink).toBeInstanceOf(PlecoNullSink)
    expect(ctx.state).toBe('running')
  })

  it('while running the swap brackets with statechange suspended → sinkchange → statechange running', async () => {
    const { ctx } = mockContext()
    await ctx.resume()
    const events = []
    ctx.onstatechange = () => events.push(`statechange:${ctx.state}`)
    ctx.onsinkchange = () => events.push('sinkchange')
    await ctx.setSinkId({ type: 'none' })
    expect(events).toEqual(['statechange:suspended', 'sinkchange', 'statechange:running'])
  })

  it('after swapping to the NullSink, manual NullSink stepping keeps rendering deterministically', async () => {
    const { ctx, sink } = mockContext()
    buildRampGraph(ctx)
    await ctx.resume()
    sink.step(2)
    await ctx.setSinkId({ type: 'none' })
    const t = ctx.currentTime
    const rendered = ctx._sink.step(3)
    expect(rendered).toBe(3)
    expect(ctx.currentTime).toBeCloseTo(t + (3 * RENDER_QUANTUM) / SR, 12)
  })

  it('setSinkId with the current value resolves immediately without a sinkchange', async () => {
    const { ctx } = mockContext()
    let sinkchanges = 0
    ctx.onsinkchange = () => sinkchanges++
    await ctx.setSinkId('') // equal to the initial [[sink ID]]
    expect(sinkchanges).toBe(0)
    await ctx.setSinkId({ type: 'none' })
    expect(sinkchanges).toBe(1)
    await ctx.setSinkId({ type: 'none' }) // AudioSinkInfo/AudioSinkOptions type equality
    expect(sinkchanges).toBe(1)
  })

  it('back-to-back equal AudioSinkOptions calls collapse to ONE swap (control-message equality re-check, spec steps 3–4)', async () => {
    const { ctx } = mockContext()
    await ctx.resume()
    const events = []
    ctx.onstatechange = () => events.push(`statechange:${ctx.state}`)
    ctx.onsinkchange = () => events.push('sinkchange')
    const p1 = ctx.setSinkId({ type: 'none' })
    const p2 = ctx.setSinkId({ type: 'none' }) // enqueued before the first message runs
    await Promise.all([p1, p2])
    // ONE sinkchange, ONE suspend/run bracket — the second message re-checks
    // [[sink ID]] at run time, finds it equal, and resolves with no events.
    expect(events).toEqual(['statechange:suspended', 'sinkchange', 'statechange:running'])
    expect(ctx.sinkId.type).toBe('none')
    expect(ctx.state).toBe('running')
  })

  it('a queued string setSinkId equal to the [[sink ID]] the previous message just set resolves with no second swap', async () => {
    const sink = new PlecoMockSink()
    sink.validateSinkId = (id) => id === 'known-device'
    const ctx = new PlecoAudioContext({ sink })
    await ctx.resume()
    const events = []
    ctx.onstatechange = () => events.push(`statechange:${ctx.state}`)
    ctx.onsinkchange = () => events.push('sinkchange')
    const p1 = ctx.setSinkId('known-device')
    const p2 = ctx.setSinkId('known-device') // equal, but [[sink ID]] is still '' at call time
    await Promise.all([p1, p2])
    expect(events).toEqual(['statechange:suspended', 'sinkchange', 'statechange:running'])
    expect(ctx.sinkId).toBe('known-device')
    expect(sink.openCount).toBe(2) // initial resume + ONE swap reacquire — never a third
  })

  it('setSinkId back to the device sink reopens it (suspended context defers to resume)', async () => {
    const { ctx, sink } = mockContext()
    await ctx.setSinkId({ type: 'none' }) // suspended: no acquisition yet
    expect(sink.openCount).toBe(0)
    await ctx.setSinkId('')
    expect(ctx.sinkId).toBe('')
    expect(sink.openCount).toBe(0) // still deferred
    await ctx.resume()
    expect(sink.openCount).toBe(1)
    expect(ctx.state).toBe('running')
  })

  it('malformed arguments reject with TypeError (promise-returning method, never a sync throw)', async () => {
    const { ctx } = mockContext()
    await expect(ctx.setSinkId(42)).rejects.toBeInstanceOf(TypeError)
    await expect(ctx.setSinkId(null)).rejects.toBeInstanceOf(TypeError)
    await expect(ctx.setSinkId({ type: 'speaker' })).rejects.toBeInstanceOf(TypeError)
    await expect(ctx.setSinkId({})).rejects.toBeInstanceOf(TypeError)
  })

  it('an unvalidatable device id rejects with NotAllowedError', async () => {
    const ctx = new PlecoAudioContext({ sinkId: { type: 'none' } }) // no device adapter at all
    await expect(ctx.setSinkId('device-7')).rejects.toMatchObject({ name: 'NotAllowedError' })
    // An adapter that vetoes the id via the optional validateSinkId hook.
    const sink = new PlecoMockSink()
    sink.validateSinkId = (id) => id === 'known-device'
    const { ctx: ctx2 } = { ctx: new PlecoAudioContext({ sink }) }
    await expect(ctx2.setSinkId('unknown-device')).rejects.toMatchObject({ name: 'NotAllowedError' })
    await expect(ctx2.setSinkId('known-device')).resolves.toBeUndefined()
    expect(ctx2.sinkId).toBe('known-device')
  })

  it('acquisition failure for the new sink rejects with InvalidAccessError and leaves the context suspended', async () => {
    const { ctx, sink } = mockContext()
    await ctx.resume()
    await ctx.setSinkId({ type: 'none' })
    sink.failOpen = true
    await expect(ctx.setSinkId('')).rejects.toMatchObject({ name: 'InvalidAccessError' })
    expect(ctx.state).toBe('suspended')
    expect(ctx.sinkId.type).toBe('none') // [[sink ID]] not updated on failure
  })
})

describe('PlecoAudioContext.onerror — sink failure reporting', () => {
  it('a sink failure while running releases the sink, fires error (with the cause) then statechange suspended', async () => {
    const { ctx, sink } = mockContext()
    await ctx.resume()
    const events = []
    ctx.onerror = (e) => events.push(`error:${e.error.message}`)
    ctx.onstatechange = () => events.push(`statechange:${ctx.state}`)
    sink.simulateError(new Error('device unplugged'))
    expect(events).toEqual(['error:device unplugged', 'statechange:suspended'])
    expect(ctx.state).toBe('suspended')
    expect(sink.closeCount).toBe(1)
    // The context can recover with an explicit resume().
    await ctx.resume()
    expect(ctx.state).toBe('running')
    expect(sink.openCount).toBe(2)
  })

  it('a sink failure while suspended fires error only (no state change)', async () => {
    // Hand-rolled adapter: keeps callbacks after close so it can misfire late.
    let callbacks = null
    const sloppySink = {
      outputLatency: 0,
      maxChannelCount: 2,
      open: (format, cbs) => {
        callbacks = cbs
      },
      close: () => {},
    }
    const ctx = new PlecoAudioContext({ sink: sloppySink })
    await ctx.resume()
    await ctx.suspend()
    const events = []
    ctx.onerror = () => events.push('error')
    ctx.onstatechange = () => events.push(`statechange:${ctx.state}`)
    callbacks.onError(new Error('late device report'))
    expect(events).toEqual(['error'])
    expect(ctx.state).toBe('suspended')
  })

  it('onerror handler attribute follows the assign/replace/clear EventHandler pattern', async () => {
    const { ctx, sink } = mockContext()
    await ctx.resume()
    let a = 0
    let b = 0
    const ha = () => a++
    ctx.onerror = ha
    expect(ctx.onerror).toBe(ha)
    ctx.onerror = () => b++
    ctx.onerror = ctx.onerror // reassign same
    sink.simulateError(new Error('x'))
    expect(a).toBe(0) // replaced before dispatch
    expect(b).toBe(1)
    await ctx.resume()
    ctx.onerror = null
    expect(ctx.onerror).toBeNull()
    sink.simulateError(new Error('y'))
    expect(b).toBe(1) // unsubscribed
  })
})

describe('xa-sink.js adapters — the contract itself', () => {
  it('PlecoNullSink: type none, manual stepping requires open, argument validation', () => {
    const sink = new PlecoNullSink()
    expect(sink.type).toBe('none')
    expect(sink.isOpen).toBe(false)
    expect(() => sink.step()).toThrowError(expect.objectContaining({ name: 'InvalidStateError' }))
    let pulls = 0
    sink.open({ renderQuantumSize: RENDER_QUANTUM }, { pull: () => (pulls++, null) })
    expect(sink.isOpen).toBe(true)
    expect(() => sink.step(0)).toThrow(TypeError)
    expect(() => sink.step(1.5)).toThrow(TypeError)
    expect(sink.step(3)).toBe(0) // null answers render nothing
    expect(pulls).toBe(3)
    sink.close()
    sink.close() // idempotent
    expect(sink.isOpen).toBe(false)
  })

  it('PlecoNullSink constructor and outputLatency setter validate their numbers', () => {
    expect(() => new PlecoNullSink({ maxChannelCount: 0 })).toThrow(TypeError)
    expect(() => new PlecoNullSink({ outputLatency: -1 })).toThrow(TypeError)
    const sink = new PlecoNullSink({ maxChannelCount: 8, outputLatency: 0.5 })
    expect(sink.maxChannelCount).toBe(8)
    expect(sink.outputLatency).toBe(0.5)
    expect(() => {
      sink.outputLatency = NaN
    }).toThrow(TypeError)
  })

  it('PlecoMockSink records deep copies of pulled blocks and counts every cadence cycle', () => {
    const sink = new PlecoMockSink()
    const source = new Float32Array(4).fill(1)
    let giveBlock = true
    sink.open({}, { pull: () => (giveBlock ? [source] : null) })
    sink.step(1)
    source.fill(9) // mutating the source must not touch the recording
    expect(Array.from(sink.blocks[0][0])).toEqual([1, 1, 1, 1])
    giveBlock = false
    sink.step(2)
    expect(sink.pullCount).toBe(3)
    expect(sink.blocks).toHaveLength(1)
  })

  it('PlecoMockSink fault injection requires an open sink', () => {
    const sink = new PlecoMockSink()
    expect(() => sink.simulateUnderrun(128)).toThrowError(
      expect.objectContaining({ name: 'InvalidStateError' }),
    )
    expect(() => sink.simulateError(new Error('x'))).toThrowError(
      expect.objectContaining({ name: 'InvalidStateError' }),
    )
    sink.open({}, { pull: () => null, onUnderrun: () => {}, onError: () => {} })
    expect(() => sink.simulateUnderrun(0)).toThrow(TypeError)
  })

  it('PlecoAudioSinkInfo validates its AudioSinkType', () => {
    expect(new PlecoAudioSinkInfo('none').type).toBe('none')
    expect(() => new PlecoAudioSinkInfo('speakers')).toThrow(TypeError)
  })
})
