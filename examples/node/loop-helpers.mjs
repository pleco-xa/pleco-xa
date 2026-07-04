/**
 * Proof: core/loopHelpers.js — loop descriptor algebra.
 *
 * Pure invariant table on a 1 s / 44.1 kHz duck-typed buffer (the helpers are
 * environment-blind — they only need {length, numberOfChannels, getChannelData}):
 * fullBufferLoop / halfLoop exact bounds, doubleLoop end-clamp, moveForward
 * start-clamp, resetLoop === fullBufferLoop, the deprecated detectLoop alias
 * contract, and reverseBufferSection applied twice restoring the buffer
 * bit-exactly.
 */
import {
  fullBufferLoop,
  detectLoop,
  halfLoop,
  doubleLoop,
  moveForward,
  resetLoop,
  reverseBufferSection,
} from '../../packages/pleco-xa/dist/pleco-xa.js'
import { check, checkTrue, summary } from './_harness.mjs'

/** Deterministic PRNG for a reproducible noise buffer. */
function mulberry32(seed) {
  let a = seed >>> 0
  return () => {
    a = (a + 0x6d2b79f5) | 0
    let t = Math.imul(a ^ (a >>> 15), 1 | a)
    t = (t + Math.imul(t ^ (t >>> 7), 61 | t)) ^ t
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296
  }
}

const N = 44100 // 1 s at 44.1 kHz
const rand = mulberry32(7)
const channels = [new Float32Array(N), new Float32Array(N)]
for (const ch of channels) for (let i = 0; i < N; i++) ch[i] = rand() * 2 - 1
const buffer = {
  length: N,
  numberOfChannels: 2,
  sampleRate: 44100,
  getChannelData: (c) => channels[c],
}

check('fullBufferLoop → {0, 44100}', fullBufferLoop(buffer), { startSample: 0, endSample: N })
check('halfLoop(full) → {0, 22050}', halfLoop(fullBufferLoop(buffer)), { startSample: 0, endSample: 22050 })
check('doubleLoop({0, 30000}, 44100) clamps end at maxSamples', doubleLoop({ startSample: 0, endSample: 30000 }, N), { startSample: 0, endSample: N })
check('moveForward({0, 22050}, 40000, 44100) clamps start to maxSamples − len', moveForward({ startSample: 0, endSample: 22050 }, 40000, N), { startSample: 22050, endSample: N })
check('resetLoop === fullBufferLoop', resetLoop(buffer), fullBufferLoop(buffer))
{
  const dl = detectLoop(buffer)
  checkTrue('detectLoop performs REAL detection: an in-bounds sub-range, never the whole buffer',
    dl.startSample >= 0 && dl.endSample <= buffer.length && dl.endSample > dl.startSample &&
      !(dl.startSample === 0 && dl.endSample === buffer.length),
    JSON.stringify(dl))
}

// reverse-twice bit-exact identity on [1000, 40000) across both channels
const snapshot = channels.map((ch) => ch.slice())
reverseBufferSection(buffer, 1000, 40000)
let changed = false
for (let c = 0; c < 2; c++) for (let i = 0; i < N; i++) if (channels[c][i] !== snapshot[c][i]) { changed = true; break }
checkTrue('single reverse changes the section (sanity)', changed)
reverseBufferSection(buffer, 1000, 40000)
let maxDiff = 0
for (let c = 0; c < 2; c++) for (let i = 0; i < N; i++) maxDiff = Math.max(maxDiff, Math.abs(channels[c][i] - snapshot[c][i]))
check('reverseBufferSection twice restores buffer bit-exactly (maxDiff)', maxDiff, 0)

summary('core/loopHelpers.js — loop descriptor algebra')
