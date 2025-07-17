/**
 * Fast loop detection using librosa-style algorithms
 * Replaces the slow loop-analyzer.js with optimized implementations
 */

import { onsetDetect } from './xa-onset.js' // Commented out computeSTFT as unused per task warning
import { beatTrack } from './xa-beat.js' // Commented out estimateTempo as unused per task warning
// import { spectralCentroid, rms } from './xa-spectral.js' // Commented out as unused per task warning
import { findMusicalLoop, findDownbeatPhase } from './xa-downbeat.js'
import { findPreciseLoop } from './xa-precise-loop.js'
import { debugLog } from './debug.js'

/**
 * Fast loop analysis - replaces the slow loopAnalysis
 * Uses proper onset detection and beat tracking for accurate results
 */
export async function fastLoopAnalysis(audioBuffer) {
  console.time('fast_loop_analysis')

  const audioData = audioBuffer.getChannelData(0)
  const sampleRate = audioBuffer.sampleRate
  const duration = audioBuffer.duration

  debugLog(`🔍 Analyzing ${duration.toFixed(1)}s audio at ${sampleRate}Hz`)

  // Step 1: Fast beat tracking to get tempo and beat positions
  const beatResult = beatTrack(audioData, sampleRate, { hopLength: 256 })
  debugLog(
    `🎵 Detected ${beatResult.tempo.toFixed(1)} BPM with ${beatResult.beats.length} beats`,
  )

  // Step 2: Use onset detection to find structural changes
  const onsetResult = onsetDetect(audioData, sampleRate, { hopLength: 256 })
  debugLog(`🎯 Found ${onsetResult.onsetTimes.length} onsets`)

  // Step 3: Try precise loop detection first (finds exact boundaries)
  // Calculate bar duration for this tempo
  const barDuration = (60 / beatResult.tempo) * 4

  const preciseLoop = findPreciseLoop(audioData, sampleRate, beatResult.tempo, {
    minLoopDuration: barDuration * 0.8, // Allow slightly less than 1 bar
    maxLoopDuration: barDuration * 2.5, // Up to 2.5 bars
    searchStart: 2.6, // Start looking even later (was 2.5)
    searchEnd: 0.6, // Search first 60% of track
  })

  let musicalLoop = null

  if (preciseLoop && preciseLoop.score > 0.5) {
    // Use the precise loop if it's good
    debugLog(`🎯 Using precise loop detection`)
    musicalLoop = {
      start: preciseLoop.start,
      end: preciseLoop.end,
      bars: preciseLoop.duration / ((60 / beatResult.tempo) * 4),
      score: preciseLoop.score,
    }
  } else {
    // Fallback to bar-aligned method
    debugLog(`⚠️ Precise detection failed, using bar-aligned method`)
    musicalLoop = findMusicalLoop(audioData, sampleRate, beatResult.tempo, {
      preferredBars: 4, // Prefer 4-bar loops
      minBars: 2, // At least 2 bars
      maxBars: 8, // At most 8 bars
    })
  }

  if (musicalLoop) {
    debugLog(
      `🎵 Found ${musicalLoop.bars}-bar loop: ${musicalLoop.start.toFixed(3)}s - ${musicalLoop.end.toFixed(3)}s`,
    )

    // Use the musical loop directly - it's already properly aligned
    // Normalize confidence to 0-1 range (correlation is typically very small)
    const normalizedConfidence = Math.min(
      1,
      Math.max(0, Math.abs(musicalLoop.score) * 1000),
    )

    const bestLoop = {
      start: musicalLoop.start,
      end: musicalLoop.end,
      confidence: normalizedConfidence,
      musicalDivision: musicalLoop.bars,
      correlation: musicalLoop.score,
    }

    debugLog(
      `🎯 Final loop: ${bestLoop.start.toFixed(3)}s - ${bestLoop.end.toFixed(3)}s`,
    )

    console.timeEnd('fast_loop_analysis')

    return {
      loopStart: bestLoop.start,
      loopEnd: bestLoop.end,
      confidence: bestLoop.confidence,
      bpm: beatResult.tempo,
      musicalDivision: bestLoop.musicalDivision,
      barDuration: (60 / beatResult.tempo) * 4,
      allCandidates: [bestLoop], // Just return the best one
      beats: beatResult.beats,
      onsets: onsetResult.onsetTimes,
      musicalInfo: {
        bpm: beatResult.tempo,
        barDuration: (60 / beatResult.tempo) * 4,
        beatDuration: 60 / beatResult.tempo,
      },
    }
  } else {
    // Fallback if musical loop finder fails
    debugLog('⚠️ Musical loop finder failed, using fallback')
    console.timeEnd('fast_loop_analysis')

    const duration = audioData.length / sampleRate
    const barDuration = (60 / beatResult.tempo) * 4
    const loopDuration = Math.min(barDuration * 4, duration * 0.5)

    return {
      loopStart: 0,
      loopEnd: loopDuration,
      confidence: 0.5,
      bpm: beatResult.tempo,
      musicalDivision: loopDuration / barDuration,
      barDuration: barDuration,
      allCandidates: [],
      beats: beatResult.beats,
      onsets: onsetResult.onsetTimes,
      musicalInfo: {
        bpm: beatResult.tempo,
        barDuration: barDuration,
        beatDuration: 60 / beatResult.tempo,
      },
    }
  }
}

