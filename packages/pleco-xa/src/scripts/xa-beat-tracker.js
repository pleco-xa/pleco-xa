/**
 * Canonical rhythm engine — the ONLY module that exports beat_track / tempo.
 *
 * Faithful port of librosa 0.11.0:
 *   - tempo():      librosa.feature.tempo   (feature/rhythm.py) — local
 *                   autocorrelation tempogram + pseudo-log-normal tempo prior
 *                   (start_bpm=120, std_bpm=1.0 in log2 space).
 *   - beat_track(): librosa.beat.beat_track (beat.py) — Ellis dynamic
 *                   programming beat tracker, including librosa's exact
 *                   localscore convolution, DP search bounds, last-beat
 *                   selection, and hanning-smoothed beat trimming.
 *
 * Both consume the librosa-parity onset_strength() from ./xa-onset.js
 * (beat_track uses aggregate='median', exactly like librosa.beat.beat_track).
 *
 * Parity is fixture-gated against tools/parity/fixtures/tempo_beats.json in
 * tests/parity/beat.parity.test.js.
 *
 * Tier law (explicit tiers, never silent fallbacks):
 *   - tempo() / beat_track()  → parity tier. Slow but librosa-exact.
 *   - quickTempo()            → quick tier. Windowed lb-style live estimate
 *                               over the last N seconds. Distinct name,
 *                               distinct semantics; tempo() NEVER falls back
 *                               to it, and it never impersonates tempo().
 *
 * House rules honored here: no default BPMs, no fabricated confidences, no
 * dance-tempo snap lists. Failure paths throw.
 */

import { onset_strength } from './xa-onset.js'
import { debugLog } from './debug.js'

// np.finfo(np.float32).tiny — librosa envelopes are float32, and
// __normalize_onsets adds util.tiny(onsets) to the standard deviation.
const FLOAT32_TINY = 1.1754943508222875e-38
// np.finfo(np.float64).tiny — threshold used by util.normalize on the
// (float64) tempogram columns.
const FLOAT64_TINY = 2.2250738585072014e-308

/* ------------------------------------------------------------------------ *
 * numpy-faithful helpers
 * ------------------------------------------------------------------------ */

/**
 * np.round: round half to even ("banker's rounding") for non-negative values.
 * @private
 */
function bankersRound(x) {
  const floor = Math.floor(x)
  if (x - floor === 0.5) {
    return floor % 2 === 0 ? floor : floor + 1
  }
  return Math.round(x)
}

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
 * np.median of a numeric array (average of the two middle values when even).
 * @private
 */
function median(values) {
  const sorted = Float64Array.from(values).sort()
  const n = sorted.length
  if (n === 0) {
    throw new Error('median of empty array')
  }
  return n % 2 === 1
    ? sorted[(n - 1) / 2]
    : 0.5 * (sorted[n / 2 - 1] + sorted[n / 2])
}

/**
 * librosa.util.localmax along the last axis with edge padding:
 * localmax[i] = x[i] > x[i-1] && x[i] >= x[i+1]; localmax[0] is always false,
 * localmax[n-1] reduces to x[n-1] > x[n-2].
 * @private
 */
