/**
 * Proof: streaming/analyzers.js — environment-blind streaming meters: chunk-size
 * invariance + known-signal values.
 * (a) A 0.5-amplitude 440Hz sine (2s, sr=44100) is pushed into createRmsMeter twice:
 *     once as a single array, once split into seeded-random 37-to-1999-sample chunks.
 *     Every emitted RMS is within 1% of 0.5/sqrt(2) AND the two runs emit bitwise-
 *     identical sequences (framer determinism).
 * (b) A signal stepping from amplitude 0.05 to 0.8 at exactly sample 16384 goes into
 *     createFluxAnalyzer; the argmax flux frame is within +/-1 of the first frame whose
 *     window contains sample 16384, and the first frame reports flux exactly 0.
 * Same asserts as examples/web/streaming-meters.html.
 */
import { createRmsMeter, createFluxAnalyzer } from '../../packages/pleco-xa/dist/pleco-xa.js'
import { check, checkTrue, summary } from './_harness.mjs'

const sr = 44100

// (a) RMS chunk-size invariance
const y = new Float32Array(2 * sr)
for (let i = 0; i < y.length; i++) y[i] = 0.5 * Math.sin((2 * Math.PI * 440 * i) / sr)

const rmsMono = createRmsMeter().push(y)

let seed = 12345
const rand = () => { seed = (seed * 1664525 + 1013904223) >>> 0; return seed / 4294967296 }
const chunkedMeter = createRmsMeter()
const rmsChunked = []
let off = 0
while (off < y.length) {
  const size = 37 + Math.floor(rand() * (1999 - 37 + 1))
  rmsChunked.push(...chunkedMeter.push(y.subarray(off, Math.min(off + size, y.length))))
  off += size
}

const expected = 0.5 / Math.SQRT2
let maxRelErr = 0
for (const v of rmsMono) maxRelErr = Math.max(maxRelErr, Math.abs(v - expected) / expected)
const identical = rmsMono.length === rmsChunked.length && rmsMono.every((v, i) => v === rmsChunked[i])

console.log(`RMS frames: ${rmsMono.length} monolithic, ${rmsChunked.length} chunked; expected ${expected.toFixed(4)}, max rel err ${(maxRelErr * 100).toFixed(3)}%`)
checkTrue('every emitted RMS within 1% of 0.5/sqrt(2)', maxRelErr <= 0.01, `maxRelErr=${(maxRelErr * 100).toFixed(3)}%`)
checkTrue('chunked run bitwise-identical to monolithic run', identical, `${rmsChunked.length}/${rmsMono.length} frames, all ===`)

// (b) flux step localization
const nFft = 2048, hop = 512, step = 16384
const s = new Float32Array(2 * sr)
for (let i = 0; i < s.length; i++) s[i] = (i < step ? 0.05 : 0.8) * Math.sin((2 * Math.PI * 440 * i) / sr)
const flux = createFluxAnalyzer().push(s)
let argmax = 0
for (let i = 1; i < flux.length; i++) if (flux[i] > flux[argmax]) argmax = i
const expectedFrame = Math.floor((step - nFft) / hop) + 1 // first frame whose window contains `step`

console.log(`flux frames: ${flux.length}; argmax frame ${argmax}, first frame containing the step: ${expectedFrame}`)
checkTrue('flux argmax within +/-1 of the first frame containing sample 16384', Math.abs(argmax - expectedFrame) <= 1, `argmax=${argmax}, expected=${expectedFrame}±1`)
check('first frame reports flux exactly 0', flux[0], 0)

summary('streaming/analyzers: chunk-size invariance + step localization')
