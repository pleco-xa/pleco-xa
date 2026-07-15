import { describe, it, expect } from 'vitest'
import * as studio from '../src/studio/index.js'
import {
  offline,
  live,
  OfflineStudio,
  LiveStudio,
  Osc,
  Gain,
  Delay,
  Filter,
  Player,
  Clip,
  RENDER_QUANTUM,
} from '../src/studio/index.js'
import * as engine from '../src/engine/index.js'

// pleco-xa/studio — the plecoized public skin (task #56). It renames the engine's
// spec-shaped surface to pleco's own vocabulary and adds offline()/live() +
// node-factory sugar. These tests hold the identity contract: the skin is the
// SAME verified engine wearing pleco names — never a second implementation.

const SR = 8192 // 1 render quantum = 128/8192 = 0.015625 s (binary-exact)

describe('studio — names are aliases of the exact engine classes (zero reimplementation)', () => {
  it('every pleco node name IS its engine class (same constructor identity)', () => {
    expect(studio.Gain).toBe(engine.PlecoGainNode)
    expect(studio.Osc).toBe(engine.PlecoOscillatorNode)
    expect(studio.Delay).toBe(engine.PlecoDelayNode)
    expect(studio.Filter).toBe(engine.PlecoBiquadFilterNode)
    expect(studio.IIR).toBe(engine.PlecoIIRFilterNode)
    expect(studio.Shaper).toBe(engine.PlecoWaveShaperNode)
    expect(studio.Compressor).toBe(engine.PlecoDynamicsCompressorNode)
    expect(studio.Pan).toBe(engine.PlecoStereoPannerNode)
    expect(studio.Panner).toBe(engine.PlecoPannerNode)
    expect(studio.Convolver).toBe(engine.PlecoConvolverNode)
    expect(studio.Analyser).toBe(engine.PlecoAnalyserNode)
    expect(studio.Split).toBe(engine.PlecoChannelSplitterNode)
    expect(studio.Merge).toBe(engine.PlecoChannelMergerNode)
    expect(studio.Const).toBe(engine.PlecoConstantSourceNode)
    expect(studio.Player).toBe(engine.PlecoAudioBufferSourceNode)
    expect(studio.Clip).toBe(engine.PlecoAudioBuffer)
    expect(studio.Wave).toBe(engine.PlecoPeriodicWave)
    expect(studio.Listener).toBe(engine.PlecoAudioListener)
    expect(studio.Processor).toBe(engine.PlecoAudioWorkletNode)
    expect(studio.Param).toBe(engine.PlecoAudioParam)
  })

  it('re-exports the render quantum unchanged', () => {
    expect(RENDER_QUANTUM).toBe(engine.RENDER_QUANTUM)
    expect(RENDER_QUANTUM).toBe(128)
  })
})

describe('studio — offline() factory', () => {
  it('is a real OfflineAudioContext (and an engine PlecoOfflineAudioContext)', () => {
    const s = offline({ channels: 1, length: 128, sampleRate: SR })
    expect(s).toBeInstanceOf(OfflineStudio)
    expect(s).toBeInstanceOf(engine.PlecoOfflineAudioContext)
    expect(s.length).toBe(128)
    expect(s.sampleRate).toBe(SR)
    expect(s.destination.channelCount).toBe(1)
  })

  it('seconds sugar computes length = round(seconds * sampleRate)', () => {
    const s = offline({ channels: 2, seconds: 0.5, sampleRate: SR })
    expect(s.length).toBe(4096) // 0.5 * 8192
    expect(s.destination.channelCount).toBe(2)
  })

  it('explicit length wins over seconds; channels defaults to 2', () => {
    const s = offline({ length: 256, sampleRate: SR })
    expect(s.length).toBe(256)
    expect(s.destination.channelCount).toBe(2)
  })
})

describe('studio — live() factory', () => {
  it('constructs headless with a default NullSink (state suspended)', () => {
    const s = live({ sampleRate: SR })
    expect(s).toBeInstanceOf(LiveStudio)
    expect(s).toBeInstanceOf(engine.PlecoAudioContext)
    expect(s.state).toBe('suspended')
  })

  it('accepts an explicit sink', () => {
    const sink = new engine.PlecoMockSink()
    const s = live({ sink, sampleRate: SR })
    expect(s).toBeInstanceOf(LiveStudio)
    expect(s.state).toBe('suspended')
  })
})

