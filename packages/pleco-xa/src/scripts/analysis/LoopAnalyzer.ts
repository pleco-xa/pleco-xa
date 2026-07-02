/**
 * LoopAnalyzer - Framework-agnostic loop detection and analysis module
 *
 * Provides pure functions for detecting seamless loop points in audio using
 * cross-correlation, spectral analysis, and onset detection. Works with any
 * Web Audio AudioBuffer and can be used in any framework.
 *
 * @module LoopAnalyzer
 * @author PlecoXA Audio Analysis
 */

/**
 * Loop analysis configuration options
 * @typedef {Object} LoopAnalysisOptions
 * @property {number} [minLoopLength=0.5] - Minimum loop length in seconds
 * @property {number} [maxLoopLength=8.0] - Maximum loop length in seconds
 * @property {number} [threshold=0.8] - Correlation threshold for loop detection
 * @property {number} [fadeLength=0.01] - Crossfade length in seconds
 * @property {boolean} [useSpectral=true] - Use spectral analysis for better detection
 * @property {boolean} [useTempo=true] - Consider tempo information
 * @property {number} [channel=0] - Audio channel to analyze
 * @property {string} [method='correlation'] - Detection method: 'correlation', 'spectral', 'onset'
 */

/**
 * Loop point information
 * @typedef {Object} LoopPoint
 * @property {number} start - Loop start time in seconds
 * @property {number} end - Loop end time in seconds
 * @property {number} length - Loop length in seconds
 * @property {number} confidence - Confidence score (0-1)
 * @property {number} correlation - Cross-correlation value
 * @property {Object} analysis - Additional analysis data
 */

/**
 * Loop analysis result
 * @typedef {Object} LoopAnalysisResult
 * @property {LoopPoint[]} loops - Array of detected loop points
 * @property {LoopPoint} best - Best loop candidate
 * @property {Object} metadata - Analysis metadata
 * @property {Float32Array} correlationData - Raw correlation data
 */

/**
 * LoopAnalyzer class for object-oriented usage
 */
export class LoopAnalyzer {
  constructor(options = {}) {
    this.options = {
      minLoopLength: 0.5,
      maxLoopLength: 8.0,
      threshold: 0.8,
      fadeLength: 0.01,
      useSpectral: true,
      useTempo: true,
      channel: 0,
      method: 'correlation',
      ...options
    };
  }
  
  async analyze(audioBuffer) {
    return analyzeLoop(audioBuffer, this.options);
  }
  
  findBest(audioBuffer) {
    return findBestLoop(audioBuffer, this.options);
  }
  
  validateLoop(audioBuffer, startTime, endTime) {
    return validateLoop(audioBuffer, startTime, endTime, this.options);
  }
  
  async createSeamless(audioBuffer, loopPoint) {
    return createSeamlessLoop(audioBuffer, loopPoint, this.options);
  }
}

/**
 * Analyzes audio for optimal loop points using cross-correlation
 *
 * @param {AudioBuffer} audioBuffer - Web Audio API AudioBuffer
 * @param {LoopAnalysisOptions} [options={}] - Analysis options
 * @returns {Promise<LoopAnalysisResult>} Promise resolving to loop analysis result
 *
 * @example
 * ```javascript
 * import { analyzeLoop } from './analysis/LoopAnalyzer.ts';
 *
 * const result = await analyzeLoop(audioBuffer, {
 *   minLoopLength: 1.0,
 *   maxLoopLength: 4.0,
 *   threshold: 0.85
 * });
 *
 * if (result.best) {
 *   console.log(`Best loop: ${result.best.start}s - ${result.best.end}s`);
 *   console.log(`Confidence: ${result.best.confidence}`);
 * }
 * ```
 */
