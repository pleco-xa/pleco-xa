/**
 * laplacian-segmentation — REAL McFee-Ellis Laplacian structural segmentation
 * (2014), the spectral-clustering method of librosa's
 * docs/examples/plot_segmentation.py, now that every primitive it needs exists
 * in pleco (segment.laplacianSegmentation = recurrence → time-lag median filter
 * → normalized graph laplacian → linalg.eigh → cluster.kmeans).
 *
 * This is the UPGRADED sibling of plot-segmentation (which stops at recurrence +
 * agglomerative — the bottom-up Ward slice). The Laplacian method additionally
 * recovers NON-adjacent recurring sections: a chorus that returns later gets the
 * SAME label, which agglomerative (contiguous-only) can never express.
 *
 * ── Proof strategy (honest; no ground-truth boundary fixture for real audio) ──
 * Part 1 (HARD PASS/FAIL GATE): a SYNTHETIC 3-block control whose segmentation
 *   is unambiguous — the exact known-structure matrix from the unit test
 *   (tests/segment-laplacian.test.js). The boundaries MUST land on [20, 40]
 *   (±2 frames). If the composition is wrong, this fails and the process exits
 *   nonzero. Nothing about the real-audio section below can paper over it.
 * Part 2 (QUALITATIVE, but every asserted property is verifiable): the real
 *   structured clip orphans-mix.wav (16 s, verse/chorus material) run through
 *   the true pipeline. We do NOT invent ground-truth boundaries; we assert only
 *   what is checkable from the output itself —
 *     • k distinct labels are actually produced,
 *     • boundaries are strictly increasing and internal (0 < b < n_segments),
 *     • adjacent segments differ (guaranteed by the boundary definition — asserted
 *       as a self-consistency check, not assumed),
 *     • re-running with the same seed is bit-identical (determinism), and
 *     • a label RECURS across ≥2 non-adjacent segments (the McFee-Ellis headline:
 *       a returning section, impossible for the agglomerative sibling).
 *   The segment table (label, start_time, end_time) is the qualitative output.
 *
 * Feature scaling note (divergence from librosa, documented not hidden):
 * librosa's example feeds a log-power CQT to the recurrence graph and MFCCs to
 * the path graph SEPARATELY. pleco's laplacianSegmentation takes ONE feature
 * matrix and builds both graphs from it, so we stack chroma + MFCC and z-score
 * each row (zero-mean/unit-variance) — otherwise the large-magnitude MFCC
 * coefficients would swamp the [0,1] chroma bins in the Euclidean recurrence
 * distances. The synthetic gate is scale-free (constant blocks), so it is
 * unaffected by this choice.
 */
import {
  decodeWav, beat_track, feature, sync, segment, convert,
} from '../../packages/pleco-xa/dist/pleco-xa.js'
import { check, checkTrue, summary } from './_harness.mjs'
import { readFileSync } from 'node:fs'
import { fileURLToPath } from 'node:url'

const { laplacianSegmentation } = segment

// ─────────────────────────────────────────────────────────────────────────────
// Part 1 — SYNTHETIC 3-BLOCK CONTROL (the hard pass/fail gate)
// Reproduces tests/segment-laplacian.test.js makeBlocks: a (12 × 60) matrix of
// three contiguous 20-frame blocks, each a distinct constant vector + tiny
// deterministic jitter. The true onsets are [20, 40].
// ─────────────────────────────────────────────────────────────────────────────
function mulberry32(seed) {
  let a = seed >>> 0
  return function () {
    a = (a + 0x6d2b79f5) | 0
    let t = Math.imul(a ^ (a >>> 15), 1 | a)
    t = (t + Math.imul(t ^ (t >>> 7), 61 | t)) ^ t
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296
  }
}
function makeBlocks({ d = 12, perBlock = 20, blocks = 3, noise = 0.01, seed = 1 } = {}) {
  const rng = mulberry32(seed)
  const n = perBlock * blocks
  const step = Math.floor(d / blocks)
  const feats = Array.from({ length: d }, () => new Float64Array(n))
  for (let t = 0; t < n; t++) {
    const b = Math.floor(t / perBlock)
    const active = b * step
    for (let f = 0; f < d; f++) {
      feats[f][t] = (f === active ? 1 : 0) + noise * (rng() - 0.5)
    }
  }
  return { feats, n, perBlock }
}

