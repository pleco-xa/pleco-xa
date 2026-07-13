/**
 * engine/nodes/xa-biquad-filter.js — PlecoBiquadFilterNode.
 *
 * Spec-shaped BiquadFilterNode (spec § The BiquadFilterNode Interface): a
 * second-order IIR filter with a BiquadFilterType `type` attribute and four
 * a-rate AudioParams (frequency, detune, Q, gain). Spec node table: 1 input,
 * 1 output, channelCount 2, mode 'max', interpretation 'speakers'; the output
 * channel count always equals the input's.
 *
 * Coefficient formulas are the spec's own (§ Filters Characteristics — the
 * normative Audio EQ Cookbook derivations), computed NATIVELY in double
 * precision (no digital-filter package). Spec Q semantics are honored exactly:
 *   - lowpass / highpass interpret Q in dB — α = sin(ω₀) / (2·10^(Q/20))
 *   - bandpass / peaking / notch / allpass use linear Q — α = sin(ω₀) / (2Q)
 *   - lowshelf / highshelf ignore Q and use the fixed shelf slope S = 1 —
 *     α_S = (sin ω₀ / 2)·√((A + 1/A)(1/S − 1) + 2), with A = 10^(G/40)
 * Every coefficient set is normalized by a₀ at computation time, giving the
 * spec transfer function H(z) = (b₀/a₀ + (b₁/a₀)z⁻¹ + (b₂/a₀)z⁻²) /
 * (1 + (a₁/a₀)z⁻¹ + (a₂/a₀)z⁻²).
 *
 * frequency and detune form the spec's compound parameter:
 *   computedFrequency(t) = frequency(t) · 2^(detune(t)/1200)
 * clamped to the compound parameter's nominal range [0, Nyquist]. The spec's
 * per-type formulas are applied verbatim with NO extra edge-case shaping
 * (e.g. a lowpass at f₀ = 0 yields all-zero b's → silence; an unstable
 * automation is, per the spec note, the developer's responsibility).
 *
 * Processing is per-channel direct-form I — state [x₁, x₂, y₁, y₂] per
 * channel, doubles throughout, float32 only at the output store (the
 * Float32Array write IS the fround boundary). All four params are a-rate:
 * when any param block varies within the quantum the coefficients are
 * recomputed per sample; when all four blocks are constant a fast path
 * computes them once for the block (bit-identical result, since the
 * per-sample path would compute the same coefficients every frame). A channel
 * count change rebuilds the state from zeroes (the spec's initial filter
 * state; the spec is silent on mid-stream layout changes — same policy as
 * the reference implementation).
 *
 * Tail-time (spec node table: Yes — an IIR rings after the input goes
 * silent): pleco's pull graph re-ticks this node every quantum while it is
 * connected downstream, so the recursive state drains naturally — no explicit
 * tail registration needed (same reasoning as PlecoWaveShaperNode).
 *
 * getFrequencyResponse(frequencyHz, magResponse, phaseResponse) evaluates
 * H(e^{jω}) at each requested frequency from the params' [[current value]]s
 * (as sampled for the current processing block), clamped to their nominal
 * ranges exactly as processing clamps computedValue. The three arguments must
 * be Float32Arrays (TypeError — WebIDL binding) of the SAME length
 * (InvalidAccessError, per the normative sentence); any frequency outside
 * [0, Nyquist] yields NaN in both output arrays at that index.
 *
 * WebIDL house rules: invalid BiquadFilterType ATTRIBUTE assignment is
 * silently ignored; an invalid type in the CONSTRUCTOR dictionary throws
 * TypeError; non-finite dictionary param values are WebIDL float conversion
 * TypeErrors (via the PlecoAudioParam.value setter). Rejecting non-number
 * values outright instead of coercing via WebIDL ToNumber is deliberate pleco
 * strictness, not spec behavior.
 */
