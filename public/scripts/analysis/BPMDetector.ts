/**
 * BPMDetector - Framework-agnostic BPM detection module
 *
 * Provides pure functions for detecting beats per minute in audio using
 * autocorrelation and onset detection algorithms. Works with any Web Audio
 * AudioBuffer and can be used in any framework (Astro, React, Vue, vanilla JS).
 *
 * @module BPMDetector
 * @author PlecoXA Audio Analysis
 */

/**
 * Configuration options for BPM detection
 * @typedef {Object} BPMDetectionOptions
 * @property {number} [minBPM=60] - Minimum BPM to detect
 * @property {number} [maxBPM=180] - Maximum BPM to detect
 * @property {number} [hopLength=512] - Hop length for analysis frames
 * @property {number} [windowSize=1024] - Window size for analysis
 * @property {boolean} [useOnsetStrength=true] - Use onset strength calculation
 * @property {number} [threshold=0.1] - Minimum correlation threshold
 */

/**
 * BPM detection result
 * @typedef {Object} BPMResult
 * @property {number} bpm - Detected beats per minute
 * @property {number} confidence - Confidence score (0-1)
 * @property {number[]} onsets - Array of onset times in seconds
 * @property {number[]} beats - Array of beat times in seconds
 * @property {Object} analysis - Additional analysis data
 */

/**
 * Detects BPM from an AudioBuffer using autocorrelation and onset detection
 *
 * @param {AudioBuffer} audioBuffer - Web Audio API AudioBuffer
 * @param {BPMDetectionOptions} [options={}] - Detection options
 * @param {number} [startSample=0] - Start sample index for windowed analysis
 * @param {number} [endSample=null] - End sample index for windowed analysis
 * @returns {Promise<BPMResult>} Promise resolving to BPM detection result
 *
 * @example
 * ```javascript
 * import { detectBPM } from './analysis/BPMDetector.ts';
 *
 * const audioContext = new AudioContext();
 * const response = await fetch('audio.wav');
 * const arrayBuffer = await response.arrayBuffer();
 * const audioBuffer = await audioContext.decodeAudioData(arrayBuffer);
 *
 * const result = await detectBPM(audioBuffer, {
 *   minBPM: 80,
 *   maxBPM: 160
 * });
 *
 * console.log(`Detected BPM: ${result.bpm}`);
 * console.log(`Confidence: ${result.confidence}`);
 * ```
 */
export async function detectBPM(audioBuffer, options = {}, startSample = 0, endSample = null) {
  const opts = {
    minBPM: 60,
    maxBPM: 180,
    hopLength: 512,
    windowSize: 1024,
    useOnsetStrength: true,
    threshold: 0.1,
    ...options,
  }

  // Get mono channel data
  const fullAudioData = getMonoChannelData(audioBuffer);
  const sampleRate = audioBuffer.sampleRate;
  
  // Use a window of data if startSample and endSample are provided
  const audioData = endSample ? fullAudioData.slice(startSample, endSample) : fullAudioData;

  // Calculate onset strength
  const onsetStrength = opts.useOnsetStrength
    ? await calculateOnsetStrength(audioData, sampleRate, opts)
    : audioData;

  // Find tempo using autocorrelation
  const tempoResult = await findTempo(onsetStrength, sampleRate, opts);

  // Extract beats and onsets
  const beats = extractBeats(onsetStrength, tempoResult.bpm, sampleRate, opts);
  const onsets = extractOnsets(audioData, sampleRate, opts);

  return {
    bpm: Math.round(tempoResult.bpm * 10) / 10,
    confidence: tempoResult.confidence,
    onsets: onsets,
    beats: beats,
    analysis: {
      onsetStrength: onsetStrength,
      autocorrelation: tempoResult.autocorr,
      sampleRate: sampleRate,
    },
  }
}

/**
 * Detects BPM from a sliding window of audio data for live updates
 *
 * @param {AudioBuffer} audioBuffer - Web Audio API AudioBuffer
 * @param {number} centerSample - Center sample index for the window
 * @param {number} windowDuration - Duration of the window in seconds
 * @param {BPMDetectionOptions} [options={}] - Detection options
 * @returns {Promise<BPMResult>} Promise resolving to BPM detection result
 */
export async function detectBPMWindow(audioBuffer, centerSample, windowDuration, options = {}) {
  const sampleRate = audioBuffer.sampleRate;
  const windowSamples = Math.floor(windowDuration * sampleRate);
  const startSample = Math.max(0, centerSample - Math.floor(windowSamples / 2));
  const endSample = Math.min(audioBuffer.length, startSample + windowSamples);
  
  return await detectBPM(audioBuffer, options, startSample, endSample);
}

/**
 * Fast BPM detection with simplified algorithm for real-time use
 *
 * @param {AudioBuffer} audioBuffer - Web Audio API AudioBuffer
 * @param {Object} [options={}] - Detection options
 * @returns {number} Detected BPM value
 *
 * @example
 * ```javascript
 * import { fastBPMDetect } from './analysis/BPMDetector.ts';
 *
 * const bpm = fastBPMDetect(audioBuffer);
 * console.log(`Quick BPM: ${bpm}`);
 * ```
 */
