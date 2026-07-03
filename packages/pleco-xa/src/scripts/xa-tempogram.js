/**
 * Port of librosa.feature.tempogram (0.11.0) — local autocorrelation
 * tempogram over an onset-strength envelope, plus the Fourier tempogram and
 * a prior-weighted tempo estimator.
 *
 * Tier-3 proof-of-work repairs (2026-07-02):
 *   1. tempogram(): linear_ramp padding (was zero-pad), full win_length lag
 *      rows (was win_length/2+1), per-column inf-norm with the float64-tiny
 *      guard — exactly the math the fixture-gated canonical tempo() consumes
 *      (xa-beat-tracker.js meanTempogram now DELEGATES here, so the parity
 *      fixture tempo_beats.json gates this module too).
 *   2. fourier_tempogram(): STFT of the onset envelope at hop_length=1
 *      (librosa semantics — the previous code passed the audio hop_length,
 *      collapsing a 431-frame envelope to a single column).
 *   3. estimate_tempo(): librosa's pseudo-log-normal tempo prior
 *      (start_bpm=120, std_bpm=1.0 in log2 space) + max_tempo mask over the
 *      time-mean tempogram (the previous raw argmax returned the 60 BPM
 *      subharmonic on a plain 120 BPM click train).
 *   4. The private simplified onset_strength duplicate is gone — the
 *      librosa-parity onset_strength from ./xa-onset.js is used instead.
 *   5. tempogram_ratio(): honest not-implemented throw (the previous body
 *      was not librosa's tempogram_ratio algorithm at all).
 *
 * Proof: examples/web/xa-tempogram.html (tempo-jump heatmap + ridge).
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
 * identical to librosa's FFT path up to float roundoff.
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
 * librosa.convert.tempo_frequencies: BPM value of each autocorrelation lag.
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
 * tempogram — librosa.feature.tempogram parity
 * ------------------------------------------------------------------------ */

/**
 * Local autocorrelation tempogram of the onset strength envelope.
 * Port of librosa.feature.tempogram (0.11.0).
 *
 * Legacy positional signature preserved.
 *
 * @param {Float32Array|Array|null} y - audio time series (optional if
 *   onset_envelope provided)
 * @param {number} sr - sample rate
 * @param {Float32Array|Array|null} onset_envelope - pre-computed
 *   librosa-parity onset strength envelope
 * @param {number} hop_length - hop length used for the onset envelope
 * @param {number} win_length - autocorrelation window in frames
 * @param {boolean} center - center the analysis windows (linear_ramp pad)
 * @param {string} window - window function ('hann' only)
 * @param {number|null} norm - Infinity for per-column max-normalization
 *   (librosa default), null for raw autocorrelation
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
    throw new Error('tempogram: norm must be Infinity (librosa default) or null')
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

  // librosa frames the padded envelope at hop 1, then trims to n columns
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
 * fourier_tempogram — librosa.feature.fourier_tempogram parity
 * ------------------------------------------------------------------------ */

/**
 * Fourier tempogram: STFT of the onset strength envelope at hop 1.
 * Port of librosa.feature.fourier_tempogram (0.11.0):
 *   stft(onset_envelope, n_fft=win_length, hop_length=1, center, window)
 *
 * DIVERGENCE NOTE: pleco's radix-2 stft zero-pads non-power-of-2 FFT sizes,
 * which would silently regrid the tempo axis — so win_length must be a power
 * of two here (default 512 instead of librosa's 384; the tempo axis is
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

  // librosa: stft(oenv, n_fft=win_length, hop_length=1, ...)
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
 * tempogram_ratio — honest not-implemented stub
 * ------------------------------------------------------------------------ */

/**
 * librosa.feature.tempogram_ratio is NOT implemented to parity. The previous
 * body here was not librosa's algorithm (it ranked raw local maxima and
 * emitted lag-ratio matrices with unrelated semantics), so it now fails
 * honestly instead of returning plausible-looking garbage.
 * @throws {Error} always
 */
export function tempogram_ratio() {
  throw new Error(
    'tempogram_ratio: not implemented to librosa parity — the previous ' +
      'implementation was not librosa\'s algorithm. Use tempogram() with ' +
      'convert.tempo_frequencies() instead.',
  )
}

/* ------------------------------------------------------------------------ *
 * estimate_tempo — prior-weighted tempo from a tempogram
 * ------------------------------------------------------------------------ */

/**
 * Estimate the global tempo from a (lag) tempogram using librosa's
 * feature.tempo scoring: time-mean of the tempogram, pseudo-log-normal prior
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

  // Time-mean tempogram (librosa aggregate=np.mean)
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