/**
 * Find the main content section of the track (skip intro/outro)
 */
function findMainSection(audioData, onsetResult, sampleRate) {
  const duration = audioData.length / sampleRate
  const frameSize = 1024
  const hopSize = 512
  const numFrames = Math.floor((audioData.length - frameSize) / hopSize)

  // Calculate energy for each frame
  const energies = []
  for (let i = 0; i < numFrames; i++) {
    const start = i * hopSize
    const frame = audioData.slice(start, start + frameSize)
    const energy = frame.reduce((sum, s) => sum + s * s, 0) / frameSize
    energies.push(energy)
  }

  // Find sustained high-energy region (main content)
  const smoothedEnergies = smoothArray(energies, 10)
  const meanEnergy =
    smoothedEnergies.reduce((sum, e) => sum + e, 0) / smoothedEnergies.length
  const threshold = meanEnergy * 0.7 // 70% of mean energy

  // Find first and last high-energy regions
  let startFrame = 0
  let endFrame = numFrames - 1

  // Skip low-energy intro
  for (let i = 0; i < numFrames; i++) {
    if (smoothedEnergies[i] > threshold) {
      startFrame = Math.max(0, i - 5) // Back up a bit
      break
    }
  }

  // Skip low-energy outro
  for (let i = numFrames - 1; i >= 0; i--) {
    if (smoothedEnergies[i] > threshold) {
      endFrame = Math.min(numFrames - 1, i + 5) // Forward a bit
      break
    }
  }

  // Convert to seconds
  const startTime = (startFrame * hopSize) / sampleRate
  const endTime = (endFrame * hopSize) / sampleRate

  // Ensure reasonable bounds
  const minSectionLength = 2.0 // At least 2 seconds
  if (endTime - startTime < minSectionLength) {
    // Use middle 80% of track
    const padding = duration * 0.1
    return {
      start: padding,
      end: duration - padding,
    }
  }

  return { start: startTime, end: endTime }
}

/**
 * Smooth an array using moving average
 */
function smoothArray(arr, windowSize) {
  const smoothed = []
  const halfWindow = Math.floor(windowSize / 2)

  for (let i = 0; i < arr.length; i++) {
    let sum = 0
    let count = 0

    for (
      let j = Math.max(0, i - halfWindow);
      j <= Math.min(arr.length - 1, i + halfWindow);
      j++
    ) {
      sum += arr[j]
      count++
    }

    smoothed.push(sum / count)
  }

  return smoothed
}

/**
 * Find downbeats (beat 1 of each bar) using onset strength patterns
 */
