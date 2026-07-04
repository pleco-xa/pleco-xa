/**
 * Proof: loop/fast.js — golden-locked fast pipeline (the default strategy).
 *
 * fastLoopAnalysis on all 4 golden WAVs (apps/demo/public/audio), asserted
 * against tools/goldens/loop_goldens.json (captured from the
 * pre-consolidation legacy pipeline):
 *   - loop points within ±441 samples (10 ms @ 44.1 kHz) of the goldens
 *     (spot-run: all four land within 0–1 samples),
 *   - bpm within 0.1 of the golden bpm (spot-run: exact),
 *   - non-empty beats[] and onsets[] arrays,
 *   - confidence is MEASURED on the unified 0..1 scale — never the legacy
 *     pegged 1.0. 'Drive Through Beat' reports exactly 0: its loop leaves
 *     <25% trailing audio, the documented honest "cannot measure".
 *
 * Runtime: ~12 s total (the 45 s file alone is ~8 s in Node).
 */
import { fastLoopAnalysis, decodeWav } from '../../packages/pleco-xa/dist/pleco-xa.js'
import { check, checkTrue, summary } from './_harness.mjs'
import { readFileSync } from 'node:fs'
import { fileURLToPath } from 'node:url'

const goldens = JSON.parse(readFileSync(
  fileURLToPath(new URL('../../tools/goldens/loop_goldens.json', import.meta.url)), 'utf8'))
const audioDir = new URL('../../apps/demo/public/audio/', import.meta.url)
const TOL = goldens.meta.toleranceSamples // 441

// Measured 0..1 confidences (goldens pinned from this pipeline, ±0.02):
// the point is they are real measurements, not the legacy pegged constants.
const measuredConfidence = {
  '12-8-Jazzy-Drumset-03.wav': 0.4099,
  'Bassline For Doppler Song - 11.wav': 0.2046,
  'Bassline For Doppler Song longer.wav': 0.9569,
  'Drive Through Beat.wav': 0.0,
}

for (const [file, g] of Object.entries(goldens.files)) {
  const raw = readFileSync(fileURLToPath(new URL(encodeURIComponent(file), audioDir)))
  const { channels, sampleRate } = decodeWav(
    raw.buffer.slice(raw.byteOffset, raw.byteOffset + raw.byteLength),
  )
  const buffer = {
    numberOfChannels: channels.length,
    length: channels[0].length,
    sampleRate,
    duration: channels[0].length / sampleRate,
    getChannelData: (i) => channels[i],
  }

  check(`${file}: decoded sr == ${g.sampleRate}`, sampleRate, g.sampleRate)

  const res = await fastLoopAnalysis(buffer)

  const dStart = Math.abs(res.loopStart * sampleRate - g.loopStartSamples)
  const dEnd = Math.abs(res.loopEnd * sampleRate - g.loopEndSamples)
  checkTrue(`${file}: loopStart within ±${TOL} samples of golden`, dStart <= TOL, `Δ=${dStart.toFixed(0)}`)
  checkTrue(`${file}: loopEnd within ±${TOL} samples of golden`, dEnd <= TOL, `Δ=${dEnd.toFixed(0)}`)
  check(`${file}: bpm == ${g.bpm.toFixed(2)} ± 0.1`, res.bpm, g.bpm, 0.1)
  checkTrue(`${file}: beats[] non-empty`, res.beats.length > 0, `${res.beats.length} beats`)
  checkTrue(`${file}: onsets[] non-empty`, res.onsets.length > 0, `${res.onsets.length} onsets`)
  checkTrue(
    `${file}: confidence measured in [0, 1], never pegged 1.0`,
    res.confidence >= 0 && res.confidence <= 1 && res.confidence !== 1,
    res.confidence.toFixed(4),
  )
  check(`${file}: confidence golden ${measuredConfidence[file]} ± 0.02`,
    res.confidence, measuredConfidence[file], 0.02)
}

summary('loop/fast.js — golden-locked fast pipeline (4 WAVs)')
