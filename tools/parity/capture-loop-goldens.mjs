#!/usr/bin/env node
/**
 * Self-golden capture for loop detection (Wave 3, Step 1).
 *
 * Runs the CURRENT fastLoopAnalysis pipeline against the four demo WAVs and
 * freezes the resulting loop POINTS into tools/parity/fixtures/loop_goldens.json.
 * These points are musically validated by the working demo and must not
 * silently move during the Wave 3 consolidation.
 *
 * Golden policy:
 *   - loop START/END are golden with tolerance ±441 samples (10ms @ 44.1kHz).
 *   - confidence values are NOT golden: the legacy pipeline double-normalizes
 *     (×1000 on an already-normalized correlation), pegging confidence at 1.0.
 *     Confidence is re-derived under the unified 0..1 convention in Wave 3
 *     and asserted only for range, never for equality with legacy values.
 *
 * Usage: node tools/parity/capture-loop-goldens.mjs
 */
import { readFileSync, writeFileSync } from 'node:fs'
import { fileURLToPath } from 'node:url'
import { decodeWav } from '../../packages/pleco-xa/src/io/wav.js'
import { fastLoopAnalysis } from '../../packages/pleco-xa/src/loop/fast.js'

const ROOT = fileURLToPath(new URL('../../', import.meta.url))
const AUDIO_DIR = `${ROOT}apps/demo/public/audio/`
const OUT = fileURLToPath(new URL('./fixtures/loop_goldens.json', import.meta.url))

const FILES = [
  '12-8-Jazzy-Drumset-03.wav',
  'Bassline For Doppler Song - 11.wav',
  'Bassline For Doppler Song longer.wav',
  'Drive Through Beat.wav',
]

/** Minimal AudioBuffer-like shim over decoded planar WAV channels. */
function makeBufferShim(channels, sampleRate) {
  return {
    numberOfChannels: channels.length,
    sampleRate,
    length: channels[0].length,
    duration: channels[0].length / sampleRate,
    getChannelData(i) {
      if (i < 0 || i >= channels.length) {
        throw new Error(`getChannelData: channel ${i} out of range`)
      }
      return channels[i]
    },
  }
}

const goldens = {
  meta: {
    capturedAt: new Date().toISOString(),
    pipeline: 'fastLoopAnalysis (pre-Wave-3 legacy, src/scripts/xa-loop.js)',
    toleranceSamples: 441,
    note:
      'Loop points are golden (±441 samples = 10ms @ 44.1kHz). Confidence values ' +
      'are intentionally NOT captured as goldens: the legacy ×1000 normalization ' +
      'pegged them at 1.0. Wave 3 re-derives confidence on a documented 0..1 scale.',
  },
  files: {},
}

for (const name of FILES) {
  process.stdout.write(`→ ${name} ... `)
  try {
    const bytes = readFileSync(`${AUDIO_DIR}${name}`)
    const { channels, sampleRate } = decodeWav(
      bytes.buffer.slice(bytes.byteOffset, bytes.byteOffset + bytes.byteLength),
    )
    const shim = makeBufferShim(channels, sampleRate)
    const result = await fastLoopAnalysis(shim)
    goldens.files[name] = {
      sampleRate,
      lengthSamples: shim.length,
      durationSeconds: shim.duration,
      loopStartSeconds: result.loopStart,
      loopEndSeconds: result.loopEnd,
      loopStartSamples: Math.round(result.loopStart * sampleRate),
      loopEndSamples: Math.round(result.loopEnd * sampleRate),
      bpm: result.bpm,
      musicalDivision: result.musicalDivision,
      legacyConfidence: result.confidence, // recorded for provenance only — not a golden
    }
    console.log(
      `loop ${result.loopStart.toFixed(4)}s → ${result.loopEnd.toFixed(4)}s ` +
        `(bpm ${result.bpm.toFixed(1)}, legacy conf ${result.confidence.toFixed(3)})`,
    )
  } catch (err) {
    goldens.files[name] = { error: String(err && err.message ? err.message : err) }
    console.log(`FAILED in Node: ${err.message}`)
  }
}

writeFileSync(OUT, JSON.stringify(goldens, null, 2) + '\n')
console.log(`\nWrote ${OUT}`)
