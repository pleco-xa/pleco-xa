/**
 * engine/nodes/xa-periodic-wave.js — PlecoPeriodicWave (P16).
 *
 * Spec-shaped PeriodicWave (spec § The PeriodicWave Interface): an arbitrary
 * periodic waveform defined by Fourier coefficients, consumed by
 * PlecoOscillatorNode.setPeriodicWave(). The spec interface has NO public
 * members beyond the constructor — the coefficient copies ([[real]]/[[imag]]),
 * the [[normalize]] slot, and the synthesized wavetable(s) are internal engine
 * surface (`_table`, `_waveSet`), excluded from the parity matrix.
 *
 * Constructor algorithm (spec § PeriodicWave constructors), all four cases:
 *   - both real and imag: lengths different OR either < 2 → IndexSizeError
 *   - only real: length < 2 → IndexSizeError; imag defaults to zeros
 *   - only imag: length < 2 → IndexSizeError; real defaults to zeros
 *   - neither: real = [0, 0], imag = [0, 1] — equivalent to built-in 'sine'
 * Element index 0 of both copies is then zeroed (the DC component). WebIDL
 * sequence<float> conversion runs BEFORE the algorithm, so a non-finite
 * coefficient is a binding-layer TypeError even when the lengths would also
 * have failed the IndexSizeError check. Rejecting non-number elements and
 * non-boolean disableNormalization outright (instead of WebIDL ToNumber /
 * ToBoolean coercion) is deliberate pleco strictness, not spec behavior.
 *
 * BAND-LIMITED WAVETABLE SYNTHESIS (spec § OscillatorNode, "care MUST be taken
 * to discard the high-frequency information higher than the Nyquist frequency
 * before converting the waveform to a digital form … aliasing … will fold back
 * as mirror images"). The spec leaves the anti-aliasing strategy
 * implementation-defined; pleco follows the standard browser (Blink) technique:
 * a MIP-MAP of band-limited range tables. A single fixed-harmonic table cannot
 * be right at every pitch — at a high fundamental its upper partials climb past
 * Nyquist and alias down; at a low fundamental too few partials leaves the wave
 * dull. Instead the coefficients are rendered into a set of tables, each keeping
 * a decreasing number of partials, indexed by pitch range:
 *
 *     numberOfPartials(range) = floor(2^(-range · CENTS_PER_RANGE / 1200) · N/2)
 *
 * with CENTS_PER_RANGE = 1200 / NUMBER_OF_OCTAVE_BANDS. For a fundamental f the
 * table is chosen by
 *
 *     pitchRange = 1 + 1200·log2(f / (sampleRate/N)) / CENTS_PER_RANGE
 *
 * clamped to [0, numberOfRanges−1]; the two adjacent range tables are
 * interpolated by the fractional part (the oscillator does this per sample) so
 * there is no zipper artifact as the pitch sweeps between ranges. The net effect
 * is that the number of partials kept at a fundamental f collapses to
 * floor(2^(−1/3)·Nyquist/f) — every retained partial sits safely below Nyquist,
 * with headroom for the inter-range interpolation. This is N-independent and
 * matches Chrome's OscillatorNode bounce sample-for-sample (P23 corpus:
 * oscillator-square, 256 Hz @ 8192 Hz, keeps harmonics 1..11, maxAbsDiff ~4e-7).
 *
 * Each range table is synthesized by the engine inverse-FFT (src/scripts/xa-fft.js,
 * the same kernel AnalyserNode uses):
 *     x̃(n) = Σ_{k=1}^{P−1} (a[k]·cos(2πkn/N) + b[k]·sin(2πkn/N))
 * realized as the real part of an IDFT with bins X[k] = (N/2)(a[k] − i·b[k]) and
 * X[N−k] = conj(X[k]), P the range's partial count. The table size N is
 * PERIODIC_WAVE_TABLE_SIZE (8192) grown to the next power of two ≥ 2L when the
 * coefficient count L exceeds N/2, so the spec's "MUST support up to at least
 * 8192 elements" holds without harmonic aliasing inside the table.
 * Normalization (spec § Waveform Normalization) is computed ONCE from the
 * full-resolution table (range 0) as f = max|x̃(n)| and applied to every range
 * table, unless PeriodicWaveConstraints.disableNormalization is true — so the
 * band-limited tables stay amplitude-consistent with the full waveform, exactly
 * as Blink does it. Tables are computed in double precision and stored at the
 * float32 boundary; ranges beyond range 0 are built lazily on first selection.
 *
 * Built-in oscillator series (spec § Oscillator Coefficients — a[n] = 0
 * throughout, b[0] = 0):
 *     sine      b[n] = 1 for n = 1, else 0
 *     square    b[n] = (2/(nπ))·(1 − (−1)ⁿ)
 *     sawtooth  b[n] = (−1)^(n+1) · 2/(nπ)
 *     triangle  b[n] = 8·sin(nπ/2)/(πn)²
 * Built-ins are synthesized to BUILTIN_SERIES_LENGTH partials with normalization
 * ENABLED, exactly as spec § Basic Waveform Phase requires ("as if a
 * PeriodicWave … with disableNormalization set to false were used"), and pass
 * through the same band-limiting mip-map: at any playback pitch a built-in type
 * produces the identical result to a custom PeriodicWave built from its Fourier
 * series (the reference implementation skips the normalization; pleco follows the
 * spec). The full partial count makes the range-0 normalization converge and
 * gives low fundamentals their full harmonic richness.
 */

