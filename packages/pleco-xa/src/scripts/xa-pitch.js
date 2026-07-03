/**
 * Port of librosa.core.pitch and librosa.feature.pitch tracking
 * Pitch detection and fundamental frequency estimation
 * Librosa-compatible pitch tracking for JavaScript
 */

import { stft } from './xa-fft.js'
import { frames_to_time } from './xa-convert.js'
import { viterbi, transition_local, transition_loop } from '../sequence/index.js'

/**
 * Pitch tracking using parabolic interpolation of peak locations in a spectrogram
 * Port of librosa.core.piptrack
 * @param {Float32Array} y - Audio time series (optional if S provided)
 * @param {number} sr - Sample rate
 * @param {Array} S - Pre-computed magnitude/power spectrogram [freq][time]
 * @param {number} n_fft - FFT window size
 * @param {number} hop_length - Hop length
 * @param {number} fmin - Minimum frequency
 * @param {number} fmax - Maximum frequency
 * @param {number} threshold - Threshold for peak detection
 * @returns {Object} {pitches: Array, magnitudes: Array} - pitch and magnitude per frame
 */
export function piptrack(
  y = null,
  sr = 22050,
  S = null,
  n_fft = 2048,
  hop_length = 512,
  fmin = 150.0,
  fmax = 4000.0,
  threshold = 0.1,
) {
  let mag_spec

  if (S !== null) {
    mag_spec = S
  } else if (y !== null) {
    // Compute magnitude spectrogram
    const D = stft(y, n_fft, hop_length, null, 'hann', true, 'constant')

    const n_freq = D.length
    const n_frames = D[0] ? D[0].length : 0

    mag_spec = Array(n_freq)
      .fill(null)
      .map(() => new Float32Array(n_frames))

    for (let f = 0; f < n_freq; f++) {
      for (let t = 0; t < n_frames; t++) {
        const bin = D[f][t]
        mag_spec[f][t] = Math.sqrt(bin.real * bin.real + bin.imag * bin.imag)
      }
    }
  } else {
    throw new Error('Either y or S must be provided')
  }

  const n_freq = mag_spec.length
  const n_frames = mag_spec[0] ? mag_spec[0].length : 0

  // Compute frequency bins
  const freqs = new Float32Array(n_freq)
  for (let i = 0; i < n_freq; i++) {
    freqs[i] = (i * sr) / n_fft
  }

  // Initialize output matrices
  const pitches = Array(n_freq)
    .fill(null)
    .map(() => new Float32Array(n_frames))
  const magnitudes = Array(n_freq)
    .fill(null)
    .map(() => new Float32Array(n_frames))

  // Find peaks in each frame
  for (let t = 0; t < n_frames; t++) {
    // Find local maxima
    for (let f = 1; f < n_freq - 1; f++) {
      const freq = freqs[f]

      // Skip if outside frequency range
      if (freq < fmin || freq > fmax) {
        continue
      }

      const mag = mag_spec[f][t]
      const mag_prev = mag_spec[f - 1][t]
      const mag_next = mag_spec[f + 1][t]

      // Check if local maximum and above threshold
      if (mag > mag_prev && mag > mag_next && mag > threshold) {
        // Parabolic interpolation for sub-bin accuracy
        const alpha = mag_prev
        const beta = mag
        const gamma = mag_next

        const p = 0.5 * (alpha - gamma) / (alpha - 2 * beta + gamma)
        const refined_bin = f + p
        const refined_freq = (refined_bin * sr) / n_fft

        pitches[f][t] = refined_freq
        magnitudes[f][t] = mag
      }
    }
  }

  return { pitches, magnitudes }
}

/**
 * Fundamental frequency (F0) estimation using the YIN algorithm
 * Port of librosa.core.yin
 * @param {Float32Array} y - Audio time series
 * @param {number} fmin - Minimum frequency to search
 * @param {number} fmax - Maximum frequency to search
 * @param {number} sr - Sample rate
 * @param {number} frame_length - Length of analysis frame
 * @param {number} win_length - Window length (default: frame_length / 2)
 * @param {number} hop_length - Hop length
 * @param {number} trough_threshold - Threshold for peak picking
 * @returns {Float32Array} F0 estimates per frame (0 = unvoiced)
 */
