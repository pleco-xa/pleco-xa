/**
 * engine/nodes/xa-dynamics-compressor.js — PlecoDynamicsCompressorNode.
 *
 * Spec-shaped DynamicsCompressorNode (spec § The DynamicsCompressorNode
 * Interface + § DynamicsCompressorOptions Processing). Native DSP — this
 * replaces the reference implementation's `audio-effect` dependency with the
 * spec's own processing model, implemented sample-for-sample:
 *
 *   const delay = new DelayNode(context, {delayTime: 0.006})
 *   const gain = new GainNode(context)
 *   const compression = new EnvelopeFollower()
 *   input.connect(delay).connect(gain).connect(output)
 *   input.connect(compression).connect(gain.gain)
 *
 * i.e. a fixed 6 ms look-ahead: the OUTPUT path is delayed, the gain computer
 * runs on the UNDELAYED input, so the reduction gain is already in place when
 * a transient emerges from the delay line. The delay lines are Float32Array
 * (a real DelayNode carries float32 blocks); envelope state stays double.
 *
 * Cross-implementation note — pinned to the SPEC, not to any browser's kernel.
 * The spec's processing model is exactly that: a MODEL. It explicitly delegates
 * THREE shapes to the User-Agent — the soft-knee curve (§ compression curve
 * step 6: "User-Agents can choose the curve shape"), the detector curve
 * (§ detector-curve), and the envelope-rate function (§ computing envelope rate:
 * "User-agents are allowed to choose the shape of the envelope function") — and
 * it self-contradicts on metering (algorithm step 10 vs the `reduction`
 * attribute prose; see the metering-conflict note below). Every shipping browser
 * fills those freedoms with a different PRIVATE kernel: Chrome's
 * DynamicsCompressorKernel interpolates the gain across 32-frame sub-divisions,
 * uses an exponential knee table and an adaptive envelope, and on the P23
 * compressor-burst fixture compresses ~1.8 dB harder than this model (measured
 * block-RMS delta up to 81.7 %); Firefox's kernel differs again; NONE of the
 * three match each other bit-for-bit. Bit-exact Chrome parity is therefore
 * unachievable BY CONSTRUCTION — it is not a pleco defect, and no browser meets
 * it either. Pleco is instead pinned step-for-step to the NORMATIVE algorithm
 * traced below, with the three delegated shapes chosen as the documented
 * degenerate/attribute-prose readings. The compressor UNIT tests
 * (tests/engine-compressor.test.js) pin the spec-DEFINED, non-delegated behavior
 * exactly against independent closed-form values — identity below threshold,
 * knee monotonicity + continuity, the ratio law (§ ratio: "dB change in input
 * for a 1 dB change in output"), the attack/release 10 dB timing (the attribute
 * definitions), and the `reduction` metering formula. The browser-bounce golden
 * keeps the Chrome delta VISIBLE as an it.fails, honestly labelled as
 * implementation-defined divergence rather than hidden under a loose tolerance.
 *
 * Spec surface:
 * - Five k-rate AudioParams with the automation rate constraint (§ automation
 *   rate constraints — changing the rate throws InvalidStateError):
 *   threshold [-100, 0] def -24, knee [0, 40] def 30, ratio [1, 20] def 12,
 *   attack [0, 1] def 0.003, release [0, 1] def 0.25. Sampled once per render
 *   quantum via the params' computedValue (automation + input connections).
 * - readonly float `reduction` — the [[internal reduction]] slot, initialized
 *   to 0 and set once per block ("atomically ... at the end of the block") to
 *   the final sample's COMPRESSOR (envelope) gain converted to dB
 *   (v = 0 → -1000, else 20·log10(v)) — the makeup stage is EXCLUDED from
 *   the meter (0 at rest, ≤ 0 when compressing; see the metering-conflict
 *   note below).
 * - channelCount constraints: cc 2, cannot exceed 2 (NotSupportedError);
 *   channelCountMode 'clamped-max', cannot be set to 'max' (NotSupportedError)
 *   — enforced on both attribute assignment and the constructor dictionary.
 *
 * EnvelopeFollower (spec § reduction-gain algorithm), per sample of the
 * undelayed input, with two persistent slots [[detector average]] (init 0)
 * and [[compressor gain]] (init 1):
 *   1. attenuation = 1 if |input| < 0.0001, else curve(|input|)/|input|
 *   2. releasing = attenuation > compressor gain
 *   3-5. detector average += (attenuation − average)·detectorRate, clamp ≤ 1
 *   6-8. releasing → gain = min(1, gain·envelopeRate);
 *        attacking → gain += (average − gain)·envelopeRate
 *   9. reduction gain = gain × makeup gain, makeup = (1/curve(1))^0.6
 *   10. metering gain = reduction gain in dB (pleco meters the compressor
 *       gain EXCLUDING makeup — see the metering-conflict note below)
 *
 * Compression curve (§ compression curve): identity up to the linear
 * threshold; a soft knee over [threshold, threshold+knee] dB (shape
 * implementation-defined, must be monotonic + continuous); slope 1/ratio in
 * dB above the knee. Pleco's knee is the standard quadratic spline
 *   out = in + (1/ratio − 1)·(in − threshold)² / (2·knee)   [dB domain]
 * which meets the identity with slope 1 at `threshold` and the ratio segment
 * with slope 1/ratio at `threshold + knee` (continuous, piece-wise
 * differentiable, monotonically increasing for ratio ≤ 20). knee = 0 is the
 * hard-knee degenerate case (the knee branch is unreachable).
 *
 * Implementation-defined choices (the spec explicitly delegates these),
 * stated honestly:
 * - Detector curve: constant 1.0 — the detector average tracks the
 *   attenuation exactly (a constant is the degenerate weakly-monotone,
 *   continuous function in [0,1] the spec permits); ALL smoothing lives in
 *   the envelope stage. No adaptive release.
 * - Envelope rates honor the attack/release ATTRIBUTE definitions ("time to
 *   reduce/increase the gain by 10 dB"): attacking, the gain–target gap
 *   shrinks 10 dB per `attack` seconds (rate = 1 − 10^(−0.5/attackFrames));
 *   releasing, the gain rises 10 dB per `release` seconds
 *   (rate = 10^(0.5/releaseFrames)). attack = 0 / release = 0 are instant.
 *   (The spec's "computed from the ratio of compressor gain and detector
 *   average" constraint is satisfied degenerately — the rate is a constant,
 *   weakly-monotone function of that ratio; its self-contradictory
 *   strict-monotonicity notes cannot all hold simultaneously.)
 * - Stereo detection is LINKED: the detector input is the per-sample maximum
 *   |value| across channels, so one gain is applied to every channel.
 * - A change in input channel count rebuilds the delay lines from silence
 *   (same rule as the WaveShaper's filter state); envelope state, which is
 *   channel-independent, is preserved.
 *
 * Spec-internal conflict, resolved in favor of the attribute prose + browser
 * consensus: algorithm step 10 literally defines metering gain as the
 * REDUCTION GAIN — which includes the makeup stage — in dB, so with any
 * compressing curve (makeup > 1) silence would meter at 20·log10(makeup) > 0
 * (+5.28 dB at the defaults) and EVERY metered value would sit
 * 20·log10(makeup) above what browsers report. But the `reduction`
 * attribute's own normative sentence says "If fed no signal the value will
 * be 0 (no gain reduction)", and every shipping implementation
 * (Chrome, Firefox) meters the envelope gain only — 0 at rest, negative when
 * compressing. Pleco meters the compressor gain EXCLUDING makeup
 * (reduction = 20·log10([[compressor gain]])), the interoperable reading.
 *
 * Tail-time (spec node table: Yes — the look-ahead delay): the pull graph
 * re-ticks this node every quantum while it is connected downstream, so the
 * delay lines flush their remaining 6 ms naturally after the input goes
 * silent — no explicit tail registration needed.
 */
