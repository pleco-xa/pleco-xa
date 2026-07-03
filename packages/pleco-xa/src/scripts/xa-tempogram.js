/**
 * Local autocorrelation tempogram over an onset-strength envelope, plus the
 * Fourier tempogram and a prior-weighted tempo estimator.
 *
 * Tier-3 proof-of-work repairs (2026-07-02):
 *   1. tempogram(): linear_ramp padding (was zero-pad), full win_length lag
 *      rows (was win_length/2+1), per-column inf-norm with the float64-tiny
 *      guard — exactly the math the fixture-gated canonical tempo() consumes
 *      (xa-beat-tracker.js meanTempogram now DELEGATES here, so the
 *      fixture tempo_beats.json gates this module too).
 *   2. fourier_tempogram(): STFT of the onset envelope at hop_length=1
 *      (the previous code passed the audio hop_length,
 *      collapsing a 431-frame envelope to a single column).
 *   3. estimate_tempo(): pseudo-log-normal tempo prior
 *      (start_bpm=120, std_bpm=1.0 in log2 space) + max_tempo mask over the
 *      time-mean tempogram (the previous raw argmax returned the 60 BPM
 *      subharmonic on a plain 120 BPM click train).
 *   4. The private simplified onset_strength duplicate is gone — the
 *      canonical onset_strength from ./xa-onset.js is used instead.
 *   5. tempogram_ratio(): samples the tempogram at the Prockup'15 metric
 *      ratios of the per-frame tempo. It does NOT delegate to the exported
 *      xa-harmonic.f0_harmonics: that helper brackets the frequency grid
 *      ascending-in-place and mishandles the +Inf head, so it returns
 *      all-zeros on the descending tempo axis (verified); a dedicated
 *      static-grid interpolator lives here instead.
 *      Gated by tools/parity/fixtures/tempogram_ratio.json.
 *
 * Proof: examples/node/tempogram-ratio.mjs (tempogram_ratio),
 *        examples/web/xa-tempogram.html (tempogram heatmap + ridge).
 */

import { stft } from './xa-fft.js'
import { onset_strength } from './xa-onset.js'

// np.finfo(np.float64).tiny — threshold used by util.normalize on the
// (float64) tempogram columns.
const FLOAT64_TINY = 2.2250738585072014e-308

/* ------------------------------------------------------------------------ *
 * numpy-faithful helpers (shared with xa-beat-tracker via tempogram())
 * ------------------------------------------------------------------------ */

/**
 * Periodic Hann window: scipy.signal.get_window('hann', n, fftbins=True).
 * @private
 */
function hannPeriodic(n) {
  const w = new Float64Array(n)
  for (let i = 0; i < n; i++) {
    w[i] = 0.5 - 0.5 * Math.cos((2 * Math.PI * i) / n)
  }
  return w
}

/**
 * Full (unbounded) autocorrelation of a real signal:
 * ac[lag] = sum_i x[i] * x[i + lag]. Direct O(n^2) evaluation — numerically
 * identical to an FFT-based autocorrelation up to float roundoff.
 * @private
 */
function autocorrelate(x) {
  const n = x.length
  const ac = new Float64Array(n)
  for (let lag = 0; lag < n; lag++) {
    let sum = 0
    for (let i = 0; i < n - lag; i++) {
      sum += x[i] * x[i + lag]
    }
    ac[lag] = sum
  }
  return ac
}

/**
 * BPM value of each autocorrelation lag.
 * Bin 0 is +Infinity (lag 0).
 * @private
 */
function tempoFrequencies(nBins, hopLength, sr) {
  const bpms = new Float64Array(nBins)
  bpms[0] = Infinity
  for (let k = 1; k < nBins; k++) {
    bpms[k] = (60.0 * sr) / (hopLength * k)
  }
  return bpms
}

/* ------------------------------------------------------------------------ *
 * tempogram — local autocorrelation tempogram
 * ------------------------------------------------------------------------ */