export function yin(
  y,
  fmin = 80.0,
  fmax = 400.0,
  sr = 22050,
  frame_length = 2048,
  win_length = null,
  hop_length = null,
  trough_threshold = 0.1,
) {
  if (win_length === null) {
    win_length = Math.floor(frame_length / 2)
  }
  if (hop_length === null) {
    hop_length = Math.floor(frame_length / 4)
  }

  // Compute lag range from frequency range
  const min_lag = Math.max(1, Math.floor(sr / fmax))
  const max_lag = Math.min(Math.floor(frame_length / 2), Math.floor(sr / fmin))

  // Number of frames
  const n_frames = Math.floor((y.length - frame_length) / hop_length) + 1

  const f0 = new Float32Array(n_frames)

  // Process each frame
  for (let i = 0; i < n_frames; i++) {
    const start = i * hop_length
    const frame = y.slice(start, start + frame_length)

    // Compute YIN difference function
    const yin_df = compute_yin_difference(frame, max_lag)

    // Cumulative mean normalized difference
    const yin_cmnd = cumulative_mean_normalized_difference(yin_df)

    // Find the first trough below threshold
    let tau = -1
    for (let lag = min_lag; lag < max_lag; lag++) {
      if (yin_cmnd[lag] < trough_threshold) {
        // Find local minimum after this point
        while (lag + 1 < max_lag && yin_cmnd[lag + 1] < yin_cmnd[lag]) {
          lag++
        }
        tau = lag
        break
      }
    }

    // If no trough found, find absolute minimum
    if (tau === -1) {
      let min_val = Infinity
      for (let lag = min_lag; lag < max_lag; lag++) {
        if (yin_cmnd[lag] < min_val) {
          min_val = yin_cmnd[lag]
          tau = lag
        }
      }
    }

    // Parabolic interpolation for sub-sample accuracy
    if (tau > 0 && tau < max_lag - 1) {
      const better_tau = parabolic_interpolation(
        yin_cmnd,
        tau,
      )
      f0[i] = sr / better_tau
    } else if (tau > 0) {
      f0[i] = sr / tau
    } else {
      f0[i] = 0 // Unvoiced
    }
  }

  return f0
}

/**
 * Probabilistic YIN (pYIN) — librosa.core.pyin parity port.
 *
 * Faithful two-stage port of librosa 0.11's pyin (librosa/core/pitch.py):
 *   1. YIN cumulative-mean-normalized-difference per frame → local minima
 *      (troughs) below a beta-distributed threshold ensemble, each weighted by
 *      a Boltzmann prior over trough rank and the beta pmf over thresholds →
 *      an observation matrix over a log-spaced f0 grid (n_bins_per_semitone
 *      bins/semitone) stacked with an unvoiced state block.
 *   2. Transition matrix = transition_local band over the pitch grid ⊗
 *      voiced/unvoiced switching (transition_loop(2, 1 - switch_prob)) via a
 *      Kronecker product — exactly librosa's np.kron(t_switch, transition).
 *   3. sequence.viterbi decode → per-frame pitch bin → f0 (fill_na when
 *      unvoiced), voiced_flag, voiced_prob.
 *
 * Fixture-gated: tools/parity/fixtures/pyin.json (220→330 Hz step + silent
 * tail; voiced f0 within ~1 semitone of librosa, voicing exact on the clearly
 * voiced/silent regions). This is the real pYIN — NOT the former median-over-
 * threshold-ensemble stub (no transition matrix, no Viterbi) that was honestly
 * left unexported.
 *
 * @param {Float32Array|number[]} y - Audio time series.
 * @param {number} fmin - Minimum frequency (Hz), > 0.
 * @param {number} fmax - Maximum frequency (Hz), fmin < fmax <= sr/2.
 * @param {number} [sr=22050] - Sample rate (Hz).
 * @param {object} [opts]
 * @param {number} [opts.frame_length=2048]
 * @param {number|null} [opts.hop_length=null] - Defaults to frame_length/4.
 * @param {number} [opts.n_thresholds=100] - Threshold-ensemble size.
 * @param {[number,number]} [opts.beta_parameters=[2,18]] - Beta prior (a, b).
 * @param {number} [opts.boltzmann_parameter=2] - Boltzmann prior over troughs.
 * @param {number} [opts.resolution=0.1] - Pitch-bin resolution in semitones.
 * @param {number} [opts.max_transition_rate=35.92] - Max transition (oct/sec).
 * @param {number} [opts.switch_prob=0.01] - Voiced↔unvoiced switch prob.
 * @param {number} [opts.no_trough_prob=0.01] - Best-guess mass when no trough.
 * @param {number} [opts.fill_na=NaN] - Value written to unvoiced f0 frames.
 * @param {boolean} [opts.center=true] - Center-pad frames (librosa default).
 * @returns {{ f0: Float64Array, voiced_flag: boolean[], voiced_prob: Float64Array }}
 */
