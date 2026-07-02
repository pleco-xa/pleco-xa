/**
 * Proof: playback/ops.js — pure buffer ops invariant table.
 *
 * 1 s 440 Hz sine via createBufferLike (Node-safe factory), loop {0.25, 0.5}:
 *   - halfSpeedLoop stretches the loop region 2× → length exactly
 *     55125 (= 44100 + one loop length of 11025).
 *   - doubleSpeedQuantzLoop compresses gaplessly → length 38587 with
 *     newLoopEnd 16537/38587 ≈ 0.4286.
 *   - reverseSection applied twice is bit-identical to the input
 *     (maxDiff 0) AND never mutates its input (copy-reverse contract).
 *   - a constructed buffer silent over [0.5 s, 0.75 s) → detectGap returns
 *     exactly {start: 22050, end: 33075, size: 11025}; closeGapLeft output
 *     length == input − gap.size.
 *   - assertLoop rejection: a loop with end < start throws (API law 6).
 */
import { playback } from '../../packages/pleco-xa/dist/pleco-xa.js'
import { check, checkTrue, summary } from './_harness.mjs'

const {
  createBufferLike, halfSpeedLoop, doubleSpeedQuantzLoop,
  reverseSection, detectGap, closeGapLeft,
} = playback

const sr = 44100
const loop = { start: 0.25, end: 0.5 } // samples [11025, 22050), length 11025

const sine = createBufferLike(1, sr, sr)
{
  const d = sine.getChannelData(0)
  for (let i = 0; i < sr; i++) d[i] = Math.sin((2 * Math.PI * 440 * i) / sr)
}

// ─── halfSpeedLoop: length grows by exactly one loop length ────────────────
const half = halfSpeedLoop(sine, loop)
check('halfSpeedLoop length == 44100 + 11025 == 55125', half.length, 55125)

// ─── doubleSpeedQuantzLoop: gapless compression shortens the buffer ────────
const dbl = doubleSpeedQuantzLoop(sine, loop)
check('doubleSpeedQuantzLoop length == 44100 − 5513 == 38587', dbl.buffer.length, 38587)
check('doubleSpeedQuantzLoop newLoopEnd == 16537/38587 ≈ 0.4286', dbl.newLoopEnd, 16537 / 38587)

// ─── reverseSection twice == identity, without mutating the input ──────────
const rev1 = reverseSection(sine, 11025, 22050)
const rev2 = reverseSection(rev1, 11025, 22050)
{
  const a = sine.getChannelData(0)
  const b = rev2.getChannelData(0)
  let maxDiff = 0
  for (let i = 0; i < sr; i++) maxDiff = Math.max(maxDiff, Math.abs(b[i] - a[i]))
  check('reverseSection twice → bit-identical (maxDiff 0)', maxDiff, 0)

  let inputIntact = true
  for (let i = 0; i < sr; i++) {
    if (a[i] !== Math.fround(Math.sin((2 * Math.PI * 440 * i) / sr))) { inputIntact = false; break }
  }
  checkTrue('reverseSection never mutates its input (copy-reverse)', inputIntact)
}

// ─── detectGap / closeGapLeft on a constructed silent window ───────────────
const gapBuf = createBufferLike(1, sr, sr)
{
  const g = gapBuf.getChannelData(0)
  for (let i = 0; i < sr; i++) g[i] = i >= 22050 && i < 33075 ? 0 : 0.1
}
const gap = detectGap(gapBuf, loop)
check('detectGap → exactly {start:22050, end:33075, size:11025}', gap, { start: 22050, end: 33075, size: 11025 })
const closed = closeGapLeft(gapBuf, loop)
check('closeGapLeft length == input − gap.size == 33075', closed.buffer.length, sr - gap.size)

// ─── invalid loop throws immediately ────────────────────────────────────────
let threw = false
let msg = ''
try {
  halfSpeedLoop(sine, { start: 0.5, end: 0.4 })
} catch (e) {
  threw = true
  msg = e.message
}
checkTrue('loop {start:0.5, end:0.4} throws (0 <= start < end <= 1)', threw, msg.slice(0, 48))

summary('playback/ops.js — pure buffer ops invariant table')
