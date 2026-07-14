/**
 * engine/nodes/xa-wave-shaper.js — PlecoWaveShaperNode.
 *
 * Spec-shaped WaveShaperNode (spec § The WaveShaperNode Interface): non-linear
 * waveshaping distortion via a nullable Float32Array `curve` and an
 * OverSampleType `oversample` attribute ('none' | '2x' | '4x').
 *
 * curve semantics (all normative, § WaveShaperNode attributes):
 *   - Initially null; a null curve passes the input to the output UNMODIFIED
 *     (true pass-through — the node is not "shaping with an identity", it
 *     simply copies; this also means a null curve is never resampled even
 *     when oversample is '2x'/'4x', since there is nothing to anti-alias).
 *   - Setting a Float32Array with length < 2 throws InvalidStateError.
 *   - The [[curve set]] internal slot makes non-null assignment ONE-SHOT: once
 *     a curve has been set (via the setter OR the constructor options), any
 *     further non-null assignment throws InvalidStateError. Assigning null is
 *     always allowed (back to pass-through) but does NOT clear the slot.
 *   - On set, an internal copy is made — later mutation of the array used to
 *     set the attribute has no effect on processing.
 *   - Curve lookup uses the spec's exact index math:
 *         v = (N-1)/2 · (x+1),  k = ⌊v⌋,  f = v − k
 *         y = c₀ if v < 0;  c_{N−1} if v ≥ N−1;  (1−f)·c_k + f·c_{k+1} otherwise
 *     A curve whose value at x = 0 is non-zero emits DC even with no input
 *     connected (spec note) — this falls out naturally: an unconnected input
 *     pulls one channel of silence, and silence shapes to curve(0).
 *
 * oversample semantics (§ oversample): '2x'/'4x' up-sample the block to 2×/4×
 * the context rate, apply the curve at the high rate, and down-sample back.
 * The spec DELIBERATELY leaves the resampling filters implementation-defined
 * ("The exact up-sampling and down-sampling filters are not specified").
 * Pleco's implementation-defined choice, stated honestly: each 2× stage is a
 * 63-tap Blackman-windowed-sinc HALF-BAND FIR (design derivation below),
 * zero-stuff + interpolation-filter up, anti-alias-filter + decimate down;
 * '4x' chains two 2× stages each way. Filter delay lines persist across
 * render quanta (streaming, causal), so the resampling is block-boundary
 * clean. Changing `oversample` or the input channel count rebuilds the filter
 * state from silence — the spec is silent here, and a mode switch is a
 * processing discontinuity anyway.
 *
 * Tail-time (spec node table: "Maybe" — only when oversampling, duration
 * implementation-defined; § Latencies also names the oversampling WaveShaper
 * as a delay source): the causal FIR stages introduce (L−1)/2 samples of
 * group delay per stage at that stage's rate — ≈ 31 context-rate frames total
 * for '2x' (15.5 + 15.5) and ≈ 46.5 for '4x' (15.5 + 7.75 + 7.75 + 15.5).
 * The reference implementation (audiojs) does nothing special for tail-time
 * (per-block zero-state filtering, no carry); pleco instead lets the tail
 * drain NATURALLY: the pull graph re-ticks this node every quantum while it
 * is connected downstream, so once the input goes silent the persistent
 * delay lines flush their remaining ≈ tail-length of signal into the next
 * blocks — no explicit tail registration needed.
 */
import { PlecoNode, coerceNodeOptions} from '../xa-node.js'
import { RENDER_QUANTUM } from '../xa-constants.js'
import { createPlecoAudioBuffer } from '../xa-buffer.js'
import { invalidStateError } from '../xa-errors.js'

const OVER_SAMPLE_TYPES = ['none', '2x', '4x']

/**
 * Half-band FIR design (windowed sinc), computed once at module load in
 * double precision and stored at the float32 boundary.
 *
 * Derivation: the ideal 2× half-band low-pass (cutoff fs/4 at the HIGH rate)
 * has impulse response h[n] = ½·sinc((n − M)/2) with sinc(t) = sin(πt)/(πt)
 * and M = (L−1)/2 — every tap at an even offset from center is a sinc zero
 * except the center tap (½), which is what makes it half-band. A Blackman
 * window (w[n] = 0.42 − 0.5·cos(2πn/(L−1)) + 0.08·cos(4πn/(L−1))) tapers the
 * truncation for ≈ 74 dB stopband rejection; L = 63 puts the transition band
 * (width ≈ 5.5/L normalized) at ≈ [0.206, 0.294]·fs, i.e. the stopband is
 * fully formed just past fs/4 — distortion products above the half-band edge
 * are attenuated by ~70 dB before decimation. Taps are normalized to unity DC
 * gain; the UP taps carry an extra ×2 to restore amplitude after zero-stuffing
 * (interleaving zeros halves the DC gain of the stuffed signal).
 */
