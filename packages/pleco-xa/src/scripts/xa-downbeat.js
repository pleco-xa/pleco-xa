/**
 * Simple but effective downbeat detection
 * Finds the TRUE beat 1 by analyzing musical patterns
 */

import { onsetDetect } from './xa-onset.js'
import { debugLog, debugTime, debugTimeEnd } from './debug.js'

// np.finfo(np.float32).tiny — the smallest NORMAL float32. Anything whose
// RMS sits at or below a small multiple of this is zeros/denormals, i.e.
// no audible signal evidence at all.
const FLOAT32_TINY = 1.1754943508222875e-38

/**
 * Find the true downbeat phase by analyzing onset patterns
 * Much simpler and more reliable than complex spectral analysis
 */
export function findDownbeatPhase(audioData, beats, tempo, sampleRate) {
  debugTime('find_downbeat_phase')

  const beatDuration = 60 / tempo
  const beatsPerBar = 4 // Assume 4/4 time

  // Analyze onset strength around each beat
  const onsetResult = onsetDetect(audioData, sampleRate, { hopLength: 256 })
  const onsets = onsetResult.onsetTimes

  // Score each possible downbeat phase (0, 1, 2, or 3)
  const phaseScores = [0, 0, 0, 0]

  // For each onset, find which beat phase it's closest to
  for (const onset of onsets) {
    // Find the beat phase (0-3) this onset falls on.
    // Repair (2026-07-02 proof-of-work): Math.round of values like 3.6 yields
    // 4, which the old `phase < 4` guard silently discarded — biasing scoring
    // against phase 0. Wrap the rounded value back into [0, beatsPerBar).
    const beatsSinceStart = onset / beatDuration
    const phase = Math.round(beatsSinceStart % beatsPerBar) % beatsPerBar

    if (phase >= 0 && phase < 4) {
      // Weight by onset strength at this position
      const onsetSample = Math.floor(onset * sampleRate)
      const strength = getOnsetStrength(audioData, onsetSample, sampleRate)
      phaseScores[phase] += strength
    }
  }

  // Find the phase with highest total strength (likely beat 1)
  let bestPhase = 0
  let maxScore = phaseScores[0]

  for (let i = 1; i < 4; i++) {
    if (phaseScores[i] > maxScore) {
      maxScore = phaseScores[i]
      bestPhase = i
    }
  }

  debugLog(
    `🎯 Downbeat phase scores: [${phaseScores.map((s) => s.toFixed(2)).join(', ')}]`,
  )
  debugLog(
    `🎯 Best phase: ${bestPhase} (beat ${bestPhase + 1} is likely the downbeat)`,
  )

  // Adjust beats to align with the correct phase
  const correctedBeats = []
  for (let i = bestPhase; i < beats.length; i += beatsPerBar) {
    correctedBeats.push(beats[i])
  }

  debugTimeEnd('find_downbeat_phase')

  return {
    phase: bestPhase,
    downbeats: correctedBeats,
    phaseScores: phaseScores,
  }
}

/**
 * Get onset strength at a specific sample position.
 *
 * Repair (2026-07-02 proof-of-work): onsetDetect() uses an UNCENTERED STFT,
 * so its reported times are frame-start times — the detected transient lies
 * in [samplePos, samplePos + frameLength), not around samplePos. The old
 * centered window [pos-1024, pos+1024) ended before the transient even
 * began, so on sparse material every accent weight read silence and phase
 * scoring degenerated to all-zeros. Measure energy forward from the
 * reported position, matching the detector's own frame convention.
 */
function getOnsetStrength(audioData, samplePos, _sampleRate) {
  const windowSize = 2048
  const start = Math.max(0, samplePos)
  const end = Math.min(audioData.length, samplePos + windowSize)

  // Simple energy calculation
  let energy = 0
  for (let i = start; i < end; i++) {
    energy += audioData[i] * audioData[i]
  }

  return Math.sqrt(energy / (end - start))
}

/**
 * Find the first strong downbeat in the track
 * This helps align loops to the actual musical phrasing
 */
export function findFirstDownbeat(audioData, tempo, sampleRate) {
  const beatDuration = 60 / tempo
  const beatsPerBar = 4
  const barDuration = beatDuration * beatsPerBar

  // Look for the first strong onset that could be a downbeat
  const onsetResult = onsetDetect(audioData, sampleRate, {
    hopLength: 256,
    delta: 0.1,
  })
  const onsets = onsetResult.onsetTimes

  if (onsets.length === 0) {
    return 0 // No onsets found, start at beginning
  }

  // Find the first onset that's likely a downbeat
  // Usually within the first 2 bars
  const searchWindow = Math.min(barDuration * 2, audioData.length / sampleRate)

  let bestDownbeat = 0
  let bestStrength = 0

  for (const onset of onsets) {
    if (onset > searchWindow) break

    const onsetSample = Math.floor(onset * sampleRate)
    const strength = getOnsetStrength(audioData, onsetSample, sampleRate)

    // Check if this onset aligns with a bar boundary
    const barsFromStart = onset / barDuration
    const barAlignment = Math.abs(barsFromStart - Math.round(barsFromStart))

    // Score based on strength and alignment
    const score = strength * (1 - barAlignment)

    if (score > bestStrength) {
      bestStrength = score
      bestDownbeat = onset
    }
  }

  // Snap to nearest bar boundary
  const nearestBar = Math.round(bestDownbeat / barDuration) * barDuration

  debugLog(`🎵 First downbeat found at ${nearestBar.toFixed(3)}s`)

  return nearestBar
}