export function pyin(y, fmin, fmax, sr = 22050, {
  frame_length = 2048,
  hop_length = null,
  n_thresholds = 100,
  beta_parameters = [2, 18],
  boltzmann_parameter = 2,
  resolution = 0.1,
  max_transition_rate = 35.92,
  switch_prob = 0.01,
  no_trough_prob = 0.01,
  fill_na = NaN,
  center = true,
} = {}) {
  if (!(y instanceof Float32Array) && !Array.isArray(y) && !ArrayBuffer.isView(y)) {
    throw new Error('pyin: y must be a Float32Array/typed-array/array audio time series')
  }
  __check_yin_params(sr, fmax, fmin, frame_length)

  if (hop_length === null) hop_length = Math.floor(frame_length / 4)

  // Frame the signal (center-pad so frame t is centered at y[t*hop_length]).
  const y_frames = frameSignal(y, frame_length, hop_length, center)
  const n_frames = y_frames.length
  if (n_frames === 0) {
    throw new Error(
      `pyin: signal length ${y.length} is too short for frame_length=${frame_length}`,
    )
  }

  // Period search bounds (samples). Matches librosa exactly.
  const min_period = Math.floor(sr / fmax)
  const max_period = Math.min(Math.ceil(sr / fmin), frame_length - 1)

  // Stage 1a: YIN cumulative-mean-normalized difference + parabolic shifts.
  const yin_frames = _cumulative_mean_normalized_difference(y_frames, min_period, max_period)
  const parabolic_shifts = _parabolic_interpolation(yin_frames)

  // Beta prior over the threshold ensemble: thresholds = linspace(0, 1, n+1);
  // beta_probs = diff(beta_cdf) so each of the n threshold bins carries mass.
  const thresholds = new Float64Array(n_thresholds + 1)
  for (let i = 0; i <= n_thresholds; i++) thresholds[i] = i / n_thresholds
  const beta_probs = new Float64Array(n_thresholds)
  let prev_cdf = betainc(beta_parameters[0], beta_parameters[1], thresholds[0])
  for (let i = 0; i < n_thresholds; i++) {
    const cdf = betainc(beta_parameters[0], beta_parameters[1], thresholds[i + 1])
    beta_probs[i] = cdf - prev_cdf
    prev_cdf = cdf
  }

  const n_bins_per_semitone = Math.ceil(1.0 / resolution)
  const n_pitch_bins = Math.floor(12 * n_bins_per_semitone * Math.log2(fmax / fmin)) + 1

  // Stage 1b: observation matrix (2*n_pitch_bins states) + voiced probability.
  const { observation_probs, voiced_prob } = __pyin_helper(
    yin_frames,
    parabolic_shifts,
    sr,
    thresholds,
    boltzmann_parameter,
    beta_probs,
    no_trough_prob,
    min_period,
    fmin,
    n_pitch_bins,
    n_bins_per_semitone,
  )

  // Stage 2: transition matrix — local pitch band ⊗ voiced/unvoiced switch.
  const max_semitones_per_frame = Math.round((max_transition_rate * 12 * hop_length) / sr)
  const transition_width = max_semitones_per_frame * n_bins_per_semitone + 1
  const local = transition_local(n_pitch_bins, transition_width, 'triangle', false)
  const t_switch = transition_loop(2, 1 - switch_prob)
  const transition = kron2(t_switch, local)

  const p_init = new Array(2 * n_pitch_bins).fill(1.0 / (2 * n_pitch_bins))

  // Stage 3: Viterbi decode the most-likely state path.
  const states = viterbi(observation_probs, transition, p_init)

  // Map decoded states back to f0 (log-spaced grid) + voicing.
  const freqs = new Float64Array(n_pitch_bins)
  for (let b = 0; b < n_pitch_bins; b++) {
    freqs[b] = fmin * 2 ** (b / (12 * n_bins_per_semitone))
  }

  const f0 = new Float64Array(n_frames)
  const voiced_flag = new Array(n_frames)
  for (let t = 0; t < n_frames; t++) {
    const s = states[t]
    const voiced = s < n_pitch_bins
    voiced_flag[t] = voiced
    f0[t] = voiced ? freqs[s % n_pitch_bins] : fill_na
  }

  return { f0, voiced_flag, voiced_prob }
}

/**
 * Per-frame framing with librosa center-padding (mode='constant').
 * Returns frame-major rows (each a Float64Array of frame_length) so the
 * downstream YIN math iterates one contiguous frame at a time.
 * @param {ArrayLike<number>} y
 * @param {number} frame_length
 * @param {number} hop_length
 * @param {boolean} center
 * @returns {Float64Array[]}
 */
function frameSignal(y, frame_length, hop_length, center) {
  let src
  if (center) {
    const pad = Math.floor(frame_length / 2)
    src = new Float64Array(y.length + 2 * pad)
    for (let i = 0; i < y.length; i++) src[pad + i] = y[i]
  } else {
    src = y
  }
  const n = src.length
  if (n < frame_length) return []
  const n_frames = 1 + Math.floor((n - frame_length) / hop_length)
  const frames = new Array(n_frames)
  for (let t = 0; t < n_frames; t++) {
    const start = t * hop_length
    const f = new Float64Array(frame_length)
    for (let j = 0; j < frame_length; j++) f[j] = src[start + j]
    frames[t] = f
  }
  return frames
}

/**
 * Kronecker product of a 2x2 switching matrix with a (p x p) pitch-band block,
 * producing the (2p x 2p) pYIN transition matrix — exactly numpy's
 * np.kron(t_switch, transition).
 * @param {number[][]} t2 - 2x2 voiced/unvoiced switching matrix.
 * @param {ArrayLike<ArrayLike<number>>} block - p x p local transition matrix.
 * @returns {Float64Array[]}
 */
function kron2(t2, block) {
  const p = block.length
  const n = 2 * p
  const out = new Array(n)
  for (let r = 0; r < n; r++) out[r] = new Float64Array(n)
  for (let bi = 0; bi < 2; bi++) {
    for (let bj = 0; bj < 2; bj++) {
      const s = t2[bi][bj]
      const colBase = bj * p
      for (let k = 0; k < p; k++) {
        const orow = out[bi * p + k]
        const brow = block[k]
        for (let l = 0; l < p; l++) orow[colBase + l] = s * brow[l]
      }
    }
  }
  return out
}

/**
 * Regularized incomplete beta function I_x(a, b) = scipy.stats.beta.cdf(x, a, b).
 * Numerical-Recipes continued-fraction evaluation (betacf); accurate to ~1e-12.
 * @param {number} a
 * @param {number} b
 * @param {number} x - in [0, 1]
 * @returns {number}
 */
