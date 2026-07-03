/**
 * Proof: scripts/xa-onset.js — onset envelope + detected onsets vs known click positions.
 * 10s click train at 120 BPM (20 clicks every 0.5s, sr=22050): onset_strength frame
 * count matches ceil(len/hop), onsetDetect recovers 19-20 of the 20 clicks, median
 * inter-onset interval is one hop from 0.500s, and every onset lands within 100ms
 * (one uncentered n_fft window) of a true click.
 */
import { onset_strength, onsetDetect } from '../../packages/pleco-xa/dist/pleco-xa.js'
import { check, checkTrue, summary } from './_harness.mjs'

const sr = 22050
const dur = 10
const hop = 512

const y = new Float32Array(sr * dur)
const clicks = []
for (let t = 0; t < dur; t += 0.5) {
  clicks.push(t)
  const s0 = Math.round(t * sr)
  for (let i = 0; i < Math.round(0.005 * sr); i++) {
    y[s0 + i] += Math.sin((2 * Math.PI * 1000 * i) / sr) * Math.exp(-i / (0.001 * sr))
  }
}

const env = onset_strength(y, { sr })
check('onset_strength frames == ceil(len/hop)', env.length, Math.ceil(y.length / hop))

const { onsetTimes } = onsetDetect(y, sr)
checkTrue('onset count 19-20 for 20 clicks', onsetTimes.length >= 19 && onsetTimes.length <= 20, `n=${onsetTimes.length}`)

console.log('first 5 onsets vs true clicks (uncentered STFT reads early):')
for (let i = 0; i < 5; i++) {
  const nearest = clicks.reduce((p, c) => (Math.abs(c - onsetTimes[i]) < Math.abs(p - onsetTimes[i]) ? c : p))
  console.log(`  onset ${onsetTimes[i].toFixed(4)}s   click ${nearest.toFixed(1)}s   delta ${(onsetTimes[i] - nearest).toFixed(4)}s`)
}

const iois = onsetTimes.slice(1).map((t, i) => t - onsetTimes[i]).sort((a, b) => a - b)
const medianIOI = iois[Math.floor(iois.length / 2)]
check('median inter-onset interval ~ 0.500s (±1 hop)', medianIOI, 0.5, hop / sr)

const maxDelta = Math.max(...onsetTimes.map((t) => Math.min(...clicks.map((c) => Math.abs(t - c)))))
checkTrue('every onset within 100ms of a true click', maxDelta <= 0.1, `max delta ${maxDelta.toFixed(4)}s`)

summary('xa-onset: click-train onset proof')
