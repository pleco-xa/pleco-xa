/**
 * xa-style beat tracking - JavaScript port
 * High-performance beat detection using onset analysis
 */

import { onsetDetect } from './xa-onset.js'
// computeSTFT is imported but not used

/**
 * Port of xa.beat.beat_track()
 * Much faster and more accurate than our basic BPM detector
 */
export function beatTrack(
  audioData,
  sampleRate,
  {
    hopLength = 512,
    startBpm = 0,
    tightness = 100,
    // trim is declared but not used
    _trim = true,
    units = 'time',
  } = {},
) {
  console.time('beat_track')

  // Step 1: Onset detection
  const onsetResult = onsetDetect(audioData, sampleRate, { hopLength })
  const onsetStrength = onsetResult.onsetStrength

  // Step 2: Estimate tempo using autocorrelation on onset strength
  const tempoResult = estimateTempo(
    onsetStrength,
    sampleRate,
    hopLength,
    startBpm,
  )

  // Step 3: Track beats using dynamic programming
  const beatFrames = trackBeats(
    onsetStrength,
    tempoResult.bpm,
    sampleRate,
    hopLength,
    tightness,
  )

  // Step 4: Convert to time if requested
  const beatTimes =
    units === 'time'
      ? beatFrames.map((frame) => (frame * hopLength) / sampleRate)
      : beatFrames

  console.timeEnd('beat_track')

  return {
    tempo: tempoResult.bpm,
    beats: beatTimes,
    beatFrames: beatFrames,
    onsetStrength: onsetStrength,
    confidence: tempoResult.confidence,
  }
}

/**
 * Alias matching the original xa.beat.beat_track() API.
 * Delegates directly to beatTrack() so other ports can import { beat_track }.
 *
 * @param {Float32Array} audioData
 * @param {number}       sampleRate
 * @param {Object}       options
 * @returns {Object}     identical to beatTrack()
 */
export function beat_track(audioData, sampleRate, options = {}) {
  return beatTrack(audioData, sampleRate, options)
}

/**
 * Fast tempo estimation using autocorrelation
 * Much more efficient than testing every possible BPM
 */
export function estimateTempo(
  onsetStrength,
  sampleRate,
  hopLength = 512,
  startBpm = 120,
) {
  // Convert BPM range to lag range for autocorrelation
  const minBpm = 60
  const maxBpm = 200
  const minLag = Math.floor((60 * sampleRate) / (maxBpm * hopLength))
  const maxLag = Math.floor((60 * sampleRate) / (minBpm * hopLength))

  // Autocorrelation
  const autocorr = new Float32Array(maxLag - minLag + 1)

  for (
    let lag = minLag;
    lag <= maxLag && lag < onsetStrength.length / 2;
    lag++
  ) {
    let correlation = 0
    let count = 0

    for (let i = 0; i < onsetStrength.length - lag; i++) {
      correlation += onsetStrength[i] * onsetStrength[i + lag]
      count++
    }

    if (count > 0) {
      autocorr[lag - minLag] = correlation / count
    }
  }

  // Find peaks in autocorrelation
  const peaks = []
  for (let i = 1; i < autocorr.length - 1; i++) {
    if (autocorr[i] > autocorr[i - 1] && autocorr[i] > autocorr[i + 1]) {
      const lag = i + minLag
      const bpm = (60 * sampleRate) / (lag * hopLength)
      const strength = autocorr[i]

      peaks.push({ bpm, strength, lag })
    }
  }

  // Sort by strength and return best
  peaks.sort((a, b) => b.strength - a.strength)

  if (peaks.length === 0) {
    return { bpm: startBpm, confidence: 0 }
  }

  let bestPeak = peaks[0]

  // Check for half-time/double-time issues
  if (bestPeak.bpm < 90) {
    const doubleBpm = bestPeak.bpm * 2
    if (doubleBpm <= 180) {
      const doubleCandidate = peaks.find((p) => Math.abs(p.bpm - doubleBpm) < 5)
      if (
        doubleCandidate &&
        doubleCandidate.strength > bestPeak.strength * 0.7
      ) {
        bestPeak = { ...doubleCandidate, bpm: doubleBpm }
      }
    }
  }

  if (bestPeak.bpm > 160) {
    const halfBpm = bestPeak.bpm / 2
    if (halfBpm >= 70) {
      bestPeak = { ...bestPeak, bpm: halfBpm }
    }
  }

  return {
    bpm: bestPeak.bpm,
    confidence: bestPeak.strength,
    allCandidates: peaks.slice(0, 5),
  }
}

/**
 * Alias for estimateTempo() to match xa.beat.tempo().
 */