export async function analyzeLoop(audioBuffer, options = {}) {
  const opts = {
    minLoopLength: 0.5,
    maxLoopLength: 8.0,
    threshold: 0.8,
    fadeLength: 0.01,
    useSpectral: true,
    useTempo: true,
    channel: 0,
    method: 'correlation',
    ...options,
  }

  const channelData = audioBuffer.getChannelData(opts.channel)
  const sampleRate = audioBuffer.sampleRate

  let result

  switch (opts.method) {
    case 'correlation':
      result = await analyzeByCorrelation(channelData, sampleRate, opts)
      break
    case 'spectral':
      result = await analyzeBySpectral(channelData, sampleRate, opts)
      break
    case 'onset':
      result = await analyzeByOnsets(channelData, sampleRate, opts)
      break
    default:
      throw new Error(`Unknown analysis method: ${opts.method}`)
  }

  // Filter and rank results
  const validLoops = result.loops.filter(
    (loop) =>
      loop.confidence >= opts.threshold &&
      loop.length >= opts.minLoopLength &&
      loop.length <= opts.maxLoopLength,
  )

  // Sort by confidence and correlation
  validLoops.sort((a, b) => {
    const scoreA = a.confidence * 0.7 + a.correlation * 0.3
    const scoreB = b.confidence * 0.7 + b.correlation * 0.3
    return scoreB - scoreA
  })

  return {
    loops: validLoops,
    best: validLoops.length > 0 ? validLoops[0] : null,
    metadata: {
      method: opts.method,
      totalCandidates: result.loops.length,
      validCandidates: validLoops.length,
      analysisTime: result.metadata?.analysisTime || 0,
      audioLength: audioBuffer.duration,
    },
    correlationData: result.correlationData,
  }
}

/**
 * Finds the best loop point using simplified correlation analysis
 *
 * @param {AudioBuffer} audioBuffer - Web Audio API AudioBuffer
 * @param {Object} [options={}] - Analysis options
 * @returns {LoopPoint|null} Best loop point or null if none found
 *
 * @example
 * ```javascript
 * import { findBestLoop } from './analysis/LoopAnalyzer.ts';
 *
 * const loop = findBestLoop(audioBuffer, { minLoopLength: 2.0 });
 * if (loop) {
 *   console.log(`Loop found: ${loop.start} - ${loop.end} seconds`);
 * }
 * ```
 */
export function findBestLoop(audioBuffer, options = {}) {
  const opts = {
    minLoopLength: 0.5,
    maxLoopLength: 8.0,
    threshold: 0.7,
    windowSize: 1024,
    ...options,
  }

  const channelData = audioBuffer.getChannelData(0)
  const sampleRate = audioBuffer.sampleRate
  const minSamples = Math.floor(opts.minLoopLength * sampleRate)
  const maxSamples = Math.floor(opts.maxLoopLength * sampleRate)

  let bestCorrelation = 0
  let bestLoop = null

  // Analyze different loop lengths
  for (
    let loopSamples = minSamples;
    loopSamples <= maxSamples && loopSamples < channelData.length / 2;
    loopSamples += opts.windowSize
  ) {
    // Try different start positions
    const maxStart = channelData.length - loopSamples
    const step = Math.max(1, Math.floor(maxStart / 100)) // Sample 100 positions max

    for (let start = 0; start < maxStart; start += step) {
      const correlation = calculateLoopCorrelation(
        channelData,
        start,
        loopSamples,
      )

      if (correlation > bestCorrelation && correlation >= opts.threshold) {
        bestCorrelation = correlation
        bestLoop = {
          start: start / sampleRate,
          end: (start + loopSamples) / sampleRate,
          length: loopSamples / sampleRate,
          confidence: correlation,
          correlation: correlation,
          analysis: {
            startSample: start,
            endSample: start + loopSamples,
            method: 'simple_correlation',
          },
        }
      }
    }
  }

  return bestLoop
}

