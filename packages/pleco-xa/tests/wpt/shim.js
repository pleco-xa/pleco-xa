/**
 * tests/wpt/shim.js — the WebIDL-shape global shim.
 *
 * Makes the "swap the import" contract literal at the *global* level: the
 * spec-named constructors that web-platform-tests reach for
 * (AudioContext, OfflineAudioContext, GainNode, ...) are bound to the
 * corresponding Pleco* classes from src/engine/index.js.
 *
 * Note: the Pleco classes keep their `Pleco`-prefixed `.name` on purpose (the
 * engine's identity stance). We alias the *binding*, not the class name — so
 * `node instanceof GainNode` and `node.constructor === GainNode` hold, but a
 * test that asserts `node.constructor.name === 'GainNode'` (a string compare)
 * or `.inheritFrom('AudioScheduledSourceNode')` will diverge. Those are
 * reported by the runner as naming-surface deviations, not silently patched.
 */

import * as engine from '../../src/engine/index.js'

/** spec WebIDL name -> Pleco engine export name */
export const SPEC_TO_PLECO = {
  // contexts
  BaseAudioContext: 'PlecoBaseContext',
  AudioContext: 'PlecoAudioContext',
  OfflineAudioContext: 'PlecoOfflineAudioContext',
  OfflineAudioCompletionEvent: 'PlecoOfflineAudioCompletionEvent',
  // buffers, params, wavetables, listener
  AudioBuffer: 'PlecoAudioBuffer',
  AudioParam: 'PlecoAudioParam',
  PeriodicWave: 'PlecoPeriodicWave',
  AudioListener: 'PlecoAudioListener',
  // node base interfaces
  AudioNode: 'PlecoNode',
  AudioScheduledSourceNode: 'PlecoScheduledSourceNode',
  // source / processing / routing nodes
  AudioDestinationNode: 'PlecoAudioDestinationNode',
  GainNode: 'PlecoGainNode',
  AudioBufferSourceNode: 'PlecoAudioBufferSourceNode',
  ConstantSourceNode: 'PlecoConstantSourceNode',
  OscillatorNode: 'PlecoOscillatorNode',
  DelayNode: 'PlecoDelayNode',
  BiquadFilterNode: 'PlecoBiquadFilterNode',
  IIRFilterNode: 'PlecoIIRFilterNode',
  WaveShaperNode: 'PlecoWaveShaperNode',
  DynamicsCompressorNode: 'PlecoDynamicsCompressorNode',
  StereoPannerNode: 'PlecoStereoPannerNode',
  PannerNode: 'PlecoPannerNode',
  ConvolverNode: 'PlecoConvolverNode',
  AnalyserNode: 'PlecoAnalyserNode',
  ChannelSplitterNode: 'PlecoChannelSplitterNode',
  ChannelMergerNode: 'PlecoChannelMergerNode',
  // worklet cluster
  AudioWorklet: 'PlecoAudioWorklet',
  AudioWorkletNode: 'PlecoAudioWorkletNode',
  AudioWorkletProcessor: 'PlecoAudioWorkletProcessor',
  AudioParamMap: 'PlecoAudioParamMap',
}

/**
 * Realtime AudioContext needs an output sink adapter — the one irreducible
 * "samples -> speaker" seam. WPT tests that reach for `new AudioContext()`
 * expect the browser to wire that up implicitly. Headless, we supply the
 * spec-equivalent of a silent output (PlecoNullSink) when the test provides
 * none, so construction-only realtime tests can build a graph. We do NOT force
 * a sink when the test explicitly passes options.sink or a device sinkId.
 */
class HarnessAudioContext extends engine.PlecoAudioContext {
  constructor(contextOptions = {}) {
    const opts = { ...(contextOptions || {}) }
    if (opts.sink == null) opts.sink = new engine.PlecoNullSink()
    super(opts)
  }
}

/**
 * Install the spec-named constructors onto `target` (defaults to globalThis).
 * Returns the list of spec names that were successfully bound.
 */
export function installEngineGlobals(target = globalThis) {
  const bound = []
  for (const [specName, plecoName] of Object.entries(SPEC_TO_PLECO)) {
    const cls = engine[plecoName]
    if (typeof cls === 'undefined') continue
    target[specName] = cls
    bound.push(specName)
  }
  // Override the realtime context with the null-sink-defaulting wrapper.
  target.AudioContext = HarnessAudioContext
  return bound
}

export { engine }
