/**
 * Proof: scripts/xa-tempo.js — DJ tempo-candidate pipeline + swing detector on known grooves.
 * (a) A 10s click train at 128 BPM: onset_strength -> compute_tempogram(env, sr, 512, 4) ->
 *     find_tempo_candidates(tg, sr, 512, 200, 60); the top candidate lands within one lag
 *     bin (<= 7 BPM) of 128. The tempogram is printed as a sparkline with the peak marked.
 * (b) detect_tempo_multiples(128, candidates) finds half_time ~64 when a 64 BPM candidate
 *     is injected.
 * (c) analyze_groove on a perfectly straight 0.5s grid returns the exact golden
 *     {swing: 0, timing_variance: 0, mean_interval: 0.5, groove_consistency: 1}; a swung
 *     grid alternating 0.32s/0.18s intervals (16 beats) returns swing >= 0.8 and
 *     groove_consistency < 0.5.
 */
import {
  onset_strength, compute_tempogram, find_tempo_candidates,
  detect_tempo_multiples, analyze_groove,
} from '../../packages/pleco-xa/dist/pleco-xa.js'
import { check, checkTrue, summary } from './_harness.mjs'

const sr = 22050, dur = 10, hop = 512, period = 60 / 128
const y = new Float32Array(sr * dur)
for (let t = 0; t < dur; t += period) {
  const s0 = Math.round(t * sr)
  for (let i = 0; i < Math.round(0.005 * sr); i++) {
    y[s0 + i] += Math.sin((2 * Math.PI * 1000 * i) / sr) * Math.exp(-i / (0.001 * sr))
  }
}

// (a) tempogram -> candidates
const env = onset_strength(y, { sr })
const tg = compute_tempogram(env, sr, hop, 4)
const candidates = find_tempo_candidates(tg, sr, hop, 200, 60)

// Terminal sparkline of the tempogram with the top candidate's lag marked
const blocks = '▁▂▃▄▅▆▇█'
let tgMax = 0
for (const v of tg) if (v > tgMax) tgMax = v
const line = Array.from(tg, (v) => blocks[Math.min(7, Math.floor((v / tgMax) * 8))])
const marker = new Array(tg.length).fill(' ')
if (candidates.length > 0) marker[candidates[0].period] = '^'
console.log('tempogram (lag 0..):')
console.log(line.join(''))
console.log(marker.join('') + (candidates.length ? ` peak lag ${candidates[0].period} = ${candidates[0].bpm.toFixed(1)} BPM` : ''))
console.log('top-3 candidates:', candidates.slice(0, 3).map((c) => `${c.bpm.toFixed(1)} BPM (strength ${c.strength.toFixed(2)})`).join(', '))

checkTrue('top tempo candidate within one lag bin of 128 BPM (|d| <= 7)',
  candidates.length > 0 && Math.abs(candidates[0].bpm - 128) <= 7,
  candidates.length ? `top=${candidates[0].bpm.toFixed(2)}` : 'no candidates')

// (b) tempo multiples with an injected 64 BPM candidate
const withHalf = [...candidates, { bpm: 64, strength: 0.5 }]
const rel = detect_tempo_multiples(128, withHalf)
checkTrue('detect_tempo_multiples finds half_time ~64', rel.half_time !== null && Math.abs(rel.half_time - 64) < 3, `half_time=${rel.half_time}`)

// (c) groove goldens
const straight = analyze_groove(Array.from({ length: 17 }, (_, i) => i * 0.5))
check('straight groove golden swing', straight.swing, 0)
check('straight groove golden timing_variance', straight.timing_variance, 0)
check('straight groove golden mean_interval', straight.mean_interval, 0.5)
check('straight groove golden groove_consistency', straight.groove_consistency, 1)

const swung = [0]
for (let i = 0; i < 15; i++) swung.push(swung[swung.length - 1] + (i % 2 === 0 ? 0.32 : 0.18))
const g = analyze_groove(swung)
checkTrue('swung grid (0.32/0.18 alternating) swing >= 0.8', g.swing >= 0.8, `swing=${g.swing}`)
checkTrue('swung grid groove_consistency < 0.5', g.groove_consistency < 0.5, `consistency=${g.groove_consistency.toFixed(4)}`)

summary('xa-tempo: tempogram candidates + tempo multiples + groove/swing')
