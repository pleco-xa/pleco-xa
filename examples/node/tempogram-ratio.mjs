/**
 * scripts/xa-tempogram.js — tempogram_ratio.
 *
 * Tempogram ratio features (Peeters'05 spectral rhythm patterns, Prockup'15
 * factor table): sample the tempogram at metric multiples of the per-frame
 * tempo, normalizing rhythm out of the absolute BPM. Row 6 (factor 1) is the
 * quarter note (the tempo itself); rows > 6 are sub-metric (half, whole, ...),
 * rows < 6 super-metric (eighth, sixteenth, ...).
 *
 * Two proofs:
 *   A. Direct validation on the committed reference fixture
 *      (tools/goldens/tempogram_ratio.json, shape [13, 173]).
 *   B. Self-contained semantics on a synthetic 120-BPM click train: the
 *      fundamental (factor 1) dominates, only integer subharmonics (1/2, 1/3,
 *      1/4) carry energy, and NO super-metric factor (f > 1) fires because the
 *      click train has no periodicity faster than the tempo.
 *
 * NOTE: tempogram_ratio interpolates with a faithful static-grid
 * routine, NOT the exported f0_harmonics — that helper brackets the frequency
 * grid ascending-in-place and returns all-zeros on the descending, +Inf-headed
 * tempo axis (see module JSDoc).
 */
import { tempogram_ratio } from '../../packages/pleco-xa/dist/pleco-xa.js'
import { check, checkTrue, summary } from './_harness.mjs'
import { readFileSync } from 'node:fs'
import { fileURLToPath } from 'node:url'

const FACTORS = [4, 8 / 3, 3, 2, 4 / 3, 3 / 2, 1, 2 / 3, 3 / 4, 1 / 2, 1 / 3, 3 / 8, 1 / 4]

/* ── Proof A: validation on the fixture ───────────────────────────────────── */
const fx = JSON.parse(
  readFileSync(
    fileURLToPath(new URL('../../tools/goldens/tempogram_ratio.json', import.meta.url)),
    'utf8',
  ),
)
const c = fx.cases[0]
const y = Float32Array.from(c.input.y)
const [R, C] = c.expected_shape
const tgr = tempogram_ratio({ y, sr: c.input.sr, hop_length: c.input.hop_length })

check('fixture output rows == 13 factors', tgr.length, R)
check('fixture output frames == 173', tgr[0].length, C)
checkTrue('rows are Float64Array (typed-array first-class)', tgr[0] instanceof Float64Array)

let maxAbs = 0
for (let h = 0; h < R; h++) {
  for (let t = 0; t < C; t++) {
    const err = Math.abs(tgr[h][t] - c.expected[h * C + t])
    if (err > maxAbs) maxAbs = err
  }
}
checkTrue(
  `fixture parity: max abs deviation ${maxAbs.toExponential(3)} < 2e-3`,
  maxAbs < 2e-3,
  `${maxAbs.toExponential(3)}`,
)

/* ── Proof B: synthetic 120-BPM click train semantics ────────────────────── */
const sr = 22050
const hop = 512
const bpm = 120
const period = Math.round((60 / bpm) * sr) // 11025 samples between clicks
const nSamples = period * 24
const clicks = new Float32Array(nSamples)
for (let i = 0; i < nSamples; i += period) {
  for (let k = 0; k < 64 && i + k < nSamples; k++) {
    clicks[i + k] = Math.exp(-k / 8) * (k === 0 ? 1 : Math.sin(k))
  }
}

const ratio = tempogram_ratio({ y: clicks, sr, hop_length: hop })
const mean = ratio.map((row) => {
  let s = 0
  for (const v of row) s += v
  return s / row.length
})
const absMean = mean.map(Math.abs)
const argmax = absMean.indexOf(Math.max(...absMean))

check('click train: fundamental (factor 1) is the strongest ratio', argmax, 6)
checkTrue(
  'click train: half-note subharmonic (factor 1/2) carries energy',
  mean[9] > 0.1,
  mean[9].toFixed(4),
)
checkTrue(
  'click train: whole-note subharmonic (factor 1/4) carries energy',
  mean[12] > 0.005,
  mean[12].toFixed(4),
)
const superMetric = [0, 1, 2, 3, 4, 5].reduce((a, i) => a + absMean[i], 0)
checkTrue(
  `click train: no super-metric energy (sum|f>1| = ${superMetric.toExponential(2)} ~ 0)`,
  superMetric < 1e-6,
  superMetric.toExponential(2),
)
// Dotted/triplet sub-metric ratios stay silent on a straight (unswung) grid.
const dottedTriplet = [7, 8, 11].reduce((a, i) => a + absMean[i], 0)
checkTrue(
  `click train: dotted/triplet ratios silent on straight grid (${dottedTriplet.toExponential(2)} ~ 0)`,
  dottedTriplet < 1e-6,
  dottedTriplet.toExponential(2),
)

summary('tempogram_ratio proofs')
