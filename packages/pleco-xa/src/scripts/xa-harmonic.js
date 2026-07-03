/**
 * Harmonic analysis functions
 * Based on librosa's harmonic.py module
 *
 * Provides:
 * - f0_harmonics - Extract energy at harmonics of fundamental frequency
 * - interp_harmonics - Interpolate harmonics from time-frequency representation
 * - salience - Compute harmonic salience function
 */

/**
 * Compute the energy at selected harmonics of a time-varying fundamental frequency
 *
 * @param {Array<Array<number>>} x - Time-frequency representation (e.g., spectrogram) [freq x time]
 * @param {Array<number>} f0 - Fundamental frequency curve in Hz [time]
 * @param {Array<number>} freqs - Frequency values for each row of x [freq]
 * @param {Array<number>} harmonics - Harmonic numbers to extract (e.g., [1, 2, 3, 4, 5])
 * @param {string} kind - Interpolation type ('linear', 'nearest', 'cubic')
 * @param {number} fill_value - Value for out-of-bounds harmonics
 * @param {number} axis - Frequency axis (default: -2, i.e., first axis)
 * @returns {Array<Array<number>>} Energy at harmonics [n_harmonics x time]
 */
export function f0_harmonics(
  x,
  f0,
  freqs,
  harmonics,
  kind = 'linear',
  fill_value = 0,
  axis = -2
) {
  const n_freqs = x.length
  const n_frames = x[0].length
  const n_harmonics = harmonics.length

  // Validate inputs
  if (f0.length !== n_frames) {
    throw new Error('f0 length must match number of frames in x')
  }

  if (freqs.length !== n_freqs) {
    throw new Error('freqs length must match frequency dimension of x')
  }

  // Initialize output
  const output = Array(n_harmonics).fill(null).map(() => Array(n_frames).fill(fill_value))

  // For each frame
  for (let t = 0; t < n_frames; t++) {
    const f0_val = f0[t]

    // Skip if f0 is invalid
    if (!isFinite(f0_val) || f0_val <= 0) {
      continue
    }

    // For each harmonic
    for (let h = 0; h < n_harmonics; h++) {
      const harmonic_freq = f0_val * harmonics[h]

      // Interpolate energy at this harmonic frequency
      const energy = interpolate_at_frequency(x, freqs, harmonic_freq, t, kind, fill_value)
      output[h][t] = energy
    }
  }

  return output
}

/**
 * Compute the energy at harmonics of a time-frequency representation
 *
 * Similar to f0_harmonics, but harmonics are constant multiples rather than
 * varying with a fundamental frequency curve.
 *
 * @param {Array<Array<number>>} x - Time-frequency representation [freq x time]
 * @param {Array<number>} freqs - Frequency values [freq]
 * @param {Array<number>} harmonics - Harmonic ratios to extract
 * @param {string} kind - Interpolation type
 * @param {number} fill_value - Fill value for out-of-bounds
 * @param {number} axis - Frequency axis
 * @returns {Array<Array<number>>} Harmonic energies [n_harmonics x freq x time]
 */
export function interp_harmonics(
  x,
  freqs,
  harmonics,
  kind = 'linear',
  fill_value = 0,
  axis = -2
) {
  const n_freqs = x.length
  const n_frames = x[0].length
  const n_harmonics = harmonics.length

  if (freqs.length !== n_freqs) {
    throw new Error('freqs length must match frequency dimension of x')
  }

  // Initialize output [n_harmonics x n_freqs x n_frames]
  const output = Array(n_harmonics).fill(null).map(() =>
    Array(n_freqs).fill(null).map(() => Array(n_frames).fill(fill_value))
  )

  // For each frequency bin
  for (let f = 0; f < n_freqs; f++) {
    const base_freq = freqs[f]

    // For each harmonic
    for (let h = 0; h < n_harmonics; h++) {
      const harmonic_freq = base_freq * harmonics[h]

      // Interpolate at harmonic frequency for all time frames
      for (let t = 0; t < n_frames; t++) {
        const energy = interpolate_at_frequency(x, freqs, harmonic_freq, t, kind, fill_value)
        output[h][f][t] = energy
      }
    }
  }

  return output
}