/**
 * Validates if a loop creates a seamless transition
 *
 * @param {AudioBuffer} audioBuffer - Web Audio API AudioBuffer
 * @param {number} startTime - Loop start time in seconds
 * @param {number} endTime - Loop end time in seconds
 * @param {Object} [options={}] - Validation options
 * @returns {Object} Validation result with score and details
 *
 * @example
 * ```javascript
 * import { validateLoop } from './analysis/LoopAnalyzer.ts';
 *
 * const validation = validateLoop(audioBuffer, 1.5, 3.2);
 * console.log('Loop quality:', validation.score);
 * console.log('Seamless:', validation.isSeamless);
 * ```
 */
export function validateLoop(audioBuffer, startTime, endTime, options = {}) {
  const opts = {
    fadeLength: 0.01,
    spectralWeight: 0.3,
    amplitudeWeight: 0.7,
    ...options,
  }

  const sampleRate = audioBuffer.sampleRate
  const channelData = audioBuffer.getChannelData(0)
  const startSample = Math.floor(startTime * sampleRate)
  const endSample = Math.floor(endTime * sampleRate)
  const fadesamples = Math.floor(opts.fadeLength * sampleRate)

  if (startSample >= endSample || endSample >= channelData.length) {
    return { score: 0, isSeamless: false, error: 'Invalid loop bounds' }
  }

  // Check amplitude continuity at loop boundary
  const startSegment = channelData.slice(startSample, startSample + fadesamples)
  const endSegment = channelData.slice(endSample - fadesamples, endSample)

  let amplitudeDiff = 0
  for (let i = 0; i < Math.min(startSegment.length, endSegment.length); i++) {
    amplitudeDiff += Math.abs(startSegment[i] - endSegment[i])
  }
  amplitudeDiff /= Math.min(startSegment.length, endSegment.length)

  const amplitudeScore = Math.max(0, 1 - amplitudeDiff * 10)

  // Check spectral continuity (simplified)
  const loopData = channelData.slice(startSample, endSample)
  const correlation = calculateLoopCorrelation(loopData, 0, loopData.length)
  const spectralScore = correlation

  // Combined score
  const totalScore =
    amplitudeScore * opts.amplitudeWeight + spectralScore * opts.spectralWeight

  return {
    score: totalScore,
    isSeamless: totalScore > 0.8,
    amplitudeScore,
    spectralScore,
    amplitudeDiff,
    correlation,
    details: {
      startTime,
      endTime,
      length: endTime - startTime,
      fadeLength: opts.fadeLength,
    },
  }
}

/**
 * Creates loop regions with crossfades for seamless playback
 *
 * @param {AudioBuffer} audioBuffer - Web Audio API AudioBuffer
 * @param {LoopPoint} loopPoint - Loop point information
 * @param {Object} [options={}] - Processing options
 * @returns {Promise<AudioBuffer>} Processed audio buffer with crossfades
 *
 * @example
 * ```javascript
 * import { createSeamlessLoop } from './analysis/LoopAnalyzer.ts';
 *
 * const loopBuffer = await createSeamlessLoop(audioBuffer, bestLoop, {
 *   fadeLength: 0.05,
 *   preserveOriginal: false
 * });
 * ```
 */
export async function createSeamlessLoop(audioBuffer, loopPoint, options = {}) {
  const opts = {
    fadeLength: 0.01,
    preserveOriginal: true,
    ...options,
  }

  const sampleRate = audioBuffer.sampleRate
  const fadesamples = Math.floor(opts.fadeLength * sampleRate)
  const startSample = Math.floor(loopPoint.start * sampleRate)
  const endSample = Math.floor(loopPoint.end * sampleRate)

  // Create new buffer
  const outputBuffer = new AudioContext().createBuffer(
    audioBuffer.numberOfChannels,
    endSample - startSample,
    sampleRate,
  )

  for (let channel = 0; channel < audioBuffer.numberOfChannels; channel++) {
    const inputData = audioBuffer.getChannelData(channel)
    const outputData = outputBuffer.getChannelData(channel)

    // Copy loop section
    for (let i = 0; i < outputData.length; i++) {
      outputData[i] = inputData[startSample + i]
    }

    // Apply crossfade at loop boundaries
    if (fadesamples > 0) {
      // Fade out at end
      for (let i = 0; i < fadesamples && i < outputData.length; i++) {
        const fadePos = i / fadesamples
        const fadeOut = Math.cos((fadePos * Math.PI) / 2)
        const fadeIn = Math.sin((fadePos * Math.PI) / 2)

        // Crossfade with beginning of loop
        const endPos = outputData.length - fadesamples + i
        if (endPos >= 0 && endPos < outputData.length) {
          outputData[endPos] =
            outputData[endPos] * fadeOut + outputData[i] * fadeIn
        }
      }
    }
  }

  return outputBuffer
}