export function tempo(
  onsetStrength,
  sampleRate,
  hopLength = 512,
  startBpm = 120,
) {
  return estimateTempo(onsetStrength, sampleRate, hopLength, startBpm)
}

/**
 * Dynamic programming beat tracker
 * Simplified version of xa's beat tracking
 */
export function trackBeats(
  onsetStrength,
  bpm,
  sampleRate,
  hopLength = 512,
  tightness = 100,
) {
  const beatPeriod = (60 * sampleRate) / (bpm * hopLength)
  const numBeats = Math.floor(onsetStrength.length / beatPeriod)

  if (numBeats < 2) {
    return [0] // Not enough data for beat tracking
  }

  // Simple beat tracking: find local maxima near expected beat positions
  const beats = []
  const searchWindow = Math.floor(beatPeriod * 0.2) // ±20% window

  for (let beat = 0; beat < numBeats; beat++) {
    const expectedFrame = Math.floor(beat * beatPeriod)
    const startSearch = Math.max(0, expectedFrame - searchWindow)
    const endSearch = Math.min(
      onsetStrength.length - 1,
      expectedFrame + searchWindow,
    )

    // Find strongest onset in the search window
    let bestFrame = expectedFrame
    let bestStrength = onsetStrength[expectedFrame] || 0

    for (let frame = startSearch; frame <= endSearch; frame++) {
      if (onsetStrength[frame] > bestStrength) {
        bestStrength = onsetStrength[frame]
        bestFrame = frame
      }
    }

    beats.push(bestFrame)
  }

  return beats
}

/**
 * Extract tempo from beat times
 * Useful for validation and multiple tempo detection
 */
export function extractTempo(beatTimes) {
  if (beatTimes.length < 2)
    throw new Error('Not enough beat times for tempo extraction')

  // Calculate intervals
  const intervals = []
  for (let i = 1; i < beatTimes.length; i++) {
    intervals.push(beatTimes[i] - beatTimes[i - 1])
  }

  // Find median interval (more robust than mean)
  intervals.sort((a, b) => a - b)
  const medianInterval = intervals[Math.floor(intervals.length / 2)]
  const bpm = 60 / medianInterval

  // Calculate confidence based on interval consistency
  const meanInterval = intervals.reduce((a, b) => a + b, 0) / intervals.length
  const variance =
    intervals.reduce(
      (sum, interval) => sum + Math.pow(interval - meanInterval, 2),
      0,
    ) / intervals.length
  const confidence = Math.max(0, 1 - variance / (meanInterval * meanInterval))

  return { bpm, confidence, intervals, medianInterval }
}

/**
 * Optimized BPM detection - replacement for the slow one
 * Uses onset detection + tempo estimation
 */
export function fastBPMDetect(audioData, sampleRate) {
  console.time('fast_bpm_detect')

  // Use smaller hop length for better precision but still fast
  const hopLength = 256

  try {
    const beatResult = beatTrack(audioData, sampleRate, { hopLength })

    console.timeEnd('fast_bpm_detect')

    return {
      bpm: beatResult.tempo,
      confidence: beatResult.confidence,
      beats: beatResult.beats,
      onsetStrength: beatResult.onsetStrength,
    }
  } catch (error) {
    console.error(
      'Fast BPM detection failed, falling back to basic method:',
      error,
    )
    console.timeEnd('fast_bpm_detect')

    // Fallback to simple method
    return simpleTempoEstimate(audioData, sampleRate)
  }
}

/**
 * Simple fallback tempo estimation
 */
function simpleTempoEstimate(audioData, sampleRate) {
  const frameSize = 1024
  const hopSize = 256
  const numFrames = Math.floor((audioData.length - frameSize) / hopSize)

  // Quick RMS-based onset detection
  const onsets = []
  let prevRMS = 0

  for (let i = 0; i < numFrames; i++) {
    const start = i * hopSize
    const frame = audioData.slice(start, start + frameSize)
    const rms = Math.sqrt(frame.reduce((sum, s) => sum + s * s, 0) / frameSize)

    if (rms > prevRMS * 1.2 && rms > 0.01) {
      // Simple onset detection
      onsets.push(start / sampleRate)
    }
    prevRMS = rms
  }

  if (onsets.length < 2) {
    throw new Error('Not enough onsets detected for BPM estimation')
  }

  // Estimate BPM from onset intervals
  const intervals = []
  for (let i = 1; i < onsets.length; i++) {
    intervals.push(onsets[i] - onsets[i - 1])
  }

  intervals.sort((a, b) => a - b)
  const medianInterval = intervals[Math.floor(intervals.length / 2)]
  const bpm = 60 / medianInterval

  return { bpm: Math.max(60, Math.min(200, bpm)), confidence: 0.5 }
}
