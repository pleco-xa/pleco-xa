/**
 * sequence/matching.js — event/interval matching goldens, including the
 * fractional-seconds regression proof.
 *
 * The legacy xa-matching implementation stored sorted VALUES through
 * Uint32Array.map, silently flooring fractional seconds before every binary
 * search — matchEvents([0.4, 0.6], [0.45, 1.0]) mapped everything to garbage.
 * The port keeps values in Float64Array; this script proves it.
 */
import { sequence } from '../../packages/pleco-xa/dist/pleco-xa.js'
import { check, checkTrue, summary } from './_harness.mjs'

const { matchEvents, matchIntervals } = sequence

// (1) The documented tie-handling golden: each event matches the
// nearest target, ties resolving per the exact middle/left/right logic.
check(
  'matchEvents([0.5,1.5,2.5], [0,1,2,3]) — tie golden',
  Array.from(matchEvents([0.5, 1.5, 2.5], [0, 1, 2, 3])),
  [1, 2, 3],
)

// (2) Interval matching: best Jaccard overlap wins, per-query.
check(
  'matchIntervals([[0,1],[1,2]] vs overlapping+disjoint targets)',
  Array.from(matchIntervals([[0, 1], [1, 2]], [[0.1, 0.9], [1.1, 1.9], [3, 4]])),
  [0, 1],
)

// (3) REGRESSION: sub-integer event times must survive at full precision.
// Under the legacy Uint32Array truncation both 0.4 and 0.6 floored to 0 and
// the search order collapsed; correct answer maps BOTH to target index 0
// (0.45 is nearer than 1.0 for each).
check(
  'REGRESSION matchEvents([0.4,0.6], [0.45,1.0]) keeps float precision',
  Array.from(matchEvents([0.4, 0.6], [0.45, 1.0])),
  [0, 0],
)

// (4) strict=true throws on a fully disjoint query (no silent fallback).
let threw = false
let msg = ''
try {
  matchIntervals([[5, 6]], [[0, 1]], { strict: true })
} catch (e) {
  threw = true
  msg = e.message
}
checkTrue('matchIntervals strict=true throws on disjoint query', threw, msg.slice(0, 48))
checkTrue(
  'throw message documents the unmatched interval',
  msg.includes('unable to match interval [5, 6]'),
  msg.slice(0, 60),
)

// Typed-array output contracts (indices stay integer-typed; values never are)
checkTrue(
  'matchEvents returns Int32Array, matchIntervals returns Uint32Array',
  matchEvents([1], [1]) instanceof Int32Array &&
    matchIntervals([[0, 1]], [[0, 1]]) instanceof Uint32Array,
)

summary('sequence/matching.js — matching goldens + fractional-seconds regression')