/**
 * Compute the harmonic salience function (librosa.salience semantics)
 *
 * Salience measures how well the energy distribution matches a harmonic
 * template: aggregate (default: weighted MEAN, np.average) of the energy at
 * each bin's harmonics, then — when filter_peaks is true — keep salience only
 * where the ORIGINAL spectrogram has a local maximum along the FREQUENCY axis
 * (scipy.signal.argrelmax(S, axis=-2)); all other positions get fill_value.
 *
 * Tier-2 repair note (2026-07-02): the previous implementation filtered each
 * harmonic-energy row for local maxima along the TIME axis and aggregated by
 * weighted SUM — diverging from librosa whenever filter_peaks=true (the
 * default). Repaired to frequency-axis peaks of S + weighted average.
 *
 * @param {Array<Array<number>>} S - Spectrogram or time-frequency representation [freq x time]
 * @param {Array<number>} freqs - Frequency values [freq]
 * @param {Array<number>} harmonics - Harmonic numbers to consider [1, 2, 3, ...]
 * @param {Array<number>|null} weights - Weights for each harmonic (default: null, uniform)
 * @param {Function|null} aggregate - Aggregation fn(values, weights) per bin
 *   (default: null, weighted average like np.average — NaN propagates)
 * @param {boolean} filter_peaks - Keep only frequency-axis peaks of S (default: true)
 * @param {number} fill_value - Value for filtered-out / out-of-bounds bins (default: NaN)
 * @param {string} kind - Interpolation type
 * @param {number} axis - Frequency axis
 * @returns {Array<Array<number>>} Salience function [freq x time]
 */
export function salience(
  S,
  freqs,
  harmonics,
  weights = null,
  aggregate = null,
  filter_peaks = true,
  fill_value = NaN,
  kind = 'linear',
  axis = -2
) {
  const n_freqs = S.length
  const n_frames = S[0].length
  const n_harmonics = harmonics.length

  // Default weights (uniform, librosa: np.ones)
  if (weights === null) {
    weights = Array(n_harmonics).fill(1.0)
  }

  if (weights.length !== n_harmonics) {
    throw new Error('weights length must match harmonics length')
  }

  // Get harmonic energies for all frequency bins [n_harmonics x freq x time]
  const harmonic_energies = interp_harmonics(S, freqs, harmonics, kind, fill_value, axis)

  // Aggregate harmonics per (freq, time) bin.
  // Default matches np.average: sum(w*v)/sum(w), NaN propagating — librosa
  // does NOT skip non-finite harmonic values here.
  const salience_output = Array(n_freqs).fill(null).map(() => Array(n_frames).fill(0))

  if (aggregate === null) {
    let weightSum = 0
    for (let h = 0; h < n_harmonics; h++) weightSum += weights[h]
    for (let f = 0; f < n_freqs; f++) {
      for (let t = 0; t < n_frames; t++) {
        let sum = 0
        for (let h = 0; h < n_harmonics; h++) {
          sum += weights[h] * harmonic_energies[h][f][t]
        }
        salience_output[f][t] = sum / weightSum
      }
    }
  } else {
    // Custom aggregation function
    for (let f = 0; f < n_freqs; f++) {
      for (let t = 0; t < n_frames; t++) {
        const harmonic_values = harmonic_energies.map(h => h[f][t])
        salience_output[f][t] = aggregate(harmonic_values, weights)
      }
    }
  }

  if (filter_peaks) {
    // scipy.signal.argrelmax(S, axis=-2), mode='clip': a bin is a peak iff it
    // is STRICTLY greater than both frequency neighbors; edge rows are never
    // peaks (clipped self-comparison is false). Non-peak bins -> fill_value.
    const filtered = Array(n_freqs)
      .fill(null)
      .map(() => Array(n_frames).fill(fill_value))
    for (let f = 1; f < n_freqs - 1; f++) {
      for (let t = 0; t < n_frames; t++) {
        if (S[f][t] > S[f - 1][t] && S[f][t] > S[f + 1][t]) {
          filtered[f][t] = salience_output[f][t]
        }
      }
    }
    return filtered
  }

  return salience_output
}

// ============================================================================
// Helper Functions
// ============================================================================

