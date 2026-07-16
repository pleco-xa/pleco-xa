/**
 * pleco-xa/engine — pleco's zero-dependency Web Audio API (the parity engine).
 *
 * The SPEC-SHAPED tier: pleco's own ground-up reimplementation of the W3C Web
 * Audio API, class-for-class and behavior-for-behavior (37 of 39 live
 * interfaces; verified bit-exact against Chrome across the browser-bounce
 * corpus). A consumer builds a graph exactly as with Web Audio — swap the
 * import, get the same samples — and it runs headless in Node with zero deps:
 *
 *   import { PlecoOfflineAudioContext } from 'pleco-xa/engine'
 *   const ctx = new PlecoOfflineAudioContext({ numberOfChannels: 2, length, sampleRate })
 *   const osc = ctx.createOscillator()
 *   osc.connect(ctx.destination); osc.start()
 *   const buffer = await ctx.startRendering()
 *
 * Naming: classes are `Pleco`-prefixed on purpose — the surface is pleco's
 * identity (the same stance as never advertising librosa). This engine tier
 * stays spec-shaped so it remains a literal drop-in and so the WPT /
 * browser-bounce verification holds; the pleco-idiomatic public "skin" is a
 * SEPARATE future top-level surface layered on top, not a replacement for this.
 *
 * Only the public constructible surface + the swappable output/media adapters
 * are re-exported here; internal graph plumbing (audio ports, DOMException
 * factories, channel-mixing helpers, context-singleton vends) stays private.
 */

// ── Contexts ────────────────────────────────────────────────────────────────
export { PlecoBaseContext } from './xa-base-context.js'
export { PlecoAudioContext, PlecoAudioSinkInfo, PlecoAudioPlaybackStats } from './xa-audio-context.js'
export { PlecoOfflineAudioContext, PlecoOfflineAudioCompletionEvent } from './xa-offline-context.js'

// ── Buffers · params · wavetables · listener ────────────────────────────────
export { PlecoAudioBuffer, createPlecoAudioBuffer } from './xa-buffer.js'
export { PlecoAudioParam } from './xa-param.js'
export { PlecoPeriodicWave } from './nodes/xa-periodic-wave.js'
export { PlecoAudioListener } from './xa-listener.js'

// ── Node base interfaces ────────────────────────────────────────────────────
export { PlecoNode, PlecoScheduledSourceNode } from './xa-node.js'

// ── Source · processing · routing nodes ─────────────────────────────────────
export { PlecoAudioDestinationNode } from './nodes/xa-destination.js'
export { PlecoGainNode } from './nodes/xa-gain.js'
export { PlecoAudioBufferSourceNode } from './nodes/xa-buffer-source.js'
export { PlecoConstantSourceNode } from './nodes/xa-constant-source.js'
export { PlecoOscillatorNode } from './nodes/xa-oscillator.js'
export { PlecoDelayNode } from './nodes/xa-delay.js'
export { PlecoBiquadFilterNode } from './nodes/xa-biquad-filter.js'
export { PlecoIIRFilterNode } from './nodes/xa-iir-filter.js'
export { PlecoWaveShaperNode } from './nodes/xa-wave-shaper.js'
export { PlecoDynamicsCompressorNode } from './nodes/xa-dynamics-compressor.js'
export { PlecoStereoPannerNode } from './nodes/xa-stereo-panner.js'
export { PlecoPannerNode } from './nodes/xa-panner.js'
export { PlecoConvolverNode } from './nodes/xa-convolver.js'
export { PlecoAnalyserNode } from './nodes/xa-analyser.js'
export { PlecoChannelSplitterNode } from './nodes/xa-channel-splitter.js'
export { PlecoChannelMergerNode } from './nodes/xa-channel-merger.js'

// ── AudioWorklet cluster ────────────────────────────────────────────────────
export {
  PlecoAudioWorklet,
  PlecoAudioWorkletProcessor,
  PlecoAudioWorkletGlobalScope,
  PlecoErrorEvent,
} from './xa-audio-worklet.js'
export { PlecoAudioWorkletNode, PlecoAudioParamMap } from './nodes/xa-audio-worklet-node.js'

// ── Media nodes + their (out-of-spec) env-adapter shims ─────────────────────
export {
  PlecoMediaElementAudioSourceNode,
  PlecoMediaStreamAudioSourceNode,
  PlecoMediaStreamTrackAudioSourceNode,
  PlecoMediaStreamAudioDestinationNode,
} from './nodes/xa-media-nodes.js'
export {
  PlecoMediaSampleFeed,
  PlecoMediaStreamShim,
  PlecoMediaStreamTrackShim,
  PlecoMediaElementShim,
} from './xa-media-adapters.js'

// ── The swappable output sink — the one irreducible seam (samples→speaker) ──
export { PlecoNullSink, PlecoMockSink } from './xa-sink.js'

// ── Browser I/O adapters (P23 — the hardware seam, closed) ──────────────────
// The real drop-ins that carry pleco to/from actual hardware in a browser:
// PlecoBrowserAudioSink pulls pleco's rendered quanta out through one native
// AudioContext to real speakers; createBrowserMicFeed streams a live
// getUserMedia mic into a PlecoMediaStreamAudioSourceNode. Both are import-safe
// in Node — they touch browser globals only when constructed/called, never at
// module load — so the headless surface is unaffected.
export { PlecoBrowserAudioSink } from './adapters/xa-browser-sink.js'
export { createBrowserMicFeed } from './adapters/xa-mic-feed.js'

// ── Constants ───────────────────────────────────────────────────────────────
export { RENDER_QUANTUM } from './xa-constants.js'
