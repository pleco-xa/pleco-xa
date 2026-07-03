/**
 * plot_music_sync.py — align two performances via DTW (librosa music-sync demo).
 *
 * The librosa reference aligns a slow and a fast recording of the same lick and
 * eyeballs the warping path. We make it SELF-VERIFYING by manufacturing a warp
 * of KNOWN factor: take a real audio segment, stretch a copy by exactly 1.25×
 * with the parity-gated phase vocoder (effects.time_stretch), chroma-featurize
 * both (feature.chroma_stft), and DTW-align the chroma sequences
 * (sequence.dtw, cosine metric — same metric as the librosa example).
 *
 * A uniform 1.25× stretch MUST produce a warping path that is a straight line
 * of slope 1.25 in (X-frame, Y-frame) space. So the proof is geometric and
 * falsifiable:
 *   - least-squares slope of the path (di/dj) ≈ 1.25 (±10%),
 *   - R² of that line ≈ 1 (the path really is straight — a constant stretch,
 *     not a coincidental endpoint average),
 *   - endpoints pinned at (0,0) → (Nx−1, Ny−1) and the path is monotonic,
 *   - the frames DTW chose to align are far more similar (lower cosine cost)
 *     than random chroma-frame pairs — it rode a real valley, not noise.
 *
 * X is the ORIGINAL (longer, Nx frames); Y is the STRETCHED copy (shorter, Ny
 * frames), so slope di/dj = Nx/Ny ≈ 1.25. Web twin: examples/web/plot-music-sync.html.
 */
import { effects, feature, sequence, decodeWav } from '../../packages/pleco-xa/dist/pleco-xa.js'
import { check, checkTrue, summary } from './_harness.mjs'
import { readFileSync } from 'node:fs'

const STRETCH = 1.25
const SEG_SECONDS = 8 // first 8 s (matches plot-vocal-separation's real-audio segment)

// ── Load a real audio segment (orphans-mix.wav, mono 22050) ─────────────────
const raw = readFileSync(new URL('../../apps/demo/public/audio/orphans-mix.wav', import.meta.url))
const { channels, sampleRate } = decodeWav(raw.buffer.slice(raw.byteOffset, raw.byteOffset + raw.byteLength))
const N = Math.min(channels[0].length, Math.round(SEG_SECONDS * sampleRate))
const y = channels[0].slice(0, N)

// ── Manufacture the known warp: a 1.25× time-stretched copy ─────────────────
const yStretch = effects.time_stretch(y, STRETCH)
check('time_stretch(y, 1.25) length == round(N / 1.25)', yStretch.length, Math.round(N / STRETCH))

// ── Chroma of both performances (typed-array matrices, 12 × nFrames) ────────
const X = feature.chroma_stft(y, { sr: sampleRate })
const Y = feature.chroma_stft(yStretch, { sr: sampleRate })
const Nx = X[0].length
const Ny = Y[0].length
checkTrue('chroma matrices are Float64Array rows (typed-array first-class)',
  X[0] instanceof Float64Array && Y[0] instanceof Float64Array, `X 12×${Nx}, Y 12×${Ny}`)

// The applied stretch is 1.25; report the measured chroma-frame ratio so the
// assertion target is honest. Here they coincide (STFT hop math preserves it),
// so 1.25 is the target; if they diverged we would assert the measured ratio.
const frameRatio = Nx / Ny
const endpointSlope = (Nx - 1) / (Ny - 1)
console.log(`\napplied stretch = ${STRETCH}  |  measured chroma-frame ratio Nx/Ny = ${frameRatio.toFixed(4)} (Nx=${Nx}, Ny=${Ny})`)

// ── DTW-align the chroma sequences (cosine metric, as in the librosa demo) ──
const { D, wp } = sequence.dtw(X, Y, { metric: 'cosine' })
// wp is librosa order: wp[0] = end (Nx−1, Ny−1), wp[last] = start (0, 0).
const startPair = wp[wp.length - 1]
const endPair = wp[0]

// ── Endpoints (0,0) → (Nx−1, Ny−1) ──────────────────────────────────────────
check('warp path starts at (0, 0)', startPair, [0, 0])
check('warp path ends at (Nx−1, Ny−1)', endPair, [Nx - 1, Ny - 1])

// ── Monotonicity: read forward (reverse of wp), i and j never decrease and
//    every step advances by at least one frame ───────────────────────────────
let monotonic = true
for (let k = wp.length - 1; k > 0; k--) {
  const [i0, j0] = wp[k]
  const [i1, j1] = wp[k - 1]
  if (i1 < i0 || j1 < j0 || (i1 - i0) + (j1 - j0) < 1) { monotonic = false; break }
}
checkTrue('warp path is monotonic (i, j non-decreasing; every step advances)',
  monotonic, `${wp.length} path points`)

