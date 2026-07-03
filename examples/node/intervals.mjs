/**
 * Proof: scripts/xa-intervals.js — tuning-system showdown on golden ratios.
 * The pure 3:2 Pythagorean fifth and the 5-limit just 5/4 third and 3/2 fifth
 * must come out EXACT (verified: float32 storage still lands on the exact
 * dyadic-rational-friendly values); equal temperament degree 7 must equal
 * 2^(7/12) to float32 precision; generateFrequencies(440,'equal',13) must
 * span exactly 440 → 880. Prints the famous equal-vs-just cent deviation
 * table (+2c fifth, +14c major third).
 */
import { intervals } from '../../packages/pleco-xa/dist/pleco-xa.js'
import { check, checkTrue, summary } from './_harness.mjs'

const { pythagorean_intervals, plimit_intervals, generateFrequencies, compareTuningSystems, IntervalConstructor, interval_frequencies } = intervals

// (1) Pythagorean: pure 3:2 fifth exact at degree 7
const py = pythagorean_intervals(12)
checkTrue('pythagorean_intervals(12)[7] === 1.5 EXACTLY (pure 3:2)', py[7] === 1.5, `got ${py[7]}`)

// (2) equal temperament degree 7 == 2^(7/12) (float32 storage: tol 1e-6)
const eq = generateFrequencies(440, 'equal', 13)
check('equal degree 7 ratio == 2^(7/12) (700c)', eq[7] / 440, Math.pow(2, 7 / 12), 1e-6)

// (3) 5-limit just intonation contains the exact 5/4 major third and 3/2 fifth
const ji = Array.from(plimit_intervals([3, 5], 12))
checkTrue('plimit_intervals([3,5],12) contains 5/4 EXACTLY', ji.includes(1.25), `ratios ${ji.map((v) => v.toFixed(4)).join(' ')}`)
checkTrue('plimit_intervals([3,5],12) contains 3/2 EXACTLY', ji.includes(1.5))

// (4) octave span: 13 equal notes from 440 span exactly 440 → 880
check('generateFrequencies(440,equal,13)[0] == 440', eq[0], 440)
check('generateFrequencies(440,equal,13)[12] == 880', eq[12], 880)

// (5) interval naming
const ic = new IntervalConstructor()
check("analyzeInterval(1.5) names 'Perfect Fifth'", ic.analyzeInterval(1.5).closest.name, 'Perfect Fifth')
check("analyzeInterval(1.25) names 'Major Third'", ic.analyzeInterval(1.25).closest.name, 'Major Third')

// cents-per-degree comparison table (the whole point of tuning systems)
const cmp = compareTuningSystems(440, ['equal', 'pythagorean', 'ji5'])
console.log('\ndegree |   equal | pythagorean |     ji5  (cents from 440)')
for (let d = 0; d < 12; d++) {
  const row = ['equal', 'pythagorean', 'ji5'].map((s) => cmp[s].cents[d].toFixed(1).padStart(8))
  console.log(`  ${String(d).padStart(4)} | ${row[0]} |  ${row[1]} | ${row[2]}`)
}
const fifthDev = cmp.equal.cents[7] - cmp.ji5.cents[7]
const thirdDev = cmp.equal.cents[4] - cmp.ji5.cents[4]
console.log(`\nequal-vs-just deviations: fifth ${fifthDev.toFixed(1)}c (famous -2c), major third ${thirdDev.toFixed(1)}c (famous +14c)`)
checkTrue('equal fifth is ~2c FLAT of just 3:2', Math.abs(fifthDev - -1.955) < 0.1, `${fifthDev.toFixed(2)}c`)
checkTrue('equal major third is ~14c SHARP of just 5/4', Math.abs(thirdDev - 13.686) < 0.1, `${thirdDev.toFixed(2)}c`)

// (6) interval_frequencies: tile an interval set across octaves from fmin.
// Explicit ratios [1, 1.25, 1.5] at 3 bins/octave, fmin 100 → octave 0 is
// 100/125/150, octave 1 doubles to 200/250/300 (hand-verifiable, and matching
// interval_frequencies' own octave-tiling math).
check('interval_frequencies(6,100,[1,1.25,1.5],bpo=3) tiles octaves exactly',
  Array.from(interval_frequencies(6, 100, [1, 1.25, 1.5], 3, 0.0, true)),
  [100, 125, 150, 200, 250, 300])
{
  const f = interval_frequencies(12, 55, Array.from(pythagorean_intervals(12)))
  check('interval_frequencies bin 0 == fmin (55 Hz)', f[0], 55)
  checkTrue('interval_frequencies pure-fifth bin 7 == 55 × 3/2 == 82.5 Hz',
    Math.abs(f[7] - 82.5) < 1e-4, f[7].toFixed(4))
}

summary('xa-intervals: tuning-system golden ratios')