/**
 * Local autocorrelation tempogram of the onset strength envelope.
 *
 * Legacy positional signature preserved.
 *
 * @param {Float32Array|Array|null} y - audio time series (optional if
 *   onset_envelope provided)
 * @param {number} sr - sample rate
 * @param {Float32Array|Array|null} onset_envelope - pre-computed
 *   onset strength envelope
 * @param {number} hop_length - hop length used for the onset envelope
 * @param {number} win_length - autocorrelation window in frames
 * @param {boolean} center - center the analysis windows (linear_ramp pad)
 * @param {string} window - window function ('hann' only)
 * @param {number|null} norm - Infinity for per-column max-normalization
 *   (default), null for raw autocorrelation
 * @returns {Array<Float64Array>} tempogram [win_length][n_frames] — row k is
 *   lag k; convert with convert.tempo_frequencies(win_length, hop_length, sr)
 * @throws {Error} on invalid parameters or an envelope shorter than one
 *   analysis window — never returns a fabricated result
 */
export function tempogram(
  y = null,
  sr = 22050,
  onset_envelope = null,
  hop_length = 512,
  win_length = 384,
  center = true,
  window = 'hann',
  norm = Infinity,
) {
  if (!Number.isInteger(win_length) || win_length < 1) {
    throw new Error(`win_length=${win_length} must be a positive integer`)
  }
  if (window !== 'hann') {
    throw new Error(
      `tempogram: window='${window}' is not supported (periodic hann only)`,
    )
  }
  if (norm !== Infinity && norm !== null) {
    throw new Error('tempogram: norm must be Infinity (default) or null')
  }

  let oenv = onset_envelope
  if (oenv === null) {
    if (y === null) {
      throw new Error('Either y or onset_envelope must be provided')
    }
    oenv = onset_strength(y, { sr, hop_length })
  }

  const n = oenv.length

  // np.pad(..., mode='linear_ramp', end_values=[0, 0]) when centering
  const half = Math.floor(win_length / 2)
  let padded
  if (center) {
    padded = new Float64Array(n + 2 * half)
    const first = oenv[0]
    const last = oenv[n - 1]
    for (let j = 0; j < half; j++) {
      padded[j] = (first * j) / half
      padded[half + n + j] = (last * (half - 1 - j)) / half
    }
    for (let i = 0; i < n; i++) {
      padded[half + i] = oenv[i]
    }
  } else {
    padded = Float64Array.from(oenv)
  }

  // Frame the padded envelope at hop 1, then trim to n columns
  const nCols = center
    ? Math.min(n, padded.length - win_length + 1)
    : padded.length - win_length + 1
  if (nCols < 1) {
    throw new Error(
      `onset envelope too short (${n} frames) for tempogram win_length=${win_length}`,
    )
  }

  const win = hannPeriodic(win_length)
  const tg = Array(win_length)
    .fill(null)
    .map(() => new Float64Array(nCols))

  const frame = new Float64Array(win_length)
  for (let t = 0; t < nCols; t++) {
    for (let k = 0; k < win_length; k++) {
      frame[k] = padded[t + k] * win[k]
    }
    const ac = autocorrelate(frame)

    if (norm === Infinity) {
      // util.normalize(..., norm=np.inf, axis=-2): divide by max |value|,
      // leaving all-(near-)zero columns unnormalized (fill=None semantics).
      let maxAbs = 0
      for (let k = 0; k < win_length; k++) {
        const a = Math.abs(ac[k])
        if (a > maxAbs) maxAbs = a
      }
      const scale = maxAbs < FLOAT64_TINY ? 1 : maxAbs
      for (let k = 0; k < win_length; k++) {
        tg[k][t] = ac[k] / scale
      }
    } else {
      for (let k = 0; k < win_length; k++) {
        tg[k][t] = ac[k]
      }
    }
  }

  return tg
}

/* ------------------------------------------------------------------------ *
 * fourier_tempogram — Fourier tempogram
 * ------------------------------------------------------------------------ */

/**
 * Fourier tempogram: STFT of the onset strength envelope at hop 1:
 *   stft(onset_envelope, n_fft=win_length, hop_length=1, center, window)
 *
 * DIVERGENCE NOTE: pleco's radix-2 stft zero-pads non-power-of-2 FFT sizes,
 * which would silently regrid the tempo axis — so win_length must be a power
 * of two here (default 512; the tempo axis is
 * convert.fourier_tempo_frequencies(sr, win_length, hop_length)).
 *
 * @param {Float32Array|Array|null} y - audio time series (optional if
 *   onset_envelope provided)
 * @param {number} sr - sample rate
 * @param {Float32Array|Array|null} onset_envelope - pre-computed envelope
 * @param {number} hop_length - hop length used for the onset envelope
 * @param {number} win_length - STFT window in envelope frames (power of 2)
 * @param {boolean} center - center the STFT windows
 * @param {string} window - window function type
 * @returns {Array<Array<{real:number, imag:number}>>} complex Fourier
 *   tempogram [win_length/2 + 1][n_envelope_frames + 1] (center=true)
 * @throws {Error} if win_length is not a power of two
 */