function betainc(a, b, x) {
  if (x <= 0) return 0
  if (x >= 1) return 1
  const lbeta = gammaln(a) + gammaln(b) - gammaln(a + b)
  const front = Math.exp(a * Math.log(x) + b * Math.log(1 - x) - lbeta)
  if (x < (a + 1) / (a + b + 2)) return (front * betacf(a, b, x)) / a
  return 1 - (front * betacf(b, a, 1 - x)) / b
}

/** Continued fraction for the incomplete beta function (Lentz's method). */
function betacf(a, b, x) {
  const MAXIT = 300
  const EPS = 3e-14
  const FPMIN = 1e-300
  const qab = a + b
  const qap = a + 1
  const qam = a - 1
  let c = 1
  let d = 1 - (qab * x) / qap
  if (Math.abs(d) < FPMIN) d = FPMIN
  d = 1 / d
  let h = d
  for (let m = 1; m <= MAXIT; m++) {
    const m2 = 2 * m
    let aa = (m * (b - m) * x) / ((qam + m2) * (a + m2))
    d = 1 + aa * d
    if (Math.abs(d) < FPMIN) d = FPMIN
    c = 1 + aa / c
    if (Math.abs(c) < FPMIN) c = FPMIN
    d = 1 / d
    h *= d * c
    aa = (-(a + m) * (qab + m) * x) / ((a + m2) * (qap + m2))
    d = 1 + aa * d
    if (Math.abs(d) < FPMIN) d = FPMIN
    c = 1 + aa / c
    if (Math.abs(c) < FPMIN) c = FPMIN
    d = 1 / d
    const del = d * c
    h *= del
    if (Math.abs(del - 1) < EPS) break
  }
  return h
}

/** Log Gamma via the Lanczos approximation (matches scipy.special.gammaln). */
function gammaln(x) {
  const g = [
    76.18009172947146, -86.50532032941677, 24.01409824083091,
    -1.231739572450155, 0.1208650973866179e-2, -0.5395239384953e-5,
  ]
  let y = x
  let tmp = x + 5.5
  tmp -= (x + 0.5) * Math.log(tmp)
  let ser = 1.000000000190015
  for (let j = 0; j < 6; j++) {
    y += 1
    ser += g[j] / y
  }
  return -tmp + Math.log((2.5066282746310005 * ser) / x)
}

/**
 * scipy.stats.boltzmann.pmf(k, lambda_, N) — truncated discrete exponential.
 * pmf(k) = (1 - e^-λ) e^-λk / (1 - e^-λN) for k in {0, 1, ..., N-1}.
 * Only evaluated on the valid support (N >= 1, 0 <= k <= N-1) by the caller.
 * @param {number} k
 * @param {number} lambda_
 * @param {number} N
 * @returns {number}
 */
function boltzmannPmf(k, lambda_, N) {
  const e = Math.exp(-lambda_)
  return ((1 - e) * Math.exp(-lambda_ * k)) / (1 - Math.exp(-lambda_ * N))
}

/**
 * Local minima of a 1-D array with librosa.util.localmin edge semantics
 * (edge-padded): out[i] = (x[i] < x[i+1]) && (x[i] <= x[i-1]); the last index
 * is never a local min, the first uses its own value as the left neighbor.
 * @param {ArrayLike<number>} x
 * @returns {Uint8Array}
 */
function localmin1d(x) {
  const n = x.length
  const out = new Uint8Array(n)
  for (let i = 0; i < n; i++) {
    const prev = i > 0 ? x[i - 1] : x[i]
    const next = i < n - 1 ? x[i + 1] : x[i]
    out[i] = x[i] < next && x[i] <= prev ? 1 : 0
  }
  return out
}

/** Round half to even (numpy np.round / np.rint) for pitch-bin quantization. */
function rint(x) {
  const r = Math.round(x)
  if (Math.abs(x - Math.trunc(x)) === 0.5) {
    const fl = Math.floor(x)
    return fl % 2 === 0 ? fl : fl + 1
  }
  return r
}

/**
 * Compute YIN difference function
 * @param {Float32Array} frame - Audio frame
 * @param {number} max_lag - Maximum lag
 * @returns {Float32Array} Difference function
 */
function compute_yin_difference(frame, max_lag) {
  const df = new Float32Array(max_lag)

  for (let tau = 0; tau < max_lag; tau++) {
    let sum = 0
    for (let j = 0; j < frame.length - max_lag; j++) {
      const delta = frame[j] - frame[j + tau]
      sum += delta * delta
    }
    df[tau] = sum
  }

  return df
}

/**
 * Compute cumulative mean normalized difference function
 * @param {Float32Array} df - Difference function
 * @returns {Float32Array} CMND function
 */
function cumulative_mean_normalized_difference(df) {
  const cmnd = new Float32Array(df.length)
  cmnd[0] = 1.0

  let running_sum = 0
  for (let tau = 1; tau < df.length; tau++) {
    running_sum += df[tau]
    cmnd[tau] = df[tau] / (running_sum / tau)
  }

  return cmnd
}

/**
 * Parabolic interpolation for sub-sample peak location
 * @param {Float32Array} arr - Array to interpolate
 * @param {number} idx - Peak index
 * @returns {number} Interpolated peak location
 */
