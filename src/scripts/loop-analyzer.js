// @ts-check
/** ---------------------------------------------------------------------------
 * Musical loop analysis and detection
 * Part of Pleco-XA audio analysis engine
 *---------------------------------------------------------------------------*/

import { fastBPMDetect } from './xa-beat.js'
import {
  computeRMS,
  computePeak,
  computeZeroCrossingRate,
  findAllZeroCrossings,
  findAudioStart,
  applyHannWindow,
} from './audio-utils.js'
import { spectralCentroid } from './xa-spectral.js'
import { spectrogram } from './xa-fft.js'
import { calculateBeatAlignment } from './musical-timing.js'
// @ts-ignore - Missing type declarations
import { debugLog } from './debug.js'

/* -------------------------------------------------------------------------- */
/*  High-level style loop analysis                                    */
/* -------------------------------------------------------------------------- */
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
  const spectralCentroidVal = spectralCentroid({ y: audioData, sr: sampleRate })
  const zeroCrossingRate = computeZeroCrossingRate(audioBuffer)
  const loopPts = await fastOnsetLoopAnalysis(audioBuffer, bpmData)

  return {
    ...loopPts,
    rms,
    peak,
    spectrum,
    spectralCentroid: spectralCentroidVal,
    zeroCrossingRate,
    confidence: loopPts.confidence * (1 - Math.abs(rms - 0.1)),
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
/*  Musical boundary-aware analysis                                           */
/* -------------------------------------------------------------------------- */
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
  const corr = (a, b) => a.reduce((acc, v, i) => acc + v * b[i], 0) / a.length

  debugLog(`Buffer duration: ${audioBuffer.duration}`)
  debugLog(`Start sample: ${startS}, Start time: ${startT}`)
  debugLog(`Candidates: ${candidates.map((c) => c.toFixed(3)).join(', ')}`)

  for (const len of candidates) {
    if (len > 12 || len > audioBuffer.duration / 2) continue
    const samples = Math.floor(len * sr)
    if (startS + samples * 2 > ch.length) continue

    const a = windowed(startS, startS + samples)
    const b = windowed(startS + samples, startS + samples * 2)
    const r = corr(a, b)

    debugLog(
      `Candidate length: ${len.toFixed(3)}s, Correlation: ${r.toFixed(3)}`,
    )

    const beatAlign = calculateBeatAlignment(len, bpmData.bpm)
    const conf = Math.min(100, Math.abs(r) * beatAlign * 100)

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
        `corr=${r.toFixed(3)}, conf=${conf.toFixed(1)}`,
    )
  }

  results.sort((a, b) => b.confidence - a.confidence)
  const best = results[0]

  if (!best) throw new Error('No musical loop candidates detected.')

  debugLog(
    `\u001b[31mBest musical loop: ${(best.musicalDivision || 1).toFixed(2)} bars ` +
      `(${best.loopLength.toFixed(3)} s) at ${best.bpm.toFixed(1)} BPM\u001b[0m`,
  )

  debugLog(
    `Candidates: ${results.map((r) => `Start: ${r.loopStart}, End: ${r.loopEnd}, Confidence: ${r.confidence}`).join('; ')}`,
  )
  if (results.length === 0) {
    debugLog('No valid candidates found, using fallback logic.')
  }

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

/* -------------------------------------------------------------------------- */
/*  Fast onset-based fallback (recurrence matrix)                             */
/* -------------------------------------------------------------------------- */
export async function fastOnsetLoopAnalysis(audioBuffer, bpmData = null) {
  console.time('fast_onset_loop_analysis')
  try {
    const { recurrenceLoopDetection } = await import('./xa-recurrence.js')
    const res = await recurrenceLoopDetection(audioBuffer)
    console.timeEnd('fast_onset_loop_analysis')
    debugLog(
      `Recurrence detection: ${res.loopStart.toFixed(3)}-${res.loopEnd.toFixed(3)} s`,
    )
    return res
  } catch (err) {
    console.error('Recurrence matrix failed, falling back:', err)
    return {
      loopStart: 0,
      loopEnd: Math.min(5, audioBuffer.duration),
      confidence: 50,
      bpm: bpmData?.bpm ?? 120,
      musicalDivision: 2,
    }
  }
}

/* -------------------------------------------------------------------------- */
/*  Legacy fallback cross-fade method                                         */
/* -------------------------------------------------------------------------- */
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
    confidence: bestScore / win,
    bestOffset,
    windowSize: win,
  }
}

/* -------------------------------------------------------------------------- */
/*  Utility helper                                                            */
/* -------------------------------------------------------------------------- */
function scoreLoopRepetition(audioData, sr, startT, endT) {
  const s = Math.floor(startT * sr)
  const e = Math.floor(endT * sr)
  const len = e - s
  if (e + len > audioData.length) return 0

  const a = audioData.slice(s, e)
  const b = audioData.slice(e, e + len)
  const c = a.reduce((acc, v, i) => acc + v * b[i], 0)
  return Math.abs(c) / len
}

/* -------------------------------------------------------------------------- */
/*  Advanced loop analysis                                                   */
/* -------------------------------------------------------------------------- */
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
  const spectralCentroidVal = spectralCentroid({
    y: audioData,
    sr: audioBuffer.sampleRate,
  })
  const zeroCrossingRate = computeZeroCrossingRate(audioBuffer)

  debugLog('Core stats computed:', {
    rms,
    peak,
    spectralCentroidVal,
    zeroCrossingRate,
  })

  // Step 3: Loop hunt using XA recurrence matrix
  const loopPoints = await fastOnsetLoopAnalysis(audioBuffer, bpmData)

  debugLog('Loop points detected:', loopPoints)

  // Step 4: Confidence tweak
  const typicalRMS = -20 // Typical RMS in dBFS
  const confidence = loopPoints.confidence * (1 - Math.abs(rms - typicalRMS))

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

