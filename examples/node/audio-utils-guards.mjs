/**
 * Audio-utils primitives + enhanced-op guards + the debug gate + util misc.
 *
 *   - findZeroCrossing / findAllZeroCrossings on a 4-sample-period square-ish
 *     wave: crossings at every sign flip (exact indices),
 *   - findAudioStart: 0.3 s of silence then a tone → start lands within one
 *     cycle after 0.3 s, snapped to a zero crossing,
 *   - applyHannWindow: endpoints exactly 0, midpoint == input (window 1),
 *     input NOT mutated,
 *   - checkBufferSafety: valid loop → {safe: true, issues: []} with exact
 *     duration/percentage; inverted + out-of-range loop reports BOTH issues,
 *   - isLargeOperation: false for a 1 s loop in 4 s audio, true when the loop
 *     covers > 70% of the buffer,
 *   - applyOperationEnhanced: 'half' halves the loop, 'double' doubles it,
 *     'reverse' returns a real buffer result, 'move' shifts by one loop
 *     length (all exact sample arithmetic),
 *   - setDebug/isDebugEnabled/debugLog: gate flips and debugLog is silent
 *     when disabled, prints when enabled (console.log capture),
 *   - fix_frames: clips to [x_min, x_max], dedupes, pads boundaries
 *     (fix_frames golden),
 *   - warnIfNoMp3Support: in Node (no Audio constructor) returns '' without
 *     touching a DOM.
 */
import {
  findZeroCrossing, findAllZeroCrossings, findAudioStart, applyHannWindow,
  checkBufferSafety, isLargeOperation, applyOperationEnhanced,
  setDebug, isDebugEnabled, debugLog, fix_frames, warnIfNoMp3Support,
} from '../../packages/pleco-xa/dist/pleco-xa.js'
import { check, checkTrue, summary } from './_harness.mjs'

// ── zero-crossing primitives ────────────────────────────────────────────────
const zz = new Float32Array([1, 1, -1, -1, 1, 1, -1, -1])
check('findZeroCrossing from 0 → first sign flip at index 2', findZeroCrossing(zz, 0), 2)
check('findZeroCrossing from 2 → next flip at index 4', findZeroCrossing(zz, 2), 4)
check('findAllZeroCrossings finds every flip [2, 4, 6]',
  findAllZeroCrossings(zz), [2, 4, 6])
check('findAllZeroCrossings(start=3) skips earlier flips → [4, 6]',
  findAllZeroCrossings(zz, 3), [4, 6])

const sr = 22050
{
  const yq = new Float32Array(sr)
  for (let i = Math.round(0.3 * sr); i < sr; i++) {
    yq[i] = 0.5 * Math.sin((2 * Math.PI * 440 * (i - Math.round(0.3 * sr))) / sr)
  }
  const start = findAudioStart(yq, sr, 0.02)
  checkTrue('findAudioStart lands within one 440 Hz cycle after the 0.3 s silence',
    start >= 0.3 * sr && start <= 0.3 * sr + sr / 440 + 1, `sample ${start}`)
}

// ── applyHannWindow ─────────────────────────────────────────────────────────
{
  const ones = new Float32Array(101).fill(1)
  const w = applyHannWindow(ones)
  check('applyHannWindow endpoints == 0 exactly', [w[0], w[100]], [0, 0])
  check('applyHannWindow midpoint == 1 (window peak)', w[50], 1, 1e-12)
  check('applyHannWindow does not mutate its input', ones[0], 1)
}

// ── enhanced-op guards ──────────────────────────────────────────────────────
const y = new Float32Array(sr * 4).fill(0.1)
const buffer = {
  numberOfChannels: 1, length: y.length, sampleRate: sr,
  duration: 4, getChannelData: () => y,
}
{
  const loop = { startSample: 0, endSample: sr } // 1 s of 4 s
  const safe = checkBufferSafety(buffer, loop)
  check('checkBufferSafety(valid 1 s loop) == safe, no issues, 25%',
    [safe.safe, safe.issues.length, safe.loopDuration, safe.loopPercentage],
    [true, 0, 1, 25])
  const bad = checkBufferSafety(buffer, { startSample: sr, endSample: buffer.length + 1 })
  checkTrue('checkBufferSafety(loop end past buffer) reports the overrun',
    !bad.safe && bad.issues.some((i) => i.includes('exceeds buffer length')),
    bad.issues.join('; ').slice(0, 60))
  const inverted = checkBufferSafety(buffer, { startSample: 100, endSample: 50 })
  checkTrue('checkBufferSafety(start >= end) reports the inversion',
    !inverted.safe && inverted.issues.some((i) => i.includes('start >= loop end')),
    inverted.issues.join('; ').slice(0, 40))

  check('isLargeOperation: 1 s loop in 4 s audio is NOT large',
    isLargeOperation(buffer, loop, 'reverse'), false)
  check('isLargeOperation: loop covering > 70% of the buffer IS large',
    isLargeOperation(buffer, { startSample: 0, endSample: Math.floor(buffer.length * 0.8) }, 'reverse'),
    true)

  const halved = await applyOperationEnhanced('half', buffer, { startSample: 0, endSample: sr })
  check("applyOperationEnhanced('half') halves the loop", halved.loop.endSample, sr / 2)
  const doubled = await applyOperationEnhanced('double', buffer, { startSample: 0, endSample: sr })
  check("applyOperationEnhanced('double') doubles the loop", doubled.loop.endSample, 2 * sr)
  const moved = await applyOperationEnhanced('move', buffer, { startSample: 0, endSample: sr })
  check("applyOperationEnhanced('move') shifts by one loop length",
    [moved.loop.startSample, moved.loop.endSample], [sr, 2 * sr])
  const reversed = await applyOperationEnhanced('reverse', buffer, { startSample: 0, endSample: sr })
  checkTrue("applyOperationEnhanced('reverse') returns a buffer-bearing result",
    !!(reversed && (reversed.getChannelData || (reversed.buffer && reversed.buffer.getChannelData))))
}

// ── debug gate ──────────────────────────────────────────────────────────────
{
  const before = isDebugEnabled()
  setDebug(false)
  check('setDebug(false) → isDebugEnabled() === false', isDebugEnabled(), false)
  let lines = 0
  const orig = console.log
  console.log = () => { lines++ }
  debugLog('suppressed')
  const suppressed = lines
  setDebug(true)
  debugLog('emitted')
  console.log = orig
  setDebug(before)
  check('debugLog is silent when disabled, prints when enabled',
    [suppressed, lines], [0, 1])
}

// ── util misc ───────────────────────────────────────────────────────────────
check('fix_frames([−1, 3, 3, 9], 0, 5, pad) == [0, 3, 5] (clip, dedupe, pad)',
  fix_frames([-1, 3, 3, 9], 0, 5, true), [0, 3, 5])
check('fix_frames without padding keeps only clipped uniques',
  fix_frames([2, 2, 4], 0, 10, false), [2, 4])
check("warnIfNoMp3Support in Node (no Audio) returns '' without touching a DOM",
  warnIfNoMp3Support(), '')

summary('audio-utils primitives, enhanced-op guards, debug gate, util misc')