function parabolic_interpolation(arr, idx) {
  if (idx <= 0 || idx >= arr.length - 1) {
    return idx
  }

  const alpha = arr[idx - 1]
  const beta = arr[idx]
  const gamma = arr[idx + 1]

  const p = 0.5 * (alpha - gamma) / (alpha - 2 * beta + gamma)
  return idx + p
}

/**
 * Estimate pitch using autocorrelation method
 * @param {Float32Array} y - Audio time series
 * @param {number} sr - Sample rate
 * @param {number} fmin - Minimum frequency
 * @param {number} fmax - Maximum frequency
 * @param {number} frame_length - Frame length
 * @param {number} hop_length - Hop length
 * @returns {Float32Array} F0 estimates per frame
 */
export function autocorrelation_pitch(
  y,
  sr = 22050,
  fmin = 80.0,
  fmax = 400.0,
  frame_length = 2048,
  hop_length = 512,
) {
  const min_lag = Math.max(1, Math.floor(sr / fmax))
  const max_lag = Math.min(Math.floor(frame_length / 2), Math.floor(sr / fmin))

  const n_frames = Math.floor((y.length - frame_length) / hop_length) + 1
  const f0 = new Float32Array(n_frames)

  for (let i = 0; i < n_frames; i++) {
    const start = i * hop_length
    const frame = y.slice(start, start + frame_length)

    // Compute autocorrelation
    const ac = autocorrelate(frame, max_lag)

    // Find maximum in lag range
    let max_val = -Infinity
    let max_lag_idx = min_lag

    for (let lag = min_lag; lag < max_lag; lag++) {
      if (ac[lag] > max_val) {
        max_val = ac[lag]
        max_lag_idx = lag
      }
    }

    // Parabolic interpolation
    if (max_lag_idx > min_lag && max_lag_idx < max_lag - 1) {
      const refined_lag = parabolic_interpolation(ac, max_lag_idx)
      f0[i] = sr / refined_lag
    } else {
      f0[i] = sr / max_lag_idx
    }
  }

  return f0
}

/**
 * Compute autocorrelation
 * @param {Float32Array} frame - Audio frame
 * @param {number} max_lag - Maximum lag
 * @returns {Float32Array} Autocorrelation
 */
function autocorrelate(frame, max_lag) {
  const ac = new Float32Array(max_lag)

  for (let lag = 0; lag < max_lag; lag++) {
    let sum = 0
    for (let i = 0; i < frame.length - lag; i++) {
      sum += frame[i] * frame[i + lag]
    }
    ac[lag] = sum
  }

  // Normalize by lag 0 (optional)
  if (ac[0] > 0) {
    for (let lag = 0; lag < max_lag; lag++) {
      ac[lag] /= ac[0]
    }
  }

  return ac
}

/**
 * Convert pitch (Hz) to MIDI note number
 * @param {Float32Array|Array} pitches - Pitches in Hz
 * @returns {Float32Array} MIDI note numbers
 */
export function hz_to_midi_pitch(pitches) {
  const midi = new Float32Array(pitches.length)

  for (let i = 0; i < pitches.length; i++) {
    if (pitches[i] > 0) {
      midi[i] = 12 * Math.log2(pitches[i] / 440.0) + 69
    } else {
      midi[i] = 0
    }
  }

  return midi
}

/**
 * Estimate pitch salience (confidence)
 * @param {Float32Array} y - Audio time series
 * @param {Float32Array} f0 - F0 estimates
 * @param {number} sr - Sample rate
 * @param {number} hop_length - Hop length
 * @returns {Float32Array} Salience values [0, 1]
 */
export function pitch_salience(y, f0, sr = 22050, hop_length = 512) {
  const n_frames = f0.length
  const salience = new Float32Array(n_frames)

  for (let i = 0; i < n_frames; i++) {
    if (f0[i] === 0) {
      salience[i] = 0
      continue
    }

    const start = i * hop_length
    const frame_length = 2048
    const frame = y.slice(start, Math.min(start + frame_length, y.length))

    // Compute autocorrelation at the estimated pitch period
    const period = Math.round(sr / f0[i])

    if (period > 0 && period < frame.length / 2) {
      let sum_prod = 0
      let sum_sq1 = 0
      let sum_sq2 = 0

      for (let j = 0; j < frame.length - period; j++) {
        sum_prod += frame[j] * frame[j + period]
        sum_sq1 += frame[j] * frame[j]
        sum_sq2 += frame[j + period] * frame[j + period]
      }

      // Normalized correlation coefficient
      const denom = Math.sqrt(sum_sq1 * sum_sq2)
      if (denom > 0) {
        salience[i] = Math.max(0, Math.min(1, sum_prod / denom))
      }
    }
  }

  return salience
}

/**
 * Smooth pitch contour using median filtering
 * @param {Float32Array} f0 - F0 estimates
 * @param {number} window_size - Median filter window size (odd number)
 * @returns {Float32Array} Smoothed F0
 */
