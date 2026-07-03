/**
 * loop/ namespace beyond detect(): the legacy wrappers, the strategy
 * implementations, the scoring primitive, and the zero-crossing optimizer —
 * plus the top-level downbeat-aware findMusicalLoop — all on synthetic
 * material with known ground truth.
 *
 * 8 s / 120 BPM click train (clicks every 0.5 s → verbatim 1-bar repeats):
 *   - normalizedCrossCorrelation: identical windows → exactly 1, negated
 *     windows → exactly −1, zero-variance input → 0 (never NaN),
 *   - musicalLoopAnalysis(bpm 120): loop length is EXACTLY a whole number of
 *     2 s bars with confidence 1 (verbatim repetition),
 *   - recurrenceLoop / fastOnsetLoopAnalysis: loop length is a whole multiple
 *     of the 0.5 s click period (±30 ms) with confidence ≥ 0.9,
 *   - loopAnalysis / xaLoopAnalysis (deprecated wrappers): BPM within one lag
 *     bin of 120 and confidence on the unified 0..1 scale (the Wave-3 repair
 *     — the legacy code returned large NEGATIVE confidences),
 *   - analyzeLoopPoints: 0.5 s window == 11025 samples, in-range loop points,
 *   - findMusicalLoop(y, sr, 120): finds {start 2 s, end 6 s, bars 2,
 *     score 1} — a perfect 2-bar loop, exact golden,
 *   - DynamicZeroCrossing.optimizeLoopBoundaries on an off-phase sine: the
 *     snapped boundary is closer to a zero crossing than the musical point
 *     and each nudge > 10 samples is recorded as a micro-crossfade.
 */
import { loop, findMusicalLoop } from '../../packages/pleco-xa/dist/pleco-xa.js'
import { check, checkTrue, summary } from './_harness.mjs'

const {
  normalizedCrossCorrelation, musicalLoopAnalysis, recurrenceLoop,
  fastOnsetLoopAnalysis, loopAnalysis, xaLoopAnalysis, analyzeLoopPoints,
  DynamicZeroCrossing,
} = loop

const sr = 22050
const dur = 8
const y = new Float32Array(sr * dur)
for (let t = 0; t < dur; t += 0.5) {
  const s0 = Math.round(t * sr)
  for (let i = 0; i < Math.round(0.005 * sr); i++) {
    y[s0 + i] += Math.sin((2 * Math.PI * 1000 * i) / sr) * Math.exp(-i / (0.001 * sr))
  }
}
const buffer = {
  numberOfChannels: 1, length: y.length, sampleRate: sr,
  duration: dur, getChannelData: () => y,
}

// ── scoring primitive ────────────────────────────────────────────────────────
const w1 = y.slice(0, 11025)
const w2 = y.slice(11025, 22050)
check('normalizedCrossCorrelation(identical 0.5 s windows) == 1',
  normalizedCrossCorrelation(w1, w2), 1, 1e-9)
check('normalizedCrossCorrelation(w, −w) == −1',
  normalizedCrossCorrelation(w1, Float32Array.from(w1, (v) => -v)), -1, 1e-9)
check('normalizedCrossCorrelation(zero-variance input) == 0 (never NaN)',
  normalizedCrossCorrelation(new Float32Array(64), w1.slice(0, 64)), 0)

// ── strategy implementations ────────────────────────────────────────────────
const mla = await musicalLoopAnalysis(buffer, { bpm: 120 })
const mlaLen = mla.loopEnd - mla.loopStart
checkTrue('musicalLoopAnalysis: loop length == whole bars (n × 2 s ± 1 ms)',
  Math.abs(mlaLen / 2 - Math.round(mlaLen / 2)) * 2 <= 0.001, `${mlaLen.toFixed(4)} s`)
check('musicalLoopAnalysis: confidence 1 on verbatim repeats', mla.confidence, 1, 1e-6)

for (const [name, res] of [
  ['recurrenceLoop', await recurrenceLoop(buffer)],
  ['fastOnsetLoopAnalysis', await fastOnsetLoopAnalysis(buffer)],
]) {
  const len = res.loopEnd - res.loopStart
  const periods = len / 0.5
  checkTrue(`${name}: loop == whole clicks (n × 0.5 s ± 30 ms)`,
    Math.abs(periods - Math.round(periods)) * 0.5 <= 0.03, `${len.toFixed(3)} s`)
  checkTrue(`${name}: measured confidence ≥ 0.9`, res.confidence >= 0.9,
    `conf=${res.confidence.toFixed(3)}`)
}

// ── deprecated wrappers (unified 0..1 confidence, real BPM) ─────────────────
for (const [name, res] of [
  ['loopAnalysis', await loopAnalysis(buffer)],
  ['xaLoopAnalysis', await xaLoopAnalysis(buffer)],
]) {
  checkTrue(`${name}: bpm within one lag bin of 120 (|bpm−120| ≤ 7)`,
    Math.abs(res.bpm - 120) <= 7, `bpm=${res.bpm.toFixed(2)}`)
  checkTrue(`${name}: confidence on the unified 0..1 scale`,
    res.confidence >= 0 && res.confidence <= 1, `conf=${res.confidence.toFixed(4)}`)
}

const alp = await analyzeLoopPoints(buffer)
check('analyzeLoopPoints: correlation window == min(0.5 s, N/2) == 11025 samples',
  alp.windowSize, 11025)
checkTrue('analyzeLoopPoints: loop points inside [0, duration]',
  alp.loopStart >= 0 && alp.loopEnd <= dur && alp.loopStart < alp.loopEnd,
  `[${alp.loopStart.toFixed(3)}, ${alp.loopEnd.toFixed(3)}] s`)

// ── top-level downbeat-aware musical loop search ────────────────────────────
const fml = findMusicalLoop(y, sr, 120)
check('findMusicalLoop(120 BPM train) == {start 2, end 6, bars 2, score 1} exactly',
  fml, { start: 2, end: 6, bars: 2, score: 1 })

// ── zero-crossing boundary optimizer ────────────────────────────────────────
{
  const sine = new Float32Array(sr)
  for (let i = 0; i < sr; i++) sine[i] = Math.sin((2 * Math.PI * 440.7 * i) / sr)
  const musical = { start: 0.2501, end: 0.5001 }
  const dzc = DynamicZeroCrossing.optimizeLoopBoundaries(sine, musical, sr)
  const at = (frac) => Math.abs(sine[Math.round(frac * sine.length)])
  checkTrue('DynamicZeroCrossing: snapped start is closer to zero than the musical point',
    at(dzc.optimized.start) < at(musical.start),
    `|y| ${at(musical.start).toFixed(4)} → ${at(dzc.optimized.start).toFixed(4)}`)
  checkTrue('DynamicZeroCrossing: snap stays within the ±5 ms search window',
    Math.abs(dzc.optimized.start - musical.start) * sine.length <= 0.005 * sr + 1,
    `Δ=${((dzc.optimized.start - musical.start) * sine.length).toFixed(0)} samples`)
  checkTrue('DynamicZeroCrossing: nudges > 10 samples are recorded as micro-crossfades',
    dzc.crossfades.every((c) => c.crossfadeDuration === Math.abs(c.zeroPoint - c.musicalPoint) && c.crossfadeDuration > 10),
    `${dzc.crossfades.length} crossfade(s)`)
}

summary('loop/ strategies, legacy wrappers, scoring + findMusicalLoop')
