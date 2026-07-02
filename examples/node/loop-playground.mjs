/**
 * Proof: core/loopPlayground.js — glitch playground determinism + safety fuzz.
 *
 * (a) Seeded determinism: randomSequence with an injected LCG rng — two
 *     builds with seed 42 produce IDENTICAL op logs, and the log matches the
 *     pinned golden for this LCG (op choice consumes rng only at build time,
 *     so the log is a pure function of the seed). A different seed produces
 *     a different log (the rng is actually plumbed through, not ignored).
 * (b) Vocabulary closure: every emitted op ∈ {half, double, move, reverse,
 *     reset}.
 * (c) Bounds fuzz: build + execute 500 steps (cocktail/complex sub-sequences
 *     included) and assert after EVERY step that the resulting loop satisfies
 *     0 ≤ startSample < endSample ≤ buffer.length and length ≥ minSamples.
 */
import { randomSequence, playback } from '../../packages/pleco-xa/dist/pleco-xa.js'
import { check, checkTrue, summary } from './_harness.mjs'

const { createBufferLike } = playback
const sr = 44100

// Numerical-Recipes LCG → [0, 1), deterministic
const lcg = (seed) => {
  let s = seed >>> 0
  return () => (s = (1664525 * s + 1013904223) >>> 0) / 4294967296
}

const makeBuffer = () => {
  const b = createBufferLike(1, sr, sr) // 1 s
  const d = b.getChannelData(0)
  for (let i = 0; i < sr; i++) d[i] = 0.5 * Math.sin((2 * Math.PI * 220 * i) / sr)
  return b
}

const opLog = (seed, steps) =>
  randomSequence(makeBuffer(), { steps, rng: lcg(seed) }).map((f) => f.op).join(',')

// ─── (a) seeded determinism ─────────────────────────────────────────────────
const run1 = opLog(42, 8)
const run2 = opLog(42, 8)
check('seed 42 twice → identical op logs', run1, run2)
// golden pinned from this LCG (spot-run verified): the warmup phase (5 steps,
// 90% half) then the weighted phase
check("seed 42 golden op log", run1, 'half,half,half,half,half,move,half,move')
checkTrue('seed 7 produces a DIFFERENT log (rng is live)', opLog(7, 8) !== run1, opLog(7, 8))

// ─── (b) + (c) vocabulary closure and 500-step bounds fuzz ─────────────────
const buffer = makeBuffer()
const minMs = 10
const minSamples = Math.floor((minMs / 1000) * sr) // 441
const seq = randomSequence(buffer, { steps: 500, rng: lcg(42), minMs })

const vocab = new Set(['half', 'double', 'move', 'reverse', 'reset'])
let outOfVocab = 0
let violations = 0
let firstViolation = null

for (const fn of seq) {
  if (!vocab.has(fn.op)) outOfVocab++
  const { loop } = fn()
  const len = loop.endSample - loop.startSample
  const ok =
    loop.startSample >= 0 &&
    loop.startSample < loop.endSample &&
    loop.endSample <= buffer.length &&
    len >= minSamples
  if (!ok) {
    violations++
    if (!firstViolation) firstViolation = JSON.stringify(loop)
  }
}

check('500 steps built', seq.length, 500)
check('vocabulary closure: 0 out-of-vocab ops', outOfVocab, 0)
checkTrue(
  '500-step fuzz: 0 bounds violations (0 ≤ start < end ≤ length, len ≥ 441)',
  violations === 0,
  violations ? `${violations} violations, first: ${firstViolation}` : '0 violations',
)

summary('core/loopPlayground.js — seeded determinism + 500-step bounds fuzz')
