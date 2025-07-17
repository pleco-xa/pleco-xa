/**
 * WaveformData - Framework-agnostic waveform data extraction module
 *
 * Provides pure functions for extracting waveform visualization data from
 * audio buffers. Generates peaks, RMS values, and downsampled data suitable
 * for any visualization framework or canvas rendering.
 *
 * @module WaveformData
 * @author PlecoXA Audio Analysis
 */

/**
 * Waveform data configuration options
 * @typedef {Object} WaveformOptions
 * @property {number} [width=800] - Target width in pixels for waveform
 * @property {number} [height=200] - Target height in pixels for waveform
 * @property {number} [peaks=null] - Number of peaks to extract (overrides width)
 * @property {string} [type='peaks'] - Type of data: 'peaks', 'rms', 'samples'
 * @property {boolean} [normalize=true] - Normalize peaks to [-1, 1] range
 * @property {number} [channel=0] - Audio channel to analyze (0=left, 1=right, -1=mix)
 * @property {number} [precision=2] - Decimal precision for output values
 */

/**
 * Waveform data result
 * @typedef {Object} WaveformResult
 * @property {Float32Array} data - Waveform data array
 * @property {Float32Array} peaks - Peak values for visualization
 * @property {number} length - Number of data points
 * @property {number} sampleRate - Original audio sample rate
 * @property {number} duration - Audio duration in seconds
 * @property {Object} metadata - Additional analysis metadata
 */

/**
 * Extracts waveform peaks suitable for visualization
 *
 * @param {AudioBuffer} audioBuffer - Web Audio API AudioBuffer
 * @param {WaveformOptions} [options={}] - Extraction options
 * @returns {WaveformResult} Waveform data for visualization
 *
 * @example
 * ```javascript
 * import { getWaveformPeaks } from './analysis/WaveformData.ts';
 *
 * const peaks = getWaveformPeaks(audioBuffer, {
 *   width: 1000,
 *   type: 'peaks',
 *   normalize: true
 * });
 *
 * // Use with canvas
 * const canvas = document.getElementById('waveform');
 * const ctx = canvas.getContext('2d');
 *
 * peaks.data.forEach((peak, i) => {
 *   const x = (i / peaks.length) * canvas.width;
 *   const y = canvas.height / 2;
 *   const height = peak * canvas.height / 2;
 *   ctx.fillRect(x, y - height, 1, height * 2);
 * });
 * ```
 */
export function getWaveformPeaks(audioBuffer, options = {}) {
  const opts = {
    width: 800,
    height: 200,
    peaks: null,
    type: 'peaks',
    normalize: true,
    channel: 0,
    precision: 2,
    ...options,
  }

  // Determine number of peaks to extract
  const numPeaks = opts.peaks || opts.width
  const channelData = getChannelData(audioBuffer, opts.channel)
  const samplesPerPeak = Math.floor(channelData.length / numPeaks)

  let data
  let metadata = {
    samplesPerPeak,
    originalLength: channelData.length,
    method: opts.type,
  }

  switch (opts.type) {
    case 'peaks':
      data = extractPeaks(channelData, numPeaks, samplesPerPeak)
      break
    case 'rms':
      data = extractRMS(channelData, numPeaks, samplesPerPeak)
      break
    case 'samples':
      data = extractSamples(channelData, numPeaks)
      break
    default:
      throw new Error(`Unknown waveform type: ${opts.type}`)
  }

  // Normalize if requested
  if (opts.normalize) {
    data = normalizeData(data)
  }

  // Apply precision
  if (opts.precision !== null) {
    data = data.map(
      (val) =>
        Math.round(val * Math.pow(10, opts.precision)) /
        Math.pow(10, opts.precision),
    )
  }

  return {
    data: new Float32Array(data),
    peaks: new Float32Array(data), // Alias for compatibility
    length: data.length,
    sampleRate: audioBuffer.sampleRate,
    duration: audioBuffer.duration,
    metadata,
  }
}

/**
 * Extracts stereo waveform data for left and right channels
 *
 * @param {AudioBuffer} audioBuffer - Web Audio API AudioBuffer
 * @param {WaveformOptions} [options={}] - Extraction options
 * @returns {Object} Stereo waveform data with left and right channels
 *
 * @example
 * ```javascript
 * import { getStereoWaveformPeaks } from './analysis/WaveformData.ts';
 *
 * const stereo = getStereoWaveformPeaks(audioBuffer, { width: 800 });
 * console.log('Left channel:', stereo.left.data);
 * console.log('Right channel:', stereo.right.data);
 * ```
 */
