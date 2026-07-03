/**
 * Rhythm utilities: predominant local pulse and beat-synchronous aggregation.
 *
 * NOTE (collision resolution, v2 wave 2): this module no longer exports
 * `beat_track` or `tempo` — the canonical engine lives in
 * ./xa-beat-tracker.js. The former ad-hoc onset/tempo/DP helpers that backed
 * the removed exports were deleted; plp() now consumes the canonical
 * onset_strength from ./xa-onset.js.
 */

import { onset_strength } from './xa-onset.js'

/**
 * Predominant Local Pulse (PLP) estimation
 */
export function plp(y = null, sr = 22050, onset_envelope = null, hop_length = 512, win_length = 384) {
  let oenv = onset_envelope
  if (oenv === null) {
    if (y === null) throw new Error('Either y or onset_envelope must be provided')
    oenv = onset_strength(y, { sr, hop_length })
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