// function findDownbeats(audioData, beatResult, sampleRate) {
//   const beats = beatResult.beats
//   const tempo = beatResult.tempo
//   const beatsPerBar = 4 // Assume 4/4 time
//   const barDuration = (60 / tempo) * beatsPerBar
//
//   // Analyze onset strength at each beat
//   const beatStrengths = []
//   const frameSize = 2048
//
//   for (let i = 0; i < beats.length; i++) {
//     const beatTime = beats[i]
//     const beatSample = Math.floor(beatTime * sampleRate)
//
//     // Get a window around this beat
//     const startSample = Math.max(0, beatSample - frameSize / 2)
//     const endSample = Math.min(audioData.length, beatSample + frameSize / 2)
//
//     // Calculate energy/onset strength
//     let energy = 0
//     for (let j = startSample; j < endSample; j++) {
//       energy += audioData[j] * audioData[j]
//     }
//     energy = energy / (endSample - startSample)
//
//     beatStrengths.push({
//       time: beatTime,
//       strength: energy,
//       beatIndex: i,
//     })
//   }
//
//   // Find patterns - downbeats typically have higher energy
//   const downbeats = []
//
//   // Method 1: Every 4th beat (simple but effective for 4/4)
//   for (let i = 0; i < beatStrengths.length; i += 4) {
//     downbeats.push(beatStrengths[i].time)
//   }
//
//   // Method 2: Find local maxima in beat strength (more sophisticated)
//   const strongDownbeats = []
//   for (let i = 0; i < beatStrengths.length - 4; i++) {
//     // Check if this beat is stronger than surrounding beats
//     const current = beatStrengths[i].strength
//     let isStrongest = true
//
//     // Compare with next 3 beats
//     for (let j = 1; j <= 3; j++) {
//       if (
//         i + j < beatStrengths.length &&
//         beatStrengths[i + j].strength > current
//       ) {
//         isStrongest = false
//         break
//       }
//     }
//
//     if (isStrongest) {
//       strongDownbeats.push(beatStrengths[i].time)
//       i += 3 // Skip ahead to avoid duplicates
//     }
//   }
//
//   // Prefer strong downbeats if we found enough
//   if (strongDownbeats.length >= 4) {
//     debugLog('Using energy-based downbeats')
//     return strongDownbeats
//   }
//
//   debugLog('Using simple 4-beat downbeats')
//   return downbeats
// } // Commented out as unused per task warning

/**
 * Find loop candidates using beat positions and onset analysis
 */
// function findLoopCandidates(
//   audioData,
//   beatResult,
//   onsetResult,
//   sampleRate,
//   mainSection = null,
//   downbeats = [],
// ) {
//   const beats = beatResult.beats
//   const onsets = onsetResult.onsetTimes
//   const duration = audioData.length / sampleRate
//   const beatDuration = 60 / beatResult.tempo
//
//   const candidates = []
//
//   // Musical divisions to test (in beats) - prioritize common loop lengths
//   const musicalDivisions = [8, 16, 4, 32, 2] // 2 bars, 4 bars, 1 bar, 8 bars, 1/2 bar (in priority order)
//
//   for (const numBeats of musicalDivisions) {
//     const loopDuration = numBeats * beatDuration
//
//     // Skip if loop would be too long
//     if (loopDuration > duration * 0.8 || loopDuration > 16) continue
//
//     // If we have downbeats, use them as starting points
//     if (downbeats.length > 0) {
//       // Try each downbeat as a potential loop start
//       for (const downbeatTime of downbeats) {
//         const endTime = downbeatTime + loopDuration
//
//         // Skip if outside main section
//         if (mainSection) {
//           if (downbeatTime < mainSection.start || endTime > mainSection.end)
//             continue
//         }
//
//         // Make sure we don't go past the end
//         if (endTime > duration) continue
//
//         // Find the closest downbeat for the end
//         let actualEndTime = endTime
//         for (const db of downbeats) {
//           if (Math.abs(db - endTime) < beatDuration / 2) {
//             actualEndTime = db
//             break
//           }
//         }
//
//         // Analyze this downbeat-aligned candidate
//         const candidate = analyzeLoopCandidate(
//           audioData,
//           downbeatTime,
//           actualEndTime,
//           numBeats,
//           sampleRate,
//           onsets,
//           1.2, // Boost confidence for downbeat-aligned loops
//         )
//
//         candidates.push(candidate)
//       }
//     } else {
//       // Fallback: Try different starting positions within main section
//       for (
//         let startBeatIdx = 0;
//         startBeatIdx < beats.length - numBeats;
//         startBeatIdx += Math.max(1, Math.floor(numBeats / 4))
//       ) {
//         const startTime = beats[startBeatIdx]
//         const endTime = startTime + loopDuration
//
//         // Skip if outside main section
//         if (mainSection) {
//           if (startTime < mainSection.start || endTime > mainSection.end)
//             continue
//         }
//
//         // Make sure we don't go past the end
//         if (endTime > duration) continue
//
//         // Find actual beat position for end (snap to grid)
//         const endBeatIdx = startBeatIdx + numBeats
//         const actualEndTime =
//           endBeatIdx < beats.length ? beats[endBeatIdx] : endTime
//
//         // Analyze this loop candidate
//         const candidate = analyzeLoopCandidate(
//           audioData,
//           startTime,
//           actualEndTime,
//           numBeats,
//           sampleRate,
//           onsets,
//         )
//
//         candidates.push(candidate)
//       }
//     }
//   }
//
//   // Add some onset-based candidates for non-beat-aligned loops
//   for (let i = 0; i < onsets.length - 1; i++) {
//     for (let j = i + 1; j < Math.min(i + 10, onsets.length); j++) {
//       const startTime = onsets[i]
//       const endTime = onsets[j]
//       const loopDuration = endTime - startTime
//
//       // Only consider reasonable loop lengths
//       if (loopDuration > 0.5 && loopDuration < 8) {
//         const numBeats = Math.round(loopDuration / beatDuration)
//
//         const candidate = analyzeLoopCandidate(
//           audioData,
//           startTime,
//           endTime,
//           numBeats,
//           sampleRate,
//           onsets,
//           0.8, // Lower confidence for non-beat-aligned
//         )
//
//         candidates.push(candidate)
//       }
//     }
//   }
//
//   return candidates
// } // Commented out as unused per task warning

