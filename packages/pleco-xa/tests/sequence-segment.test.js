/**
 * Unit tests for the Wave 5B sequence/segment repairs:
 *  - matching: fractional-second precision (the legacy Uint32Array.map
 *    truncation bug floored times to integers before every binary search)
 *  - dtw: explicit-throw paths, custom-step append semantics, subseq
 *  - segment: explicit-throw paths (no dimension guessing), shear round-trips,
 *    agglomerative sanity
 */
import { describe, it, expect } from 'vitest'
import { matchIntervals, matchEvents } from '../src/sequence/matching.js'
import { dtw } from '../src/sequence/dtw.js'
import {
  recurrenceMatrix,
  recurrenceToLag,
  lagToRecurrence,
  agglomerative,
} from '../src/segment/index.js'
import {
  Matcher,
  quickMatchEvents,
  match_events,
  match_intervals,
} from '../src/scripts/xa-matching.js'
import { dtw as dtwLegacy } from '../src/scripts/xa-dtw.js'
import {
  recurrenceMatrix as recurrenceMatrixShim,
  agglomerative as agglomerativeShim,
} from '../src/scripts/xa-temporal.js'

describe('matchEvents (librosa.util.match_events)', () => {
  it('matches fractional-second events without integer truncation', () => {
    // Legacy bug: sortedTo floored to [1, 1, 2] via Uint32Array.map, so both
    // 1.4 and 1.9 matched against quantized values.
    const out = matchEvents([1.4, 1.9], [1.0, 1.5, 2.0])
    expect(Array.from(out)).toEqual([1, 2])
    // sub-integer spacing entirely below 1.0 — all zeros under truncation
    const fine = matchEvents([0.12, 0.48, 0.81], [0.1, 0.5, 0.8])
    expect(Array.from(fine)).toEqual([0, 1, 2])
  })

  it('reproduces librosa 0.11 behavior (multiples of 7 vs 10, ties included)', () => {
    // Verified against a live librosa 0.11.0 run — the librosa DOCSTRING for
    // this example is stale (it claims 35 -> 30; the code matches 35 -> 40,
    // because equidistant ties resolve to the searchsorted-left middle).
    const sFrom = []
    for (let v = 0; v < 100; v += 7) sFrom.push(v)
    const sTo = []
    for (let v = 0; v < 100; v += 10) sTo.push(v)
    const out = matchEvents(sFrom, sTo)
    expect(Array.from(out)).toEqual([0, 1, 1, 2, 3, 4, 4, 5, 6, 6, 7, 8, 8, 9, 9])
  })

  it('resolves equidistant ties like librosa (to the middle index)', () => {
    // verified against librosa 0.11.0: [0.5, 1.5, 2.5] vs [0, 1, 2, 3]
    const out = matchEvents([0.5, 1.5, 2.5], [0, 1, 2, 3])
    expect(Array.from(out)).toEqual([1, 2, 3])
  })

  it('throws on empty inputs', () => {
    expect(() => matchEvents([], [1])).toThrow(/empty/)
    expect(() => matchEvents([1], [])).toThrow(/empty/)
  })

  it('throws when left=right=false and eventsFrom is not contained in eventsTo', () => {
    expect(() =>
      matchEvents([1.5], [1.0, 2.0], { left: false, right: false }),
    ).toThrow(/left=right=false/)
  })

  it('throws when left=false and max(eventsTo) < max(eventsFrom)', () => {
    expect(() => matchEvents([5], [1, 2], { left: false })).toThrow(/left=false/)
  })

  it('throws when right=false and min(eventsTo) > min(eventsFrom)', () => {
    expect(() => matchEvents([0], [1, 2], { right: false })).toThrow(/right=false/)
  })

  it('throws on NaN times', () => {
    expect(() => matchEvents([NaN], [1])).toThrow(/NaN/)
    expect(() => matchEvents([1], [NaN])).toThrow(/NaN/)
  })
})

describe('matchIntervals (librosa.util.match_intervals)', () => {
  it('reproduces the librosa docstring examples', () => {
    const intsFrom = [
      [3, 5],
      [1, 4],
      [4, 5],
    ]
    const intsTo = [
      [0, 2],
      [1, 3],
      [4, 5],
      [6, 7],
    ]
    expect(Array.from(matchIntervals(intsFrom, intsTo))).toEqual([2, 1, 2])
    expect(
      Array.from(matchIntervals(intsTo, intsFrom, { strict: false })),
    ).toEqual([1, 1, 2, 2])
  })

  it('matches fractional intervals without integer truncation', () => {
    // Jaccard: vs [0.0, 0.6] = 0.1/1.75; vs [1.6, 2.5] = 0.15/2.0 (larger).
    // Under the legacy truncation the boundaries collapsed to integers and
    // the candidate search ran on floored values.
    const out = matchIntervals(
      [[0.5, 1.75]],
      [
        [0.0, 0.6],
        [1.6, 2.5],
      ],
    )
    expect(Array.from(out)).toEqual([1])
  })

  it('strict mode throws for a disjoint query', () => {
    expect(() => matchIntervals([[10, 11]], [[0, 1]])).toThrow(/strict/)
  })

  it('throws on empty and malformed inputs', () => {
    expect(() => matchIntervals([], [[0, 1]])).toThrow(/empty/)
    expect(() => matchIntervals([[0, 1]], [])).toThrow(/empty/)
    expect(() => matchIntervals([[2, 1]], [[0, 1]])).toThrow(/start/)
    expect(() => matchIntervals([[0]], [[0, 1]])).toThrow(/2-element/)
  })
})

