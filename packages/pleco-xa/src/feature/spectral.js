/**
 * feature/spectral.js — spectral descriptors, fixture-verified.
 *
 * Standard spectral descriptor formulas computed over the
 * validated STFT in scripts/xa-fft.js. Every function accepts either a
 * time series `y` (first positional arg) or a precomputed spectrogram `S`
 * (magnitude, [freq][time] rows) via options.
 *
 * Validated against committed reference fixtures.
 *
 * Layout convention: all spectrogram matrices are freq-major ([freq][time]),
 * i.e. axis=-2 is the frequency axis.
 */

import { stft, fft_frequencies } from '../scripts/xa-fft.js'
import { power_to_db } from '../scripts/xa-convert.js'

/** float32 tiny — util.normalize threshold on the f32 pipeline */
const TINY = 1.1754943508222875e-38

export class ParameterError extends Error {
  constructor(message) {
    super(message)
    this.name = 'ParameterError'
  }
}

/* -------------------------------------------------------------------------- */
/*  Internal helpers                                                          */
/* -------------------------------------------------------------------------- */

function isVector(x) {
  return (
    Array.isArray(x) || (ArrayBuffer.isView(x) && !(x instanceof DataView))
  )
}

/**
 * Resolve (y, S) to a spectrogram (the _spectrogram helper).
 * If S is given it is passed through (n_fft inferred from its row count);
 * otherwise S = |stft(y)|**power.
 * @returns {{S: Array, n_fft: number}} freq-major spectrogram + resolved n_fft
 */
function _spectrogram(y, S, options) {
  const {
    n_fft = 2048,
    hop_length = 512,
    power = 1,
    win_length = null,
    window = 'hann',
    center = true,
    pad_mode = 'constant',
  } = options

  if (S != null) {
    if (!isVector(S) || S.length === 0 || !isVector(S[0])) {
      throw new ParameterError(
        'feature: S must be a 2-D spectrogram ([freq][time] rows)',
      )
    }
    let nfft = n_fft
    if (nfft == null || Math.floor(nfft / 2) + 1 !== S.length) {
      nfft = 2 * (S.length - 1)
    }
    return { S, n_fft: nfft }
  }

  if (y == null) {
    throw new ParameterError(
      'feature: input signal y must be provided to compute a spectrogram',
    )
  }

  const D = stft(y, n_fft, hop_length, win_length, window, center, pad_mode)
  const nF = D.length
  const nT = D[0] ? D[0].length : 0
  const spec = new Array(nF)
  for (let f = 0; f < nF; f++) {
    const row = new Float64Array(nT)
    const src = D[f]
    for (let t = 0; t < nT; t++) {
      const mag = Math.hypot(src[t].real, src[t].imag)
      row[t] = power === 1 ? mag : power === 2 ? mag * mag : Math.pow(mag, power)
    }
    spec[f] = row
  }
  return { S: spec, n_fft }
}

/** Throw on non-finite or negative spectrogram values (input guards). */
function validateSpectrogram(S, name) {
  for (let f = 0; f < S.length; f++) {
    const row = S[f]
    for (let t = 0; t < row.length; t++) {
      const v = row[t]
      if (!Number.isFinite(v)) {
        throw new ParameterError(`${name}: spectrogram contains non-finite values`)
      }
      if (v < 0) {
        throw new ParameterError(
          `${name} is only defined with non-negative energies`,
        )
      }
    }
  }
}

/** np.rint — round half to even. */
function rint(x) {
  const f = Math.floor(x)
  if (x - f === 0.5) return f % 2 === 0 ? f : f + 1
  return Math.round(x)
}

/** np.pad for 1-D signals: constant | edge | reflect. */
function padSignal(y, pad, mode) {
  const n = y.length
  const out = new Float64Array(n + 2 * pad)
  for (let i = 0; i < n; i++) out[pad + i] = y[i]
  if (mode === 'constant') return out
  if (mode === 'edge') {
    for (let i = 0; i < pad; i++) {
      out[i] = y[0]
      out[n + pad + i] = y[n - 1]
    }
    return out
  }
  if (mode === 'reflect') {
    if (pad >= n) {
      throw new ParameterError(
        `feature: reflect padding requires pad (${pad}) < signal length (${n})`,
      )
    }
    for (let i = 0; i < pad; i++) {
      out[i] = y[pad - i]
      out[n + pad + i] = y[n - 2 - i]
    }
    return out
  }
  throw new ParameterError(`feature: unsupported pad_mode '${mode}'`)
}

function frameCount(length, frame_length, hop_length) {
  const n = Math.floor((length - frame_length) / hop_length) + 1
  if (n < 1) {
    throw new ParameterError(
      `feature: input (length ${length}) is too short for frame_length=${frame_length}`,
    )
  }
  return n
}

