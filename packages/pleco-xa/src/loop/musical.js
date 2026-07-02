/**
 * Musical boundary-aware loop analysis (the 'musical' strategy).
 *
 * Tests bar-multiple candidate lengths (0.5, 1, 2, 4, 8 bars) with windowed
 * adjacent-segment correlation, weighted by beat alignment.
 *
 * Wave 3 fixes: confidence is now the unified 0..1 convention (see ./score.js)
 * using true normalized cross-correlation — replacing the legacy 0–100 scale
 * whose raw dot-product correlation was amplitude-dependent. (The related
 * dBFS-vs-linear RMS bug that drove xaLoopAnalysis confidence negative is
 * fixed in ./legacy.js.)
 */

import {
  findAllZeroCrossings,
  findAudioStart,
  applyHannWindow,
} from '../scripts/audio-utils.js'
import { calculateBeatAlignment } from '../scripts/musical-timing.js'
import { clamp01, normalizedCrossCorrelation } from './score.js'
import { debugLog } from '../scripts/debug.js'

/**
 * Musical boundary-aware analysis.
 * @param {AudioBuffer|Object} audioBuffer
 * @param {{bpm: number}} bpmData - tempo estimate driving bar-length candidates
 * @returns {Promise<Object>} best loop with 0..1 confidence
 * @throws when no candidate fits inside the buffer (gate named in the message)
 */
export async function musicalLoopAnalysis(audioBuffer, bpmData) {
  const ch = audioBuffer.getChannelData(0)
  const sr = audioBuffer.sampleRate
  const startS = audioBuffer.duration > 15 ? findAudioStart(ch, sr) : 0
  const startT = startS / sr

  debugLog(`Musical analysis: audio starts @ ${startT.toFixed(3)} s`)

  const beatsPerBar = 4
  const barDur = (60 / bpmData.bpm) * beatsPerBar
  const candidates = [0.5, 1, 2, 4, 8].map((n) => n * barDur)
  const results = []

  const windowed = (s, e) => applyHannWindow(ch.slice(s, e))

  debugLog(`Buffer duration: ${audioBuffer.duration}`)
  debugLog(`Start sample: ${startS}, Start time: ${startT}`)
  debugLog(`Candidates: ${candidates.map((c) => c.toFixed(3)).join(', ')}`)

  for (const len of candidates) {
    if (len > 12 || len > audioBuffer.duration / 2) continue
    const samples = Math.floor(len * sr)
    if (startS + samples * 2 > ch.length) continue

    const a = windowed(startS, startS + samples)
    const b = windowed(startS + samples, startS + samples * 2)
    const r = normalizedCrossCorrelation(a, b)

    debugLog(
      `Candidate length: ${len.toFixed(3)}s, Correlation: ${r.toFixed(3)}`,
    )

    const beatAlign = calculateBeatAlignment(len, bpmData.bpm)
    const conf = clamp01(Math.abs(r) * beatAlign)

    results.push({
      loopStart: (() => {
        const zc = findAllZeroCrossings(ch, startS)
        return (zc.find((idx) => idx >= startS) ?? startS) / sr
      })(),
      loopEnd: (() => {
        const zc = findAllZeroCrossings(ch, startS + samples)
        return (
          (zc.find((idx) => idx >= startS + samples) ?? startS + samples) / sr
        )
      })(),
      loopLength: len,
      correlation: r,
      confidence: conf,
      musicalDivision: len / barDur,
      bpm: bpmData.bpm,
      isMusicalBoundary: true,
      isFullTrack: audioBuffer.duration > 15,
    })

    debugLog(
      `Test ${(len / barDur).toFixed(1)} bars (${len.toFixed(3)} s): ` +
        `corr=${r.toFixed(3)}, conf=${conf.toFixed(3)}`,
    )
  }

  // Rank by confidence; on ties prefer the longer loop (a full bar beats a
  // half bar when both repeat equally well)
  results.sort(
    (a, b) => b.confidence - a.confidence || b.loopLength - a.loopLength,
  )
  const best = results[0]

  if (!best) {
    throw new Error(
      'musical: candidate gate failed — no bar-multiple loop length fits ' +
        'inside the buffer at the detected tempo. ' +
        "Try strategy 'fast' or 'precise' for short material.",
    )
  }

  debugLog(
    `Best musical loop: ${(best.musicalDivision || 1).toFixed(2)} bars ` +
      `(${best.loopLength.toFixed(3)} s) at ${best.bpm.toFixed(1)} BPM`,
  )

  return {
    loopStart: best.loopStart,
    loopEnd: best.loopEnd,
    confidence: best.confidence,
    musicalDivision: best.musicalDivision || 1,
    bpm: best.bpm,
    isFullTrack: best.isFullTrack,
    allCandidates: results.slice(0, 5),
  }
}
