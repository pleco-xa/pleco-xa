/**
 * pleco-xa/studio — the plecoized public surface.
 *
 * pleco has three tiers of the same engine, from most-standard to most-pleco:
 *   1. raw Web Audio       — you never touch it; pleco reimplements it.
 *   2. `pleco-xa/engine`   — the SPEC-SHAPED tier: Pleco*-named classes that are
 *                            a literal Web Audio drop-in (the WPT / browser-bounce
 *                            verification surface).
 *   3. `pleco-xa/studio`   — THIS: the same engine, wearing pleco's own names and
 *                            a friendlier front door. Nothing is reinvented — it's
 *                            Web Audio without the ceremony, headless in Node, and
 *                            it composes with the librosa analysis side for free.
 *
 *   import { offline, Osc, Gain } from 'pleco-xa/studio'
 *   const s = offline({ channels: 1, seconds: 1 })   // an OfflineStudio
 *   const osc = s.osc({ frequency: 440 })            // or: new Osc(s, { frequency: 440 })
 *   osc.connect(s.gain({ gain: 0.5 })).connect(s.out)
 *   osc.start()
 *   const clip = await s.render()                    // a Clip (AudioBuffer)
 *
 * Naming (Web Audio interface → pleco name): the redundant `Node`/`Audio` ceremony
 * is dropped, the recognizable core word kept.
 *   AudioContext→live()/LiveStudio · OfflineAudioContext→offline()/OfflineStudio
 *   GainNode→Gain · OscillatorNode→Osc · DelayNode→Delay · BiquadFilterNode→Filter
 *   IIRFilterNode→IIR · WaveShaperNode→Shaper · DynamicsCompressorNode→Compressor
 *   StereoPannerNode→Pan · PannerNode→Panner · ConvolverNode→Convolver
 *   AnalyserNode→Analyser · ChannelSplitterNode→Split · ChannelMergerNode→Merge
 *   ConstantSourceNode→Const · AudioBufferSourceNode→Player · AudioBuffer→Clip
 *   PeriodicWave→Wave · AudioListener→Listener · AudioWorkletNode→Processor
 *   AudioParam→Param
 *
 * Every name here is an alias of the exact same `pleco-xa/engine` class — the
 * behavior IS the verified parity engine. `s instanceof Osc` etc. hold.
 */
import {
  PlecoAudioContext,
  PlecoOfflineAudioContext,
  PlecoNullSink,
  PlecoGainNode,
  PlecoOscillatorNode,
  PlecoDelayNode,
  PlecoBiquadFilterNode,
  PlecoIIRFilterNode,
  PlecoWaveShaperNode,
  PlecoDynamicsCompressorNode,
  PlecoStereoPannerNode,
  PlecoPannerNode,
  PlecoConvolverNode,
  PlecoAnalyserNode,
  PlecoChannelSplitterNode,
  PlecoChannelMergerNode,
  PlecoConstantSourceNode,
  PlecoAudioBufferSourceNode,
  PlecoAudioBuffer,
  PlecoPeriodicWave,
  PlecoAudioListener,
  PlecoAudioWorkletNode,
  PlecoAudioParam,
  RENDER_QUANTUM,
} from '../engine/index.js'

// ── Node names — pleco's own, aliasing the spec-shaped engine classes ────────
export {
  PlecoGainNode as Gain,
  PlecoOscillatorNode as Osc,
  PlecoDelayNode as Delay,
  PlecoBiquadFilterNode as Filter,
  PlecoIIRFilterNode as IIR,
  PlecoWaveShaperNode as Shaper,
  PlecoDynamicsCompressorNode as Compressor,
  PlecoStereoPannerNode as Pan,
  PlecoPannerNode as Panner,
  PlecoConvolverNode as Convolver,
  PlecoAnalyserNode as Analyser,
  PlecoChannelSplitterNode as Split,
  PlecoChannelMergerNode as Merge,
  PlecoConstantSourceNode as Const,
  PlecoAudioBufferSourceNode as Player,
  PlecoAudioBuffer as Clip,
  PlecoPeriodicWave as Wave,
  PlecoAudioListener as Listener,
  PlecoAudioWorkletNode as Processor,
  PlecoAudioParam as Param,
  RENDER_QUANTUM,
}

