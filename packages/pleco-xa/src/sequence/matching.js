import { _amax, _amin } from '../scripts/_arrstat.js'
/**
 * Interval and event matching.
 *
 * Two matchers:
 *
 *  - `matchIntervals` — Jaccard-scored interval matching with searchsorted
 *    candidate pruning; strict mode throws when a query is disjoint from
 *    every target; non-strict falls back to the closest disjoint interval
 *    (with exact index arithmetic, including the
 *    `search_ends[i] + 1` neighbor choice).
 *  - `matchEvents` — nearest-event matching with left/right constraints and
 *    exact middle/left/right selection logic.
 *
 * CRITICAL repair vs the legacy xa-matching implementation: all sorted VALUE
 * arrays are Float64Array. The legacy code stored sorted values through
 * `Uint32Array.map` (typed-array map preserves the integer element type),
 * silently flooring fractional seconds before every binary search. Times in
 * seconds now match at full precision. Index arrays remain integer-typed
 * (indices are exact in uint32/int32).
 *
 * All failures throw.
 */

/**
 * numpy-style binary search over a sorted Float64Array.
 * @private
 */
function searchSorted(arr, value, side) {
  let lo = 0
  let hi = arr.length
  if (side === 'left') {
    while (lo < hi) {
      const mid = (lo + hi) >>> 1
      if (arr[mid] < value) lo = mid + 1
      else hi = mid
    }
  } else {
    while (lo < hi) {
      const mid = (lo + hi) >>> 1
      if (arr[mid] <= value) lo = mid + 1
      else hi = mid
    }
  }
  return lo
}

/**
 * Jaccard similarity between two intervals
 * (including the "identical zero-length intervals score 0" behavior).
 * @private
 */
function jaccard(a, b) {
  const interEnd = Math.min(a[1], b[1])
  const interStart = Math.max(a[0], b[0])
  let intersection = interEnd - interStart
  if (intersection < 0) intersection = 0
  const union = Math.max(a[1], b[1]) - Math.min(a[0], b[0])
  if (union > 0) return intersection / union
  return 0
}

/** Validate an interval list: rows of [start, end] with start <= end. @private */
function validIntervals(intervals, name) {
  if (!Array.isArray(intervals) && !ArrayBuffer.isView(intervals)) {
    throw new Error(`matchIntervals: ${name} must be an array of [start, end] pairs`)
  }
  for (let i = 0; i < intervals.length; i++) {
    const row = intervals[i]
    if (!row || row.length !== 2) {
      throw new Error(`matchIntervals: ${name}[${i}] must be a 2-element [start, end] pair`)
    }
    const s = Number(row[0])
    const e = Number(row[1])
    if (Number.isNaN(s) || Number.isNaN(e)) {
      throw new Error(`matchIntervals: ${name}[${i}] contains non-numeric values`)
    }
    if (s > e) {
      throw new Error(
        `matchIntervals: ${name}[${i}] has start (${s}) > end (${e})`,
      )
    }
  }
}

/**
 * Match one set of time intervals to another, maximizing Jaccard similarity.
 *
 * @param {Array<Array<number>>} intervalsFrom - (n, 2) source intervals.
 * @param {Array<Array<number>>} intervalsTo - (m, 2) target intervals.
 * @param {Object} [options]
 * @param {boolean} [options.strict=true] - if true, throw when a query
 *   interval is disjoint from every target; if false, match the closest
 *   disjoint target instead.
 * @returns {Uint32Array} for each source interval, the matched target index.
 */
export function matchIntervals(intervalsFrom, intervalsTo, { strict = true } = {}) {
  if (!intervalsFrom || !intervalsTo || intervalsFrom.length === 0 || intervalsTo.length === 0) {
    throw new Error('matchIntervals: attempting to match empty interval list')
  }
  validIntervals(intervalsFrom, 'intervalsFrom')
  validIntervals(intervalsTo, 'intervalsTo')

  const n = intervalsFrom.length
  const m = intervalsTo.length

  // argsort of target starts and ends (stable; indices are exact integers)
  const startIndex = Uint32Array.from({ length: m }, (_, i) => i)
  const endIndex = Uint32Array.from({ length: m }, (_, i) => i)
  // sort on plain arrays for stability, then copy back
  const startOrder = Array.from(startIndex).sort(
    (a, b) => intervalsTo[a][0] - intervalsTo[b][0] || a - b,
  )
  const endOrder = Array.from(endIndex).sort(
    (a, b) => intervalsTo[a][1] - intervalsTo[b][1] || a - b,
  )
  startIndex.set(startOrder)
  endIndex.set(endOrder)

  // Sorted VALUES in Float64Array — the legacy Uint32Array.map truncation fix
  const startSorted = Float64Array.from(startIndex, (i) => intervalsTo[i][0])
  const endSorted = Float64Array.from(endIndex, (i) => intervalsTo[i][1])

  const searchEnds = new Uint32Array(n)
  const searchStarts = new Uint32Array(n)
  for (let i = 0; i < n; i++) {
    searchEnds[i] = searchSorted(startSorted, intervalsFrom[i][1], 'right')
    searchStarts[i] = searchSorted(endSorted, intervalsFrom[i][0], 'left')
  }

  const output = new Uint32Array(n)
  for (let i = 0; i < n; i++) {
    const query = intervalsFrom[i]

    // Candidates must (start before query ends) AND (end after query starts)
    const startsBefore = new Set()
    for (let j = 0; j < searchEnds[i]; j++) startsBefore.add(startIndex[j])
    const candidates = []
    for (let j = searchStarts[i]; j < m; j++) {
      if (startsBefore.has(endIndex[j])) candidates.push(endIndex[j])
    }

    if (candidates.length > 0) {
      // best Jaccard match; ties keep the first (ascending target index)
      candidates.sort((a, b) => a - b)
      let bestScore = -1
      let bestIdx = -1
      for (const idx of candidates) {
        const score = jaccard(query, intervalsTo[idx])
        if (score > bestScore) {
          bestScore = score
          bestIdx = idx
        }
      }
      output[i] = bestIdx
    } else if (strict) {
      throw new Error(
        `matchIntervals: unable to match interval [${query[0]}, ${query[1]}] with strict=true`,
      )
    } else {
      // Closest disjoint interval (exact index arithmetic)
      let distBefore = Infinity
      let distAfter = Infinity
      if (searchStarts[i] > 0) {
        distBefore = query[0] - endSorted[searchStarts[i] - 1]
      }
      if (searchEnds[i] + 1 < m) {
        distAfter = startSorted[searchEnds[i] + 1] - query[1]
      }
      if (distBefore < distAfter) {
        output[i] = endIndex[searchStarts[i] - 1]
      } else if (Number.isFinite(distAfter)) {
        output[i] = startIndex[searchEnds[i] + 1]
      } else {
        // the fallback neighbor index would read out of bounds here; we throw
        throw new Error(
          `matchIntervals: no disjoint neighbor available for interval ` +
            `[${query[0]}, ${query[1]}] with strict=false ` +
            `(the fallback neighbor index is out of range for this input)`,
        )
      }
    }
  }

  return output
}

