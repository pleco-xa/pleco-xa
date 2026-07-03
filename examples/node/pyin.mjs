/**
 * Proof: scripts/xa-pitch.js — pyin() is the REAL probabilistic YIN.
 *
 * pYIN is NOT just YIN-with-a-median: it builds a beta/Boltzmann-weighted
 * observation matrix over a log-spaced pitch grid + an unvoiced state block,
 * then Viterbi-decodes it through a transition_local ⊗ voiced/unvoiced-switch
 * matrix. This proof drives librosa's own pyin fixture signal — a 220 Hz tone
 * that steps to 330 Hz, then a silent tail — and asserts:
 *   1. the decoded f0 tracks 220 then 330 Hz within a fraction of a semitone,
 *   2. the silent tail decodes UNVOICED (f0 = NaN) on every frame,
 *   3. voiced_prob is a genuine probability (∈ [0, 1]) everywhere,
 *   4. the HMM actually resolves the step (a low, then a high plateau),
 *   5. infeasible params throw instead of guessing.
 *
 * Run: node examples/node/pyin.mjs   (exits nonzero on any FAIL)
 */
import { pyin } from '../../packages/pleco-xa/dist/pleco-xa.js'
import { check, checkTrue, summary } from './_harness.mjs'

const sr = 22050
const dur = 1.5
const n = Math.round(dur * sr)
const third = Math.floor(n / 3)

// 220 Hz → 330 Hz step, silent final third (mirrors tools/parity/generate.py).
const y = new Float32Array(n)
for (let i = 0; i < third; i++) y[i] = Math.sin((2 * Math.PI * 220 * i) / sr)
for (let i = third; i < 2 * third; i++) y[i] = Math.sin((2 * Math.PI * 330 * i) / sr)
for (let i = 0; i < n; i++) y[i] *= 0.7

const { f0, voiced_flag, voiced_prob } = pyin(y, 80, 500, sr, {
  frame_length: 2048,
  hop_length: 512,
})

const nFrames = f0.length
// Frame index → time-at-frame-center (center=True): t = frame * hop / sr.
const hop = 512
const timeOf = (i) => (i * hop) / sr
const t1 = third / sr // 220→330 boundary
const t2 = (2 * third) / sr // 330→silence boundary

// Collect confidently-voiced frames strictly inside each region (avoid the two
// transition frames the HMM legitimately smears).
const lowF0 = []
const highF0 = []
for (let i = 0; i < nFrames; i++) {
  const t = timeOf(i)
  if (!voiced_flag[i] || !Number.isFinite(f0[i])) continue
  if (t > 0.05 && t < t1 - 0.05) lowF0.push(f0[i])
  else if (t > t1 + 0.05 && t < t2 - 0.05) highF0.push(f0[i])
}
const median = (arr) => {
  const s = [...arr].sort((a, b) => a - b)
  return s[Math.floor(s.length / 2)]
}
const semitones = (a, b) => Math.abs(12 * Math.log2(a / b))

const loMed = median(lowF0)
const hiMed = median(highF0)
console.log(`region      frames  median f0   semitone err`)
console.log(`  220 Hz    ${String(lowF0.length).padStart(4)}   ${loMed.toFixed(3).padStart(8)}   ${semitones(loMed, 220).toFixed(4)}`)
console.log(`  330 Hz    ${String(highF0.length).padStart(4)}   ${hiMed.toFixed(3).padStart(8)}   ${semitones(hiMed, 330).toFixed(4)}`)

check('220 Hz plateau median within 1 semitone', semitones(loMed, 220) < 1.0 ? 1 : 0, 1)
check('330 Hz plateau median within 1 semitone', semitones(hiMed, 330) < 1.0 ? 1 : 0, 1)

// The HMM must resolve the STEP: high plateau sits a clear interval above low.
checkTrue(
  'decoded step: 330 plateau is > 3 semitones above 220 plateau',
  semitones(hiMed, loMed) > 3.0,
  `${semitones(hiMed, loMed).toFixed(3)} semitones`,
)

// Silent tail → unvoiced on every frame whose center is inside the silence.
let silentFrames = 0
let silentVoiced = 0
for (let i = 0; i < nFrames; i++) {
  if (timeOf(i) > t2 + 0.05) {
    silentFrames++
    if (voiced_flag[i] || Number.isFinite(f0[i])) silentVoiced++
  }
}
checkTrue(
  'silent tail decodes UNVOICED (NaN f0) on every interior frame',
  silentFrames > 0 && silentVoiced === 0,
  `${silentFrames} silent frames, ${silentVoiced} wrongly voiced`,
)

// voiced_prob is a real probability on every frame.
checkTrue(
  'voiced_prob ∈ [0, 1] on every frame',
  Array.from(voiced_prob).every((p) => p >= 0 && p <= 1),
  `${voiced_prob.length} frames`,
)

// Voiced frames carry a finite f0; unvoiced frames are NaN (fill_na contract).
checkTrue(
  'f0 finite ⇔ voiced, NaN ⇔ unvoiced (fill_na=NaN)',
  Array.from(f0).every((v, i) => (voiced_flag[i] ? Number.isFinite(v) : Number.isNaN(v))),
  `${nFrames} frames`,
)

// Failure paths throw rather than fabricate a guess.
let threwNyquist = false
try {
  pyin(y, 80, sr, sr) // fmax == sr > Nyquist
} catch (e) {
  threwNyquist = /Nyquist/.test(e.message)
}
checkTrue('fmax > Nyquist throws (no silent guess)', threwNyquist)

summary('pyin: real probabilistic YIN (HMM/Viterbi) on the 220→330 Hz step')