/**
 * Shared ergonomic sugar for both studio kinds: `out` for the destination and
 * one-call node factories (thin wrappers over `new Pleco*Node(this, opts)` — no
 * behavior change, just fewer keystrokes). Applied as a mixin so both the
 * offline and live studios get it without duplicating the base class.
 */
const Studio = (Base) =>
  class extends Base {
    /** The output — where the final mix goes (Web Audio's `destination`). */
    get out() {
      return this.destination
    }

    osc(options) {
      return new PlecoOscillatorNode(this, options)
    }
    gain(options) {
      return new PlecoGainNode(this, options)
    }
    delay(options) {
      return new PlecoDelayNode(this, options)
    }
    filter(options) {
      return new PlecoBiquadFilterNode(this, options)
    }
    shaper(options) {
      return new PlecoWaveShaperNode(this, options)
    }
    compressor(options) {
      return new PlecoDynamicsCompressorNode(this, options)
    }
    pan(options) {
      return new PlecoStereoPannerNode(this, options)
    }
    panner(options) {
      return new PlecoPannerNode(this, options)
    }
    convolver(options) {
      return new PlecoConvolverNode(this, options)
    }
    analyser(options) {
      return new PlecoAnalyserNode(this, options)
    }
    split(options) {
      return new PlecoChannelSplitterNode(this, options)
    }
    merge(options) {
      return new PlecoChannelMergerNode(this, options)
    }
    constant(options) {
      return new PlecoConstantSourceNode(this, options)
    }
    player(options) {
      return new PlecoAudioBufferSourceNode(this, options)
    }
    wave(options) {
      return new PlecoPeriodicWave(this, options)
    }

    /**
     * Allocate an empty Clip (AudioBuffer) sized in frames or `seconds`, at the
     * studio's sampleRate by default: `s.clip({ channels: 1, seconds: 2 })`.
     */
    clip({ channels = 1, length, seconds, sampleRate = this.sampleRate } = {}) {
      const frames = length ?? Math.round((seconds ?? 0) * sampleRate)
      return this.createBuffer(channels, frames, sampleRate)
    }
  }

/** An offline studio — renders a graph to a Clip, deterministically, headless. */
export class OfflineStudio extends Studio(PlecoOfflineAudioContext) {
  /** Render the graph and resolve a Clip (alias of the spec `startRendering()`). */
  render() {
    return this.startRendering()
  }
}

/** A live studio — drives real-time output through a swappable sink. */
export class LiveStudio extends Studio(PlecoAudioContext) {}

/**
 * Make an offline studio. Sizes accept the spec's `length` (frames) OR the
 * friendlier `seconds`; `channels` aliases numberOfChannels.
 *   offline({ channels = 2, seconds }) | offline({ length, sampleRate })
 */
export function offline({ channels = 2, length, seconds, sampleRate = 44100 } = {}) {
  const frames = length ?? Math.round((seconds ?? 0) * sampleRate)
  return new OfflineStudio({ numberOfChannels: channels, length: frames, sampleRate })
}

/**
 * Make a live studio. Defaults a `PlecoNullSink` so it constructs and runs
 * headless (no audio device); pass your own `sink` (or a browser sink) for real
 * output. resume()/suspend()/close() drive it, exactly like a Web Audio context.
 */
export function live({ sink, sampleRate, ...options } = {}) {
  return new LiveStudio({ sink: sink ?? new PlecoNullSink(), sampleRate, ...options })
}

/** Default export: the pleco studio front door. `import pleco from 'pleco-xa/studio'`. */
export default { offline, live, OfflineStudio, LiveStudio }
