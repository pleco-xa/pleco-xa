/**
 * Musical Interval Construction Module for JavaScript
 * Functions for constructing various musical interval systems
 * Based on librosa's interval functionality with crystal growth algorithms
 */

import { debugLog } from './debug.js'

/**
 * Musical Interval Constructor Class
 * Handles equal temperament, just intonation, and Pythagorean tuning systems
 */
export class IntervalConstructor {
  constructor() {
    // Interval cache for performance
    this._cache = new Map()

    // Pre-computed common interval ratios
    this.COMMON_INTERVALS = {
      unison: 1.0,
      minor_second: 16 / 15,
      major_second: 9 / 8,
      minor_third: 6 / 5,
      major_third: 5 / 4,
      perfect_fourth: 4 / 3,
      tritone: Math.sqrt(2),
      perfect_fifth: 3 / 2,
      minor_sixth: 8 / 5,
      major_sixth: 5 / 3,
      minor_seventh: 16 / 9,
      major_seventh: 15 / 8,
      octave: 2.0,
    }
  }

  /**
   * Simple cache decorator implementation
   * @private
   */
  _cached(key, computeFn) {
    if (this._cache.has(key)) {
      return this._cache.get(key)
    }
    const result = computeFn()
    this._cache.set(key, result)
    return result
  }

  /**
   * Construct a set of frequencies from an interval set
   * @param {number} nBins - The number of frequencies to generate
   * @param {Object} options - Configuration options
   * @param {number} options.fmin - The minimum frequency (must be > 0)
   * @param {string|Array<number>} options.intervals - Interval specification
   * @param {number} options.binsPerOctave - Bins per octave (default: 12)
   * @param {number} options.tuning - Deviation from A440 in fractional bins (default: 0)
   * @param {boolean} options.sort - Sort intervals in ascending order (default: true)
   * @returns {Float32Array} The frequency array
   */
  intervalFrequencies(nBins, options = {}) {
    const {
      fmin,
      intervals,
      binsPerOctave = 12,
      tuning = 0.0,
      sort = true,
    } = options

    if (!fmin || fmin <= 0) {
      throw new Error('fmin must be greater than 0')
    }

    let ratios

    if (typeof intervals === 'string') {
      switch (intervals) {
        case 'equal':
          // Equal temperament
          ratios = new Float32Array(binsPerOctave)
          for (let i = 0; i < binsPerOctave; i++) {
            ratios[i] = Math.pow(2, (tuning + i) / binsPerOctave)
          }
          break

        case 'pythagorean':
          ratios = this.pythagoreanIntervals({
            binsPerOctave,
            sort,
            returnFactors: false,
          })
          break

        case 'ji3':
          ratios = this.plimitIntervals({
            primes: [3],
            binsPerOctave,
            sort,
            returnFactors: false,
          })
          break

        case 'ji5':
          ratios = this.plimitIntervals({
            primes: [3, 5],
            binsPerOctave,
            sort,
            returnFactors: false,
          })
          break

        case 'ji7':
          ratios = this.plimitIntervals({
            primes: [3, 5, 7],
            binsPerOctave,
            sort,
            returnFactors: false,
          })
          break

        default:
          throw new Error(`Unknown interval type: ${intervals}`)
      }
    } else {
      // Custom interval array provided
      ratios = new Float32Array(intervals)
    }

    // Tile the ratios across octaves
    const nOctaves = Math.ceil(nBins / binsPerOctave)
    const allRatios = new Float32Array(nBins)

    let idx = 0
    for (let octave = 0; octave < nOctaves && idx < nBins; octave++) {
      const octaveMultiplier = Math.pow(2, octave)
      for (let i = 0; i < ratios.length && idx < nBins; i++) {
        allRatios[idx++] = ratios[i] * octaveMultiplier
      }
    }

    if (sort) {
      allRatios.sort((a, b) => a - b)
    }

    // Scale by fmin
    for (let i = 0; i < allRatios.length; i++) {
      allRatios[i] *= fmin
    }

    debugLog(
      `🎼 Generated ${nBins} frequencies using ${intervals} intervals from ${fmin.toFixed(2)} Hz`,
    )

    return allRatios
  }

