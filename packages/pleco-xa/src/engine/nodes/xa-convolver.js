/**
 * engine/nodes/xa-convolver.js — PlecoConvolverNode (P18).
 *
 * Spec-shaped ConvolverNode (spec § The ConvolverNode Interface): linear
 * convolution of the input with an impulse response held in an AudioBuffer.
 * Per the spec's node table: 1 in / 1 out, channelCount 2 with channelCount
 * constraints (> 2 → NotSupportedError), channelCountMode 'clamped-max' with
 * channelCountMode constraints ('max' → NotSupportedError), interpretation
 * 'speakers', tail-time Yes ("continues to output non-silent audio with zero
 * input for the length of the buffer" — the pull graph re-ticks this node
 * every quantum while it is connected downstream, so the tail flushes
 * naturally; no tail registration needed).
 *
 * buffer (nullable AudioBuffer attribute, spec § "set the buffer attribute"):
 * - Setting it validates SYNCHRONOUSLY: numberOfChannels not 1, 2, or 4, or a
 *   sampleRate different from the associated context's → NotSupportedError.
 *   A non-AudioBuffer, non-null value is the WebIDL `AudioBuffer?` TypeError.
 * - Unlike AudioBufferSourceNode there is NO [[buffer set]] one-shot slot —
 *   the spec explicitly contemplates re-assignment ("If the buffer is set to
 *   a new buffer, audio may glitch") — so the buffer may be re-set, including
 *   back to null, any number of times. Each non-null set ACQUIRES THE CONTENT
 *   of the AudioBuffer (spec § acquire-the-content list: "When a
 *   ConvolverNode's buffer is set to an AudioBuffer it acquires the content"):
 *   pleco snapshots the channel data at set time, so mutating the AudioBuffer
 *   afterwards never reaches the node. A new set discards the running
 *   convolution state (the spec's glitch note).
 * - buffer === null renders a single channel of silence (browser consensus;
 *   the audiojs reference's input pass-through is deliberately not ported —
 *   with no impulse response there is nothing to convolve with).
 *
 * normalize (boolean attribute, default true): sampled ONLY when the buffer
 * attribute is set — "changes to this value do not take effect until the next
 * time the buffer attribute is set" (spec § normalize; the reference
 * re-normalizes the live IR on toggle, which is not ported). When true, the
 * acquired impulse response is pre-multiplied by the spec's exact
 * normalizationScale (§ normalize: calculateNormalizationScale — scaled RMS
 * power over all channels, MinPower overload clamp, GainCalibration 0.00125
 * at the 44100 Hz reference rate, × 0.5 true-stereo compensation for 4
 * channels); pre-multiplying a version of the impulse response is one of the
 * spec's sanctioned mathematically-equivalent placements. When false, the
 * exact impulse response convolves unscaled.
 *
 * Channel-response routing (spec § Channel Configurations for Input, Impulse
 * Response and Output, the normative convolver-diagram):
 * - 1-ch IR: every input channel is convolved independently with the mono IR
 *   (output channel count = input channel count — "mono output only in the
 *   single case where there is a single input channel and a single-channel
 *   buffer").
 * - 2-ch IR: stereo output; L = inL ∗ IR₀, R = inR ∗ IR₁ (a mono input feeds
 *   both branches, per the diagram).
 * - 4-ch IR: matrix "true" stereo — L = inL ∗ IR₀ + inR ∗ IR₂,
 *   R = inL ∗ IR₁ + inR ∗ IR₃ (a mono input feeds both L and R branches).
 * The channelCount ≤ 2 / 'clamped-max' constraints cap the mixed input at
 * mono or stereo, so these are the only reachable configurations.
 *
 * DSP — uniformly-partitioned frequency-domain convolution in render-quantum
 * segments: the impulse response is split into ⌈irLength/128⌉ segments of one
 * render quantum each, each zero-padded to a 256-point spectrum (precomputed
 * once per buffer set) using the SAME radix-2 FFT kernel as the analyser
 * (src/scripts/xa-fft.js — the engine's one FFT junction). Per quantum and
 * per convolution pair, the input block's 256-point spectrum enters a ring of
 * the last ⌈irLength/128⌉ input spectra; segment s multiplies against the
 * input spectrum from s quanta ago and the products accumulate, one inverse
 * FFT produces 255 valid samples, the first 128 emit (plus the previous
 * quantum's saved overlap tail) and the trailing 128 become the next tail —
 * classic overlap-add, sample-placement-exact.
 *
 * Float32 rounding parity with browser behavior (reference discipline kept):
 * each frequency-domain product is Math.fround-ed before accumulating, and
 * every output sample passes fround(out + fround(ifftReal + tail)) on its way
 * into the float32 block.
 *
 * Channel-count transitions (1-ch IR only — the 2-/4-ch routings have a fixed
 * pair count): per-pair rings and overlap tails are PRESERVED across a
 * 1↔2-channel input transition. Growing under 'speakers' interpretation
 * copies the mono pair's ring and tail into the new pair (a mono history
 * up-mixed to stereo sounds in both channels); under 'discrete' the new pair
 * starts silent. Shrinking keeps the surviving pair's state.
 *
 * Pleco strictness (documented, per house rules): `normalize` and the
 * ConvolverOptions `disableNormalization` member accept only real booleans
 * (TypeError — no truthy coercion), and a non-finite sample reaching the
 * convolution surfaces the FFT kernel's non-finite diagnostic instead of
 * laundering NaN through the overlap state.
 */