export function fastBPMDetect(audioBuffer, options = {}) {
  const opts = {
    minBPM: 60,
    maxBPM: 180,
    hopLength: 1024, // Larger hop for speed
    ...options,
  }

  const audioData = getMonoChannelData(audioBuffer)
  const sampleRate = audioBuffer.sampleRate

  // Simple RMS energy-based onset detection
  const frameSize = opts.hopLength
  const numFrames = Math.floor(audioData.length / frameSize)
  const energy = new Float32Array(numFrames)

  for (let i = 0; i < numFrames; i++) {
    const start = i * frameSize
    const end = Math.min(start + frameSize, audioData.length)
    let sum = 0

    for (let j = start; j < end; j++) {
      sum += audioData[j] * audioData[j]
    }

    energy[i] = Math.sqrt(sum / (end - start))
  }

  // Find autocorrelation peak
  const minLag = Math.floor(((60 / opts.maxBPM) * sampleRate) / frameSize)
  const maxLag = Math.floor(((60 / opts.minBPM) * sampleRate) / frameSize)

  let maxCorr = 0
  let bestLag = minLag

  for (let lag = minLag; lag <= maxLag && lag < energy.length / 2; lag++) {
    let corr = 0
    let count = 0

    for (let i = 0; i < energy.length - lag; i++) {
      corr += energy[i] * energy[i + lag]
      count++
    }

    if (count > 0) {
      corr /= count
      if (corr > maxCorr) {
        maxCorr = corr
        bestLag = lag
      }
    }
  }

  // Convert lag to BPM
  const bpm = (60 * sampleRate) / (bestLag * frameSize)
  return Math.round(bpm * 10) / 10
}

/**
 * Extract mono channel data from AudioBuffer
 * @private
 */
function getMonoChannelData(audioBuffer) {
  if (audioBuffer.numberOfChannels === 1) {
    return audioBuffer.getChannelData(0)
  }

  // Mix down to mono
  const left = audioBuffer.getChannelData(0)
  const right =
    audioBuffer.numberOfChannels > 1 ? audioBuffer.getChannelData(1) : left
  const mono = new Float32Array(left.length)

  for (let i = 0; i < left.length; i++) {
    mono[i] = (left[i] + right[i]) / 2
  }

  return mono
}

/**
 * Calculate onset strength using spectral energy differences
 * @private
 */
async function calculateOnsetStrength(audioData, sampleRate, options) {
  const frameSize = options.windowSize
  const hopLength = options.hopLength
  const numFrames = Math.floor((audioData.length - frameSize) / hopLength) + 1

  const onsetStrength = new Float32Array(numFrames)
  let prevSpectrum = null

  for (let frame = 0; frame < numFrames; frame++) {
    const start = frame * hopLength
    const end = Math.min(start + frameSize, audioData.length)

    // Get frame data and apply window
    const frameData = new Float32Array(frameSize)
    for (let i = 0; i < frameSize && start + i < audioData.length; i++) {
      // Hann window
      const windowValue =
        0.5 * (1 - Math.cos((2 * Math.PI * i) / (frameSize - 1)))
      frameData[i] = audioData[start + i] * windowValue
    }

    // Simple spectral energy calculation (approximation)
    let energy = 0
    for (let i = 0; i < frameData.length; i++) {
      energy += frameData[i] * frameData[i]
    }

    // Onset strength as energy difference
    if (prevSpectrum !== null) {
      const diff = Math.max(0, energy - prevSpectrum)
      onsetStrength[frame] = diff
    } else {
      onsetStrength[frame] = energy
    }

    prevSpectrum = energy
  }

  return onsetStrength
}

/**
 * Find tempo using autocorrelation
 * @private
 */
async function findTempo(onsetStrength, sampleRate, options) {
  const hopLength = options.hopLength
  const minLag = Math.floor(((60 / options.maxBPM) * sampleRate) / hopLength)
  const maxLag = Math.floor(((60 / options.minBPM) * sampleRate) / hopLength)

  const autocorr = new Float32Array(maxLag - minLag + 1)
  let maxCorr = 0
  let bestLag = minLag

  // Calculate autocorrelation
  for (let lag = minLag; lag <= maxLag; lag++) {
    let sum = 0
    let count = 0

    for (let i = 0; i < onsetStrength.length - lag; i++) {
      sum += onsetStrength[i] * onsetStrength[i + lag]
      count++
    }

    if (count > 0) {
      const corrValue = sum / count
      autocorr[lag - minLag] = corrValue

      if (corrValue > maxCorr) {
        maxCorr = corrValue
        bestLag = lag
      }
    }
  }

  // Convert lag to BPM
  const bpm = (60 * sampleRate) / (bestLag * hopLength)

  // Calculate confidence as normalized correlation
  const avgCorr = autocorr.reduce((sum, val) => sum + val, 0) / autocorr.length
  const confidence = avgCorr > 0 ? Math.min(maxCorr / avgCorr, 1) : 0

  return {
    bpm: bpm,
    confidence: confidence,
    autocorr: autocorr,
    bestLag: bestLag,
  }
}