import { PlecoNode } from '../xa-node.js'
import { PlecoAudioParam } from '../xa-param.js'
import { RENDER_QUANTUM } from '../xa-constants.js'
import { createPlecoAudioBuffer } from '../xa-buffer.js'
import { invalidAccessError } from '../xa-errors.js'

const BIQUAD_FILTER_TYPES = [
  'lowpass',
  'highpass',
  'bandpass',
  'lowshelf',
  'highshelf',
  'peaking',
  'notch',
  'allpass',
]

const F32_MAX = 3.4028234663852886e38
/** detune nominal bound — the spec's ≈ ±153600 is 1200·log₂(FLT_MAX) (float32-rounds to exactly ±153600). */
const DETUNE_LIMIT = Math.fround(1200 * Math.log2(F32_MAX))
/** gain nominal max — the spec's ≈ 1541 is 40·log₁₀(FLT_MAX). */
const GAIN_MAX = Math.fround(40 * Math.log10(F32_MAX))

/**
 * The spec's six-coefficient formulas (§ Filters Characteristics), normalized
 * by a₀ before returning. `f0` is the already-clamped computedFrequency; all
 * math in double precision.
 * @returns {{b0: number, b1: number, b2: number, a1: number, a2: number}}
 */
function biquadCoefficients(type, f0, Fs, Q, G) {
  const A = Math.pow(10, G / 40)
  const w0 = (2 * Math.PI * f0) / Fs
  const cosw0 = Math.cos(w0)
  const sinw0 = Math.sin(w0)
  let b0, b1, b2, a0, a1, a2
  switch (type) {
    case 'lowpass': {
      const alpha = sinw0 / (2 * Math.pow(10, Q / 20)) // dB Q
      b0 = (1 - cosw0) / 2
      b1 = 1 - cosw0
      b2 = (1 - cosw0) / 2
      a0 = 1 + alpha
      a1 = -2 * cosw0
      a2 = 1 - alpha
      break
    }
    case 'highpass': {
      const alpha = sinw0 / (2 * Math.pow(10, Q / 20)) // dB Q
      b0 = (1 + cosw0) / 2
      b1 = -(1 + cosw0)
      b2 = (1 + cosw0) / 2
      a0 = 1 + alpha
      a1 = -2 * cosw0
      a2 = 1 - alpha
      break
    }
    case 'bandpass': {
      const alpha = sinw0 / (2 * Q)
      b0 = alpha
      b1 = 0
      b2 = -alpha
      a0 = 1 + alpha
      a1 = -2 * cosw0
      a2 = 1 - alpha
      break
    }
    case 'notch': {
      const alpha = sinw0 / (2 * Q)
      b0 = 1
      b1 = -2 * cosw0
      b2 = 1
      a0 = 1 + alpha
      a1 = -2 * cosw0
      a2 = 1 - alpha
      break
    }
    case 'allpass': {
      const alpha = sinw0 / (2 * Q)
      b0 = 1 - alpha
      b1 = -2 * cosw0
      b2 = 1 + alpha
      a0 = 1 + alpha
      a1 = -2 * cosw0
      a2 = 1 - alpha
      break
    }
    case 'peaking': {
      const alpha = sinw0 / (2 * Q)
      b0 = 1 + alpha * A
      b1 = -2 * cosw0
      b2 = 1 - alpha * A
      a0 = 1 + alpha / A
      a1 = -2 * cosw0
      a2 = 1 - alpha / A
      break
    }
    case 'lowshelf': {
      // S = 1 (fixed shelf slope, per spec)
      const alphaS = (sinw0 / 2) * Math.sqrt((A + 1 / A) * (1 / 1 - 1) + 2)
      const twoAlphaRootA = 2 * alphaS * Math.sqrt(A)
      b0 = A * (A + 1 - (A - 1) * cosw0 + twoAlphaRootA)
      b1 = 2 * A * (A - 1 - (A + 1) * cosw0)
      b2 = A * (A + 1 - (A - 1) * cosw0 - twoAlphaRootA)
      a0 = A + 1 + (A - 1) * cosw0 + twoAlphaRootA
      a1 = -2 * (A - 1 + (A + 1) * cosw0)
      a2 = A + 1 + (A - 1) * cosw0 - twoAlphaRootA
      break
    }
    case 'highshelf': {
      const alphaS = (sinw0 / 2) * Math.sqrt((A + 1 / A) * (1 / 1 - 1) + 2)
      const twoAlphaRootA = 2 * alphaS * Math.sqrt(A)
      b0 = A * (A + 1 + (A - 1) * cosw0 + twoAlphaRootA)
      b1 = -2 * A * (A - 1 + (A + 1) * cosw0)
      b2 = A * (A + 1 + (A - 1) * cosw0 - twoAlphaRootA)
      a0 = A + 1 - (A - 1) * cosw0 + twoAlphaRootA
      a1 = 2 * (A - 1 - (A + 1) * cosw0)
      a2 = A + 1 - (A - 1) * cosw0 - twoAlphaRootA
      break
    }
    default:
      throw new TypeError(`biquadCoefficients: unknown BiquadFilterType '${type}'`)
  }
  return { b0: b0 / a0, b1: b1 / a0, b2: b2 / a0, a1: a1 / a0, a2: a2 / a0 }
}

