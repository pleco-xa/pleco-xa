/**
 * Proof: loop/detect.js — THE public loop-detection entry point, golden-locked.
 *
 * detect(buffer, { strategy: 'fast' }) on all 4 golden WAVs
 * (apps/demo/public/audio), asserted against
 * tools/goldens/loop_goldens.json:
 *   - loop points within the fixture's ±441-sample tolerance (10 ms @ 44.1 kHz)
 *     — spot-run: all four land 0–1 samples off the goldens,
 *   - bpm within 0.1 of the golden bpm (spot-run: exact),
 *   - result.strategy echoes the requested strategy,
 *   - loopStartSample/loopEndSample are exactly round(seconds × sr) —
 *     detect()'s own sample-domain contract,
 *   - confidence on the unified 0..1 scale.
 *
 * Also proves the API contract of the consolidated entry point:
 *   - unknown strategy names throw (no silent fallback),
 *   - non-buffer input fails the input gate with a diagnostic error,
 *   - STRATEGIES lists exactly the four documented strategies.
 *
 * Runtime: ~12 s total (the 45 s file alone is ~8 s in Node).
 */
import { loop, decodeWav } from '../../packages/pleco-xa/dist/pleco-xa.js'
import { check, checkTrue, summary } from './_harness.mjs'
import { readFileSync } from 'node:fs'
import { fileURLToPath } from 'node:url'

const goldens = JSON.parse(readFileSync(
  fileURLToPath(new URL('../../tools/goldens/loop_goldens.json', import.meta.url)), 'utf8'))
const audioDir = new URL('../../apps/demo/public/audio/', import.meta.url)
const TOL = goldens.meta.toleranceSamples // 441

// ── API contract of the single entry point ────────────────────────────────
check("STRATEGIES == ['fast','precise','musical','recurrence']",
  Array.from(loop.STRATEGIES), ['fast', 'precise', 'musical', 'recurrence'])

let unknownThrew = ''
try {
  await loop.detect({ getChannelData: () => new Float32Array(4096), sampleRate: 44100 },
    { strategy: 'psychic' })
} catch (e) { unknownThrew = e.message }
checkTrue("detect(strategy:'psychic') throws (no silent fallback)",
  unknownThrew.includes('unknown strategy'), unknownThrew.slice(0, 48))

let gateThrew = ''
try { await loop.detect({ notABuffer: true }) } catch (e) { gateThrew = e.message }
checkTrue('detect(non-buffer) fails the input gate with a diagnostic',
  gateThrew.includes('input gate failed'), gateThrew.slice(0, 48))

// ── golden lock: detect({strategy:'fast'}) on all 4 golden WAVs ───────────
const table = []
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

  const res = await loop.detect(buffer, { strategy: 'fast' })
  table.push({
    file,
    loopStart: res.loopStart.toFixed(4),
    loopEnd: res.loopEnd.toFixed(4),
    bpm: res.bpm.toFixed(2),
    confidence: res.confidence.toFixed(4),
  })

  check(`${file}: strategy echoed`, res.strategy, 'fast')

  const dStart = Math.abs(res.loopStart * sampleRate - g.loopStartSamples)
  const dEnd = Math.abs(res.loopEnd * sampleRate - g.loopEndSamples)
  checkTrue(`${file}: loopStart within ±${TOL} samples of golden`, dStart <= TOL, `Δ=${dStart.toFixed(0)}`)
  checkTrue(`${file}: loopEnd within ±${TOL} samples of golden`, dEnd <= TOL, `Δ=${dEnd.toFixed(0)}`)
  check(`${file}: bpm == ${g.bpm.toFixed(2)} ± 0.1`, res.bpm, g.bpm, 0.1)

  check(`${file}: loopStartSample == round(loopStart × sr)`,
    res.loopStartSample, Math.round(res.loopStart * sampleRate))
  check(`${file}: loopEndSample == round(loopEnd × sr)`,
    res.loopEndSample, Math.round(res.loopEnd * sampleRate))
  checkTrue(`${file}: confidence on the unified 0..1 scale`,
    res.confidence >= 0 && res.confidence <= 1, res.confidence.toFixed(4))
}

console.log('\nfile                                | loopStart | loopEnd  | bpm    | confidence')
for (const r of table) {
  console.log(
    `${r.file.padEnd(35)} | ${r.loopStart.padStart(9)} | ${r.loopEnd.padStart(8)} | ${r.bpm.padStart(6)} | ${r.confidence}`,
  )
}

summary('loop/detect.js — golden-locked public entry point (4 WAVs)')