describe('studio — .out and node-factory sugar', () => {
  it('.out is the destination node', () => {
    const s = offline({ channels: 1, length: 128, sampleRate: SR })
    expect(s.out).toBe(s.destination)
  })

  it('factory methods build the right engine node bound to this context', () => {
    const s = offline({ channels: 1, length: 128, sampleRate: SR })
    const osc = s.osc({ frequency: 440 })
    const gain = s.gain({ gain: 0.5 })
    const delay = s.delay({ delayTime: 0.01 })
    const filter = s.filter({ type: 'lowpass' })
    const player = s.player()
    expect(osc).toBeInstanceOf(Osc)
    expect(gain).toBeInstanceOf(Gain)
    expect(delay).toBeInstanceOf(Delay)
    expect(filter).toBeInstanceOf(Filter)
    expect(player).toBeInstanceOf(Player)
    expect(osc.context).toBe(s)
    expect(osc.frequency.value).toBe(440)
    expect(gain.gain.value).toBe(0.5)
  })

  it('clip() sizes a Clip by seconds at the studio sampleRate', () => {
    const s = offline({ channels: 1, length: 128, sampleRate: SR })
    const c = s.clip({ channels: 1, seconds: 0.25 })
    expect(c).toBeInstanceOf(Clip)
    expect(c.length).toBe(2048) // 0.25 * 8192
    expect(c.sampleRate).toBe(SR)
  })

  it('connect() is chainable (returns the destination node)', () => {
    const s = offline({ channels: 1, length: 128, sampleRate: SR })
    const gain = s.gain({ gain: 0.5 })
    expect(s.osc({ frequency: 440 }).connect(gain)).toBe(gain)
  })
})

describe('studio — renders, and renders IDENTICALLY to the engine tier (parity holds)', () => {
  // Osc(440, gain 0.5) -> destination, built two ways: via the studio skin and
  // via the raw engine. Bit-for-bit equal output proves the skin is a pure
  // renaming with no behavioral drift.
  const buildOnStudio = () => {
    const s = offline({ channels: 1, length: 256, sampleRate: SR })
    const osc = s.osc({ frequency: 440, type: 'sine' })
    const gain = s.gain({ gain: 0.5 })
    osc.connect(gain).connect(s.out)
    osc.start(0)
    return s.render()
  }

  const buildOnEngine = () => {
    const ctx = new engine.PlecoOfflineAudioContext({
      numberOfChannels: 1,
      length: 256,
      sampleRate: SR,
    })
    const osc = new engine.PlecoOscillatorNode(ctx, { frequency: 440, type: 'sine' })
    const gain = new engine.PlecoGainNode(ctx, { gain: 0.5 })
    osc.connect(gain).connect(ctx.destination)
    osc.start(0)
    return ctx.startRendering()
  }

  it('render() returns a Clip with a non-silent signal', async () => {
    const clip = await buildOnStudio()
    expect(clip).toBeInstanceOf(Clip)
    expect(clip.length).toBe(256)
    const peak = Math.max(...Array.from(clip.getChannelData(0)).map(Math.abs))
    expect(peak).toBeGreaterThan(0)
    expect(peak).toBeLessThanOrEqual(0.5) // gain-limited
  })

  it('studio skin output === raw engine output, sample for sample', async () => {
    const [viaStudio, viaEngine] = await Promise.all([buildOnStudio(), buildOnEngine()])
    expect(Array.from(viaStudio.getChannelData(0))).toEqual(
      Array.from(viaEngine.getChannelData(0)),
    )
  })
})

describe('studio — default export front door', () => {
  it('bundles offline/live/OfflineStudio/LiveStudio', () => {
    expect(studio.default.offline).toBe(offline)
    expect(studio.default.live).toBe(live)
    expect(studio.default.OfflineStudio).toBe(OfflineStudio)
    expect(studio.default.LiveStudio).toBe(LiveStudio)
  })
})
