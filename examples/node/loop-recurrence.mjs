/**
 * Proof: loop/recurrence.js — tempo-free loop detection + RQA lag candidate.
 *
 * Synthesizes the recurrence strategy's home turf: a 4-chord arpeggio
 * (Cmaj7 → Fmaj7 → Am7 → G7, 16 notes × 125 ms) with a 2.0 s harmonic
 * period repeated 4×, chroma-distinct chords, no percussion. The final
 * repeat's last bar is ornamented up an octave (a performance "fill"), so
 * the fundamental 2.0 s period — not its 4.0 s multiple — is the strongest
 * audio-validated lag, exactly like a real recorded loop.
 *
 * Proofs:
 *   - detect({strategy:'recurrence'}) recovers loopEnd−loopStart = 2.0 ±0.1 s,
 *   - the result has NO bpm key: recurrence is tempo-free by contract and
 *     never invents a BPM,
 *   - confidence is the audio-validated NCC on the unified 0..1 scale,
 *   - re-run with {rqa:true}: candidates[] gains a {source:'rqa'} entry whose
 *     lagFrames ≈ 2.0 s × sr / hopLength (the RQA alignment path found the
 *     same repetition lag through a completely different scorer),
 *   - diagnostics echo the rqa flag and the effective hop.
 *
 * The RQA candidate is only meaningful because the recurrence matrix
 * suppresses the time-delay-embedding overlap band (|i−j| ≤ 28 frames):
 * stackMemory(10, 3) windows share raw audio up to lag 27, so anything
 * narrower lets the alignment path hug the self-overlap diagonal.
 */
import { loop } from '../../packages/pleco-xa/dist/pleco-xa.js'
import { check, checkTrue, summary } from './_harness.mjs'

// ── synthesis: 2.0 s harmonic period × 4, ornamented final bar ────────────
const sr = 22050
const PERIOD = 2.0
const REPEATS = 4
const SEQ = [
  261.63, 329.63, 392.0, 659.26, //  Cmaj7 bar: C4 E4 G4 E5
  440.0, 349.23, 523.25, 698.46, //  Fmaj7 bar: A4 F4 C5 F5
  329.63, 440.0, 261.63, 880.0, //   Am7 bar:  E4 A4 C4 A5
  493.88, 392.0, 587.33, 783.99, //  G7 bar:   B4 G4 D5 G5
]
const noteDur = PERIOD / SEQ.length // 125 ms
const n = Math.round(PERIOD * REPEATS * sr)
const y = new Float32Array(n)
for (let i = 0; i < n; i++) {
  const t = i / sr
  const rep = Math.floor(t / PERIOD)
  const tp = t % PERIOD
  const noteIdx = Math.floor(tp / noteDur)
  let f = SEQ[noteIdx]
  if (rep === REPEATS - 1 && noteIdx >= 12) f *= 2 // final-repeat fill
  const tn = tp % noteDur
  y[i] = 0.5 * Math.exp(-tn * 10) * Math.sin(2 * Math.PI * f * tn)
}
const buffer = {
  numberOfChannels: 1,
  length: n,
  sampleRate: sr,
  duration: n / sr,
  getChannelData: () => y,
}

// ── plain recurrence run: tempo-free period recovery ──────────────────────
const res = await loop.detect(buffer, { strategy: 'recurrence' })
const dur = res.loopEnd - res.loopStart

check("strategy == 'recurrence'", res.strategy, 'recurrence')
check('loop duration == 2.0 s ± 0.1 (the true harmonic period)', dur, PERIOD, 0.1)
checkTrue("tempo-free contract: result has NO 'bpm' key",
  !('bpm' in res), Object.keys(res).join(','))
checkTrue('confidence is audio-validated NCC in (0, 1]',
  res.confidence > 0 && res.confidence <= 1, res.confidence.toFixed(4))
checkTrue('multiple candidates surfaced (fundamental beat its 2× multiple)',
  res.details.candidates.length >= 2,
  res.details.candidates.map((c) => `${(c.loopEnd - c.loopStart).toFixed(2)}s@${c.confidence.toFixed(2)}`).join(' '))
check('diagnostics echo rqa: false', res.details.diagnostics.rqa, false)

// ── rqa run: the alignment path finds the same lag ────────────────────────
const resRqa = await loop.detect(buffer, { strategy: 'recurrence', rqa: true })
const hop = resRqa.details.diagnostics.hopLength
const expectedLag = (PERIOD * sr) / hop

check('rqa run still recovers 2.0 s ± 0.1', resRqa.loopEnd - resRqa.loopStart, PERIOD, 0.1)
check('diagnostics echo rqa: true', resRqa.details.diagnostics.rqa, true)

const rqaCand = resRqa.details.candidates.find((c) => c.source === 'rqa')
checkTrue("candidates[] contains a {source:'rqa'} entry",
  rqaCand !== undefined,
  resRqa.details.candidates.map((c) => c.source ?? 'lag-peak').join(','))
checkTrue(
  `rqa lagFrames ≈ ${expectedLag.toFixed(2)} (2.0 s × sr / hop, ±2 frames)`,
  rqaCand && Math.abs(rqaCand.lagFrames - expectedLag) <= 2,
  `lagFrames=${rqaCand?.lagFrames} path=${rqaCand?.rqaPathLength}`,
)
checkTrue('rqa candidate confidence is audio-validated (0..1)',
  rqaCand && rqaCand.confidence >= 0 && rqaCand.confidence <= 1,
  rqaCand?.confidence.toFixed(4))

console.log('\ncandidate table (rqa run):')
console.log('source    | lagFrames | duration (s) | confidence')
for (const c of resRqa.details.candidates) {
  console.log(
    `${(c.source ?? 'lag-peak').padEnd(9)} | ${String(c.lagFrames).padStart(9)} | ` +
      `${(c.loopEnd - c.loopStart).toFixed(4).padStart(12)} | ${c.confidence.toFixed(4)}`,
  )
}

summary('loop/recurrence.js — tempo-free period recovery + RQA lag')
