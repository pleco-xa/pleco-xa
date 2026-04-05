/**
 * Server-side audio analysis engine
 * Wraps the xa-* modules for use in API endpoints
 * Processes raw PCM Float32Array data extracted from uploaded audio
 */

import { tempo } from '../scripts/xa-tempo.js'
import { onsetDetect } from '../scripts/xa-onset.js'
import { beatTrack } from '../scripts/xa-beat.js'
import { zero_crossing_rate, rms } from '../scripts/xa-features.js'
import { chroma_cqt } from '../scripts/xa-chroma.js'

/**
 * Decode an uploaded audio file (ArrayBuffer) into PCM Float32Array
 * Uses a lightweight WAV/PCM decoder for server-side (no Web Audio API)
 */
export function decodeWav(arrayBuffer) {
  const view = new DataView(arrayBuffer)

  // Check RIFF header
  const riff = String.fromCharCode(view.getUint8(0), view.getUint8(1), view.getUint8(2), view.getUint8(3))
  if (riff !== 'RIFF') {
    throw new Error('Not a WAV file. For non-WAV formats, convert to WAV first or use the /api/analyze endpoint with format=raw.')
  }

  const numChannels = view.getUint16(22, true)
  const sampleRate = view.getUint32(24, true)
  const bitsPerSample = view.getUint16(34, true)

  // Find the data chunk
  let dataOffset = 12
  while (dataOffset < view.byteLength - 8) {
    const chunkId = String.fromCharCode(
      view.getUint8(dataOffset), view.getUint8(dataOffset + 1),
      view.getUint8(dataOffset + 2), view.getUint8(dataOffset + 3)
    )
    const chunkSize = view.getUint32(dataOffset + 4, true)
    if (chunkId === 'data') {
      dataOffset += 8
      break
    }
    dataOffset += 8 + chunkSize
  }

  const bytesPerSample = bitsPerSample / 8
  const numSamples = Math.floor((view.byteLength - dataOffset) / (bytesPerSample * numChannels))
  const pcm = new Float32Array(numSamples)

  for (let i = 0; i < numSamples; i++) {
    const byteIndex = dataOffset + i * bytesPerSample * numChannels
    if (bitsPerSample === 16) {
      pcm[i] = view.getInt16(byteIndex, true) / 32768
    } else if (bitsPerSample === 24) {
      const b0 = view.getUint8(byteIndex)
      const b1 = view.getUint8(byteIndex + 1)
      const b2 = view.getUint8(byteIndex + 2)
      let val = (b2 << 16) | (b1 << 8) | b0
      if (val >= 0x800000) val -= 0x1000000
      pcm[i] = val / 8388608
    } else if (bitsPerSample === 32) {
      pcm[i] = view.getFloat32(byteIndex, true)
    } else if (bitsPerSample === 8) {
      pcm[i] = (view.getUint8(byteIndex) - 128) / 128
    }
  }

  return { pcm, sampleRate, numChannels, bitsPerSample, numSamples, duration: numSamples / sampleRate }
}

/**
 * Accept raw PCM data directly (Float32Array or array of numbers)
 */
export function fromRawPCM(samples, sampleRate = 44100) {
  const pcm = samples instanceof Float32Array ? samples : new Float32Array(samples)
  return { pcm, sampleRate, numChannels: 1, bitsPerSample: 32, numSamples: pcm.length, duration: pcm.length / sampleRate }
}

/**
 * Full audio analysis - BPM, beats, onsets, features
 */
export function analyzeAudio(pcm, sampleRate) {
  const results = {}

  // BPM / tempo detection
  try {
    const tempoResult = tempo(pcm, sampleRate)
    results.tempo = {
      bpm: tempoResult.bpm,
      candidates: tempoResult.candidates?.slice(0, 5) || [],
    }
  } catch (e) {
    results.tempo = { error: e.message }
  }

  // Beat tracking
  try {
    const beatResult = beatTrack(pcm, sampleRate, { hopLength: 512 })
    results.beats = {
      tempo: beatResult.tempo,
      beat_times: beatResult.beats?.slice(0, 200) || [],
      num_beats: beatResult.beats?.length || 0,
    }
  } catch (e) {
    results.beats = { error: e.message }
  }

  // Onset detection
  try {
    const onsetResult = onsetDetect(pcm, sampleRate, { hopLength: 512 })
    results.onsets = {
      times: onsetResult.onsetTimes?.slice(0, 500) || [],
      num_onsets: onsetResult.onsetTimes?.length || 0,
    }
  } catch (e) {
    results.onsets = { error: e.message }
  }

  // Basic features
  try {
    const zcr = zero_crossing_rate(pcm)
    const rmsValues = rms(pcm)
    results.features = {
      zero_crossing_rate: { mean: mean(zcr), std: std(zcr) },
      rms: { mean: mean(rmsValues), std: std(rmsValues) },
    }
  } catch (e) {
    results.features = { error: e.message }
  }

  results.metadata = {
    sample_rate: sampleRate,
    duration: pcm.length / sampleRate,
    num_samples: pcm.length,
  }

  return results
}

/**
 * Detect BPM only (lightweight)
 */