/**
 * Extract beat positions from onset strength
 * @private
 */
function extractBeats(onsetStrength, bpm, sampleRate, options) {
  const hopLength = options.hopLength
  const beatInterval = ((60 / bpm) * sampleRate) / hopLength // in frames
  const beats = []

  // Find first strong onset
  let maxOnset = 0
  let firstBeatFrame = 0

  for (let i = 0; i < Math.min(onsetStrength.length, beatInterval); i++) {
    if (onsetStrength[i] > maxOnset) {
      maxOnset = onsetStrength[i]
      firstBeatFrame = i
    }
  }

  // Generate beat positions
  let currentFrame = firstBeatFrame
  while (currentFrame < onsetStrength.length) {
    const timeInSeconds = (currentFrame * hopLength) / sampleRate
    beats.push(timeInSeconds)
    currentFrame += Math.round(beatInterval)
  }

  return beats
}

/**
 * Extract onset positions using peak picking
 * @private
 */
function extractOnsets(audioData, sampleRate, options) {
  const frameSize = options.windowSize || 1024
  const hopLength = options.hopLength || 512
  const threshold = options.threshold || 0.1
  
  const onsets = []
  const numFrames = Math.floor((audioData.length - frameSize) / hopLength)
  
  let prevEnergy = 0
  for (let i = 0; i < numFrames; i++) {
    const start = i * hopLength
    let energy = 0
    
    for (let j = 0; j < frameSize; j++) {
      energy += audioData[start + j] * audioData[start + j]
    }
    
    if (energy > prevEnergy * (1 + threshold)) {
      onsets.push(start / sampleRate)
    }
    
    prevEnergy = energy
  }
  
  return onsets
}

/**
 * BPMDetector class for object-oriented usage
 */
export class BPMDetector {
  constructor(options = {}) {
    this.options = {
      minBPM: 60,
      maxBPM: 180,
      hopLength: 512,
      windowSize: 1024,
      useOnsetStrength: true,
      threshold: 0.1,
      ...options
    }
  }
  
  async analyze(audioBuffer) {
    return detectBPM(audioBuffer, this.options)
  }
  
  detectFast(audioBuffer) {
    return fastBPMDetect(audioBuffer, this.options)
  }
}/**
 * Analyze tempo variations over time
 *
 * @param {AudioBuffer} audioBuffer - Web Audio API AudioBuffer
 * @param {Object} [options={}] - Analysis options
 * @returns {Promise<Object>} Tempo analysis with time-varying BPM
 *
 * @example
 * ```javascript
 * import { analyzeTempoVariations } from './analysis/BPMDetector.ts';
 *
 * const analysis = await analyzeTempoVariations(audioBuffer, {
 *   windowDuration: 4.0, // 4 second windows
 *   hopDuration: 1.0     // 1 second hop
 * });
 *
 * console.log('BPM over time:', analysis.bpmOverTime);
 * ```
 */
export async function analyzeTempoVariations(audioBuffer, options = {}) {
  const opts = {
    windowDuration: 4.0, // seconds
    hopDuration: 1.0, // seconds
    ...options,
  }

  const sampleRate = audioBuffer.sampleRate
  const windowSamples = Math.floor(opts.windowDuration * sampleRate)
  const hopSamples = Math.floor(opts.hopDuration * sampleRate)

  const bpmOverTime = []
  const timePoints = []

  for (
    let start = 0;
    start + windowSamples < audioBuffer.length;
    start += hopSamples
  ) {
    // Create sub-buffer for this window
    const windowData = audioBuffer
      .getChannelData(0)
      .slice(start, start + windowSamples)
    const tempContext = new OfflineAudioContext(1, windowSamples, sampleRate)
    const tempBuffer = tempContext.createBuffer(1, windowSamples, sampleRate)
    tempBuffer.copyToChannel(windowData, 0)

    // Detect BPM for this window
    const result = await detectBPM(tempBuffer, {
      ...options,
      useOnsetStrength: false,
    })

    bpmOverTime.push(result.bpm)
    timePoints.push(start / sampleRate)
  }

  return {
    bpmOverTime,
    timePoints,
    averageBPM:
      bpmOverTime.reduce((sum, bpm) => sum + bpm, 0) / bpmOverTime.length,
    bpmVariance: calculateVariance(bpmOverTime),
  }
}

/**
 * Calculate variance helper function
 * @private
 */
function calculateVariance(values) {
  const mean = values.reduce((sum, val) => sum + val, 0) / values.length
  const squaredDiffs = values.map((val) => Math.pow(val - mean, 2))
  return squaredDiffs.reduce((sum, val) => sum + val, 0) / values.length
}
