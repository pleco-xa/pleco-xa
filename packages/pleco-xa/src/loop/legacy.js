/**
 * Legacy loop-analysis wrappers, kept for compatibility with existing
 * consumers of loop-analyzer.js. New code should use loop.detect().
 *
 * Wave 3 fixes:
 *  - xaLoopAnalysis confidence: the legacy code treated linear RMS
 *    (computeRMS returns ~0.05–0.3) as dBFS (`1 - |rms - (-20)|`), producing
 *    large NEGATIVE confidences. Both wrappers now use the linear convention
 *    and clamp to the unified 0..1 scale.
 *  - fastOnsetLoopAnalysis no longer fabricates `{confidence: 50, bpm: 120}`:
 *    it runs the repaired recurrence detector and, when that throws its
 *    quality gate, measures loop points with the legacy cross-fade method
 *    (analyzeLoopPoints) — every number returned is computed from the audio.
 */

import { fastBPMDetect } from '../scripts/xa-beat.js'
import {
  computeRMS,
  computePeak,
  computeZeroCrossingRate,
  findAllZeroCrossings,
  applyHannWindow,
} from '../scripts/audio-utils.js'
import { spectral_centroid } from '../feature/spectral.js'
import { spectrogram } from '../scripts/xa-fft.js'
import { clamp01 } from './score.js'
import { debugLog } from '../scripts/debug.js'

/* -------------------------------------------------------------------------- */
/*  High-level style loop analysis                                            */
/* -------------------------------------------------------------------------- */

/** @deprecated Use loop.detect() instead. */
export async function loopAnalysis(audioBuffer, useReference = false) {
  debugLog('Starting Musical Timing-Aware Analysis…')

  const audioData = audioBuffer.getChannelData(0)
  const sampleRate = audioBuffer.sampleRate
  const bpmData = fastBPMDetect(audioData, sampleRate)
  const beatsPerBar = 4 // assume 4/4
  const barDuration = (60 / bpmData.bpm) * beatsPerBar

  debugLog(
    `Detected BPM: ${bpmData.bpm.toFixed(2)}, bar = ${barDuration.toFixed(3)} s`,
  )

  const rms = computeRMS(audioBuffer)
  const peak = computePeak(audioBuffer)
  const spectrum = spectrogram(audioData)
  const spectralCentroidVal = Array.from(
    spectral_centroid(audioData, { sr: sampleRate }),
  )
  const zeroCrossingRate = computeZeroCrossingRate(audioBuffer)
  const loopPts = await fastOnsetLoopAnalysis(audioBuffer, bpmData)

  return {
    ...loopPts,
    rms,
    peak,
    spectrum,
    spectralCentroid: spectralCentroidVal,
    zeroCrossingRate,
    // Linear-RMS weighting (0..1): quiet or clipping material lowers trust
    confidence: clamp01(loopPts.confidence * (1 - Math.abs(rms - 0.1))),
    bpm: bpmData.bpm,
    barDuration,
    musicalInfo: {
      bpm: bpmData.bpm,
      barDuration,
      beatDuration: 60 / bpmData.bpm,
    },
  }
}

/* -------------------------------------------------------------------------- */
/*  Fast onset-based fallback (recurrence matrix ➜ legacy cross-fade)         */
/* -------------------------------------------------------------------------- */

/** @deprecated Use loop.detect(buffer, { strategy: 'recurrence' }) instead. */
export async function fastOnsetLoopAnalysis(audioBuffer, bpmData = null) {
  const { recurrenceLoopDetection } = await import('../scripts/xa-recurrence.js')
  try {
    const res = await recurrenceLoopDetection(audioBuffer)
    debugLog(
      `Recurrence detection: ${res.loopStart.toFixed(3)}-${res.loopEnd.toFixed(3)} s`,
    )
    return res
  } catch (err) {
    // Documented legacy second stage — a real measurement, not a fabrication.
    debugLog(
      `Recurrence gate failed (${err.message}); measuring with legacy cross-fade method`,
    )
    const measured = await analyzeLoopPoints(audioBuffer)
    return {
      loopStart: measured.loopStart,
      loopEnd: measured.loopEnd,
      confidence: measured.confidence,
      method: 'legacy-crossfade',
      recurrenceError: err.message,
    }
  }
}