/**
 * Match one set of events to another (nearest neighbor with optional
 * left/right constraints).
 *
 * @param {Array<number>|Float32Array|Float64Array} eventsFrom
 * @param {Array<number>|Float32Array|Float64Array} eventsTo
 * @param {Object} [options]
 * @param {boolean} [options.left=true] - allow matches left of the source event.
 * @param {boolean} [options.right=true] - allow matches right of the source event.
 * @returns {Int32Array} for each source event, the matched target index.
 */
export function matchEvents(eventsFrom, eventsTo, { left = true, right = true } = {}) {
  if (!eventsFrom || !eventsTo || eventsFrom.length === 0 || eventsTo.length === 0) {
    throw new Error('matchEvents: attempting to match empty event list')
  }

  // Full-precision copies (never integer-typed)
  const from = Float64Array.from(eventsFrom, Number)
  const to = Float64Array.from(eventsTo, Number)
  for (const v of from) {
    if (Number.isNaN(v)) throw new Error('matchEvents: eventsFrom contains NaN')
  }
  for (const v of to) {
    if (Number.isNaN(v)) throw new Error('matchEvents: eventsTo contains NaN')
  }

  if (!left && !right) {
    const toSet = new Set(to)
    for (const v of from) {
      if (!toSet.has(v)) {
        throw new Error(
          'matchEvents: cannot match events with left=right=false and ' +
            'eventsFrom is not contained in eventsTo',
        )
      }
    }
  }
  if (!left && _amax(to) < _amax(from)) {
    throw new Error(
      'matchEvents: cannot match events with left=false and max(eventsTo) < max(eventsFrom)',
    )
  }
  if (!right && _amin(to) > _amin(from)) {
    throw new Error(
      'matchEvents: cannot match events with right=false and min(eventsTo) > min(eventsFrom)',
    )
  }

  const n = from.length
  const m = to.length

  const fromIdx = Array.from({ length: n }, (_, i) => i).sort(
    (a, b) => from[a] - from[b] || a - b,
  )
  const toIdx = Array.from({ length: m }, (_, i) => i).sort(
    (a, b) => to[a] - to[b] || a - b,
  )
  const sortedFrom = Float64Array.from(fromIdx, (i) => from[i])
  const sortedTo = Float64Array.from(toIdx, (i) => to[i])

  const output = new Int32Array(n)

  for (let ind = 0; ind < n; ind++) {
    let middleInd = searchSorted(sortedTo, sortedFrom[ind], 'left')
    const fromNum = sortedFrom[ind]

    if (middleInd === m) middleInd -= 1

    let leftFlag = false
    let rightFlag = false
    let leftInd = -1
    let rightInd = m
    let leftDiff = 0
    let rightDiff = 0

    if (left && middleInd > 0) {
      leftInd = middleInd - 1
      leftFlag = true
    }
    if (right && middleInd < m - 1) {
      rightInd = middleInd + 1
      rightFlag = true
    }

    const midDiff = Math.abs(sortedTo[middleInd] - fromNum)
    if (left && leftFlag) leftDiff = Math.abs(sortedTo[leftInd] - fromNum)
    if (right && rightFlag) rightDiff = Math.abs(sortedTo[rightInd] - fromNum)

    // exact selection logic (Python operator precedence preserved)
    if (
      leftFlag &&
      ((!right && sortedTo[middleInd] > fromNum) ||
        (!rightFlag && leftDiff < midDiff) ||
        (leftDiff < rightDiff && leftDiff < midDiff))
    ) {
      output[ind] = toIdx[leftInd]
    } else if (rightFlag && rightDiff < midDiff) {
      output[ind] = toIdx[rightInd]
    } else {
      output[ind] = toIdx[middleInd]
    }
  }

  // Undo the sorting of the source events
  const solutions = new Int32Array(n)
  for (let i = 0; i < n; i++) solutions[fromIdx[i]] = output[i]
  return solutions
}
