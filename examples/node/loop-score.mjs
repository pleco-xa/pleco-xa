/**
 * Proof: loop/score.js — the Wave-3 confidence convention ground truth.
 *
 * Golden table: NCC(x,x)=1.0 exactly, NCC(x,−x)=−1.0 exactly,
 * NCC(constant, anything)=0 (zero-variance guard, never NaN), clamp01(NaN)=0.
 * measureLoopConfidence: a 440 Hz sine looped on an exact whole-period
 * boundary with identical trailing audio scores ≥ 0.999; white noise with
 * arbitrary bounds scores < 0.2; a loop with < 25% trailing audio available
 * returns exactly 0 — the honest "cannot measure", never a fabricated number.
 */
import { loop } from '../../packages/pleco-xa/dist/pleco-xa.js'
import { check, checkTrue, summary } from './_harness.mjs'

const { clamp01, normalizedCrossCorrelation: ncc, measureLoopConfidence } = loop

/** Deterministic PRNG so the noise rows are reproducible run-to-run. */
function mulberry32(seed) {
  let a = seed >>> 0
  return () => {
    a = (a + 0x6d2b79f5) | 0
    let t = Math.imul(a ^ (a >>> 15), 1 | a)
    t = (t + Math.imul(t ^ (t >>> 7), 61 | t)) ^ t
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296
  }
}

// ------------------------------------------------------------- NCC goldens
const rand = mulberry32(42)
const x = new Float32Array(1000)
for (let i = 0; i < x.length; i++) x[i] = rand() * 2 - 1
const negX = x.map((v) => -v)
const constant = new Float32Array(1000).fill(1)

check('NCC(x, x) = 1.0 exactly (verbatim repeat)', ncc(x, x), 1)
check('NCC(x, −x) = −1.0 exactly (inverted repeat)', ncc(x, negX), -1)
check('NCC(constant, x) = 0 (zero-variance guard, no NaN)', ncc(constant, x), 0)
check('clamp01(NaN) = 0', clamp01(NaN), 0)

// ------------------------------------------------- measureLoopConfidence
const sr = 44100
const sine = new Float32Array(2 * sr)
for (let i = 0; i < sine.length; i++) sine[i] = Math.sin((2 * Math.PI * 440 * i) / sr)
// loop [0.25 s, 0.75 s) is 0.5 s = exactly 220 periods of 440 Hz, so the
// trailing 0.5 s repeats the segment verbatim.
const confSine = measureLoopConfidence(sine, sr, 0.25, 0.75)
checkTrue('440 Hz sine, whole-period loop → confidence ≥ 0.999', confSine >= 0.999, confSine.toFixed(6))

const nrand = mulberry32(1234)
const noise = new Float32Array(2 * sr)
for (let i = 0; i < noise.length; i++) noise[i] = nrand() * 2 - 1
const confNoise = measureLoopConfidence(noise, sr, 0.3, 0.85)
checkTrue('white noise, arbitrary bounds → confidence < 0.2', confNoise < 0.2, confNoise.toFixed(6))

// 1 s buffer, loop [0.2, 0.9): trailing audio 0.1 s < 25% of the 0.7 s loop.
const confShort = measureLoopConfidence(sine.subarray(0, sr), sr, 0.2, 0.9)
check("< 25% trailing audio → exactly 0 (honest 'cannot measure')", confShort, 0)

summary('loop/score.js — confidence convention ground truth')
