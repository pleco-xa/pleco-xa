/**
 * engine/nodes/xa-analyser.js — PlecoAnalyserNode (P17).
 *
 * Spec-shaped AnalyserNode (spec § The AnalyserNode Interface): the audio
 * stream passes UN-PROCESSED from input to output while the node captures the
 * input into a circular time-domain history. Per the spec's node table: 1 in /
 * 1 out (output may be left unconnected), channelCount 2, channelCountMode
 * 'max', channelInterpretation 'speakers', no tail-time.
 *
 * Capture (spec § Time-Domain Down-Mixing): the input is down-mixed to mono
 * as if channelCount = 1 / 'max' / 'speakers' — independent of the node's own
 * channel settings — and blitted into a 32768-frame circular buffer. The spec
 * requires the analyser to "effectively keep around the last 32768
 * sample-frames" so that GROWING fftSize exposes past frames; the history is
 * therefore always MAX_FFT_SIZE long and the current time-domain data is the
 * most recent fftSize frames of it. Because the analyser must keep analysing
 * whatever is connected upstream even when its output feeds nothing, the
 * constructor registers the node in the context's tail set (context._tailNodes,
 * the P05 mechanism renderQuantum() already ticks) — per-quantum memoization
 * makes the extra tick a no-op when the destination also pulls this node.
 *
 * Frequency analysis (spec § FFT Windowing and Smoothing over Time) follows
 * the normative algorithm exactly:
 *   1. current time-domain data (most recent fftSize frames, mono),
 *   2. Blackman window, spec coefficients α = 0.16, a₀ = (1−α)/2, a₁ = 1/2,
 *      a₂ = α/2, w[n] = a₀ − a₁·cos(2πn/N) + a₂·cos(4πn/N),
 *   3. Fourier transform X[k] = (1/N) Σ x̂[n]·e^(−2πikn/N) — REUSED from
 *      pleco's analysis pillar (src/scripts/xa-fft.js, the iterative radix-2
 *      Cooley-Tukey core with the same e^(−2πikn/N) kernel; fftSize is always
 *      a power of two so its zero-padding path never engages) with the 1/N
 *      normalization applied at the magnitude,
 *   4. smoothing over time X̂[k] = τ·X̂₋₁[k] + (1−τ)·|X[k]|, with the spec's
 *      non-finite clause (NaN/±Infinity → 0),
 *   5. dB conversion Y[k] = 20·log₁₀(X̂[k]).
 * Within one render quantum the current frequency data is computed at most
 * once (spec: a second getFloat/ByteFrequencyData call in the same quantum
 * returns the previously computed data) — the smoothing state X̂₋₁ advances
 * exactly once per quantum no matter how often it is read. Changing fftSize
 * to a DIFFERENT value resets X̂₋₁ to all zeros (spec § fftSize) but never
 * touches the time-domain history.
 *
 * Byte conversions: getByteFrequencyData clips Y[k] to [minDecibels,
 * maxDecibels] via b[k] = ⌊255/(dB_max − dB_min)·(Y[k] − dB_min)⌋ clamped to
 * [0, 255]; getByteTimeDomainData is b[k] = ⌊128·(1 + x[k])⌋ clamped likewise.
 *
 * Attribute validation (all spec-synchronous): fftSize must be a power of two
 * in [32, 32768] else IndexSizeError; minDecibels ≥ maxDecibels or
 * maxDecibels ≤ minDecibels → IndexSizeError; smoothingTimeConstant outside
 * [0, 1] → IndexSizeError. Non-finite values for the double attributes are a
 * TypeError (WebIDL restricted double conversion precedes the algorithm —
 * the P05 house pattern).
 */
import { PlecoNode, coerceNodeOptions} from '../xa-node.js'
import { RENDER_QUANTUM } from '../xa-constants.js'
import { createPlecoAudioBuffer } from '../xa-buffer.js'
import { mixInto } from '../xa-channel-mixing.js'
import { indexSizeError } from '../xa-errors.js'
import { fft } from '../../scripts/xa-fft.js'

/** Spec bounds for fftSize — and the history length the spec requires the node to retain. */
const MIN_FFT_SIZE = 32
const MAX_FFT_SIZE = 32768