/* -------------------------------------------------------------------------- */
/*  Legacy fallback cross-fade method                                         */
/* -------------------------------------------------------------------------- */

/** @deprecated Use loop.detect() instead. */
export async function analyzeLoopPoints(audioBuffer) {
  const ch = audioBuffer.getChannelData(0)
  const sr = audioBuffer.sampleRate
  const win = Math.min(Math.floor(sr * 0.5), Math.floor(ch.length / 2))

  const start = applyHannWindow(ch.subarray(0, win))
  const end = applyHannWindow(ch.subarray(ch.length - win))

  let bestOffset = 0
  let bestScore = -Infinity

  for (let off = 0; off < win; off++) {
    let score = 0
    for (let i = 0; i < win - off; i++) score += start[i] * end[i + off]
    if (score > bestScore) {
      bestScore = score
      bestOffset = off
    }
  }

  return {
    loopStart: (() => {
      const zc = findAllZeroCrossings(ch, 0)
      return (zc.find((idx) => idx >= 0) ?? 0) / sr
    })(),
    loopEnd: (() => {
      const zc = findAllZeroCrossings(ch, ch.length - win + bestOffset)
      return (
        (zc.find((idx) => idx >= ch.length - win + bestOffset) ??
          ch.length - win + bestOffset) / sr
      )
    })(),
    confidence: clamp01(bestScore / win),
    bestOffset,
    windowSize: win,
  }
}

/* -------------------------------------------------------------------------- */
/*  Advanced loop analysis                                                    */
/* -------------------------------------------------------------------------- */

/** @deprecated Use loop.detect() instead. */
export async function xaLoopAnalysis(audioBuffer) {
  if (!audioBuffer || typeof audioBuffer.getChannelData !== 'function') {
    throw new Error('Invalid audioBuffer: Missing getChannelData method')
  }

  if (!audioBuffer.sampleRate || !audioBuffer.duration) {
    throw new Error('Invalid audioBuffer: Missing sampleRate or duration')
  }

  const audioData = audioBuffer.getChannelData(0)
  if (!audioData || audioData.length === 0) {
    throw new Error('Invalid audioBuffer: Channel data is empty')
  }

  debugLog('Input data validated for xaLoopAnalysis:', {
    sampleRate: audioBuffer.sampleRate,
    duration: audioBuffer.duration,
    channelDataLength: audioData.length,
  })

  // Step 1: Tempo scan
  const bpmData = fastBPMDetect(audioData, audioBuffer.sampleRate)
  const beatsPerBar = 4 // Assume 4/4 time signature
  const barDuration = (60 / bpmData.bpm) * beatsPerBar

  // Step 2: Core stats
  const rms = computeRMS(audioBuffer)
  const peak = computePeak(audioBuffer)
  const spectralCentroidVal = Array.from(
    spectral_centroid(audioData, { sr: audioBuffer.sampleRate }),
  )
  const zeroCrossingRate = computeZeroCrossingRate(audioBuffer)

  debugLog('Core stats computed:', {
    rms,
    peak,
    spectralCentroidVal,
    zeroCrossingRate,
  })

  // Step 3: Loop hunt using XA recurrence matrix (with legacy second stage)
  const loopPoints = await fastOnsetLoopAnalysis(audioBuffer, bpmData)

  debugLog('Loop points detected:', loopPoints)

  // Step 4: Confidence weighting — LINEAR RMS convention (computeRMS returns
  // linear amplitude, not dBFS; the old `1 - |rms - (-20)|` factor was ≈ -19).
  const confidence = clamp01(loopPoints.confidence * (1 - Math.abs(rms - 0.1)))

  // Step 5: Packaging
  return {
    loopStart: loopPoints.loopStart,
    loopEnd: loopPoints.loopEnd,
    loopLength: loopPoints.loopEnd - loopPoints.loopStart,
    confidence,
    bpm: bpmData.bpm,
    barDuration,
    rms,
    peak,
    spectrum: null, // Placeholder for spectrum data if needed
    spectralCentroid: spectralCentroidVal,
    zeroCrossingRate,
    musicalInfo: {
      bpm: bpmData.bpm,
      barDuration,
      beatDuration: 60 / bpmData.bpm,
    },
  }
}
