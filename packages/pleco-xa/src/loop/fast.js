/**
 * Fast loop detection.
 *
 * Wave 3: this is the purged xa-loop.js pipeline. Removed: ~420 lines of
 * commented-out dead code, the live-but-broken analyzeLoopCandidate (which
 * called the commented-out analyzeMusicalStructure — a guaranteed
 * ReferenceError if ever invoked), unused crossCorrelation/findMainSection/
 * smoothArray helpers, and console.time in the production path.
 *
 * Confidence is now the unified 0..1 convention (see ./score.js): the
 * normalized cross-correlation between the chosen loop and the audio that
 * follows it — replacing the legacy ×1000 double-normalization that pegged
 * the precise path at 1.0.
 *
 * Loop POINTS are golden-locked against the pre-consolidation pipeline
 * (tools/goldens/loop_goldens.json, ±441 samples).
 */

import { onsetDetect } from '../scripts/xa-onset.js'
import { beatTrack } from '../scripts/xa-beat.js'
import { findMusicalLoop } from '../scripts/xa-downbeat.js'
import { findPreciseLoop } from './precise.js'
import { clamp01, measureLoopConfidence } from './score.js'
import { debugLog } from '../scripts/debug.js'

/**
 * Fast loop analysis — the default strategy of loop.detect().
 * Pipeline: beat tracking → onset detection → precise onset-pair search,
 * falling back (within this strategy, by design) to bar-aligned search and
 * finally to a documented half-buffer heuristic whose confidence is measured,
 * not fabricated.
 *
 * @param {AudioBuffer|Object} audioBuffer - AudioBuffer or shim with
 *   { getChannelData, sampleRate, duration }
 * @returns {Promise<Object>} { loopStart, loopEnd, confidence, bpm, ... }
 */
export async function fastLoopAnalysis(audioBuffer) {
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
  let usedPrecise = false

  if (preciseLoop && preciseLoop.score > 0.5) {
    // Use the precise loop if it's good
    debugLog(`🎯 Using precise loop detection`)
    usedPrecise = true
    musicalLoop = {
      start: preciseLoop.start,
      end: preciseLoop.end,
      bars: preciseLoop.duration / ((60 / beatResult.tempo) * 4),
      score: preciseLoop.score,
    }
  } else {
    // Fallback to bar-aligned method (within-strategy stage, not a tier change)
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

    // Unified confidence (0..1): the precise path already carries a real
    // normalized correlation (× fade factor); the bar-aligned path's raw score
    // is unnormalized, so re-measure it against the audio that follows.
    const confidence = usedPrecise
      ? clamp01(musicalLoop.score)
      : measureLoopConfidence(
          audioData,
          sampleRate,
          musicalLoop.start,
          musicalLoop.end,
        )

    const bestLoop = {
      start: musicalLoop.start,
      end: musicalLoop.end,
      confidence,
      musicalDivision: musicalLoop.bars,
      correlation: musicalLoop.score,
    }

    debugLog(
      `🎯 Final loop: ${bestLoop.start.toFixed(3)}s - ${bestLoop.end.toFixed(3)}s`,
    )

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
    // Last-resort heuristic (documented): first half of the material, capped
    // at 4 bars. The loop POINTS match the legacy pipeline (golden-locked);
    // the confidence is MEASURED against the trailing audio — it may
    // legitimately be 0 and is never a made-up constant.
    debugLog('⚠️ Musical loop finder failed, using half-buffer heuristic')

    const totalDuration = audioData.length / sampleRate
    const fallbackBar = (60 / beatResult.tempo) * 4
    const loopDuration = Math.min(fallbackBar * 4, totalDuration * 0.5)
    const confidence = measureLoopConfidence(audioData, sampleRate, 0, loopDuration)

    return {
      loopStart: 0,
      loopEnd: loopDuration,
      confidence,
      bpm: beatResult.tempo,
      musicalDivision: loopDuration / fallbackBar,
      barDuration: fallbackBar,
      allCandidates: [],
      beats: beatResult.beats,
      onsets: onsetResult.onsetTimes,
      musicalInfo: {
        bpm: beatResult.tempo,
        barDuration: fallbackBar,
        beatDuration: 60 / beatResult.tempo,
      },
    }
  }
}
