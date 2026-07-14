/**
 * engine/nodes/xa-oscillator.js — PlecoOscillatorNode (P16).
 *
 * Spec-shaped OscillatorNode (spec § The OscillatorNode Interface): an
 * AudioScheduledSourceNode generating a periodic waveform — 0 inputs, 1 mono
 * output, channelCount 2 / 'max' / 'speakers' per the spec node table.
 *
 * OscillatorType `type` follows WebIDL enum-attribute semantics (invalid
 * assignment silently ignored; an invalid enum in the CONSTRUCTOR dictionary
 * throws TypeError — house rule), with the spec's synchronous
 * InvalidStateError on direct type = 'custom'; setPeriodicWave() is the only
 * path to 'custom'. Setting `type` conserves the oscillator's phase (spec
 * § OscillatorNode attributes). OscillatorOptions: `periodicWave` wins over
 * any valid `type` member; type 'custom' WITHOUT periodicWave throws
 * InvalidStateError (spec § OscillatorOptions members).
 *
 * frequency (default 440, nominal range ±Nyquist) and detune (default 0,
 * nominal range ±153600 ≈ 1200·log2(FLT_MAX)) are a-rate AudioParams forming
 * the compound parameter
 *     computedOscFrequency(t) = frequency(t) · 2^(detune(t)/1200)
 * The instantaneous phase is the definite time integral of
 * computedOscFrequency with phase 0 at the node's exact start time (pleco
 * quantizes start to the sample frame, per P05); |computedOscFrequency| at or
 * above the Nyquist frequency outputs silence while the PHASE KEEPS
 * ADVANCING, so dropping back below Nyquist resumes with the integral intact.
 * (The ≥-Nyquist cutoff mirrors the reference implementation; the spec leaves
 * the anti-aliasing strategy implementation-defined.)
 *
 * Synthesis reads the PlecoPeriodicWave band-limited mip-map (built-in sets
 * from xa-periodic-wave.js for the four named types — spec § Basic Waveform
 * Phase requires them to equal the § Oscillator Coefficients series with
 * normalization on). Per sample the |computedOscFrequency| selects the two
 * bracketing range tables and an interpolation factor (xa-periodic-wave.js
 * § BandLimitedWave — the anti-aliasing mip-map keeps only sub-Nyquist
 * partials, matching Chrome's per-pitch band-limiting); each table is read with
 * Catmull-Rom cubic interpolation at position phase·N (N the table length,
 * power of two → wraparound by mask) and the two reads are blended by the
 * factor to avoid a zipper artifact as the pitch sweeps between ranges. Output
 * is computed in double precision and stored at the float32 boundary. Per-block
 * caches of 2^(detune/1200) and of the table selection, keyed on the detune and
 * computed-frequency samples, keep the common constant-parameter case pow-free
 * and lookup-free without any first-equals-last shortcut that could misread a
 * value curve.
 *
 * DEVIATION (base-class shape, not spec): PlecoScheduledSourceNode._process
 * sizes its output block from this.channelCount, but the spec pins the
 * oscillator's single output to one channel (mono) while channelCount must
 * stay 2 by default. _process is therefore overridden here with the same
 * start/stop windowing on a mono block (an oscillator never exhausts, so the
 * base's produced < count branch has no analogue). If a later slice gives the
 * base an output-channel-count hook, this override collapses into it.
 */

import { PlecoScheduledSourceNode, coerceNodeOptions} from '../xa-node.js'
import { PlecoAudioParam } from '../xa-param.js'
import { RENDER_QUANTUM } from '../xa-constants.js'
import { createPlecoAudioBuffer } from '../xa-buffer.js'
import { invalidStateError } from '../xa-errors.js'
import { PlecoPeriodicWave, builtinPeriodicWaveSet } from './xa-periodic-wave.js'

const OSCILLATOR_TYPES = ['sine', 'square', 'sawtooth', 'triangle', 'custom']

/** Spec detune nominal range: ≈ ±1200·log2(FLT_MAX). */
const DETUNE_LIMIT = 153600

