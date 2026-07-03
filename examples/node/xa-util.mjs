/**
 * Proof: scripts/xa-util.js — framing + peak-picking + buffer conversion on
 * known signals. frame(0..99, L=10, H=5) must yield exactly 19 frames with
 * frame[1][0]==5; peakPick on [0,1,0,3,0,1,0,5,0] must return exactly [3,7]
 * (drawn as a sparkline with ^ markers); buf_to_float maps Int16 16384/-32768
 * to 0.5/-1.0 exactly; valid_audio rejects NaN.
 */
import { frame, peakPick, buf_to_float, valid_audio } from '../../packages/pleco-xa/dist/pleco-xa.js'
import { check, checkTrue, summary } from './_harness.mjs'

// (1) frame(): 1 + floor((100-10)/5) == 19 frames, frame[1] starts at 5
const x = Float32Array.from({ length: 100 }, (_, i) => i)
const frames = frame(x, { frameLength: 10, hopLength: 5 })
check('frame count == 1+floor((100-10)/5) == 19', frames.length, 19)
check('frame[1][0] == hop == 5', frames[1][0], 5)
check('frame[18] last sample == 99 (full coverage)', frames[18][9], 99)

// (2) peakPick golden: exactly [3,7]
const sig = [0, 1, 0, 3, 0, 1, 0, 5, 0]
const picked = peakPick(sig, { preMax: 1, postMax: 1, preAvg: 2, postAvg: 2, delta: 0.5, wait: 1 })
check('peakPick returns exactly [3,7]', picked, [3, 7])

// sparkline with ^ markers under picked indices
const glyphs = ' ▁▂▃▄▅▆▇█'
const mx = Math.max(...sig)
const spark = sig.map((v) => glyphs[Math.round((v / mx) * (glyphs.length - 1))]).join('')
const marks = sig.map((_, i) => (picked.includes(i) ? '^' : ' ')).join('')
console.log(`signal: ${spark}`)
console.log(`peaks:  ${marks}`)

// (3) buf_to_float 16-bit golden values
const bf = buf_to_float(Int16Array.from([16384, -32768]))
check('buf_to_float(Int16 [16384,-32768]) == [0.5,-1]', Array.from(bf), [0.5, -1])

// (4) valid_audio honesty
checkTrue('valid_audio([1, NaN]) === false', valid_audio([1, NaN]) === false)
checkTrue('valid_audio(finite Float32Array) === true', valid_audio(Float32Array.from([0.5, -0.5])) === true)

summary('xa-util: framing + peak-picking known-signal proof')
