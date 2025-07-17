/**
 * Matching Functions Module for JavaScript
 * Functions for matching intervals and events with high precision
 * Based on librosa's matching algorithms for time-series alignment
 */

import { debugLog } from './debug.js'

/**
 * Musical Event and Interval Matcher Class
 * Handles precise matching between time-based musical events
 */
export class Matcher {
  constructor() {
    // Custom error class for parameter validation
    this.ParameterError = class extends Error {
      constructor(message) {
        super(message)
        this.name = 'ParameterError'
      }
    }
  }

  /**
   * Validate interval array format
   * @private
   * @param {Array<Array<number>>} intervals - Array of [start, end] pairs
   * @throws {ParameterError} If intervals are invalid
   */
  _validIntervals(intervals) {
    if (!Array.isArray(intervals)) {
      throw new this.ParameterError('Intervals must be an array')
    }

    for (let i = 0; i < intervals.length; i++) {
      if (!Array.isArray(intervals[i]) || intervals[i].length !== 2) {
        throw new this.ParameterError(
          `Interval ${i} must be a 2-element array [start, end]`,
        )
      }
      if (
        typeof intervals[i][0] !== 'number' ||
        typeof intervals[i][1] !== 'number'
      ) {
        throw new this.ParameterError(
          `Interval ${i} must contain numeric values`,
        )
      }
      if (intervals[i][0] > intervals[i][1]) {
        throw new this.ParameterError(
          `Invalid interval ${i}: start (${intervals[i][0]}) > end (${intervals[i][1]})`,
        )
      }
    }
  }

  /**
   * Compute Jaccard similarity between two intervals
   * @private
   * @param {Array<number>} intA - First interval [start, end]
   * @param {Array<number>} intB - Second interval [start, end]
   * @returns {number} Jaccard similarity score (0-1)
   */
  _jaccard(intA, intB) {
    // Find intersection
    const intersectionStart = Math.max(intA[0], intB[0])
    const intersectionEnd = Math.min(intA[1], intB[1])
    const intersection = Math.max(0, intersectionEnd - intersectionStart)

    // Find union
    const unionStart = Math.min(intA[0], intB[0])
    const unionEnd = Math.max(intA[1], intB[1])
    const union = unionEnd - unionStart

    if (union > 0) {
      return intersection / union
    }

    // Both intervals are points at the same location
    return intA[0] === intB[0] ? 1.0 : 0.0
  }

  /**
   * Find the best Jaccard match from query to candidates
   * @private
   * @param {Array<number>} query - Query interval
   * @param {Array<Array<number>>} intervalsTo - Target intervals
   * @param {Set<number>} candidates - Candidate indices
   * @returns {number} Index of best match
   */
  _matchIntervalOverlaps(query, intervalsTo, candidates) {
    let bestScore = -1
    let bestIdx = -1

    for (const idx of candidates) {
      const score = this._jaccard(query, intervalsTo[idx])
      if (score > bestScore) {
        bestScore = score
        bestIdx = idx
      }
    }

    return bestIdx
  }

  /**
   * Binary search implementation similar to numpy's searchsorted
   * @private
   * @param {Array<number>} arr - Sorted array
   * @param {number} value - Value to search for
   * @param {string} side - 'left' or 'right'
   * @returns {number} Insertion index
   */
  _searchSorted(arr, value, side = 'left') {
    let left = 0
    let right = arr.length

    if (side === 'left') {
      while (left < right) {
        const mid = Math.floor((left + right) / 2)
        if (arr[mid] < value) {
          left = mid + 1
        } else {
          right = mid
        }
      }
    } else {
      // side === 'right'
      while (left < right) {
        const mid = Math.floor((left + right) / 2)
        if (arr[mid] <= value) {
          left = mid + 1
        } else {
          right = mid
        }
      }
    }

    return left
  }

