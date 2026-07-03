/**
 * Proof: loop/primitives.js — zero-crossing snap + LoopController state machine.
 *
 * (a) snapToZeroCrossings on a 440 Hz sine lands on near-zero samples
 *     (|y| < 5e-3) within ±441 samples of the requested indices — a 440 Hz
 *     cycle is ~100 samples, so a crossing always exists inside the window.
 * (b) LoopController walk setLoop(0.25,0.5) → half → double → move → reset
 *     yields the exact normalized bounds at every step.
 * (c) Minimum gate: halving a 60 ms loop under a 50 ms minimum returns an
 *     honest {success:false, reason} and leaves the loop untouched.
 */
import { loop } from '../../packages/pleco-xa/dist/pleco-xa.js'
import { check, checkTrue, summary } from './_harness.mjs'

const { snapToZeroCrossings, LoopController, DynamicZeroCrossing } = loop

// ---------------------------------------------------------------- (a) snap
const sr = 44100
const y = new Float32Array(sr)
for (let i = 0; i < sr; i++) y[i] = Math.sin((2 * Math.PI * 440 * i) / sr)

const [s, e] = snapToZeroCrossings(y, 5000, 30000)
checkTrue(`snap start ${s}: |y| < 5e-3`, Math.abs(y[s]) < 5e-3, Math.abs(y[s]).toExponential(3))
checkTrue(`snap end ${e}: |y| < 5e-3`, Math.abs(y[e]) < 5e-3, Math.abs(y[e]).toExponential(3))
checkTrue('snap start within ±441 of 5000', Math.abs(s - 5000) <= 441, `Δ=${Math.abs(s - 5000)}`)
checkTrue('snap end within ±441 of 30000', Math.abs(e - 30000) <= 441, `Δ=${Math.abs(e - 30000)}`)

// ---------------------------------------- (a′) DynamicZeroCrossing static API
// snapToZeroCrossings above is the thin functional wrapper; here the class it
// delegates to is exercised DIRECTLY. It is an all-static utility, so we first
// confirm it is a constructable class export, then drive each static method on
// a signal whose zero crossings are known exactly: sin(2π·100·i/8000) crosses
// zero every 40 samples (0, 40, 80, …).
const zsr = 8000
const zy = new Float32Array(zsr)
for (let i = 0; i < zsr; i++) zy[i] = Math.sin((2 * Math.PI * 100 * i) / zsr)

checkTrue('DynamicZeroCrossing is a constructable class export',
  new DynamicZeroCrossing() instanceof DynamicZeroCrossing)

const nz = DynamicZeroCrossing.findNearestZeroCrossing(zy, 100, 30)
check('findNearestZeroCrossing(100, ±30) snaps to sample 120 (nearest crossing)', nz.sample, 120)
checkTrue('found sample sits on a zero crossing (|y| < 1e-6)', Math.abs(zy[nz.sample]) < 1e-6, Math.abs(zy[nz.sample]).toExponential(2))
check('reported distanceFromMusical == |120 − 100| == 20', nz.distanceFromMusical, 20)

const [zs, ze] = DynamicZeroCrossing.snap(zy, 100, 300, 30)
check('static snap(100, 300, ±30) → [120, 320]', [zs, ze], [120, 320])
checkTrue('both snapped boundaries land on zero crossings',
  Math.abs(zy[zs]) < 1e-6 && Math.abs(zy[ze]) < 1e-6)

const opt = DynamicZeroCrossing.optimizeLoopBoundaries(zy, { start: 100 / zsr, end: 300 / zsr }, zsr)
check('optimizeLoopBoundaries returns {musical, optimized, crossfades}',
  Object.keys(opt).sort(), ['crossfades', 'musical', 'optimized'])
check('optimized boundaries map back to samples [120, 320]',
  [Math.round(opt.optimized.start * zsr), Math.round(opt.optimized.end * zsr)], [120, 320])
check('a micro-crossfade is scheduled for each boundary moved > 10 samples (both, Δ=20)',
  opt.crossfades.length, 2)

// The crossfade curve generator: cosine fade, capped at 441 samples (~10 ms).
const cf = DynamicZeroCrossing.generateMicroCrossfade(opt.crossfades[0])
check('generateMicroCrossfade length == moved distance (20 samples)', cf.length, 20)
checkTrue('fade-in starts ≈0 and ends ≈1 (cosine ramp up)',
  cf.fadeIn[0] < 1e-6 && Math.abs(cf.fadeIn[cf.length - 1] - 1) < 0.05,
  `[${cf.fadeIn[0].toExponential(1)} … ${cf.fadeIn[cf.length - 1].toFixed(3)}]`)
check('crossfade duration is clamped to 441 samples (10 ms @ 44.1 kHz)',
  DynamicZeroCrossing.generateMicroCrossfade({ crossfadeDuration: 5000 }).length, 441)

// ------------------------------------------------ (b) controller state walk
const ctl = new LoopController()
const walk = [
  ['setLoop(0.25, 0.5)', () => ctl.setLoop(0.25, 0.5), { start: 0.25, end: 0.5 }],
  ['halfLoop()', () => ctl.halfLoop(), { start: 0.25, end: 0.375 }],
  ['doubleLoop()', () => ctl.doubleLoop(), { start: 0.25, end: 0.5 }],
  ['moveLoopForward()', () => ctl.moveLoopForward(), { start: 0.5, end: 0.75 }],
  ['resetLoop()', () => ctl.resetLoop(), { start: 0, end: 1 }],
]
for (const [name, fn, expected] of walk) {
  const r = fn()
  checkTrue(`${name} success`, r.success === true)
  check(`${name} → {${expected.start}, ${expected.end}}`, r.loop, expected)
}

// -------------------------------------------------------- (c) minimum gate
const gated = new LoopController({ minLoopDuration: 0.05 })
gated.setAudioBuffer({ duration: 1 }) // duck-typed 1 s buffer — only .duration is read
checkTrue('setLoop(0, 0.06) accepted (60 ms ≥ 50 ms min)', gated.setLoop(0, 0.06).success === true)
const refusal = gated.halfLoop()
checkTrue('halving 60 ms loop refused: success === false', refusal.success === false)
checkTrue('refusal carries a reason string', typeof refusal.reason === 'string' && refusal.reason.length > 0, refusal.reason)
check('loop unchanged after refusal', gated.getCurrentLoop(), { start: 0, end: 0.06 })

summary('loop/primitives.js — zero-crossing snap + LoopController state machine')