describe('xa-matching shim (Matcher / snake_case exports)', () => {
  it('Matcher.matchEvents keeps fractional precision', () => {
    const matcher = new Matcher()
    const out = matcher.matchEvents([1.4, 1.9], [1.0, 1.5, 2.0])
    expect(Array.from(out)).toEqual([1, 2])
  })

  it('quickMatchEvents delegates to the repaired engine', () => {
    expect(Array.from(quickMatchEvents([0.12, 0.48], [0.1, 0.5]))).toEqual([0, 1])
  })

  it('match_events / match_intervals follow librosa semantics', () => {
    // ties resolve to the middle index, as in librosa 0.11 (verified live)
    expect(Array.from(match_events([0.5, 1.5, 2.5], [0, 1, 2, 3]))).toEqual([
      1, 2, 3,
    ])
    expect(
      Array.from(
        match_intervals(
          [[0.5, 1.75]],
          [
            [0.0, 0.6],
            [1.6, 2.5],
          ],
        ),
      ),
    ).toEqual([1])
  })

  it('Matcher wraps engine failures in ParameterError', () => {
    const matcher = new Matcher()
    expect(() => matcher.matchEvents([], [1])).toThrow(matcher.ParameterError)
  })
})

describe('dtw explicit-throw paths and step semantics', () => {
  it('throws when neither C nor both X and Y are supplied', () => {
    expect(() => dtw(null, null)).toThrow(/both X and Y/)
    expect(() => dtw([[1, 2]], null)).toThrow(/both X and Y/)
  })

  it('throws when C is supplied together with X/Y', () => {
    expect(() => dtw([[1, 2]], [[1, 2]], { C: [[0]] })).toThrow(/must not be supplied/)
  })

  it('throws on NaN in the cost matrix', () => {
    expect(() => dtw(null, null, { C: [[0, NaN]] })).toThrow(/NaN/)
  })

  it('throws on negative step sizes', () => {
    expect(() =>
      dtw([[1, 2]], [[1, 2]], { stepSizesSigma: [[-1, 1]] }),
    ).toThrow(/negative/)
  })

  it('throws on weights/step length mismatches', () => {
    expect(() =>
      dtw([[1, 2]], [[1, 2]], { stepSizesSigma: [[1, 1]], weightsAdd: [1, 2] }),
    ).toThrow(/weights_add/)
    expect(() =>
      dtw([[1, 2]], [[1, 2]], { stepSizesSigma: [[1, 1]], weightsMul: [1, 2] }),
    ).toThrow(/weights_mul/)
  })

  it('throws on unsupported metrics instead of silently ignoring them', () => {
    expect(() => dtw([[1, 2]], [[1, 2]], { metric: 'mahalanobis' })).toThrow(
      /not supported/,
    )
  })

  it('custom steps are appended to defaults with infinite default weights', () => {
    // With a custom diagonal-only step, the default [0,1]/[1,0] moves get
    // infinite weights: the path must be strictly diagonal.
    const X = [[0, 1, 2]]
    const Y = [[0, 1, 2]]
    const { D, wp } = dtw(X, Y, { stepSizesSigma: [[1, 1]] })
    expect(wp).toEqual([
      [2, 2],
      [1, 1],
      [0, 0],
    ])
    expect(D[2][2]).toBe(0)
  })

  it('throws when no valid warping path exists for the given steps', () => {
    // custom steps are appended with FINITE weights while the defaults get
    // infinite weights, so a 2x1 cost matrix with a diagonal-only custom
    // step has no reachable end cell
    expect(() =>
      dtw(null, null, { C: [[0], [0]], stepSizesSigma: [[1, 1]] }),
    ).toThrow(/no valid/i)
  })

  it('subseq finds a pattern inside a longer sequence', () => {
    const Y = [[10, 20, 1, 2, 30, 40]]
    const X = [[1, 2]]
    const { D, wp } = dtw(X, Y, { subseq: true })
    expect(wp).toEqual([
      [1, 3],
      [0, 2],
    ])
    // matching function: exact match costs 0 at the aligned end column
    expect(D[1][3]).toBe(0)
  })

  it('legacy xa-dtw shim keeps the ascending path and distance contract', () => {
    const X = [[0, 1, 2]]
    const Y = [[0, 1, 2]]
    const { distance, path, normalized_distance } = dtwLegacy(X, Y)
    expect(distance).toBe(0)
    expect(path[0]).toEqual([0, 0])
    expect(path[path.length - 1]).toEqual([2, 2])
    expect(normalized_distance).toBe(0)
  })
})

