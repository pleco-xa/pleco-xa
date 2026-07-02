/**
 * Precise loop detection - finds exact loop boundaries
 * Designed for tracks with intro/outro sections
 */

import { onsetDetect } from './xa-onset.js'
import { findKickSnareHit } from './kick-snare-detector.js'
import { debugLog } from './debug.js'

/**
 * Find precise loop boundaries by testing actual audio repetition
 * Much more accurate than bar-aligned approaches
 */
export function findPreciseLoop(
  audioData,
  sampleRate,
  tempo,
  {
    minLoopDuration = 2.0, // Minimum loop length in seconds
    maxLoopDuration = 8.0, // Maximum loop length in seconds
    searchStart = 1.0, // Start searching after this many seconds
    searchEnd = 0.8, // Search up to this fraction of the track
  } = {},
) {
  console.time('find_precise_loop')

  const duration = audioData.length / sampleRate
  const beatDuration = 60 / tempo

  // Get onset times for potential loop boundaries
  const onsetResult = onsetDetect(audioData, sampleRate, { hopLength: 256 })
  const onsets = onsetResult.onsetTimes

  debugLog(
    `🔍 Searching for loops between ${minLoopDuration}s and ${maxLoopDuration}s`,
  )

  let bestLoop = null
  let bestScore = -Infinity

  // Test each onset as a potential loop start
  for (let i = 0; i < onsets.length; i++) {
    const startTime = onsets[i]

    // Skip if too early
    if (startTime < searchStart) continue

    // Skip if too late to have a full loop
    if (startTime > duration * searchEnd) break

    // Test different loop lengths from this start point
    for (let j = i + 1; j < onsets.length; j++) {
      const endTime = onsets[j]
      const loopDuration = endTime - startTime

      // Check if duration is in acceptable range
      if (loopDuration < minLoopDuration) continue
      if (loopDuration > maxLoopDuration) break

      // Check if we have enough audio after the loop to test
      if (endTime + loopDuration > duration) continue

      // Score this potential loop
      const score = scorePreciseLoop(audioData, sampleRate, startTime, endTime)

      // Also check if it's close to a musical duration (bonus points)
      const musicalBonus = getMusicalBonus(loopDuration, beatDuration)
      const totalScore = score * (1 + musicalBonus)

      if (totalScore > bestScore) {
        bestScore = totalScore
        bestLoop = {
          start: startTime,
          end: endTime,
          duration: loopDuration,
          score: score,
          musicalBonus: musicalBonus,
          totalScore: totalScore,
        }

        debugLog(
          `✨ New best loop: ${startTime.toFixed(3)}s - ${endTime.toFixed(3)}s (${loopDuration.toFixed(3)}s), score: ${totalScore.toFixed(4)}`,
        )
      }
    }
  }

  // Fine-tune the loop start by looking for a slightly better position
  if (bestLoop) {
    // First try to find a kick+snare hit near the start
    const kickSnareAdjusted = findKickSnareHit(audioData, sampleRate, bestLoop)
    if (kickSnareAdjusted) {
      bestLoop = kickSnareAdjusted
    } else {
      // Otherwise use regular fine-tuning
      bestLoop = fineTuneLoopStart(audioData, sampleRate, bestLoop, onsets)
    }
  }

  console.timeEnd('find_precise_loop')

  return bestLoop
}

/**
 * Score a loop by comparing it with what comes after
 */
function scorePreciseLoop(audioData, sampleRate, startTime, endTime) {
  const startSample = Math.floor(startTime * sampleRate)
  const endSample = Math.floor(endTime * sampleRate)
  const loopLength = endSample - startSample

  // Extract the loop and what comes after
  const loop1 = audioData.slice(startSample, endSample)
  const loop2Start = endSample
  const loop2End = Math.min(loop2Start + loopLength, audioData.length)

  if (loop2End - loop2Start < loopLength * 0.8) {
    // Not enough audio to compare
    return 0
  }

  const loop2 = audioData.slice(loop2Start, loop2End)

  // Calculate normalized cross-correlation
  const correlation = normalizedCrossCorrelation(loop1, loop2)

  // Also check the fade in/out characteristics
  const fadeScore = checkFadeCharacteristics(loop1)

  return correlation * fadeScore
}

/**
 * Normalized cross-correlation that handles different scales
 */
function normalizedCrossCorrelation(signal1, signal2) {
  const len = Math.min(signal1.length, signal2.length)

  // Calculate means
  let mean1 = 0,
    mean2 = 0
  for (let i = 0; i < len; i++) {
    mean1 += signal1[i]
    mean2 += signal2[i]
  }
  mean1 /= len
  mean2 /= len

  // Calculate correlation and standard deviations
  let correlation = 0
  let std1 = 0,
    std2 = 0

  for (let i = 0; i < len; i++) {
    const diff1 = signal1[i] - mean1
    const diff2 = signal2[i] - mean2

    correlation += diff1 * diff2
    std1 += diff1 * diff1
    std2 += diff2 * diff2
  }

  // Normalize
  const denominator = Math.sqrt(std1 * std2)
  if (denominator === 0) return 0

  return correlation / denominator
}

/**
 * Check for good loop characteristics (no fades at boundaries)
 */
