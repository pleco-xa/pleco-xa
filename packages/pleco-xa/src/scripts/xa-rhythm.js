/**
 * Port of librosa.beat
 * Unified rhythm analysis: beat tracking, tempo estimation, and downbeat detection
 * Librosa-compatible rhythm analysis for JavaScript
 */

import { stft } from './xa-fft.js'

/**
 * Beat tracking using dynamic programming
 * Port of librosa.beat.beat_track
 * @param {Float32Array} y - Audio time series (optional if onset_envelope provided)
 * @param {number} sr - Sample rate
 * @param {Array} onset_envelope - Pre-computed onset strength envelope
 * @param {number} hop_length - Hop length
 * @param {number} start_bpm - Initial tempo estimate
 * @param {number} tightness - Tightness of beat distribution around tempo
 * @param {boolean} trim - Trim leading/trailing beats outside signal
 * @param {number} bpm - Pre-specified tempo (skips tempo estimation)
 * @param {boolean} units - Return beat times in 'time' (seconds) or 'frames'
 * @returns {Object} {tempo: number, beats: Array} - estimated tempo and beat positions
 */
export function beat_track(
  y = null,
  sr = 22050,
  onset_envelope = null,
  hop_length = 512,
  start_bpm = 120,
  tightness = 100,
  trim = true,
  bpm = null,
  units = 'frames',
) {
  // Compute onset envelope if not provided
  let oenv = onset_envelope
  if (oenv === null) {
    if (y === null) {
      throw new Error('Either y or onset_envelope must be provided')
    }
    oenv = compute_onset_strength(y, sr, hop_length)
  }

  // Estimate tempo if not provided
  let estimated_tempo = bpm
  if (estimated_tempo === null) {
    estimated_tempo = estimate_tempo_from_onsets(oenv, sr, hop_length, start_bpm)
  }

  // Convert tempo to lag (frames per beat)
  const period = (60.0 * sr) / (estimated_tempo * hop_length)

  // Dynamic programming beat tracking
  const beats = dp_beat_track(oenv, period, tightness)

  // Trim beats if requested
  let final_beats = beats
  if (trim && final_beats.length > 0) {
    final_beats = final_beats.filter((b) => b >= 0 && b < oenv.length)
  }

  // Convert to time if requested
  if (units === 'time') {
    final_beats = final_beats.map((b) => (b * hop_length) / sr)
  }

  return {
    tempo: estimated_tempo,
    beats: final_beats,
  }
}

/**
 * Estimate tempo from onset strength envelope
 * @param {Float32Array} y - Audio time series
 * @param {number} sr - Sample rate
 * @param {Array} onset_envelope - Pre-computed onset strength
 * @param {number} hop_length - Hop length
 * @param {number} start_bpm - Starting tempo for search
 * @returns {number} Estimated tempo in BPM
 */
export function tempo(
  y = null,
  sr = 22050,
  onset_envelope = null,
  hop_length = 512,
  start_bpm = 120,
) {
  // Compute onset envelope if not provided
  let oenv = onset_envelope
  if (oenv === null) {
    if (y === null) {
      throw new Error('Either y or onset_envelope must be provided')
    }
    oenv = compute_onset_strength(y, sr, hop_length)
  }

  // Estimate tempo
  return estimate_tempo_from_onsets(oenv, sr, hop_length, start_bpm)
}

// Helper functions
function compute_onset_strength(y, sr, hop_length) {
  const D = stft(y, 2048, hop_length, null, 'hann', true, 'constant')
  const n_freq = D.length
  const n_frames = D[0] ? D[0].length : 0

  const mag = Array(n_freq).fill(null).map(() => new Float32Array(n_frames))
  for (let f = 0; f < n_freq; f++) {
    for (let t = 0; t < n_frames; t++) {
      const bin = D[f][t]
      mag[f][t] = Math.sqrt(bin.real * bin.real + bin.imag * bin.imag)
    }
  }

  const oenv = new Float32Array(n_frames)
  for (let t = 1; t < n_frames; t++) {
    let flux = 0
    for (let f = 0; f < n_freq; f++) {
      flux += Math.max(0, mag[f][t] - mag[f][t - 1])
    }
    oenv[t] = flux
  }
  return oenv
}

function estimate_tempo_from_onsets(oenv, sr, hop_length, start_bpm = 120) {
  const min_bpm = 30
  const max_bpm = 300
  const min_lag = Math.floor((60 * sr) / (max_bpm * hop_length))
  const max_lag = Math.floor((60 * sr) / (min_bpm * hop_length))

  const ac = autocorrelate_onset(oenv, max_lag)
  let best_lag = min_lag
  let best_strength = -Infinity

  for (let lag = min_lag; lag <= max_lag && lag < ac.length; lag++) {
    if (ac[lag] > best_strength) {
      best_strength = ac[lag]
      best_lag = lag
    }
  }

  const tempo_bpm = (60 * sr) / (best_lag * hop_length)
  return Math.max(min_bpm, Math.min(max_bpm, tempo_bpm))
}