/* -------------------------------------------------------------------------- */
/*  Spectral descriptors                                                      */
/* -------------------------------------------------------------------------- */

/**
 * Spectral centroid per frame.
 * centroid[t] = sum_f freq[f] * S_norm[f][t], with per-frame L1 normalization.
 * @param {Float32Array|Array|null} y - time series (or null when S given)
 * @param {Object} options - { sr, S, n_fft, hop_length, win_length, window, center, pad_mode, freq }
 * @returns {Float64Array} centroid frequency (Hz) per frame
 */
export function spectral_centroid(y = null, options = {}) {
  const {
    sr = 22050,
    S = null,
    n_fft = 2048,
    hop_length = 512,
    win_length = null,
    window = 'hann',
    center = true,
    pad_mode = 'constant',
    freq = null,
  } = options

  const resolved = _spectrogram(y, S, {
    n_fft, hop_length, win_length, window, center, pad_mode, power: 1,
  })
  const spec = resolved.S
  validateSpectrogram(spec, 'Spectral centroid')

  const freqs = freq != null ? freq : fft_frequencies(sr, resolved.n_fft)
  const nF = spec.length
  const nT = spec[0].length
  const out = new Float64Array(nT)
  for (let t = 0; t < nT; t++) {
    let norm = 0
    for (let f = 0; f < nF; f++) norm += spec[f][t]
    if (norm < TINY) norm = 1 // normalize: sub-threshold columns pass through
    let acc = 0
    for (let f = 0; f < nF; f++) acc += freqs[f] * spec[f][t]
    out[t] = acc / norm
  }
  return out
}

/**
 * p'th-order spectral bandwidth.
 * bw[t] = (sum_f S_norm[f][t] * |freq[f] - centroid[t]|**p) ** (1/p)
 * @returns {Float64Array} bandwidth per frame
 */
export function spectral_bandwidth(y = null, options = {}) {
  const {
    sr = 22050,
    S = null,
    n_fft = 2048,
    hop_length = 512,
    win_length = null,
    window = 'hann',
    center = true,
    pad_mode = 'constant',
    freq = null,
    centroid = null,
    norm = true,
    p = 2,
  } = options

  const resolved = _spectrogram(y, S, {
    n_fft, hop_length, win_length, window, center, pad_mode, power: 1,
  })
  const spec = resolved.S
  validateSpectrogram(spec, 'Spectral bandwidth')

  const cent =
    centroid != null
      ? centroid
      : spectral_centroid(null, {
          sr, S: spec, n_fft: resolved.n_fft, hop_length, freq,
        })
  const freqs = freq != null ? freq : fft_frequencies(sr, resolved.n_fft)

  const nF = spec.length
  const nT = spec[0].length
  const out = new Float64Array(nT)
  for (let t = 0; t < nT; t++) {
    let colNorm = 1
    if (norm) {
      colNorm = 0
      for (let f = 0; f < nF; f++) colNorm += spec[f][t]
      if (colNorm < TINY) colNorm = 1
    }
    let acc = 0
    for (let f = 0; f < nF; f++) {
      const dev = Math.abs(freqs[f] - cent[t])
      acc += (spec[f][t] / colNorm) * Math.pow(dev, p)
    }
    out[t] = Math.pow(acc, 1.0 / p)
  }
  return out
}

/**
 * Roll-off frequency: the minimum
 * frequency bin whose cumulative energy reaches roll_percent of the total.
 * @returns {Float64Array} rolloff frequency (Hz) per frame
 */
export function spectral_rolloff(y = null, options = {}) {
  const {
    sr = 22050,
    S = null,
    n_fft = 2048,
    hop_length = 512,
    win_length = null,
    window = 'hann',
    center = true,
    pad_mode = 'constant',
    freq = null,
    roll_percent = 0.85,
  } = options

  if (!(roll_percent > 0 && roll_percent < 1)) {
    throw new ParameterError('roll_percent must lie in the range (0, 1)')
  }

  const resolved = _spectrogram(y, S, {
    n_fft, hop_length, win_length, window, center, pad_mode, power: 1,
  })
  const spec = resolved.S
  validateSpectrogram(spec, 'Spectral rolloff')

  const freqs = freq != null ? freq : fft_frequencies(sr, resolved.n_fft)
  const nF = spec.length
  const nT = spec[0].length
  const out = new Float64Array(nT)
  for (let t = 0; t < nT; t++) {
    let total = 0
    for (let f = 0; f < nF; f++) total += spec[f][t]
    const threshold = roll_percent * total
    let cum = 0
    let roll = NaN
    for (let f = 0; f < nF; f++) {
      cum += spec[f][t]
      if (cum >= threshold) {
        roll = freqs[f]
        break
      }
    }
    out[t] = roll
  }
  return out
}