function localMax(x) {
  const n = x.length
  const out = new Array(n).fill(false)
  for (let i = 1; i < n; i++) {
    const next = i + 1 < n ? x[i + 1] : x[i]
    out[i] = x[i] > x[i - 1] && x[i] >= next
  }
  return out
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
 * Validate an audio/envelope input array.
 * @private
 */
function assertSignal(x, name) {
  if (x == null || typeof x.length !== 'number') {
    throw new Error(`${name} must be an array or typed array of samples`)
  }
  if (x.length === 0) {
    throw new Error(`${name} must not be empty`)
  }
}

/**
 * Validate a sample rate.
 * @private
 */
function assertSampleRate(sr) {
  if (typeof sr !== 'number' || !Number.isFinite(sr) || sr <= 0) {
    throw new Error(`sr=${sr} must be a positive finite number`)
  }
}

/* ------------------------------------------------------------------------ *
 * Tempogram (librosa.feature.tempogram, center=True, window='hann',
 * norm=np.inf) — returned as the time-mean column, which is all
 * librosa.feature.tempo consumes with the default aggregate=np.mean.
 * ------------------------------------------------------------------------ */

/**
 * Mean (over time) of the inf-normalized local autocorrelation tempogram.
 * @private
 * @param {Float32Array|Float64Array|Array} onsetEnvelope
 * @param {number} winLength - autocorrelation window in frames
 * @returns {Float64Array} length winLength
 */
function meanTempogram(onsetEnvelope, winLength) {
  const n = onsetEnvelope.length
  const half = Math.floor(winLength / 2)

  // np.pad(..., mode='linear_ramp', end_values=[0, 0])
  const padded = new Float64Array(n + 2 * half)
  const first = onsetEnvelope[0]
  const last = onsetEnvelope[n - 1]
  for (let j = 0; j < half; j++) {
    padded[j] = (first * j) / half
    padded[half + n + j] = (last * (half - 1 - j)) / half
  }
  for (let i = 0; i < n; i++) {
    padded[half + i] = onsetEnvelope[i]
  }

  const window = hannPeriodic(winLength)
  const nCols = Math.min(n, padded.length - winLength + 1)
  if (nCols < 1) {
    throw new Error(
      `onset envelope too short (${n} frames) for tempogram win_length=${winLength}`,
    )
  }

  const acc = new Float64Array(winLength)
  const frame = new Float64Array(winLength)
  for (let t = 0; t < nCols; t++) {
    for (let k = 0; k < winLength; k++) {
      frame[k] = padded[t + k] * window[k]
    }
    const ac = autocorrelate(frame)
    // util.normalize(..., norm=np.inf, axis=-2): divide by max |value|,
    // leaving all-(near-)zero columns unnormalized (fill=None semantics).
    let maxAbs = 0
    for (let k = 0; k < winLength; k++) {
      const a = Math.abs(ac[k])
      if (a > maxAbs) maxAbs = a
    }
    const scale = maxAbs < FLOAT64_TINY ? 1 : maxAbs
    for (let k = 0; k < winLength; k++) {
      acc[k] += ac[k] / scale
    }
  }

  for (let k = 0; k < winLength; k++) {
    acc[k] /= nCols
  }
  return acc
}

/* ------------------------------------------------------------------------ *
 * tempo() — librosa.feature.tempo parity
 * ------------------------------------------------------------------------ */

/**
 * Estimate the global tempo (BPM). Port of librosa.feature.tempo (0.11.0)
 * with aggregate=np.mean.
 *
 * The pseudo-log-normal prior is librosa's exact formula
 * (feature/rhythm.py):
 *   logprior = -0.5 * ((log2(bpms) - log2(start_bpm)) / std_bpm) ** 2
 * and the estimate is
 *   argmax(log1p(1e6 * tempogram_mean) + logprior)   over lag bins,
 * with all bins at or above max_tempo masked to -Infinity.
 *
 * @param {Float32Array|Array|null} y - audio time series (may be null when
 *   opts.onsetEnvelope is provided)
 * @param {Object|number} [opts] - options object, or sr as a number
 *   (librosa-style positional call: tempo(y, sr))
 * @param {number} [opts.sr=22050] - sample rate
 * @param {Float32Array|Array} [opts.onsetEnvelope=null] - pre-computed onset
 *   strength envelope (librosa-parity onset_strength output)
 * @param {number} [opts.hopLength=512]
 * @param {number} [opts.startBpm=120] - center of the log-normal prior
 * @param {number} [opts.stdBpm=1.0] - prior standard deviation (log2 space)
 * @param {number} [opts.acSize=8.0] - autocorrelation window in seconds
 * @param {number|null} [opts.maxTempo=320.0] - mask tempi at/above this value
 * @returns {number} estimated tempo in BPM
 * @throws {Error} on missing/empty input or invalid parameters — never
 *   returns a fabricated default
 */
export function tempo(y, opts = {}) {
  // Support the librosa positional call style: tempo(y, sr)
  if (typeof opts === 'number') {
    opts = { sr: opts }
  }
  if (opts === null || opts === undefined) {
    opts = {}
  }
  const {
    sr = 22050,
    onsetEnvelope = null,
    hopLength = 512,
    startBpm = 120,
    stdBpm = 1.0,
    acSize = 8.0,
    maxTempo = 320.0,
  } = opts

  assertSampleRate(sr)
  if (!Number.isInteger(hopLength) || hopLength <= 0) {
    throw new Error(`hopLength=${hopLength} must be a positive integer`)
  }
  if (!(startBpm > 0)) {
    throw new Error('startBpm must be strictly positive')
  }
  if (!(stdBpm > 0)) {
    throw new Error('stdBpm must be strictly positive')
  }

  let env = onsetEnvelope
  if (env === null) {
    assertSignal(y, 'y')
    env = onset_strength(y, { sr, hop_length: hopLength })
  } else {
    assertSignal(env, 'onsetEnvelope')
  }

  // librosa: win_length = time_to_frames(ac_size, sr, hop_length).item()
  const winLength = Math.floor(Math.trunc(acSize * sr) / hopLength)
  if (winLength < 1) {
    throw new Error(`acSize=${acSize} too small for sr=${sr}, hop=${hopLength}`)
  }

  const tg = meanTempogram(env, winLength)
  const bpms = tempoFrequencies(winLength, hopLength, sr)

  // Pseudo-log-normal prior; bin 0 (infinite BPM) gets -Infinity naturally.
  const log2Start = Math.log2(startBpm)
  const logprior = new Float64Array(winLength)
  for (let k = 0; k < winLength; k++) {
    const d = (Math.log2(bpms[k]) - log2Start) / stdBpm
    logprior[k] = -0.5 * d * d
  }

  // Kill everything at/above the max tempo (librosa masks [:argmax(bpms < max)])
  if (maxTempo !== null && maxTempo !== undefined) {
    let maxIdx = 0
    while (maxIdx < winLength && !(bpms[maxIdx] < maxTempo)) maxIdx++
    for (let k = 0; k < maxIdx; k++) {
      logprior[k] = -Infinity
    }
  }

  // argmax(log1p(1e6 * tg) + logprior) — first maximum, like np.argmax
  let best = 0
  let bestScore = -Infinity
  for (let k = 0; k < winLength; k++) {
    const score = Math.log1p(1e6 * tg[k]) + logprior[k]
    if (score > bestScore) {
      bestScore = score
      best = k
    }
  }

  return bpms[best]
}

/* ------------------------------------------------------------------------ *
 * Ellis DP beat tracker — librosa.beat.beat_track internals
 * ------------------------------------------------------------------------ */

/**
 * __normalize_onsets: divide by std (ddof=1) + float32 tiny.
 * @private
 */
function normalizeOnsets(env) {
  const n = env.length
  let mean = 0
  for (let i = 0; i < n; i++) mean += env[i]
  mean /= n
  let sq = 0
  for (let i = 0; i < n; i++) {
    const d = env[i] - mean
    sq += d * d
  }
  const std = n > 1 ? Math.sqrt(sq / (n - 1)) : 0
  const out = new Float64Array(n)
  const denom = std + FLOAT32_TINY
  for (let i = 0; i < n; i++) out[i] = env[i] / denom
  return out
}

/**
 * __beat_local_score: same-mode convolution with a Gaussian beat-expectation
 * window, replicating librosa's numba loop bounds exactly (including the
 * exclusive upper bound `min(i + K//2, K)`).
 * @private
 */
function beatLocalScore(env, framesPerBeat) {
  const N = env.length
  const K = 2 * framesPerBeat + 1
  const halfK = framesPerBeat // K // 2
  const window = new Float64Array(K)
  for (let k = 0; k < K; k++) {
    const z = ((k - framesPerBeat) * 32.0) / framesPerBeat
    window[k] = Math.exp(-0.5 * z * z)
  }

  const localscore = new Float64Array(N)
  for (let i = 0; i < N; i++) {
    let sum = 0
    const kStart = Math.max(0, i + halfK - N + 1)
    const kEnd = Math.min(i + halfK, K) // exclusive (librosa quirk preserved)
    for (let k = kStart; k < kEnd; k++) {
      sum += window[k] * env[i + halfK - k]
    }
    localscore[i] = sum
  }
  return localscore
}

/**
 * __beat_track_dp: core dynamic program.
 * @private
 */
function beatTrackDP(localscore, framesPerBeat, tightness) {
  const N = localscore.length
  const backlink = new Int32Array(N)
  const cumscore = new Float64Array(N)

  let maxScore = -Infinity
  for (let i = 0; i < N; i++) {
    if (localscore[i] > maxScore) maxScore = localscore[i]
  }
  const scoreThresh = 0.01 * maxScore

  let firstBeat = true
  backlink[0] = -1
  cumscore[0] = localscore[0]

  const logFpb = Math.log(framesPerBeat)
  const searchOffset = bankersRound(framesPerBeat / 2)
  const searchStop = 2 * framesPerBeat // last candidate is i - 2*fpb (inclusive)

  for (let i = 0; i < N; i++) {
    let bestScore = -Infinity
    let beatLocation = -1

    for (let loc = i - searchOffset; loc >= i - searchStop; loc--) {
      if (loc < 0) break
      const interval = i - loc
      const dev = Math.log(interval) - logFpb
      const score = cumscore[loc] - tightness * dev * dev
      if (score > bestScore) {
        bestScore = score
        beatLocation = loc
      }
    }

    cumscore[i] =
      beatLocation >= 0 ? localscore[i] + bestScore : localscore[i]

    if (firstBeat && localscore[i] < scoreThresh) {
      backlink[i] = -1
    } else {
      backlink[i] = beatLocation
      firstBeat = false
    }
  }

  return { backlink, cumscore }
}

/**
 * __last_beat: median-thresholded last local maximum of the cumulative score.
 * @private
 */
function lastBeat(cumscore) {
  const N = cumscore.length
  const isMax = localMax(cumscore)
  const maxima = []
  for (let i = 0; i < N; i++) {
    if (isMax[i]) maxima.push(cumscore[i])
  }
  if (maxima.length === 0) {
    return N - 1
  }
  const threshold = 0.5 * median(maxima)
  for (let n = N - 1; n >= 0; n--) {
    if (isMax[n] && cumscore[n] >= threshold) {
      return n
    }
  }
  return N - 1
}

/**
 * __trim_beats: suppress spurious leading/trailing beats using a
 * hanning(5)-smoothed beat-onset envelope RMS threshold (librosa's exact
 * slicing, which keeps two convolution tail samples).
 * @private
 */
function trimBeats(localscore, beats, trim) {
  const N = beats.length
  const trimmed = beats.slice()

  const boe = []
  for (let i = 0; i < N; i++) {
    if (beats[i]) boe.push(localscore[i])
  }
  if (boe.length === 0) {
    return trimmed
  }

  // np.hanning(5)
  const w = [0, 0.5, 1, 0.5, 0]
  const full = new Float64Array(boe.length + w.length - 1)
  for (let i = 0; i < boe.length; i++) {
    for (let j = 0; j < w.length; j++) {
      full[i + j] += boe[i] * w[j]
    }
  }
  // np.convolve(...)[len(w)//2 : len(localscore) + len(w)//2]
  const start = Math.floor(w.length / 2)
  const end = Math.min(full.length, N + start)
  let threshold = 0.0
  if (trim) {
    let sq = 0
    let count = 0
    for (let i = start; i < end; i++) {
      sq += full[i] * full[i]
      count++
    }
    threshold = 0.5 * Math.sqrt(sq / count)
  }

  let n = 0
  while (n < N && localscore[n] <= threshold) {
    trimmed[n] = false
    n++
  }
  n = N - 1
  while (n >= 0 && localscore[n] <= threshold) {
    trimmed[n] = false
    n--
  }
  return trimmed
}

/**
 * __beat_tracker: full Ellis DP pipeline over an onset envelope.
 * @private
 * @returns {Array<boolean>} dense beat indicator array
 */
function ellisBeatTracker(onsetEnvelope, bpm, frameRate, tightness, trim) {
  if (typeof bpm !== 'number' || !Number.isFinite(bpm) || bpm <= 0) {
    throw new Error(`bpm=${bpm} must be strictly positive`)
  }
  if (!(tightness > 0)) {
    throw new Error('tightness must be strictly positive')
  }

  // np.round(frame_rate * 60 / bpm)
  const framesPerBeat = bankersRound((frameRate * 60.0) / bpm)
  if (framesPerBeat < 1) {
    throw new Error(
      `bpm=${bpm} implies < 1 frame per beat at frame rate ${frameRate}`,
    )
  }

  const localscore = beatLocalScore(normalizeOnsets(onsetEnvelope), framesPerBeat)
  const { backlink, cumscore } = beatTrackDP(localscore, framesPerBeat, tightness)

  const beats = new Array(onsetEnvelope.length).fill(false)
  let n = lastBeat(cumscore)
  while (n >= 0) {
    beats[n] = true
    n = backlink[n]
  }

  return trimBeats(localscore, beats, trim)
}

/* ------------------------------------------------------------------------ *
 * beat_track() — librosa.beat.beat_track parity
 * ------------------------------------------------------------------------ */

/**
 * Dynamic programming beat tracker. Port of librosa.beat.beat_track (0.11.0).
 *
 * Pipeline (Ellis 2007, librosa's exact variant):
 *   1. onset_strength(y, aggregate='median')   (skipped if onsetEnvelope given)
 *   2. tempo(onsetEnvelope) with the log-normal prior (skipped if bpm given)
 *   3. DP peak picking consistent with the estimated tempo
 *
 * @param {Float32Array|Array|null} y - audio time series (may be null when
 *   opts.onsetEnvelope is provided)
 * @param {number} [sr=22050] - sample rate
 * @param {Object} [opts]
 * @param {Float32Array|Array} [opts.onsetEnvelope=null] - pre-computed onset envelope
 * @param {number} [opts.hopLength=512]
 * @param {number} [opts.startBpm=120] - prior center for tempo estimation
 * @param {number} [opts.tightness=100] - beat distribution tightness
 * @param {boolean} [opts.trim=true] - trim weak leading/trailing beats
 * @param {number} [opts.bpm=null] - known tempo (skips estimation).
 *   Time-varying (array) tempo is not supported and throws.
 * @param {string} [opts.units='frames'] - 'frames' | 'samples' | 'time'
 *   (librosa default is 'frames')
 * @param {boolean} [opts.sparse=true] - sparse indices vs dense boolean array
 * @returns {{tempo: number, beats: Array<number>|Array<boolean>}}
 * @throws {Error} on missing/empty input or invalid parameters
 */
export function beat_track(y, sr = 22050, opts = {}) {
  const {
    onsetEnvelope = null,
    hopLength = 512,
    startBpm = 120.0,
    tightness = 100,
    trim = true,
    bpm = null,
    units = 'frames',
    sparse = true,
  } = opts

  assertSampleRate(sr)
  if (!Number.isInteger(hopLength) || hopLength <= 0) {
    throw new Error(`hopLength=${hopLength} must be a positive integer`)
  }
  if (units !== 'frames' && units !== 'samples' && units !== 'time') {
    throw new Error(`Invalid unit type: ${units}`)
  }
  if (bpm !== null && typeof bpm !== 'number') {
    throw new Error(
      'time-varying bpm arrays are not supported yet; pass a scalar bpm',
    )
  }

  let env = onsetEnvelope
  if (env === null) {
    assertSignal(y, 'y')
    // librosa.beat.beat_track: onset_strength(..., aggregate=np.median)
    env = onset_strength(y, { sr, hop_length: hopLength, aggregate: 'median' })
  } else {
    assertSignal(env, 'onsetEnvelope')
  }

  // No onsets at all → 0 BPM and no beats (librosa's documented behavior).
  let any = false
  for (let i = 0; i < env.length; i++) {
    if (env[i] !== 0) {
      any = true
      break
    }
  }
  if (!any) {
    debugLog('beat_track: no onsets detected — returning 0 BPM, no beats')
    return {
      tempo: 0.0,
      beats: sparse ? [] : new Array(env.length).fill(false),
    }
  }

  const estimatedBpm =
    bpm !== null
      ? bpm
      : tempo(null, { sr, onsetEnvelope: env, hopLength, startBpm })

  const dense = ellisBeatTracker(env, estimatedBpm, sr / hopLength, tightness, trim)

  if (!sparse) {
    return { tempo: estimatedBpm, beats: dense }
  }

  let beats = []
  for (let i = 0; i < dense.length; i++) {
    if (dense[i]) beats.push(i)
  }
  if (units === 'samples') {
    beats = beats.map((b) => b * hopLength)
  } else if (units === 'time') {
    beats = beats.map((b) => (b * hopLength) / sr)
  }

  debugLog(`beat_track: ${estimatedBpm.toFixed(2)} BPM, ${beats.length} beats`)
  return { tempo: estimatedBpm, beats }
}

/* ------------------------------------------------------------------------ *
 * quickTempo() — explicit QUICK tier
 * ------------------------------------------------------------------------ */

/**
 * QUICK TIER — windowed lb-style live tempo estimate.
 *
 * Analyzes only the last `windowSec` seconds of audio with a normalized
 * autocorrelation over the onset envelope (the estimator migrated from the
 * lb project). This is intentionally cheaper and coarser than tempo():
 * lag-quantized BPM, no tempogram, no log-normal prior.
 *
 * This is NOT librosa parity and is NEVER used as a fallback by tempo() or
 * beat_track(). Callers opt into the quick tier explicitly.
 *
 * @param {Float32Array|Array} y - audio time series
 * @param {number} [sr=22050] - sample rate
 * @param {Object} [opts]
 * @param {number} [opts.windowSec=8] - analysis window: last N seconds of y
 * @param {number} [opts.hopLength=512]
 * @param {number} [opts.minBpm=70] - lower edge of the search range
 * @param {number} [opts.maxBpm=180] - upper edge of the search range
 * @returns {{bpm: number, confidence: number, tier: 'quick', windowSec: number}}
 *   confidence is the measured prominence of the best autocorrelation peak
 *   over the runner-up (0..1), not a constant.
 * @throws {Error} if the window contains no detectable onsets or is too
 *   short for the requested BPM range — never returns a default BPM.
 */
export function quickTempo(y, sr = 22050, opts = {}) {
  const { windowSec = 8, hopLength = 512, minBpm = 70, maxBpm = 180 } = opts

  assertSignal(y, 'y')
  assertSampleRate(sr)
  if (!(windowSec > 0)) {
    throw new Error(`windowSec=${windowSec} must be strictly positive`)
  }
  if (!(minBpm > 0) || !(maxBpm > minBpm)) {
    throw new Error(`invalid BPM range [${minBpm}, ${maxBpm}]`)
  }

  const windowSamples = Math.min(y.length, Math.floor(windowSec * sr))
  const tail = y.subarray
    ? y.subarray(y.length - windowSamples)
    : y.slice(y.length - windowSamples)

  const env = onset_strength(tail, { sr, hop_length: hopLength })
  const onsetRate = sr / hopLength

  // lb-style: mean-center, then normalized autocorrelation over the lag range
  let mean = 0
  for (let i = 0; i < env.length; i++) mean += env[i]
  mean /= env.length
  const centered = new Float64Array(env.length)
  let anyOnset = false
  for (let i = 0; i < env.length; i++) {
    centered[i] = env[i] - mean
    if (env[i] !== 0) anyOnset = true
  }
  if (!anyOnset) {
    throw new Error(
      `quickTempo: no onsets detected in the last ${windowSec}s window`,
    )
  }

  const minLag = Math.round((60 * onsetRate) / maxBpm)
  const maxLag = Math.round((60 * onsetRate) / minBpm)
  const candidates = []
  for (let lag = Math.max(1, minLag); lag <= maxLag && lag < env.length; lag++) {
    let corr = 0
    let norm1 = 0
    let norm2 = 0
    for (let i = 0; i < env.length - lag; i++) {
      corr += centered[i] * centered[i + lag]
      norm1 += centered[i] * centered[i]
      norm2 += centered[i + lag] * centered[i + lag]
    }
    const score = corr / Math.sqrt(norm1 * norm2 + 1e-10)
    candidates.push({ bpm: (60 * onsetRate) / lag, score })
  }

  if (candidates.length === 0) {
    throw new Error(
      `quickTempo: window of ${windowSec}s is too short to search ` +
        `[${minBpm}, ${maxBpm}] BPM at hopLength=${hopLength}`,
    )
  }

  candidates.sort((a, b) => b.score - a.score)
  const bestScore = candidates[0].score
  if (!(bestScore > 0)) {
    throw new Error(
      'quickTempo: no positive autocorrelation peak in the BPM range',
    )
  }
  const confidence =
    candidates.length > 1
      ? Math.max(0, (bestScore - candidates[1].score) / (bestScore + 1e-10))
      : 1

  return {
    bpm: candidates[0].bpm,
    confidence,
    tier: 'quick',
    windowSec,
  }
}

/* ------------------------------------------------------------------------ *
 * BeatTracker class — thin stateful wrapper over the canonical functions
 * ------------------------------------------------------------------------ */

/**
 * Stateful convenience wrapper around the canonical engine. All numerical
 * work happens in the module-level librosa-parity functions above.
 */
export class BeatTracker {
  constructor() {
    /** @type {number|null} optional tempo hint set via setTempo() */
    this.tempoHint = null
  }

  /**
   * Set a tempo hint (BPM) used by beatTrack() when no explicit bpm option
   * is provided. Pass null to clear.
   * @param {number|null} bpm
   */
  setTempo(bpm) {
    if (bpm === null) {
      this.tempoHint = null
      return
    }
    if (typeof bpm !== 'number' || !Number.isFinite(bpm) || bpm <= 0) {
      throw new Error(`setTempo: bpm=${bpm} must be strictly positive`)
    }
    this.tempoHint = bpm
  }

  /**
   * librosa-parity beat tracking (options-object API).
   * @param {Object} options - {y, sr, onsetEnvelope, hopLength, startBpm,
   *   tightness, trim, bpm, units, sparse} — see beat_track()
   * @returns {{tempo: number, beats: Array}}
   */
  beatTrack(options = {}) {
    const { y = null, sr = 22050, bpm = null, ...rest } = options
    return beat_track(y, sr, { ...rest, bpm: bpm ?? this.tempoHint })
  }

  /**
   * librosa-parity tempo estimation from a pre-computed onset envelope.
   * @param {Float32Array|Array} onsetEnvelope
   * @param {Object} [opts] - see tempo()
   * @returns {number} BPM
   */
  tempoEstimation(onsetEnvelope, opts = {}) {
    return tempo(null, { ...opts, onsetEnvelope })
  }

  /**
   * librosa-parity onset strength (delegates to xa-onset).
   * @param {Float32Array|Array} y
   * @param {number} [sr=22050]
   * @param {number} [hopLength=512]
   * @returns {Float32Array}
   */
  onsetStrength(y, sr = 22050, hopLength = 512) {
    return onset_strength(y, { sr, hop_length: hopLength })
  }
}