  /**
   * Core interval matching algorithm with efficient candidate filtering
   * @private
   * @param {Array<Array<number>>} intervalsFrom - Source intervals
   * @param {Array<Array<number>>} intervalsTo - Target intervals
   * @param {boolean} strict - Whether to require overlapping intervals
   * @returns {Uint32Array} Mapping from source to target intervals
   */
  _matchIntervalsCore(intervalsFrom, intervalsTo, strict = true) {
    const n = intervalsFrom.length
    const m = intervalsTo.length

    // Create index arrays for sorting
    const startIndex = new Uint32Array(m)
    const endIndex = new Uint32Array(m)
    for (let i = 0; i < m; i++) {
      startIndex[i] = i
      endIndex[i] = i
    }

    // Sort indices by start and end times
    startIndex.sort((a, b) => intervalsTo[a][0] - intervalsTo[b][0])
    endIndex.sort((a, b) => intervalsTo[a][1] - intervalsTo[b][1])

    // Get sorted start and end values for binary search
    const startSorted = startIndex.map((i) => intervalsTo[i][0])
    const endSorted = endIndex.map((i) => intervalsTo[i][1])

    // Pre-compute search results for all queries
    const searchEnds = new Uint32Array(n)
    const searchStarts = new Uint32Array(n)
    for (let i = 0; i < n; i++) {
      searchEnds[i] = this._searchSorted(
        startSorted,
        intervalsFrom[i][1],
        'right',
      )
      searchStarts[i] = this._searchSorted(
        endSorted,
        intervalsFrom[i][0],
        'left',
      )
    }

    const output = new Uint32Array(n)

    for (let i = 0; i < n; i++) {
      const query = intervalsFrom[i]

      // Find candidates that potentially overlap with query
      const afterQuery = searchEnds[i]
      const beforeQuery = searchStarts[i]

      // Create candidate set using set intersection
      const candidates = new Set()

      // Add intervals that start before query ends
      for (let j = 0; j < afterQuery; j++) {
        candidates.add(startIndex[j])
      }

      // Keep only those that also end after query starts
      const finalCandidates = new Set()
      for (let j = beforeQuery; j < m; j++) {
        if (candidates.has(endIndex[j])) {
          finalCandidates.add(endIndex[j])
        }
      }

      if (finalCandidates.size > 0) {
        // Find best overlap among candidates
        output[i] = this._matchIntervalOverlaps(
          query,
          intervalsTo,
          finalCandidates,
        )
      } else if (strict) {
        throw new this.ParameterError(
          `Unable to match interval [${query[0]}, ${query[1]}] with strict=true. No overlapping intervals found.`,
        )
      } else {
        // Find the closest disjoint interval
        let distBefore = Infinity
        let distAfter = Infinity
        let idxBefore = -1
        let idxAfter = -1

        // Check interval before query
        if (searchStarts[i] > 0) {
          idxBefore = endIndex[searchStarts[i] - 1]
          distBefore = query[0] - intervalsTo[idxBefore][1]
        }

        // Check interval after query
        if (searchEnds[i] < m) {
          idxAfter = startIndex[searchEnds[i]]
          distAfter = intervalsTo[idxAfter][0] - query[1]
        }

        // Choose closest
        if (idxBefore === -1) {
          output[i] = idxAfter
        } else if (idxAfter === -1) {
          output[i] = idxBefore
        } else {
          output[i] = distBefore <= distAfter ? idxBefore : idxAfter
        }
      }
    }

    return output
  }

  /**
   * Match one set of time intervals to another based on maximum overlap
   * @param {Array<Array<number>>} intervalsFrom - Source intervals [[start, end], ...]
   * @param {Array<Array<number>>} intervalsTo - Target intervals [[start, end], ...]
   * @param {boolean} strict - If true, intervals must overlap to match
   * @returns {Uint32Array} Mapping from source to target intervals
   * @throws {ParameterError} If inputs are invalid or no match found in strict mode
   */
  matchIntervals(intervalsFrom, intervalsTo, strict = true) {
    if (intervalsFrom.length === 0 || intervalsTo.length === 0) {
      throw new this.ParameterError('Attempting to match empty interval list')
    }

    // Validate intervals
    this._validIntervals(intervalsFrom)
    this._validIntervals(intervalsTo)

    try {
      const result = this._matchIntervalsCore(
        intervalsFrom,
        intervalsTo,
        strict,
      )
      debugLog(
        `🎯 Matched ${intervalsFrom.length} intervals with ${strict ? 'strict' : 'relaxed'} matching`,
      )
      return result
    } catch (error) {
      if (error instanceof this.ParameterError) {
        throw new this.ParameterError(
          `Unable to match intervals with strict=${strict}: ${error.message}`,
        )
      }
      throw error
    }
  }

