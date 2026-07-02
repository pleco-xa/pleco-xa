/**
 * Proof: loop/musical.js — bar-multiple candidate analysis + tie-break.
 *
 * Synthesize a 120 BPM click+bass groove that is EXACTLY 0.5 s periodic
 * (identical click + 56 Hz bass burst on every beat), so every bar-multiple
 * candidate (0.5/1/2/4 bars) correlates identically (NCC == 1). Then:
 *   (1) 16 s buffer → detect({strategy:'musical', bpm:120}) must pick a
 *       division ≥ 1 — the documented tie-break prefers the LONGER loop
 *       when candidates tie (a full bar beats a half bar when both repeat
 *       equally well). Also: division ∈ {0.5,1,2,4,8} and
 *       loopLength ≈ division × 2.000 s.
 *   (2) 3 s buffer — only the 0.5-bar (1 s) candidate passes the
 *       len ≤ duration/2 gate → still returns a result (division 0.5).
 *   (3) 0.5 s buffer — no candidate fits → throws the named
 *       'candidate gate failed' diagnostic (no fabricated loop).
 */
import { loop } from '../../packages/pleco-xa/dist/pleco-xa.js'
import { check, checkTrue, summary } from './_harness.mjs'

const sr = 44100
const BAR = 2.0 // seconds @ 120 BPM, 4/4

function makeGroove(seconds) {
  const n = Math.floor(sr * seconds)
  const d = new Float32Array(n)
  for (let beat = 0; (beat * sr) / 2 < n; beat++) {
    const s = (beat * sr) / 2
    for (let i = 0; i < 1024 && s + i < n; i++) {
      d[s + i] += Math.sin((2 * Math.PI * 2000 * i) / sr) * Math.exp(-i / 150) * 0.9
    }
    for (let i = 0; i < sr / 4 && s + i < n; i++) {
      d[s + i] += Math.sin((2 * Math.PI * 56 * i) / sr) * 0.4 * Math.exp(-i / 8000)
    }
  }
  return {
    numberOfChannels: 1,
    length: n,
    sampleRate: sr,
    duration: seconds,
    getChannelData: () => d,
  }
}

// ─── (1) 16 s periodic groove: tie-break picks the longer loop ─────────────
const r16 = await loop.detect(makeGroove(16), { strategy: 'musical', bpm: 120 })
const division = r16.details.musicalDivision
const loopLen = r16.loopEnd - r16.loopStart

checkTrue(`division ∈ {0.5,1,2,4,8}, got ${division}`, [0.5, 1, 2, 4, 8].includes(division))
checkTrue(`tie-break: division ≥ 1 (never the 0.5-bar loop), got ${division}`, division >= 1)
check(`loopLength ≈ division × ${BAR} s`, loopLen, division * BAR, 0.01)

// the tie is real: every scored candidate carries the same confidence, and
// the chosen loop is the longest of them
const cands = r16.details.allCandidates
const confs = new Set(cands.map((c) => c.confidence))
checkTrue(
  `all ${cands.length} candidates tie at confidence ${[...confs].join('/')}`,
  confs.size === 1,
)
const longest = Math.max(...cands.map((c) => c.loopLength))
check('chosen loop is the LONGEST tied candidate', cands[0].loopLength, longest)

// ─── (2) 3 s buffer: only the 0.5-bar candidate fits → still a result ──────
const r3 = await loop.detect(makeGroove(3), { strategy: 'musical', bpm: 120 })
check('3 s buffer → division 0.5 (only candidate that fits)', r3.details.musicalDivision, 0.5)
check('3 s buffer → loopLength ≈ 1.000 s', r3.loopEnd - r3.loopStart, 1.0, 0.01)

// ─── (3) 0.5 s buffer: candidate gate throws, honestly ─────────────────────
let threw = false
let msg = ''
try {
  await loop.detect(makeGroove(0.5), { strategy: 'musical', bpm: 120 })
} catch (e) {
  threw = true
  msg = e.message
}
checkTrue('0.5 s buffer throws', threw)
checkTrue(
  "diagnostic names the gate: 'candidate gate failed'",
  msg.includes('candidate gate failed'),
  msg.slice(0, 60),
)

summary('loop/musical.js — bar-multiple candidate proof')
