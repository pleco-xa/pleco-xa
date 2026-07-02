/**
 * Loop-point golden lock (Wave 3).
 *
 * The pre-consolidation fastLoopAnalysis outputs on the four demo WAVs are
 * musically validated by the working demo. This suite re-runs the consolidated
 * pipeline (loop.detect strategy 'fast') on the same files and asserts the
 * loop POINTS moved by no more than ±441 samples (10ms @ 44.1kHz).
 *
 * Confidence values are deliberately NOT golden (the legacy pipeline's ×1000
 * double-normalization pegged them at 1.0); they are asserted for range only.
 */
import { describe, it, expect } from 'vitest'
import { readFileSync } from 'node:fs'
import { fileURLToPath } from 'node:url'
import { decodeWav } from '../src/io/wav.js'
import { detect } from '../src/loop/index.js'

const AUDIO_DIR = fileURLToPath(
  new URL('../../../apps/demo/public/audio/', import.meta.url),
)
const goldens = JSON.parse(
  readFileSync(
    fileURLToPath(
      new URL('../../../tools/parity/fixtures/loop_goldens.json', import.meta.url),
    ),
    'utf8',
  ),
)

function loadShim(name) {
  const bytes = readFileSync(`${AUDIO_DIR}${name}`)
  const { channels, sampleRate } = decodeWav(
    bytes.buffer.slice(bytes.byteOffset, bytes.byteOffset + bytes.byteLength),
  )
  return {
    numberOfChannels: channels.length,
    sampleRate,
    length: channels[0].length,
    duration: channels[0].length / sampleRate,
    getChannelData: (i) => channels[i],
  }
}

const TOLERANCE = goldens.meta.toleranceSamples // ±441 samples = 10ms @ 44.1k

describe('loop.detect(strategy: fast) vs pre-consolidation goldens', () => {
  for (const [name, golden] of Object.entries(goldens.files)) {
    if (golden.error) {
      it.skip(`${name} (golden capture failed in Node: ${golden.error})`, () => {})
      continue
    }

    it(`${name}: loop points within ±${TOLERANCE} samples`, async () => {
      const shim = loadShim(name)
      const result = await detect(shim, { strategy: 'fast' })

      const startSample = Math.round(result.loopStart * shim.sampleRate)
      const endSample = Math.round(result.loopEnd * shim.sampleRate)

      expect(
        Math.abs(startSample - golden.loopStartSamples),
        `loop start moved: got ${startSample}, golden ${golden.loopStartSamples}`,
      ).toBeLessThanOrEqual(TOLERANCE)
      expect(
        Math.abs(endSample - golden.loopEndSamples),
        `loop end moved: got ${endSample}, golden ${golden.loopEndSamples}`,
      ).toBeLessThanOrEqual(TOLERANCE)

      // Confidence: unified convention, range-only assertion (re-derived)
      expect(result.confidence).toBeGreaterThanOrEqual(0)
      expect(result.confidence).toBeLessThanOrEqual(1)
    }, 60_000)
  }
})