export class PlecoOscillatorNode extends PlecoScheduledSourceNode {
  #frequency
  #detune
  #type = 'sine'
  #wave = null
  #phase = 0 // waveform phase in cycles, always in [0, 1)
  #freqBlock = new Float32Array(RENDER_QUANTUM)
  #detuneBlock = new Float32Array(RENDER_QUANTUM)

  /**
   * @param {object} context — the owning PlecoBaseContext.
   * @param {object} [options] — OscillatorOptions
   *   ({type, frequency, detune, periodicWave} + AudioNodeOptions).
   */
  constructor(context, options = {}) {
    // WebIDL: a non-object 2nd argument (e.g. new XNode(ctx, 42)) is a TypeError.
    options = coerceNodeOptions(options)
    options = options ?? {} // WebIDL dictionary conversion: null is the empty dictionary
    if (typeof options !== 'object') {
      throw new TypeError(`PlecoOscillatorNode: options must be an OscillatorOptions dictionary, got ${options}`)
    }
    const { type, frequency, detune, periodicWave, ...nodeOptions } = options
    // numberOfInputs is forced to 0 by the scheduled-source base; the single
    // output is forced here so structural keys cannot ride in on the dictionary.
    super(context, { ...nodeOptions, numberOfOutputs: 1 })

    const nyquist = context.sampleRate / 2
    this.#frequency = new PlecoAudioParam({
      defaultValue: 440,
      minValue: -nyquist,
      maxValue: nyquist,
      context,
    })
    this.#detune = new PlecoAudioParam({
      defaultValue: 0,
      minValue: -DETUNE_LIMIT,
      maxValue: DETUNE_LIMIT,
      context,
    })

    // Constructor dictionary path: an invalid OscillatorType is a WebIDL
    // binding TypeError (unlike attribute assignment, which silently ignores) —
    // checked even when periodicWave will override it.
    if (type !== undefined && !OSCILLATOR_TYPES.includes(type)) {
      throw new TypeError(
        `PlecoOscillatorNode: type must be 'sine' | 'square' | 'sawtooth' | 'triangle' | 'custom', got ${type}`,
      )
    }
    if (periodicWave !== undefined) {
      // Spec: if periodicWave is specified, any valid type member is ignored —
      // the node behaves as if type were 'custom'.
      this.setPeriodicWave(periodicWave)
    } else if (type === 'custom') {
      throw invalidStateError(
        "PlecoOscillatorNode: type 'custom' requires a periodicWave option — use setPeriodicWave()",
      )
    } else if (type !== undefined) {
      this.#type = type
    }
    // Param initial values via the value setter — its WebIDL float conversion
    // supplies the TypeError on non-finite members.
    if (frequency !== undefined) this.#frequency.value = frequency
    if (detune !== undefined) this.#detune.value = detune
  }

  get frequency() {
    return this.#frequency
  }

  get detune() {
    return this.#detune
  }

  get type() {
    return this.#type
  }

  set type(v) {
    if (!OSCILLATOR_TYPES.includes(v)) return // WebIDL enum attribute: invalid assignment is silently ignored
    if (v === 'custom') {
      throw invalidStateError(
        "PlecoOscillatorNode: type cannot be set to 'custom' directly — use setPeriodicWave()",
      )
    }
    // Phase is conserved across type changes (spec) — #phase is untouched.
    this.#type = v
    this.#wave = null
  }

  /** Spec § setPeriodicWave(periodicWave): install a custom waveform; type becomes 'custom'. */
  setPeriodicWave(periodicWave) {
    if (!(periodicWave instanceof PlecoPeriodicWave)) {
      throw new TypeError('PlecoOscillatorNode.setPeriodicWave: periodicWave must be a PlecoPeriodicWave')
    }
    this.#wave = periodicWave
    this.#type = 'custom'
  }

  /**
   * Base-class override for the mono output block (see file-header DEVIATION
   * note): identical start/stop windowing to PlecoScheduledSourceNode._process
   * minus the content-exhaustion branch — an oscillator has no content to run
   * out of, so only stop() (or a stop at/before start) ends it.
   */
  _process() {
    const out = createPlecoAudioBuffer(1, RENDER_QUANTUM, this.context.sampleRate)
    if (this._ended || !this._sourceStarted) return out

    const blockStart = this.context._frame
    const blockEnd = blockStart + RENDER_QUANTUM
    const from = Math.max(this._startFrame, blockStart)
    const to = this._stopFrame === null ? blockEnd : Math.min(blockEnd, this._stopFrame)

    if (from < to) this._dsp(out, from - blockStart, to - from)
    if (this._stopFrame !== null && this._stopFrame <= blockEnd) this._end()
    return out
  }

  /**
   * Generate `count` frames at `offset` in the (mono) block: per-sample
   * computedOscFrequency from the a-rate frequency/detune blocks, wavetable
   * readout at the running phase, silence-but-phase-advance at |f| ≥ Nyquist.
   */
  _dsp(output, offset, count) {
    const sr = this.context.sampleRate
    const nyquist = sr / 2
    const now = this.context.currentTime
    const freq = this.#frequency.fillBlock(this.#freqBlock, now)
    const det = this.#detune.fillBlock(this.#detuneBlock, now)
    const waveSet = this.#wave !== null ? this.#wave._waveSet : builtinPeriodicWaveSet(this.#type)
    const N = waveSet.size
    const mask = N - 1 // power-of-two table → wraparound by bitwise AND
    const out = output.getChannelData(0)
    let phase = this.#phase

    // 2^(detune/1200) cached per distinct detune sample — exact, and pow-free
    // for the constant-detune common case.
    let lastDetune = NaN
    let detuneFactor = 1

    // Band-limited table selection cached per distinct computedOscFrequency —
    // one mip-map lookup for the constant-pitch common case (spec § OscillatorNode
    // anti-aliasing; xa-periodic-wave.js § BandLimitedWave).
    let lastFreq = NaN
    let lower = null
    let higher = null
    let blend = 0

    for (let j = 0; j < count; j++) {
      const d = det[offset + j]
      if (d !== lastDetune) {
        lastDetune = d
        detuneFactor = 2 ** (d / 1200)
      }
      const f = freq[offset + j] * detuneFactor

      if (Math.abs(f) >= nyquist) {
        out[offset + j] = 0 // silent, but the phase integral keeps running
      } else {
        if (f !== lastFreq) {
          lastFreq = f
          const wd = waveSet.waveDataForFundamentalFrequency(f, sr)
          lower = wd.lower
          higher = wd.higher
          blend = wd.factor
        }
        // Catmull-Rom cubic readout at pos = phase·N, phase ∈ [0, 1) ⇒ idx ∈ [0, N),
        // performed on both bracketing range tables and blended by the pitch-range
        // interpolation factor.
        const pos = phase * N
        const idx = pos | 0
        const frac = pos - idx
        const i0 = (idx + mask) & mask
        const i2 = (idx + 1) & mask
        const i3 = (idx + 2) & mask
        const lo = cubic(lower[i0], lower[idx], lower[i2], lower[i3], frac)
        const s = blend === 0 ? lo : lo + blend * (cubic(higher[i0], higher[idx], higher[i2], higher[i3], frac) - lo)
        out[offset + j] = s // float32 boundary at the store
      }
      phase += f / sr
      phase -= Math.floor(phase) // keep phase in [0, 1), including negative f
    }
    this.#phase = phase
    return count
  }
}

/** Catmull-Rom cubic interpolation between y1 and y2 (neighbours y0, y3) at fraction `frac`. */
function cubic(y0, y1, y2, y3, frac) {
  const c1 = 0.5 * (y2 - y0)
  const c2 = y0 - 2.5 * y1 + 2 * y2 - 0.5 * y3
  const c3 = 0.5 * (y3 - y0) + 1.5 * (y1 - y2)
  return ((c3 * frac + c2) * frac + c1) * frac + y1
}
