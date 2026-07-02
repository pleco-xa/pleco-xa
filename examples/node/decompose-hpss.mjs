/**
 * decompose/index.js — HPSS separates a sine + click train cleanly.
 *
 * 1 s of 440 Hz sine + 10 broadband clicks, stft(1024, 256) → magnitude →
 * hpss(). The horizontal 440 Hz line must land in the harmonic component and
 * the vertical click stripes in the percussive component; at margin=1 the
 * masked components must sum back to S (softmask complementarity), and
 * power=Infinity must yield a strict 0/1 hard mask.
 * Web twin: examples/web/decompose-hpss.html (3-panel spectrogram triptych).
 */
import { decompose, stft } from '../../packages/pleco-xa/dist/pleco-xa.js'
import { check, checkTrue, summary } from './_harness.mjs'

const SR = 22050
const N = SR // 1 s
const CLICK_TIMES = Array.from({ length: 10 }, (_, k) => 0.05 + 0.1 * k) // 0.05..0.95 s

const y = new Float32Array(N)
for (let i = 0; i < N; i++) y[i] = 0.6 * Math.sin((2 * Math.PI * 440 * i) / SR)
for (const t of CLICK_TIMES) {
  const s = Math.round(t * SR)
  for (let k = 0; k < 24; k++) y[s + k] += (k % 2 ? -0.9 : 0.9) * (1 - k / 24)
}

const N_FFT = 1024
const HOP = 256
const D = stft(y, N_FFT, HOP)
const nFreq = D.length
const nFrames = D[0].length
const S = D.map((row) => Float64Array.from(row, (c) => Math.hypot(c.real, c.imag)))
check('stft shape 513 x frames', nFreq, 513)

const { harmonic: H, percussive: P } = decompose.hpss(S)

// ── (1) the 440 Hz line lives in the harmonic component ────────────────────
const bin440 = Math.round((440 * N_FFT) / SR) // 20
const rowEnergy = (M, f) => M[f].reduce((a, v) => a + v * v, 0)
const r440 = rowEnergy(H, bin440) / rowEnergy(P, bin440)
checkTrue('440 Hz-bin energy: harmonic/percussive ratio > 100', r440 > 100, r440.toExponential(2))

// ── (2) the click columns live in the percussive component ─────────────────
// click frames: centered stft puts the click at frame round(sample/hop);
// exclude the tone's bins so the measure isolates the broadband stripe
const colEnergyAbove = (M, t, fMin) => {
  let e = 0
  for (let f = fMin; f < nFreq; f++) e += M[f][t] * M[f][t]
  return e
}
let clickPerc = 0
let clickHarm = 0
for (const t of CLICK_TIMES) {
  const frame = Math.round((t * SR) / HOP)
  clickPerc += colEnergyAbove(P, frame, 40)
  clickHarm += colEnergyAbove(H, frame, 40)
}
checkTrue('click-frame column energy (above the tone): percussive/harmonic > 10',
  clickPerc / clickHarm > 10, (clickPerc / clickHarm).toExponential(2))

// ── (3) margin=1 complementarity: H + P == S per bin ───────────────────────
let maxDev = 0
for (let f = 0; f < nFreq; f++) {
  for (let t = 0; t < nFrames; t++) {
    maxDev = Math.max(maxDev, Math.abs(H[f][t] + P[f][t] - S[f][t]))
  }
}
checkTrue('|harmonic + percussive - S| max deviation < 1e-6 per bin', maxDev < 1e-6, maxDev.toExponential(2))

// ── (4) mask=true: masks sum to exactly 1 ──────────────────────────────────
const { harmonic: MH, percussive: MP } = decompose.hpss(S, { mask: true })
let maxMaskDev = 0
for (let f = 0; f < nFreq; f++) {
  for (let t = 0; t < nFrames; t++) {
    maxMaskDev = Math.max(maxMaskDev, Math.abs(MH[f][t] + MP[f][t] - 1))
  }
}
checkTrue('mask=true: maskH + maskP == 1 to 1e-12', maxMaskDev < 1e-12, maxMaskDev.toExponential(2))

// ── (5) power=Infinity: strict 0/1 hard mask ───────────────────────────────
const { harmonic: HH, percussive: HP } = decompose.hpss(S, { mask: true, power: Infinity })
let nonBinary = 0
for (let f = 0; f < nFreq; f++) {
  for (let t = 0; t < nFrames; t++) {
    if ((HH[f][t] !== 0 && HH[f][t] !== 1) || (HP[f][t] !== 0 && HP[f][t] !== 1)) nonBinary++
  }
}
check('mask=true, power=Infinity: every mask value is exactly 0 or 1 (hard mask)', nonBinary, 0)

summary('decompose/index.js — HPSS triptych: sine + click train separates cleanly')
