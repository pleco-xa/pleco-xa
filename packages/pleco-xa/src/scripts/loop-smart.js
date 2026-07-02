// @ts-check
/**
 * Smart loop detector: recurrence-matrix search ➜ beat snaps ➜ zero-cross trim.
 */
import {
  recurrenceMatrix,
  recurrenceToLag,
  pathEnhance,
} from './xa-temporal.js'
import { DynamicZeroCrossing } from './dynamic-zero-crossing.js'

/* ------------------------------------------------------------------
 * Lightweight internal helpers (avoid external deps)
 * ------------------------------------------------------------------*/

// Simple onset‑strength envelope: frame‑wise RMS difference
function onset_strength(y, { sr, hop_length = 512 }) {
  const frame = hop_length
  const nFrames = Math.floor((y.length - frame) / hop_length)
  const env = new Float32Array(nFrames)
  let prevEnergy = 0
  for (let i = 0; i < nFrames; i++) {
    const start = i * hop_length
    let energy = 0
    for (let j = 0; j < frame; j++) {
      const s = y[start + j] || 0
      energy += s * s
    }
    energy = Math.sqrt(energy / frame)
    env[i] = Math.max(0, energy - prevEnergy)
    prevEnergy = energy
  }
  return env
}

// Micro beat‑tracker via autocorrelation on the onset envelope
function beat_track(
  env,
  sr,
  { hop_length = 512, minBPM = 60, maxBPM = 180 } = {},
) {
  const fps = sr / hop_length
  const minLag = Math.floor((fps * 60) / maxBPM)
  const maxLag = Math.floor((fps * 60) / minBPM)
  let bestLag = minLag
  let bestCorr = -Infinity

  for (let lag = minLag; lag <= maxLag; lag++) {
    let corr = 0
    for (let i = 0; i < env.length - lag; i++) {
      corr += env[i] * env[i + lag]
    }
    if (corr > bestCorr) {
      bestCorr = corr
      bestLag = lag
    }
  }

  const tempo = (60 * fps) / bestLag

  // choose beat positions: every bestLag frames starting at the first
  // significant onset
  const beats = []
  const peak = Math.max(...env)
  const thresh = peak * 0.1
  let first = 0
  for (let i = 0; i < env.length; i++) {
    if (env[i] >= thresh) {
      first = i
      break
    }
  }
  for (let b = first; b < env.length; b += bestLag) beats.push(b)

  return { tempo, beats }
}

/* ------------------------------------------------------------------*/

export function smartLoopDetect(y, sr, hop = 512, maxBars = 8) {
  const onsetEnv = onset_strength(y, { sr, hop_length: hop })
  const { tempo, beats } = beat_track(onsetEnv, sr, { hop_length: hop })

  const R = recurrenceMatrix(onsetEnv, {
    k: 3,
    width: 3,
    metric: 'euclidean',
    sym: true,
    sparse: false,
    mode: 'connectivity',
    bandwidth: 1,
    self: false,
    axis: 0,
  })
  const L = recurrenceToLag(R)
  const Lenh = pathEnhance(L)

  let bestStart = 0,
    bestLen = 0,
    bestLag = 0
  for (let lag = 1; lag < Lenh.length; ++lag) {
    const col = Lenh[lag]
    if (!Array.isArray(col)) continue // Defensive: skip if not array-like
    let runStart = null,
      runLen = 0
    for (let i = 0; i < col.length; ++i) {
      if (col[i] > 0) {
        runStart ??= i
        runLen++
        if (runLen > bestLen) {
          bestLen = runLen
          bestStart = runStart
          bestLag = lag
        }
      } else {
        runStart = null
        runLen = 0
      }
    }
  }
  if (!bestLen) return { start: 0, end: y.length / sr }

  const frameToSec = (f) => (f * hop) / sr
  const beatTimes = beats.map(frameToSec)
  const nearest = (t) =>
    beatTimes.reduce((a, b) => (Math.abs(b - t) < Math.abs(a - t) ? b : a))

  let startSec = nearest(frameToSec(bestStart))
  let endSec = nearest(frameToSec(bestStart + bestLag))

  const barDur = (60 / tempo) * 4
  if (endSec - startSec > barDur * maxBars) endSec = startSec + barDur * maxBars

  const [trimStart, trimEnd] = DynamicZeroCrossing.snap(
    y,
    Math.round(startSec * sr),
    Math.round(endSec * sr),
  )
  return { start: trimStart / sr, end: trimEnd / sr }
}