import { indexSizeError } from '../xa-errors.js'
import { ifft } from '../../scripts/xa-fft.js'

/** Base wavetable length — grown to ≥ 2L for coefficient arrays longer than half of it. */
export const PERIODIC_WAVE_TABLE_SIZE = 8192

/** Number of band-limited tables per octave (Blink parity): sets the mip-map density. */
const NUMBER_OF_OCTAVE_BANDS = 3

/** Cents spanned by one range table = 1200 / NUMBER_OF_OCTAVE_BANDS. */
const CENTS_PER_RANGE = 1200 / NUMBER_OF_OCTAVE_BANDS

/**
 * Partial count synthesized for the built-in oscillator types. Chosen as N/2
 * (the maximum a default-size table can carry) so the range-0 normalization
 * converges to the ideal-waveform peak and low fundamentals keep their full
 * harmonic content, while the band-limiting mip-map culls partials per pitch.
 */
export const BUILTIN_SERIES_LENGTH = PERIODIC_WAVE_TABLE_SIZE / 2

/**
 * WebIDL sequence<float> conversion, pleco-strict: array-like of finite
 * numbers → Float32Array copy (each element rounded at the float32 store).
 * Non-array-like, non-number, or non-finite elements → TypeError.
 */
function toFloatSequence(name, seq) {
  if (seq == null || typeof seq === 'string' || typeof seq.length !== 'number') {
    throw new TypeError(`PlecoPeriodicWave: ${name} must be a sequence of floats, got ${seq}`)
  }
  const out = new Float32Array(seq.length)
  for (let i = 0; i < seq.length; i++) {
    const v = seq[i]
    if (typeof v !== 'number' || !Number.isFinite(v)) {
      throw new TypeError(`PlecoPeriodicWave: ${name}[${i}] must be a finite number, got ${v}`)
    }
    out[i] = v
  }
  return out
}

/**
 * A band-limited mip-map of wavetables (spec § OscillatorNode anti-aliasing,
 * Blink technique — see file header). Holds the DC-zeroed coefficient arrays and
 * synthesizes one power-of-two table per pitch range, each keeping only the
 * partials that stay below Nyquist for that range. Range 0 (the full-resolution
 * table) is built eagerly to fix the shared normalization factor; higher ranges
 * are built lazily on first selection. Range tables are pitch-invariant — the
 * fundamental→range mapping (which folds in the sample rate) is the only
 * frequency-dependent step, so built-in sets can be cached across contexts.
 */
class BandLimitedWave {
  #a
  #b
  #size
  #ranges
  #numberOfRanges
  #normScale = 1

  /**
   * @param {Float32Array} a — cosine terms (a[0] already zeroed).
   * @param {Float32Array} b — sine terms (b[0] already zeroed).
   * @param {boolean} normalize — the [[normalize]] slot.
   */
  constructor(a, b, normalize) {
    this.#a = a
    this.#b = b
    const L = a.length
    let size = PERIODIC_WAVE_TABLE_SIZE
    while (size < 2 * L) size *= 2
    this.#size = size
    // ceil(bands · log2(N)) distinct pitch ranges cover the full audible span
    // from the lowest representable fundamental up to Nyquist.
    this.#numberOfRanges = Math.ceil(NUMBER_OF_OCTAVE_BANDS * Math.log2(size))
    this.#ranges = new Array(this.#numberOfRanges).fill(null)

    // Range 0 carries every partial — its peak fixes the normalization factor
    // shared by all range tables (spec § Waveform Normalization applied once).
    const t0 = this.#synthesize(this.#partialsForRange(0))
    if (normalize) {
      let f = 0
      for (let n = 0; n < size; n++) {
        const m = Math.abs(t0[n])
        if (m > f) f = m
      }
      if (f > 0) this.#normScale = 1 / f
    }
    if (this.#normScale !== 1) {
      for (let n = 0; n < size; n++) t0[n] *= this.#normScale
    }
    this.#ranges[0] = new Float32Array(t0) // float32 boundary
  }