import { PlecoNode, CHANNEL_COUNT_MODES } from '../xa-node.js'
import { PlecoAudioParam } from '../xa-param.js'
import { RENDER_QUANTUM } from '../xa-constants.js'
import { createPlecoAudioBuffer } from '../xa-buffer.js'
import { notSupportedError } from '../xa-errors.js'

/** Spec § Processing: "const delay = new DelayNode(context, {delayTime: 0.006})". */
const LOOK_AHEAD_SECONDS = 0.006

/** Detector curve, pleco's implementation-defined choice: constant 1.0 (see header). */
const DETECTOR_RATE = 1

/** Spec "decibels to linear gain unit": 10^(v/20). */
function dbToLin(v) {
  return Math.pow(10, v / 20)
}

/** Spec "linear gain unit to decibel": v = 0 → -1000, else 20·log10(v). */
function linToDb(v) {
  return v === 0 ? -1000 : 20 * Math.log10(v)
}

export class PlecoDynamicsCompressorNode extends PlecoNode {
  #threshold
  #knee
  #ratio
  #attack
  #release
  #reduction = 0 // the [[internal reduction]] slot (IDL float, dB)
  #detectorAverage = 0 // the [[detector average]] slot
  #compressorGain = 1 // the [[compressor gain]] slot
  #delayFrames
  #delayLines = null // per-channel Float32Array(#delayFrames) look-ahead lines
  #delayIndex = 0
  #paramBlock = new Float32Array(RENDER_QUANTUM) // k-rate computedValue scratch

