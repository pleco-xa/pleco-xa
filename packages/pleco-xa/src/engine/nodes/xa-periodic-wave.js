/**
 * engine/nodes/xa-periodic-wave.js — PlecoPeriodicWave (P16).
 *
 * Spec-shaped PeriodicWave (spec § The PeriodicWave Interface): an arbitrary
 * periodic waveform defined by Fourier coefficients, consumed by
 * PlecoOscillatorNode.setPeriodicWave(). The spec interface has NO public
 * members beyond the constructor — the coefficient copies ([[real]]/[[imag]]),
 * the [[normalize]] slot, and the synthesized wavetable are internal engine
 * surface (`_table`), excluded from the parity matrix.
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
 * Wavetable synthesis (spec § Waveform Generation) is NATIVE — the reference
 * implementation's periodic-function package is replaced by the engine's own
 * inverse-FFT (src/scripts/xa-fft.js, the same kernel AnalyserNode uses):
 *     x̃(n) = Σ_{k=1}^{L−1} (a[k]·cos(2πkn/N) + b[k]·sin(2πkn/N))
 * realized as the real part of an IDFT with bins X[k] = (N/2)(a[k] − i·b[k])
 * and X[N−k] = conj(X[k]). The table size N is PERIODIC_WAVE_TABLE_SIZE
 * (8192) grown to the next power of two ≥ 2L when L exceeds N/2, so the
 * spec's "MUST support up to at least 8192 elements" holds without harmonic
 * aliasing inside the table. Normalization (spec § Waveform Normalization)
 * divides by the fixed factor f = max|x̃(n)| unless
 * PeriodicWaveConstraints.disableNormalization is true; the table is computed
 * in double precision and stored at the float32 boundary.
 *
 * Built-in oscillator series (spec § Oscillator Coefficients — a[n] = 0
 * throughout, b[0] = 0):
 *     sine      b[n] = 1 for n = 1, else 0
 *     square    b[n] = (2/(nπ))·(1 − (−1)ⁿ)
 *     sawtooth  b[n] = (−1)^(n+1) · 2/(nπ)
 *     triangle  b[n] = 8·sin(nπ/2)/(πn)²
 * Built-ins are synthesized with normalization ENABLED, exactly as the spec's
 * § Basic Waveform Phase requires ("as if a PeriodicWave … with
 * disableNormalization set to false were used") — the reference
 * implementation skips that normalization; pleco follows the spec. The
 * series is truncated at BUILTIN_HARMONICS terms (an implementation choice,
 * same order as the reference): a single wavetable cannot band-limit per
 * playback frequency, so the count balances low-frequency waveform sharpness
 * against high-frequency aliasing; the P23 browser-bounce corpus quantifies
 * the resulting tolerance.
 */

import { indexSizeError } from '../xa-errors.js'
import { ifft } from '../../scripts/xa-fft.js'

/** Base wavetable length — grown to ≥ 2L for coefficient arrays longer than half of it. */
export const PERIODIC_WAVE_TABLE_SIZE = 8192

/** Fourier-series truncation order for the built-in oscillator types (see file header). */
export const BUILTIN_HARMONICS = 64

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
 * Native § Waveform Generation: synthesize the time-domain table from the
 * cosine (a) and sine (b) coefficient arrays via the engine IFFT, normalizing
 * per § Waveform Normalization when `normalize` is true. Double-precision
 * synthesis, float32 storage.
 *
 * @param {Float32Array} a — cosine terms (a[0] already zeroed).
 * @param {Float32Array} b — sine terms (b[0] already zeroed).
 * @param {boolean} normalize — the [[normalize]] slot.
 * @returns {Float32Array} the wavetable, power-of-two length ≥ max(8192, 2L).
 */
function synthesizeWavetable(a, b, normalize) {
  const L = a.length
  let size = PERIODIC_WAVE_TABLE_SIZE
  while (size < 2 * L) size *= 2

  // X[k] = (size/2)·(a[k] − i·b[k]), X[size−k] = conj(X[k]) ⇒
  // Re(IDFT(X))[n] = Σ_k a[k]·cos(2πkn/size) + b[k]·sin(2πkn/size).
  const half = size / 2
  const spectrum = new Array(size)
  for (let k = 0; k < size; k++) spectrum[k] = { real: 0, imag: 0 }
  for (let k = 1; k < L; k++) {
    const re = half * a[k]
    const im = half * b[k]
    spectrum[k].real = re
    spectrum[k].imag = -im
    spectrum[size - k].real = re
    spectrum[size - k].imag = im
  }
  const t = ifft(spectrum)

  const table64 = new Float64Array(size)
  for (let n = 0; n < size; n++) table64[n] = t[n].real

  if (normalize) {
    let f = 0
    for (let n = 0; n < size; n++) {
      const m = Math.abs(table64[n])
      if (m > f) f = m
    }
    if (f > 0) {
      for (let n = 0; n < size; n++) table64[n] /= f
    }
  }
  return new Float32Array(table64) // float32 boundary
}

export class PlecoPeriodicWave {
  #real
  #imag
  #normalize
  #table
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
    this.#table = synthesizeWavetable(a, b, this.#normalize)
  }

  /** INTERNAL — the synthesized wavetable (power-of-two Float32Array), read by PlecoOscillatorNode. */
  get _table() {
    return this.#table
  }

  /** INTERNAL — the associated BaseAudioContext (spec: PeriodicWaves are per-context objects). */
  get _context() {
    return this.#context
  }
}

/** Cache: built-in tables are pure functions of the type — one synthesis each, shared read-only. */
const builtinTables = new Map()

/**
 * INTERNAL — the wavetable for a built-in OscillatorType ('sine' | 'square' |
 * 'sawtooth' | 'triangle'), synthesized from the spec § Oscillator
 * Coefficients series with normalization enabled (see file header).
 */
export function builtinPeriodicWaveTable(type) {
  const cached = builtinTables.get(type)
  if (cached !== undefined) return cached

  const a = new Float32Array(BUILTIN_HARMONICS)
  const b = new Float32Array(BUILTIN_HARMONICS)
  switch (type) {
    case 'sine':
      b[1] = 1
      break
    case 'square':
      // b[n] = (2/(nπ))·(1 − (−1)ⁿ)
      for (let n = 1; n < BUILTIN_HARMONICS; n++) {
        b[n] = (2 / (n * Math.PI)) * (1 - (n % 2 === 0 ? 1 : -1))
      }
      break
    case 'sawtooth':
      // b[n] = (−1)^(n+1) · 2/(nπ)
      for (let n = 1; n < BUILTIN_HARMONICS; n++) {
        b[n] = ((n % 2 === 1 ? 1 : -1) * 2) / (n * Math.PI)
      }
      break
    case 'triangle':
      // b[n] = 8·sin(nπ/2)/(πn)²
      for (let n = 1; n < BUILTIN_HARMONICS; n++) {
        b[n] = (8 * Math.sin((n * Math.PI) / 2)) / (Math.PI * n) ** 2
      }
      break
    default:
      throw new TypeError(`builtinPeriodicWaveTable: unknown built-in oscillator type '${type}'`)
  }
  const table = synthesizeWavetable(a, b, true) // spec: disableNormalization false for built-ins
  builtinTables.set(type, table)
  return table
}