/** Spec Blackman coefficients: α = 0.16, a₀ = (1−α)/2, a₁ = 1/2, a₂ = α/2. */
const BLACKMAN_ALPHA = 0.16
const BLACKMAN_A0 = (1 - BLACKMAN_ALPHA) / 2
const BLACKMAN_A1 = 1 / 2
const BLACKMAN_A2 = BLACKMAN_ALPHA / 2

/** WebIDL restricted double conversion for the dB / smoothing attributes: non-finite → TypeError. */
function requireFiniteDouble(what, v) {
  if (typeof v !== 'number' || !Number.isFinite(v)) {
    throw new TypeError(`PlecoAnalyserNode.${what} must be a finite number, got ${v}`)
  }
}

export class PlecoAnalyserNode extends PlecoNode {
  #fftSize = 0 // sentinel: the constructor's setter call always allocates
  #minDecibels = -100
  #maxDecibels = -30
  #smoothingTimeConstant = 0.8
  /**
   * Circular mono capture of the last MAX_FFT_SIZE input frames (starts as
   * silence, so a fresh analyser reads all-zero time-domain data — the spec
   * treats absent history as silence). RENDER_QUANTUM divides MAX_FFT_SIZE,
   * so every per-quantum blit lands without splitting across the wrap point.
   */
  #history = new Float32Array(MAX_FFT_SIZE)
  #writeIndex = 0
  #window = null // Float64Array(fftSize) — precomputed Blackman window
  #prevSmoothed = null // Float32Array(fftSize/2) — X̂₋₁, doubles as the cached current frequency data
  #computedTime = -1 // context.currentTime of the last frequency-data computation (per-quantum cache key)

  /**
   * @param {object} context — the owning PlecoBaseContext.
   * @param {object} [options] — AnalyserOptions (fftSize, maxDecibels,
   *   minDecibels, smoothingTimeConstant) merged with AudioNodeOptions.
   */
  constructor(context, options = {}) {
    // WebIDL: a non-object 2nd argument (e.g. new XNode(ctx, 42)) is a TypeError.
    options = coerceNodeOptions(options)
    super(context, { ...options, numberOfInputs: 1, numberOfOutputs: 1 })
    const {
      fftSize = 2048,
      maxDecibels = -30,
      minDecibels = -100,
      smoothingTimeConstant = 0.8,
    } = options

    this.fftSize = fftSize // validated setter — allocates window + smoothing state
    // The dB pair is validated JOINTLY so any coherent pair is constructible —
    // going through the setters one at a time would spuriously reject valid
    // pairs that straddle a default (e.g. {min: -20, max: -10} vs default max -30).
    requireFiniteDouble('minDecibels', minDecibels)
    requireFiniteDouble('maxDecibels', maxDecibels)
    if (minDecibels >= maxDecibels) {
      throw indexSizeError(
        `PlecoAnalyserNode: minDecibels (${minDecibels}) must be less than maxDecibels (${maxDecibels})`,
      )
    }
    this.#minDecibels = minDecibels
    this.#maxDecibels = maxDecibels
    this.smoothingTimeConstant = smoothingTimeConstant // validated setter

    // Keep capturing while connected upstream even if the output feeds
    // nothing: renderQuantum() ticks every tail node after the destination
    // pull, and the per-quantum memo de-duplicates when both paths pull.
    context._tailNodes.add(this)
  }

  get fftSize() {
    return this.#fftSize
  }

