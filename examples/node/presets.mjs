/**
 * plot_presets — presets as plain closures.
 *
 * The preset pattern wraps functions so default parameters can be
 * swapped globally. In JS the same ergonomics is a one-line closure over
 * feature.melspectrogram — no library needed. This script proves the
 * parameter plumbing end to end: each output's frame count must equal
 * 1 + floor(N/hop) for ITS effective hop, and n_mels stays constant.
 */
import { feature } from '../../packages/pleco-xa/dist/pleco-xa.js'
import { check, checkTrue, summary } from './_harness.mjs'

/** The whole 'preset' pattern: defaults baked into a closure, overridable per call. */
const makePreset = (defaults) => (y, overrides = {}) =>
  feature.melspectrogram(y, { ...defaults, ...overrides })

/** 5 s deterministic test signal (440 Hz tone + LCG noise floor). */
function makeSignal(sr, seconds = 5) {
  const n = sr * seconds
  const y = new Float32Array(n)
  let s = 7 >>> 0
  for (let i = 0; i < n; i++) {
    s = (1664525 * s + 1013904223) >>> 0
    y[i] = 0.5 * Math.sin((2 * Math.PI * 440 * i) / sr) + 0.05 * (s / 2147483648 - 1)
  }
  return y
}

const preset44k = makePreset({ sr: 44100, hop_length: 1024, n_fft: 4096 })
const preset11k = makePreset({ sr: 11025, hop_length: 1024, n_fft: 4096 })

const y44 = makeSignal(44100)
const y11 = makeSignal(11025)

const runs = [
  { name: 'preset {sr:44100, hop:1024, n_fft:4096}', S: preset44k(y44), n: y44.length, hop: 1024 },
  { name: 'same preset, per-call override hop:512', S: preset44k(y44, { hop_length: 512 }), n: y44.length, hop: 512 },
  { name: 'preset {sr:11025, hop:1024, n_fft:4096}', S: preset11k(y11), n: y11.length, hop: 1024 },
]

console.log('run                                         │ shape       │ expected frames')
for (const r of runs) {
  console.log(`${r.name.padEnd(43)} │ ${String(r.S.length).padStart(3)} × ${String(r.S[0].length).padEnd(5)} │ ${1 + Math.floor(r.n / r.hop)}`)
}

for (const r of runs) {
  check(`${r.name}: frames == 1 + floor(N/hop) == 1 + floor(${r.n}/${r.hop})`,
    r.S[0].length, 1 + Math.floor(r.n / r.hop))
}
checkTrue('n_mels row count constant across all three runs (128 default)',
  runs.every((r) => r.S.length === 128), runs.map((r) => r.S.length).join(','))
checkTrue('override run has ~2x the frames of the preset run (hop halved)',
  runs[1].S[0].length === 2 * runs[0].S[0].length - 1,
  `${runs[1].S[0].length} vs ${runs[0].S[0].length}`)

summary('plot_presets — closure presets plumb parameters end to end')