export function smooth_pitch(f0, window_size = 5) {
  const half_window = Math.floor(window_size / 2)
  const smoothed = new Float32Array(f0.length)

  for (let i = 0; i < f0.length; i++) {
    const window = []

    for (let j = Math.max(0, i - half_window); j <= Math.min(f0.length - 1, i + half_window); j++) {
      if (f0[j] > 0) {
        window.push(f0[j])
      }
    }

    if (window.length > 0) {
      window.sort((a, b) => a - b)
      smoothed[i] = window[Math.floor(window.length / 2)]
    } else {
      smoothed[i] = 0
    }
  }

  return smoothed
}

/**
 * Given a collection of pitches, estimate its tuning offset (in fractions of a bin)
 * Port of librosa.pitch_tuning
 *
 * This function estimates the deviation from 12-tone equal temperament (12-TET)
 * by analyzing the distribution of pitch deviations from semitone centers.
 *
 * @param {Array|Float32Array} frequencies - Collection of frequencies in Hz
 * @param {number} resolution - Resolution of tuning offset (default: 0.01 semitones)
 * @param {number} bins_per_octave - Number of bins per octave (default: 12 for semitones)
 * @returns {number} Tuning offset in fractions of bins_per_octave
 *
 * @example
 * // If frequencies are tuned 0.2 semitones sharp
 * pitch_tuning([442, 496, 590])  // ~0.2
 */
export function pitch_tuning(frequencies, resolution = 0.01, bins_per_octave = 12) {
  if (!frequencies || frequencies.length === 0) {
    return 0.0
  }

  // Filter out zero/invalid frequencies
  const valid_freqs = []
  for (let i = 0; i < frequencies.length; i++) {
    if (frequencies[i] > 0 && isFinite(frequencies[i])) {
      valid_freqs.push(frequencies[i])
    }
  }

  if (valid_freqs.length === 0) {
    return 0.0
  }

  // Convert frequencies to fractional bin numbers
  const bins = valid_freqs.map(f => bins_per_octave * Math.log2(f / 440.0))

  // Compute deviation from nearest bin (fractional part)
  const deviations = bins.map(b => {
    const deviation = b - Math.round(b)
    // Wrap to [-0.5, 0.5]
    if (deviation > 0.5) return deviation - 1.0
    if (deviation < -0.5) return deviation + 1.0
    return deviation
  })

  // Create histogram of deviations at specified resolution
  const nbins = Math.ceil(1.0 / resolution)
  const histogram = new Float32Array(nbins)

  for (let i = 0; i < deviations.length; i++) {
    // Map deviation from [-0.5, 0.5] to histogram bin [0, nbins-1]
    const bin_idx = Math.floor((deviations[i] + 0.5) * nbins)
    const clamped_idx = Math.max(0, Math.min(nbins - 1, bin_idx))
    histogram[clamped_idx]++
  }

  // Find the bin with maximum count (mode of distribution)
  let max_count = 0
  let max_idx = 0
  for (let i = 0; i < nbins; i++) {
    if (histogram[i] > max_count) {
      max_count = histogram[i]
      max_idx = i
    }
  }

  // Convert histogram bin back to tuning offset
  const tuning_offset = (max_idx / nbins) - 0.5

  return tuning_offset
}

/**
 * Estimate the tuning of an audio time series or spectrogram input
 * Port of librosa.estimate_tuning
 *
 * @param {Float32Array} y - Audio time series (optional if S provided)
 * @param {number} sr - Sample rate (default: 22050)
 * @param {Array} S - Spectrogram (optional if y provided)
 * @param {number} n_fft - FFT window size (default: 2048)
 * @param {number} resolution - Resolution of tuning offset (default: 0.01)
 * @param {number} bins_per_octave - Number of bins per octave (default: 12)
 * @param {Object} kwargs - Additional arguments passed to piptrack
 * @returns {number} Tuning deviation from A440 in fractions of bins_per_octave
 *
 * @example
 * const tuning = estimate_tuning(audioData, 22050)
 * console.log(`Audio is ${tuning * 100} cents sharp`)
 */
export function estimate_tuning(
  y = null,
  sr = 22050,
  S = null,
  n_fft = 2048,
  resolution = 0.01,
  bins_per_octave = 12,
  kwargs = {}
) {
  // Extract pitch using piptrack (defined in this module)
  const {pitches, magnitudes} = piptrack(
    y,
    sr,
    S,
    n_fft,
    kwargs.hop_length || 512,
    kwargs.fmin || 150.0,
    kwargs.fmax || 4000.0,
    kwargs.threshold || 0.1
  )

  // Collect all detected pitches weighted by magnitude
  const frequencies = []

  for (let t = 0; t < pitches[0].length; t++) {
    for (let f = 0; f < pitches.length; f++) {
      const pitch = pitches[f][t]
      const mag = magnitudes[f][t]

      // Only include strong, valid pitches
      if (pitch > 0 && mag > 0.1) {
        // Weight by magnitude (add multiple copies based on magnitude)
        const weight = Math.max(1, Math.floor(mag * 10))
        for (let w = 0; w < weight; w++) {
          frequencies.push(pitch)
        }
      }
    }
  }

  // Estimate tuning from collected frequencies
  return pitch_tuning(frequencies, resolution, bins_per_octave)
}

