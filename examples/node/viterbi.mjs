/**
 * plot_viterbi — Viterbi smoothing: don't flinch at the dip (viterbi family
 * promoted into the sequence namespace for this proof, with the
 * viterbi_discriminative prior repaired to correct Bayes semantics — divide
 * by p_state, not multiply).
 *
 * 1 s tone + 0.3 s silence containing one noise blip + 1 s tone. feature.rms
 * → logistic map → non-silence probability p; transition_loop(2, [0.5, 0.6]);
 * viterbi_discriminative([1−p; p]). Frame-wise thresholding must flinch at the
 * blip (≥4 state changes) while Viterbi keeps exactly 2 (tone→silence→tone),
 * matching the hand-computed expected sequence.
 *
 * HONESTY CORRECTION vs the plan's "2-frame blip": under
 * transition_loop(2, [0.5, 0.6]) the log-cost of a k-frame excursion into
 * state 1 is 0.405 − 0.182·k nats, so for k ≥ 2 the penalty (≤0.041) is
 * smaller than ANY threshold-crossing emission gain — a 2-frame-wide p>0.5
 * bump ALWAYS flips Viterbi too. The strongest suppressible dip is ONE frame
 * wide (penalty 0.223 nats → suppressed while ln(p/(1−p)) < 0.223, i.e.
 * p < 0.556). The blip here is 512 samples aligned to a single centered RMS
 * window: p_blip ≈ 0.525 → thresholding flips, Viterbi provably cannot.
 */
import { feature, sequence } from '../../packages/pleco-xa/dist/pleco-xa.js'
import { check, checkTrue, summary } from './_harness.mjs'

const { viterbi, viterbi_discriminative, transition_loop, transition_uniform, transition_cycle, transition_local } = sequence

const sr = 22050
const hop = 512
const frameLen = 512
const BLIP_FRAME = 49

// tone (1 s) + silence (0.3 s, one 1-frame noise blip) + tone (1 s)
const y = new Float32Array(Math.round(2.3 * sr))
for (let i = 0; i < sr; i++) y[i] = 0.4 * Math.sin((2 * Math.PI * 220 * i) / sr)
for (let i = Math.round(1.3 * sr); i < y.length; i++) y[i] = 0.4 * Math.sin((2 * Math.PI * 220 * i) / sr)
let seed = 99
const lcg = () => (seed = (seed * 1103515245 + 12345) & 0x7fffffff) / 0x7fffffff
const b0 = BLIP_FRAME * hop - frameLen / 2 // exactly one centered rms window
for (let i = 0; i < frameLen; i++) y[b0 + i] = 0.014 * (lcg() * 2 - 1)

// rms → logistic non-silence probability (fixed dB midpoint −42, spread 3)
const rms = feature.rms(y, { frame_length: frameLen, hop_length: hop })
const p = Float64Array.from(rms, (v) => 1 / (1 + Math.exp(-((20 * Math.log10(v + 1e-10)) + 42) / 3)))
const nFrames = p.length

checkTrue('blip probability crosses the threshold but stays suppressible ' +
  '(0.5 < p < 0.556)', p[BLIP_FRAME] > 0.5 && p[BLIP_FRAME] < 0.556, `p_blip ${p[BLIP_FRAME].toFixed(4)}`)

// frame-wise thresholding vs Viterbi decoding
const thresh = Array.from(p, (v) => (v > 0.5 ? 1 : 0))
const states = viterbi_discriminative(
  [Array.from(p, (v) => 1 - v), Array.from(p)],
  transition_loop(2, [0.5, 0.6]),
)

const changePoints = (a) => a.slice(1).map((v, i) => (v !== a[i] ? i + 1 : -1)).filter((i) => i > 0)
const chT = changePoints(thresh)
const chV = changePoints(states)

// frame table around the blip + sparklines
const spark = (a) => a.map((v) => (v ? '█' : '▁')).join('')
console.log('frame | p      | threshold | viterbi   (frames 40–60)')
for (let t = 40; t <= 60; t++) {
  console.log(`${String(t).padStart(5)} | ${p[t].toFixed(4)} | ${thresh[t]}         | ${states[t]}`)
}
console.log(`threshold: ${spark(thresh)}`)
console.log(`viterbi:   ${spark(states)}`)

checkTrue('frame-wise thresholding flinches: ≥4 state changes', chT.length >= 4,
  `${chT.length} changes at [${chT}]`)
check('viterbi state changes — exactly 2 (tone→silence→tone)', chV.length, 2)

// hand-computed expected sequence: ones, zeros over the silent gap, ones.
// Boundaries from window arithmetic: the tone/silence edges at 1.0 s / 1.3 s
// (frames 43.07 and 56.0) put the first fully-silent window at frame 44 and
// the first fully-tonal window at frame 56.
const expected = Array.from({ length: nFrames }, (_, t) => (t < 44 || t >= 56 ? 1 : 0))
check('viterbi decode equals the hand-computed expected sequence',
  states.join(''), expected.join(''))
checkTrue('viterbi change points within ±2 frames of the true boundaries (43.1, 56.0)',
  chV.length === 2 && Math.abs(chV[0] - 43.07) <= 2 && Math.abs(chV[1] - 56) <= 2,
  `at [${chV}]`)

// ── promotion goldens ────────────────────────────────────────────────────────
// core viterbi toy decode (hand-computable: strong emissions win each frame)
check('viterbi toy decode [0,1,1]',
  viterbi([[0.9, 0.2, 0.1], [0.1, 0.8, 0.9]], transition_loop(2, 0.7)).join(','), '0,1,1')

// the prior-repair golden: with p_state=[0.9, 0.1] the likelihood must be
// p/p_state (Bayes correction) → state 1 wins both frames despite lower raw prob.
// The legacy multiply-by-prior implementation decoded [0,0] here.
check('viterbi_discriminative divides by p_state (Bayes correction)',
  viterbi_discriminative([[0.8, 0.6], [0.2, 0.4]], transition_uniform(2), [0.9, 0.1]).join(','),
  '1,1')

// ── transition-matrix constructors (sequence validation) ───────────────────
// transition_cycle(n, p): each state self-loops with prob p and advances to
// the next (mod n) with 1−p. Rows are stochastic.
check('transition_cycle(3, 0.5) == golden',
  transition_cycle(3, 0.5), [[0.5, 0.5, 0], [0, 0.5, 0.5], [0.5, 0, 0.5]])
checkTrue('transition_cycle rows sum to 1',
  transition_cycle(4, 0.3).every((r) => Math.abs(r.reduce((a, b) => a + b, 0) - 1) < 1e-12))

// transition_local(n, width, 'triangle'): banded, triangle-weighted, row-
// normalized locality. 5 states, width 3 → the golden band.
check('transition_local(5, 3, triangle) == golden',
  transition_local(5, 3).map((r) => r.map((x) => +x.toFixed(4))),
  [[0.6667, 0.3333, 0, 0, 0], [0.25, 0.5, 0.25, 0, 0], [0, 0.25, 0.5, 0.25, 0],
    [0, 0, 0.25, 0.5, 0.25], [0, 0, 0, 0.3333, 0.6667]])
checkTrue('transition_local rows sum to 1',
  transition_local(6, 3).every((r) => Math.abs(r.reduce((a, b) => a + b, 0) - 1) < 1e-12))

summary('plot_viterbi — smoothing vs thresholding + prior-repair goldens')