/**
 * Spectral flatness:
 * geometric mean / arithmetic mean of max(amin, S**power) per frame.
 * (Formula salvaged from xa-spectral.js — verified against fixtures —
 * re-hosted here with correct freq-major orientation.)
 * @returns {Float64Array} flatness in [0, 1] per frame
 */
export function spectral_flatness(y = null, options = {}) {
  const {
    S = null,
    n_fft = 2048,
    hop_length = 512,
    win_length = null,
    window = 'hann',
    center = true,
    pad_mode = 'constant',
    amin = 1e-10,
    power = 2.0,
  } = options

  if (!(amin > 0)) {
    throw new ParameterError('amin must be strictly positive')
  }

  const resolved = _spectrogram(y, S, {
    n_fft, hop_length, win_length, window, center, pad_mode, power: 1,
  })
  const spec = resolved.S
  validateSpectrogram(spec, 'Spectral flatness')

  const nF = spec.length
  const nT = spec[0].length
  const out = new Float64Array(nT)
  for (let t = 0; t < nT; t++) {
    let logSum = 0
    let sum = 0
    for (let f = 0; f < nF; f++) {
      const v = Math.max(amin, Math.pow(spec[f][t], power))
      logSum += Math.log(v)
      sum += v
    }
    const gmean = Math.exp(logSum / nF)
    const amean = sum / nF
    out[t] = gmean / amean
  }
  return out
}

/**
 * Spectral contrast.
 * Octave-band peak/valley contrast: mean of the top / bottom `quantile`
 * fraction of sorted magnitudes per band, then power_to_db difference.
 * @returns {Array<Float64Array>} [n_bands + 1][n_frames]
 */
export function spectral_contrast(y = null, options = {}) {
  const {
    sr = 22050,
    S = null,
    n_fft = 2048,
    hop_length = 512,
    win_length = null,
    window = 'hann',
    center = true,
    pad_mode = 'constant',
    freq = null,
    fmin = 200.0,
    n_bands = 6,
    quantile = 0.02,
    linear = false,
  } = options

  const resolved = _spectrogram(y, S, {
    n_fft, hop_length, win_length, window, center, pad_mode, power: 1,
  })
  const spec = resolved.S
  const freqs = freq != null ? freq : fft_frequencies(sr, resolved.n_fft)

  if (freqs.length !== spec.length) {
    throw new ParameterError(
      `freq.shape mismatch: expected (${spec.length},)`,
    )
  }
  if (!Number.isInteger(n_bands) || n_bands < 1) {
    throw new ParameterError('n_bands must be a positive integer')
  }
  if (!(quantile > 0 && quantile < 1)) {
    throw new ParameterError('quantile must lie in the range (0, 1)')
  }
  if (!(fmin > 0)) {
    throw new ParameterError('fmin must be a positive number')
  }

  // Octave band edges: [0, fmin, 2*fmin, ..., fmin * 2**n_bands]
  const octa = new Float64Array(n_bands + 2)
  for (let i = 1; i < n_bands + 2; i++) octa[i] = fmin * Math.pow(2, i - 1)
  for (let i = 0; i < n_bands + 1; i++) {
    if (octa[i] >= 0.5 * sr) {
      throw new ParameterError(
        'Frequency band exceeds Nyquist. Reduce either fmin or n_bands.',
      )
    }
  }

  const nF = spec.length
  const nT = spec[0].length
  const valley = []
  const peak = []
  for (let k = 0; k <= n_bands; k++) {
    valley.push(new Float64Array(nT))
    peak.push(new Float64Array(nT))
  }

  for (let k = 0; k <= n_bands; k++) {
    const fLow = octa[k]
    const fHigh = octa[k + 1]

    const current = new Array(nF).fill(false)
    let first = -1
    let last = -1
    for (let f = 0; f < nF; f++) {
      if (freqs[f] >= fLow && freqs[f] <= fHigh) {
        current[f] = true
        if (first < 0) first = f
        last = f
      }
    }
    if (first < 0) {
      throw new ParameterError(
        `spectral_contrast: no FFT bins in band [${fLow}, ${fHigh}] Hz`,
      )
    }
    // boundary adjustments
    if (k > 0 && first - 1 >= 0) current[first - 1] = true
    if (k === n_bands) {
      for (let f = last + 1; f < nF; f++) current[f] = true
    }

    const rowIdx = []
    for (let f = 0; f < nF; f++) if (current[f]) rowIdx.push(f)
    const bandCount = rowIdx.length
    // Drop the last (shared-edge) bin for all but the top band
    const subRows = k < n_bands ? rowIdx.slice(0, -1) : rowIdx

    // Always take at least one bin from each side
    const qidx = Math.max(rint(quantile * bandCount), 1)

    const col = new Float64Array(subRows.length)
    for (let t = 0; t < nT; t++) {
      for (let j = 0; j < subRows.length; j++) col[j] = spec[subRows[j]][t]
      col.sort()
      let vAcc = 0
      for (let j = 0; j < qidx; j++) vAcc += col[j]
      let pAcc = 0
      for (let j = col.length - qidx; j < col.length; j++) pAcc += col[j]
      valley[k][t] = vAcc / qidx
      peak[k][t] = pAcc / qidx
    }
  }

  const contrast = []
  if (linear) {
    for (let k = 0; k <= n_bands; k++) {
      const row = new Float64Array(nT)
      for (let t = 0; t < nT; t++) row[t] = peak[k][t] - valley[k][t]
      contrast.push(row)
    }
  } else {
    const peakDb = power_to_db(peak)
    const valleyDb = power_to_db(valley)
    for (let k = 0; k <= n_bands; k++) {
      const row = new Float64Array(nT)
      for (let t = 0; t < nT; t++) row[t] = peakDb[k][t] - valleyDb[k][t]
      contrast.push(row)
    }
  }
  return contrast
}

