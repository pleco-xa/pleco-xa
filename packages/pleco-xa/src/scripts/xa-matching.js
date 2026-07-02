/**
 * Matching Functions Module — compatibility shim.
 *
 * The librosa-faithful engines live in src/sequence/matching.js
 * (matchIntervals / matchEvents, ports of librosa.util.match_intervals /
 * match_events).
 *
 * CRITICAL repair (Wave 5B): the legacy implementation stored sorted VALUES
 * through `Uint32Array.map` (typed-array map preserves the integer element
 * type), silently flooring fractional interval boundaries and event times
 * to unsigned integers before every binary search — all matching in seconds
 * was integer-quantized. The engine keeps values in Float64Array; this shim
 * only adapts calling conventions.
 *
 * The bottom-level `match_events` / `match_intervals` exports (re-exported by
 * pleco-audio.js) now follow librosa semantics: constraint violations THROW
 * (the legacy loose ports returned -1 sentinels instead).
 */

import { debugLog } from './debug.js'
import {
  matchIntervals as matchIntervalsCore,
  matchEvents as matchEventsCore,
} from '../sequence/matching.js'

/**
 * Musical Event and Interval Matcher Class
 * Thin wrapper around the librosa-faithful engine, kept for API
 * compatibility (plus the pleco-specific accuracy helpers below).
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
   * Match one set of time intervals to another based on maximum overlap
   * (librosa.util.match_intervals semantics, full float precision).
   * @param {Array<Array<number>>} intervalsFrom - Source intervals [[start, end], ...]
   * @param {Array<Array<number>>} intervalsTo - Target intervals [[start, end], ...]
   * @param {boolean} strict - If true, intervals must overlap to match
   * @returns {Uint32Array} Mapping from source to target intervals
   * @throws {ParameterError} If inputs are invalid or no match found in strict mode
   */
  matchIntervals(intervalsFrom, intervalsTo, strict = true) {
    try {
      const result = matchIntervalsCore(intervalsFrom, intervalsTo, { strict })
      debugLog(
        `🎯 Matched ${intervalsFrom.length} intervals with ${strict ? 'strict' : 'relaxed'} matching`,
      )
      return result
    } catch (error) {
      throw new this.ParameterError(error.message)
    }
  }

  /**
   * Match one set of discrete events to another using nearest neighbor
   * (librosa.util.match_events semantics, full float precision).
   * @param {Array<number>} eventsFrom - Source events (times, samples, or frame indices)
   * @param {Array<number>} eventsTo - Target events
   * @param {boolean} left - Allow matching to events on the left
   * @param {boolean} right - Allow matching to events on the right
   * @returns {Int32Array} Mapping from source to target events
   * @throws {ParameterError} If inputs are invalid
   */
  matchEvents(eventsFrom, eventsTo, left = true, right = true) {
    try {
      const result = matchEventsCore(eventsFrom, eventsTo, { left, right })
      debugLog(
        `🎯 Matched ${eventsFrom.length} events with left=${left}, right=${right}`,
      )
      return result
    } catch (error) {
      throw new this.ParameterError(error.message)
    }
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
 * @throws {Error} when the underlying matching cannot be performed
 *   (empty inputs, NaN times) — no silent { matchRate: 0 } fallback
 */
export function matchBeatsToOnsets(beats, onsets, tolerance = 0.1) {
  const matcher = new Matcher()

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
}

/**
 * Match one set of events to another
 * (librosa.util.match_events semantics — full precision, throws on
 * constraint violations; the legacy -1 sentinels are gone)
 *
 * @param {Array<number>} events_from - Source event times
 * @param {Array<number>} events_to - Target event times to match against
 * @param {boolean} left - Allow matches left of the source event
 * @param {boolean} right - Allow matches right of the source event
 * @returns {Int32Array} Indices into events_to for each event in events_from
 *
 * @example
 * match_events([0.5, 1.5, 2.5], [0, 1, 2, 3])  // [1, 2, 3] (librosa tie handling)
 */
export function match_events(events_from, events_to, left = true, right = true) {
  return matchEventsCore(events_from, events_to, { left, right })
}

/**
 * Match one set of time intervals to another
 * (librosa.util.match_intervals semantics — Jaccard-scored, full precision,
 * strict mode throws when a query is disjoint from every target; the legacy
 * -1 sentinels are gone)
 *
 * @param {Array<Array<number>>} intervals_from - Source intervals [[start, end], ...]
 * @param {Array<Array<number>>} intervals_to - Target intervals to match against
 * @param {boolean} strict - If true, require overlap (throws otherwise)
 * @returns {Uint32Array} Indices into intervals_to for each source interval
 */
export function match_intervals(intervals_from, intervals_to, strict = true) {
  return matchIntervalsCore(intervals_from, intervals_to, { strict })
}