  /**
   * Generate Pythagorean intervals based on powers of 3
   * @param {Object} options - Configuration options
   * @param {number} options.binsPerOctave - Number of intervals to generate (default: 12)
   * @param {boolean} options.sort - Sort intervals ascending (default: true)
   * @param {boolean} options.returnFactors - Return prime factorization (default: false)
   * @returns {Float32Array|Array<Object>} Intervals or their factorizations
   */
  pythagoreanIntervals(options = {}) {
    const { binsPerOctave = 12, sort = true, returnFactors = false } = options

    const cacheKey = `pythagorean_${binsPerOctave}_${sort}_${returnFactors}`

    return this._cached(cacheKey, () => {
      // Generate powers of 3 centered around 0
      const pow3 = new Int32Array(binsPerOctave)
      const start = -Math.floor(binsPerOctave / 2)
      for (let i = 0; i < binsPerOctave; i++) {
        pow3[i] = start + i
      }

      // Calculate log ratios and required powers of 2
      const logRatios = new Float32Array(binsPerOctave)
      const pow2 = new Int32Array(binsPerOctave)

      for (let i = 0; i < binsPerOctave; i++) {
        const log3 = pow3[i] * Math.log2(3)
        pow2[i] = Math.round(log3) // Round to nearest octave
        logRatios[i] = log3 - pow2[i]

        // Ensure ratio is in [0, 1) (within one octave)
        while (logRatios[i] < 0) {
          logRatios[i] += 1
          pow2[i] -= 1
        }
        while (logRatios[i] >= 1) {
          logRatios[i] -= 1
          pow2[i] += 1
        }
      }

      // Create index array for sorting
      let indices = Array.from({ length: binsPerOctave }, (_, i) => i)

      if (sort) {
        indices.sort((a, b) => logRatios[a] - logRatios[b])
      }

      if (returnFactors) {
        // Return factorized form: 2^a * 3^b
        return indices.map((i) => ({
          2: -pow2[i],
          3: pow3[i],
        }))
      }

      // Return as floating point intervals
      const intervals = new Float32Array(binsPerOctave)
      for (let i = 0; i < binsPerOctave; i++) {
        const idx = indices[i]
        intervals[i] = Math.pow(2, logRatios[idx])
      }

      return intervals
    })
  }

  /**
   * Construct p-limit intervals using harmonic crystal growth algorithm
   * @param {Object} options - Configuration options
   * @param {Array<number>} options.primes - Prime factors to use
   * @param {number} options.binsPerOctave - Number of intervals (default: 12)
   * @param {boolean} options.sort - Sort intervals ascending (default: true)
   * @param {boolean} options.returnFactors - Return prime factorization (default: false)
   * @returns {Float32Array|Array<Object>} Intervals or their factorizations
   */
  plimitIntervals(options = {}) {
    const {
      primes,
      binsPerOctave = 12,
      sort = true,
      returnFactors = false,
    } = options

    if (!primes || primes.length === 0) {
      throw new Error('primes array must be provided and non-empty')
    }

    const cacheKey = `plimit_${primes.join('_')}_${binsPerOctave}_${sort}_${returnFactors}`

    return this._cached(cacheKey, () => {
      const logs = primes.map((p) => Math.log2(p))

      // Generate seed intervals (primes and their reciprocals)
      const seeds = []
      for (let i = 0; i < primes.length; i++) {
        // Prime
        const seed1 = new Array(primes.length).fill(0)
        seed1[i] = 1
        seeds.push(seed1)

        // Reciprocal
        const seed2 = new Array(primes.length).fill(0)
        seed2[i] = -1
        seeds.push(seed2)
      }

      // Initialize crystal growth algorithm
      const frontier = seeds.map((s) => [...s])
      const intervals = []
      const distances = new Map()

      // Start with root (unison = 1)
      const root = new Array(primes.length).fill(0)
      intervals.push(root)

      // Crystal growth algorithm - build intervals by minimizing harmonic distance
      while (intervals.length < binsPerOctave) {
        let bestScore = Infinity
        let bestIndex = 0

        // Find best candidate from frontier
        for (let f = 0; f < frontier.length; f++) {
          const candidate = frontier[f]
          let harmonicDistance = 0

          // Sum harmonic distances to all selected intervals
          for (const selected of intervals) {
            const key = this._vectorKey([selected, candidate])

            if (!distances.has(key)) {
              const hd = this._harmonicDistance(logs, candidate, selected)
              distances.set(key, hd)
              // Cache reverse direction too
              distances.set(this._vectorKey([candidate, selected]), hd)
            }

            harmonicDistance += distances.get(key)
          }

          // Check if this is the best candidate
          if (
            harmonicDistance < bestScore ||
            (Math.abs(harmonicDistance - bestScore) < 1e-6 &&
              this._crystalTieBreak(candidate, frontier[bestIndex], logs))
          ) {
            bestScore = harmonicDistance
            bestIndex = f
          }
        }

        // Add best candidate to intervals
        const newInterval = frontier.splice(bestIndex, 1)[0]
        intervals.push(newInterval)

        // Expand frontier with new combinations
        for (const seed of seeds) {
          const newCandidate = newInterval.map((v, i) => v + seed[i])

          // Check if candidate is already in intervals or frontier
          const isInIntervals = intervals.some((iv) =>
            this._vectorsEqual(iv, newCandidate),
          )
          const isInFrontier = frontier.some((fv) =>
            this._vectorsEqual(fv, newCandidate),
          )

          if (!isInIntervals && !isInFrontier) {
            frontier.push(newCandidate)
          }
        }
      }

      // Convert to frequency ratios
      const pows = intervals
      const logRatios = new Float32Array(binsPerOctave)
      const pow2 = new Int32Array(binsPerOctave)

      for (let i = 0; i < binsPerOctave; i++) {
        let logRatio = 0
        for (let j = 0; j < primes.length; j++) {
          logRatio += pows[i][j] * logs[j]
        }

        // Reduce to one octave
        pow2[i] = Math.floor(logRatio)
        logRatios[i] = logRatio - pow2[i]

        if (logRatios[i] < 0) {
          logRatios[i] += 1
          pow2[i] -= 1
        }
      }

      // Create index array for sorting
      let indices = Array.from({ length: binsPerOctave }, (_, i) => i)

      if (sort) {
        indices.sort((a, b) => logRatios[a] - logRatios[b])
      }

      if (returnFactors) {
        // Return factorized form
        return indices.map((i) => {
          const factors = {}
          if (pow2[i] !== 0) {
            factors[2] = -pow2[i]
          }
          for (let j = 0; j < primes.length; j++) {
            if (pows[i][j] !== 0) {
              factors[primes[j]] = pows[i][j]
            }
          }
          return factors
        })
      }

      // Return as floating point intervals
      const result = new Float32Array(binsPerOctave)
      for (let i = 0; i < binsPerOctave; i++) {
        const idx = indices[i]
        result[i] = Math.pow(2, logRatios[idx])
      }

      return result
    })
  }

