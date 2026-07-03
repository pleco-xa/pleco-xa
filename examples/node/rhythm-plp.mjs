/**
 * Proof: scripts/xa-rhythm.js — pulse-strength curve discriminates rhythm from silence;
 * beat_sync exact means.
 * (a) One 16s signal: first 8s digital silence, last 8s of 120 BPM clicks. The plp()
 *     pulse curve over the click half averages > 5x the silent half, and the global max
 *     is exactly 1.0 (the curve is max-normalized). Printed as a sparkline.
 * (b) beat_sync exactness: beat_sync([1..8], [0,4,8], 'mean') === [2.5, 6.5],
 *     aggregate 'max' === [4, 8], and a 2D two-feature-row case is exact per row.
 * NOTE: plp here is a windowed-autocorrelation pulse-strength approximation, NOT
 * a full Fourier-tempogram PLP (documented on the barrel export).
 */
import { plp, beat_sync } from '../../packages/pleco-xa/dist/pleco-xa.js'
import { check, checkTrue, summary } from './_harness.mjs'

const sr = 22050, dur = 16
const y = new Float32Array(sr * dur)
for (let t = 8; t < dur; t += 0.5) {
  const s0 = Math.round(t * sr)
  for (let i = 0; i < Math.round(0.005 * sr); i++) {
    y[s0 + i] += Math.sin((2 * Math.PI * 1000 * i) / sr) * Math.exp(-i / (0.001 * sr))
  }
}

// (a) pulse curve: silence vs clicks
const curve = plp(y, sr)
const half = Math.floor(curve.length / 2)
let silentMean = 0, clickMean = 0, maxPlp = -Infinity
for (let i = 0; i < half; i++) silentMean += curve[i]
for (let i = half; i < curve.length; i++) clickMean += curve[i]
silentMean /= half
clickMean /= curve.length - half
for (const v of curve) if (v > maxPlp) maxPlp = v

const blocks = '▁▂▃▄▅▆▇█'
const step = Math.max(1, Math.floor(curve.length / 80))
let line = ''
for (let i = 0; i < curve.length; i += step) line += blocks[Math.min(7, Math.floor(curve[i] * 8))]
console.log('plp curve (silence | clicks):')
console.log(line)
console.log(`silent-half mean ${silentMean.toFixed(4)}, click-half mean ${clickMean.toFixed(4)}, ratio ${(clickMean / silentMean).toFixed(2)}`)

checkTrue('click-half mean > 5x silent-half mean', clickMean > 5 * silentMean, `ratio=${(clickMean / silentMean).toFixed(2)}`)
check('global max of plp curve === 1.0 (max-normalized)', maxPlp, 1)

// (b) beat_sync goldens
check('beat_sync mean golden [2.5, 6.5]', Array.from(beat_sync([1, 2, 3, 4, 5, 6, 7, 8], [0, 4, 8], 'mean')), [2.5, 6.5])
check('beat_sync max golden [4, 8]', Array.from(beat_sync([1, 2, 3, 4, 5, 6, 7, 8], [0, 4, 8], 'max')), [4, 8])
const twoD = beat_sync([[1, 2, 3, 4, 5, 6, 7, 8], [8, 7, 6, 5, 4, 3, 2, 1]], [0, 4, 8], 'mean')
check('beat_sync 2D row 0 golden [2.5, 6.5]', Array.from(twoD[0]), [2.5, 6.5])
check('beat_sync 2D row 1 golden [6.5, 2.5]', Array.from(twoD[1]), [6.5, 2.5])

summary('xa-rhythm: plp rhythm/silence discrimination + beat_sync goldens')