export function fourier_tempogram(
  y = null,
  sr = 22050,
  onset_envelope = null,
  hop_length = 512,
  win_length = 512,
  center = true,
  window = 'hann',
) {
  if (!Number.isInteger(win_length) || win_length < 2 || (win_length & (win_length - 1)) !== 0) {
    throw new Error(
      `fourier_tempogram: win_length=${win_length} must be a power of two ` +
        '(pleco stft is radix-2; a non-power-of-2 size would silently regrid the tempo axis)',
    )
  }

  let oenv = onset_envelope
  if (oenv === null) {
    if (y === null) {
      throw new Error('Either y or onset_envelope must be provided')
    }
    oenv = onset_strength(y, { sr, hop_length })
  }

  // stft(oenv, n_fft=win_length, hop_length=1, ...)
  return stft(
    oenv instanceof Float32Array ? oenv : Float32Array.from(oenv),
    win_length,
    1,
    null,
    window,
    center,
    'constant',
  )
}

/* ------------------------------------------------------------------------ *
 * tempogram_ratio — tempogram ratio features
 * ------------------------------------------------------------------------ */

/**
 * Default metric multiples from Prockup'15. If the
 * estimated tempo is the quarter note, these sample the tempogram at the
 * sixteenth (4), dotted-16th (8/3), 8th-triplet (3), 8th (2), dotted-8th
 * (4/3), quarter-triplet (3/2), quarter (1), dotted-quarter (2/3),
 * half-triplet (3/4), half (1/2), dotted-half (1/3), whole-triplet (3/8) and
 * whole (1/4) periods.
 */
const TEMPOGRAM_RATIO_FACTORS = Object.freeze([
  4, 8 / 3, 3, 2, 4 / 3, 3 / 2, 1, 2 / 3, 3 / 4, 1 / 2, 1 / 3, 3 / 8, 1 / 4,
])

/**
 * Per-frame tempo argmax (tempo with tg=..., aggregate=None).
 * Scores each tempogram COLUMN with the pseudo-log-normal prior and returns
 * one BPM per frame. win_length is inferred from the tempogram (bpms use
 * n_lags bins, NOT the ac_size-derived length) when
 * a precomputed tg is passed — so this must NOT delegate to the ac_size-based
 * tempo() in xa-beat-tracker.js.
 * @private
 * @param {Array<Float64Array|Array>} tg - tempogram [n_lags][n_frames]
 * @param {Float64Array} bpms - tempo_frequencies(n_lags, hop, sr)
 * @param {number} start_bpm
 * @param {number} std_bpm
 * @param {number|null} max_tempo
 * @returns {Float64Array} per-frame BPM, length n_frames
 */
function perFrameTempo(tg, bpms, start_bpm, std_bpm, max_tempo) {
  const nLags = tg.length
  const nFrames = tg[0].length
  const log2Start = Math.log2(start_bpm)

  const logprior = new Float64Array(nLags)
  for (let k = 0; k < nLags; k++) {
    const d = (Math.log2(bpms[k]) - log2Start) / std_bpm
    logprior[k] = -0.5 * d * d
  }
  // Kill everything at/above max_tempo (mask [:argmax(bpms < max)]).
  if (max_tempo !== null && max_tempo !== undefined) {
    let maxIdx = 0
    while (maxIdx < nLags && !(bpms[maxIdx] < max_tempo)) maxIdx++
    for (let k = 0; k < maxIdx; k++) logprior[k] = -Infinity
  }

  const out = new Float64Array(nFrames)
  for (let t = 0; t < nFrames; t++) {
    let best = 0
    let bestScore = -Infinity
    for (let k = 0; k < nLags; k++) {
      // log1p(1e6 * tg) + logprior; np.argmax keeps the FIRST maximum.
      const score = Math.log1p(1e6 * tg[k][t]) + logprior[k]
      if (score > bestScore) {
        bestScore = score
        best = k
      }
    }
    out[t] = bpms[best]
  }
  return out
}