const HB_LENGTH = 63

function designHalfBand(gain) {
  const M = (HB_LENGTH - 1) / 2
  const h = new Float64Array(HB_LENGTH)
  let sum = 0
  for (let n = 0; n < HB_LENGTH; n++) {
    const t = (n - M) / 2
    const sinc = t === 0 ? 1 : Math.sin(Math.PI * t) / (Math.PI * t)
    const w =
      0.42 -
      0.5 * Math.cos((2 * Math.PI * n) / (HB_LENGTH - 1)) +
      0.08 * Math.cos((4 * Math.PI * n) / (HB_LENGTH - 1))
    h[n] = 0.5 * sinc * w
    sum += h[n]
  }
  const taps = new Float32Array(HB_LENGTH)
  for (let n = 0; n < HB_LENGTH; n++) taps[n] = Math.fround((gain * h[n]) / sum)
  return taps
}

/** Anti-alias / anti-image taps: DC gain 1 for the down path, 2 for the up path. */
const DOWN_TAPS = designHalfBand(1)
const UP_TAPS = designHalfBand(2)

/**
 * One streaming causal FIR: convolves each block against `taps`, carrying the
 * last (L−1) input samples across calls so consecutive render quanta filter as
 * one continuous stream (this is what gives the node its natural tail).
 */
class PlecoFirStage {
  constructor(taps) {
    this._taps = taps
    this._hist = new Float32Array(taps.length - 1)
  }

  /** @param {Float32Array} x — input block. @returns {Float32Array} filtered block, same length. */
  process(x) {
    const taps = this._taps
    const L = taps.length
    const hist = this._hist
    const H = hist.length
    const out = new Float32Array(x.length)
    for (let i = 0; i < x.length; i++) {
      let acc = 0
      for (let j = 0; j < L; j++) {
        const k = i - j
        acc += taps[j] * (k >= 0 ? x[k] : hist[H + k])
      }
      out[i] = acc
    }
    if (x.length >= H) {
      hist.set(x.subarray(x.length - H))
    } else {
      hist.copyWithin(0, x.length)
      hist.set(x, H - x.length)
    }
    return out
  }
}

/**
 * Spec § WaveShaperNode curve application algorithm — the EXACT index math:
 * v = (N−1)/2 · (x+1); clamp to c₀ below the range and c_{N−1} at/above it;
 * linear interpolation between adjacent curve points otherwise. Computed in
 * double precision; the caller's Float32Array store is the float32 boundary.
 */
function applyCurve(curve, x) {
  const N = curve.length
  const v = ((N - 1) / 2) * (x + 1)
  if (v < 0) return curve[0]
  if (v >= N - 1) return curve[N - 1]
  const k = Math.floor(v)
  const f = v - k
  return (1 - f) * curve[k] + f * curve[k + 1]
}

export class PlecoWaveShaperNode extends PlecoNode {
  #curve = null
  #curveSet = false // the spec's [[curve set]] internal slot
  #oversample = 'none'
  #states = null // per-channel {up: PlecoFirStage[], down: PlecoFirStage[]}
  #statesFactor = 0

  /**
   * @param {object} context — the owning PlecoBaseContext.
   * @param {object} [options] — WaveShaperOptions: {curve, oversample} merged
   *   with AudioNodeOptions. Spec node table: 1 input, 1 output, channelCount 2,
   *   mode 'max', interpretation 'speakers' (the PlecoNode defaults).
   */
  constructor(context, options = {}) {
    // WebIDL: a non-object 2nd argument (e.g. new XNode(ctx, 42)) is a TypeError.
    options = coerceNodeOptions(options)
    const { curve, oversample = 'none', ...nodeOptions } = options
    super(context, { ...nodeOptions, numberOfInputs: 1, numberOfOutputs: 1 })
    // Constructor dictionary path: an invalid OverSampleType is a WebIDL
    // binding TypeError (unlike attribute assignment, which silently ignores).
    if (!OVER_SAMPLE_TYPES.includes(oversample)) {
      throw new TypeError(`PlecoWaveShaperNode: oversample must be 'none' | '2x' | '4x', got ${oversample}`)
    }
    this.#oversample = oversample
    if (curve !== undefined) {
      // WaveShaperOptions.curve is a WebIDL sequence<float> — any array-like
      // is converted (each element rounded at the float32 boundary by the
      // Float32Array store); a non-array-like is a binding TypeError.
      if (curve === null || typeof curve !== 'object' || typeof curve.length !== 'number') {
        throw new TypeError('PlecoWaveShaperNode: options.curve must be a sequence of numbers')
      }
      this.curve = new Float32Array(curve) // setter: length check + [[curve set]] + internal copy
    }
  }

