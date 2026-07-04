/**
 * Pleco-XA decompose domain (Wave 5A).
 *
 * ONE canonical HPSS for the whole library (Fitzgerald 2010, Driedger 2014),
 * consolidating the previous xa-advanced.js / xa-processing.js duplicates.
 * Validated against committed reference fixtures
 * (default margin AND margin=2.0).
 */

// Pleco-unique vocal-separation flagship (multi-scale spectral
// fingerprinting → EQ-curve optimization → vocal reconstruction). Lives in
// its own module; re-exported here so consumers reach it as
// decompose.processAudioToFingerprints / optimizeEqCurves / reconstructVocal.
export {
  processAudioToFingerprints,
  optimizeEqCurves,
  reconstructVocal,
} from '../scripts/xa-vocal-separation.js'

import { recurrenceMatrix } from '../segment/index.js'

/** Resolve nn_filter's aggregate option to a (values, weights) reducer. @private */
function resolveAggregate(aggregate) {
  if (typeof aggregate === 'function') return aggregate
  if (aggregate === 'mean') {
    return (values) => {
      let s = 0
      for (let i = 0; i < values.length; i++) s += values[i]
      return s / values.length
    }
  }
  if (aggregate === 'median') {
    return (values) => {
      const sorted = Array.from(values).sort((a, b) => a - b)
      const n = sorted.length
      return n % 2 === 1 ? sorted[(n - 1) / 2] : (sorted[n / 2 - 1] + sorted[n / 2]) / 2
    }
  }
  if (aggregate === 'average') {
    // np.average branch: weighted by the recurrence-matrix values
    return (values, weights) => {
      let s = 0
      let w = 0
      for (let i = 0; i < values.length; i++) {
        s += values[i] * weights[i]
        w += weights[i]
      }
      if (w === 0) throw new Error("nn_filter: aggregate='average' with all-zero weights")
      return s / w
    }
  }
  throw new Error(
    `nn_filter: aggregate='${aggregate}' is not supported ` +
      `(supported: 'mean', 'median', 'average', or a (values, weights) => number function)`,
  )
}

/**
 * Nearest-neighbor filtering (nn_filter).
 *
 * Each frame (column) of S is replaced by aggregating its nearest neighbors
 * in feature space, as selected by recurrence-matrix
 * semantics: for output frame i the neighbor set is { j : rec[i][j] != 0 },
 * via a CSR-row walk in __nn_filter_helper (frames with an empty
 * neighbor set pass through unchanged). aggregate='median' with a cosine
 * metric and a width-in-frames exclusion band is the REPET-SIM configuration
 * (Rafii & Pardo 2012), the standard vocal-separation configuration.
 *
 * The recurrence graph itself comes from segment.recurrenceMatrix (Wave-5
 * fixture-gated); this function adds only the neighbor-aggregation walk.
 * NOTE: no direct fixture for the composition yet — behavior is
 * proven against planted-repetition structure in
 * examples/web/plot-vocal-separation.html (node-spot-run first).
 *
 * @param {Array<ArrayLike<number>>} S - Feature matrix [features][frames]
 * @param {Object} [options]
 * @param {Array<ArrayLike<number>>|null} [options.rec=null] - Precomputed
 *   recurrence matrix [frames][frames]; computed from S
 *   via recurrenceMatrix when null.
 * @param {string|Function} [options.aggregate='mean'] - 'mean' | 'median' |
 *   'average' (weighted by rec values) | custom (values, weights) => number.
 * @param {...*} [options.rest] - Remaining options (metric, width, k, sym,
 *   mode, bandwidth, self, full) forward to recurrenceMatrix.
 * @returns {Float64Array[]} Filtered matrix, same shape as S
 * @throws {Error} On empty input, bad rec shape, or unknown aggregate
 */
export function nn_filter(S, options = {}) {
  const { rec = null, aggregate = 'mean', ...recOptions } = options
  if (!S || S.length === 0 || !S[0] || S[0].length === 0) {
    throw new Error('nn_filter: input matrix must be non-empty')
  }
  const nFeat = S.length
  const nFrames = S[0].length

  const R = rec === null ? recurrenceMatrix(S, recOptions) : rec
  if (R.length !== nFrames || !R[0] || R[0].length !== nFrames) {
    throw new Error(
      `nn_filter: invalid self-similarity matrix shape ${R.length}x${R[0]?.length} ` +
        `for S ${nFeat}x${nFrames}`,
    )
  }

  const aggFn = resolveAggregate(aggregate)
  const out = Array.from({ length: nFeat }, () => new Float64Array(nFrames))

  for (let i = 0; i < nFrames; i++) {
    const ri = R[i]
    const targets = []
    for (let j = 0; j < nFrames; j++) {
      if (ri[j] !== 0) targets.push(j)
    }

    if (targets.length === 0) {
      // Frames with no neighbors pass through unchanged
      for (let f = 0; f < nFeat; f++) out[f][i] = S[f][i]
      continue
    }

    const weights = targets.map((j) => ri[j])
    const values = new Float64Array(targets.length)
    for (let f = 0; f < nFeat; f++) {
      const row = S[f]
      for (let t = 0; t < targets.length; t++) values[t] = row[targets[t]]
      out[f][i] = aggFn(values, weights)
    }
  }

  return out
}

