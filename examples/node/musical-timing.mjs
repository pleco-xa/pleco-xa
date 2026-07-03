/**
 * Proof: scripts/musical-timing.js — beat-alignment golden table at 120 BPM.
 * Whole-beat power-of-two loop lengths (1,2,4,8,16 beats) must score exactly 1.0;
 * 1.87s scores the measured golden 0.779; and every off-grid length scores strictly
 * below every on-grid length.
 */
import { calculateBeatAlignment } from '../../packages/pleco-xa/dist/pleco-xa.js'
import { check, checkTrue, summary } from './_harness.mjs'

const bpm = 120
const onGrid = [0.5, 1.0, 2.0, 4.0, 8.0] // 1, 2, 4, 8, 16 beats at 120 BPM
const offGrid = [1.87, 2.3, 3.1]

console.log('loopLength(s)  beats  score')
for (const L of [...onGrid, ...offGrid]) {
  const score = calculateBeatAlignment(L, bpm)
  console.log(`  ${L.toFixed(2)}          ${(L / 0.5).toFixed(2).padStart(5)}  ${score.toFixed(4)}`)
}

for (const L of onGrid) {
  check(`f(${L}, 120) === 1.0 exactly (${L / 0.5} beats)`, calculateBeatAlignment(L, bpm), 1.0)
}

check('f(1.87, 120) golden 0.779', calculateBeatAlignment(1.87, bpm), 0.779, 0.001)

const maxOff = Math.max(...offGrid.map((L) => calculateBeatAlignment(L, bpm)))
const minOn = Math.min(...onGrid.map((L) => calculateBeatAlignment(L, bpm)))
checkTrue('every off-grid score < every on-grid score', maxOff < minOn, `maxOff=${maxOff.toFixed(4)} < minOn=${minOn.toFixed(4)}`)

summary('musical-timing: beat-alignment golden table')