  set fftSize(v) {
    // Spec: "MUST be a power of two in the range 32 to 32768, otherwise an
    // IndexSizeError exception MUST be thrown". (WebIDL unsigned long would
    // coerce non-integers first; pleco rejects them outright — every
    // non-power-of-two lands on the same spec exception either way.)
    if (
      typeof v !== 'number' ||
      !Number.isInteger(v) ||
      v < MIN_FFT_SIZE ||
      v > MAX_FFT_SIZE ||
      (v & (v - 1)) !== 0
    ) {
      throw indexSizeError(
        `PlecoAnalyserNode.fftSize must be a power of two in [${MIN_FFT_SIZE}, ${MAX_FFT_SIZE}], got ${v}`,
      )
    }
    if (v === this.#fftSize) return // spec resets smoothing only when "changed to a different value"
    this.#fftSize = v
    this.#window = new Float64Array(v)
    for (let n = 0; n < v; n++) {
      this.#window[n] =
        BLACKMAN_A0 - BLACKMAN_A1 * Math.cos((2 * Math.PI * n) / v) + BLACKMAN_A2 * Math.cos((4 * Math.PI * n) / v)
    }
    // Spec § fftSize: X̂₋₁[k] = 0 for all k after a size change. The
    // time-domain history is NOT cleared — the spec requires the last 32768
    // frames to remain available so a larger fftSize sees past frames.
    this.#prevSmoothed = new Float32Array(v / 2)
    this.#computedTime = -1 // stale bin count — force recomputation on next read
  }

  get frequencyBinCount() {
    return this.#fftSize / 2
  }

  get minDecibels() {
    return this.#minDecibels
  }

  set minDecibels(v) {
    requireFiniteDouble('minDecibels', v)
    // Spec: "set to a value more than or equal to maxDecibels → IndexSizeError".
    if (v >= this.#maxDecibels) {
      throw indexSizeError(
        `PlecoAnalyserNode.minDecibels (${v}) must be less than maxDecibels (${this.#maxDecibels})`,
      )
    }
    this.#minDecibels = v
  }

  get maxDecibels() {
    return this.#maxDecibels
  }

  set maxDecibels(v) {
    requireFiniteDouble('maxDecibels', v)
    // Spec: "set to a value less than or equal to minDecibels → IndexSizeError".
    if (v <= this.#minDecibels) {
      throw indexSizeError(
        `PlecoAnalyserNode.maxDecibels (${v}) must be greater than minDecibels (${this.#minDecibels})`,
      )
    }
    this.#maxDecibels = v
  }

  get smoothingTimeConstant() {
    return this.#smoothingTimeConstant
  }

  set smoothingTimeConstant(v) {
    requireFiniteDouble('smoothingTimeConstant', v)
    // Spec: "set to a value less than 0 or more than 1 → IndexSizeError".
    if (v < 0 || v > 1) {
      throw indexSizeError(`PlecoAnalyserNode.smoothingTimeConstant must be in [0, 1], got ${v}`)
    }
    this.#smoothingTimeConstant = v
  }

  /**
   * Pass-through + capture. The `input` argument arrives mixed per the node's
   * OWN channelCount/channelCountMode/channelInterpretation (the normal input
   * machinery) and is returned UNTOUCHED as the output. The capture must NOT
   * use it: spec § Time-Domain Down-Mixing mixes the analysis feed "as if
   * channelCount is 1, channelCountMode is 'max' and channelInterpretation is
   * 'speakers' … independent of the settings for the AnalyserNode itself".
   * So the capture path re-mixes the raw connection blocks under that fixed
   * rule ('max'/1 ⇒ the max-source-channel sum — memoized upstream pulls, no
   * recompute), then 'speakers'-down-mixes to the mono history.
   */
  _process(input) {
    const feed = this._inputs[0]._pullMixed('max', 1, 'speakers')
    const mono = createPlecoAudioBuffer(1, RENDER_QUANTUM, this.context.sampleRate)
    mixInto(mono, feed, 'speakers')
    this.#history.set(mono.getChannelData(0), this.#writeIndex)
    this.#writeIndex = (this.#writeIndex + RENDER_QUANTUM) % MAX_FFT_SIZE
    return input
  }

  /** Index into #history of the OLDEST frame of the current time-domain data. */
  #timeDomainStart() {
    return (this.#writeIndex - this.#fftSize + MAX_FFT_SIZE) % MAX_FFT_SIZE
  }

  /**
   * Current frequency data X̂[k] (linear magnitude, smoothed) per spec § FFT
   * Windowing and Smoothing over Time — computed at most once per render
   * quantum; repeat reads in the same quantum return the previous computation
   * (so the smoothing recursion advances exactly once per quantum).
   */
  #currentFrequencyData() {
    const now = this.context.currentTime
    if (this.#computedTime === now) return this.#prevSmoothed

    const N = this.#fftSize
    const bins = N / 2
    const start = this.#timeDomainStart()
    const smoothed = this.#prevSmoothed
    const tau = this.#smoothingTimeConstant

    // 1+2. Current time-domain data, Blackman-windowed. A non-finite sample
    // makes EVERY DFT bin non-finite (each X[k] sums all N samples), so the
    // spec's smoothing clause (X̂[k] NaN/±∞ → 0) zeroes the whole block —
    // resolved here up front, which also keeps the reused analysis-pillar fft
    // (which refuses non-finite input rather than fabricate a spectrum) on
    // its defined domain.
    const windowed = new Float64Array(N)
    let finite = true
    for (let n = 0; n < N; n++) {
      const x = this.#history[(start + n) % MAX_FFT_SIZE]
      if (!Number.isFinite(x)) {
        finite = false
        break
      }
      windowed[n] = x * this.#window[n]
    }

    if (!finite) {
      smoothed.fill(0)
    } else {
      // 3. Fourier transform — reused radix-2 kernel (e^(−2πikn/N), matching
      // the spec's W_N^(−kn)); the spec's 1/N normalization lands on the
      // magnitude below.
      const spectrum = fft(windowed)
      // 4. Smoothing over time: X̂[k] = τ·X̂₋₁[k] + (1−τ)·|X[k]|, non-finite → 0.
      for (let k = 0; k < bins; k++) {
        const { real, imag } = spectrum[k]
        const mag = Math.sqrt(real * real + imag * imag) / N
        // fround BEFORE the finiteness clause: the float32 boundary can
        // overflow a huge-but-finite double to Infinity, which the spec zeroes.
        let s = Math.fround(tau * smoothed[k] + (1 - tau) * mag)
        if (!Number.isFinite(s)) s = 0
        smoothed[k] = s
      }
    }
    this.#computedTime = now
    return smoothed
  }

  /** Y[k] = 20·log₁₀(X̂[k]) in dB, into a Float32Array (min(array.length, frequencyBinCount) bins). */
  getFloatFrequencyData(array) {
    if (!(array instanceof Float32Array)) {
      throw new TypeError('PlecoAnalyserNode.getFloatFrequencyData: array must be a Float32Array')
    }
    const data = this.#currentFrequencyData()
    const n = Math.min(array.length, data.length)
    for (let k = 0; k < n; k++) array[k] = 20 * Math.log10(data[k]) // X̂ = 0 → -Infinity, per the formula
  }

  /** b[k] = ⌊255/(dB_max − dB_min)·(Y[k] − dB_min)⌋ clamped to [0, 255], into a Uint8Array. */
  getByteFrequencyData(array) {
    if (!(array instanceof Uint8Array)) {
      throw new TypeError('PlecoAnalyserNode.getByteFrequencyData: array must be a Uint8Array')
    }
    const data = this.#currentFrequencyData()
    const n = Math.min(array.length, data.length)
    const scale = 255 / (this.#maxDecibels - this.#minDecibels)
    for (let k = 0; k < n; k++) {
      const y = 20 * Math.log10(data[k])
      const b = Math.floor(scale * (y - this.#minDecibels)) // -Infinity floors to -Infinity → clamps to 0
      array[k] = b < 0 ? 0 : b > 255 ? 255 : b
    }
  }

  /** The most recent fftSize captured frames (oldest first), sample-exact, into a Float32Array. */
  getFloatTimeDomainData(array) {
    if (!(array instanceof Float32Array)) {
      throw new TypeError('PlecoAnalyserNode.getFloatTimeDomainData: array must be a Float32Array')
    }
    const start = this.#timeDomainStart()
    const n = Math.min(array.length, this.#fftSize)
    for (let i = 0; i < n; i++) array[i] = this.#history[(start + i) % MAX_FFT_SIZE]
  }

  /** b[k] = ⌊128·(1 + x[k])⌋ clamped to [0, 255], into a Uint8Array. */
  getByteTimeDomainData(array) {
    if (!(array instanceof Uint8Array)) {
      throw new TypeError('PlecoAnalyserNode.getByteTimeDomainData: array must be a Uint8Array')
    }
    const start = this.#timeDomainStart()
    const n = Math.min(array.length, this.#fftSize)
    for (let i = 0; i < n; i++) {
      const b = Math.floor(128 * (1 + this.#history[(start + i) % MAX_FFT_SIZE]))
      array[i] = b < 0 ? 0 : b > 255 ? 255 : b
    }
  }
}
