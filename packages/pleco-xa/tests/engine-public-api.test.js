import { describe, it, expect } from 'vitest'
import * as engine from '../src/engine/index.js'
import {
  PlecoOfflineAudioContext,
  PlecoAudioContext,
  PlecoAudioBuffer,
  PlecoGainNode,
  PlecoOscillatorNode,
  PlecoAnalyserNode,
  PlecoNullSink,
  RENDER_QUANTUM,
} from '../src/engine/index.js'

// PUBLIC API smoke test for the `pleco-xa/engine` subpath. It imports ONLY the
// engine barrel — zero internal file paths — proving the parity engine is a
// real importable Web Audio API: swap the import, build a graph the Web-Audio
// way, get the same samples, headless in Node with zero deps.

describe('pleco-xa/engine — public API (consumer imports only the barrel)', () => {
  it('renders a source→gain→destination graph offline, sample-exact', () => {
    const ctx = new PlecoOfflineAudioContext({ numberOfChannels: 1, length: 384, sampleRate: 44100 })
    const buf = ctx.createBuffer(1, 320, 44100)
    buf.getChannelData(0).forEach((_, i, a) => (a[i] = i))
    const src = ctx.createBufferSource()
    src.buffer = buf
    const gain = ctx.createGain()
    gain.gain.value = 0.5
    src.connect(gain).connect(ctx.destination)
    src.start(0)

    const out = ctx.renderSync()
    expect(out).toBeInstanceOf(PlecoAudioBuffer)
    const d = out.getChannelData(0)
    for (let i = 0; i < 320; i++) expect(d[i]).toBe(Math.fround(i * 0.5))
    for (let i = 320; i < 384; i++) expect(d[i]).toBe(0)
  })

  it('exposes the two context constructors + the quantum constant', () => {
    expect(RENDER_QUANTUM).toBe(128)
    expect(typeof PlecoAudioContext).toBe('function')
    expect(typeof PlecoOfflineAudioContext).toBe('function')
  })

  it('node classes are constructible directly AND via context factories', () => {
    const ctx = new PlecoOfflineAudioContext({ numberOfChannels: 1, length: 128, sampleRate: 44100 })
    expect(new PlecoGainNode(ctx)).toBeInstanceOf(PlecoGainNode)
    expect(ctx.createOscillator()).toBeInstanceOf(PlecoOscillatorNode)
    expect(ctx.createAnalyser()).toBeInstanceOf(PlecoAnalyserNode)
  })

  it('exports the full constructible Web Audio node surface', () => {
    const expected = [
      'PlecoAudioContext', 'PlecoOfflineAudioContext', 'PlecoBaseContext',
      'PlecoAudioBuffer', 'PlecoAudioParam', 'PlecoPeriodicWave', 'PlecoAudioListener',
      'PlecoNode', 'PlecoScheduledSourceNode',
      'PlecoGainNode', 'PlecoAudioBufferSourceNode', 'PlecoConstantSourceNode', 'PlecoOscillatorNode',
      'PlecoDelayNode', 'PlecoBiquadFilterNode', 'PlecoIIRFilterNode', 'PlecoWaveShaperNode',
      'PlecoDynamicsCompressorNode', 'PlecoStereoPannerNode', 'PlecoPannerNode', 'PlecoConvolverNode',
      'PlecoAnalyserNode', 'PlecoChannelSplitterNode', 'PlecoChannelMergerNode', 'PlecoAudioDestinationNode',
      'PlecoMediaElementAudioSourceNode', 'PlecoMediaStreamAudioSourceNode',
      'PlecoMediaStreamTrackAudioSourceNode', 'PlecoMediaStreamAudioDestinationNode',
      'PlecoAudioWorklet', 'PlecoAudioWorkletNode', 'PlecoAudioWorkletProcessor', 'PlecoAudioWorkletGlobalScope',
      'PlecoNullSink', 'PlecoMockSink',
    ]
    for (const name of expected) expect(typeof engine[name], name).toBe('function')
  })

  it('does NOT leak internal plumbing (ports, DOMException factories, mixing helpers)', () => {
    expect(engine.PlecoAudioPort).toBeUndefined()
    expect(engine.PlecoAudioInput).toBeUndefined()
    expect(engine.mixInto).toBeUndefined()
    expect(engine.invalidStateError).toBeUndefined()
    expect(engine.computeNumberOfChannels).toBeUndefined()
  })

  it('the swappable output sink is public for the realtime driver', () => {
    expect(typeof PlecoNullSink).toBe('function')
  })
})