export function getStereoWaveformPeaks(audioBuffer, options = {}) {
  if (audioBuffer.numberOfChannels < 2) {
    const mono = getWaveformPeaks(audioBuffer, { ...options, channel: 0 })
    return {
      left: mono,
      right: mono, // Duplicate mono for compatibility
      isMono: true,
    }
  }

  const left = getWaveformPeaks(audioBuffer, { ...options, channel: 0 })
  const right = getWaveformPeaks(audioBuffer, { ...options, channel: 1 })

  return {
    left,
    right,
    isMono: false,
  }
}

/**
 * Generates time-based waveform data with precise time stamps
 *
 * @param {AudioBuffer} audioBuffer - Web Audio API AudioBuffer
 * @param {Object} [options={}] - Generation options
 * @returns {Object} Time-indexed waveform data
 *
 * @example
 * ```javascript
 * import { getTimebasedWaveform } from './analysis/WaveformData.ts';
 *
 * const timeWaveform = getTimebasedWaveform(audioBuffer, {
 *   resolution: 0.01 // 10ms resolution
 * });
 *
 * timeWaveform.data.forEach((point, i) => {
 *   console.log(`Time: ${point.time}s, Amplitude: ${point.amplitude}`);
 * });
 * ```
 */
export function getTimebasedWaveform(audioBuffer, options = {}) {
  const opts = {
    resolution: 0.01, // seconds per sample
    channel: 0,
    type: 'peaks',
    ...options,
  }

  const sampleRate = audioBuffer.sampleRate
  const samplesPerPoint = Math.floor(opts.resolution * sampleRate)
  const channelData = getChannelData(audioBuffer, opts.channel)
  const numPoints = Math.floor(channelData.length / samplesPerPoint)

  const data = []

  for (let i = 0; i < numPoints; i++) {
    const start = i * samplesPerPoint
    const end = Math.min(start + samplesPerPoint, channelData.length)
    const segment = channelData.slice(start, end)

    let amplitude
    switch (opts.type) {
      case 'peaks':
        amplitude = Math.max(...segment.map(Math.abs))
        break
      case 'rms':
        amplitude = Math.sqrt(
          segment.reduce((sum, val) => sum + val * val, 0) / segment.length,
        )
        break
      case 'average':
        amplitude =
          segment.reduce((sum, val) => sum + Math.abs(val), 0) / segment.length
        break
      default:
        amplitude = Math.max(...segment.map(Math.abs))
    }

    data.push({
      time: start / sampleRate,
      amplitude: amplitude,
      index: i,
    })
  }

  return {
    data,
    resolution: opts.resolution,
    duration: audioBuffer.duration,
    sampleRate: sampleRate,
    type: opts.type,
  }
}

/**
 * Generates waveform data for a specific time range
 *
 * @param {AudioBuffer} audioBuffer - Web Audio API AudioBuffer
 * @param {number} startTime - Start time in seconds
 * @param {number} endTime - End time in seconds
 * @param {WaveformOptions} [options={}] - Extraction options
 * @returns {WaveformResult} Waveform data for the specified range
 *
 * @example
 * ```javascript
 * import { getWaveformRange } from './analysis/WaveformData.ts';
 *
 * // Get waveform for seconds 10-20
 * const rangeWaveform = getWaveformRange(audioBuffer, 10, 20, {
 *   width: 500,
 *   type: 'rms'
 * });
 * ```
 */
export function getWaveformRange(
  audioBuffer,
  startTime,
  endTime,
  options = {},
) {
  const sampleRate = audioBuffer.sampleRate
  const startSample = Math.floor(startTime * sampleRate)
  const endSample = Math.floor(endTime * sampleRate)

  if (startSample >= audioBuffer.length || endSample <= startSample) {
    throw new Error('Invalid time range')
  }

  // Create a sub-buffer for the range
  const channelData = getChannelData(audioBuffer, options.channel || 0)
  const rangeData = channelData.slice(
    startSample,
    Math.min(endSample, channelData.length),
  )

  // Create temporary buffer for the range
  const tempBuffer = {
    getChannelData: (channel) => rangeData,
    numberOfChannels: 1,
    length: rangeData.length,
    sampleRate: sampleRate,
    duration: (endSample - startSample) / sampleRate,
  }

  const result = getWaveformPeaks(tempBuffer, options)

  // Add range metadata
  result.metadata = {
    ...result.metadata,
    startTime,
    endTime,
    startSample,
    endSample,
  }

  return result
}

