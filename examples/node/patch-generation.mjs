/**
 * plot_patch_generation — fixed-size mel patches for ML pipelines.
 *
 * Decodes the house-corpus speech-like WAV (am-noise vocal stand-in),
 * computes feature.melspectrogram, then carves overlapping fixed-size
 * patches with the promoted util frame():
 *   frameLength = time_to_frames(5.0), hopLength = time_to_frames(0.1).
 *
 * Proofs: n_patches == 1 + floor((T − L)/H) exactly, and patch #1
 * elementwise-equals melspec[:, H:H+L]. Copy semantics (documented,
 * asserted): frame() returns COPIES — JS has no strided views, so mutating a
 * patch must NOT write through to the spectrogram.
 */
import { feature, convert, frame, decodeWav } from '../../packages/pleco-xa/dist/pleco-xa.js'
import { ensureCorpus } from './_corpus.mjs'
import { readFileSync } from 'node:fs'
import { check, checkTrue, summary } from './_harness.mjs'

const corpus = ensureCorpus()
const raw = readFileSync(corpus.path('am-noise'))
const { channels, sampleRate: sr } = decodeWav(
  raw.buffer.slice(raw.byteOffset, raw.byteOffset + raw.byteLength))
const y = channels[0]

const HOP = 512
const melspec = feature.melspectrogram(y, { sr, hop_length: HOP })
const nMels = melspec.length
const T = melspec[0].length

const L = convert.time_to_frames(5.0, sr, HOP) // 5.0 s  → 215 frames
const H = convert.time_to_frames(0.1, sr, HOP) // 0.1 s  → 4 frames
const patches = frame(melspec, { frameLength: L, hopLength: H })

console.log('┌──────────────────────────────┬──────────────────────┐')
console.log(`│ melspec shape                │ ${nMels} × ${T}            │`)
console.log(`│ patch length L (5.0 s)       │ ${L} frames           │`)
console.log(`│ patch hop H (0.1 s)          │ ${H} frames             │`)
console.log(`│ patch tensor                 │ ${patches.length} × ${patches[0].length} × ${patches[0][0].length}       │`)
console.log('└──────────────────────────────┴──────────────────────┘')

// Frame-count contracts
check('melspec frame count T == 1 + floor(N/hop) (centered STFT)',
  T, 1 + Math.floor(y.length / HOP))
check('n_patches == 1 + floor((T − L)/H) exactly',
  patches.length, 1 + Math.floor((T - L) / H))
checkTrue('every patch has shape n_mels × L',
  patches.every((p) => p.length === nMels && p.every((row) => row.length === L)),
  `${patches.length} patches, ${nMels}×${L}`)

// View-semantics correctness: patch #1 must equal melspec[:, H:H+L]
let mismatches = 0
for (let m = 0; m < nMels; m++) {
  for (let t = 0; t < L; t++) {
    if (patches[1][m][t] !== melspec[m][H + t]) mismatches++
  }
}
check('patches[1] elementwise == melspec[:, H:H+L] (0 mismatches)', mismatches, 0)

// Copy semantics: patches are COPIES, not strided views.
const before = melspec[0][H]
patches[1][0][0] = 12345
checkTrue('frame() returns copies — mutating a patch does NOT touch melspec (copy semantics)',
  melspec[0][H] === before, `melspec[0][${H}] still ${before.toExponential(3)}`)

summary('plot_patch_generation — mel patches via promoted util frame()')