  /**
   * Match one set of discrete events to another using nearest neighbor
   * @param {Array<number>} eventsFrom - Source events (times, samples, or frame indices)
   * @param {Array<number>} eventsTo - Target events
   * @param {boolean} left - Allow matching to events on the left
   * @param {boolean} right - Allow matching to events on the right
   * @returns {Int32Array} Mapping from source to target events
   * @throws {ParameterError} If inputs are invalid
   */
  matchEvents(eventsFrom, eventsTo, left = true, right = true) {
    if (eventsFrom.length === 0 || eventsTo.length === 0) {
      throw new this.ParameterError('Attempting to match empty event list')
    }

    // Convert to arrays and validate
    const fromArray = Array.from(eventsFrom).map(Number)
    const toArray = Array.from(eventsTo).map(Number)

    // Check for NaN values
    if (fromArray.some(isNaN) || toArray.some(isNaN)) {
      throw new this.ParameterError('Event arrays cannot contain NaN values')
    }

    // Validation checks
    if (!left && !right) {
      const allContained = fromArray.every((e) => toArray.includes(e))
      if (!allContained) {
        throw new this.ParameterError(
          'Cannot match events with left=right=false and events_from is not contained in events_to',
        )
      }
    }

    if (!left && Math.max(...toArray) < Math.max(...fromArray)) {
      throw new this.ParameterError(
        'Cannot match events with left=false and max(events_to) < max(events_from)',
      )
    }

    if (!right && Math.min(...toArray) > Math.min(...fromArray)) {
      throw new this.ParameterError(
        'Cannot match events with right=false and min(events_to) > min(events_from)',
      )
    }

    const result = this._matchEventsHelper(fromArray, toArray, left, right)
    debugLog(
      `🎯 Matched ${fromArray.length} events with left=${left}, right=${right}`,
    )
    return result
  }

  /**
   * Core event matching algorithm
   * @private
   */
  _matchEventsHelper(eventsFrom, eventsTo, left, right) {
    const n = eventsFrom.length
    const m = eventsTo.length

    // Create index arrays for sorting
    const fromIdx = new Uint32Array(n)
    const toIdx = new Uint32Array(m)

    for (let i = 0; i < n; i++) fromIdx[i] = i
    for (let i = 0; i < m; i++) toIdx[i] = i

    // Sort indices by event values
    fromIdx.sort((a, b) => eventsFrom[a] - eventsFrom[b])
    toIdx.sort((a, b) => eventsTo[a] - eventsTo[b])

    // Get sorted events
    const sortedFrom = fromIdx.map((i) => eventsFrom[i])
    const sortedTo = toIdx.map((i) => eventsTo[i])

    // Find insertion points for each source event
    const insertionPoints = new Uint32Array(n)
    for (let i = 0; i < n; i++) {
      insertionPoints[i] = this._searchSorted(sortedTo, sortedFrom[i], 'left')
    }

    const output = new Int32Array(n)

    // Process each event
    for (let ind = 0; ind < n; ind++) {
      let insertionPoint = insertionPoints[ind]
      const eventValue = sortedFrom[ind]

      // Prevent out of bounds
      if (insertionPoint === m) {
        insertionPoint = m - 1
      }

      let leftIdx = -1
      let rightIdx = -1
      let leftDiff = Infinity
      let rightDiff = Infinity
      let midDiff = Infinity

      // Calculate distances to potential matches
      if (insertionPoint < m) {
        midDiff = Math.abs(sortedTo[insertionPoint] - eventValue)
      }

      // Check left neighbor
      if (left && insertionPoint > 0) {
        leftIdx = insertionPoint - 1
        leftDiff = Math.abs(sortedTo[leftIdx] - eventValue)
      }

      // Check right neighbor
      if (right && insertionPoint < m - 1) {
        rightIdx = insertionPoint + 1
        rightDiff = Math.abs(sortedTo[rightIdx] - eventValue)
      }

      // Determine best match based on constraints and distances
      let bestMatch = insertionPoint

      if (
        left &&
        leftIdx >= 0 &&
        ((!right && sortedTo[insertionPoint] > eventValue) ||
          (leftDiff < rightDiff && leftDiff < midDiff) ||
          (rightIdx === -1 && leftDiff < midDiff))
      ) {
        bestMatch = leftIdx
      } else if (
        right &&
        rightIdx >= 0 &&
        rightDiff < midDiff &&
        rightDiff < leftDiff
      ) {
        bestMatch = rightIdx
      }

      output[ind] = toIdx[bestMatch]
    }

    // Undo sorting to restore original order
    const solutions = new Int32Array(n)
    for (let i = 0; i < n; i++) {
      solutions[fromIdx[i]] = output[i]
    }

    return solutions
  }