  /**
   * @param {object} context — the owning PlecoBaseContext.
   * @param {object} [options] — DynamicsCompressorOptions ({attack, knee,
   *   ratio, release, threshold}, each an IDL float: non-finite — and, pleco
   *   strictness, non-number — throws TypeError) merged with AudioNodeOptions.
   *   Spec node table: 1 input, 1 output, channelCount 2 (constrained ≤ 2),
   *   mode 'clamped-max' ('max' forbidden), interpretation 'speakers'.
   */
  constructor(context, options = {}) {
    // WebIDL dictionary conversion: null (like undefined) is the empty dictionary.
    const { attack, knee, ratio, release, threshold, ...nodeOptions } = options ?? {}
    // The constructor dictionary must respect the same channelCountMode
    // constraint as assignment (the base constructor stores the mode without
    // running the subclass hook). WebIDL dictionary enum conversion runs
    // FIRST: an out-of-enum string is a binding TypeError; only the VALID but
    // forbidden 'max' reaches the NotSupportedError check.
    const channelCountMode = nodeOptions.channelCountMode ?? 'clamped-max'
    if (!CHANNEL_COUNT_MODES.includes(channelCountMode)) {
      throw new TypeError(
        `PlecoDynamicsCompressorNode: channelCountMode must be 'max' | 'clamped-max' | 'explicit', got ${channelCountMode}`,
      )
    }
    if (channelCountMode === 'max') {
      throw notSupportedError("PlecoDynamicsCompressorNode: channelCountMode cannot be 'max'")
    }
    // channelCount flows through the base validated setter, which calls the
    // _validateChannelCount hook below — the > 2 NotSupportedError covers the
    // constructor dictionary path too.
    super(context, {
      ...nodeOptions,
      numberOfInputs: 1,
      numberOfOutputs: 1,
      channelCount: nodeOptions.channelCount ?? 2,
      channelCountMode,
    })

    // The five k-rate params (spec ranges/defaults) with the automation rate
    // constraint (fixed 'k-rate' — changing it throws InvalidStateError).
    this.#threshold = new PlecoAudioParam({
      defaultValue: -24,
      minValue: -100,
      maxValue: 0,
      automationRate: 'k-rate',
      fixedAutomationRate: true,
      context,
    })
    this.#knee = new PlecoAudioParam({
      defaultValue: 30,
      minValue: 0,
      maxValue: 40,
      automationRate: 'k-rate',
      fixedAutomationRate: true,
      context,
    })
    this.#ratio = new PlecoAudioParam({
      defaultValue: 12,
      minValue: 1,
      maxValue: 20,
      automationRate: 'k-rate',
      fixedAutomationRate: true,
      context,
    })
    this.#attack = new PlecoAudioParam({
      defaultValue: 0.003,
      minValue: 0,
      maxValue: 1,
      automationRate: 'k-rate',
      fixedAutomationRate: true,
      context,
    })
    this.#release = new PlecoAudioParam({
      defaultValue: 0.25,
      minValue: 0,
      maxValue: 1,
      automationRate: 'k-rate',
      fixedAutomationRate: true,
      context,
    })
    // Dictionary members set the params' VALUES (never their defaults); the
    // param value setter is the WebIDL float boundary (TypeError on
    // non-finite, Math.fround on store) and stores unclamped — the nominal
    // range applies at computedValue time, per § Computation of Value.
    if (threshold !== undefined) this.#threshold.value = threshold
    if (knee !== undefined) this.#knee.value = knee
    if (ratio !== undefined) this.#ratio.value = ratio
    if (attack !== undefined) this.#attack.value = attack
    if (release !== undefined) this.#release.value = release

    // sampleRate ≥ 3000 Hz (context nominal range) ⇒ ≥ 18 frames of look-ahead.
    this.#delayFrames = Math.round(LOOK_AHEAD_SECONDS * context.sampleRate)
  }

  get threshold() {
    return this.#threshold
  }

  get knee() {
    return this.#knee
  }

  get ratio() {
    return this.#ratio
  }

  get attack() {
    return this.#attack
  }

  get release() {
    return this.#release
  }

  /** Spec: reading `reduction` returns the [[internal reduction]] slot (dB, IDL float). */
  get reduction() {
    return this.#reduction
  }

  // Spec § channelCount constraints: "The channel count cannot be greater
  // than two, and a NotSupportedError exception MUST be thrown for any
  // attempt to change it to a value greater than two."
  _validateChannelCount(v) {
    if (v > 2) {
      throw notSupportedError(`PlecoDynamicsCompressorNode: channelCount cannot be greater than 2, got ${v}`)
    }
  }

  // Spec § channelCountMode constraints: "The channel count mode cannot be
  // set to 'max', and a NotSupportedError exception MUST be thrown for any
  // attempt to set it to 'max'."
  _validateChannelCountMode(v) {
    if (v === 'max') {
      throw notSupportedError("PlecoDynamicsCompressorNode: channelCountMode cannot be 'max'")
    }
  }

  /** k-rate computedValue for this quantum: automation + inputs, NaN→default, clamped, float32. */
  #sampleParam(param) {
    return param.fillBlock(this.#paramBlock)[0]
  }

  /** (Re)build the per-channel look-ahead lines when the channel count changes (from silence). */
  #ensureDelayLines(channels) {
    if (this.#delayLines === null || this.#delayLines.length !== channels) {
      this.#delayLines = Array.from({ length: channels }, () => new Float32Array(this.#delayFrames))
      this.#delayIndex = 0
    }
    return this.#delayLines
  }

  _process(input) {
    const channels = input.numberOfChannels
    const out = createPlecoAudioBuffer(channels, RENDER_QUANTUM, this.context.sampleRate)

    // Step 1: attack/release (and the curve params) sampled at the time of
    // processing — k-rate, once per render quantum.
    const threshold = this.#sampleParam(this.#threshold)
    const knee = this.#sampleParam(this.#knee)
    const ratio = this.#sampleParam(this.#ratio)
    const attackFrames = this.#sampleParam(this.#attack) * this.context.sampleRate
    const releaseFrames = this.#sampleParam(this.#release) * this.context.sampleRate

    // Compression curve constants (§ compression curve, dB domain — see
    // header). ratio's nominal floor is 1 so slope ∈ [1/20, 1].
    const slope = 1 / ratio
    const linearThreshold = dbToLin(threshold)
    const kneeEndDb = threshold + knee
    const kneeEndOutDb = threshold + knee + ((slope - 1) * knee) / 2
    const shape = (x) => {
      if (x <= linearThreshold) return x // part 1: identity
      const inDb = 20 * Math.log10(x)
      let outDb
      if (knee > 0 && inDb < kneeEndDb) {
        // part 2: quadratic soft knee (monotonic, continuous, meets both
        // neighbors with matching slope)
        outDb = inDb + ((slope - 1) * (inDb - threshold) * (inDb - threshold)) / (2 * knee)
      } else {
        // part 3: f(x) = x/ratio in dB
        outDb = kneeEndOutDb + (inDb - kneeEndDb) * slope
      }
      return Math.pow(10, outDb / 20)
    }

    // § computing the makeup gain: (1 / curve(1.0))^0.6 — input-independent,
    // fixed for the block's k-rate curve params.
    const makeup = Math.pow(1 / shape(1), 0.6)

    // Envelope rates (implementation-defined shape, see header): 10 dB per
    // attack/release seconds; zero means instant.
    const attackRate = attackFrames === 0 ? 1 : 1 - Math.pow(10, -0.5 / attackFrames)
    const releaseRate = releaseFrames === 0 ? null : Math.pow(10, 0.5 / releaseFrames)

    const lines = this.#ensureDelayLines(channels)
    const D = this.#delayFrames
    let w = this.#delayIndex
    let avg = this.#detectorAverage
    let g = this.#compressorGain
    let reductionGain = g * makeup

    const srcs = []
    const dsts = []
    for (let c = 0; c < channels; c++) {
      srcs.push(input.getChannelData(c))
      dsts.push(out.getChannelData(c))
    }

    for (let i = 0; i < RENDER_QUANTUM; i++) {
      // Detector input: per-sample max |value| across channels (linked stereo).
      let peak = 0
      for (let c = 0; c < channels; c++) {
        const v = Math.abs(srcs[c][i])
        if (v > peak) peak = v
      }
      // Step 4.1: attenuation.
      const attenuation = peak < 0.0001 ? 1 : shape(peak) / peak
      // Step 4.2: releasing.
      const releasing = attenuation > g
      // Steps 4.3-4.5: detector average (constant detector curve), clamp ≤ 1.
      avg += (attenuation - avg) * DETECTOR_RATE
      if (avg > 1) avg = 1
      // Steps 4.6-4.8: envelope.
      if (releasing) g = releaseRate === null ? 1 : Math.min(1, g * releaseRate)
      else g += (avg - g) * attackRate
      // Step 4.9: reduction gain.
      reductionGain = g * makeup
      // Delayed signal path × reduction gain (the internal delay→gain graph);
      // the Float32Array stores are the float32 block boundary.
      for (let c = 0; c < channels; c++) {
        const line = lines[c]
        const delayed = line[w]
        line[w] = srcs[c][i]
        dsts[c][i] = delayed * reductionGain
      }
      w += 1
      if (w === D) w = 0
    }

    this.#delayIndex = w
    this.#detectorAverage = avg
    this.#compressorGain = g
    // Metering: the block's last COMPRESSOR (envelope) gain in dB — makeup
    // EXCLUDED — lands in [[internal reduction]] once per block (IDL float).
    // 0 at rest, <= 0 when compressing; see the header's metering-conflict
    // note for why this follows the attribute prose over algorithm step 10.
    this.#reduction = Math.fround(linToDb(g))
    return out
  }
}
