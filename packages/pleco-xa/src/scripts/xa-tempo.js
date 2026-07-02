/**
 * Rhythm analysis helpers: autocorrelation tempograms, tempo-candidate
 * ranking, and groove/swing analysis for DJ applications.
 *
 * NOTE (collision resolution, v2 wave 2): this module no longer exports
 * `tempo`, `beat_track`, or `dp_beat_track`. The canonical, librosa-parity
 * tempo/beat engine lives in ./xa-beat-tracker.js. The `dp_beat_track`
 * implementation that used to live here had a verified backtracking bug
 * (indexOf of a float score in an index array) and was deleted outright.
 * What remains are the distinctly-named, salvageable helpers.
 */

/**
 * Compute tempogram using autocorrelation
 * @param {Array} onset_env - Onset strength envelope
 * @param {number} sr - Sample rate
 * @param {number} hop_length - Hop length
 * @param {number} ac_size - Autocorrelation size in seconds
 * @returns {Array} Tempogram
 */
export function compute_tempogram(onset_env, sr, hop_length, ac_size) {
  const ac_samples = Math.round((ac_size * sr) / hop_length)
  const tempogram = new Float32Array(ac_samples)

  // Autocorrelation
  for (let lag = 0; lag < ac_samples && lag < onset_env.length; lag++) {
    let correlation = 0
    let count = 0

    for (let n = 0; n < onset_env.length - lag; n++) {
      correlation += onset_env[n] * onset_env[n + lag]
      count++
    }

    tempogram[lag] = count > 0 ? correlation / count : 0
  }

  return tempogram
}

/**
 * Find tempo candidates from tempogram
 * @param {Array} tempogram - Autocorrelation tempogram
 * @param {number} sr - Sample rate
 * @param {number} hop_length - Hop length
 * @param {number} max_tempo - Maximum tempo
 * @param {number} min_tempo - Minimum tempo
 * @returns {Array} Tempo candidates sorted by strength
 */
export function find_tempo_candidates(
  tempogram,
  sr,
  hop_length,
  max_tempo,
  min_tempo,
) {
  const max_period = Math.round((60.0 * sr) / (min_tempo * hop_length))
  const min_period = Math.round((60.0 * sr) / (max_tempo * hop_length))

  const candidates = []

  // Find peaks in valid tempo range
  const search_range = tempogram.slice(
    min_period,
    Math.min(max_period, tempogram.length),
  )
  const peaks = find_peaks_with_prominence(search_range)

  // Convert peak indices to BPM
  peaks.forEach((peak) => {
    const period = peak.index + min_period
    const bpm = (60.0 * sr) / (period * hop_length)

    candidates.push({
      bpm: bpm,
      strength: peak.value,
      period: period,
      prominence: peak.prominence,
    })
  })

  // Sort by strength
  candidates.sort((a, b) => b.strength - a.strength)

  return candidates
}

/**
 * Find peaks with prominence calculation
 * @param {Array} signal - Input signal
 * @param {number} min_prominence - Minimum prominence
 * @returns {Array} Peak objects with prominence
 */
export function find_peaks_with_prominence(signal, min_prominence = 0.1) {
  const peaks = []
  const max_val = Math.max(...signal)
  const threshold = max_val * 0.1 // 10% of maximum

  for (let i = 1; i < signal.length - 1; i++) {
    if (
      signal[i] > signal[i - 1] &&
      signal[i] > signal[i + 1] &&
      signal[i] > threshold
    ) {
      // Calculate prominence (difference from surrounding minima)
      let left_min = signal[i]
      let right_min = signal[i]

      // Find left minimum
      for (let j = i - 1; j >= 0; j--) {
        if (signal[j] < left_min) left_min = signal[j]
        if (signal[j] > signal[i]) break
      }

      // Find right minimum
      for (let j = i + 1; j < signal.length; j++) {
        if (signal[j] < right_min) right_min = signal[j]
        if (signal[j] > signal[i]) break
      }

      const prominence = signal[i] - Math.max(left_min, right_min)

      if (prominence >= min_prominence * max_val) {
        peaks.push({
          index: i,
          value: signal[i],
          prominence: prominence,
        })
      }
    }
  }

  return peaks.sort((a, b) => b.prominence - a.prominence)
}

/**
 * Apply tempo prior (favor common dance music tempos)
 * @param {Array} candidates - Tempo candidates to modify
 */