console.log('── Part 1: synthetic 3-block control (hard gate) ──')
{
  const { feats, perBlock } = makeBlocks({ blocks: 3, perBlock: 20 })
  const { segmentIds, boundaries } = laplacianSegmentation(feats, { k: 3 })

  checkTrue('segmentIds is an Int32Array of length 60',
    segmentIds instanceof Int32Array && segmentIds.length === 60,
    `${segmentIds.constructor.name}[${segmentIds.length}]`)
  check('exactly 3 contiguous segments ⇒ exactly 2 internal boundaries',
    boundaries.length, 2)
  checkTrue('boundaries land on the true onsets [20, 40] within ±2 frames',
    Math.abs(boundaries[0] - perBlock) <= 2 && Math.abs(boundaries[1] - 2 * perBlock) <= 2,
    `[${boundaries}] vs [20, 40]`)
  check('three distinct segment labels', new Set(segmentIds).size, 3)

  // Interiors (away from the ±2 slack) are internally constant, all-distinct.
  let interiorsConstant = true
  for (const [lo, hi] of [[2, 18], [22, 38], [42, 58]]) {
    const label = segmentIds[lo]
    for (let t = lo; t <= hi; t++) if (segmentIds[t] !== label) interiorsConstant = false
  }
  checkTrue('each block interior is internally constant', interiorsConstant)
  check('the three interior labels are mutually distinct',
    new Set([segmentIds[10], segmentIds[30], segmentIds[50]]).size, 3)
}

// ─────────────────────────────────────────────────────────────────────────────
// Part 2 — REAL STRUCTURED AUDIO (orphans-mix.wav, verse/chorus material)
// ─────────────────────────────────────────────────────────────────────────────
console.log('\n── Part 2: real audio — orphans-mix.wav (16 s) ──')

const wavPath = fileURLToPath(new URL(
  '../../apps/demo/public/audio/orphans-mix.wav', import.meta.url,
))
const raw = readFileSync(wavPath)
const { channels, sampleRate: sr } = decodeWav(
  raw.buffer.slice(raw.byteOffset, raw.byteOffset + raw.byteLength),
)
const y = channels[0]
const HOP = 512
const K = 3

check('decoded sample rate is 22050', sr, 22050)
console.log(`  loaded ${(y.length / sr).toFixed(2)} s of mono audio`)

// beat_track → beat-synchronous chroma + MFCC stack
const { tempo, beats } = beat_track(y, sr)
const beatArr = Array.from(beats)
checkTrue('beat_track finds a plausible beat grid (≥ 24 beats over 16 s)',
  beatArr.length >= 24, `${tempo.toFixed(2)} BPM, ${beatArr.length} beats`)

const chroma = feature.chroma_stft(y, { sr })
const mfcc = feature.mfcc(y, { sr, n_mfcc: 13 })
const nFrames = chroma[0].length
const segBounds = [0, ...beatArr, nFrames] // sync boundaries; pleco aggregates between them
const Csync = sync(chroma, segBounds)
const Msync = sync(mfcc, segBounds)
const nCols = Csync[0].length
check('beat-synchronous columns == n_beats + 1', nCols, beatArr.length + 1)

// z-score each feature row so chroma [0,1] and large-magnitude MFCC contribute
// comparably to the recurrence distances (see header note).
const zscore = (mat) => mat.map((row) => {
  let m = 0
  for (const v of row) m += v
  m /= row.length
  let s = 0
  for (const v of row) s += (v - m) ** 2
  s = Math.sqrt(s / row.length) || 1
  return Float64Array.from(row, (v) => (v - m) / s)
})
const feats = [...zscore(Csync), ...zscore(Msync)] // (12 + 13) × n_beatsegments

// The real segmentation
const { segmentIds, boundaries } = laplacianSegmentation(feats, { k: K })

// ── Verifiable properties (no ground-truth boundaries invented) ──
check(`exactly k=${K} distinct labels are produced`, new Set(segmentIds).size, K)

let strictlyIncreasing = true
for (let i = 1; i < boundaries.length; i++) {
  if (!(boundaries[i] > boundaries[i - 1])) strictlyIncreasing = false
}
checkTrue('boundaries are strictly increasing', strictlyIncreasing, `[${boundaries}]`)
checkTrue('boundaries are internal and span the track (0 < b < n_segments)',
  boundaries.length > 0 && boundaries[0] > 0 && boundaries[boundaries.length - 1] < nCols,
  `first ${boundaries[0]}, last ${boundaries[boundaries.length - 1]}, n=${nCols}`)

// Adjacent segments differ — guaranteed by the boundary definition; asserted as
// a self-consistency check on the returned arrays (never assumed).
let adjacentDiffer = true
for (const b of boundaries) if (segmentIds[b - 1] === segmentIds[b]) adjacentDiffer = false
checkTrue('every boundary separates two different labels (adjacent segments differ)',
  adjacentDiffer)

// Determinism: same seed → bit-identical output across independent calls.
const rerun = laplacianSegmentation(feats, { k: K })
checkTrue('re-running is deterministic (identical segmentIds)',
  JSON.stringify(Array.from(segmentIds)) === JSON.stringify(Array.from(rerun.segmentIds)))
checkTrue('re-running is deterministic (identical boundaries)',
  JSON.stringify(boundaries) === JSON.stringify(rerun.boundaries))

