/**
 * Proof: scripts/kick-snare-detector.js — transient snap plus a negative control.
 * A single composite hit (60Hz sine burst + white-noise burst, 30ms) at exactly
 * t=1.000s in low-level noise must snap loop.start to ~1.020s (detector applies an
 * intentional +20ms beat-center offset). A pure steady 220Hz sine must return null
 * — the detector refuses to invent a transient.
 */
import { findKickSnareHit } from '../../packages/pleco-xa/dist/pleco-xa.js'
import { checkTrue, summary } from './_harness.mjs'

const sr = 44100

// Seeded LCG so the noise floor is deterministic run-to-run
let seed = 42
const rand = () => { seed = (seed * 1664525 + 1013904223) >>> 0; return (seed / 4294967296) * 2 - 1 }

// 3s of low-level noise floor with one composite kick+snare hit at t=1.000s
const y = new Float32Array(3 * sr)
for (let i = 0; i < y.length; i++) y[i] = 0.005 * rand()
const hitStart = Math.round(1.0 * sr)
for (let i = 0; i < Math.round(0.030 * sr); i++) {
  const decay = Math.exp(-i / (0.010 * sr))
  y[hitStart + i] += (0.8 * Math.sin((2 * Math.PI * 60 * i) / sr) + 0.4 * rand()) * decay
}

const hit = findKickSnareHit(y, sr, { start: 0.95, end: 2.95, duration: 2.0 })
checkTrue('hit detected (kickSnareDetected === true)', hit !== null && hit.kickSnareDetected === true, hit ? `start=${hit.start.toFixed(4)}s` : 'null')
checkTrue('snapped start within 25ms of 1.020s', hit !== null && Math.abs(hit.start - 1.02) <= 0.025, hit ? `|${hit.start.toFixed(4)} - 1.020| = ${Math.abs(hit.start - 1.02).toFixed(4)}s` : 'null')
checkTrue('end = start + duration', hit !== null && Math.abs(hit.end - (hit.start + 2.0)) < 1e-9, hit ? `end=${hit.end.toFixed(4)}s` : 'null')

// Negative control: steady 220Hz sine has no transient — must return null
const sine = new Float32Array(3 * sr)
for (let i = 0; i < sine.length; i++) sine[i] = 0.5 * Math.sin((2 * Math.PI * 220 * i) / sr)
const control = findKickSnareHit(sine, sr, { start: 0.95, end: 2.95, duration: 2.0 })
checkTrue('steady-sine negative control returns null', control === null, String(control))

summary('kick-snare-detector: transient snap + negative control')