// Private analysis functions

/**
 * Analyze loop using cross-correlation method
 * @private
 */
async function analyzeByCorrelation(channelData, sampleRate, options) {
  const startTime = performance.now()
  const loops = []
  const correlationData = new Float32Array(channelData.length)

  const minSamples = Math.floor(options.minLoopLength * sampleRate)
  const maxSamples = Math.floor(options.maxLoopLength * sampleRate)
  const windowSize = 1024

  for (
    let loopLength = minSamples;
    loopLength <= maxSamples;
    loopLength += windowSize
  ) {
    const maxStart = channelData.length - loopLength
    const step = Math.max(1, Math.floor(maxStart / 200))

    for (let start = 0; start < maxStart; start += step) {
      const correlation = calculateLoopCorrelation(
        channelData,
        start,
        loopLength,
      )
      correlationData[start] = correlation

      if (correlation > options.threshold) {
        loops.push({
          start: start / sampleRate,
          end: (start + loopLength) / sampleRate,
          length: loopLength / sampleRate,
          confidence: correlation,
          correlation: correlation,
          analysis: {
            startSample: start,
            endSample: start + loopLength,
            method: 'correlation',
          },
        })
      }
    }
  }

  return {
    loops,
    correlationData,
    metadata: {
      analysisTime: performance.now() - startTime,
      samplesAnalyzed: channelData.length,
    },
  }
}

/**
 * Analyze loop using spectral method
 * @private
 */
async function analyzeBySpectral(channelData, sampleRate, options) {
  const startTime = performance.now()
  const loops = []

  // Simplified spectral analysis
  const frameSize = 2048
  const hopLength = 512
  const numFrames = Math.floor((channelData.length - frameSize) / hopLength)

  // Calculate spectral features for each frame
  const spectralFeatures = []
  for (let frame = 0; frame < numFrames; frame++) {
    const start = frame * hopLength
    const frameData = channelData.slice(start, start + frameSize)

    // Simple spectral centroid calculation
    let weightedSum = 0
    let magnitudeSum = 0

    for (let i = 0; i < frameData.length; i++) {
      const magnitude = Math.abs(frameData[i])
      weightedSum += i * magnitude
      magnitudeSum += magnitude
    }

    const centroid = magnitudeSum > 0 ? weightedSum / magnitudeSum : 0
    spectralFeatures.push(centroid)
  }

  // Find repeating patterns in spectral features
  const minFrames = Math.floor((options.minLoopLength * sampleRate) / hopLength)
  const maxFrames = Math.floor((options.maxLoopLength * sampleRate) / hopLength)

  for (let loopFrames = minFrames; loopFrames <= maxFrames; loopFrames++) {
    for (let start = 0; start < spectralFeatures.length - loopFrames; start++) {
      const similarity = calculateSpectralSimilarity(
        spectralFeatures.slice(start, start + loopFrames),
        spectralFeatures.slice(start + loopFrames, start + 2 * loopFrames),
      )

      if (similarity > options.threshold) {
        const startTime = (start * hopLength) / sampleRate
        const endTime = ((start + loopFrames) * hopLength) / sampleRate

        loops.push({
          start: startTime,
          end: endTime,
          length: endTime - startTime,
          confidence: similarity,
          correlation: similarity,
          analysis: {
            method: 'spectral',
            spectralSimilarity: similarity,
          },
        })
      }
    }
  }

  return {
    loops,
    correlationData: new Float32Array(spectralFeatures),
    metadata: {
      analysisTime: performance.now() - startTime,
      spectralFrames: spectralFeatures.length,
    },
  }
}