/** Smallest usable float32 (np.finfo(np.float32).tiny) — softmask computes in
 *  float32, so the underflow threshold must match that dtype. */
const FLOAT32_TINY = 1.1754943508222875e-38

/**
 * Reflect an out-of-range index back into [0, n) using scipy.ndimage's
 * mode='reflect' convention (edge sample IS repeated: d c b a | a b c d).
 * @param {number} j - Possibly out-of-range index
 * @param {number} n - Axis length
 * @returns {number} In-range index
 */
function reflectIndex(j, n) {
  if (n === 1) return 0
  const period = 2 * n
  j = ((j % period) + period) % period
  return j < n ? j : period - 1 - j
}

/**
 * 1D median filter with scipy 'reflect' boundaries.
 * Matches scipy.ndimage.median_filter (rank = floor(size/2), origin 0).
 * @param {ArrayLike<number>} row - Input values
 * @param {number} size - Kernel size
 * @param {Float64Array} out - Output buffer (row.length)
 * @param {Float64Array} scratch - Scratch buffer (size)
 */
function medianFilter1dReflect(row, size, out, scratch) {
  const n = row.length
  const left = size >> 1
  const rank = size >> 1
  for (let i = 0; i < n; i++) {
    for (let w = 0; w < size; w++) {
      scratch[w] = row[reflectIndex(i - left + w, n)]
    }
    scratch.sort()
    out[i] = scratch[rank]
  }
}

/**
 * Robust soft mask: M = X^power / (X^power + X_ref^power), computed with
 * a rescale-by-max stabilization.
 *
 * @param {Array<ArrayLike<number>>} X - Non-negative 2D array [rows][cols]
 * @param {Array<ArrayLike<number>>} X_ref - Reference array, same shape
 * @param {Object} [options]
 * @param {number} [options.power=1] - Mask exponent; Infinity gives a hard mask (X > X_ref)
 * @param {boolean} [options.split_zeros=false] - Give 0.5 (instead of 0) where both inputs underflow
 * @returns {Float64Array[]} Mask, same shape as X
 * @throws {Error} On shape mismatch, negative input, or power <= 0
 */
export function softmask(X, X_ref, { power = 1, split_zeros = false } = {}) {
  if (X.length !== X_ref.length || (X[0] && X_ref[0] && X[0].length !== X_ref[0].length)) {
    throw new Error(`softmask: shape mismatch ${X.length}x${X[0]?.length} != ${X_ref.length}x${X_ref[0]?.length}`)
  }
  if (!(power > 0)) {
    throw new Error('softmask: power must be strictly positive')
  }

  const nRows = X.length
  const mask = new Array(nRows)
  for (let i = 0; i < nRows; i++) {
    const xi = X[i]
    const ri = X_ref[i]
    const nCols = xi.length
    const mi = new Float64Array(nCols)
    for (let j = 0; j < nCols; j++) {
      const x = xi[j]
      const r = ri[j]
      if (x < 0 || r < 0) {
        throw new Error('softmask: X and X_ref must be non-negative')
      }
      if (power === Infinity) {
        mi[j] = x > r ? 1 : 0
        continue
      }
      const z = Math.max(x, r)
      if (z < FLOAT32_TINY) {
        mi[j] = split_zeros ? 0.5 : 0.0
      } else {
        const m = Math.pow(x / z, power)
        const mr = Math.pow(r / z, power)
        mi[j] = m / (m + mr)
      }
    }
    mask[i] = mi
  }
  return mask
}

/** @returns {boolean} True when S holds {real, imag} bins rather than magnitudes. */
function isComplexSpectrogram(S) {
  const first = S[0] && S[0][0]
  return typeof first === 'object' && first !== null
}

