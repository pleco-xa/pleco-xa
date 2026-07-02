/**
 * Proof: scripts/xa-beat-tracker.js — canonical beat engine: click train in, beat grid out.
 * A synthetic 10s click train at 120 BPM (5ms decaying 1kHz bursts every 0.5s, sr=22050)
 * goes through the librosa-parity beat_track() and the explicit quick tier quickTempo().
 * Proofs: tempo lands in one of the two lag bins bracketing 120 BPM (117.45 / 123.05 at
 * hop=512), 18-21 beats over 10s, median inter-beat interval within one hop (23.2ms) of
 * 0.500s, and quickTempo lands in the SAME lag bin with a measured confidence > 0.
 * Same asserts as examples/web/beat-tracker.html.
 */
import { beat_track, quickTempo } from '../../packages/pleco-xa/dist/pleco-xa.js'
import { check, checkTrue, summary } from './_harness.mjs'

const sr = 22050, dur = 10, hop = 512
const y = new Float32Array(sr * dur)
for (let t = 0; t < dur; t += 0.5) {
  const s0 = Math.round(t * sr)
  for (let i = 0; i < Math.round(0.005 * sr); i++) {
    y[s0 + i] += Math.sin((2 * Math.PI * 1000 * i) / sr) * Math.exp(-i / (0.001 * sr))
  }
}

const { tempo: bpm, beats } = beat_track(y, sr, { units: 'time' })
const ibis = beats.slice(1).map((b, i) => b - beats[i]).sort((a, b) => a - b)
const medianIBI = ibis[Math.floor(ibis.length / 2)]
const q = quickTempo(y, sr)

console.log('engine      | tempo    | nBeats | medianIBI | confidence')
console.log(`beat_track  | ${bpm.toFixed(2)}   | ${beats.length}     | ${medianIBI.toFixed(4)}s   | (parity tier)`)
console.log(`quickTempo  | ${q.bpm.toFixed(2)}   | -      | -         | ${q.confidence.toFixed(4)}`)

checkTrue('tempo within one lag bin of 120 BPM (|t-120| <= 7)', Math.abs(bpm - 120) <= 7, `tempo=${bpm.toFixed(4)}`)
checkTrue('beat count 18-21 over 10s', beats.length >= 18 && beats.length <= 21, `n=${beats.length}`)
checkTrue('median inter-beat interval within 1 hop (23.2ms) of 0.500s', Math.abs(medianIBI - 0.5) <= hop / sr, `${medianIBI.toFixed(4)}s`)
checkTrue('quickTempo lands in the SAME lag bin as tempo', Math.abs(q.bpm - bpm) < 1e-9, `quick=${q.bpm.toFixed(4)} vs parity=${bpm.toFixed(4)}`)
checkTrue('quickTempo confidence measured > 0', q.confidence > 0, `conf=${q.confidence.toFixed(4)}`)
check('quickTempo tier tag', q.tier, 'quick')

summary('xa-beat-tracker: canonical beat engine on a 120 BPM click train')