/**
 * Core interpolation function for harmonic analysis
 * Implements scipy.interpolate.interp1d equivalent for JavaScript
 *
 * @private
 * @param {Array<number>} x_data - Input x coordinates (must be sorted)
 * @param {Array<number>} y_data - Input y values
 * @param {Array<number>} x_targets - Target x coordinates to interpolate
 * @param {string} kind - Interpolation type ('linear', 'nearest', 'cubic')
 * @param {number} fill_value - Value for out-of-bounds points
 * @param {boolean} assume_sorted - Whether x_data is pre-sorted
 * @returns {Array<number>} Interpolated values at x_targets
 */
function _f_interp_core(x_data, y_data, x_targets, kind = 'linear', fill_value = 0, assume_sorted = false) {
  if (x_data.length !== y_data.length) {
    throw new Error('x_data and y_data must have the same length')
  }

  const n = x_data.length
  if (n === 0) {
    return x_targets.map(() => fill_value)
  }

  // Sort if needed
  let x_sorted = x_data
  let y_sorted = y_data

  if (!assume_sorted) {
    const indices = Array.from({ length: n }, (_, i) => i)
    indices.sort((a, b) => x_data[a] - x_data[b])
    x_sorted = indices.map(i => x_data[i])
    y_sorted = indices.map(i => y_data[i])
  }

  // Interpolate each target
  const results = new Array(x_targets.length)

  for (let t = 0; t < x_targets.length; t++) {
    const target = x_targets[t]

    // Out of bounds - use fill_value
    if (target < x_sorted[0] || target > x_sorted[n - 1]) {
      if (kind === 'nearest') {
        results[t] = target < x_sorted[0] ? y_sorted[0] : y_sorted[n - 1]
      } else {
        results[t] = fill_value
      }
      continue
    }

    // Find bracketing indices
    let lower_idx = 0
    let upper_idx = n - 1

    for (let i = 0; i < n - 1; i++) {
      if (x_sorted[i] <= target && x_sorted[i + 1] >= target) {
        lower_idx = i
        upper_idx = i + 1
        break
      }
    }

    // Exact match
    if (x_sorted[lower_idx] === target) {
      results[t] = y_sorted[lower_idx]
      continue
    }

    // Interpolate based on kind
    if (kind === 'nearest') {
      const dist_lower = Math.abs(target - x_sorted[lower_idx])
      const dist_upper = Math.abs(target - x_sorted[upper_idx])
      results[t] = dist_lower < dist_upper ? y_sorted[lower_idx] : y_sorted[upper_idx]
    } else if (kind === 'linear') {
      const t_norm = (target - x_sorted[lower_idx]) / (x_sorted[upper_idx] - x_sorted[lower_idx])
      results[t] = (1 - t_norm) * y_sorted[lower_idx] + t_norm * y_sorted[upper_idx]
    } else if (kind === 'cubic') {
      // Catmull-Rom cubic interpolation
      const p0_idx = Math.max(0, lower_idx - 1)
      const p1_idx = lower_idx
      const p2_idx = upper_idx
      const p3_idx = Math.min(n - 1, upper_idx + 1)

      const p0 = y_sorted[p0_idx]
      const p1 = y_sorted[p1_idx]
      const p2 = y_sorted[p2_idx]
      const p3 = y_sorted[p3_idx]

      const t_norm = (target - x_sorted[lower_idx]) / (x_sorted[upper_idx] - x_sorted[lower_idx])
      const t2 = t_norm * t_norm
      const t3 = t2 * t_norm

      results[t] = 0.5 * (
        (2 * p1) +
        (-p0 + p2) * t_norm +
        (2 * p0 - 5 * p1 + 4 * p2 - p3) * t2 +
        (-p0 + 3 * p1 - 3 * p2 + p3) * t3
      )
    } else {
      results[t] = fill_value
    }
  }

  return results
}

/**
 * Harmonic interpolation helper - static frequency grid
 * Equivalent to librosa's _f_interps nested function
 *
 * Interpolates data at target frequencies, filtering out non-finite frequencies
 *
 * @private
 * @param {Array<number>} data - Data values to interpolate [n_freqs]
 * @param {Array<number>} freqs - Frequency grid [n_freqs]
 * @param {Array<number>} target_freqs - Target frequencies to interpolate at
 * @param {string} kind - Interpolation type ('linear', 'nearest', 'cubic')
 * @param {number} fill_value - Fill value for out-of-bounds
 * @returns {Array<number>} Interpolated values at target frequencies
 */