function checkFadeCharacteristics(loopData) {
  const fadeLength = Math.min(1024, Math.floor(loopData.length * 0.05)) // 5% or 1024 samples

  // Check start energy
  let startEnergy = 0
  for (let i = 0; i < fadeLength; i++) {
    startEnergy += loopData[i] * loopData[i]
  }
  startEnergy /= fadeLength

  // Check end energy
  let endEnergy = 0
  for (let i = loopData.length - fadeLength; i < loopData.length; i++) {
    endEnergy += loopData[i] * loopData[i]
  }
  endEnergy /= fadeLength

  // Check middle energy
  const midStart = Math.floor(loopData.length / 2 - fadeLength / 2)
  let midEnergy = 0
  for (let i = midStart; i < midStart + fadeLength; i++) {
    midEnergy += loopData[i] * loopData[i]
  }
  midEnergy /= fadeLength

  // Penalize if start or end is much quieter than middle (fade in/out)
  const startRatio = startEnergy / (midEnergy + 1e-10)
  const endRatio = endEnergy / (midEnergy + 1e-10)

  // Score between 0 and 1 (1 = no fades)
  const fadeScore = Math.min(1, startRatio) * Math.min(1, endRatio)

  return Math.max(0.5, fadeScore) // Don't penalize too much
}

/**
 * Bonus for loops that align with musical boundaries
 */
function getMusicalBonus(loopDuration, beatDuration) {
  const beatsPerBar = 4
  const barDuration = beatDuration * beatsPerBar

  // Check common musical lengths
  const musicalLengths = [
    barDuration * 1, // 1 bar
    barDuration * 2, // 2 bars
    barDuration * 4, // 4 bars
    beatDuration * 2, // 2 beats
    beatDuration * 8, // 8 beats
  ]

  let minDiff = Infinity

  for (const musicalLength of musicalLengths) {
    const diff = Math.abs(loopDuration - musicalLength) / musicalLength
    if (diff < minDiff) {
      minDiff = diff
    }
  }

  // Return bonus (0 to 0.2) based on how close we are to a musical length
  if (minDiff < 0.02) return 0.2 // Within 2% = big bonus
  if (minDiff < 0.05) return 0.1 // Within 5% = medium bonus
  if (minDiff < 0.1) return 0.05 // Within 10% = small bonus
  return 0
}

/**
 * Fine-tune the loop start position by checking nearby onsets
 */
function fineTuneLoopStart(audioData, sampleRate, loop, onsets) {
  const tolerance = 0.15 // Check within 150ms

  // Find onsets slightly AFTER the current start (bias towards later)
  const laterOnsets = onsets.filter(
    (onset) => onset > loop.start && onset < loop.start + tolerance,
  )

  // Also check onsets just before (in case we overshot)
  const earlierOnsets = onsets.filter(
    (onset) =>
      onset > loop.start - tolerance * 0.5 && // Smaller window for earlier
      onset < loop.start,
  )

  const nearbyOnsets = [...earlierOnsets, ...laterOnsets].sort((a, b) => a - b)

  if (nearbyOnsets.length === 0) {
    // No nearby onsets, but let's try nudging forward by onset detection
    debugLog(`🔧 No nearby onsets, checking for next strong attack...`)
    return findNextStrongAttack(audioData, sampleRate, loop)
  }

  debugLog(
    `🔧 Fine-tuning: found ${nearbyOnsets.length} onsets near ${loop.start.toFixed(3)}s`,
  )
  debugLog(
    `   Later onsets: ${laterOnsets.map((o) => o.toFixed(3)).join(', ')}`,
  )

  let bestStart = loop.start
  let bestScore = loop.score

  // Test each nearby onset as a potential better start
  for (const newStart of nearbyOnsets) {
    const newEnd = newStart + loop.duration

    // Skip if the adjustment is too small
    if (Math.abs(newStart - loop.start) < 0.005) continue

    const score = scorePreciseLoop(audioData, sampleRate, newStart, newEnd)

    debugLog(
      `  Testing start at ${newStart.toFixed(3)}s: score=${score.toFixed(4)}`,
    )

    // STRONGER preference for later starts (multiply by 1.05 instead of 1.02)
    const adjustedScore = score * (newStart > loop.start ? 1.05 : 0.98)

    if (adjustedScore > bestScore * 0.95) {
      // Accept slightly worse scores if later
      bestScore = adjustedScore
      bestStart = newStart
    }
  }

  if (bestStart !== loop.start) {
    debugLog(
      `✨ Adjusted loop start: ${loop.start.toFixed(3)}s -> ${bestStart.toFixed(3)}s`,
    )

    return {
      ...loop,
      start: bestStart,
      end: bestStart + loop.duration,
      score: bestScore,
    }
  }

  return loop
}

/**
 * Find the next strong attack after the current position
 */
function findNextStrongAttack(audioData, sampleRate, loop) {
  const startSample = Math.floor(loop.start * sampleRate)
  const searchSamples = Math.floor(0.1 * sampleRate) // Search 100ms forward

  // Calculate energy in small windows
  const windowSize = 256
  const hopSize = 64

  let maxEnergy = 0
  let maxEnergyOffset = 0

  for (let offset = 0; offset < searchSamples; offset += hopSize) {
    const windowStart = startSample + offset
    const windowEnd = Math.min(windowStart + windowSize, audioData.length)

    if (windowEnd > audioData.length) break

    // Calculate energy
    let energy = 0
    for (let i = windowStart; i < windowEnd; i++) {
      energy += audioData[i] * audioData[i]
    }
    energy /= windowEnd - windowStart

    // Look for sudden energy increase (attack)
    if (energy > maxEnergy * 1.5) {
      // Significant increase
      maxEnergy = energy
      maxEnergyOffset = offset
    }
  }

  if (maxEnergyOffset > 0) {
    const newStart = loop.start + maxEnergyOffset / sampleRate
    debugLog(
      `🎯 Found stronger attack ${((maxEnergyOffset / sampleRate) * 1000).toFixed(1)}ms later`,
    )

    return {
      ...loop,
      start: newStart,
      end: newStart + loop.duration,
    }
  }

  return loop
}
