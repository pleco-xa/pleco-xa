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
 * Compute the harmonic salience function
 *
 * Salience measures how well the energy distribution matches a harmonic template.
 *
 * @param {Array<Array<number>>} S - Spectrogram or time-frequency representation [freq x time]
 * @param {Array<number>} freqs - Frequency values [freq]
 * @param {Array<number>} harmonics - Harmonic numbers to consider [1, 2, 3, ...]
 * @param {Array<number>|null} weights - Weights for each harmonic (default: null, uniform)
 * @param {Function|null} aggregate - Aggregation function (default: null, uses weighted sum)
 * @param {boolean} filter_peaks - Apply peak filtering before aggregation
 * @param {number} fill_value - Fill value for out-of-bounds
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

  // Default weights (uniform)
  if (weights === null) {
    weights = Array(n_harmonics).fill(1.0 / n_harmonics)
  }

  if (weights.length !== n_harmonics) {
    throw new Error('weights length must match harmonics length')
  }

  // Get harmonic energies for all frequency bins
  const harmonic_energies = interp_harmonics(S, freqs, harmonics, kind, fill_value, axis)

  // Apply peak filtering if requested
  let filtered_energies = harmonic_energies
  if (filter_peaks) {
    filtered_energies = harmonic_energies.map(h_matrix =>
      h_matrix.map(freq_row =>
        freq_row.map((val, t) => {
          // Simple peak detection: keep only local maxima
          if (t === 0 || t === n_frames - 1) return val
          const is_peak = val > freq_row[t - 1] && val > freq_row[t + 1]
          return is_peak ? val : 0
        })
      )
    )
  }

  // Aggregate harmonics
  const salience_output = Array(n_freqs).fill(null).map(() => Array(n_frames).fill(0))

  if (aggregate === null) {
    // Default: weighted sum
    for (let f = 0; f < n_freqs; f++) {
      for (let t = 0; t < n_frames; t++) {
        let sum = 0
        for (let h = 0; h < n_harmonics; h++) {
          const val = filtered_energies[h][f][t]
          if (isFinite(val)) {
            sum += weights[h] * val
          }
        }
        salience_output[f][t] = sum
      }
    }
  } else {
    // Custom aggregation function
    for (let f = 0; f < n_freqs; f++) {
      for (let t = 0; t < n_frames; t++) {
        const harmonic_values = filtered_energies.map(h => h[f][t])
        salience_output[f][t] = aggregate(harmonic_values, weights)
      }
    }
  }

  return salience_output
}

// ============================================================================
// Helper Functions
// ============================================================================

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
