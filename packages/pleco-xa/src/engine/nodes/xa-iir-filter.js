/**
 * engine/nodes/xa-iir-filter.js — PlecoIIRFilterNode.
 *
 * Spec-shaped IIRFilterNode (spec § The IIRFilterNode Interface): a general
 * fixed-coefficient IIR filter. Spec node table: 1 input, 1 output,
 * channelCount 2, mode 'max', interpretation 'speakers'; output channel count
 * always equals the input's. Once constructed, the coefficients cannot be
 * changed (there is no attribute surface — only getFrequencyResponse).
 *
 * IIRFilterOptions is MANDATORY, with required `feedforward` (b) and
 * `feedback` (a) sequences. The full validation ladder, in binding-then-
 * algorithm order (spec § createIIRFilter argument constraints + WebIDL):
 *   1. missing options dictionary / missing required member → TypeError
 *   2. sequence<double> conversion: any non-finite element → TypeError
 *      (rejecting non-number elements outright instead of coercing via
 *      WebIDL ToNumber is deliberate pleco strictness, not spec behavior)
 *   3. length 0 or > 20 (either array) → NotSupportedError
 *   4. all-zero feedforward → InvalidStateError;
 *      feedback[0] === 0 → InvalidStateError
 * Both arrays are then copied (double precision) and normalized by a₀, per
 * the spec's transfer function H(z) = Σ bₘ z⁻ᵐ / Σ aₙ z⁻ⁿ with a₀ divided
 * through — equivalently the time-domain equation
 *   y(n) = Σₖ (bₖ/a₀) x(n−k) − Σₖ₌₁ (aₖ/a₀) y(n−k).
 *
 * Processing is per-channel direct-form I with double-precision history (the
 * spec's initial filter state is all zeroes); float32 only at the output
 * store (the Float32Array write IS the fround boundary). A channel count
 * change rebuilds the state from zeroes (spec is silent; same policy as
 * PlecoBiquadFilterNode). Tail-time (spec table: Yes) drains naturally
 * through the pull graph's per-quantum re-tick, like the biquad.
 *
 * getFrequencyResponse(frequencyHz, magResponse, phaseResponse): H(e^{jω})
 * evaluated from the normalized coefficient arrays; the three arguments must
 * be Float32Arrays (TypeError) of the SAME length (InvalidAccessError); any
 * frequency outside [0, Nyquist] yields NaN in both output arrays at that
 * index. NaN never falls back silently — an unstable filter's NaN state is,
 * per the spec note, the developer's responsibility.
 */
import { PlecoNode } from '../xa-node.js'
import { RENDER_QUANTUM } from '../xa-constants.js'
import { createPlecoAudioBuffer } from '../xa-buffer.js'
import { invalidStateError, notSupportedError } from '../xa-errors.js'
import { assertFrequencyResponseArgs } from './xa-biquad-filter.js'

/** Spec: "The maximum length of this array is 20" — for both coefficient sequences. */
const MAX_COEFFICIENTS = 20

/**
 * WebIDL sequence<double> conversion, pleco-strict: array-like of finite
 * numbers → Float64Array copy; anything else → TypeError.
 */
function toCoefficientArray(name, seq) {
  if (seq == null || typeof seq.length !== 'number') {
    throw new TypeError(`PlecoIIRFilterNode: ${name} must be a sequence of finite numbers, got ${seq}`)
  }
  const out = new Float64Array(seq.length)
  for (let i = 0; i < seq.length; i++) {
    const v = seq[i]
    if (typeof v !== 'number' || !Number.isFinite(v)) {
      throw new TypeError(`PlecoIIRFilterNode: ${name}[${i}] must be a finite number, got ${v}`)
    }
    out[i] = v
  }
  return out
}

/** Spec length constraint: 0 or > 20 coefficients → NotSupportedError. */
function assertCoefficientLength(name, arr) {
  if (arr.length === 0 || arr.length > MAX_COEFFICIENTS) {
    throw notSupportedError(
      `PlecoIIRFilterNode: ${name} must have between 1 and ${MAX_COEFFICIENTS} coefficients, got ${arr.length}`,
    )
  }
}

/**
 * Run the full IIRFilterOptions validation ladder and return normalized
 * (÷ a₀) double-precision copies. Stands before super() so the ladder runs
 * to completion regardless of base-class option handling.
 */
