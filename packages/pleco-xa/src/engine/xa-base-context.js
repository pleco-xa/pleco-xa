/**
 * engine/xa-base-context.js — PlecoBaseContext.
 *
 * The frame clock + the single render step every driver shares. `currentTime` is
 * a PURE derivation of an integer frame counter (never a wall clock) — that is
 * exactly what makes offline and realtime graph math identical, and what lets a
 * later browser sink slot under the same renderQuantum() as a drop-in.
 *
 * The frame advances AFTER the pull, so `currentTime` during a block equals the
 * block's START — the invariant the per-node memo and scheduled-event windowing
 * both rely on.
 *
 * P06 spec surface (spec § The BaseAudioContext Interface):
 * - extends EventTarget; `state` (AudioContextState, default 'suspended') with
 *   the internal _setState(name) transition primitive + the `statechange`
 *   Event and `onstatechange` event-handler attribute. State TRANSITION
 *   policy (when suspend/resume/close move the state) is P07/P21 scope —
 *   this class only owns the attribute, the primitive, and the event.
 * - `renderQuantumSize` — the [[render quantum size]] slot; pleco's is the
 *   fixed RENDER_QUANTUM (renderSizeHint configurability is P21 scope).
 * - decodeAudioData(audioData, successCallback, errorCallback) — see below.
 * - sampleRate is validated against the spec's nominal range ("Supported
 *   Sample Rates", [3000, 768000] Hz) with a NotSupportedError, and stored as
 *   float32 (IDL `float`, Math.fround) — the same rule PlecoAudioBuffer
 *   enforces.
 */
import { RENDER_QUANTUM } from './xa-constants.js'
import { PlecoAudioDestinationNode } from './nodes/xa-destination.js'
import { PlecoGainNode } from './nodes/xa-gain.js'
import { PlecoAudioBufferSourceNode } from './nodes/xa-buffer-source.js'
import { PlecoChannelSplitterNode } from './nodes/xa-channel-splitter.js'
import { PlecoChannelMergerNode } from './nodes/xa-channel-merger.js'
import { PlecoWaveShaperNode } from './nodes/xa-wave-shaper.js'
import { PlecoAnalyserNode } from './nodes/xa-analyser.js'
import { PlecoConstantSourceNode } from './nodes/xa-constant-source.js'
import { PlecoDelayNode } from './nodes/xa-delay.js'
import { PlecoStereoPannerNode } from './nodes/xa-stereo-panner.js'
import { PlecoBiquadFilterNode } from './nodes/xa-biquad-filter.js'
import { PlecoIIRFilterNode } from './nodes/xa-iir-filter.js'
import { PlecoDynamicsCompressorNode } from './nodes/xa-dynamics-compressor.js'
import { PlecoOscillatorNode } from './nodes/xa-oscillator.js'
import { PlecoPeriodicWave } from './nodes/xa-periodic-wave.js'
import { PlecoConvolverNode } from './nodes/xa-convolver.js'
import { PlecoPannerNode } from './nodes/xa-panner.js'
import { getContextListener } from './xa-listener.js'
import { createPlecoAudioBuffer } from './xa-buffer.js'
import { decodeWavArrayBuffer, resampleLinearChannels } from './xa-decode.js'
import { invalidStateError, notSupportedError } from './xa-errors.js'

/** Spec nominal sample-rate range ("Supported Sample Rates") — same bounds as PlecoAudioBuffer. */
const MIN_SAMPLE_RATE = 3000
const MAX_SAMPLE_RATE = 768000

/** The spec's AudioContextState enum values. */
const AUDIO_CONTEXT_STATES = ['suspended', 'running', 'closed', 'interrupted']

export class PlecoBaseContext extends EventTarget {
  #onstatechange = null

  constructor({ sampleRate, numberOfChannels = 1 } = {}) {
    super()
    // Spec "Supported Sample Rates": nominal range [3000, 768000] Hz, outside
    // → NotSupportedError. IDL declares sampleRate a `float` — fround first,
    // then range-check (non-numbers fail the range comparison).
    const rate = typeof sampleRate === 'number' ? Math.fround(sampleRate) : NaN
    if (!(rate >= MIN_SAMPLE_RATE && rate <= MAX_SAMPLE_RATE)) {
      throw notSupportedError(
        `PlecoBaseContext: sampleRate must be in the nominal range [${MIN_SAMPLE_RATE}, ${MAX_SAMPLE_RATE}] Hz, got ${sampleRate}`,
      )
    }
    this._sampleRate = rate
    this._numberOfChannels = numberOfChannels
    this._frame = 0
    // Spec: [[control thread state]] and [[rendering thread state]] both start
    // 'suspended'. Pleco's single-thread engine keeps one slot; transitions
    // happen only through _setState (P07/P21 drive WHEN).
    this._state = 'suspended'
    // Started scheduled sources register here (xa-node.js start()/_end()) so
    // renderQuantum() ticks them even when nothing pulls them — a source's
    // stop/exhaustion window (and its `ended` event) is connectivity-
    // independent per the spec. Double-ticking a pulled source is a no-op
    // thanks to the per-quantum memo.
    this._tailNodes = new Set()
    this._destination = new PlecoAudioDestinationNode(this, { channelCount: numberOfChannels })
  }