/**
 * |H(e^{jω})| and ∠H(e^{jω}) for normalized biquad coefficients at ω = 2πf/Fs.
 * Shared by BiquadFilterNode.getFrequencyResponse; the same rational-response
 * math generalizes to arbitrary-order coefficient arrays in xa-iir-filter.js.
 */
function biquadResponseAt(coeffs, f, Fs) {
  const { b0, b1, b2, a1, a2 } = coeffs
  const w = (2 * Math.PI * f) / Fs
  const cw = Math.cos(w)
  const sw = Math.sin(w)
  const c2w = Math.cos(2 * w)
  const s2w = Math.sin(2 * w)
  const numRe = b0 + b1 * cw + b2 * c2w
  const numIm = -(b1 * sw + b2 * s2w)
  const denRe = 1 + a1 * cw + a2 * c2w
  const denIm = -(a1 * sw + a2 * s2w)
  const denMagSq = denRe * denRe + denIm * denIm
  const re = (numRe * denRe + numIm * denIm) / denMagSq
  const im = (numIm * denRe - numRe * denIm) / denMagSq
  return { mag: Math.sqrt(re * re + im * im), phase: Math.atan2(im, re) }
}

/**
 * Shared getFrequencyResponse argument validation (used verbatim by
 * PlecoIIRFilterNode): the WebIDL binding TypeErrors for non-Float32Array
 * arguments, then the normative "MUST be Float32Arrays of the same length, or
 * an InvalidAccessError MUST be thrown".
 */
export function assertFrequencyResponseArgs(who, frequencyHz, magResponse, phaseResponse) {
  if (!(frequencyHz instanceof Float32Array)) {
    throw new TypeError(`${who}.getFrequencyResponse: frequencyHz must be a Float32Array`)
  }
  if (!(magResponse instanceof Float32Array)) {
    throw new TypeError(`${who}.getFrequencyResponse: magResponse must be a Float32Array`)
  }
  if (!(phaseResponse instanceof Float32Array)) {
    throw new TypeError(`${who}.getFrequencyResponse: phaseResponse must be a Float32Array`)
  }
  if (magResponse.length !== frequencyHz.length || phaseResponse.length !== frequencyHz.length) {
    throw invalidAccessError(
      `${who}.getFrequencyResponse: the three arrays must have the same length ` +
        `(got ${frequencyHz.length}, ${magResponse.length}, ${phaseResponse.length})`,
    )
  }
}

/** Is every sample of this block the same value? (Constant-param fast-path test.) */
function blockIsConstant(block) {
  const v = block[0]
  for (let i = 1; i < block.length; i++) if (block[i] !== v) return false
  return true
}