/**
 * Analyze a specific loop candidate for quality
 */
function analyzeLoopCandidate(
  audioData,
  startTime,
  endTime,
  numBeats,
  sampleRate,
  onsets,
  confidenceMultiplier = 1.0,
) {
  const startSample = Math.floor(startTime * sampleRate)
  const endSample = Math.floor(endTime * sampleRate)
  const loopLength = endSample - startSample

  if (startSample < 0 || endSample >= audioData.length || loopLength < 1024) {
    return {
      start: startTime,
      end: endTime,
      confidence: 0,
      musicalDivision: numBeats / 4,
      correlation: 0,
    }
  }

  // Extract the loop segment
  const loopSegment = audioData.slice(startSample, endSample)

  // Check if there's enough audio after the loop for comparison
  const nextSegmentStart = endSample
  const nextSegmentEnd = Math.min(
    nextSegmentStart + loopLength,
    audioData.length,
  )

  let correlation = 0

  if (nextSegmentEnd - nextSegmentStart >= loopLength * 0.8) {
    // We have enough audio to compare - test if it loops well
    const nextSegment = audioData.slice(
      nextSegmentStart,
      nextSegmentStart + loopLength,
    )

    // Cross-correlation between segments
    correlation = crossCorrelation(loopSegment, nextSegment)
  } else {
    // Not enough audio to test looping - check for musical structure instead
    correlation = analyzeMusicalStructure(loopSegment, sampleRate)
  }

  // Bonus for onset alignment
  let onsetBonus = 0
  const tolerance = 0.05 // 50ms tolerance

  for (const onset of onsets) {
    if (
      Math.abs(onset - startTime) < tolerance ||
      Math.abs(onset - endTime) < tolerance
    ) {
      onsetBonus += 0.1
    }
  }

  // Normalize correlation to 0-1 range (audio correlation is typically very small)
  const normalizedCorrelation = Math.min(1, Math.abs(correlation) * 100)

  // Calculate final confidence
  let confidence =
    (normalizedCorrelation * 0.7 + onsetBonus * 0.3) * confidenceMultiplier

  // Prefer certain musical divisions
  const musicalDivision = numBeats / 4
  if (musicalDivision === 2 || musicalDivision === 4)
    confidence *= 1.3 // 2 or 4 bars (most common)
  else if (musicalDivision === 1)
    confidence *= 1.2 // 1 bar
  else if (musicalDivision === 0.5)
    confidence *= 0.7 // Half bar (usually too short)
  else if (musicalDivision > 4) confidence *= 0.9 // Very long loops

  return {
    start: startTime,
    end: endTime,
    confidence: confidence,
    musicalDivision: musicalDivision,
    correlation: correlation,
    onsetBonus: onsetBonus,
    loopLength: endTime - startTime,
  }
}

