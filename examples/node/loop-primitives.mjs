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

const { snapToZeroCrossings, LoopController } = loop

// ---------------------------------------------------------------- (a) snap
const sr = 44100
const y = new Float32Array(sr)
for (let i = 0; i < sr; i++) y[i] = Math.sin((2 * Math.PI * 440 * i) / sr)

const [s, e] = snapToZeroCrossings(y, 5000, 30000)
checkTrue(`snap start ${s}: |y| < 5e-3`, Math.abs(y[s]) < 5e-3, Math.abs(y[s]).toExponential(3))
checkTrue(`snap end ${e}: |y| < 5e-3`, Math.abs(y[e]) < 5e-3, Math.abs(y[e]).toExponential(3))
checkTrue('snap start within ±441 of 5000', Math.abs(s - 5000) <= 441, `Δ=${Math.abs(s - 5000)}`)
checkTrue('snap end within ±441 of 30000', Math.abs(e - 30000) <= 441, `Δ=${Math.abs(e - 30000)}`)

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
