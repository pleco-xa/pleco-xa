/**
 * Proof: scripts/xa-harmonic.js — harmonic energy ratios + HPS pitch +
 * repaired salience.
 *
 * Signal: 1 s of 220 Hz + 440 Hz (0.5x) + 660 Hz (0.25x) at sr=22050,
 * stft(2048/512) magnitude. f0_harmonics must recover the 1 : 0.5 : 0.25
 * amplitude ladder within 15% (window-leakage tolerance); the harmonic
 * product spectrum must peak within one FFT bin of 220 Hz; and the repaired
 * salience (correct semantics: weighted-average aggregate + frequency-axis
 * peak filter of the ORIGINAL S — the old code filtered along TIME) must put
 * its strongest surviving peak at the fundamental.
 */
import {
  stft, fft_frequencies, f0_harmonics, salience, harmonic_product_spectrum,
} from '../../packages/pleco-xa/dist/pleco-xa.js'
import { check, checkTrue, summary } from './_harness.mjs'

const sr = 22050
const n = sr
const n_fft = 2048
const hop = 512
const binHz = sr / n_fft

const y = new Float32Array(n)
for (let i = 0; i < n; i++) {
  const t = i / sr
  y[i] =
    0.6 * Math.sin(2 * Math.PI * 220 * t) +
    0.3 * Math.sin(2 * Math.PI * 440 * t) +
    0.15 * Math.sin(2 * Math.PI * 660 * t)
}

const D = stft(y, n_fft, hop)
const nF = D.length
const nT = D[0].length
const S = Array.from({ length: nF }, (_, f) =>
  Float64Array.from({ length: nT }, (_, t) => Math.hypot(D[f][t].real, D[f][t].imag)),
)
const freqs = fft_frequencies(sr, n_fft)
const mid = nT >> 1

/* ── f0_harmonics: energy ladder at 1x/2x/3x of f0=220 ─────────────────────── */
const H = f0_harmonics(S, new Array(nT).fill(220), freqs, [1, 2, 3])
const e1 = H[0][mid]
const e2 = H[1][mid]
const e3 = H[2][mid]
console.log(`mid-frame harmonic energies: ${e1.toFixed(1)} : ${e2.toFixed(1)} : ${e3.toFixed(1)}`)
check('2nd/1st harmonic ratio == 0.5 (±15%)', e2 / e1, 0.5, 0.075)
check('3rd/1st harmonic ratio == 0.25 (±15%)', e3 / e1, 0.25, 0.0375)

/* ── harmonic product spectrum: fundamental within one FFT bin ─────────────── */
const col = Array.from({ length: nF }, (_, f) => S[f][mid])
const hps = harmonic_product_spectrum(col, 3)
let hpsPeak = 0
for (let i = 1; i < hps.length; i++) if (hps[i] > hps[hpsPeak]) hpsPeak = i
check('HPS peak within 1 bin of 220 Hz', hpsPeak * binHz, 220, binHz)

/* ── salience (post-repair): strongest surviving freq-axis peak == f0 ──────── */
const sal = salience(S, freqs, [1, 2, 3], null, null, true, 0)
let salPeak = 0
for (let f = 1; f < nF; f++) if (sal[f][mid] > sal[salPeak][mid]) salPeak = f
check('salience argmax within 1 bin of 220 Hz', salPeak * binHz, 220, binHz)
// The freq-axis peak filter must actually filter: most bins carry fill_value
let kept = 0
for (let f = 0; f < nF; f++) if (sal[f][mid] !== 0) kept++
checkTrue(
  'peak filter keeps only spectral peaks (<50% of bins survive)',
  kept < nF / 2,
  `${kept}/${nF} bins survive`,
)
// Edge rows can never be argrelmax peaks (mode='clip' semantics)
checkTrue('edge rows always filtered (argrelmax clip)', sal[0][mid] === 0 && sal[nF - 1][mid] === 0)

summary('xa-harmonic: harmonic ladder + HPS + repaired salience')