  /**
   * Generate well-tempered intervals (historical temperaments)
   * @param {string} temperament - Temperament name ('werckmeister', 'kirnberger', 'young')
   * @param {boolean} sort - Sort intervals
   * @returns {Float32Array} Interval ratios
   */
  wellTemperedIntervals(temperament = 'werckmeister', sort = true) {
    const cacheKey = `welltempered_${temperament}_${sort}`

    return this._cached(cacheKey, () => {
      let cents

      switch (temperament) {
        case 'werckmeister':
          // Werckmeister III (1681)
          cents = [0, 90, 192, 294, 390, 498, 588, 696, 792, 888, 996, 1092]
          break

        case 'kirnberger':
          // Kirnberger III (1779)
          cents = [0, 90, 193, 294, 386, 498, 590, 697, 792, 890, 996, 1088]
          break

        case 'young':
          // Young II (1799)
          cents = [0, 94, 196, 298, 392, 502, 592, 698, 796, 894, 1000, 1092]
          break

        default:
          throw new Error(`Unknown temperament: ${temperament}`)
      }

      // Convert cents to ratios
      const ratios = new Float32Array(12)
      for (let i = 0; i < 12; i++) {
        ratios[i] = Math.pow(2, cents[i] / 1200)
      }

      if (sort) {
        ratios.sort((a, b) => a - b)
      }

      return ratios
    })
  }

  /**
   * Compute harmonic distance between two intervals
   * @private
   */
  _harmonicDistance(logs, a, b) {
    // Tenney height-based harmonic distance
    let distance = 0
    for (let i = 0; i < logs.length; i++) {
      distance += logs[i] * Math.abs(a[i] - b[i])
    }
    return distance
  }

  /**
   * Tie-breaking function for crystal growth algorithm
   * @private
   */
  _crystalTieBreak(a, b, logs) {
    // Prefer intervals with smaller Tenney height
    let heightA = 0,
      heightB = 0
    for (let i = 0; i < logs.length; i++) {
      heightA += logs[i] * Math.abs(a[i])
      heightB += logs[i] * Math.abs(b[i])
    }
    return heightA < heightB
  }

  /**
   * Utility functions
   * @private
   */
  _vectorKey(vectors) {
    return JSON.stringify(vectors)
  }

  _vectorsEqual(a, b) {
    return a.length === b.length && a.every((val, i) => val === b[i])
  }