export class PlecoBiquadFilterNode extends PlecoNode {
  #type = 'lowpass'
  #state = null // per-channel direct-form I state, flat [x1, x2, y1, y2] per channel
  #stateChannels = 0

  /**
   * @param {object} context — the owning PlecoBaseContext.
   * @param {object} [options] — BiquadFilterOptions: {type, Q, detune,
   *   frequency, gain} merged with AudioNodeOptions. Dictionary members set
   *   the params' initial VALUES; each param's defaultValue stays the spec
   *   default (350 / 0 / 1 / 0) regardless of options.
   */
  constructor(context, options = {}) {
    // WebIDL dictionary conversion: null (like undefined) is the empty dictionary.
    const { type = 'lowpass', frequency, detune, Q, gain, ...nodeOptions } = options ?? {}
    super(context, { ...nodeOptions, numberOfInputs: 1, numberOfOutputs: 1 })
    // Constructor dictionary path: an invalid BiquadFilterType is a WebIDL
    // binding TypeError (unlike attribute assignment, which silently ignores).
    if (!BIQUAD_FILTER_TYPES.includes(type)) {
      throw new TypeError(
        `PlecoBiquadFilterNode: type must be one of ${BIQUAD_FILTER_TYPES.join(' | ')}, got ${type}`,
      )
    }
    this.#type = type
    const nyquist = context.sampleRate / 2
    // Spec param table: frequency [0, Nyquist] default 350; detune ±1200·log₂(FLT_MAX)
    // default 0; Q full float range default 1 (the dB/linear interpretation is
    // per-type, applied in the coefficient formulas — the attribute itself is
    // one param); gain [most-negative-float, 40·log₁₀(FLT_MAX)] default 0.
    // All a-rate (spec: "All attributes of the BiquadFilterNode are a-rate").
    this.frequency = new PlecoAudioParam({ defaultValue: 350, minValue: 0, maxValue: nyquist, context })
    this.detune = new PlecoAudioParam({ defaultValue: 0, minValue: -DETUNE_LIMIT, maxValue: DETUNE_LIMIT, context })
    this.Q = new PlecoAudioParam({ defaultValue: 1, context })
    this.gain = new PlecoAudioParam({ defaultValue: 0, maxValue: GAIN_MAX, context })
    // Dictionary members set initial param VALUES via the value setter (which
    // is where the spec's "set the attribute" lands): non-finite → the
    // setter's WebIDL float TypeError. Omitted members leave the param at its
    // (identical) defaultValue without minting an automation event.
    if (frequency !== undefined) this.frequency.value = frequency
    if (detune !== undefined) this.detune.value = detune
    if (Q !== undefined) this.Q.value = Q
    if (gain !== undefined) this.gain.value = gain

    this._freqBlock = new Float32Array(RENDER_QUANTUM)
    this._detuneBlock = new Float32Array(RENDER_QUANTUM)
    this._qBlock = new Float32Array(RENDER_QUANTUM)
    this._gainBlock = new Float32Array(RENDER_QUANTUM)
  }

  get type() {
    return this.#type
  }

  set type(v) {
    if (!BIQUAD_FILTER_TYPES.includes(v)) return // WebIDL enum attribute: invalid assignment is silently ignored
    this.#type = v
  }