/**
 * f0_harmonics implementation for the 1-D static
 * frequency-grid branch (the only branch tempogram_ratio needs).
 *
 * WHY NOT the exported f0_harmonics: the tempo axis is DESCENDING with a
 * non-finite head (tempo_frequencies bin 0 = +Infinity). The correct approach
 * drops the non-finite bins (`idx = np.isfinite(freqs)`) and interp1d(
 * assume_sorted=False) sorts the remainder ascending. pleco's
 * xa-harmonic.f0_harmonics instead brackets the grid in place (ascending-only)
 * and treats the +Inf head via `target < freqs[0]` — so on this grid it
 * returns fill_value for EVERY target (verified: all-zero output). It is
 * correct only for the ascending, finite fft-frequency grids its own demos
 * use. The full recipe here (filter finite → sort ascending → linear interp →
 * fill_value out of bounds → nan_to_num) is what makes the fixture pass.
 * @private
 * @param {Array<Float64Array|Array>} tg - [n_lags][n_frames]
 * @param {Float64Array|Array} freqs - BPM per lag bin (len n_lags)
 * @param {Float64Array|Array} bpm - per-frame f0 (len n_frames)
 * @param {Array<number>} factors - harmonic multiples of bpm
 * @param {number} fill_value - out-of-range / NaN fill
 * @returns {Array<Float64Array>} [factors.length][n_frames]
 */
function f0HarmonicsStatic(tg, freqs, bpm, factors, fill_value) {
  const nLags = tg.length
  const nFrames = tg[0].length
  const nH = factors.length

  // idx = np.isfinite(freqs), then interp1d(assume_sorted=False) sorts ascending.
  const finite = []
  for (let k = 0; k < nLags; k++) {
    if (Number.isFinite(freqs[k])) finite.push(k)
  }
  finite.sort((a, b) => freqs[a] - freqs[b])
  const gridF = new Float64Array(finite.length)
  for (let i = 0; i < finite.length; i++) gridF[i] = freqs[finite[i]]
  const nG = gridF.length
  if (nG < 2) {
    throw new Error(
      'tempogram_ratio: fewer than 2 finite tempo frequencies — cannot interpolate',
    )
  }

  const out = Array.from({ length: nH }, () => new Float64Array(nFrames))
  const col = new Float64Array(nG)

  for (let t = 0; t < nFrames; t++) {
    const f0 = bpm[t]
    // f0 <= 0 or non-finite: every harmonic target is invalid -> fill_value.
    const validF0 = Number.isFinite(f0) && f0 > 0
    if (validF0) {
      for (let i = 0; i < nG; i++) col[i] = tg[finite[i]][t]
    }
    for (let h = 0; h < nH; h++) {
      let v = fill_value
      if (validF0) {
        const target = f0 * factors[h]
        if (target >= gridF[0] && target <= gridF[nG - 1]) {
          // Binary-search the bracket [lo, hi] with gridF[lo] <= target <= gridF[hi].
          let lo = 0
          let hi = nG - 1
          while (hi - lo > 1) {
            const mid = (lo + hi) >> 1
            if (gridF[mid] <= target) lo = mid
            else hi = mid
          }
          if (gridF[lo] === target) v = col[lo]
          else if (gridF[hi] === target) v = col[hi]
          else {
            const w = (target - gridF[lo]) / (gridF[hi] - gridF[lo])
            v = (1 - w) * col[lo] + w * col[hi]
          }
        }
      }
      // np.nan_to_num(result, nan=fill_value)
      if (Number.isNaN(v)) v = fill_value
      out[h][t] = v
    }
  }
  return out
}

