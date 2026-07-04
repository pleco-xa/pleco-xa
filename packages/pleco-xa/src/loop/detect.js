/**
 * loop.detect() — THE public loop-detection API (Wave 3 consolidation).
 *
 * One entry point over four explicit strategies. Strategy selection is always
 * explicit: there is NO silent cross-strategy fallback. When a strategy fails
 * its quality gate it throws a diagnostic error that names the failed gate
 * and suggests alternatives — it never fabricates loop points, BPMs, or
 * confidences.
 *
 * Strategies:
 *   'fast'        (default) — beat-tracked precise/bar-aligned pipeline
 *                 (the legacy fastLoopAnalysis, purged and golden-locked).
 *   'precise'     — onset-pair search with true normalized cross-correlation,
 *                 fade penalty and musical-length bonus. O(onsets²) cost.
 *   'musical'     — bar-multiple candidates scored by windowed correlation ×
 *                 beat alignment.
 *   'recurrence'  — chroma recurrence-matrix lag analysis (optionally with
 *                 RQA path scoring), audio-validated candidates.
 *
 * CONFIDENCE: every strategy reports the unified 0..1 convention documented
 * in ./score.js.
 */

import { beatTrack } from '../scripts/xa-beat.js'
import { fastLoopAnalysis } from './fast.js'
import { findPreciseLoop } from './precise.js'
import { musicalLoopAnalysis } from './musical.js'
import { recurrenceLoop } from './recurrence.js'
import { clamp01 } from './score.js'

export const STRATEGIES = ['fast', 'precise', 'musical', 'recurrence']

/**
 * Detect loop points in an audio buffer.
 *
 * @param {AudioBuffer|Object} buffer - AudioBuffer or shim exposing
 *   { getChannelData(i), sampleRate, length, duration }
 * @param {Object} [options]
 * @param {'fast'|'precise'|'musical'|'recurrence'} [options.strategy='fast']
 * @param {number} [options.bpm] - tempo hint for 'precise'/'musical'
 *   (detected via beat tracking when omitted)
 * @param {number} [options.minLoopDuration] - 'precise': minimum loop length
 *   in seconds
 * @param {number} [options.maxLoopDuration] - 'precise': maximum loop length
 *   in seconds
 * @param {number} [options.searchStart] - 'precise': seconds to skip at the
 *   head of the material before searching
 * @param {number} [options.searchEnd] - 'precise': fraction (0..1) of the
 *   material to search
 * @param {number} [options.hopLength=512] - 'recurrence': chroma hop length
 * @param {number} [options.maxFrames=1500] - 'recurrence': frame cap
 *   (matrix cost is frames²)
 * @param {number} [options.minConfidence=0.1] - 'recurrence': quality gate
 *   (audio-validated NCC)
 * @param {boolean} [options.rqa=false] - 'recurrence': add an
 *   RQA-path-derived candidate
 * @param {boolean} [options.snapToZero=true] - 'recurrence': trim boundaries
 *   to zero crossings
 * @returns {Promise<Object>} {
 *   strategy, loopStart, loopEnd, loopStartSample, loopEndSample,
 *   confidence (0..1), bpm?, details }
 * @throws {Error} on invalid input, unknown strategy, or a failed quality
 *   gate (diagnostic message names the gate and suggests alternatives)
 */
export async function detect(buffer, options = {}) {
  const { strategy = 'fast', ...opts } = options

  validateBuffer(buffer)

  switch (strategy) {
    case 'fast':
      return runFast(buffer)
    case 'precise':
      return runPrecise(buffer, opts)
    case 'musical':
      return runMusical(buffer, opts)
    case 'recurrence':
      return runRecurrence(buffer, opts)
    default:
      throw new Error(
        `loop.detect: unknown strategy '${strategy}'. ` +
          `Available strategies: ${STRATEGIES.join(', ')}.`,
      )
  }
}

