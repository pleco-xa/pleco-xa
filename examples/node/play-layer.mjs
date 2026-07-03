/**
 * Play layer & live-speed control, headless: the pieces the browser demos
 * drive with real audio graphs run here on duck-typed buffers with injected
 * dependencies (the Wave-6 explicit-injection convention — no window.* bus).
 *
 *   - randomLocal: 2–6 random sub-ops on a full-buffer loop; op tag, subOps
 *     trace (starting with 'reset'), loop bounds and buffer length invariants
 *     asserted for EVERY run of a 20-run sweep,
 *   - glitchBurst(durationMs 350): GibClock-driven bursts — every onUpdate
 *     callback receives in-bounds loop points; the returned stop() halts the
 *     clock (update count freezes),
 *   - playQuantumOps: the 128-step quantum scheduler dispatches real
 *     applyQuantumOp results through the injected applyLoop callback — we
 *     assert ≥ 5 dispatches with valid loops inside the first second, then
 *     exit via summary() (the full 128-step run needs ≥ 11.5 s of wall-clock
 *     waits; the dispatch path is what this proof pins),
 *   - applyLiveHalfSpeed(preservePitch: true) with an INJECTED fake
 *     AudioContext (createBuffer only): the resample tier reports
 *     {speed: 0.5, method: 'resample'}, newLoopLength == 2 × loop length, and
 *     the resampled data obeys out[i] == in[i/2] exactly at even offsets,
 *   - liveSpeedController state after the call: currentSpeed 0.5, isActive
 *     still false (init state — nothing has started playback), originalBuffer
 *     is the injected buffer, speedBuffer is the returned resampled buffer.
 */
import {
  randomLocal, glitchBurst, playQuantumOps, applyLiveHalfSpeed,
  liveSpeedController,
} from '../../packages/pleco-xa/dist/pleco-xa.js'
import { check, checkTrue, summary } from './_harness.mjs'

const sr = 44100
const makeBuffer = (n = sr) => {
  const chans = [new Float32Array(n)]
  for (let i = 0; i < n; i++) chans[0][i] = Math.sin((2 * Math.PI * 440 * i) / sr)
  return {
    numberOfChannels: 1, length: n, sampleRate: sr, duration: n / sr,
    getChannelData: (c) => chans[c],
  }
}

// ── randomLocal sweep ───────────────────────────────────────────────────────
{
  let allValid = true
  let subOpsSeen = 0
  for (let run = 0; run < 20; run++) {
    const r = randomLocal(makeBuffer(), { startSample: 0, endSample: sr }, {})
    subOpsSeen += r.subOps.length
    if (r.op !== 'randomLocal' || r.subOps[0] !== 'reset' ||
        r.subOps.length < 3 || r.subOps.length > 7 ||
        r.buffer.length !== sr ||
        !(r.loop.startSample >= 0 && r.loop.endSample <= sr && r.loop.startSample < r.loop.endSample)) {
      allValid = false
    }
  }
  checkTrue("randomLocal ×20: op tag, 'reset'-led 3–7 sub-op trace, in-bounds loop, length preserved",
    allValid, `${subOpsSeen} sub-ops across 20 runs`)
}

// ── glitchBurst ─────────────────────────────────────────────────────────────
{
  let updates = 0
  let loopsValid = true
  const stop = glitchBurst(makeBuffer(), {
    durationMs: 350,
    onUpdate: (b, loop) => {
      updates++
      if (!(loop.startSample >= 0 && loop.endSample <= b.length && loop.startSample < loop.endSample)) {
        loopsValid = false
      }
    },
  })
  await new Promise((r) => setTimeout(r, 700))
  stop()
  const frozen = updates
  await new Promise((r) => setTimeout(r, 250))
  checkTrue('glitchBurst fired ≥ 1 update within its 350 ms burst', updates >= 1, `${updates} update(s)`)
  checkTrue('glitchBurst: every update carried an in-bounds loop', loopsValid)
  check('glitchBurst stop(): update count frozen after stop', updates, frozen)
}

// ── playQuantumOps dispatch path ────────────────────────────────────────────
let quantumOps = 0
let quantumValid = true
playQuantumOps(makeBuffer(), null, (b, loop) => {
  quantumOps++
  if (!(loop.startSample >= 0 && loop.endSample <= b.length)) quantumValid = false
}, 1)
await new Promise((r) => setTimeout(r, 1000))
checkTrue('playQuantumOps dispatched ≥ 5 quantum ops in the first second',
  quantumOps >= 5, `${quantumOps} ops`)
checkTrue('playQuantumOps: every dispatched loop was in-bounds', quantumValid)

// ── applyLiveHalfSpeed (resample tier, injected fake AudioContext) ──────────
{
  const fakeCtx = {
    createBuffer: (channels, length, rate) => {
      const chans = Array.from({ length: channels }, () => new Float32Array(length))
      return {
        numberOfChannels: channels, length, sampleRate: rate,
        duration: length / rate, getChannelData: (c) => chans[c],
      }
    },
  }
  const src = makeBuffer()
  const res = await applyLiveHalfSpeed({ audioContext: fakeCtx, buffer: src, preservePitch: true })
  check('applyLiveHalfSpeed(preservePitch) → {speed: 0.5, method: resample}',
    [res.speed, res.method], [0.5, 'resample'])
  check('applyLiveHalfSpeed: newLoopLength == 2 × full-buffer loop length',
    res.newLoopLength, 2 * sr)
  const out = res.buffer.getChannelData(0)
  const inp = src.getChannelData(0)
  check('half-speed resample law: out[10] == in[5] exactly (even offsets are verbatim)',
    out[10], inp[5])
  check('half-speed resample law: out[2000] == in[1000] exactly',
    out[2000], inp[1000])

  const { currentSpeed, isActive, originalBuffer, speedBuffer } = liveSpeedController
  check('liveSpeedController.currentSpeed == 0.5 after the call', currentSpeed, 0.5)
  check('liveSpeedController.isActive stays false (init state, no playback started)',
    isActive, false)
  checkTrue('liveSpeedController.originalBuffer === the injected buffer',
    originalBuffer === src)
  checkTrue('liveSpeedController.speedBuffer === the returned resampled buffer',
    speedBuffer === res.buffer)

  let msg = ''
  try { await applyLiveHalfSpeed({}) } catch (e) { msg = e.message }
  check('applyLiveHalfSpeed without injected deps throws the documented error',
    msg, 'applyLiveHalfSpeed: audioContext and buffer are required')
}

summary('play layer + live speed control (headless, injected dependencies)')