/**
 * Tempogram ratio features (a.k.a. spectral rhythm patterns).
 * Summarizes tempogram energy at
 * metrically important multiples of the estimated tempo by sampling the
 * tempogram at harmonic/subharmonic ratios of the per-frame BPM:
 *
 *   tg   = tempogram(...)                              # [win_length][n]
 *   freqs= tempo_frequencies(n_bins=win_length, ...)   # BPM per lag bin
 *   bpm  = tempo(tg=tg, aggregate=None, ...)           # per-frame BPM
 *   tgr  = f0_harmonics(tg, freqs=freqs, f0=bpm, harmonics=factors)
 *
 * Options use a keyword-only signature.
 *
 * @param {Object} [options]
 * @param {Float32Array|Array|null} [options.y] - audio time series (used only
 *   when neither tg nor onset_envelope is supplied)
 * @param {number} [options.sr=22050] - sample rate
 * @param {Float32Array|Array|null} [options.onset_envelope] - pre-computed
 *   onset strength envelope
 * @param {Array<Float64Array|Array>|null} [options.tg] - pre-computed
 *   tempogram [n_lags][n_frames]; if given, y/onset_envelope are ignored and
 *   win_length is inferred from n_lags
 * @param {Float64Array|Array|null} [options.bpm] - pre-computed per-frame
 *   tempo (length n_frames); estimated from tg when null
 * @param {number} [options.hop_length=512]
 * @param {number} [options.win_length=384] - tempogram autocorrelation window
 * @param {number} [options.start_bpm=120] - center of the log-normal prior
 * @param {number} [options.std_bpm=1.0] - prior std (log2 space)
 * @param {number|null} [options.max_tempo=320.0] - mask tempi at/above this
 * @param {Float64Array|Array|null} [options.freqs] - BPM per tempogram lag
 *   bin; defaults to tempo_frequencies(n_lags, hop_length, sr)
 * @param {Array<number>|null} [options.factors] - tempo multiples to sample;
 *   defaults to the Prockup'15 13-factor table
 * @param {Function|null} [options.aggregate] - if given, called on each
 *   harmonic's per-frame Float64Array to collapse the time axis
 *   (aggregate(tgr, axis=-1)); null keeps the per-frame matrix
 * @param {boolean} [options.center=true] - center tempogram windows
 * @param {string} [options.window='hann'] - tempogram window
 * @param {string} [options.kind='linear'] - interpolation kind (only 'linear'
 *   is validated to parity; others throw rather than silently approximate)
 * @param {number} [options.fill_value=0] - value for out-of-range harmonics
 * @param {number|null} [options.norm=Infinity] - tempogram normalization
 * @returns {Array<Float64Array>|Float64Array} tempogram ratio
 *   [n_factors][n_frames], or [n_factors] when aggregate is provided
 * @throws {Error} on invalid parameters or shape mismatches — never fabricates
 */
export function tempogram_ratio(options = {}) {
  const {
    y = null,
    sr = 22050,
    onset_envelope = null,
    tg = null,
    bpm = null,
    hop_length = 512,
    win_length = 384,
    start_bpm = 120,
    std_bpm = 1.0,
    max_tempo = 320.0,
    freqs = null,
    factors = null,
    aggregate = null,
    center = true,
    window = 'hann',
    kind = 'linear',
    fill_value = 0,
    norm = Infinity,
  } = options

  if (typeof sr !== 'number' || !Number.isFinite(sr) || sr <= 0) {
    throw new Error(`tempogram_ratio: sr=${sr} must be a positive finite number`)
  }
  if (!Number.isInteger(hop_length) || hop_length <= 0) {
    throw new Error(`tempogram_ratio: hop_length=${hop_length} must be a positive integer`)
  }
  if (!(start_bpm > 0)) {
    throw new Error('tempogram_ratio: start_bpm must be strictly positive')
  }
  if (!(std_bpm > 0)) {
    throw new Error('tempogram_ratio: std_bpm must be strictly positive')
  }
  if (kind !== 'linear') {
    throw new Error(
      `tempogram_ratio: kind='${kind}' is not supported — only 'linear' is ` +
        'validated (scipy interp1d default)',
    )
  }
  if (aggregate !== null && typeof aggregate !== 'function') {
    throw new Error('tempogram_ratio: aggregate must be null or a function')
  }

  // Tempogram: use the caller's, else compute the canonical one.
  let tgram = tg
  if (tgram === null) {
    tgram = tempogram(
      y, sr, onset_envelope, hop_length, win_length, center, window, norm,
    )
  } else {
    if (!Array.isArray(tgram) || tgram.length < 2 || !tgram[0] || tgram[0].length < 1) {
      throw new Error('tempogram_ratio: tg must be a [n_lags>=2][n_frames>=1] matrix')
    }
  }
  const nLags = tgram.length
  const nFrames = tgram[0].length

  // Frequencies (BPM) of the tempogram lag axis.
  const grid = freqs === null ? tempoFrequencies(nLags, hop_length, sr) : freqs
  if (grid.length !== nLags) {
    throw new Error(
      `tempogram_ratio: freqs length ${grid.length} must match tempogram lag count ${nLags}`,
    )
  }

  // Per-frame tempo (tempo(tg=tg, aggregate=None) — bpms use nLags).
  let bpmCurve = bpm
  if (bpmCurve === null) {
    const bpms = tempoFrequencies(nLags, hop_length, sr)
    bpmCurve = perFrameTempo(tgram, bpms, start_bpm, std_bpm, max_tempo)
  } else if (bpmCurve.length !== nFrames) {
    throw new Error(
      `tempogram_ratio: bpm length ${bpmCurve.length} must match tempogram frame count ${nFrames}`,
    )
  }

  const factorTable = factors === null ? TEMPOGRAM_RATIO_FACTORS : factors
  if (!factorTable || factorTable.length < 1) {
    throw new Error('tempogram_ratio: factors must be a non-empty list')
  }

  const tgr = f0HarmonicsStatic(tgram, grid, bpmCurve, factorTable, fill_value)

  if (aggregate !== null) {
    // aggregate(tgr, axis=-1) — collapse the trailing time axis.
    const agg = new Float64Array(factorTable.length)
    for (let h = 0; h < factorTable.length; h++) {
      agg[h] = aggregate(tgr[h])
    }
    return agg
  }

  return tgr
}

