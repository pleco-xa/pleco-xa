/**
 * sequence/dtw.js — DTW cost matrix + warping path on a known time-warp.
 *
 * X is a 2-dim ramp feature sequence (40 frames); Y duplicates frames 10–19
 * (known warp map). Self-alignment must cost exactly 0 along the exact 40-step
 * diagonal; the warped pair must cost exactly 0 with EVERY path pair obeying
 * the duplication map; subsequence mode must find a zero-cost match starting
 * exactly at the embedding offset inside a noise sequence.
 */
import { sequence } from '../../packages/pleco-xa/dist/pleco-xa.js'
import { check, checkTrue, summary } from './_harness.mjs'

const { dtw, dtwBacktracking } = sequence

// X: 2-dim strictly-monotonic ramp features, 40 frames (feature layout d×N)
const N = 40
const X = [new Float64Array(N), new Float64Array(N)]
for (let i = 0; i < N; i++) {
  X[0][i] = i / 10
  X[1][i] = 2 - i / 20
}

// ── case 1: self-alignment is the exact diagonal at cost 0 ──────────────────
const r1 = dtw(X, X)
check('dtw(X,X) total cost D[N−1][N−1]', r1.D[N - 1][N - 1], 0)
checkTrue('dtw(X,X) path is the exact 40-step diagonal',
  r1.wp.length === N && r1.wp.every(([i, j], k) => i === N - 1 - k && j === N - 1 - k),
  `path length ${r1.wp.length}`)

// ── case 2: known duplication warp ──────────────────────────────────────────
// Y = X with frames 10–19 each duplicated → 50 frames; map(j) gives the X
// frame every Y frame j was copied from.
const M = 50
const map = (j) => (j < 10 ? j : j < 30 ? 10 + Math.floor((j - 10) / 2) : j - 10)
const Y = [new Float64Array(M), new Float64Array(M)]
for (let j = 0; j < M; j++) {
  Y[0][j] = X[0][map(j)]
  Y[1][j] = X[1][map(j)]
}
const r2 = dtw(X, Y)
check('warped pair total cost (verbatim copies → 0)', r2.D[N - 1][M - 1], 0)
checkTrue('every path pair (i, j) obeys the duplication map i == map(j)',
  r2.wp.every(([i, j]) => i === map(j)), `${r2.wp.length} path pairs checked`)
// A zero-cost pair on a strictly monotonic ramp REQUIRES i == map(j) (values
// are unique), so the two asserts together pin the whole warping path.

// ASCII view of the accumulated-cost matrix with the path overlaid
console.log('accumulated cost D (downsampled) with warping path (*):')
const onPath = new Set(r2.wp.map(([i, j]) => `${i},${j}`))
let dMax = 0
for (let i = 0; i < N; i++) for (let j = 0; j < M; j++) dMax = Math.max(dMax, r2.D[i][j])
const shades = ' ·░▒▓█'
for (let i = 0; i < N; i += 2) {
  let line = ''
  for (let j = 0; j < M; j += 2) {
    const cell = [`${i},${j}`, `${i + 1},${j}`, `${i},${j + 1}`, `${i + 1},${j + 1}`]
    if (cell.some((c) => onPath.has(c))) line += '*'
    else line += shades[Math.min(5, Math.floor((r2.D[i][j] / dMax) * 5))]
  }
  console.log(line)
}

// ── case 3: subsequence DTW finds the embedding offset exactly ──────────────
let seed = 7
const lcg = () => (seed = (seed * 1103515245 + 12345) & 0x7fffffff) / 0x7fffffff
const B = 100
const OFFSET = 25
const Z = [new Float64Array(B), new Float64Array(B)]
for (let j = 0; j < B; j++) {
  Z[0][j] = lcg() * 8
  Z[1][j] = lcg() * 8
}
for (let j = 0; j < N; j++) {
  Z[0][OFFSET + j] = X[0][j]
  Z[1][OFFSET + j] = X[1][j]
}
const r3 = dtw(X, Z, { subseq: true })
let minLast = Infinity
let minCol = -1
for (let m = 0; m < B; m++) {
  if (r3.D[N - 1][m] < minLast) {
    minLast = r3.D[N - 1][m]
    minCol = m
  }
}
check('subseq: min over D[last row] (embedded verbatim → 0)', minLast, 0)
check('subseq: matched window ends at column OFFSET+N−1', minCol, OFFSET + N - 1)
check('subseq: path start pair [0, OFFSET] (end-to-start order)',
  r3.wp[r3.wp.length - 1], [0, OFFSET])

// ── dtwBacktracking: standalone backtrack reproduces dtw's internal wp ──────
// Ask dtw for the recorded step matrix, then re-derive the path with the
// public backtracker — it must be bit-identical to the wp dtw returned.
const rSteps = dtw(X, Y, { returnSteps: true })
const wp2 = dtwBacktracking(rSteps.steps)
checkTrue('dtwBacktracking(steps) reproduces dtw wp exactly',
  JSON.stringify(wp2) === JSON.stringify(rSteps.wp),
  `${wp2.length} pairs`)
checkTrue('dtwBacktracking path ends at the origin [0,0]',
  wp2[wp2.length - 1][0] === 0 && wp2[wp2.length - 1][1] === 0,
  JSON.stringify(wp2[wp2.length - 1]))

summary('sequence/dtw — known-warp cost/path goldens + subsequence offset')