import { PlecoNode, CHANNEL_COUNT_MODES, coerceNodeOptions} from '../xa-node.js'
import { PlecoAudioBuffer, createPlecoAudioBuffer } from '../xa-buffer.js'
import { RENDER_QUANTUM } from '../xa-constants.js'
import { notSupportedError } from '../xa-errors.js'
import { fft, ifft } from '../../scripts/xa-fft.js'

/** One IR segment per render quantum (128 — a power of two, so no kernel zero-padding surprises). */
const SEGMENT = RENDER_QUANTUM
/** Linear convolution of two 128-frame blocks needs ≥ 255 points → 256-point transforms. */
const FFT_SIZE = 2 * SEGMENT
/** Overlap tail carried between quanta: the transform's samples past the emitted block. */
const TAIL = FFT_SIZE - SEGMENT

/**
 * The spec's exact normalization algorithm (§ normalize,
 * calculateNormalizationScale), verbatim: scaled RMS power over ALL channels
 * of the ORIGINAL buffer, overload clamp at MinPower, GainCalibration at the
 * 44100 Hz reference rate, and the 4-channel true-stereo 0.5 compensation.
 */
function calculateNormalizationScale(buffer) {
  const GainCalibration = 0.00125
  const GainCalibrationSampleRate = 44100
  const MinPower = 0.000125

  const numberOfChannels = buffer.numberOfChannels
  const length = buffer.length

  let power = 0
  for (let i = 0; i < numberOfChannels; i++) {
    let channelPower = 0
    const channelData = buffer.getChannelData(i)
    for (let j = 0; j < length; j++) {
      const sample = channelData[j]
      channelPower += sample * sample
    }
    power += channelPower
  }
  power = Math.sqrt(power / (numberOfChannels * length))

  if (!isFinite(power) || isNaN(power) || power < MinPower) power = MinPower

  let scale = 1 / power
  scale *= GainCalibration
  if (buffer.sampleRate) scale *= GainCalibrationSampleRate / buffer.sampleRate
  if (numberOfChannels === 4) scale *= 0.5
  return scale
}

export class PlecoConvolverNode extends PlecoNode {
  #buffer = null
  #normalize = true
  #irChannelCount = 0
  #numSegs = 0
  /** Per IR channel: array of numSegs precomputed segment spectra {re, im} (Float64Array(FFT_SIZE) each). */
  #segFFTs = null
  /** Per convolution pair: {inIdx, irIdx, outIdx, ring: [{re, im}…], pos, tail} — see #freshPairState. */
  #pairStates = null
  // Reused per-quantum scratch (allocation-free steady state beyond the kernel's own boxing).
  #timeScratch = new Float64Array(FFT_SIZE)
  #prodRe = new Float64Array(FFT_SIZE)
  #prodIm = new Float64Array(FFT_SIZE)
  #spectrumBox = Array.from({ length: FFT_SIZE }, () => ({ real: 0, imag: 0 }))

