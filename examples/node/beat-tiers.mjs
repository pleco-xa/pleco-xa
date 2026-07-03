/**
 * Proof: scripts/xa-beat.js — fast-tier vs parity-tier: same answer, measured speedup.
 * The heuristic tier (beatTrack / fastBPMDetect) and the canonical parity-tier
 * beat_track() analyze the same 10s 120 BPM click train. Proofs: both tiers land within
 * one lag bin (<= 7 BPM) of each other, beat counts agree within +/-2, and — at MATCHED
 * hopLength (512) — the fast tier is strictly faster than the parity tier (measured ~2x).
 * extractTempo on a perfect 0.5s beat grid returns the exact golden
 * {bpm: 120, confidence: 1, medianInterval: 0.5}.
 *
 * NOTE (honest divergence from the original plan): fastBPMDetect hardcodes hopLength=256
 * (2x the envelope frames of the parity tier's hop 512), which makes its wall-time a
 * coin flip vs parity (measured 0.99x-1.11x). The strictly-lower timing claim is only
 * correct at matched hop, so that is what is asserted; fastBPMDetect's own timing is
 * printed as an unasserted FYI row.
 */
import { fastBPMDetect, beatTrack, beat_track, extractTempo } from '../../packages/pleco-xa/dist/pleco-xa.js'
import { check, checkTrue, summary } from './_harness.mjs'

const sr = 22050, dur = 10
const y = new Float32Array(sr * dur)
for (let t = 0; t < dur; t += 0.5) {
  const s0 = Math.round(t * sr)
  for (let i = 0; i < Math.round(0.005 * sr); i++) {
    y[s0 + i] += Math.sin((2 * Math.PI * 1000 * i) / sr) * Math.exp(-i / (0.001 * sr))
  }
}

const time = (fn) => { const t0 = performance.now(); const v = fn(); return { ms: performance.now() - t0, v } }

// Warm-up both paths once so the JIT doesn't skew the timed comparison
beatTrack(y, sr, { hopLength: 512 })
beat_track(y, sr, { units: 'time' })

const fast = time(() => fastBPMDetect(y, sr)) // its own hardcoded hop=256
const fast512 = time(() => beatTrack(y, sr, { hopLength: 512 }))
const parity = time(() => beat_track(y, sr, { units: 'time' }))

console.log('engine                    | bpm     | nBeats | ms')
console.log(`fastBPMDetect (hop 256)   | ${fast.v.bpm.toFixed(2)}  | ${fast.v.beats.length}     | ${fast.ms.toFixed(1)} (FYI, unasserted)`)
console.log(`beatTrack     (hop 512)   | ${fast512.v.tempo.toFixed(2)}  | ${fast512.v.beats.length}     | ${fast512.ms.toFixed(1)}`)
console.log(`beat_track    (hop 512)   | ${parity.v.tempo.toFixed(2)}  | ${parity.v.beats.length}     | ${parity.ms.toFixed(1)}`)
console.log(`matched-hop speedup: ${(parity.ms / fast512.ms).toFixed(2)}x`)

checkTrue('fastBPMDetect bpm within one lag bin of parity (|diff| <= 7)', Math.abs(fast.v.bpm - parity.v.tempo) <= 7, `${fast.v.bpm.toFixed(2)} vs ${parity.v.tempo.toFixed(2)}`)
checkTrue('fast beat count within +/-2 of parity', Math.abs(fast.v.beats.length - parity.v.beats.length) <= 2, `${fast.v.beats.length} vs ${parity.v.beats.length}`)
checkTrue('matched-hop fast tier bpm within one lag bin of parity', Math.abs(fast512.v.tempo - parity.v.tempo) <= 7, `${fast512.v.tempo.toFixed(2)} vs ${parity.v.tempo.toFixed(2)}`)
checkTrue('matched-hop fast tier strictly faster than parity tier', fast512.ms < parity.ms, `${fast512.ms.toFixed(1)}ms < ${parity.ms.toFixed(1)}ms (${(parity.ms / fast512.ms).toFixed(2)}x)`)

const et = extractTempo([0, 0.5, 1.0, 1.5, 2.0])
check('extractTempo golden bpm', et.bpm, 120)
check('extractTempo golden confidence', et.confidence, 1)
check('extractTempo golden medianInterval', et.medianInterval, 0.5)

summary('xa-beat: fast tier vs parity tier + extractTempo golden')