/**
 * Root-mean-square energy per frame.
 * y path: centered constant-padded framing (verified salvage of the
 * xa-spectral rms y-path — numerically exact on fixtures).
 * S path: Parseval-based power from a magnitude spectrogram.
 * @returns {Float64Array} RMS per frame
 */
export function rms(y = null, options = {}) {
  const {
    S = null,
    frame_length = 2048,
    hop_length = 512,
    center = true,
    pad_mode = 'constant',
  } = options

  if (y != null) {
    const sig = center
      ? padSignal(y, Math.floor(frame_length / 2), pad_mode)
      : y
    const nFrames = frameCount(sig.length, frame_length, hop_length)
    const out = new Float64Array(nFrames)
    for (let t = 0; t < nFrames; t++) {
      const base = t * hop_length
      let acc = 0
      for (let i = 0; i < frame_length; i++) {
        const v = sig[base + i]
        acc += v * v
      }
      out[t] = Math.sqrt(acc / frame_length)
    }
    return out
  }

  if (S != null) {
    if (!isVector(S) || S.length === 0 || !isVector(S[0])) {
      throw new ParameterError('rms: S must be a 2-D spectrogram')
    }
    const nF = S.length
    if (nF !== Math.floor(frame_length / 2) + 1) {
      throw new ParameterError(
        `Since S.shape[-2] is ${nF}, frame_length is expected to be ` +
          `${nF * 2 - 2} or ${nF * 2 - 1}; found ${frame_length}`,
      )
    }
    const nT = S[0].length
    const out = new Float64Array(nT)
    const evenNyquistHalf = frame_length % 2 === 0
    for (let t = 0; t < nT; t++) {
      let acc = 0
      for (let f = 0; f < nF; f++) {
        let x = S[f][t] * S[f][t]
        if (f === 0) x *= 0.5
        if (evenNyquistHalf && f === nF - 1) x *= 0.5
        acc += x
      }
      out[t] = Math.sqrt((2 * acc) / (frame_length * frame_length))
    }
    return out
  }

  throw new ParameterError('Either y or S must be input.')
}

/**
 * Frame-wise zero-crossing rate:
 * edge-padded centering, |v| <= threshold clipped to zero before the sign
 * test, first sample of each frame never counted (pad=False).
 * @returns {Float64Array} fraction of zero crossings per frame
 */
export function zero_crossing_rate(y, options = {}) {
  const {
    frame_length = 2048,
    hop_length = 512,
    center = true,
    threshold = 1e-10,
    zero_pos = true,
  } = options

  if (y == null || !isVector(y) || y.length === 0) {
    throw new ParameterError('zero_crossing_rate: invalid audio input')
  }

  const sig = center ? padSignal(y, Math.floor(frame_length / 2), 'edge') : y
  const nFrames = frameCount(sig.length, frame_length, hop_length)

  // Sign classification after threshold clipping:
  // zero_pos=true  -> signbit semantics (0 is positive): negative iff v < -threshold
  // zero_pos=false -> np.sign semantics: -1 / 0 / +1 distinct
  const signOf = (v) => {
    if (v >= -threshold && v <= threshold) return 0
    return v < 0 ? -1 : 1
  }

  const out = new Float64Array(nFrames)
  for (let t = 0; t < nFrames; t++) {
    const base = t * hop_length
    let count = 0
    let prev = signOf(sig[base])
    for (let i = 1; i < frame_length; i++) {
      const cur = signOf(sig[base + i])
      if (zero_pos ? prev < 0 !== cur < 0 : prev !== cur) count++
      prev = cur
    }
    out[t] = count / frame_length
  }
  return out
}