/**
 * Check the feasibility of YIN/pYIN parameters — matches librosa's
 * __check_yin_params (0 < fmin < fmax <= sr/2 and sr/fmin < frame_length - 1).
 * Failure paths throw with a diagnostic; nothing is silently clamped.
 *
 * @param {number} sr - Sample rate
 * @param {number} fmax - Maximum frequency
 * @param {number} fmin - Minimum frequency
 * @param {number} frame_length - Frame length in samples
 * @throws {Error} If parameters are invalid
 */
function __check_yin_params(sr, fmax, fmin, frame_length) {
  if (fmin == null || fmax == null) {
    throw new Error('pyin/yin: both fmin and fmax must be provided')
  }
  if (fmax > sr / 2) {
    throw new Error(`pyin/yin: fmax=${fmax} cannot exceed Nyquist frequency ${sr / 2}`)
  }
  if (fmin >= fmax) {
    throw new Error(`pyin/yin: fmin=${fmin} must be less than fmax=${fmax}`)
  }
  if (fmin <= 0) {
    throw new Error(`pyin/yin: fmin=${fmin} must be strictly positive`)
  }
  if (sr / fmin >= frame_length - 1) {
    throw new Error(
      `pyin/yin: fmin=${fmin} is too small for frame_length=${frame_length} and sr=${sr} ` +
        '(at least one period of fmin must fit in a frame)',
    )
  }
}

/**
 * Cumulative mean normalized difference function for YIN/pYIN — librosa parity.
 *
 * Reproduces librosa._cumulative_mean_normalized_difference exactly:
 *   d(p)   = 2 * (ACF(0) - ACF(p)) - E(p-1),  d(0) = 0
 *   d'(p)  = d(p) / ( (1/p) * Σ_{j=1..p} d(j) + tiny )
 * where ACF is the linear autocorrelation and E the cumulative frame energy.
 * Returns the CMND restricted to lags [min_period, max_period] (frame-major).
 *
 * @param {Float64Array[]} y_frames - Framed audio [n_frames][frame_length].
 * @param {number} min_period - Minimum period (samples).
 * @param {number} max_period - Maximum period (samples).
 * @returns {Float64Array[]} CMND values [n_frames][max_period - min_period + 1].
 */
function _cumulative_mean_normalized_difference(y_frames, min_period, max_period) {
  const n_frames = y_frames.length
  const n_lags = max_period - min_period + 1
  // float32 tiny — librosa's util.tiny over the (float32) frame dtype. Only
  // matters when the denominator is ~0 (silent frames → CMND = 0).
  const TINY = 1.1754944e-38
  const out = new Array(n_frames)

  for (let f = 0; f < n_frames; f++) {
    const frame = y_frames[f]
    const L = frame.length

    // Linear autocorrelation ACF(k) = Σ_j y[j] y[j+k], k = 0..max_period.
    const acf = new Float64Array(max_period + 1)
    for (let k = 0; k <= max_period; k++) {
      let s = 0
      const lim = L - k
      for (let j = 0; j < lim; j++) s += frame[j] * frame[j + k]
      acf[k] = s
    }

    // Cumulative energy E(n) = Σ_{m<=n} y[m]^2 (only lags up to max_period-1).
    const energy = new Float64Array(max_period)
    let e = 0
    for (let n = 0; n < max_period; n++) {
      e += frame[n] * frame[n]
      energy[n] = e
    }

    // Difference + cumulative-mean normalization in one sweep over periods.
    const cmnd = new Float64Array(n_lags)
    let cumsumD = 0
    for (let p = 1; p <= max_period; p++) {
      const d = 2 * (acf[0] - acf[p]) - energy[p - 1]
      cumsumD += d
      if (p >= min_period) {
        cmnd[p - min_period] = d / (cumsumD / p + TINY)
      }
    }
    out[f] = cmnd
  }

  return out
}

/**
 * Piecewise parabolic interpolation for YIN/pYIN — librosa parity.
 *
 * Applies librosa's _pi_stencil per lag: with a = x[i+1]+x[i-1]-2·x[i] and
 * b = (x[i+1]-x[i-1])/2, the sub-sample shift is -b/a, but is forced to 0 when
 * |b| >= |a| (i.e. the parabola optimum lies outside [i-1, i+1]). Edge lags
 * (first/last) get a shift of 0. Operates frame-major on the CMND matrix.
 *
 * @param {Float64Array[]} x - CMND values [n_frames][n_lags].
 * @returns {Float64Array[]} Parabolic shifts, same shape.
 */
function _parabolic_interpolation(x) {
  const n_frames = x.length
  const shifts = new Array(n_frames)
  for (let f = 0; f < n_frames; f++) {
    const row = x[f]
    const n = row.length
    const s = new Float64Array(n) // edges (0, n-1) remain 0
    for (let i = 1; i < n - 1; i++) {
      const a = row[i + 1] + row[i - 1] - 2 * row[i]
      const b = (row[i + 1] - row[i - 1]) / 2
      s[i] = Math.abs(b) >= Math.abs(a) ? 0 : -b / a
    }
    shifts[f] = s
  }
  return shifts
}

