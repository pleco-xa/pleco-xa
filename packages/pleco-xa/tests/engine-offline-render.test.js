import { describe, it, expect } from 'vitest'
import { PlecoOfflineAudioContext } from '../src/engine/xa-offline-context.js'
import { PlecoAudioBuffer } from '../src/engine/xa-buffer.js'
import { RENDER_QUANTUM } from '../src/engine/xa-constants.js'
import { PlecoBaseContext } from '../src/engine/xa-base-context.js'

// Slice 1 of the pleco-xa 3.0 Web-Audio-replacement engine: a source→gain→
// destination graph rendered fully OFFLINE to a PlecoAudioBuffer, with ZERO Web Audio
// imported anywhere. Proves the whole spine — RENDER_QUANTUM, the frame clock,
// the pull graph, the buffer-source voice, gain, the sink, offline blit, and
// determinism — all headless.

const SR = 44100

describe('engine — the frame clock (headless)', () => {
  it('currentTime is a pure derivation of the frame counter; advances by exactly one quantum', () => {
    const ctx = new PlecoBaseContext({ sampleRate: SR, numberOfChannels: 1 })
    expect(ctx.currentTime).toBe(0)
    ctx.renderQuantum()
    expect(ctx.currentTime).toBe(RENDER_QUANTUM / SR)
    ctx.renderQuantum()
    expect(ctx.currentTime).toBe((2 * RENDER_QUANTUM) / SR)
  })

  it('renderQuantum() on an empty graph returns a silent 128-frame block', () => {
    const ctx = new PlecoBaseContext({ sampleRate: SR, numberOfChannels: 1 })
    const block = ctx.renderQuantum()
    expect(block.length).toBe(RENDER_QUANTUM)
    expect(Array.from(block.getChannelData(0))).toEqual(new Array(RENDER_QUANTUM).fill(0))
  })
})

describe('engine — source→gain→destination rendered offline (headless, zero Web Audio)', () => {
  // 320-frame ramp source (2.5 quanta) so we cross block boundaries AND test the ended tail.
  const makeSource = () => {
    const src = new PlecoAudioBuffer({ numberOfChannels: 1, length: 320, sampleRate: SR })
    src.getChannelData(0).forEach((_, i, a) => (a[i] = i)) // 0,1,2,...,319 (all exact in f32)
    return src
  }

  it('renders sample-exact: out[i] = fround(src[i] * 0.5), silence after the source ends', () => {
    const ctx = new PlecoOfflineAudioContext({ numberOfChannels: 1, length: 384, sampleRate: SR }) // 3 quanta
    const s = ctx.createBufferSource()
    s.buffer = makeSource()
    const g = ctx.createGain()
    g.gain.value = 0.5
    s.connect(g)
    g.connect(ctx.destination)
    s.start(0)

    const out = ctx.renderSync()
    expect(out).toBeInstanceOf(PlecoAudioBuffer)
    expect(out.length).toBe(384)

    const d = out.getChannelData(0)
    for (let i = 0; i < 320; i++) expect(d[i]).toBe(Math.fround(i * 0.5)) // gain applied, exact
    for (let i = 320; i < 384; i++) expect(d[i]).toBe(0) // ended → silent tail
  })

  it('is deterministic — two renders are bit-identical', () => {
    const render = () => {
      const c = new PlecoOfflineAudioContext({ numberOfChannels: 1, length: 384, sampleRate: SR })
      const s = c.createBufferSource()
      s.buffer = makeSource()
      const g = c.createGain()
      g.gain.value = 0.5
      s.connect(g)
      g.connect(c.destination)
      s.start(0)
      return Array.from(c.renderSync().getChannelData(0))
    }
    expect(render()).toEqual(render())
  })

  it('fires ended exactly once when the source is exhausted', async () => {
    const ctx = new PlecoOfflineAudioContext({ numberOfChannels: 1, length: 384, sampleRate: SR })
    const s = ctx.createBufferSource()
    s.buffer = makeSource()
    let endedCount = 0
    s.onended = () => endedCount++
    s.connect(ctx.destination)
    s.start(0)
    ctx.renderSync()
    await Promise.resolve() // ended is dispatched via queueMicrotask (P05), never inside the render pull
    expect(endedCount).toBe(1)
  })
})