/**
 * Simple loop finder that respects musical boundaries
 *
 * @throws {Error} when the analyzed region carries no signal evidence
 *   (RMS at or below 1e3 × float32-tiny, i.e. silence or pure denormals).
 *   Without this gate, scoreLoopConsistency() degenerates on silence —
 *   all-zero chunk energies give zero variance and a PERFECT 1.0 score —
 *   fabricating maximum confidence out of nothing.
 */
export function findMusicalLoop(
  audioData,
  sampleRate,
  tempo,
  { preferredBars = 4, minBars = 2, maxBars = 8 } = {},
) {
  debugTime('find_musical_loop')

  // Signal-evidence gate: refuse to score loops on effective silence.
  let sumSquares = 0
  for (let i = 0; i < audioData.length; i++) {
    sumSquares += audioData[i] * audioData[i]
  }
  const rms = Math.sqrt(sumSquares / audioData.length)
  const silenceFloor = FLOAT32_TINY * 1e3
  if (!(rms > silenceFloor)) {
    debugTimeEnd('find_musical_loop')
    throw new Error(
      'findMusicalLoop: signal-evidence gate failed — analyzed region is ' +
        `effectively silent (RMS=${rms.toExponential(3)} ≤ ` +
        `${silenceFloor.toExponential(3)}, zeros or denormals only). ` +
        'A loop score on silence would be fabricated, not measured.',
    )
  }

  const beatDuration = 60 / tempo
  const barDuration = beatDuration * 4
  const duration = audioData.length / sampleRate

  // Try different bar lengths, starting with preferred
  const barLengths = [preferredBars]

  // Add other options
  for (let bars = minBars; bars <= maxBars; bars++) {
    if (bars !== preferredBars) {
      barLengths.push(bars)
    }
  }

  let bestLoop = null
  let bestScore = -Infinity

  // Detect strong onsets to find potential loop start points
  const onsetResult = onsetDetect(audioData, sampleRate, {
    hopLength: 512,
    delta: 0.1,
  })
  const strongOnsets = onsetResult.onsetTimes.filter(
    (onset) => onset > 1.0 && onset < duration - 2.0,
  )

  debugLog(`🎯 Testing ${strongOnsets.length} potential loop starts`)

  for (const numBars of barLengths) {
    const loopDuration = numBars * barDuration

    // Test each strong onset as a potential loop start
    for (const onset of strongOnsets) {
      // Snap onset to nearest bar boundary
      const nearestBar = Math.round(onset / barDuration) * barDuration
      const loopStart = nearestBar
      const loopEnd = loopStart + loopDuration

      // Skip if too close to end
      if (loopEnd > duration * 0.95) continue

      // Analyze this loop
      const score = scoreLoop(audioData, sampleRate, loopStart, loopEnd)

      debugLog(
        `Testing ${numBars}-bar loop at ${loopStart.toFixed(2)}s: score=${score.toFixed(4)}`,
      )

      if (score > bestScore) {
        bestScore = score
        bestLoop = {
          start: loopStart,
          end: loopEnd,
          bars: numBars,
          score: score,
        }
      }
    }

    // Also try starting from the beginning of each bar (brute force)
    for (
      let barNum = 0;
      barNum < Math.min(8, duration / barDuration - numBars);
      barNum++
    ) {
      const loopStart = barNum * barDuration
      const loopEnd = loopStart + loopDuration

      if (loopEnd > duration * 0.95) continue

      const score = scoreLoop(audioData, sampleRate, loopStart, loopEnd)

      if (score > bestScore) {
        bestScore = score
        bestLoop = {
          start: loopStart,
          end: loopEnd,
          bars: numBars,
          score: score,
        }
      }
    }
  }

  debugTimeEnd('find_musical_loop')

  return bestLoop
}

/**
 * Score a potential loop based on how well it loops
 */
function scoreLoop(audioData, sampleRate, startTime, endTime) {
  const startSample = Math.floor(startTime * sampleRate)
  const endSample = Math.floor(endTime * sampleRate)
  const loopLength = endSample - startSample

  // Can we test if it loops?
  if (endSample + loopLength > audioData.length) {
    // Can't test looping, just check energy consistency
    return scoreLoopConsistency(audioData.slice(startSample, endSample))
  }

  // Compare the loop with what comes after
  const loop1 = audioData.slice(startSample, endSample)
  const loop2 = audioData.slice(endSample, endSample + loopLength)

  // Cross-correlation
  let correlation = 0
  for (let i = 0; i < loopLength; i++) {
    correlation += loop1[i] * loop2[i]
  }

  return correlation / loopLength
}

/**
 * Score loop based on internal consistency
 */
function scoreLoopConsistency(loopData) {
  const chunkSize = Math.floor(loopData.length / 8)
  const energies = []

  // Calculate energy for each chunk
  for (let i = 0; i < 8; i++) {
    const start = i * chunkSize
    const end = Math.min((i + 1) * chunkSize, loopData.length)

    let energy = 0
    for (let j = start; j < end; j++) {
      energy += loopData[j] * loopData[j]
    }
    energies.push(energy / (end - start))
  }

  // Calculate variance
  const mean = energies.reduce((a, b) => a + b, 0) / energies.length
  const variance =
    energies.reduce((sum, e) => sum + Math.pow(e - mean, 2), 0) /
    energies.length

  // Lower variance = more consistent = better loop
  return 1 / (1 + variance)
}