/**
 * Cross-correlation between two audio segments
 */
function crossCorrelation(segment1, segment2) {
  const minLength = Math.min(segment1.length, segment2.length)
  let correlation = 0

  for (let i = 0; i < minLength; i++) {
    correlation += segment1[i] * segment2[i]
  }

  return correlation / minLength
}

/**
 * Analyze musical structure when we can't test looping
 */
// function analyzeMusicalStructure(segment, sampleRate) {
//   // Simple energy analysis - good loops have consistent energy
//   const frameSize = 1024
//   const numFrames = Math.floor(segment.length / frameSize)
//
//   if (numFrames < 2) return 0
//
//   const energies = []
//   for (let i = 0; i < numFrames; i++) {
//     const start = i * frameSize
//     const frame = segment.slice(start, start + frameSize)
//     const energy =
//       frame.reduce((sum, sample) => sum + sample * sample, 0) / frameSize
//     energies.push(energy)
//   }
//
//   // Calculate energy variance (lower variance = more consistent = better loop)
//   const meanEnergy = energies.reduce((sum, e) => sum + e, 0) / energies.length
//   const variance =
//     energies.reduce((sum, e) => sum + Math.pow(e - meanEnergy, 2), 0) /
//     energies.length
//
//   // Convert to confidence (lower variance = higher confidence)
//   return Math.max(0, 1 - variance / (meanEnergy * meanEnergy))
// } // Commented out as unused per task warning

/**
 * Select the best loop from candidates
 */
// function selectBestLoop(candidates, audioData, sampleRate) {
//   if (candidates.length === 0) {
//     // Fallback: use middle section of track
//     const duration = audioData.length / sampleRate
//     const loopDuration = Math.min(4, duration * 0.5)
//     const startTime = (duration - loopDuration) / 2
//
//     return {
//       start: startTime,
//       end: startTime + loopDuration,
//       confidence: 0.5,
//       musicalDivision: 2,
//       correlation: 0,
//     }
//   }
//
//   // Sort by confidence
//   candidates.sort((a, b) => b.confidence - a.confidence)
//
//   const best = candidates[0]
//
//   debugLog(
//     `🏆 Best loop: ${best.start.toFixed(3)}s - ${best.end.toFixed(3)}s`,
//   )
//   debugLog(
//     `🎵 ${best.musicalDivision} bars, confidence: ${best.confidence.toFixed(3)}`,
//   )
//
//   return best
// } // Commented out as unused per task warning

/**
 * Snap loop boundaries to nearest beat if within tolerance
 */
// function snapToNearestBeat(loop, beats, tempo) {
//   const beatDuration = 60 / tempo
//   const tolerance = beatDuration * 0.25 // Within 1/4 beat
//
//   // Find nearest beat to start
//   let nearestStartBeat = loop.start
//   let minStartDiff = tolerance
//
//   for (const beat of beats) {
//     const diff = Math.abs(beat - loop.start)
//     if (diff < minStartDiff) {
//       minStartDiff = diff
//       nearestStartBeat = beat
//     }
//   }
//
//   // Find nearest beat to end
//   let nearestEndBeat = loop.end
//   let minEndDiff = tolerance
//
//   for (const beat of beats) {
//     const diff = Math.abs(beat - loop.end)
//     if (diff < minEndDiff) {
//       minEndDiff = diff
//       nearestEndBeat = beat
//     }
//   }
//
//   // Log if we made corrections
//   if (nearestStartBeat !== loop.start || nearestEndBeat !== loop.end) {
//     debugLog(
//       `🔧 Phase correction: moved start ${(nearestStartBeat - loop.start).toFixed(3)}s, end ${(nearestEndBeat - loop.end).toFixed(3)}s`,
//     )
//   }
//
//   return {
//     ...loop,
//     start: nearestStartBeat,
//     end: nearestEndBeat,
//     phaseCorrection: {
//       startDiff: nearestStartBeat - loop.start,
//       endDiff: nearestEndBeat - loop.end,
//     },
//   }
// } // Commented out as unused per task warning
