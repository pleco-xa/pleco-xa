/**
 * Proof: feature/spectral.js — spectral descriptors vs analytic ground truth.
 *
 * Two known signals at sr=22050: (a) a 1 kHz sine at amplitude 0.5, (b) seeded
 * LCG white noise uniform on [-0.5, 0.5]. Every assert is against closed-form
 * truth (median over frames — centered padding makes edge frames quieter, and
 * the median is the honest frame aggregate).
 *
 * HONESTY NOTE (replaces the plan's "noise flatness > 0.9", which is
 * numerically impossible): the power spectrum of one white-noise realization
 * has Rayleigh magnitudes, i.e. exponentially distributed power, whose
 * geometric/arithmetic mean ratio converges to exp(-gamma) ~= 0.5615
 * (gamma = Euler-Mascheroni). We assert THAT — a stronger, exact expectation —
 * plus a >1e9 sine/noise flatness discrimination ratio.
 */
import { feature } from '../../packages/pleco-xa/dist/pleco-xa.js'
import { check, checkTrue, summary } from './_harness.mjs'

const sr = 22050
const n = sr // 1 s

const sine = new Float32Array(n)
for (let i = 0; i < n; i++) sine[i] = 0.5 * Math.sin((2 * Math.PI * 1000 * i) / sr)

// Seeded LCG (Numerical Recipes constants) — deterministic noise, no Math.random
let seed = 42 >>> 0
const lcg = () => (seed = (1664525 * seed + 1013904223) >>> 0) / 2 ** 32
const noise = new Float32Array(n)
for (let i = 0; i < n; i++) noise[i] = lcg() - 0.5

const median = (a) => {
  const v = Array.from(a).sort((x, y) => x - y)
  return v[v.length >> 1]
}

/* ── sine: every descriptor has a closed form ──────────────────────────────── */
const binHz = sr / 2048 // 10.77 Hz FFT bin width

check('sine centroid == 1000 Hz (±5)', median(feature.spectral_centroid(sine, { sr })), 1000, 5)
check('sine rolloff within 2 bins of 1000 Hz', median(feature.spectral_rolloff(sine, { sr })), 1000, 2 * binHz)
const sineFlat = median(feature.spectral_flatness(sine, { sr }))
checkTrue('sine flatness < 1e-6 (pure tone)', sineFlat < 1e-6, `${sineFlat.toExponential(2)}`)
checkTrue(
  'sine bandwidth < 30 Hz (hann mainlobe scale)',
  median(feature.spectral_bandwidth(sine, { sr })) < 30,
  `${median(feature.spectral_bandwidth(sine, { sr })).toFixed(2)} Hz`,
)
check('sine rms == 0.5/sqrt(2) (±0.001)', median(feature.rms(sine)), 0.5 / Math.SQRT2, 0.001)
check('sine zcr == 2f/sr = 0.0907 (±0.002)', median(feature.zero_crossing_rate(sine)), (2 * 1000) / sr, 0.002)

/* ── noise: flat spectrum closed forms ─────────────────────────────────────── */
const EULER_GAMMA = 0.5772156649015329

check('noise centroid == sr/4 (±3%)', median(feature.spectral_centroid(noise, { sr })), sr / 4, 0.03 * (sr / 4))
check(
  'noise bandwidth == (sr/2)/sqrt(12) (±2%)',
  median(feature.spectral_bandwidth(noise, { sr })),
  sr / 2 / Math.sqrt(12),
  0.02 * (sr / 2 / Math.sqrt(12)),
)
check('noise rolloff == 0.85 * sr/2 (±2%)', median(feature.spectral_rolloff(noise, { sr })), 0.85 * (sr / 2), 0.02 * 0.85 * (sr / 2))
const noiseFlat = median(feature.spectral_flatness(noise, { sr }))
check('noise flatness == exp(-gamma) = 0.5615 (±0.03)', noiseFlat, Math.exp(-EULER_GAMMA), 0.03)
checkTrue(
  'flatness discrimination: noise/sine > 1e9',
  noiseFlat / sineFlat > 1e9,
  `ratio ${(noiseFlat / sineFlat).toExponential(2)}`,
)
check('noise rms == 1/sqrt(12) (±2%)', median(feature.rms(noise)), 1 / Math.sqrt(12), 0.02 / Math.sqrt(12))
check('noise zcr ~= 0.5 (±0.05, sign flips half the time)', median(feature.zero_crossing_rate(noise)), 0.5, 0.05)

summary('feature/spectral: descriptors vs analytic ground truth')