  /** Table length (power of two), shared by every range table. */
  get size() {
    return this.#size
  }

  /**
   * Partial count for range `r`: floor(2^(−r·CENTS_PER_RANGE/1200) · N/2),
   * capped at the number of supplied coefficients (index count L). A count of P
   * keeps harmonics 1..P−1 (index 0 is the DC slot).
   */
  #partialsForRange(r) {
    const scale = 2 ** (-(r * CENTS_PER_RANGE) / 1200)
    let p = Math.floor(scale * (this.#size / 2))
    // Always keep at least the fundamental (harmonic 1). For any playable
    // oscillator the fundamental is below Nyquist, so the highest range must
    // still synthesize it — clamping to 2 (loop is k=1..p-1) prevents the
    // mip-map from over-culling a high fundamental down to silence.
    if (p < 2) p = 2
    if (p > this.#a.length) p = this.#a.length
    return p
  }

  /**
   * § Waveform Generation for a single range: real part of the IDFT of the first
   * `partials` coefficients (harmonics 1..partials−1). Double precision, returned
   * unnormalized (the caller applies the shared factor).
   */
  #synthesize(partials) {
    const size = this.#size
    const half = size / 2
    const spectrum = new Array(size)
    for (let k = 0; k < size; k++) spectrum[k] = { real: 0, imag: 0 }
    const kMax = Math.min(partials, this.#a.length)
    for (let k = 1; k < kMax; k++) {
      const re = half * this.#a[k]
      const im = half * this.#b[k]
      spectrum[k].real = re
      spectrum[k].imag = -im
      spectrum[size - k].real = re
      spectrum[size - k].imag = im
    }
    const t = ifft(spectrum)
    const out = new Float64Array(size)
    for (let n = 0; n < size; n++) out[n] = t[n].real
    return out
  }

  /** The band-limited table for pitch range `i`, synthesized and cached on demand. */
  #rangeTable(i) {
    const cached = this.#ranges[i]
    if (cached !== null) return cached
    const t = this.#synthesize(this.#partialsForRange(i))
    if (this.#normScale !== 1) {
      for (let n = 0; n < this.#size; n++) t[n] *= this.#normScale
    }
    const table = new Float32Array(t) // float32 boundary
    this.#ranges[i] = table
    return table
  }

  /** Range 0 — the full-resolution normalized table (the classic single wavetable). */
  get fullTable() {
    return this.#ranges[0]
  }

  /**
   * Select the band-limited table(s) for fundamental `freq` at `sampleRate`
   * (Blink WaveDataForFundamentalFrequency): compute the fractional pitch range,
   * clamp it, and return the bracketing range tables with the interpolation
   * factor. |freq| is used (negative fundamentals alias to positive); the caller
   * blends `lower` and `higher` by `factor` ∈ [0, 1].
   *
   * @returns {{lower: Float32Array, higher: Float32Array, factor: number}}
   */
  waveDataForFundamentalFrequency(freq, sampleRate) {
    const lowest = sampleRate / this.#size
    const f = Math.abs(freq)
    const ratio = f > 0 ? f / lowest : 0.5
    let pitchRange = 1 + (Math.log2(ratio) * 1200) / CENTS_PER_RANGE
    const maxRange = this.#numberOfRanges - 1
    if (pitchRange < 0) pitchRange = 0
    else if (pitchRange > maxRange) pitchRange = maxRange
    const lowerIndex = Math.floor(pitchRange)
    const higherIndex = lowerIndex < maxRange ? lowerIndex + 1 : lowerIndex
    return {
      lower: this.#rangeTable(lowerIndex),
      higher: this.#rangeTable(higherIndex),
      factor: pitchRange - lowerIndex,
    }
  }
}

export class PlecoPeriodicWave {
  #real
  #imag
  #normalize
  #waveSet
  #context

  /**
   * @param {object} context — the owning PlecoBaseContext (spec: a
   *   PeriodicWave is associated with one BaseAudioContext).
   * @param {object} [options] — PeriodicWaveOptions
   *   ({real, imag, disableNormalization}); see file header for the four
   *   constructor-algorithm cases.
   */
  constructor(context, options = {}) {
    if (context == null || typeof context.sampleRate !== 'number') {
      throw new TypeError('PlecoPeriodicWave: a context is required')
    }
    options = options ?? {} // WebIDL dictionary conversion: null is the empty dictionary
    if (typeof options !== 'object') {
      throw new TypeError(`PlecoPeriodicWave: options must be a PeriodicWaveOptions dictionary, got ${options}`)
    }
    const { real, imag, disableNormalization = false } = options
    if (typeof disableNormalization !== 'boolean') {
      throw new TypeError(
        `PlecoPeriodicWave: disableNormalization must be a boolean, got ${disableNormalization}`,
      )
    }
    // WebIDL sequence<float> conversion precedes the constructor algorithm:
    // TypeError (non-finite / non-number) fires before any IndexSizeError.
    const realArr = real !== undefined ? toFloatSequence('real', real) : null
    const imagArr = imag !== undefined ? toFloatSequence('imag', imag) : null

    let a
    let b
    if (realArr !== null && imagArr !== null) {
      if (realArr.length !== imagArr.length) {
        throw indexSizeError(
          `PlecoPeriodicWave: real and imag must have the same length, got ${realArr.length} and ${imagArr.length}`,
        )
      }
      if (realArr.length < 2) {
        throw indexSizeError(`PlecoPeriodicWave: real and imag must have at least 2 elements, got ${realArr.length}`)
      }
      a = realArr
      b = imagArr
    } else if (realArr !== null) {
      if (realArr.length < 2) {
        throw indexSizeError(`PlecoPeriodicWave: real must have at least 2 elements, got ${realArr.length}`)
      }
      a = realArr
      b = new Float32Array(realArr.length)
    } else if (imagArr !== null) {
      if (imagArr.length < 2) {
        throw indexSizeError(`PlecoPeriodicWave: imag must have at least 2 elements, got ${imagArr.length}`)
      }
      a = new Float32Array(imagArr.length)
      b = imagArr
    } else {
      // Neither given: equivalent to built-in 'sine' (spec constructor step 2.4).
      a = new Float32Array(2)
      b = new Float32Array(2)
      b[1] = 1
    }
    // Zero the DC component of both internal copies (spec constructor step 3).
    a[0] = 0
    b[0] = 0

    this.#real = a
    this.#imag = b
    this.#normalize = !disableNormalization
    this.#context = context
    this.#waveSet = new BandLimitedWave(a, b, this.#normalize)
  }

  /** INTERNAL — the full-resolution normalized wavetable (range 0 of the mip-map). */
  get _table() {
    return this.#waveSet.fullTable
  }

  /** INTERNAL — the band-limited mip-map, read by PlecoOscillatorNode for per-pitch table selection. */
  get _waveSet() {
    return this.#waveSet
  }

  /** INTERNAL — the associated BaseAudioContext (spec: PeriodicWaves are per-context objects). */
  get _context() {
    return this.#context
  }
}

/** Cache: built-in mip-maps are pure functions of the type — one synthesis each, shared read-only. */
const builtinWaveSets = new Map()

/**
 * INTERNAL — the band-limited mip-map for a built-in OscillatorType ('sine' |
 * 'square' | 'sawtooth' | 'triangle'), synthesized from the spec § Oscillator
 * Coefficients series (to BUILTIN_SERIES_LENGTH partials) with normalization
 * enabled (see file header). The set is pitch-invariant, so it is cached and
 * shared across contexts and sample rates.
 */
export function builtinPeriodicWaveSet(type) {
  const cached = builtinWaveSets.get(type)
  if (cached !== undefined) return cached

  const L = BUILTIN_SERIES_LENGTH
  const a = new Float32Array(L)
  const b = new Float32Array(L)
  switch (type) {
    case 'sine':
      b[1] = 1
      break
    case 'square':
      // b[n] = (2/(nπ))·(1 − (−1)ⁿ)
      for (let n = 1; n < L; n++) {
        b[n] = (2 / (n * Math.PI)) * (1 - (n % 2 === 0 ? 1 : -1))
      }
      break
    case 'sawtooth':
      // b[n] = (−1)^(n+1) · 2/(nπ)
      for (let n = 1; n < L; n++) {
        b[n] = ((n % 2 === 1 ? 1 : -1) * 2) / (n * Math.PI)
      }
      break
    case 'triangle':
      // b[n] = 8·sin(nπ/2)/(πn)²
      for (let n = 1; n < L; n++) {
        b[n] = (8 * Math.sin((n * Math.PI) / 2)) / (Math.PI * n) ** 2
      }
      break
    default:
      throw new TypeError(`builtinPeriodicWaveSet: unknown built-in oscillator type '${type}'`)
  }
  const set = new BandLimitedWave(a, b, true) // spec: disableNormalization false for built-ins
  builtinWaveSets.set(type, set)
  return set
}
