/**
 * Port of librosa.util normalization functions
 * Normalization and scaling utilities for audio and spectral data
 * Librosa-compatible normalization utilities for JavaScript
 */

/**
 * Normalize an array to unit norm
 * @param {Array|Float32Array} S - Input array (1D or 2D)
 * @param {number|null} norm - Normalization type (Infinity, -Infinity, 0, or p-norm)
 * @param {number} axis - Axis along which to normalize (0=columns, 1=rows, null=global)
 * @param {number} threshold - Threshold below which to avoid division (default: 1e-10)
 * @param {boolean} fill - Fill zeros with threshold value (default: false)
 * @returns {Array|Float32Array} Normalized array
 */
const _isRow = (x) => Array.isArray(x) || (ArrayBuffer.isView(x) && !(x instanceof DataView))


export function normalize(S, norm = Infinity, axis = null, threshold = 1e-10, fill = false) {
  // Handle 1D array
  if (!_isRow(S[0])) {
    const magnitude = compute_norm(S, norm)
    const scale = magnitude > threshold ? magnitude : (fill ? threshold : 1.0)
    return S.map((val) => val / scale)
  }

  // Handle 2D array
  const n_rows = S.length
  const n_cols = S[0].length
  const result = S.map((row) => [...row])

  if (axis === null) {
    // Global normalization
    const flat = S.flat()
    const magnitude = compute_norm(flat, norm)
    const scale = magnitude > threshold ? magnitude : (fill ? threshold : 1.0)

    for (let i = 0; i < n_rows; i++) {
      for (let j = 0; j < n_cols; j++) {
        result[i][j] /= scale
      }
    }
  } else if (axis === 0) {
    // Normalize columns
    for (let j = 0; j < n_cols; j++) {
      const col = S.map((row) => row[j])
      const magnitude = compute_norm(col, norm)
      const scale = magnitude > threshold ? magnitude : (fill ? threshold : 1.0)

      for (let i = 0; i < n_rows; i++) {
        result[i][j] /= scale
      }
    }
  } else if (axis === 1) {
    // Normalize rows
    for (let i = 0; i < n_rows; i++) {
      const magnitude = compute_norm(S[i], norm)
      const scale = magnitude > threshold ? magnitude : (fill ? threshold : 1.0)

      for (let j = 0; j < n_cols; j++) {
        result[i][j] /= scale
      }
    }
  }

  return result
}

/**
 * Compute the norm of an array
 * @param {Array} arr - Input array
 * @param {number} norm - Norm type
 * @returns {number} Norm value
 */
function compute_norm(arr, norm) {
  if (norm === Infinity) {
    return Math.max(...arr.map(Math.abs))
  } else if (norm === -Infinity) {
    return Math.min(...arr.map(Math.abs))
  } else if (norm === 0) {
    return arr.filter((x) => x !== 0).length
  } else {
    // L-p norm
    const sum = arr.reduce((acc, val) => acc + Math.pow(Math.abs(val), norm), 0)
    return Math.pow(sum, 1 / norm)
  }
}

/**
 * Peak normalization (normalize to maximum absolute value)
 * @param {Array|Float32Array} S - Input array (1D or 2D)
 * @param {number} target - Target peak value (default: 1.0)
 * @param {number} threshold - Threshold below which to avoid division (default: 1e-10)
 * @returns {Array|Float32Array} Peak-normalized array
 */
export function peak_normalize(S, target = 1.0, threshold = 1e-10) {
  // Handle 1D array
  if (!_isRow(S[0])) {
    const peak = Math.max(...S.map(Math.abs))
    const scale = peak > threshold ? target / peak : 1.0
    return S.map((val) => val * scale)
  }

  // Handle 2D array
  const flat = S.flat()
  const peak = Math.max(...flat.map(Math.abs))
  const scale = peak > threshold ? target / peak : 1.0

  return S.map((row) => row.map((val) => val * scale))
}

/**
 * Normalize and clip values
 * @param {Array|Float32Array} S - Input array (1D or 2D)
 * @param {number} norm - Normalization type
 * @param {number} axis - Axis along which to normalize
 * @param {number} threshold - Normalization threshold
 * @param {number} clip_min - Minimum clip value (default: -1.0)
 * @param {number} clip_max - Maximum clip value (default: 1.0)
 * @returns {Array|Float32Array} Normalized and clipped array
 */