  /**
   * Spec § getFrequencyResponse(): H(e^{jω}) from the params' [[current
   * value]]s (sampled for the current processing block), each clamped to its
   * nominal range as computedValue would be; frequencies outside [0, Nyquist]
   * → NaN at that index in both output arrays.
   */
  getFrequencyResponse(frequencyHz, magResponse, phaseResponse) {
    assertFrequencyResponseArgs('PlecoBiquadFilterNode', frequencyHz, magResponse, phaseResponse)
    const Fs = this.context.sampleRate
    const nyquist = Fs / 2
    const clamp = (p) => Math.min(p.maxValue, Math.max(p.minValue, p.value))
    const f0 = Math.min(
      nyquist,
      Math.max(0, clamp(this.frequency) * Math.pow(2, clamp(this.detune) / 1200)),
    )
    const coeffs = biquadCoefficients(this.#type, f0, Fs, clamp(this.Q), clamp(this.gain))
    for (let i = 0; i < frequencyHz.length; i++) {
      const f = frequencyHz[i]
      if (!(f >= 0 && f <= nyquist)) {
        // outside [0, Nyquist] (or NaN) → NaN, per spec
        magResponse[i] = NaN
        phaseResponse[i] = NaN
        continue
      }
      const { mag, phase } = biquadResponseAt(coeffs, f, Fs)
      magResponse[i] = mag
      phaseResponse[i] = phase
    }
  }

  _process(input) {
    const channels = input.numberOfChannels
    const Fs = this.context.sampleRate
    const nyquist = Fs / 2
    const now = this.context.currentTime
    const out = createPlecoAudioBuffer(channels, RENDER_QUANTUM, Fs)

    if (this.#state === null || this.#stateChannels !== channels) {
      // Initial filter state is 0 (spec); rebuilt from zeroes on a layout change.
      this.#state = new Float64Array(channels * 4)
      this.#stateChannels = channels
    }
    const state = this.#state

    const freq = this.frequency.fillBlock(this._freqBlock, now)
    const detune = this.detune.fillBlock(this._detuneBlock, now)
    const q = this.Q.fillBlock(this._qBlock, now)
    const gain = this.gain.fillBlock(this._gainBlock, now)

    const constant =
      blockIsConstant(freq) && blockIsConstant(detune) && blockIsConstant(q) && blockIsConstant(gain)

    if (constant) {
      // Fast path: all four computedValue blocks are constant across the
      // quantum — one coefficient set serves every frame (bit-identical to
      // the per-sample path, which would recompute the same values).
      const f0 = Math.min(nyquist, Math.max(0, freq[0] * Math.pow(2, detune[0] / 1200)))
      const { b0, b1, b2, a1, a2 } = biquadCoefficients(this.#type, f0, Fs, q[0], gain[0])
      for (let c = 0; c < channels; c++) {
        const src = input.getChannelData(c)
        const dst = out.getChannelData(c)
        const si = c * 4
        let x1 = state[si]
        let x2 = state[si + 1]
        let y1 = state[si + 2]
        let y2 = state[si + 3]
        for (let i = 0; i < RENDER_QUANTUM; i++) {
          const x = src[i]
          const y = b0 * x + b1 * x1 + b2 * x2 - a1 * y1 - a2 * y2
          x2 = x1
          x1 = x
          y2 = y1
          y1 = y
          dst[i] = y // Float32Array store — the float32 boundary
        }
        state[si] = x1
        state[si + 1] = x2
        state[si + 2] = y1
        state[si + 3] = y2
      }
      return out
    }

    // a-rate path: recompute the coefficient set per sample-frame (once per
    // frame, shared by every channel — the params are node-wide).
    const type = this.#type
    for (let i = 0; i < RENDER_QUANTUM; i++) {
      const f0 = Math.min(nyquist, Math.max(0, freq[i] * Math.pow(2, detune[i] / 1200)))
      const { b0, b1, b2, a1, a2 } = biquadCoefficients(type, f0, Fs, q[i], gain[i])
      for (let c = 0; c < channels; c++) {
        const si = c * 4
        const x = input.getChannelData(c)[i]
        const y = b0 * x + b1 * state[si] + b2 * state[si + 1] - a1 * state[si + 2] - a2 * state[si + 3]
        state[si + 1] = state[si]
        state[si] = x
        state[si + 3] = state[si + 2]
        state[si + 2] = y
        out.getChannelData(c)[i] = y // Float32Array store — the float32 boundary
      }
    }
    return out
  }
}