export function detectBPM(pcm, sampleRate) {
  const tempoResult = tempo(pcm, sampleRate)
  return {
    bpm: tempoResult.bpm,
    confidence: tempoResult.candidates?.[0]?.confidence || null,
    candidates: tempoResult.candidates?.slice(0, 5) || [],
  }
}

/**
 * Detect loops (beat-aligned loop suggestions)
 */
export function detectLoops(pcm, sampleRate) {
  const beatResult = beatTrack(pcm, sampleRate, { hopLength: 512 })
  const beats = beatResult.beats || []
  const bpm = beatResult.tempo || 120
  const barDuration = (60 / bpm) * 4

  // Generate loop suggestions at musical boundaries
  const loops = []
  const durations = [1, 2, 4, 8, 16] // in bars

  for (const bars of durations) {
    const loopDuration = barDuration * bars
    if (loopDuration > pcm.length / sampleRate) continue

    // Find best starting beat for this loop length
    let bestStart = 0
    let bestScore = 0

    for (let i = 0; i < beats.length; i++) {
      const start = beats[i]
      const end = start + loopDuration
      if (end > pcm.length / sampleRate) break

      // Score based on beat alignment at end
      let score = 1
      for (const b of beats) {
        if (Math.abs(b - end) < 0.05) { score += 2; break }
      }
      // Prefer starts that are on downbeats (every 4th beat)
      if (i % 4 === 0) score += 1

      if (score > bestScore) {
        bestScore = score
        bestStart = start
      }
    }

    loops.push({
      start: bestStart,
      end: bestStart + loopDuration,
      duration: loopDuration,
      bars,
      bpm,
      score: bestScore,
    })
  }

  return { bpm, loops, num_beats: beats.length }
}

/**
 * Extract audio features (spectral, chroma, etc.)
 */
export function extractFeatures(pcm, sampleRate, requested = ['zcr', 'rms', 'chroma']) {
  const results = {}

  if (requested.includes('zcr')) {
    const zcr = zero_crossing_rate(pcm)
    results.zero_crossing_rate = { values: zcr.slice(0, 500), mean: mean(zcr), std: std(zcr), num_frames: zcr.length }
  }

  if (requested.includes('rms')) {
    const rmsValues = rms(pcm)
    results.rms = { values: rmsValues.slice(0, 500), mean: mean(rmsValues), std: std(rmsValues), num_frames: rmsValues.length }
  }

  if (requested.includes('onsets')) {
    const onsetResult = onsetDetect(pcm, sampleRate, { hopLength: 512 })
    results.onsets = { times: onsetResult.onsetTimes, strength: onsetResult.onsetStrength?.slice(0, 500) || [] }
  }

  if (requested.includes('chroma')) {
    try {
      const chromaResult = chroma_cqt(pcm, sampleRate)
      // Flatten chroma to summary stats per pitch class
      if (Array.isArray(chromaResult) && chromaResult.length === 12) {
        const pitchNames = ['C', 'C#', 'D', 'D#', 'E', 'F', 'F#', 'G', 'G#', 'A', 'A#', 'B']
        results.chroma = {}
        for (let i = 0; i < 12; i++) {
          const row = chromaResult[i] || []
          results.chroma[pitchNames[i]] = { mean: mean(row), std: std(row) }
        }
      } else {
        results.chroma = { raw: chromaResult }
      }
    } catch (e) {
      results.chroma = { error: e.message }
    }
  }

  results.metadata = {
    sample_rate: sampleRate,
    duration: pcm.length / sampleRate,
    features_requested: requested,
  }

  return results
}

/**
 * Live inference: analyze a chunk of audio in real-time
 * Returns lightweight results suitable for streaming
 */
export function analyzeLiveChunk(pcm, sampleRate, chunkIndex = 0) {
  const results = { chunk: chunkIndex, timestamp: (chunkIndex * pcm.length) / sampleRate }

  // Fast onset detection
  try {
    const onsetResult = onsetDetect(pcm, sampleRate, { hopLength: 256 })
    results.onsets = onsetResult.onsetTimes || []
    results.onset_count = results.onsets.length
  } catch (_e) {
    results.onsets = []
  }

  // RMS energy for level metering
  try {
    const rmsValues = rms(pcm, 1024, 512)
    results.rms_mean = mean(rmsValues)
    results.rms_peak = Math.max(...rmsValues, 0)
  } catch (_e) {
    results.rms_mean = 0
  }

  // Zero crossing rate for timbral character
  try {
    const zcr = zero_crossing_rate(pcm, 1024, 512)
    results.zcr_mean = mean(zcr)
  } catch (_e) {
    results.zcr_mean = 0
  }

  // Running BPM estimate (if chunk is long enough, > 2 seconds)
  if (pcm.length / sampleRate > 2) {
    try {
      const tempoResult = tempo(pcm, sampleRate)
      results.bpm_estimate = tempoResult.bpm
    } catch (_e) {
      results.bpm_estimate = null
    }
  }

  return results
}

// Helpers
function mean(arr) {
  if (!arr || arr.length === 0) return 0
  return arr.reduce((s, v) => s + (v || 0), 0) / arr.length
}

function std(arr) {
  if (!arr || arr.length === 0) return 0
  const m = mean(arr)
  return Math.sqrt(arr.reduce((s, v) => s + ((v || 0) - m) ** 2, 0) / arr.length)
}
