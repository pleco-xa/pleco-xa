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
  reverseSection, detectGap, closeGapLeft, closeGapRight,
  halfSpeedQuantzLoop, doubleSpeedUnquantzLoop,
  revealFirstHalf, revealHiddenHalf,
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
check('closeGapLeft preserves the normalized loop end (0.5)', closed.newLoopEnd, 0.5)

// ─── closeGapRight: same shortening, but RESCALES the loop end ──────────────
// newLoopEnd = 0.5 × (33075 / 44100) == 0.375 (content after the gap keeps its
// absolute position relative to the loop end, so the normalized end shrinks).
const closedR = closeGapRight(gapBuf, loop)
check('closeGapRight length == 33075', closedR.buffer.length, sr - gap.size)
check('closeGapRight RESCALES loop end to 0.5 × 33075/44100 == 0.375', closedR.newLoopEnd, 0.375)
check('closeGapRight gapSize == 11025', closedR.gapSize, gap.size)

// ─── halfSpeedQuantzLoop: masks to the loop window (track length unchanged) ─
const hq = halfSpeedQuantzLoop(sine, loop)
check('halfSpeedQuantzLoop keeps track length (44100)', hq.length, sr)
{
  const s = sine.getChannelData(0), h = hq.getChannelData(0)
  let outMax = 0
  for (let i = 0; i < sr; i++) if (i < 11025 || i >= 22050) outMax = Math.max(outMax, Math.abs(h[i] - s[i]))
  check('halfSpeedQuantzLoop leaves everything OUTSIDE the loop window untouched', outMax, 0)
}

// ─── doubleSpeedUnquantzLoop: in-place compress; fractal preserves layers ───
// A loop near the end (start 0.6, end 0.95) leaves too little room for a full
// glitch tail, so fractal mode writes only the first half — differing from the
// non-fractal path — while both keep the track length and pre-loop content.
const loopEnd = { start: 0.6, end: 0.95 }
const duF = doubleSpeedUnquantzLoop(sine, loopEnd, { fractal: true })
const duN = doubleSpeedUnquantzLoop(sine, loopEnd, { fractal: false })
check('doubleSpeedUnquantzLoop keeps track length (44100)', duF.length, sr)
{
  const a = duF.getChannelData(0), b = duN.getChannelData(0), s = sine.getChannelData(0)
  let diff = 0, preMax = 0
  const st = Math.floor(0.6 * sr)
  for (let i = 0; i < sr; i++) {
    if (Math.abs(a[i] - b[i]) > 1e-7) diff++
    if (i < st) preMax = Math.max(preMax, Math.abs(a[i] - s[i]))
  }
  checkTrue('fractal mode differs from non-fractal (matryoshka half-write)', diff > 1000, `${diff} samples differ`)
  check('doubleSpeedUnquantzLoop leaves pre-loop content untouched', preMax, 0)
}

// ─── revealHiddenHalf / revealFirstHalf: toggle a half-speed-quantz nudge ───
// revealFirstHalf reconstructs the CURRENT loop window (all but the last
// boundary sample), revealHiddenHalf swaps in the DIFFERENT second half; both
// preserve everything outside the loop window.
{
  const cur = halfSpeedQuantzLoop(sine, loop)
  const rf = revealFirstHalf(cur, sine, loop)
  const rh = revealHiddenHalf(cur, sine, loop)
  const c = cur.getChannelData(0), fd = rf.getChannelData(0), hd = rh.getChannelData(0)
  let rfSame = 0, rhDiff = 0, rfOut = 0, rhOut = 0
  for (let i = 0; i < sr; i++) {
    if (i >= 11025 && i < 22050) {
      if (Math.abs(fd[i] - c[i]) < 1e-6) rfSame++
      if (Math.abs(hd[i] - c[i]) > 1e-6) rhDiff++
    } else {
      rfOut = Math.max(rfOut, Math.abs(fd[i] - c[i]))
      rhOut = Math.max(rhOut, Math.abs(hd[i] - c[i]))
    }
  }
  check('revealFirstHalf length unchanged', rf.length, sr)
  checkTrue('revealFirstHalf reconstructs the current loop window (≥ 11024/11025)', rfSame >= 11024, `${rfSame}/11025`)
  checkTrue('revealHiddenHalf swaps in a DIFFERENT loop window', rhDiff > 5000, `${rhDiff} samples differ`)
  check('revealFirstHalf leaves content outside the loop window untouched', rfOut, 0)
  check('revealHiddenHalf leaves content outside the loop window untouched', rhOut, 0)
}

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