// ── Average slope: least-squares fit i = a·j + b over all path points ───────
// A uniform stretch ⇒ the true warp is a straight line of slope = stretch.
let n = wp.length, sj = 0, si = 0, sjj = 0, sji = 0
for (const [i, j] of wp) { sj += j; si += i; sjj += j * j; sji += j * i }
const slope = (n * sji - sj * si) / (n * sjj - sj * sj)
const intercept = (si - slope * sj) / n
let ssRes = 0, ssTot = 0
const meanI = si / n
for (const [i, j] of wp) { const pred = slope * j + intercept; ssRes += (i - pred) ** 2; ssTot += (i - meanI) ** 2 }
const r2 = 1 - ssRes / ssTot

check('warp-path least-squares slope ≈ stretch factor 1.25 (±10%)', slope, STRETCH, STRETCH * 0.1)
checkTrue('path is a straight line — R² > 0.99 (constant stretch recovered)',
  r2 > 0.99, `R² = ${r2.toFixed(5)}`)

// ── Alignment quality: aligned frames are far more similar than random pairs ─
// Cosine distance matching sequence.dtw's cosine metric: 1 − x·y / (|x||y|).
function cosDist(A, colA, B, colB) {
  let dot = 0, na = 0, nb = 0
  for (let c = 0; c < A.length; c++) {
    const a = A[c][colA], b = B[c][colB]
    dot += a * b; na += a * a; nb += b * b
  }
  const denom = Math.sqrt(na) * Math.sqrt(nb)
  return denom > 0 ? 1 - dot / denom : 1
}
let pathCost = 0
for (const [i, j] of wp) pathCost += cosDist(X, i, Y, j)
const pathMean = pathCost / wp.length
// Baseline: mean cosine distance of deterministically-sampled unrelated pairs.
let seed = 12345
const lcg = () => (seed = (seed * 1103515245 + 12345) & 0x7fffffff) / 0x7fffffff
let baseSum = 0
const nSamp = 2000
for (let s = 0; s < nSamp; s++) {
  baseSum += cosDist(X, Math.floor(lcg() * Nx), Y, Math.floor(lcg() * Ny))
}
const baseMean = baseSum / nSamp
checkTrue('aligned-frame cosine cost ≪ random-pair cost (rode a real valley)',
  pathMean < 0.5 * baseMean, `path ${pathMean.toFixed(4)} vs random ${baseMean.toFixed(4)}`)

// ── Printed slope + endpoints table (task deliverable) ──────────────────────
console.log('\n  quantity                         value')
console.log('  ───────────────────────────────  ─────────')
console.log(`  applied stretch factor           ${STRETCH.toFixed(4)}`)
console.log(`  endpoint slope (Nx−1)/(Ny−1)     ${endpointSlope.toFixed(4)}`)
console.log(`  least-squares path slope         ${slope.toFixed(4)}`)
console.log(`  fit R²                           ${r2.toFixed(5)}`)
console.log(`  path start (X-frame, Y-frame)    (${startPair[0]}, ${startPair[1]})`)
console.log(`  path end   (X-frame, Y-frame)    (${endPair[0]}, ${endPair[1]})`)
console.log(`  path length                      ${wp.length}`)
console.log(`  aligned-frame mean cosine cost   ${pathMean.toFixed(4)}`)
console.log(`  random-pair mean cosine cost     ${baseMean.toFixed(4)}`)

// ── ASCII accumulated-cost matrix D (downsampled) with the warp path (*) ────
console.log('\naccumulated cost D (downsampled) with warping path (*)  — X-frame rows × Y-frame cols:')
const onPath = new Set(wp.map(([i, j]) => `${i},${j}`))
let dMax = 0
for (let i = 0; i < Nx; i++) for (let j = 0; j < Ny; j++) if (Number.isFinite(D[i][j])) dMax = Math.max(dMax, D[i][j])
const shades = ' ·░▒▓█'
const rowStep = Math.ceil(Nx / 32)
const colStep = Math.ceil(Ny / 64)
for (let i = 0; i < Nx; i += rowStep) {
  let line = ''
  for (let j = 0; j < Ny; j += colStep) {
    let hit = false
    for (let di = 0; di < rowStep && !hit; di++) for (let dj = 0; dj < colStep; dj++) {
      if (onPath.has(`${i + di},${j + dj}`)) { hit = true; break }
    }
    line += hit ? '*' : shades[Math.min(5, Math.floor((D[i][j] / dMax) * 5))]
  }
  console.log(line)
}

summary('plot_music_sync — DTW recovers a known 1.25× stretch as a slope-1.25 warp path')