  get sampleRate() {
    return this._sampleRate
  }

  get currentTime() {
    return this._frame / this._sampleRate
  }

  get destination() {
    return this._destination
  }

  /** Spec `state` attribute: the [[control thread state]] slot. */
  get state() {
    return this._state
  }

  /** Spec `renderQuantumSize` attribute: the [[render quantum size]] slot — pleco's fixed RENDER_QUANTUM. */
  get renderQuantumSize() {
    return RENDER_QUANTUM
  }

  /**
   * `onstatechange` event-handler IDL attribute (event type `statechange`),
   * backed by the EventTarget inheritance: assigning subscribes, reassigning
   * replaces, null (or any non-function) unsubscribes — same pattern as
   * PlecoScheduledSourceNode.onended.
   */
  get onstatechange() {
    return this.#onstatechange
  }

  set onstatechange(fn) {
    if (this.#onstatechange !== null) this.removeEventListener('statechange', this.#onstatechange)
    this.#onstatechange = typeof fn === 'function' ? fn : null
    if (this.#onstatechange !== null) this.addEventListener('statechange', this.#onstatechange)
  }

  /**
   * Internal state-transition primitive: set the state slot and dispatch a
   * `statechange` Event — fired only "whenever the state changes to a
   * DIFFERENT state" (spec § onstatechange), so a same-state call is a no-op.
   * P07 (offline suspend/resume/startRendering) and P21 (realtime lifecycle)
   * decide WHEN to call this; they also own any task-queue deferral the spec
   * attaches to a given transition — dispatch here is synchronous.
   */
  _setState(name) {
    if (!AUDIO_CONTEXT_STATES.includes(name)) {
      throw new TypeError(
        `PlecoBaseContext._setState: state must be one of ${AUDIO_CONTEXT_STATES.join(' | ')}, got ${name}`,
      )
    }
    if (this._state === name) return
    this._state = name
    this.dispatchEvent(new Event('statechange'))
  }

  /**
   * BaseAudioContext.createBuffer(numberOfChannels, length, sampleRate) —
   * zero-initialized PlecoAudioBuffer. Throws a NotSupportedError DOMException
   * if any argument is zero, negative, or outside its nominal range (same
   * validation path as the PlecoAudioBuffer constructor).
   */
  createBuffer(numberOfChannels, length, sampleRate) {
    return createPlecoAudioBuffer(numberOfChannels, length, sampleRate)
  }

  createGain() {
    // Factory algorithm sets only passed parameters — createGain takes none,
    // so the node keeps the spec GainNode defaults (channelCount 2, mode 'max').
    return new PlecoGainNode(this)
  }

  /** Spec § createChannelSplitter(numberOfOutputs = 6) — bounds validated by the node constructor. */
  createChannelSplitter(numberOfOutputs = 6) {
    return new PlecoChannelSplitterNode(this, { numberOfOutputs })
  }

  /** Spec § createChannelMerger(numberOfInputs = 6) — bounds validated by the node constructor. */
  createChannelMerger(numberOfInputs = 6) {
    return new PlecoChannelMergerNode(this, { numberOfInputs })
  }

  /** Spec § createWaveShaper() — no parameters; node keeps WaveShaperNode defaults. */
  createWaveShaper() {
    return new PlecoWaveShaperNode(this)
  }

  /** Spec § createAnalyser() — no parameters; node keeps AnalyserNode defaults. */
  createAnalyser() {
    return new PlecoAnalyserNode(this)
  }

  /** Spec § BaseAudioContext.listener — the context's AudioListener singleton (lazy). */
  get listener() {
    return getContextListener(this)
  }

  /** Spec § createConvolver() — no parameters. */
  createConvolver() {
    return new PlecoConvolverNode(this)
  }

  /** Spec § createPanner() — no parameters; node keeps PannerNode defaults. */
  createPanner() {
    return new PlecoPannerNode(this)
  }

  /** Spec § createConstantSource() — no parameters; offset defaults to 1. */
  createConstantSource() {
    return new PlecoConstantSourceNode(this)
  }

  /** Spec § createDelay(maxDelayTime = 1.0) — bounds validated by the node constructor. */
  createDelay(maxDelayTime = 1.0) {
    return new PlecoDelayNode(this, { maxDelayTime })
  }

  /** Spec § createStereoPanner() — no parameters. */
  createStereoPanner() {
    return new PlecoStereoPannerNode(this)
  }

  /** Spec § createBiquadFilter() — no parameters; node keeps BiquadFilterNode defaults. */
  createBiquadFilter() {
    return new PlecoBiquadFilterNode(this)
  }

  /** Spec § createIIRFilter(feedforward, feedback) — validation lives in the node constructor. */
  createIIRFilter(feedforward, feedback) {
    return new PlecoIIRFilterNode(this, { feedforward, feedback })
  }

  /** Spec § createDynamicsCompressor() — no parameters. */
  createDynamicsCompressor() {
    return new PlecoDynamicsCompressorNode(this)
  }

  /** Spec § createOscillator() — no parameters; node keeps OscillatorNode defaults. */
  createOscillator() {
    return new PlecoOscillatorNode(this)
  }

  /** Spec § createPeriodicWave(real, imag, constraints) — both coefficient arrays are required. */
  createPeriodicWave(real, imag, constraints = {}) {
    if (real === undefined || imag === undefined) {
      throw new TypeError('createPeriodicWave: real and imag coefficient arrays are both required')
    }
    return new PlecoPeriodicWave(this, { real, imag, ...constraints })
  }

  createBufferSource() {
    return new PlecoAudioBufferSourceNode(this)
  }

  /**
   * BaseAudioContext.decodeAudioData(audioData, successCallback, errorCallback)
   * → Promise<PlecoAudioBuffer> (spec § BaseAudioContext, decodeAudioData()).
   *
   * Native decode — SUPPORTED FORMATS (see xa-decode.js; anything else rejects
   * with EncodingError, never a silent fallback): RIFF/WAVE with PCM 8-bit
   * unsigned / 16 / 24 / 32-bit signed int, or 32-bit IEEE float; mono and
   * multi-channel; any WAV sample rate (resampled to the context's rate by
   * linear interpolation when they differ, per the spec's decode step 5.1).
   *
   * Spec semantics kept:
   * - `audioData` is DETACHED (transfer semantics) before decoding — after the
   *   call the caller's ArrayBuffer is neutered (byteLength 0). An
   *   already-detached buffer rejects with the platform's DataCloneError (and
   *   invokes errorCallback), per algorithm step 4.
   * - A closed context rejects with InvalidStateError WITHOUT detaching —
   *   pleco's analogue of step 1's "document not fully active" gate (the
   *   errorCallback is also invoked, matching implementations).
   * - The promise never settles synchronously (the "decoding thread"
   *   analogue); successCallback/errorCallback are invoked before the
   *   corresponding promise reaction runs, matching the spec's task ordering.
   * - Decode failure → EncodingError via BOTH the promise and errorCallback.
   *
   * @param {ArrayBuffer} audioData — complete audio file bytes (consumed).
   * @param {?function} [successCallback] — legacy callback, invoked with the buffer.
   * @param {?function} [errorCallback] — legacy callback, invoked with the DOMException.
   * @returns {Promise<import('./xa-buffer.js').PlecoAudioBuffer>}
   */
  decodeAudioData(audioData, successCallback = null, errorCallback = null) {
    // WebIDL binding checks — a Promise-returning method converts argument
    // errors into rejections rather than synchronous throws.
    if (successCallback != null && typeof successCallback !== 'function') {
      return Promise.reject(new TypeError('PlecoBaseContext.decodeAudioData: successCallback must be a function'))
    }
    if (errorCallback != null && typeof errorCallback !== 'function') {
      return Promise.reject(new TypeError('PlecoBaseContext.decodeAudioData: errorCallback must be a function'))
    }
    if (!(audioData instanceof ArrayBuffer)) {
      return Promise.reject(
        new TypeError(`PlecoBaseContext.decodeAudioData: audioData must be an ArrayBuffer, got ${audioData}`),
      )
    }
    // Step-1 analogue (checked BEFORE detaching, so the caller's buffer
    // survives): a closed context can no longer be used to process audio.
    if (this._state === 'closed') {
      const err = invalidStateError('PlecoBaseContext.decodeAudioData: the context is closed')
      if (errorCallback) queueMicrotask(() => errorCallback(err))
      return Promise.reject(err)
    }
    // Step 3.2: detach audioData (transfer semantics — structuredClone with
    // transfer neuters the caller's ArrayBuffer and hands us the bytes). An
    // already-detached buffer makes structuredClone throw the platform
    // DataCloneError → step 4 error path.
    let data
    try {
      data = structuredClone(audioData, { transfer: [audioData] })
    } catch (err) {
      if (errorCallback) queueMicrotask(() => errorCallback(err))
      return Promise.reject(err)
    }
    return (async () => {
      // Decoding-thread analogue: never settle in the caller's synchronous frame.
      await Promise.resolve()
      let buffer
      try {
        const decoded = decodeWavArrayBuffer(data)
        const channels =
          decoded.sampleRate === this._sampleRate
            ? decoded.channels
            : resampleLinearChannels(decoded.channels, decoded.sampleRate, this._sampleRate)
        buffer = createPlecoAudioBuffer(channels.length, channels[0].length, this._sampleRate)
        for (let c = 0; c < channels.length; c++) buffer.getChannelData(c).set(channels[c])
      } catch (err) {
        if (errorCallback) errorCallback(err)
        throw err
      }
      if (successCallback) successCallback(buffer)
      return buffer
    })()
  }

  /** The one engine step: pull the graph from the sink, tick tail nodes, advance the clock. */
  renderQuantum() {
    const block = this._destination._tick()
    for (const tail of this._tailNodes) tail._tick()
    this._frame += RENDER_QUANTUM
    return block
  }
}