export function normalize_clip(S, norm = Infinity, axis = null, threshold = 1e-10, clip_min = -1.0, clip_max = 1.0) {
  const normalized = normalize(S, norm, axis, threshold, false)

  // Clip values
  if (!_isRow(normalized[0])) {
    return normalized.map((val) => Math.max(clip_min, Math.min(clip_max, val)))
  }

  return normalized.map((row) =>
    row.map((val) => Math.max(clip_min, Math.min(clip_max, val)))
  )
}

/**
 * Compute a soft mask (Wiener-like filter)
 * @param {Array} X - Positive input array (e.g., magnitude spectrogram)
 * @param {Array} X_ref - Reference array (same shape as X)
 * @param {number} power - Exponent for soft mask (default: 1.0, Wiener filter uses 2.0)
 * @param {number} split_zeros - Behavior for zero reference values (default: false)
 * @returns {Array} Soft mask array
 */
export function softmask(X, X_ref, power = 1.0, split_zeros = false) {
  // Handle 1D arrays
  if (!_isRow(X[0])) {
    return X.map((val, i) => {
      const ref = X_ref[i]
      if (ref === 0) {
        return split_zeros ? 0.5 : 0
      }
      const numerator = Math.pow(Math.abs(val), power)
      const denominator = Math.pow(Math.abs(ref), power)
      return numerator / (numerator + denominator)
    })
  }

  // Handle 2D arrays
  const n_rows = X.length
  const n_cols = X[0].length
  const mask = Array(n_rows).fill(null).map(() => new Float32Array(n_cols))

  for (let i = 0; i < n_rows; i++) {
    for (let j = 0; j < n_cols; j++) {
      const val = X[i][j]
      const ref = X_ref[i][j]

      if (ref === 0) {
        mask[i][j] = split_zeros ? 0.5 : 0
      } else {
        const numerator = Math.pow(Math.abs(val), power)
        const denominator = Math.pow(Math.abs(ref), power)
        mask[i][j] = numerator / (numerator + denominator)
      }
    }
  }

  return mask
}

/**
 * Get a tiny value for numerical stability
 * @param {*} value - Value to check (used for type inference)
 * @returns {number} Tiny value appropriate for the type
 */
export function tiny(value = null) {
  // JavaScript uses 64-bit floats, so we can use a standard epsilon
  return 1e-10
}

/**
 * Apply soft masking to a complex spectrogram
 * @param {Array} D - Complex spectrogram [freq][time] with {real, imag} bins
 * @param {Array} mask - Soft mask [freq][time]
 * @returns {Array} Masked complex spectrogram
 */
export function apply_mask(D, mask) {
  const n_freq = D.length
  const n_frames = D[0] ? D[0].length : 0

  const masked = Array(n_freq)
  for (let f = 0; f < n_freq; f++) {
    masked[f] = new Array(n_frames)
    for (let t = 0; t < n_frames; t++) {
      masked[f][t] = {
        real: D[f][t].real * mask[f][t],
        imag: D[f][t].imag * mask[f][t],
      }
    }
  }

  return masked
}

/**
 * RMS (Root Mean Square) normalization
 * @param {Float32Array} y - Audio signal
 * @param {number} target_rms - Target RMS level (default: 0.1)
 * @returns {Float32Array} RMS-normalized audio
 */
export function rms_normalize(y, target_rms = 0.1) {
  const rms = Math.sqrt(y.reduce((sum, val) => sum + val * val, 0) / y.length)

  if (rms < 1e-10) {
    return y
  }

  const scale = target_rms / rms
  return y.map((val) => val * scale)
}

/**
 * LUFS (Loudness Units Full Scale) normalization (simplified)
 * @param {Float32Array} y - Audio signal
 * @param {number} sr - Sample rate
 * @param {number} target_lufs - Target LUFS level (default: -23.0)
 * @returns {Float32Array} LUFS-normalized audio
 */