function autocorrelate_onset(oenv, max_lag) {
  const n = oenv.length
  const ac = new Float32Array(Math.min(max_lag + 1, n))

  for (let lag = 0; lag < ac.length; lag++) {
    let sum = 0
    for (let i = 0; i < n - lag; i++) {
      sum += oenv[i] * oenv[i + lag]
    }
    ac[lag] = sum
  }

  if (ac[0] > 0) {
    for (let i = 0; i < ac.length; i++) {
      ac[i] /= ac[0]
    }
  }
  return ac
}

function dp_beat_track(oenv, period, tightness = 100) {
  const n_frames = oenv.length
  if (n_frames === 0) return []

  const score = new Float32Array(n_frames).fill(-Infinity)
  const backlink = new Int32Array(n_frames).fill(-1)

  const first_beat = Math.floor(period / 2)
  score[first_beat] = oenv[first_beat]

  for (let t = 1; t < n_frames; t++) {
    const window = Math.floor(period * 0.5)
    const start = Math.max(0, t - Math.floor(period) - window)
    const end = Math.min(n_frames, t - Math.floor(period) + window)

    for (let prev_t = start; prev_t < end; prev_t++) {
      if (score[prev_t] === -Infinity) continue

      const interval = t - prev_t
      const deviation = Math.abs(interval - period)
      const transition = Math.exp(-tightness * (deviation / period) ** 2)
      const candidate_score = score[prev_t] + oenv[t] * transition

      if (candidate_score > score[t]) {
        score[t] = candidate_score
        backlink[t] = prev_t
      }
    }
  }

  const beats = []
  let current = 0
  for (let t = 0; t < n_frames; t++) {
    if (score[t] > score[current]) {
      current = t
    }
  }

  while (current >= 0) {
    beats.unshift(current)
    current = backlink[current]
  }

  return beats
}

/**
 * Predominant Local Pulse (PLP) estimation
 */
export function plp(y = null, sr = 22050, onset_envelope = null, hop_length = 512, win_length = 384) {
  let oenv = onset_envelope
  if (oenv === null) {
    if (y === null) throw new Error('Either y or onset_envelope must be provided')
    oenv = compute_onset_strength(y, sr, hop_length)
  }

  const n_frames = oenv.length
  const half_window = Math.floor(win_length / 2)
  const plp_curve = new Float32Array(n_frames)

  for (let t = 0; t < n_frames; t++) {
    const start = Math.max(0, t - half_window)
    const end = Math.min(n_frames, t + half_window)
    const window = Array.from(oenv.slice(start, end))

    if (window.length < 2) {
      plp_curve[t] = 0
      continue
    }

    const max_lag = Math.floor(window.length / 2)
    const ac = new Float32Array(max_lag)

    for (let lag = 1; lag < max_lag; lag++) {
      let sum = 0
      for (let i = 0; i < window.length - lag; i++) {
        sum += window[i] * window[i + lag]
      }
      ac[lag] = sum
    }

    plp_curve[t] = Math.max(...ac.slice(1))
  }

  const max_plp = Math.max(...plp_curve)
  if (max_plp > 0) {
    for (let i = 0; i < n_frames; i++) {
      plp_curve[i] /= max_plp
    }
  }

  return plp_curve
}

/**
 * Beat-synchronous feature aggregation
 */
export function beat_sync(data, beats, aggregate = 'mean') {
  const is_1d = !Array.isArray(data[0])

  if (is_1d) {
    const synced = new Float32Array(beats.length - 1)
    for (let i = 0; i < beats.length - 1; i++) {
      const segment = data.slice(beats[i], beats[i + 1])
      synced[i] = aggregate === 'mean' ? segment.reduce((a, b) => a + b, 0) / segment.length : Math.max(...segment)
    }
    return synced
  } else {
    const n_features = data.length
    const synced = Array(n_features).fill(null).map(() => new Float32Array(beats.length - 1))
    for (let f = 0; f < n_features; f++) {
      for (let i = 0; i < beats.length - 1; i++) {
        const segment = data[f].slice(beats[i], beats[i + 1])
        synced[f][i] = aggregate === 'mean' ? segment.reduce((a, b) => a + b, 0) / segment.length : Math.max(...segment)
      }
    }
    return synced
  }
}
