/**
 * scripts/xa-audioio.js — the DSP corner of the audio-IO module.
 *
 * Deterministic goldens:
 *   - toMono averages channels sample-by-sample: [[1,3],[3,1]] → [2,2],
 *   - getDuration(y, sr) == length/sr exactly; getSamplerate reads the buffer,
 *   - autocorrelate of a 100-sample-period sine peaks EXACTLY at lag 100
 *     (searched over lags 50..149, ±0 tolerance),
 *   - lpc order 2 on a pure sinusoid recovers the ideal two-tap predictor
 *     x[n] = 2cos(ω)x[n−1] − x[n−2]: a == [1, −2cos(ω), 1] within 0.02
 *     (measured: −1.9764 vs −1.9842, 0.9921 vs 1 — the implementation carries
 *     a small windowing bias, so exact-pole goldens are NOT asserted), and
 *     lpc always returns order+1 coefficients with a[0] == 1 by convention.
 */
import { audioio } from '../../packages/pleco-xa/dist/pleco-xa.js'
import { check, checkTrue, summary } from './_harness.mjs'

const { toMono, getDuration, getSamplerate, autocorrelate, lpc } = audioio

// ── toMono / getDuration / getSamplerate ────────────────────────────────────
check('toMono([[1,3],[3,1]]) == [2,2] (per-sample channel mean)',
  Array.from(toMono([new Float32Array([1, 3]), new Float32Array([3, 1])])), [2, 2])
check('getDuration(44100 samples @ 22050) == 2.0 s',
  getDuration(new Float32Array(44100), 22050), 2)
check('getSamplerate reads buffer.sampleRate', getSamplerate({ sampleRate: 48000 }), 48000)

// ── autocorrelate: periodic signal peaks at its exact period ────────────────
const period = 100
const sig = new Float32Array(1000)
for (let i = 0; i < sig.length; i++) sig[i] = Math.sin((2 * Math.PI * i) / period)
const ac = autocorrelate(sig, 300)
check('autocorrelate returns maxSize lags', ac.length, 300)
let bestLag = 50
for (let l = 50; l < 150; l++) if (ac[l] > ac[bestLag]) bestLag = l
check('autocorrelate of a period-100 sine peaks exactly at lag 100', bestLag, period)

// ── lpc: sinusoidal predictor identification ────────────────────────────────
const w = (2 * Math.PI) / 50 // period-50 sinusoid
const tone = new Float32Array(1000)
for (let i = 0; i < tone.length; i++) tone[i] = Math.sin(w * i)
const coeffs2 = lpc(tone, 2)
check('lpc order 2 returns 3 coefficients with a[0] == 1', [coeffs2.length, coeffs2[0]], [3, 1])
checkTrue('lpc(sine, 2): a[1] == −2cos(ω) ± 0.02 (two-tap resonator predictor)',
  Math.abs(coeffs2[1] + 2 * Math.cos(w)) <= 0.02, `a[1]=${coeffs2[1].toFixed(4)}`)
checkTrue('lpc(sine, 2): a[2] == 1 ± 0.02', Math.abs(coeffs2[2] - 1) <= 0.02,
  `a[2]=${coeffs2[2].toFixed(4)}`)
const coeffs4 = lpc(tone, 4)
check('lpc order 4 returns 5 coefficients, a[0] == 1', [coeffs4.length, coeffs4[0]], [5, 1])

summary('xa-audioio — toMono/duration/samplerate + autocorrelate/lpc goldens')