export function apply_tempo_prior(candidates) {
  const common_tempos = [
    { bpm: 120, weight: 1.5 }, // House
    { bpm: 128, weight: 1.4 }, // Techno
    { bpm: 140, weight: 1.3 }, // Trance
    { bpm: 174, weight: 1.2 }, // D&B
    { bpm: 100, weight: 1.1 }, // Hip-hop
    { bpm: 85, weight: 1.1 }, // Slow house
    { bpm: 160, weight: 1.1 }, // Hardcore
  ]

  // Boost candidates near common tempos
  candidates.forEach((candidate) => {
    for (let common of common_tempos) {
      const diff = Math.abs(candidate.bpm - common.bpm)
      if (diff < 5) {
        // Within 5 BPM
        candidate.strength *= common.weight
        break
      }
    }
  })

  // Re-sort after applying prior
  candidates.sort((a, b) => b.strength - a.strength)
}

/**
 * Detect tempo multiples and submultiples
 * @param {number} base_tempo - Base tempo in BPM
 * @param {Array} candidates - All tempo candidates
 * @returns {Object} Tempo relationships
 */
export function detect_tempo_multiples(base_tempo, candidates) {
  const relationships = {
    base: base_tempo,
    double_time: null,
    half_time: null,
    third_time: null,
    two_thirds: null,
  }

  const tolerance = 3 // BPM tolerance

  for (let candidate of candidates) {
    const ratio = candidate.bpm / base_tempo

    if (Math.abs(ratio - 2.0) < tolerance / base_tempo) {
      relationships.double_time = candidate.bpm
    } else if (Math.abs(ratio - 0.5) < tolerance / base_tempo) {
      relationships.half_time = candidate.bpm
    } else if (Math.abs(ratio - 3.0) < tolerance / base_tempo) {
      relationships.third_time = candidate.bpm
    } else if (Math.abs(ratio - 2 / 3) < tolerance / base_tempo) {
      relationships.two_thirds = candidate.bpm
    }
  }

  return relationships
}

/**
 * Estimate groove and timing feel
 * @param {Array} beat_times - Beat times in seconds
 * @param {number} sr - Sample rate
 * @returns {Object} Groove analysis
 */
export function analyze_groove(beat_times, _sr) {
  if (beat_times.length < 4) {
    return { swing: 0, timing_variance: 0 }
  }

  // Calculate inter-beat intervals
  const intervals = []
  for (let i = 1; i < beat_times.length; i++) {
    intervals.push(beat_times[i] - beat_times[i - 1])
  }

  // Calculate timing variance
  const mean_interval = intervals.reduce((a, b) => a + b, 0) / intervals.length
  const variance =
    intervals.reduce((sum, interval) => {
      return sum + Math.pow(interval - mean_interval, 2)
    }, 0) / intervals.length

  // Detect swing feel (8th note subdivision analysis)
  let swing_ratio = 0
  if (intervals.length >= 8) {
    // Analyze subdivision timing
    const subdivisions = analyze_subdivisions(beat_times)
    swing_ratio = subdivisions.swing_ratio
  }

  return {
    swing: swing_ratio,
    timing_variance: Math.sqrt(variance),
    mean_interval: mean_interval,
    groove_consistency: 1 / (1 + variance * 1000), // Higher = more consistent
  }
}

/**
 * Analyze beat subdivisions for swing detection
 * @param {Array} beat_times - Beat times
 * @returns {Object} Subdivision analysis
 */
function analyze_subdivisions(beat_times) {
  // This is a simplified swing detection
  // Real implementation would need onset detection between beats

  const intervals = []
  for (let i = 1; i < beat_times.length; i++) {
    intervals.push(beat_times[i] - beat_times[i - 1])
  }

  // Estimate swing as deviation from straight timing
  const mean_interval = intervals.reduce((a, b) => a + b, 0) / intervals.length

  // Check for alternating long/short patterns (swing)
  let swing_evidence = 0
  for (let i = 0; i < intervals.length - 1; i += 2) {
    if (i + 1 < intervals.length) {
      const ratio = intervals[i] / intervals[i + 1]
      if (ratio > 1.2 && ratio < 2.0) {
        // Typical swing ratios
        swing_evidence++
      }
    }
  }

  return {
    swing_ratio: swing_evidence / Math.floor(intervals.length / 2),
    straight_timing: swing_evidence === 0,
  }
}