/* ------------------------------------------------------------------------ *
 * estimate_tempo — prior-weighted tempo from a tempogram
 * ------------------------------------------------------------------------ */

/**
 * Estimate the global tempo from a (lag) tempogram using tempo scoring:
 * time-mean of the tempogram, pseudo-log-normal prior
 *   logprior = -0.5 * ((log2(bpm) - log2(start_bpm)) / std_bpm)^2
 * and argmax of log1p(1e6 * mean) + logprior with tempi at/above max_tempo
 * masked out. (The previous raw argmax had no prior and returned the 60 BPM
 * subharmonic on a plain 120 BPM click train.)
 *
 * @param {Array<Float64Array|Float32Array|Array>} tgram - tempogram
 *   [n_lags][n_frames] as returned by tempogram()
 * @param {number} sr - sample rate
 * @param {number} hop_length - hop length used for the onset envelope
 * @param {number} start_bpm - center of the log-normal prior
 * @param {number} std_bpm - prior standard deviation (log2 space)
 * @param {number|null} max_tempo - mask tempi at/above this value
 * @returns {{tempo: number, strength: number}} tempo in BPM and the measured
 *   mean-tempogram value at the chosen lag (never a fabricated confidence)
 * @throws {Error} on empty input or when every lag is masked
 */
export function estimate_tempo(
  tgram,
  sr = 22050,
  hop_length = 512,
  start_bpm = 120,
  std_bpm = 1.0,
  max_tempo = 320.0,
) {
  const n_lags = tgram.length
  const n_frames = tgram[0] ? tgram[0].length : 0
  if (n_lags < 2 || n_frames < 1) {
    throw new Error('estimate_tempo: tempogram must be [n_lags>=2][n_frames>=1]')
  }
  if (!(start_bpm > 0) || !(std_bpm > 0)) {
    throw new Error('estimate_tempo: start_bpm and std_bpm must be positive')
  }

  // Time-mean tempogram (aggregate=np.mean)
  const mean = new Float64Array(n_lags)
  for (let k = 0; k < n_lags; k++) {
    let sum = 0
    for (let t = 0; t < n_frames; t++) sum += tgram[k][t]
    mean[k] = sum / n_frames
  }

  const bpms = tempoFrequencies(n_lags, hop_length, sr)
  const log2Start = Math.log2(start_bpm)

  let best = -1
  let bestScore = -Infinity
  for (let k = 0; k < n_lags; k++) {
    if (max_tempo !== null && max_tempo !== undefined && !(bpms[k] < max_tempo)) {
      continue
    }
    const d = (Math.log2(bpms[k]) - log2Start) / std_bpm
    const score = Math.log1p(1e6 * mean[k]) - 0.5 * d * d
    if (score > bestScore) {
      bestScore = score
      best = k
    }
  }

  if (best < 0) {
    throw new Error(
      `estimate_tempo: no lag bin below max_tempo=${max_tempo} — ` +
        'tempogram too short for the requested tempo range',
    )
  }

  return { tempo: bpms[best], strength: mean[best] }
}
