/**
 * scripts/compression.js — two compressors, one tone: pitch-changing vs
 * pitch-preserving, measured.
 *
 * pitchBasedCompress is an honest record-speed resample (pitch and tempo move
 * together: 0.8x length ⇒ pitch × 1/0.8 = 550 Hz from a 440 Hz tone).
 * tempoBasedCompress is a REAL phase-vocoder time stretch (same 0.8x length,
 * pitch stays 440 Hz). packChannels' Node fallback makes both env-blind —
 * this script runs without any Web Audio at all.
 * Web twin: examples/web/compression.html (same asserts + audible playback).
 */
import { pitchBasedCompress, tempoBasedCompress } from '../../packages/pleco-xa/dist/pleco-xa.js'
import { check, checkTrue, summary } from './_harness.mjs'

const SR = 22050
const F0 = 440
const N = SR // 1 s

// Duck-typed AudioBuffer (numberOfChannels/length/sampleRate/getChannelData)
const data = new Float32Array(N)
for (let i = 0; i < N; i++) data[i] = Math.sin((2 * Math.PI * F0 * i) / SR)
const buf = {
  numberOfChannels: 1,
  length: N,
  sampleRate: SR,
  duration: N / SR,
  getChannelData: (c) => { if (c !== 0) throw new Error('mono'); return data },
}

/** Zero-crossing pitch estimate: sign changes / (2 * seconds). */
function zcPitch(y, sr) {
  let zc = 0
  for (let i = 1; i < y.length; i++) {
    if ((y[i - 1] < 0 && y[i] >= 0) || (y[i - 1] >= 0 && y[i] < 0)) zc++
  }
  return zc / (2 * (y.length / sr))
}

const RATIO = 0.8
const pitchOut = await pitchBasedCompress(buf, RATIO)
const tempoOut = await tempoBasedCompress(buf, RATIO)

// Both tiers honor the length contract exactly: 0.8 × 22050 = 17640
check('pitchBasedCompress length == 0.8 * 22050', pitchOut.length, 17640)
check('tempoBasedCompress length == 0.8 * 22050', tempoOut.length, 17640)

const inPitch = zcPitch(data, SR)
const pitchHz = zcPitch(pitchOut.getChannelData(0), SR)
const tempoHz = zcPitch(tempoOut.getChannelData(0), SR)

console.log(`measured pitch — original: ${inPitch.toFixed(1)} Hz, ` +
  `record-speed: ${pitchHz.toFixed(1)} Hz, phase-vocoder: ${tempoHz.toFixed(1)} Hz`)

// Record-speed tier: pitch rises by 1/ratio → 550 Hz ± 2 %
check('pitchBasedCompress pitch == 550 Hz ± 2% (pitch CHANGES)', pitchHz, 550, 11)
// Phase-vocoder tier: pitch preserved → 440 Hz ± 1 %
check('tempoBasedCompress pitch == 440 Hz ± 1% (pitch PRESERVED)', tempoHz, 440, 4.4)
// Sanity: the input really was 440
check('input tone measures 440 Hz ± 1%', inPitch, 440, 4.4)

// Contract guard: nonsense ratios throw instead of fabricating output
let threw = 0
for (const bad of [0, -1, NaN]) {
  try { await pitchBasedCompress(buf, bad) } catch { threw++ }
}
checkTrue('pitchBasedCompress throws on ratio 0/-1/NaN', threw === 3, `${threw}/3 threw`)

summary('scripts/compression.js — pitch-changing vs pitch-preserving, measured')