/**
 * Calculates waveform statistics for analysis
 *
 * @param {AudioBuffer} audioBuffer - Web Audio API AudioBuffer
 * @param {Object} [options={}] - Analysis options
 * @returns {Object} Statistical analysis of waveform
 *
 * @example
 * ```javascript
 * import { analyzeWaveform } from './analysis/WaveformData.ts';
 *
 * const stats = analyzeWaveform(audioBuffer);
 * console.log('Peak amplitude:', stats.peak);
 * console.log('RMS level:', stats.rms);
 * console.log('Dynamic range:', stats.dynamicRange);
 * ```
 */
export function analyzeWaveform(audioBuffer, options = {}) {
  const opts = {
    channel: -1, // Mix all channels
    windowSize: 1024,
    ...options,
  }

  const channelData = getChannelData(audioBuffer, opts.channel)

  // Basic statistics
  let peak = 0
  let rmsSum = 0
  let dcOffset = 0

  for (let i = 0; i < channelData.length; i++) {
    const sample = channelData[i]
    peak = Math.max(peak, Math.abs(sample))
    rmsSum += sample * sample
    dcOffset += sample
  }

  const rms = Math.sqrt(rmsSum / channelData.length)
  dcOffset /= channelData.length

  // Dynamic range analysis
  const sortedData = Array.from(channelData)
    .map(Math.abs)
    .sort((a, b) => b - a)
  const p99 = sortedData[Math.floor(sortedData.length * 0.01)] // Top 1%
  const p1 = sortedData[Math.floor(sortedData.length * 0.99)] // Bottom 1%
  const dynamicRange = 20 * Math.log10(p99 / Math.max(p1, 1e-10)) // dB

  // Crest factor (peak to RMS ratio)
  const crestFactor = peak / Math.max(rms, 1e-10)

  // Zero crossing rate
  let zeroCrossings = 0
  for (let i = 1; i < channelData.length; i++) {
    if (channelData[i] >= 0 !== channelData[i - 1] >= 0) {
      zeroCrossings++
    }
  }
  const zcr = zeroCrossings / channelData.length

  return {
    peak,
    rms,
    dcOffset,
    dynamicRange,
    crestFactor,
    zeroCrossingRate: zcr,
    length: channelData.length,
    duration: audioBuffer.duration,
    sampleRate: audioBuffer.sampleRate,
  }
}

// Private helper functions

/**
 * Get channel data based on channel option
 * @private
 */
function getChannelData(audioBuffer, channel) {
  if (channel === -1) {
    // Mix all channels
    const mixed = new Float32Array(audioBuffer.length)
    for (let ch = 0; ch < audioBuffer.numberOfChannels; ch++) {
      const channelData = audioBuffer.getChannelData(ch)
      for (let i = 0; i < channelData.length; i++) {
        mixed[i] += channelData[i] / audioBuffer.numberOfChannels
      }
    }
    return mixed
  } else {
    return audioBuffer.getChannelData(
      Math.min(channel, audioBuffer.numberOfChannels - 1),
    )
  }
}

/**
 * Extract peak values from audio data
 * @private
 */
function extractPeaks(channelData, numPeaks, samplesPerPeak) {
  const peaks = new Array(numPeaks)

  for (let i = 0; i < numPeaks; i++) {
    const start = i * samplesPerPeak
    const end = Math.min(start + samplesPerPeak, channelData.length)
    let peak = 0

    for (let j = start; j < end; j++) {
      peak = Math.max(peak, Math.abs(channelData[j]))
    }

    peaks[i] = peak
  }

  return peaks
}

/**
 * Extract RMS values from audio data
 * @private
 */
function extractRMS(channelData, numPeaks, samplesPerPeak) {
  const rms = new Array(numPeaks)

  for (let i = 0; i < numPeaks; i++) {
    const start = i * samplesPerPeak
    const end = Math.min(start + samplesPerPeak, channelData.length)
    let sum = 0

    for (let j = start; j < end; j++) {
      sum += channelData[j] * channelData[j]
    }

    rms[i] = Math.sqrt(sum / (end - start))
  }

  return rms
}

/**
 * Extract direct sample values (downsampled)
 * @private
 */
function extractSamples(channelData, numSamples) {
  const step = channelData.length / numSamples
  const samples = new Array(numSamples)

  for (let i = 0; i < numSamples; i++) {
    const index = Math.floor(i * step)
    samples[i] = channelData[index]
  }

  return samples
}

/**
 * Normalize data to [-1, 1] range
 * @private
 */
function normalizeData(data) {
  const max = Math.max(...data.map(Math.abs))
  if (max === 0) return data

  return data.map((val) => val / max)
}

// Alias for primary export to match expected name in index.js
export const WaveformData = getWaveformPeaks;