  /**
   * Calculate interval overlap ratio
   * @param {Array<number>} interval1 - First interval [start, end]
   * @param {Array<number>} interval2 - Second interval [start, end]
   * @returns {number} Overlap ratio (0-1)
   */
  intervalOverlap(interval1, interval2) {
    const overlap = Math.max(
      0,
      Math.min(interval1[1], interval2[1]) -
        Math.max(interval1[0], interval2[0]),
    )
    const union =
      Math.max(interval1[1], interval2[1]) -
      Math.min(interval1[0], interval2[0])
    return union > 0 ? overlap / union : 0
  }

  /**
   * Find events within a time window
   * @param {Array<number>} events - Event times
   * @param {number} centerTime - Center of search window
   * @param {number} windowSize - Window size (total width)
   * @returns {Array<number>} Indices of events within window
   */
  findEventsInWindow(events, centerTime, windowSize) {
    const halfWindow = windowSize / 2
    const start = centerTime - halfWindow
    const end = centerTime + halfWindow

    const indices = []
    for (let i = 0; i < events.length; i++) {
      if (events[i] >= start && events[i] <= end) {
        indices.push(i)
      }
    }

    return indices
  }

  /**
   * Calculate matching accuracy metrics
   * @param {Array<number>} sourceEvents - Original events
   * @param {Array<number>} targetEvents - Target events
   * @param {Array<number>} mapping - Mapping indices
   * @returns {Object} Accuracy metrics
   */
  calculateMatchingAccuracy(sourceEvents, targetEvents, mapping) {
    const errors = []
    let totalError = 0

    for (let i = 0; i < sourceEvents.length; i++) {
      const error = Math.abs(sourceEvents[i] - targetEvents[mapping[i]])
      errors.push(error)
      totalError += error
    }

    errors.sort((a, b) => a - b)

    return {
      meanError: totalError / sourceEvents.length,
      medianError: errors[Math.floor(errors.length / 2)],
      maxError: Math.max(...errors),
      minError: Math.min(...errors),
      stdError: Math.sqrt(
        errors.reduce((sum, err) => {
          const diff = err - totalError / sourceEvents.length
          return sum + diff * diff
        }, 0) / errors.length,
      ),
    }
  }
}

/**
 * Quick interval matching utility
 * @param {Array<Array<number>>} sourceIntervals - Source intervals
 * @param {Array<Array<number>>} targetIntervals - Target intervals
 * @param {boolean} strict - Require overlap
 * @returns {Uint32Array} Mapping
 */
export function quickMatchIntervals(
  sourceIntervals,
  targetIntervals,
  strict = true,
) {
  const matcher = new Matcher()
  return matcher.matchIntervals(sourceIntervals, targetIntervals, strict)
}

/**
 * Quick event matching utility
 * @param {Array<number>} sourceEvents - Source events
 * @param {Array<number>} targetEvents - Target events
 * @returns {Int32Array} Mapping
 */
export function quickMatchEvents(sourceEvents, targetEvents) {
  const matcher = new Matcher()
  return matcher.matchEvents(sourceEvents, targetEvents, true, true)
}

/**
 * Musical beat to onset matching
 * @param {Array<number>} beats - Beat times in seconds
 * @param {Array<number>} onsets - Onset times in seconds
 * @param {number} tolerance - Maximum allowed error in seconds
 * @returns {Object} Matching result with accuracy metrics
 */
export function matchBeatsToOnsets(beats, onsets, tolerance = 0.1) {
  const matcher = new Matcher()

  try {
    const mapping = matcher.matchEvents(beats, onsets, true, true)
    const accuracy = matcher.calculateMatchingAccuracy(beats, onsets, mapping)

    // Filter matches within tolerance
    const validMatches = []
    for (let i = 0; i < beats.length; i++) {
      const error = Math.abs(beats[i] - onsets[mapping[i]])
      if (error <= tolerance) {
        validMatches.push({
          beatIndex: i,
          onsetIndex: mapping[i],
          beatTime: beats[i],
          onsetTime: onsets[mapping[i]],
          error: error,
        })
      }
    }

    return {
      mapping: mapping,
      accuracy: accuracy,
      validMatches: validMatches,
      matchRate: validMatches.length / beats.length,
    }
  } catch (error) {
    console.error('Beat to onset matching failed:', error)
    return { mapping: [], accuracy: null, validMatches: [], matchRate: 0 }
  }
}