  get curve() {
    return this.#curve
  }

  /**
   * Spec "To set the curve attribute" algorithm + the length<2 InvalidStateError.
   * Non-null assignment is one-shot via [[curve set]]; null is always allowed
   * (pass-through) and leaves the slot set. An internal copy is stored.
   */
  set curve(v) {
    if (v === null) {
      this.#curve = null
      return
    }
    // WebIDL `Float32Array?` attribute: a non-Float32Array (e.g. a plain
    // Array) fails the binding with a TypeError before the algorithm runs.
    if (!(v instanceof Float32Array)) {
      throw new TypeError('PlecoWaveShaperNode: curve must be a Float32Array or null')
    }
    if (v.length < 2) {
      throw invalidStateError(`PlecoWaveShaperNode: curve must have at least 2 elements, got ${v.length}`)
    }
    if (this.#curveSet) {
      throw invalidStateError('PlecoWaveShaperNode: curve has already been set on this node ([[curve set]])')
    }
    this.#curveSet = true
    this.#curve = new Float32Array(v) // internal copy — later mutation of `v` has no effect
  }

  get oversample() {
    return this.#oversample
  }

  set oversample(v) {
    if (!OVER_SAMPLE_TYPES.includes(v)) return // WebIDL enum attribute: invalid assignment is silently ignored
    this.#oversample = v
  }

  _process(input) {
    const channels = input.numberOfChannels
    const out = createPlecoAudioBuffer(channels, RENDER_QUANTUM, this.context.sampleRate)
    const curve = this.#curve

    if (curve === null) {
      // Normative pass-through: "Initially the curve attribute is null, which
      // means that the WaveShaperNode will pass its input to its output
      // without modification."
      for (let c = 0; c < channels; c++) out.getChannelData(c).set(input.getChannelData(c))
      return out
    }

    const factor = this.#oversample === '4x' ? 4 : this.#oversample === '2x' ? 2 : 1

    if (factor === 1) {
      for (let c = 0; c < channels; c++) {
        const src = input.getChannelData(c)
        const dst = out.getChannelData(c)
        for (let i = 0; i < RENDER_QUANTUM; i++) dst[i] = applyCurve(curve, src[i])
      }
      return out
    }

    this.#ensureStates(factor, channels)
    for (let c = 0; c < channels; c++) {
      const { up, down } = this.#states[c]
      // Up-sample to factor× the context rate: per 2× stage, zero-stuff then
      // interpolation-filter (UP_TAPS carries the ×2 gain compensation).
      let data = input.getChannelData(c)
      for (const stage of up) {
        const stuffed = new Float32Array(data.length * 2)
        for (let i = 0; i < data.length; i++) stuffed[i * 2] = data[i]
        data = stage.process(stuffed)
      }
      // Apply the shaping curve at the oversampled rate.
      for (let i = 0; i < data.length; i++) data[i] = applyCurve(curve, data[i])
      // Down-sample back: per 2× stage, anti-alias-filter then decimate.
      for (const stage of down) {
        const filtered = stage.process(data)
        const half = new Float32Array(data.length / 2)
        for (let i = 0; i < half.length; i++) half[i] = filtered[i * 2]
        data = half
      }
      out.getChannelData(c).set(data)
    }
    return out
  }

  /** (Re)build per-channel FIR state when the factor or channel count changes. */
  #ensureStates(factor, channels) {
    if (this.#states !== null && this.#statesFactor === factor && this.#states.length === channels) return
    const stages = factor === 4 ? 2 : 1
    this.#states = Array.from({ length: channels }, () => ({
      up: Array.from({ length: stages }, () => new PlecoFirStage(UP_TAPS)),
      down: Array.from({ length: stages }, () => new PlecoFirStage(DOWN_TAPS)),
    }))
    this.#statesFactor = factor
  }
}