/**
 * pYIN observation-probability builder — librosa parity (__pyin_helper).
 *
 * For each frame: find CMND troughs (local minima), then for every trough that
 * falls below a given threshold add a Boltzmann-over-rank × beta-over-threshold
 * weight; the global-minimum trough also receives `no_trough_prob` mass for the
 * thresholds it did not clear. Each trough's total is scattered onto the
 * log-spaced pitch grid (parabolic-refined period → f0 → bin). The unvoiced
 * state block absorbs the residual (1 - voiced_prob) uniformly.
 *
 * @param {Float64Array[]} yin_frames - CMND [n_frames][n_lags].
 * @param {Float64Array[]} parabolic_shifts - Sub-sample shifts [n_frames][n_lags].
 * @param {number} sr - Sample rate.
 * @param {Float64Array} thresholds - Threshold grid linspace(0, 1, n+1).
 * @param {number} boltzmann_parameter - Boltzmann prior over trough rank.
 * @param {Float64Array} beta_probs - Beta pmf over the n threshold bins.
 * @param {number} no_trough_prob - Best-guess mass for the global minimum.
 * @param {number} min_period - Minimum period (samples).
 * @param {number} fmin - Minimum frequency (Hz).
 * @param {number} n_pitch_bins - Voiced pitch-grid size.
 * @param {number} n_bins_per_semitone - Grid resolution.
 * @returns {{ observation_probs: Float64Array[], voiced_prob: Float64Array }}
 *   observation_probs is [2*n_pitch_bins][n_frames] (voiced block then unvoiced).
 */
function __pyin_helper(
  yin_frames,
  parabolic_shifts,
  sr,
  thresholds,
  boltzmann_parameter,
  beta_probs,
  no_trough_prob,
  min_period,
  fmin,
  n_pitch_bins,
  n_bins_per_semitone,
) {
  const n_frames = yin_frames.length
  const n_thresholds = beta_probs.length // = thresholds.length - 1

  const n_states = 2 * n_pitch_bins
  const observation_probs = new Array(n_states)
  for (let s = 0; s < n_states; s++) observation_probs[s] = new Float64Array(n_frames)
  const voiced_prob = new Float64Array(n_frames)

  for (let f = 0; f < n_frames; f++) {
    const frame = yin_frames[f]
    const shifts = parabolic_shifts[f]
    const n_lags = frame.length

    // Troughs = local minima (index 0 uses the < right-neighbor rule).
    const isTrough = localmin1d(frame)
    isTrough[0] = n_lags > 1 && frame[0] < frame[1] ? 1 : 0

    const troughIdx = []
    for (let i = 0; i < n_lags; i++) if (isTrough[i]) troughIdx.push(i)
    if (troughIdx.length === 0) continue // no candidate → voiced_prob[f] stays 0

    const nT = troughIdx.length
    const troughHeights = new Float64Array(nT)
    for (let t = 0; t < nT; t++) troughHeights[t] = frame[troughIdx[t]]

    // Accumulate each trough's observation weight across the threshold ensemble.
    const probs = new Float64Array(nT)
    for (let j = 0; j < n_thresholds; j++) {
      const cut = thresholds[j + 1]
      // Boltzmann N = number of troughs below this threshold.
      let N = 0
      for (let t = 0; t < nT; t++) if (troughHeights[t] < cut) N++
      if (N === 0) continue
      const bp = beta_probs[j]
      // Rank the below-threshold troughs in ascending lag order (0-based).
      let rank = 0
      for (let t = 0; t < nT; t++) {
        if (troughHeights[t] < cut) {
          probs[t] += boltzmannPmf(rank, boltzmann_parameter, N) * bp
          rank++
        }
      }
    }

    // Bias the global-minimum trough with no_trough_prob mass for the thresholds
    // it never fell below (librosa's best-guess-when-no-trough contribution).
    let gMin = 0
    for (let t = 1; t < nT; t++) if (troughHeights[t] < troughHeights[gMin]) gMin = t
    let nThreshBelowMinComplement = 0
    for (let j = 0; j < n_thresholds; j++) {
      if (!(troughHeights[gMin] < thresholds[j + 1])) nThreshBelowMinComplement++
    }
    let extra = 0
    for (let j = 0; j < nThreshBelowMinComplement; j++) extra += beta_probs[j]
    probs[gMin] += no_trough_prob * extra

    // Scatter trough probabilities onto the pitch grid. Ascending lag order
    // means the highest-lag trough wins any same-bin collision (matches the
    // row-major np.nonzero assignment order in librosa).
    for (let t = 0; t < nT; t++) {
      const p = probs[t]
      if (p === 0) continue
      const lag = troughIdx[t]
      const period = min_period + lag + shifts[lag]
      const f0c = sr / period
      let bin = rint(12 * n_bins_per_semitone * Math.log2(f0c / fmin))
      if (bin < 0) bin = 0
      else if (bin > n_pitch_bins) bin = n_pitch_bins
      observation_probs[bin][f] = p
    }
  }

  // Voiced probability = summed voiced-state mass; unvoiced block fills residual.
  for (let f = 0; f < n_frames; f++) {
    let vs = 0
    for (let b = 0; b < n_pitch_bins; b++) vs += observation_probs[b][f]
    if (vs < 0) vs = 0
    else if (vs > 1) vs = 1
    voiced_prob[f] = vs
    const fill = (1 - vs) / n_pitch_bins
    for (let b = n_pitch_bins; b < n_states; b++) observation_probs[b][f] = fill
  }

  return { observation_probs, voiced_prob }
}