describe('segment explicit-throw paths and shear round-trips', () => {
  // deterministic pseudo-random features (12 x 40)
  const d = 12
  const n = 40
  const feats = Array.from({ length: d }, (_, f) =>
    Float64Array.from({ length: n }, (_, t) => {
      const x = Math.sin(f * 12.9898 + t * 78.233) * 43758.5453
      return x - Math.floor(x)
    }),
  )

  it('refuses to guess dimensions for flat input', () => {
    expect(() => recurrenceMatrix(new Float32Array(480))).toThrow(
      /nFeatures, nFrames/,
    )
    expect(() => agglomerative(new Float32Array(480), 5)).toThrow(
      /nFeatures, nFrames/,
    )
  })

  it('accepts flat input with an explicit shape (matches 2D input)', () => {
    const flat = new Float64Array(d * n)
    for (let f = 0; f < d; f++) {
      for (let t = 0; t < n; t++) flat[f * n + t] = feats[f][t]
    }
    const a = recurrenceMatrix(feats, { k: 5, sym: true })
    const b = recurrenceMatrix(flat, { k: 5, sym: true, nFeatures: d, nFrames: n })
    expect(b.map((r) => Array.from(r))).toEqual(a.map((r) => Array.from(r)))
  })

  it('throws on mismatched flat shape', () => {
    expect(() =>
      recurrenceMatrix(new Float32Array(100), { nFeatures: 3, nFrames: 40 }),
    ).toThrow(/does not match/)
  })

  it('validates width and mode', () => {
    expect(() => recurrenceMatrix(feats, { width: 0 })).toThrow(/width/)
    expect(() => recurrenceMatrix(feats, { width: 25 })).toThrow(/width/)
    expect(() => recurrenceMatrix(feats, { mode: 'banana' })).toThrow(/mode/)
  })

  it('throws for unsupported bandwidth estimators instead of ignoring them', () => {
    expect(() =>
      recurrenceMatrix(feats, { mode: 'affinity', bandwidth: 'gmean_k' }),
    ).toThrow(/not supported/)
    expect(() =>
      recurrenceMatrix(feats, { mode: 'affinity', bandwidth: -1 }),
    ).toThrow(/strictly positive/)
  })

  it('recurrence_to_lag rejects non-square input; lag_to_recurrence rejects bad shapes', () => {
    expect(() => recurrenceToLag([[1, 2, 3], [4, 5, 6]])).toThrow(/non-square/)
    expect(() =>
      lagToRecurrence([
        [1, 2, 3],
        [4, 5, 6],
      ]),
    ).toThrow(/shape/)
  })

  it('shear round-trip: lagToRecurrence(recurrenceToLag(R)) == R (pad and nopad)', () => {
    const size = 6
    const R = Array.from({ length: size }, (_, i) =>
      Float64Array.from({ length: size }, (_, j) => ((i * 7 + j * 3) % 4 === 0 ? 1 : 0)),
    )
    for (const pad of [true, false]) {
      const lag = recurrenceToLag(R, { pad })
      expect(lag.length).toBe(pad ? 2 * size : size)
      const back = lagToRecurrence(lag)
      expect(back.map((r) => Array.from(r))).toEqual(R.map((r) => Array.from(r)))
    }
  })

  it('agglomerative validates k and segments an obvious two-block signal', () => {
    expect(() => agglomerative(feats, 0)).toThrow(/positive integer/)
    expect(() => agglomerative(feats, 2.5)).toThrow(/positive integer/)
    expect(() => agglomerative(feats, n + 1)).toThrow(/exceed/)

    const blocks = [[0, 0, 0, 0, 10, 10, 10, 10]]
    expect(Array.from(agglomerative(blocks, 2))).toEqual([0, 4])
    // k == n: every frame is its own segment
    expect(Array.from(agglomerative(blocks, 8))).toEqual([0, 1, 2, 3, 4, 5, 6, 7])
  })

  it('xa-temporal shim: flat returns, sym is MUTUAL (never denser than union)', () => {
    const flat = recurrenceMatrixShim(feats, { k: 5, sym: true })
    expect(flat).toBeInstanceOf(Float32Array)
    expect(flat.length).toBe(n * n)
    const asym = recurrenceMatrixShim(feats, { k: 5, sym: false })
    let symLinks = 0
    let asymLinks = 0
    for (let i = 0; i < flat.length; i++) {
      if (flat[i] !== 0) symLinks++
      if (asym[i] !== 0) asymLinks++
    }
    expect(symLinks).toBeLessThanOrEqual(asymLinks)
    // symmetric output
    for (let i = 0; i < n; i++) {
      for (let j = 0; j < n; j++) {
        expect(flat[i * n + j]).toBe(flat[j * n + i])
      }
    }
  })

  it('xa-temporal shim: agglomerative works (legacy Float32Array.splice crash is gone)', () => {
    const bounds = agglomerativeShim(feats, 5)
    expect(bounds).toBeInstanceOf(Uint32Array)
    expect(bounds.length).toBe(5)
    expect(bounds[0]).toBe(0)
    expect(() => agglomerativeShim(feats, 5, { linkage: 'average' })).toThrow(
      /not supported/,
    )
  })
})