// The McFee-Ellis headline: build contiguous segment runs, find a label that
// RECURS across ≥2 non-adjacent runs (a returning section — impossible for the
// contiguous agglomerative sibling).
const runs = [] // { label, c0, c1 }
{
  const edges = [0, ...boundaries, nCols]
  for (let i = 0; i < edges.length - 1; i++) {
    runs.push({ label: segmentIds[edges[i]], c0: edges[i], c1: edges[i + 1] })
  }
}
const runsPerLabel = new Map()
for (const r of runs) runsPerLabel.set(r.label, (runsPerLabel.get(r.label) || 0) + 1)
const recurring = [...runsPerLabel.entries()].find(([, count]) => count >= 2)
// Existence is only a PRECONDITION (with more runs than labels, pigeonhole
// alone forces some label to repeat — that fact proves nothing about content).
checkTrue('precondition: a label owns ≥2 non-adjacent segments',
  !!recurring, recurring ? `label ${recurring[0]} in ${recurring[1]} segments` : 'none')
const recurringLabel = recurring[0]

// STRENGTHENED PROOF (defeats the pigeonhole objection): the returning section
// must be a genuine FEATURE-SPACE match, not a counting artifact. Represent
// each run by its centroid in the (z-scored chroma+MFCC) feature space, then
// show the recurring label's segments are closer to EACH OTHER than they are to
// other-label segments — and tighter than a typical segment pair. A random /
// pigeonhole labeling would NOT satisfy this; real recurrence does.
const D = feats.length
const runCentroid = (r) => {
  const c = new Float64Array(D)
  for (let f = 0; f < D; f++) {
    let s = 0
    for (let t = r.c0; t < r.c1; t++) s += feats[f][t]
    c[f] = s / (r.c1 - r.c0)
  }
  return c
}
const l2 = (a, b) => {
  let s = 0
  for (let f = 0; f < D; f++) { const d = a[f] - b[f]; s += d * d }
  return Math.sqrt(s)
}
const centroids = runs.map(runCentroid)
const recIdx = runs.map((r, i) => (r.label === recurringLabel ? i : -1)).filter((i) => i >= 0)
const otherIdx = runs.map((r, i) => (r.label === recurringLabel ? -1 : i)).filter((i) => i >= 0)

const mean = (xs) => xs.reduce((a, b) => a + b, 0) / xs.length
const intraPairs = []
for (let a = 0; a < recIdx.length; a++)
  for (let b = a + 1; b < recIdx.length; b++)
    intraPairs.push(l2(centroids[recIdx[a]], centroids[recIdx[b]]))
const interPairs = []
for (const ri of recIdx) for (const oi of otherIdx) interPairs.push(l2(centroids[ri], centroids[oi]))
const allPairs = []
for (let a = 0; a < runs.length; a++)
  for (let b = a + 1; b < runs.length; b++) allPairs.push(l2(centroids[a], centroids[b]))

const intraMean = mean(intraPairs)
const interMean = mean(interPairs)
const globalMean = mean(allPairs)

checkTrue(
  'RECURRING segments are closer to each other than to other-label segments (real content match)',
  intraMean < interMean,
  `intra ${intraMean.toFixed(3)} < inter ${interMean.toFixed(3)}`,
)
checkTrue(
  'RECURRING segments are tighter than a typical segment pair (below the global mean)',
  intraMean < globalMean,
  `intra ${intraMean.toFixed(3)} < global-mean ${globalMean.toFixed(3)}`,
)

// ── Qualitative output: the segment table (label, start_time, end_time) ──
const colStartTime = (col) => convert.frames_to_time(segBounds[col], sr, HOP)
console.log('\n  segment table (McFee-Ellis Laplacian, k=' + K + ', orphans-mix.wav):')
console.log('  ┌──────┬────────┬──────────┬──────────┬──────────┐')
console.log('  │ seg  │ label  │  start s │   end  s │  beats   │')
console.log('  ├──────┼────────┼──────────┼──────────┼──────────┤')
runs.forEach((r, i) => {
  const t0 = colStartTime(r.c0).toFixed(2).padStart(8)
  const t1 = colStartTime(r.c1).toFixed(2).padStart(8)
  const nb = String(r.c1 - r.c0).padStart(3)
  const recur = runsPerLabel.get(r.label) >= 2 ? ' ↩ recurs' : ''
  console.log(`  │ ${String(i).padStart(4)} │ ${String(r.label).padStart(6)} │ ${t0} │ ${t1} │   ${nb}    │${recur}`)
})
console.log('  └──────┴────────┴──────────┴──────────┴──────────┘')
console.log(`  label sequence: [${Array.from(segmentIds).join('')}]`)

summary('laplacian-segmentation — synthetic control (exact) + real McFee-Ellis structure')