  /**
   * @param {object} context — the owning PlecoBaseContext.
   * @param {object} [options] — ConvolverOptions ({buffer, disableNormalization})
   *   merged with AudioNodeOptions. Spec node table: 1 input, 1 output,
   *   channelCount 2 (constrained ≤ 2), mode 'clamped-max' ('max' forbidden),
   *   interpretation 'speakers'. Null options are the empty dictionary.
   */
  constructor(context, options = {}) {
    // WebIDL: a non-object 2nd argument (e.g. new XNode(ctx, 42)) is a TypeError.
    options = coerceNodeOptions(options)
    // WebIDL dictionary conversion: null (like undefined) is the empty dictionary.
    const { buffer, disableNormalization = false, ...nodeOptions } = options ?? {}
    // The constructor dictionary must respect the same channelCountMode
    // constraint as assignment (the base constructor stores the mode without
    // running the subclass hook). WebIDL dictionary enum conversion runs
    // FIRST: an out-of-enum string is a binding TypeError; only the VALID but
    // forbidden 'max' reaches the NotSupportedError check.
    const channelCountMode = nodeOptions.channelCountMode ?? 'clamped-max'
    if (!CHANNEL_COUNT_MODES.includes(channelCountMode)) {
      throw new TypeError(
        `PlecoConvolverNode: channelCountMode must be 'max' | 'clamped-max' | 'explicit', got ${channelCountMode}`,
      )
    }
    if (channelCountMode === 'max') {
      throw notSupportedError("PlecoConvolverNode: channelCountMode cannot be 'max'")
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

    // Spec constructor step 1: normalize ← the INVERSE of disableNormalization
    // (validated through the attribute setter — strict boolean, see header)…
    this.normalize = !this.#requireBoolean('constructor', 'options.disableNormalization', disableNormalization)
    // …step 2: if buffer exists, set the buffer attribute to its value — so
    // the buffer is normalized according to the just-set normalize flag.
    if (buffer !== undefined) this.buffer = buffer
  }

  /** Strict WebIDL boolean (pleco strictness: no truthy coercion) — returns the value. */
  #requireBoolean(where, name, v) {
    if (typeof v !== 'boolean') {
      throw new TypeError(`PlecoConvolverNode.${where}: ${name} must be a boolean, got ${v}`)
    }
    return v
  }

  // Spec § channelCount constraints: "The channel count cannot be greater
  // than two, and a NotSupportedError exception MUST be thrown for any
  // attempt to change it to a value greater than two."
  _validateChannelCount(v) {
    if (v > 2) {
      throw notSupportedError(`PlecoConvolverNode: channelCount cannot be greater than 2, got ${v}`)
    }
  }

  // Spec § channelCountMode constraints: "The channel count mode cannot be
  // set to 'max', and a NotSupportedError exception MUST be thrown for any
  // attempt to set it to 'max'."
  _validateChannelCountMode(v) {
    if (v === 'max') {
      throw notSupportedError("PlecoConvolverNode: channelCountMode cannot be 'max'")
    }
  }

  get buffer() {
    return this.#buffer
  }