/**
 * Analyze loop using onset detection method
 * @private
 */
async function analyzeByOnsets(channelData, sampleRate, options) {
  const startTime = performance.now()
  const loops = []

  // Simple onset detection using energy differences
  const frameSize = 1024
  const hopLength = 512
  const numFrames = Math.floor((channelData.length - frameSize) / hopLength)

  const onsets = []
  let prevEnergy = 0

  for (let frame = 0; frame < numFrames; frame++) {
    const start = frame * hopLength
    let energy = 0

    for (let i = start; i < start + frameSize && i < channelData.length; i++) {
      energy += channelData[i] * channelData[i]
    }

    energy = Math.sqrt(energy / frameSize)

    if (energy > prevEnergy * 1.5 && energy > 0.1) {
      onsets.push(start / sampleRate)
    }

    prevEnergy = energy
  }

  // Find repeating onset patterns
  for (let i = 0; i < onsets.length - 1; i++) {
    for (let j = i + 1; j < onsets.length; j++) {
      const length = onsets[j] - onsets[i]

      if (length >= options.minLoopLength && length <= options.maxLoopLength) {
        // Check for pattern repetition
        const patternConfidence = checkOnsetPattern(onsets, i, j)

        if (patternConfidence > options.threshold) {
          loops.push({
            start: onsets[i],
            end: onsets[j],
            length: length,
            confidence: patternConfidence,
            correlation: patternConfidence,
            analysis: {
              method: 'onset',
              onsetPattern: true,
              onsetCount: j - i,
            },
          })
        }
      }
    }
  }

  return {
    loops,
    correlationData: new Float32Array(onsets),
    metadata: {
      analysisTime: performance.now() - startTime,
      onsetCount: onsets.length,
    },
  }
}

/**
 * Calculate cross-correlation for loop detection
 * @private
 */
function calculateLoopCorrelation(data, start, length) {
  if (start + length * 2 > data.length) return 0

  const segment1 = data.slice(start, start + length)
  const segment2 = data.slice(start + length, start + length * 2)

  if (segment1.length !== segment2.length) return 0

  let correlation = 0
  let norm1 = 0
  let norm2 = 0

  for (let i = 0; i < segment1.length; i++) {
    correlation += segment1[i] * segment2[i]
    norm1 += segment1[i] * segment1[i]
    norm2 += segment2[i] * segment2[i]
  }

  const normProduct = Math.sqrt(norm1 * norm2)
  return normProduct > 0 ? correlation / normProduct : 0
}

/**
 * Calculate spectral similarity between two feature arrays
 * @private
 */
function calculateSpectralSimilarity(features1, features2) {
  if (features1.length !== features2.length) return 0

  let sum = 0
  for (let i = 0; i < features1.length; i++) {
    const diff = Math.abs(features1[i] - features2[i])
    sum += 1 / (1 + diff) // Similarity decreases with difference
  }

  return sum / features1.length
}

/**
 * Check for repeating onset patterns
 * @private
 */
function checkOnsetPattern(onsets, startIdx, endIdx) {
  const patternLength = endIdx - startIdx
  const pattern = onsets.slice(startIdx, endIdx)

  // Look for similar patterns after this one
  let matches = 0
  let total = 0

  for (let i = endIdx; i < onsets.length - patternLength; i++) {
    const candidate = onsets.slice(i, i + patternLength)

    if (candidate.length === pattern.length) {
      let similarity = 0
      for (let j = 0; j < pattern.length; j++) {
        const timeDiff = Math.abs(
          candidate[j] - candidate[0] - (pattern[j] - pattern[0]),
        )
        similarity += 1 / (1 + timeDiff * 10) // Timing similarity
      }

      similarity /= pattern.length
      if (similarity > 0.8) matches++
      total++
    }
  }

  return total > 0 ? matches / total : 0
}