export function _f_interps(data, freqs, target_freqs, kind = 'linear', fill_value = 0) {
  // Filter finite frequencies and corresponding data
  const finite_indices = []
  for (let i = 0; i < freqs.length; i++) {
    if (isFinite(freqs[i]) && isFinite(data[i])) {
      finite_indices.push(i)
    }
  }

  if (finite_indices.length === 0) {
    return target_freqs.map(() => fill_value)
  }

  const filtered_freqs = finite_indices.map(i => freqs[i])
  const filtered_data = finite_indices.map(i => data[i])

  return _f_interp_core(filtered_freqs, filtered_data, target_freqs, kind, fill_value, false)
}

/**
 * Harmonic interpolation helper - dynamic frequency grid
 * Equivalent to librosa's _f_interpd nested function
 *
 * Interpolates data at target frequencies using a dynamic (per-frame) frequency grid
 *
 * @private
 * @param {Array<number>} data - Data values to interpolate [n_points]
 * @param {Array<number>} frequencies - Frequency grid (can vary per frame) [n_points]
 * @param {Array<number>} target_freqs - Target frequencies to interpolate at
 * @param {string} kind - Interpolation type ('linear', 'nearest', 'cubic')
 * @param {number} fill_value - Fill value for out-of-bounds
 * @returns {Array<number>} Interpolated values at target frequencies
 */
export function _f_interpd(data, frequencies, target_freqs, kind = 'linear', fill_value = 0) {
  // Filter finite frequency-data pairs
  const finite_indices = []
  for (let i = 0; i < frequencies.length; i++) {
    if (isFinite(frequencies[i]) && isFinite(data[i])) {
      finite_indices.push(i)
    }
  }

  if (finite_indices.length === 0) {
    return target_freqs.map(() => fill_value)
  }

  const filtered_frequencies = finite_indices.map(i => frequencies[i])
  const filtered_data = finite_indices.map(i => data[i])

  return _f_interp_core(filtered_frequencies, filtered_data, target_freqs, kind, fill_value, false)
}

/**
 * Harmonic interpolation - outer product variant
 * Equivalent to librosa's _f_interp nested function
 *
 * Interpolates using outer product of frequencies with harmonics
 * Used in interp_harmonics for computing harmonic energy across frequency grid
 *
 * @private
 * @param {Array<number>} freqs - Base frequency grid [n_freqs]
 * @param {Array<number>} data - Data values [n_freqs]
 * @param {Array<number>} harmonics - Harmonic multipliers (e.g., [0.5, 1, 2, 3])
 * @param {string} kind - Interpolation type ('linear', 'nearest', 'cubic')
 * @param {number} fill_value - Fill value for out-of-bounds
 * @returns {Array<Array<number>>} Interpolated harmonic data [n_freqs x n_harmonics]
 */
export function _f_interp(freqs, data, harmonics, kind = 'linear', fill_value = 0) {
  const n_freqs = freqs.length
  const n_harmonics = harmonics.length

  // Filter finite frequencies
  const finite_indices = []
  for (let i = 0; i < n_freqs; i++) {
    if (isFinite(freqs[i]) && isFinite(data[i])) {
      finite_indices.push(i)
    }
  }

  if (finite_indices.length === 0) {
    return Array(n_freqs).fill(null).map(() => Array(n_harmonics).fill(fill_value))
  }

  const filtered_freqs = finite_indices.map(i => freqs[i])
  const filtered_data = finite_indices.map(i => data[i])

  // Compute outer product: freqs[i] * harmonics[h]
  const result = Array(n_freqs).fill(null).map(() => Array(n_harmonics).fill(fill_value))

  for (let i = 0; i < n_freqs; i++) {
    const base_freq = freqs[i]
    if (!isFinite(base_freq)) continue

    const target_freqs = harmonics.map(h => base_freq * h)
    const interpolated = _f_interp_core(filtered_freqs, filtered_data, target_freqs, kind, fill_value, false)

    for (let h = 0; h < n_harmonics; h++) {
      result[i][h] = interpolated[h]
    }
  }

  return result
}

/**
 * Interpolate energy at a specific frequency for a given time frame
 *
 * @private
 */