function validateAndNormalize(options) {
  if (options == null || typeof options !== 'object') {
    throw new TypeError('PlecoIIRFilterNode: an IIRFilterOptions dictionary with feedforward and feedback is required')
  }
  if (options.feedforward === undefined) {
    throw new TypeError('PlecoIIRFilterNode: IIRFilterOptions.feedforward is required')
  }
  if (options.feedback === undefined) {
    throw new TypeError('PlecoIIRFilterNode: IIRFilterOptions.feedback is required')
  }
  // Binding layer first: BOTH sequences convert (TypeError) before any
  // algorithm-level constraint (NotSupportedError / InvalidStateError) runs.
  const feedforward = toCoefficientArray('feedforward', options.feedforward)
  const feedback = toCoefficientArray('feedback', options.feedback)
  assertCoefficientLength('feedforward', feedforward)
  assertCoefficientLength('feedback', feedback)
  if (feedforward.every((v) => v === 0)) {
    throw invalidStateError('PlecoIIRFilterNode: feedforward coefficients must not all be zero')
  }
  if (feedback[0] === 0) {
    throw invalidStateError('PlecoIIRFilterNode: feedback[0] must not be zero')
  }
  // a₀ normalization: divide every coefficient through by feedback[0].
  const a0 = feedback[0]
  if (a0 !== 1) {
    for (let i = 0; i < feedforward.length; i++) feedforward[i] /= a0
    for (let i = 0; i < feedback.length; i++) feedback[i] /= a0
  }
  return { feedforward, feedback }
}

export class PlecoIIRFilterNode extends PlecoNode {
  #feedforward // normalized b, Float64Array
  #feedback // normalized a (a[0] === 1), Float64Array
  #xHist = null // per-channel input history, [0] = most recent past sample
  #yHist = null // per-channel output history, [0] = most recent past sample
  #stateChannels = 0

  /**
   * @param {object} context — the owning PlecoBaseContext.
   * @param {object} options — MANDATORY IIRFilterOptions: {feedforward,
   *   feedback} (both required) merged with AudioNodeOptions.
   */
  constructor(context, options) {
    const { feedforward, feedback } = validateAndNormalize(options)
    const nodeOptions = { ...options }
    delete nodeOptions.feedforward
    delete nodeOptions.feedback
    super(context, { ...nodeOptions, numberOfInputs: 1, numberOfOutputs: 1 })
    this.#feedforward = feedforward
    this.#feedback = feedback
  }

  /**
   * Spec § getFrequencyResponse(): H(e^{jω}) = Σ bₘ e^{−jωm} / Σ aₙ e^{−jωn}
   * from the (normalized — the a₀ division cancels in the ratio) coefficient
   * arrays; frequencies outside [0, Nyquist] → NaN at that index.
   */
  getFrequencyResponse(frequencyHz, magResponse, phaseResponse) {
    assertFrequencyResponseArgs('PlecoIIRFilterNode', frequencyHz, magResponse, phaseResponse)
    const Fs = this.context.sampleRate
    const nyquist = Fs / 2
    const b = this.#feedforward
    const a = this.#feedback
    for (let i = 0; i < frequencyHz.length; i++) {
      const f = frequencyHz[i]
      if (!(f >= 0 && f <= nyquist)) {
        // outside [0, Nyquist] (or NaN) → NaN, per spec
        magResponse[i] = NaN
        phaseResponse[i] = NaN
        continue
      }
      const w = (2 * Math.PI * f) / Fs
      let numRe = 0
      let numIm = 0
      let denRe = 0
      let denIm = 0
      for (let k = 0; k < b.length; k++) {
        numRe += b[k] * Math.cos(k * w)
        numIm -= b[k] * Math.sin(k * w)
      }
      for (let k = 0; k < a.length; k++) {
        denRe += a[k] * Math.cos(k * w)
        denIm -= a[k] * Math.sin(k * w)
      }
      const denMagSq = denRe * denRe + denIm * denIm
      const re = (numRe * denRe + numIm * denIm) / denMagSq
      const im = (numIm * denRe - numRe * denIm) / denMagSq
      magResponse[i] = Math.sqrt(re * re + im * im)
      phaseResponse[i] = Math.atan2(im, re)
    }
  }

  _process(input) {
    const channels = input.numberOfChannels
    const out = createPlecoAudioBuffer(channels, RENDER_QUANTUM, this.context.sampleRate)
    const b = this.#feedforward
    const a = this.#feedback
    const M = b.length - 1 // input history depth
    const N = a.length - 1 // output history depth

    if (this.#xHist === null || this.#stateChannels !== channels) {
      // The initial filter state is the all-zeroes state (spec); rebuilt from
      // zeroes on a layout change.
      this.#xHist = Array.from({ length: channels }, () => new Float64Array(M))
      this.#yHist = Array.from({ length: channels }, () => new Float64Array(N))
      this.#stateChannels = channels
    }

    for (let c = 0; c < channels; c++) {
      const src = input.getChannelData(c)
      const dst = out.getChannelData(c)
      const xh = this.#xHist[c]
      const yh = this.#yHist[c]
      for (let i = 0; i < RENDER_QUANTUM; i++) {
        const x = src[i]
        // y(n) = Σₖ bₖ x(n−k) − Σₖ₌₁ aₖ y(n−k)  (coefficients pre-normalized by a₀)
        let y = b[0] * x
        for (let k = 1; k <= M; k++) y += b[k] * xh[k - 1]
        for (let k = 1; k <= N; k++) y -= a[k] * yh[k - 1]
        if (M > 0) {
          xh.copyWithin(1, 0)
          xh[0] = x
        }
        if (N > 0) {
          yh.copyWithin(1, 0)
          yh[0] = y
        }
        dst[i] = y // Float32Array store — the float32 boundary
      }
    }
    return out
  }
}
