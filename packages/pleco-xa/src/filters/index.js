/**
 * filters/ — librosa.filters ports (fixture-verified) + re-exports of the
 * parity-gated window and mel filterbank builders.
 *
 * chroma() is a faithful port of librosa 0.11.0 filters.chroma:
 * Gaussian pitch-class bumps over log-frequency bins, binwidth-adaptive,
 * octave-dominance (octwidth) Gaussian weighting, tuning shift and base-C roll.
 *
 * Parity gate: tests/parity/chroma.parity.test.js vs
 * tools/parity/fixtures/chroma.json (raw filterbank case).
 */

export { get_window } from '../scripts/xa-fft.js'
export { mel_filterbank } from '../scripts/xa-mel.js'

/** np.round — round half to even (matches numpy scalar rounding). */
function rint(x) {
  const f = Math.floor(x)
  if (x - f === 0.5) return f % 2 === 0 ? f : f + 1
  return Math.round(x)
}

/**
 * Chroma filter bank (librosa.filters.chroma).
 * Projects FFT bins onto n_chroma pitch classes via Gaussian bumps.
 *
 * @param {Object} options
 * @param {number} options.sr - sample rate (required)
 * @param {number} options.n_fft - FFT size (required)
 * @param {number} [options.n_chroma=12] - number of chroma bins
 * @param {number} [options.tuning=0.0] - deviation from A440 in fractional chroma bins
 * @param {number} [options.ctroct=5.0] - center of the octave dominance window (octs)
 * @param {number|null} [options.octwidth=2] - Gaussian half-width of the dominance
 *   window; null for flat octave weighting
 * @param {number} [options.norm=2] - per-column norm (Infinity for max-norm)
 * @param {boolean} [options.base_c=true] - start the filter bank at C (else A)
 * @returns {Array<Float64Array>} [n_chroma][1 + n_fft/2]
 */
export function chroma(options = {}) {
  const {
    sr,
    n_fft,
    n_chroma = 12,
    tuning = 0.0,
    ctroct = 5.0,
    octwidth = 2,
    norm = 2,
    base_c = true,
  } = options

  if (!(sr > 0) || !Number.isInteger(n_fft) || n_fft <= 1) {
    throw new Error('filters.chroma: sr > 0 and integer n_fft > 1 are required')
  }
  if (!Number.isInteger(n_chroma) || n_chroma < 1) {
    throw new Error(`filters.chroma: n_chroma=${n_chroma} must be a positive integer`)
  }

  // FFT bin frequencies (full n_fft grid, DC excluded), mapped to fractional
  // chroma-bin numbers: n_chroma * log2(f / (A440_tuned / 16))
  const A440 = 440.0 * Math.pow(2.0, tuning / n_chroma)
  const frqbins = new Float64Array(n_fft)
  for (let i = 1; i < n_fft; i++) {
    const f = (i * sr) / n_fft
    frqbins[i] = n_chroma * Math.log2(f / (A440 / 16))
  }
  // 0 Hz bin: 1.5 octaves below bin 1 (broad, 50% rotated)
  frqbins[0] = frqbins[1] - 1.5 * n_chroma

  const binwidth = new Float64Array(n_fft)
  for (let i = 0; i < n_fft - 1; i++) {
    binwidth[i] = Math.max(frqbins[i + 1] - frqbins[i], 1.0)
  }
  binwidth[n_fft - 1] = 1.0

  const nChroma2 = rint(n_chroma / 2)

  // Gaussian bumps: exp(-0.5 * (2 * D / binwidth)^2), D wrapped to
  // [-n_chroma/2, n_chroma/2)
  const wts = new Array(n_chroma)
  for (let c = 0; c < n_chroma; c++) {
    const row = new Float64Array(n_fft)
    for (let i = 0; i < n_fft; i++) {
      let d = frqbins[i] - c + nChroma2 + 10 * n_chroma
      d = ((d % n_chroma) + n_chroma) % n_chroma
      d -= nChroma2
      const z = (2 * d) / binwidth[i]
      row[i] = Math.exp(-0.5 * z * z)
    }
    wts[c] = row
  }

  // Normalize each column (per FFT bin across chroma)
  for (let i = 0; i < n_fft; i++) {
    let length
    if (norm === Infinity) {
      length = 0
      for (let c = 0; c < n_chroma; c++) length = Math.max(length, Math.abs(wts[c][i]))
    } else if (typeof norm === 'number' && norm > 0) {
      length = 0
      for (let c = 0; c < n_chroma; c++) length += Math.pow(Math.abs(wts[c][i]), norm)
      length = Math.pow(length, 1.0 / norm)
    } else if (norm === null) {
      continue
    } else {
      throw new Error(`filters.chroma: unsupported norm ${norm}`)
    }
    if (length < 2.2250738585072014e-308) continue // tiny(f64): leave un-normalized
    for (let c = 0; c < n_chroma; c++) wts[c][i] /= length
  }

  // Octave dominance weighting
  if (octwidth !== null) {
    for (let i = 0; i < n_fft; i++) {
      const z = (frqbins[i] / n_chroma - ctroct) / octwidth
      const w = Math.exp(-0.5 * z * z)
      for (let c = 0; c < n_chroma; c++) wts[c][i] *= w
    }
  }

  // Roll so the bank starts at C instead of A
  let rolled = wts
  if (base_c) {
    const shift = 3 * Math.floor(n_chroma / 12)
    rolled = new Array(n_chroma)
    for (let c = 0; c < n_chroma; c++) {
      rolled[c] = wts[(c + shift) % n_chroma]
    }
  }

  // Keep only the non-aliased columns
  const nOut = Math.floor(1 + n_fft / 2)
  const out = new Array(n_chroma)
  for (let c = 0; c < n_chroma; c++) {
    out[c] = rolled[c].slice(0, nOut)
  }
  return out
}
