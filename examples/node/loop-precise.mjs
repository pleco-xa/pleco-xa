/**
 * Proof: loop/precise.js — known-repetition precise loop detection.
 *
 * Synthesize: 1 s seeded-noise intro (amp 0.02) + an exactly 2.000 s
 * percussive pattern (decaying seeded-noise bursts on the 120 BPM grid)
 * repeated 3× VERBATIM + 1 s outro. findPreciseLoop must recover an onset
 * pair spanning one pattern period: duration 2.000 ± 0.05 s, score > 0.8
 * (verbatim repetition drives true NCC toward 1), musicalBonus 0.2 (within
 * 2% of 1 bar @ 120 BPM). Honesty row: 1 s of pure noise returns null —
 * never a fabricated loop.
 *
 * WHY sr = 32768: findPreciseLoop's onset candidates are quantized to its
 * hop of 256 samples, so a candidate pair can only span the true period
 * SAMPLE-EXACTLY when the period is a multiple of 256. At 44.1 kHz the 2 s
 * period is 88200 samples (344.53 hops) — unreachable, and white-noise
 * content decorrelates at the resulting ±130-sample offset (NCC ≈ 0,
 * verified). At 32768 Hz the period is 65536 = 256 hops exactly, so the
 * verbatim alignment is testable. (Real music has broad autocorrelation
 * peaks and doesn't need this alignment — see the loop-fast golden proof.)
 */
import { loop } from '../../packages/pleco-xa/dist/pleco-xa.js'
import { check, checkTrue, summary } from './_harness.mjs'

const { findPreciseLoop } = loop
const sr = 32768

// Seeded LCG noise in [-1, 1) — deterministic across runs
const lcg = (seed) => {
  let s = seed >>> 0
  return () => ((s = (1664525 * s + 1013904223) >>> 0) / 4294967296) * 2 - 1
}

// One 2.000 s pattern: decaying noise bursts at 0 / 0.5 / 1.0 / 1.5 s
// (τ = 11000 samples ≈ 0.34 s so energy sustains across each beat — the
// fade-characteristic windows must not read a fabricated fade-out)
const patLen = 2 * sr
const pattern = new Float32Array(patLen)
{
  const rnd = lcg(1234)
  for (let b = 0; b < 4; b++) {
    const s = (b * sr) / 2
    for (let i = 0; i < sr / 2; i++) pattern[s + i] += rnd() * 0.8 * Math.exp(-i / 11000)
  }
}

// intro (1 s) + pattern ×3 (6 s) + outro (1 s)
const total = new Float32Array(sr * 8)
{
  const introRnd = lcg(99)
  for (let i = 0; i < sr; i++) total[i] = introRnd() * 0.02
  for (let rep = 0; rep < 3; rep++) total.set(pattern, sr + rep * patLen)
  const outroRnd = lcg(7)
  for (let i = 7 * sr; i < 8 * sr; i++) total[i] = outroRnd() * 0.02
}

// ─── PASS row: the verbatim 2.000 s repetition is recovered ────────────────
const res = findPreciseLoop(total, sr, 120, { searchStart: 0.5 })
checkTrue('repetition signal → non-null result', res !== null)
if (res) {
  check('detected duration == 2.000 ± 0.05 s (one pattern period)', res.duration, 2.0, 0.05)
  checkTrue(`score > 0.8 (verbatim NCC), got ${res.score.toFixed(4)}`, res.score > 0.8)
  check('musicalBonus == 0.2 (within 2% of 1 bar @ 120 BPM)', res.musicalBonus, 0.2)
  checkTrue(
    `loop sits inside the pattern region [1 s, 7 s], got [${res.start.toFixed(3)}, ${res.end.toFixed(3)}]`,
    res.start >= 0.9 && res.end <= 7.1,
  )
}

// ─── FAIL-honesty row: pure noise → null, not a fabricated loop ────────────
const noise = new Float32Array(sr)
{
  const nr = lcg(5)
  for (let i = 0; i < sr; i++) noise[i] = nr() * 0.5
}
check('1 s pure noise → null (honest refusal)', findPreciseLoop(noise, sr, 120, { searchStart: 0.5 }), null)

summary('loop/precise.js — known-repetition precise loop proof')