/**
 * Median-filtering harmonic/percussive source separation on a spectrogram.
 * Default behavior:
 * the default (mask=false) return is the MASKED components S*mask_H / S*mask_P,
 * so harmonic + percussive ≈ S at margin=1 — NOT the raw median-filtered
 * spectrograms the legacy pleco copies returned.
 *
 * @param {Array<ArrayLike<number>>|Array<Array<{real:number,imag:number}>>} S
 *   Spectrogram [freq][time]; magnitude rows (typed arrays welcome) or
 *   complex {real, imag} bins (phase is reapplied to the output).
 * @param {Object} [options]
 * @param {number|Array<number>} [options.kernel_size=31] - Median kernel; scalar or [harmonic, percussive]
 * @param {number} [options.power=2.0] - Soft-mask exponent (Infinity → hard mask)
 * @param {boolean} [options.mask=false] - Return the masks themselves instead of components
 * @param {number|Array<number>} [options.margin=1.0] - Mask margin(s) >= 1; scalar or [harmonic, percussive]
 * @returns {{harmonic: Array, percussive: Array}} Components (or masks), same layout as S
 * @throws {Error} On empty input or margin < 1
 */
export function hpss(S, { kernel_size = 31, power = 2.0, mask = false, margin = 1.0 } = {}) {
  if (!S || S.length === 0 || !S[0] || S[0].length === 0) {
    throw new Error('hpss: spectrogram must be non-empty')
  }

  const complex = isComplexSpectrogram(S)
  const nFreq = S.length
  const nTime = S[0].length

  // Magnitude view (S, phase = magphase(S) for complex input)
  const mag = new Array(nFreq)
  for (let f = 0; f < nFreq; f++) {
    const row = new Float64Array(nTime)
    const src = S[f]
    if (complex) {
      for (let t = 0; t < nTime; t++) row[t] = Math.hypot(src[t].real, src[t].imag)
    } else {
      for (let t = 0; t < nTime; t++) row[t] = src[t]
    }
    mag[f] = row
  }

  const [winHarm, winPerc] = Array.isArray(kernel_size)
    ? [kernel_size[0], kernel_size[1]]
    : [kernel_size, kernel_size]
  const [marginHarm, marginPerc] = Array.isArray(margin)
    ? [margin[0], margin[1]]
    : [margin, margin]

  if (marginHarm < 1 || marginPerc < 1) {
    throw new Error('hpss: margins must be >= 1.0 (typical range 1–10)')
  }

  // Harmonic: median along time (each frequency row)
  const harm = new Array(nFreq)
  {
    const scratch = new Float64Array(winHarm)
    for (let f = 0; f < nFreq; f++) {
      const out = new Float64Array(nTime)
      medianFilter1dReflect(mag[f], winHarm, out, scratch)
      harm[f] = out
    }
  }

  // Percussive: median along frequency (each time column)
  const perc = new Array(nFreq)
  for (let f = 0; f < nFreq; f++) perc[f] = new Float64Array(nTime)
  {
    const scratch = new Float64Array(winPerc)
    const column = new Float64Array(nFreq)
    const filtered = new Float64Array(nFreq)
    for (let t = 0; t < nTime; t++) {
      for (let f = 0; f < nFreq; f++) column[f] = mag[f][t]
      medianFilter1dReflect(column, winPerc, filtered, scratch)
      for (let f = 0; f < nFreq; f++) perc[f][t] = filtered[f]
    }
  }

  const splitZeros = marginHarm === 1 && marginPerc === 1

  // Scale the reference by margin before masking (Driedger 2014)
  const percScaled = marginHarm === 1 ? perc : perc.map((row) => row.map((v) => v * marginHarm))
  const harmScaled = marginPerc === 1 ? harm : harm.map((row) => row.map((v) => v * marginPerc))

  const maskHarm = softmask(harm, percScaled, { power, split_zeros: splitZeros })
  const maskPerc = softmask(perc, harmScaled, { power, split_zeros: splitZeros })

  if (mask) {
    return { harmonic: maskHarm, percussive: maskPerc }
  }

  // Components: (S * mask) * phase — multiply the ORIGINAL entries by the mask
  const harmonic = new Array(nFreq)
  const percussive = new Array(nFreq)
  for (let f = 0; f < nFreq; f++) {
    if (complex) {
      const hRow = new Array(nTime)
      const pRow = new Array(nTime)
      for (let t = 0; t < nTime; t++) {
        const bin = S[f][t]
        hRow[t] = { real: bin.real * maskHarm[f][t], imag: bin.imag * maskHarm[f][t] }
        pRow[t] = { real: bin.real * maskPerc[f][t], imag: bin.imag * maskPerc[f][t] }
      }
      harmonic[f] = hRow
      percussive[f] = pRow
    } else {
      const hRow = new Float64Array(nTime)
      const pRow = new Float64Array(nTime)
      for (let t = 0; t < nTime; t++) {
        hRow[t] = mag[f][t] * maskHarm[f][t]
        pRow[t] = mag[f][t] * maskPerc[f][t]
      }
      harmonic[f] = hRow
      percussive[f] = pRow
    }
  }

  return { harmonic, percussive }
}
