/**
 * Proof: scripts/xa-pitch.js — YIN known-frequency table.
 * Pure sines at 110/220/330/440 Hz (1s, sr=22050): the median yin() estimate must
 * land within 1 Hz of truth; 0.5s of silence must read f0=0 on every frame.
 * pyin is intentionally excluded (and unexported) until it is a real pYIN
 * (HMM/Viterbi decoding — the current one is a median over a YIN ensemble).
 */
import { yin } from '../../packages/pleco-xa/dist/pleco-xa.js'
import { check, checkTrue, summary } from './_harness.mjs'

const sr = 22050

console.log('expected(Hz)  median detected(Hz)  delta(Hz)')
for (const f of [110, 220, 330, 440]) {
  const y = new Float32Array(sr) // 1s
  for (let i = 0; i < y.length; i++) y[i] = 0.5 * Math.sin((2 * Math.PI * f * i) / sr)
  const f0 = Array.from(yin(y, 80, 500, sr)).sort((a, b) => a - b)
  const median = f0[Math.floor(f0.length / 2)]
  console.log(`  ${String(f).padEnd(11)} ${median.toFixed(3).padEnd(20)} ${(median - f).toFixed(3)}`)
  check(`yin median within 1 Hz of ${f} Hz`, median, f, 1.0)
}

const silence = new Float32Array(Math.round(0.5 * sr))
const f0s = yin(silence, 80, 500, sr)
checkTrue('silence: f0 === 0 on every frame', Array.from(f0s).every((v) => v === 0), `${f0s.length} frames`)

summary('xa-pitch: YIN known-frequency table')