  /**
   * Spec § "set the buffer attribute" (synchronous steps): 1-, 2-, or
   * 4-channel only and sampleRate must equal the associated context's, else
   * NotSupportedError; then ACQUIRE THE CONTENT (snapshot — see header).
   * Re-assignment is legal (no one-shot slot on ConvolverNode); each set
   * restarts the convolution state (the spec's glitch note).
   */
  set buffer(b) {
    if (b !== null && !(b instanceof PlecoAudioBuffer)) {
      throw new TypeError('PlecoConvolverNode.buffer: value must be a PlecoAudioBuffer or null')
    }
    if (b !== null) {
      const nch = b.numberOfChannels
      if (nch !== 1 && nch !== 2 && nch !== 4) {
        throw notSupportedError(
          `PlecoConvolverNode.buffer: impulse response must have 1, 2, or 4 channels, got ${nch}`,
        )
      }
      if (b.sampleRate !== this.context.sampleRate) {
        throw notSupportedError(
          `PlecoConvolverNode.buffer: impulse response sampleRate (${b.sampleRate}) must match the context sampleRate (${this.context.sampleRate})`,
        )
      }
    }
    this.#buffer = b
    this.#pairStates = null // new impulse response ⇒ fresh convolution state (spec glitch note)
    if (b === null) {
      this.#irChannelCount = 0
      this.#numSegs = 0
      this.#segFFTs = null
      return
    }

    // Acquire the content + normalization placement: snapshot each channel,
    // pre-multiplied by normalizationScale when normalize is true (the
    // float32 store is the browser-parity boundary — a real engine's scaled
    // IR is float32 data), then precompute every segment's 256-point spectrum.
    const scale = this.#normalize ? calculateNormalizationScale(b) : 1
    const irLen = b.length
    this.#irChannelCount = b.numberOfChannels
    this.#numSegs = Math.ceil(irLen / SEGMENT)
    this.#segFFTs = []
    const scaled = new Float32Array(irLen)
    for (let c = 0; c < this.#irChannelCount; c++) {
      const data = b.getChannelData(c)
      for (let i = 0; i < irLen; i++) scaled[i] = scale * data[i]
      const channelSegs = []
      for (let s = 0; s < this.#numSegs; s++) {
        const off = s * SEGMENT
        const end = Math.min(off + SEGMENT, irLen)
        this.#timeScratch.fill(0)
        for (let i = off; i < end; i++) this.#timeScratch[i - off] = scaled[i]
        channelSegs.push(this.#unbox(fft(this.#timeScratch)))
      }
      this.#segFFTs.push(channelSegs)
    }
  }

  get normalize() {
    return this.#normalize
  }

  /**
   * Spec § normalize: a plain boolean store — "changes to this value do not
   * take effect until the next time the buffer attribute is set", so the
   * currently-acquired impulse response is never touched here.
   */
  set normalize(v) {
    this.#normalize = this.#requireBoolean('normalize', 'value', v)
  }

  /** Unbox the kernel's {real, imag} spectrum into flat Float64Arrays (MAC-friendly). */
  #unbox(spectrum) {
    const re = new Float64Array(FFT_SIZE)
    const im = new Float64Array(FFT_SIZE)
    for (let k = 0; k < FFT_SIZE; k++) {
      re[k] = spectrum[k].real
      im[k] = spectrum[k].imag
    }
    return { re, im }
  }