function interpolate_at_frequency(x, freqs, target_freq, time_idx, kind, fill_value) {
  const n_freqs = freqs.length

  // Find bracketing frequency bins
  let lower_idx = -1
  let upper_idx = -1

  for (let i = 0; i < n_freqs - 1; i++) {
    if (freqs[i] <= target_freq && freqs[i + 1] >= target_freq) {
      lower_idx = i
      upper_idx = i + 1
      break
    }
  }

  // Out of bounds
  if (lower_idx === -1) {
    if (target_freq < freqs[0]) {
      return kind === 'nearest' ? x[0][time_idx] : fill_value
    } else if (target_freq > freqs[n_freqs - 1]) {
      return kind === 'nearest' ? x[n_freqs - 1][time_idx] : fill_value
    }
    return fill_value
  }

  // Exact match
  if (freqs[lower_idx] === target_freq) {
    return x[lower_idx][time_idx]
  }

  // Interpolation
  if (kind === 'nearest') {
    const dist_lower = Math.abs(target_freq - freqs[lower_idx])
    const dist_upper = Math.abs(target_freq - freqs[upper_idx])
    const nearest_idx = dist_lower < dist_upper ? lower_idx : upper_idx
    return x[nearest_idx][time_idx]
  } else if (kind === 'linear') {
    const t = (target_freq - freqs[lower_idx]) / (freqs[upper_idx] - freqs[lower_idx])
    return (1 - t) * x[lower_idx][time_idx] + t * x[upper_idx][time_idx]
  } else if (kind === 'cubic') {
    // Simplified cubic interpolation (using Catmull-Rom spline approximation)
    const t = (target_freq - freqs[lower_idx]) / (freqs[upper_idx] - freqs[lower_idx])

    // Get neighboring points for cubic interpolation
    const p0_idx = Math.max(0, lower_idx - 1)
    const p1_idx = lower_idx
    const p2_idx = upper_idx
    const p3_idx = Math.min(n_freqs - 1, upper_idx + 1)

    const p0 = x[p0_idx][time_idx]
    const p1 = x[p1_idx][time_idx]
    const p2 = x[p2_idx][time_idx]
    const p3 = x[p3_idx][time_idx]

    // Catmull-Rom spline
    const t2 = t * t
    const t3 = t2 * t

    const result = 0.5 * (
      (2 * p1) +
      (-p0 + p2) * t +
      (2 * p0 - 5 * p1 + 4 * p2 - p3) * t2 +
      (-p0 + 3 * p1 - 3 * p2 + p3) * t3
    )

    return result
  }

  return fill_value
}

/**
 * Compute harmonic product spectrum (HPS) for pitch detection
 *
 * Helper function that can be used with salience for robust pitch detection.
 *
 * @param {Array<number>} spectrum - Magnitude spectrum
 * @param {number} n_harmonics - Number of harmonics to multiply
 * @returns {Array<number>} Harmonic product spectrum
 */
export function harmonic_product_spectrum(spectrum, n_harmonics = 5) {
  const n = spectrum.length
  const hps = new Array(Math.floor(n / n_harmonics)).fill(1)

  for (let h = 1; h <= n_harmonics; h++) {
    for (let i = 0; i < hps.length; i++) {
      const idx = i * h
      if (idx < n) {
        hps[i] *= spectrum[idx]
      }
    }
  }

  return hps
}

/**
 * Compute harmonic sum spectrum (HSS) for pitch detection
 *
 * Alternative to HPS that sums instead of multiplies harmonics.
 *
 * @param {Array<number>} spectrum - Magnitude spectrum
 * @param {number} n_harmonics - Number of harmonics to sum
 * @param {Array<number>|null} weights - Weights for each harmonic
 * @returns {Array<number>} Harmonic sum spectrum
 */
export function harmonic_sum_spectrum(spectrum, n_harmonics = 5, weights = null) {
  const n = spectrum.length
  const hss = new Array(Math.floor(n / n_harmonics)).fill(0)

  if (weights === null) {
    weights = Array(n_harmonics).fill(1.0 / n_harmonics)
  }

  for (let h = 1; h <= n_harmonics; h++) {
    const weight = weights[h - 1]
    for (let i = 0; i < hss.length; i++) {
      const idx = i * h
      if (idx < n) {
        hss[i] += weight * spectrum[idx]
      }
    }
  }

  return hss
}