  /**
   * Convert interval ratios to cents
   * @param {Float32Array} ratios - Interval ratios
   * @returns {Float32Array} Intervals in cents
   */
  ratiosToCents(ratios) {
    return ratios.map((ratio) => 1200 * Math.log2(ratio))
  }

  /**
   * Convert cents to interval ratios
   * @param {Array} cents - Intervals in cents
   * @returns {Float32Array} Interval ratios
   */
  centsToRatios(cents) {
    return new Float32Array(cents.map((cent) => Math.pow(2, cent / 1200)))
  }

  /**
   * Get note names for intervals (Western 12-tone system)
   * @param {number} binsPerOctave - Number of divisions (default: 12)
   * @returns {Array<string>} Note names
   */
  getNoteNames(binsPerOctave = 12) {
    if (binsPerOctave === 12) {
      return ['C', 'C#', 'D', 'D#', 'E', 'F', 'F#', 'G', 'G#', 'A', 'A#', 'B']
    }

    // Generate generic note names for other divisions
    return Array.from({ length: binsPerOctave }, (_, i) => `Note${i}`)
  }

  /**
   * Analyze interval quality (consonance/dissonance)
   * @param {number} ratio - Interval ratio
   * @returns {Object} Analysis result
   */
  analyzeInterval(ratio) {
    const cents = 1200 * Math.log2(ratio)

    // Find closest simple ratio
    const simpleRatios = [
      { ratio: 1 / 1, name: 'Unison', consonance: 'Perfect' },
      { ratio: 16 / 15, name: 'Minor Second', consonance: 'Dissonant' },
      { ratio: 9 / 8, name: 'Major Second', consonance: 'Dissonant' },
      { ratio: 6 / 5, name: 'Minor Third', consonance: 'Imperfect' },
      { ratio: 5 / 4, name: 'Major Third', consonance: 'Imperfect' },
      { ratio: 4 / 3, name: 'Perfect Fourth', consonance: 'Perfect' },
      { ratio: 7 / 5, name: 'Tritone', consonance: 'Dissonant' },
      { ratio: 3 / 2, name: 'Perfect Fifth', consonance: 'Perfect' },
      { ratio: 8 / 5, name: 'Minor Sixth', consonance: 'Imperfect' },
      { ratio: 5 / 3, name: 'Major Sixth', consonance: 'Imperfect' },
      { ratio: 16 / 9, name: 'Minor Seventh', consonance: 'Dissonant' },
      { ratio: 15 / 8, name: 'Major Seventh', consonance: 'Dissonant' },
      { ratio: 2 / 1, name: 'Octave', consonance: 'Perfect' },
    ]

    let closest = simpleRatios[0]
    let minDiff = Math.abs(cents - 1200 * Math.log2(closest.ratio))

    for (const candidate of simpleRatios) {
      const diff = Math.abs(cents - 1200 * Math.log2(candidate.ratio))
      if (diff < minDiff) {
        minDiff = diff
        closest = candidate
      }
    }

    return {
      cents: cents,
      ratio: ratio,
      closest: closest,
      deviation: minDiff,
    }
  }
}

/**
 * Quick frequency generation utility
 * @param {number} baseFreq - Base frequency in Hz
 * @param {string} intervalType - Type of intervals ('equal', 'ji5', etc.)
 * @param {number} numNotes - Number of notes to generate
 * @returns {Float32Array} Frequency array
 */
export function generateFrequencies(
  baseFreq = 440,
  intervalType = 'equal',
  numNotes = 12,
) {
  const constructor = new IntervalConstructor()
  return constructor.intervalFrequencies(numNotes, {
    fmin: baseFreq,
    intervals: intervalType,
    binsPerOctave: 12,
    sort: true,
  })
}

/**
 * Compare different tuning systems
 * @param {number} baseFreq - Base frequency
 * @param {Array<string>} systems - Systems to compare
 * @returns {Object} Comparison data
 */
export function compareTuningSystems(
  baseFreq = 440,
  systems = ['equal', 'pythagorean', 'ji5'],
) {
  const constructor = new IntervalConstructor()
  const comparison = {}

  for (const system of systems) {
    const frequencies = constructor.intervalFrequencies(12, {
      fmin: baseFreq,
      intervals: system,
      binsPerOctave: 12,
      sort: true,
    })

    comparison[system] = {
      frequencies: Array.from(frequencies),
      cents: constructor.ratiosToCents(frequencies.map((f) => f / baseFreq)),
    }
  }

  return comparison
}
