/**
 * scripts/algorithmic-sequences.js — generator determinism + bounds fuzz
 * (the ACCEPTANCE HARNESS for the 2026-07-02 bounds repair).
 *
 * Part 1: every generator is a pure function of its step count — two calls
 * yield identical op arrays. Part 2: vocabulary closure — every op any
 * generator emits has an executeOperation case (no silent default
 * fallthrough). Part 3: 200 ops from each of the 4 generators run through
 * executeOperation on a 1 s buffer, asserting the loop-bounds invariant
 * 0 <= startSample < endSample <= length after EVERY op. Pre-repair this
 * measured 90/800 degenerate states (modulo-wrapped 'move'/'phase' mapping
 * full-width loops to {0,0} or end < start; repeated half/fractal/stutter
 * collapsing to zero width). The repair (clamped no-wrap move, circular
 * fixed-width phase shift, minimum-width floor) must bring it to 0/800.
 */
import {
  generateFibonacci, generatePrimeRhythm, generateWaveform, generateChaotic,
  executeOperation,
} from '../../packages/pleco-xa/dist/pleco-xa.js'
import { check, checkTrue, summary } from './_harness.mjs'

const SR = 44100
const N = SR // 1 s
const generators = {
  fibonacci: generateFibonacci,
  primeRhythm: generatePrimeRhythm,
  waveform: generateWaveform,
  chaotic: generateChaotic,
}

// Full executeOperation vocabulary (one entry per switch case)
const EXECUTABLE_OPS = new Set([
  'half', 'double', 'move', 'reverse', 'reset',
  'stutter4', 'stutter8', 'stutter16', 'stutter32',
  'fractal2', 'fractal3', 'fractal4', 'fractal5',
  'phase0.1', 'phase0.25', 'phase0.333', 'phase0.5', 'phase0.618', 'phase0.75', 'phase0.9',
])

// ── Part 0: each generator called DIRECTLY by name (structural properties) ──
// Every generator is a pure step→ops function: exactly `steps` ops, drawn from
// the executable vocabulary, deterministic, and 0 steps → empty. The four
// algorithms are genuinely distinct (no two produce the same op stream).
const inVocab = (ops) => ops.every((op) => EXECUTABLE_OPS.has(op))

check('generateFibonacci(50) emits exactly 50 ops', generateFibonacci(50).length, 50)
checkTrue('generateFibonacci ops all in the executable vocabulary', inVocab(generateFibonacci(50)))
check('generateFibonacci(50) is deterministic (identical on re-call)',
  generateFibonacci(50), generateFibonacci(50))
check('generateFibonacci(0) == [] (empty request → empty program)', generateFibonacci(0), [])

check('generatePrimeRhythm(50) emits exactly 50 ops', generatePrimeRhythm(50).length, 50)
checkTrue('generatePrimeRhythm ops all in the executable vocabulary', inVocab(generatePrimeRhythm(50)))
check('generatePrimeRhythm(50) is deterministic (identical on re-call)',
  generatePrimeRhythm(50), generatePrimeRhythm(50))

check('generateWaveform(50) emits exactly 50 ops', generateWaveform(50).length, 50)
checkTrue('generateWaveform ops all in the executable vocabulary', inVocab(generateWaveform(50)))
check('generateWaveform(50) is deterministic (identical on re-call)',
  generateWaveform(50), generateWaveform(50))

check('generateChaotic(50) emits exactly 50 ops', generateChaotic(50).length, 50)
checkTrue('generateChaotic ops all in the executable vocabulary', inVocab(generateChaotic(50)))
check('generateChaotic(50) is deterministic (logistic map, fixed seed x=0.5)',
  generateChaotic(50), generateChaotic(50))

checkTrue('the four generators are genuinely distinct algorithms (no two op streams match)',
  new Set([
    JSON.stringify(generateFibonacci(50)),
    JSON.stringify(generatePrimeRhythm(50)),
    JSON.stringify(generateWaveform(50)),
    JSON.stringify(generateChaotic(50)),
  ]).size === 4)

// ── Part 1: determinism ────────────────────────────────────────────────────
for (const [name, gen] of Object.entries(generators)) {
  const a = gen(200)
  const b = gen(200)
  check(`${name}(200) called twice yields identical op arrays`, a, b)
  check(`${name}(200) emits exactly 200 ops`, a.length, 200)
}

// ── Part 2: vocabulary closure ─────────────────────────────────────────────
for (const [name, gen] of Object.entries(generators)) {
  const unknown = [...new Set(gen(200))].filter((op) => !EXECUTABLE_OPS.has(op))
  checkTrue(`${name} vocabulary closed under executeOperation`,
    unknown.length === 0, unknown.length ? `unknown: ${unknown.join(',')}` : 'all ops executable')
}

// ── Part 3: bounds fuzz (the acceptance test) ──────────────────────────────
function makeBuffer() {
  const data = new Float32Array(N)
  for (let i = 0; i < N; i++) data[i] = Math.sin((2 * Math.PI * 440 * i) / SR)
  return {
    length: N, sampleRate: SR, numberOfChannels: 1, duration: N / SR,
    getChannelData: () => data,
  }
}

let violations = 0
let opsRun = 0
const examples = []
for (const [name, gen] of Object.entries(generators)) {
  let buffer = makeBuffer()
  let loop = { startSample: 0, endSample: buffer.length }
  for (const op of gen(200)) {
    ;({ buffer, loop } = executeOperation(op, buffer, loop))
    opsRun++
    const ok = loop.startSample >= 0 && loop.startSample < loop.endSample &&
      loop.endSample <= buffer.length &&
      Number.isInteger(loop.startSample) && Number.isInteger(loop.endSample)
    if (!ok) {
      violations++
      if (examples.length < 3) examples.push(`${name}/${op}: [${loop.startSample}, ${loop.endSample}]`)
    }
  }
}

check('fuzz ops executed (4 generators x 200)', opsRun, 800)
checkTrue('loop-bounds invariant 0 <= start < end <= length after EVERY op (was 90/800 pre-repair)',
  violations === 0, violations === 0 ? '0/800 violations' : `${violations}/800 e.g. ${examples.join(' | ')}`)

summary('scripts/algorithmic-sequences.js — generator determinism + bounds fuzz')