  /** A fresh convolution-pair state: input-spectrum ring (one slot per IR segment) + overlap tail. */
  #freshPairState(inIdx, irIdx, outIdx) {
    return {
      inIdx,
      irIdx,
      outIdx,
      ring: Array.from({ length: this.#numSegs }, () => ({
        re: new Float64Array(FFT_SIZE),
        im: new Float64Array(FFT_SIZE),
      })),
      pos: 0,
      tail: new Float64Array(TAIL),
    }
  }

  /** Deep-copy ring/pos/tail from `src` into `dst` (channel-growth state cloning). */
  #copyPairState(dst, src) {
    for (let s = 0; s < this.#numSegs; s++) {
      dst.ring[s].re.set(src.ring[s].re)
      dst.ring[s].im.set(src.ring[s].im)
    }
    dst.pos = src.pos
    dst.tail.set(src.tail)
  }

  /**
   * Reconcile #pairStates with this quantum's routing pairs, PRESERVING rings
   * and overlap tails across channel-count transitions (see header). Only the
   * 1-ch-IR routing can change pair count (input 1 ↔ 2).
   */
  #ensurePairStates(pairs) {
    if (this.#pairStates === null) {
      this.#pairStates = pairs.map(([i, r, o]) => this.#freshPairState(i, r, o))
      return this.#pairStates
    }
    const existing = this.#pairStates
    if (existing.length === pairs.length) return existing
    if (existing.length > pairs.length) {
      // Shrink: the surviving pair keeps its state (tails preserved).
      this.#pairStates = existing.slice(0, pairs.length)
      return this.#pairStates
    }
    // Grow: existing pairs keep their state; new pairs start fresh — except
    // that under 'speakers' interpretation a mono history up-mixed to stereo
    // sounds in every channel, so the mono pair's ring/tail is cloned into
    // the new pairs. Under 'discrete', up-mixed channels are silent history.
    const grown = existing.slice()
    for (let p = existing.length; p < pairs.length; p++) {
      const [i, r, o] = pairs[p]
      const fresh = this.#freshPairState(i, r, o)
      if (this.#irChannelCount === 1 && this.channelInterpretation === 'speakers' && existing.length > 0) {
        this.#copyPairState(fresh, existing[0])
      }
      grown.push(fresh)
    }
    this.#pairStates = grown
    return grown
  }

  _process(input) {
    if (this.#segFFTs === null) {
      // No impulse response: a single channel of silence (see header).
      return createPlecoAudioBuffer(1, RENDER_QUANTUM, this.context.sampleRate)
    }

    const irCh = this.#irChannelCount
    const inCh = input.numberOfChannels

    // Spec channel-response routing — [inputChannel, irChannel, outputChannel]
    // triples (see header). For 2-/4-ch IRs a mono input feeds both branches.
    let outCh
    let pairs
    if (irCh === 1) {
      outCh = inCh
      pairs = []
      for (let c = 0; c < inCh; c++) pairs.push([c, 0, c])
    } else if (irCh === 2) {
      outCh = 2
      pairs = [
        [0, 0, 0],
        [1, 1, 1],
      ]
    } else {
      outCh = 2
      pairs = [
        [0, 0, 0],
        [0, 1, 1],
        [1, 2, 0],
        [1, 3, 1],
      ]
    }

    const states = this.#ensurePairStates(pairs)
    const out = createPlecoAudioBuffer(outCh, RENDER_QUANTUM, this.context.sampleRate)
    const numSegs = this.#numSegs
    const prodRe = this.#prodRe
    const prodIm = this.#prodIm
    const box = this.#spectrumBox
    const f = Math.fround

    // Forward-transform each DISTINCT input feed once per quantum. Feed
    // channel: the pair's input channel, except that a mono input feeding a
    // 2-/4-ch IR routes channel 0 into both branches.
    const feedSpectra = new Map()
    const feedSpectrum = (inIdx) => {
      const ch = irCh >= 2 && inCh === 1 ? 0 : inIdx
      let spec = feedSpectra.get(ch)
      if (spec === undefined) {
        const data = input.getChannelData(ch)
        this.#timeScratch.fill(0)
        for (let i = 0; i < RENDER_QUANTUM; i++) this.#timeScratch[i] = data[i]
        spec = this.#unbox(fft(this.#timeScratch))
        feedSpectra.set(ch, spec)
      }
      return spec
    }

    for (const ps of states) {
      // This quantum's input spectrum enters the pair's ring.
      const spec = feedSpectrum(ps.inIdx)
      const slot = ps.ring[ps.pos]
      slot.re.set(spec.re)
      slot.im.set(spec.im)

      // Frequency-domain multiply-accumulate: segment s against the input
      // spectrum from s quanta ago — float32-rounded products (browser parity).
      prodRe.fill(0)
      prodIm.fill(0)
      const segFFTs = this.#segFFTs[ps.irIdx]
      for (let s = 0; s < numSegs; s++) {
        const idx = (ps.pos - s + numSegs) % numSegs
        const inRe = ps.ring[idx].re
        const inIm = ps.ring[idx].im
        const irRe = segFFTs[s].re
        const irIm = segFFTs[s].im
        for (let k = 0; k < FFT_SIZE; k++) {
          prodRe[k] += f(inRe[k] * irRe[k]) - f(inIm[k] * irIm[k])
          prodIm[k] += f(inRe[k] * irIm[k]) + f(inIm[k] * irRe[k])
        }
      }

      // One inverse transform per pair; reuse the boxed-spectrum scratch.
      for (let k = 0; k < FFT_SIZE; k++) {
        box[k].real = prodRe[k]
        box[k].imag = prodIm[k]
      }
      const time = ifft(box)

      // Overlap-add: emit block + previous tail (accumulating — 4-ch routing
      // sums two pairs per output channel), save the new tail.
      const dst = out.getChannelData(ps.outIdx)
      for (let i = 0; i < RENDER_QUANTUM; i++) {
        dst[i] = f(dst[i] + f(time[i].real + ps.tail[i]))
      }
      for (let i = 0; i < TAIL; i++) {
        ps.tail[i] = time[SEGMENT + i].real
      }
      ps.pos = (ps.pos + 1) % numSegs
    }

    return out
  }
}