export function lufs_normalize(y, sr = 22050, target_lufs = -23.0) {
  // Simplified LUFS calculation (not fully ITU-R BS.1770 compliant)
  // For accurate LUFS, a proper implementation with K-weighting is needed

  const rms = Math.sqrt(y.reduce((sum, val) => sum + val * val, 0) / y.length)

  if (rms < 1e-10) {
    return y
  }

  // Approximate LUFS from RMS (simplified)
  const current_lufs = -0.691 + 10 * Math.log10(rms * rms)
  const gain_db = target_lufs - current_lufs
  const gain_linear = Math.pow(10, gain_db / 20)

  return y.map((val) => val * gain_linear)
}

/**
 * Dynamic range compression
 * @param {Float32Array} y - Audio signal
 * @param {number} threshold - Threshold in dB (default: -20.0)
 * @param {number} ratio - Compression ratio (default: 4.0)
 * @param {number} attack - Attack time in seconds (default: 0.005)
 * @param {number} release - Release time in seconds (default: 0.1)
 * @param {number} sr - Sample rate (default: 22050)
 * @returns {Float32Array} Compressed audio
 */
export function compress(y, threshold = -20.0, ratio = 4.0, attack = 0.005, release = 0.1, sr = 22050) {
  const attack_samples = Math.floor(attack * sr)
  const release_samples = Math.floor(release * sr)
  const threshold_linear = Math.pow(10, threshold / 20)

  const output = new Float32Array(y.length)
  let envelope = 0

  for (let i = 0; i < y.length; i++) {
    const abs_sample = Math.abs(y[i])

    // Envelope follower
    if (abs_sample > envelope) {
      envelope += (abs_sample - envelope) / attack_samples
    } else {
      envelope += (abs_sample - envelope) / release_samples
    }

    // Apply compression
    let gain = 1.0
    if (envelope > threshold_linear) {
      const overshoot_db = 20 * Math.log10(envelope / threshold_linear)
      const compressed_db = overshoot_db / ratio
      gain = Math.pow(10, (compressed_db - overshoot_db) / 20)
    }

    output[i] = y[i] * gain
  }

  return output
}

/**
 * Fade in/out
 * @param {Float32Array} y - Audio signal
 * @param {number} fade_in_len - Fade in length in samples
 * @param {number} fade_out_len - Fade out length in samples
 * @param {string} shape - Fade shape ('linear', 'exponential', 'logarithmic')
 * @returns {Float32Array} Faded audio
 */
export function fade(y, fade_in_len = 0, fade_out_len = 0, shape = 'linear') {
  const output = new Float32Array(y)

  // Fade in
  for (let i = 0; i < Math.min(fade_in_len, y.length); i++) {
    const t = i / fade_in_len
    let gain

    switch (shape) {
      case 'exponential':
        gain = Math.pow(t, 2)
        break
      case 'logarithmic':
        gain = Math.log(1 + t * (Math.E - 1)) / Math.log(Math.E)
        break
      default: // 'linear'
        gain = t
    }

    output[i] *= gain
  }

  // Fade out
  for (let i = 0; i < Math.min(fade_out_len, y.length); i++) {
    const idx = y.length - 1 - i
    const t = i / fade_out_len
    let gain

    switch (shape) {
      case 'exponential':
        gain = Math.pow(t, 2)
        break
      case 'logarithmic':
        gain = Math.log(1 + t * (Math.E - 1)) / Math.log(Math.E)
        break
      default: // 'linear'
        gain = t
    }

    output[idx] *= gain
  }

  return output
}

/**
 * Mix two signals with crossfade
 * @param {Float32Array} y1 - First audio signal
 * @param {Float32Array} y2 - Second audio signal
 * @param {number} crossfade_len - Crossfade length in samples
 * @returns {Float32Array} Mixed audio
 */
export function crossfade(y1, y2, crossfade_len) {
  const total_len = y1.length + y2.length - crossfade_len
  const output = new Float32Array(total_len)

  // Copy first signal
  for (let i = 0; i < y1.length - crossfade_len; i++) {
    output[i] = y1[i]
  }

  // Crossfade region
  for (let i = 0; i < crossfade_len; i++) {
    const t = i / crossfade_len
    const idx1 = y1.length - crossfade_len + i
    const idx_out = y1.length - crossfade_len + i

    output[idx_out] = y1[idx1] * (1 - t) + y2[i] * t
  }

  // Copy second signal
  for (let i = crossfade_len; i < y2.length; i++) {
    output[y1.length - crossfade_len + i] = y2[i]
  }

  return output
}