function validateBuffer(buffer) {
  if (!buffer || typeof buffer.getChannelData !== 'function') {
    throw new Error(
      'loop.detect: input gate failed — buffer must expose getChannelData() ' +
        '(an AudioBuffer or an AudioBuffer-like shim).',
    )
  }
  if (!(buffer.sampleRate > 0)) {
    throw new Error('loop.detect: input gate failed — sampleRate must be > 0.')
  }
  const data = buffer.getChannelData(0)
  if (!data || data.length === 0) {
    throw new Error(
      'loop.detect: input gate failed — channel 0 is empty; nothing to analyze.',
    )
  }
}

function finalize(strategy, buffer, loopStart, loopEnd, confidence, bpm, details) {
  const sr = buffer.sampleRate
  const result = {
    strategy,
    loopStart,
    loopEnd,
    loopStartSample: Math.round(loopStart * sr),
    loopEndSample: Math.round(loopEnd * sr),
    confidence: clamp01(confidence),
    details,
  }
  if (bpm !== undefined) result.bpm = bpm
  return result
}

async function runFast(buffer) {
  const res = await fastLoopAnalysis(buffer)
  return finalize(
    'fast',
    buffer,
    res.loopStart,
    res.loopEnd,
    res.confidence,
    res.bpm,
    res,
  )
}

async function runPrecise(buffer, opts) {
  const audioData = buffer.getChannelData(0)
  const sr = buffer.sampleRate

  let bpm = opts.bpm
  if (!(bpm > 0)) {
    bpm = beatTrack(audioData, sr, { hopLength: 256 }).tempo
  }
  if (!(bpm > 0)) {
    throw new Error(
      "precise: tempo gate failed — no usable tempo estimate; pass options.bpm " +
        "or try strategy 'recurrence' (tempo-free).",
    )
  }

  const loop = findPreciseLoop(audioData, sr, bpm, {
    ...(opts.minLoopDuration !== undefined && { minLoopDuration: opts.minLoopDuration }),
    ...(opts.maxLoopDuration !== undefined && { maxLoopDuration: opts.maxLoopDuration }),
    ...(opts.searchStart !== undefined && { searchStart: opts.searchStart }),
    ...(opts.searchEnd !== undefined && { searchEnd: opts.searchEnd }),
  })

  if (!loop) {
    throw new Error(
      'precise: candidate gate failed — no onset pair inside the search ' +
        'window produced a scoreable loop (material may be too short or too ' +
        "sparse). Try strategy 'fast' (has bar-aligned stages) or 'musical'.",
    )
  }

  return finalize(
    'precise',
    buffer,
    loop.start,
    loop.end,
    clamp01(loop.score),
    bpm,
    loop,
  )
}

async function runMusical(buffer, opts) {
  const audioData = buffer.getChannelData(0)
  const sr = buffer.sampleRate

  let bpm = opts.bpm
  if (!(bpm > 0)) {
    bpm = beatTrack(audioData, sr, { hopLength: 256 }).tempo
  }
  if (!(bpm > 0)) {
    throw new Error(
      "musical: tempo gate failed — no usable tempo estimate; pass options.bpm " +
        "or try strategy 'recurrence' (tempo-free).",
    )
  }

  // musicalLoopAnalysis throws its own diagnostic when no candidate fits
  const res = await musicalLoopAnalysis(buffer, { bpm })
  return finalize(
    'musical',
    buffer,
    res.loopStart,
    res.loopEnd,
    res.confidence,
    bpm,
    res,
  )
}

async function runRecurrence(buffer, opts) {
  // recurrenceLoop throws diagnostic gate errors on failure
  const res = await recurrenceLoop(buffer, opts)
  return finalize(
    'recurrence',
    buffer,
    res.loopStart,
    res.loopEnd,
    res.confidence,
    undefined, // recurrence is tempo-free — no BPM is ever invented
    res,
  )
}
