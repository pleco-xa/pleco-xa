/**
 * segment/index.js — Recurrence structure of an A-B-A pattern + exact Ward
 * boundaries.
 *
 * A 60-frame, 12-dim feature matrix built as pattern A(20)-B(20)-A(20) with
 * small deterministic jitter. recurrenceMatrix(mode 'affinity', sym) must
 * light up the A↔A repeat as bright off-diagonal blocks, keep the |i−j|<width
 * band exactly zero, and be exactly symmetric (mutual-kNN sym contract);
 * lagToRecurrence(recurrenceToLag(R)) must reproduce R bit-exactly (the real
 * librosa shear, both directions); agglomerative(data, 3) must return the
 * exact planted boundaries [0, 20, 40].
 */
import { segment } from '../../packages/pleco-xa/dist/pleco-xa.js'
import { check, checkTrue, summary } from './_harness.mjs'

const { recurrenceMatrix, recurrenceToLag, lagToRecurrence, agglomerative, crossSimilarity } = segment

// ── deterministic A-B-A features (12 dims × 60 frames, librosa layout) ──────
const D = 12
const T = 60
let seed = 42
const lcg = () => (seed = (seed * 1103515245 + 12345) & 0x7fffffff) / 0x7fffffff
const baseA = Array.from({ length: D }, () => lcg() * 2 - 1)
const baseB = Array.from({ length: D }, () => lcg() * 2 - 1)
const data = Array.from({ length: D }, () => new Float64Array(T))
for (let t = 0; t < T; t++) {
  const base = t < 20 || t >= 40 ? baseA : baseB
  for (let f = 0; f < D; f++) data[f][t] = base[f] + (lcg() * 2 - 1) * 0.05
}

const width = 3
const R = recurrenceMatrix(data, { mode: 'affinity', sym: true, width })
check('recurrence matrix shape', [R.length, R[0].length], [T, T])

// width band exactly zero
let bandMax = 0
for (let i = 0; i < T; i++) {
  for (let j = 0; j < T; j++) if (Math.abs(i - j) < width) bandMax = Math.max(bandMax, R[i][j])
}
check('|i−j| < width band is exactly zero', bandMax, 0)

// sym=true → exactly symmetric (mutual nearest neighbors)
let symExact = true
for (let i = 0; i < T; i++) {
  for (let j = 0; j < T; j++) if (R[i][j] !== R[j][i]) symExact = false
}
checkTrue('sym=true matrix equals its transpose exactly', symExact)

// A↔A repeat block bright vs A↔B blocks
const meanBlock = (r0, r1, c0, c1) => {
  let s = 0
  let n = 0
  for (let i = r0; i < r1; i++) for (let j = c0; j < c1; j++) { s += R[i][j]; n++ }
  return s / n
}
const mAA = meanBlock(0, 20, 40, 60)
const mAB = (meanBlock(0, 20, 20, 40) + meanBlock(40, 60, 20, 40)) / 2
checkTrue('mean affinity in A↔A repeat block > 5× mean in A↔B blocks',
  mAA > 5 * mAB && mAA > 0, `A↔A ${mAA.toFixed(4)} vs A↔B ${mAB.toFixed(6)}`)

// ASCII shade map of the recurrence structure
console.log('recurrence heatmap (rows/cols downsampled 2:1, ░▒▓█ = affinity):')
const shades = ' ░▒▓█'
for (let i = 0; i < T; i += 2) {
  let line = ''
  for (let j = 0; j < T; j += 2) {
    const v = Math.max(R[i][j], R[i + 1][j], R[i][j + 1], R[i + 1][j + 1])
    line += shades[Math.min(4, Math.ceil(v * 4))]
  }
  console.log(line)
}

// lag round trip is bit-exact
const lag = recurrenceToLag(R)
check('lag matrix shape (pad=true → 2t × t)', [lag.length, lag[0].length], [2 * T, T])
const R2 = lagToRecurrence(lag)
let rtExact = true
for (let i = 0; i < T; i++) {
  for (let j = 0; j < T; j++) if (R2[i][j] !== R[i][j]) rtExact = false
}
checkTrue('lagToRecurrence(recurrenceToLag(R)) reproduces R bit-exactly', rtExact)

// ── crossSimilarity: match repeated frames across two sequences ────────────
// 2-feature × 4-frame pattern where f0==f3 and f1==f2. Self cross-similarity
// (connectivity, k=2) must connect exactly those equal-frame pairs — a
// hand-verifiable golden matrix (columns = queries, rows = reference frames).
const XS = [[1, 0, 0, 1], [0, 1, 1, 0]]
const CS = crossSimilarity(XS, XS, { mode: 'connectivity', k: 2 }).map((r) => Array.from(r))
check('crossSimilarity connects equal frames (f0↔f3, f1↔f2)', CS,
  [[1, 0, 0, 1], [0, 1, 1, 0], [0, 1, 1, 0], [1, 0, 0, 1]])
// cross of two DIFFERENT-length sequences returns an n_ref × n matrix
const CS2 = crossSimilarity(XS, [[1, 0], [0, 1]], { mode: 'connectivity', k: 1 })
check('crossSimilarity(4 frames, 2 ref frames) shape == 2 × 4', [CS2.length, CS2[0].length], [2, 4])

// Ward agglomerative boundaries land exactly on the planted structure
check('agglomerative(data, 3) boundaries', Array.from(agglomerative(data, 3)), [0, 20, 40])

summary('segment — A-B-A recurrence + lag shear + exact Ward boundaries')
