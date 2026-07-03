/**
 * Recurrence-matrix loop strategy (the 'recurrence' strategy).
 *
 * Built on the REPAIRED xa-recurrence pipeline (Wave 3): real FFT-backed
 * chroma, typed-array-safe time-delay embedding, and audio-validated lag
 * candidates. The old recurrence-loop-analyzer.js (which fabricated
 * bpm:120/confidence:50 on every failure) is dissolved; loop-smart.js's
 * zero-crossing trim is folded in here.
 *
 * Optional RQA scoring (librosa.sequence.rqa port): when `rqa: true`, the
 * recurrence matrix is additionally scored with recurrence quantification
 * analysis and the best alignment path contributes a lag candidate whose
 * strength is the RQA path score.
 */

import {
  computeChroma,
  stackMemory,
  recurrenceMatrix,
  recurrenceLoopDetection,
} from '../scripts/xa-recurrence.js'
import { rqa } from '../sequence/rqa.js'
import { clamp01, measureLoopConfidence } from './score.js'
import { DynamicZeroCrossing } from './primitives.js'
import { debugLog } from '../scripts/debug.js'

/**
 * Detect a loop via recurrence-matrix analysis.
 *
 * @param {AudioBuffer|Object} audioBuffer
 * @param {Object} [options]
 * @param {number} [options.hopLength=512]
 * @param {number} [options.maxFrames=1500] - frame cap (matrix cost is frames²)
 * @param {number} [options.minConfidence=0.1] - quality gate (audio-validated NCC)
 * @param {boolean} [options.rqa=false] - add an RQA-path-derived candidate
 * @param {boolean} [options.snapToZero=true] - trim boundaries to zero crossings
 * @returns {Promise<Object>} { loopStart, loopEnd, confidence, candidates, diagnostics }
 * @throws diagnostic errors naming the failed gate (never fabricates a result)
 */
export async function recurrenceLoop(audioBuffer, options = {}) {
  const {
    hopLength = 512,
    maxFrames = 1500,
    minConfidence = 0.1,
    rqa: useRqa = false,
    snapToZero = true,
  } = options

  const result = await recurrenceLoopDetection(audioBuffer, {
    hopLength,
    maxFrames,
    minConfidence,
  })

  let best = {
    loopStart: result.loopStart,
    loopEnd: result.loopEnd,
    confidence: result.confidence,
  }
  const candidates = [...result.candidates]

  if (useRqa) {
    const rqaCandidate = rqaCandidateFromAudio(
      audioBuffer,
      result.diagnostics.hopLength,
    )
    if (rqaCandidate) {
      candidates.push(rqaCandidate)
      if (rqaCandidate.confidence > best.confidence) {
        best = rqaCandidate
        debugLog(
          `recurrence: RQA candidate wins (lag ${rqaCandidate.loopEnd.toFixed(3)}s, ` +
            `conf ${rqaCandidate.confidence.toFixed(3)})`,
        )
      }
    }
  }

  let loopStart = best.loopStart
  let loopEnd = best.loopEnd

  if (snapToZero) {
    const audioData = audioBuffer.getChannelData(0)
    const sr = audioBuffer.sampleRate
    const [s, e] = DynamicZeroCrossing.snap(
      audioData,
      Math.round(loopStart * sr),
      Math.round(loopEnd * sr),
    )
    loopStart = s / sr
    loopEnd = e / sr
  }

  return {
    loopStart,
    loopEnd,
    confidence: best.confidence,
    candidates,
    diagnostics: { ...result.diagnostics, rqa: useRqa },
  }
}

/**
 * Derive a lag candidate from the best RQA alignment path over the
 * recurrence matrix, validated against the raw audio (NCC confidence).
 * Returns null when the path is too short to define a lag.
 */
function rqaCandidateFromAudio(audioBuffer, hopLength) {
  // stackMemory defaults — the embedding span below must match them.
  const N_STEPS = 10
  const DELAY = 3

  const chroma = computeChroma(audioBuffer, hopLength)
  if (!chroma.length) return null
  const stacked = stackMemory(chroma, N_STEPS, DELAY)
  if (!stacked.length) return null

  // Affinity mode keeps graded similarity for the RQA accumulator.
  //
  // width: stacked vectors at |i−j| ≤ (nSteps−1)·delay share raw audio
  // frames (the time-delay windows overlap), so that whole band is
  // self-similar BY CONSTRUCTION — a width smaller than the embedding
  // span lets the RQA path hug the overlap band and report a meaningless
  // few-frame lag instead of a repetition lag.
  const sim = recurrenceMatrix(
    stacked,
    null,
    (N_STEPS - 1) * DELAY + 1, // 28: cover the full embedding overlap span
    'euclidean',
    false,
    -1,
    false,
    'affinity',
  )
  if (sim.length < 2) return null

  const { score, path } = rqa(sim, { gapOnset: 1, gapExtend: 1 })
  if (!path || path.length < 4) return null

  // The path's diagonal offset |i - j| is the repetition lag in frames
  let lagSum = 0
  for (const [i, j] of path) lagSum += Math.abs(i - j)
  const lagFrames = Math.round(lagSum / path.length)
  if (lagFrames < 1) return null

  const sr = audioBuffer.sampleRate
  const lagSeconds = (lagFrames * hopLength) / sr
  const audioData = audioBuffer.getChannelData(0)
  const confidence = measureLoopConfidence(audioData, sr, 0, lagSeconds)

  let pathScore = 0
  for (const row of score) {
    for (const v of row) if (v > pathScore) pathScore = v
  }

  return {
    loopStart: 0,
    loopEnd: lagSeconds,
    lagFrames,
    confidence: clamp01(confidence),
    rqaScore: pathScore,
    rqaPathLength: path.length,
    source: 'rqa',
  }
}
