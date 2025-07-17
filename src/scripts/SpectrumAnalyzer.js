/**
 * SpectrumAnalyzer - Framework-agnostic spectrum visualization module
 *
 * Provides real-time and static spectrum analysis visualization with
 * FFT data rendering, frequency bars, and spectrogram displays.
 * Works with any framework and Web Audio API.
 *
 * @module SpectrumAnalyzer
 * @author PlecoXA Audio Analysis
 */

/**
 * Spectrum visualization configuration
 * @typedef {Object} SpectrumRenderOptions
 * @property {string} [style='bars'] - Rendering style: 'bars', 'line', 'filled', 'spectrogram'
 * @property {string} [color='#00ff88'] - Primary color
 * @property {number} [minDb=-100] - Minimum dB level
 * @property {number} [maxDb=-10] - Maximum dB level
 * @property {number} [smoothing=0.8] - Temporal smoothing factor
 * @property {boolean} [logScale=true] - Use logarithmic frequency scale
 * @property {number} [barGap=1] - Gap between bars
 * @property {Object} [gradient=null] - Color gradient configuration
 * @property {boolean} [showGrid=false] - Show frequency grid lines
 */

/**
 * Real-time spectrum analyzer class
 *
 * @example
 * ```javascript
 * import { RealtimeSpectrumAnalyzer } from './SpectrumAnalyzer.js';
 *
 * const analyzer = new RealtimeSpectrumAnalyzer(canvas, audioContext, {
 *   fftSize: 2048,
 *   style: 'bars',
 *   color: '#00ff88'
 * });
 *
 * // Connect to audio source
 * audioSource.connect(analyzer.getAnalyserNode());
 * analyzer.start();
 * ```
 */
export class RealtimeSpectrumAnalyzer {
  constructor(canvas, audioContext, options = {}) {
    this.canvas = canvas
    this.ctx = canvas.getContext('2d')
    this.audioContext = audioContext

    this.options = {
      fftSize: 2048,
      style: 'bars',
      color: '#00ff88',
      minDb: -100,
      maxDb: -10,
      smoothing: 0.8,
      logScale: true,
      barGap: 1,
      gradient: null,
      showGrid: false,
      ...options,
    }

    // Create analyser node
    this.analyser = audioContext.createAnalyser()
    this.analyser.fftSize = this.options.fftSize
    this.analyser.smoothingTimeConstant = this.options.smoothing
    this.analyser.minDecibels = this.options.minDb
    this.analyser.maxDecibels = this.options.maxDb

    // Analysis data arrays
    this.frequencyData = new Uint8Array(this.analyser.frequencyBinCount)
    this.timeData = new Uint8Array(this.analyser.frequencyBinCount)

    // Animation state
    this.isRunning = false
    this.animationId = null

    // Frequency labels for grid
    this.frequencyLabels = this.generateFrequencyLabels()
  }

  /**
   * Get the analyser node for connecting to audio sources
   * @returns {AnalyserNode} Web Audio API AnalyserNode
   */
  getAnalyserNode() {
    return this.analyser
  }

  /**
   * Start real-time analysis and rendering
   */
  start() {
    if (this.isRunning) return

    this.isRunning = true
    this.render()
  }

  /**
   * Stop real-time analysis
   */
  stop() {
    this.isRunning = false
    if (this.animationId) {
      cancelAnimationFrame(this.animationId)
      this.animationId = null
    }
  }

  /**
   * Update visualization options
   * @param {Object} newOptions - New options to merge
   */
  updateOptions(newOptions) {
    this.options = { ...this.options, ...newOptions }

    // Update analyser properties
    if (newOptions.fftSize) {
      this.analyser.fftSize = newOptions.fftSize
      this.frequencyData = new Uint8Array(this.analyser.frequencyBinCount)
      this.timeData = new Uint8Array(this.analyser.frequencyBinCount)
    }

    if (newOptions.smoothing !== undefined) {
      this.analyser.smoothingTimeConstant = newOptions.smoothing
    }

    if (newOptions.minDb !== undefined) {
      this.analyser.minDecibels = newOptions.minDb
    }

    if (newOptions.maxDb !== undefined) {
      this.analyser.maxDecibels = newOptions.maxDb
    }
  }

  /**
   * Main rendering loop
   * @private
   */
  render() {
    if (!this.isRunning) return

    // Get frequency data
    this.analyser.getByteFrequencyData(this.frequencyData)

    // Clear canvas
    this.ctx.clearRect(0, 0, this.canvas.width, this.canvas.height)

    // Draw spectrum based on style
    switch (this.options.style) {
      case 'bars':
        this.renderBars()
        break
      case 'line':
        this.renderLine()
        break
      case 'filled':
        this.renderFilled()
        break
      default:
        this.renderBars()
    }

    // Draw grid if enabled
    if (this.options.showGrid) {
      this.renderGrid()
    }

    // Schedule next frame
    this.animationId = requestAnimationFrame(() => this.render())
  }

  /**
   * Render frequency bars
   * @private
   */
  renderBars() {
    const width = this.canvas.width
    const height = this.canvas.height
    const barCount = this.frequencyData.length
    const barWidth = (width - (barCount - 1) * this.options.barGap) / barCount

    // Set up color
    if (this.options.gradient) {
      const gradient = this.createGradient()
      this.ctx.fillStyle = gradient
    } else {
      this.ctx.fillStyle = this.options.color
    }

    for (let i = 0; i < barCount; i++) {
      const value = this.frequencyData[i]
      const percent = value / 255
      const barHeight = percent * height

      const x = this.options.logScale
        ? this.getLogPosition(i, barCount, width)
        : i * (barWidth + this.options.barGap)

      this.ctx.fillRect(x, height - barHeight, barWidth, barHeight)
    }
  }

  /**
   * Render frequency line
   * @private
   */
  renderLine() {
    const width = this.canvas.width
    const height = this.canvas.height
    const dataLength = this.frequencyData.length

    this.ctx.strokeStyle = this.options.color
    this.ctx.lineWidth = 2
    this.ctx.beginPath()

    for (let i = 0; i < dataLength; i++) {
      const value = this.frequencyData[i]
      const percent = value / 255
      const y = height - percent * height

      const x = this.options.logScale
        ? this.getLogPosition(i, dataLength, width)
        : (i / dataLength) * width

      if (i === 0) {
        this.ctx.moveTo(x, y)
      } else {
        this.ctx.lineTo(x, y)
      }
    }

    this.ctx.stroke()
  }

  /**
   * Render filled spectrum
   * @private
   */
  renderFilled() {
    const width = this.canvas.width
    const height = this.canvas.height
    const dataLength = this.frequencyData.length

    // Create gradient if specified
    if (this.options.gradient) {
      this.ctx.fillStyle = this.createGradient()
    } else {
      this.ctx.fillStyle = this.options.color
    }

    this.ctx.beginPath()
    this.ctx.moveTo(0, height)

    for (let i = 0; i < dataLength; i++) {
      const value = this.frequencyData[i]
      const percent = value / 255
      const y = height - percent * height

      const x = this.options.logScale
        ? this.getLogPosition(i, dataLength, width)
        : (i / dataLength) * width

      this.ctx.lineTo(x, y)
    }

    this.ctx.lineTo(width, height)
    this.ctx.closePath()
    this.ctx.fill()
  }

  /**
   * Render frequency grid
   * @private
   */
  renderGrid() {
    const width = this.canvas.width
    const height = this.canvas.height

    this.ctx.strokeStyle = 'rgba(255, 255, 255, 0.2)'
    this.ctx.lineWidth = 1
    this.ctx.font = '10px Arial'
    this.ctx.fillStyle = 'rgba(255, 255, 255, 0.7)'

    // Draw frequency lines
    this.frequencyLabels.forEach(({ freq, label, position }) => {
      const x = this.options.logScale
        ? this.getLogFrequencyPosition(freq, width)
        : position * width

      // Draw line
      this.ctx.beginPath()
      this.ctx.moveTo(x, 0)
      this.ctx.lineTo(x, height)
      this.ctx.stroke()

      // Draw label
      this.ctx.fillText(label, x + 2, height - 5)
    })

    // Draw dB lines
    const dbLines = [-80, -60, -40, -20, 0]
    dbLines.forEach((db) => {
      const y = this.dbToY(db, height)

      this.ctx.beginPath()
      this.ctx.moveTo(0, y)
      this.ctx.lineTo(width, y)
      this.ctx.stroke()

      this.ctx.fillText(`${db}dB`, 5, y - 2)
    })
  }

  /**
   * Create color gradient
   * @private
   */
  createGradient() {
    const gradient = this.ctx.createLinearGradient(0, this.canvas.height, 0, 0)
    this.options.gradient.stops.forEach((stop) => {
      gradient.addColorStop(stop.offset, stop.color)
    })
    return gradient
  }

  /**
   * Get logarithmic position for frequency bin
   * @private
   */
  getLogPosition(index, totalBins, width) {
    const nyquist = this.audioContext.sampleRate / 2
    const frequency = (index / totalBins) * nyquist
    return this.getLogFrequencyPosition(frequency, width)
  }

  /**
   * Get logarithmic position for specific frequency
   * @private
   */
  getLogFrequencyPosition(frequency, width) {
    const minFreq = 20
    const maxFreq = this.audioContext.sampleRate / 2
    const minLog = Math.log(minFreq)
    const maxLog = Math.log(maxFreq)
    const freqLog = Math.log(Math.max(frequency, minFreq))

    return ((freqLog - minLog) / (maxLog - minLog)) * width
  }

  /**
   * Convert dB to Y position
   * @private
   */
  dbToY(db, height) {
    const range = this.options.maxDb - this.options.minDb
    const percent = (db - this.options.minDb) / range
    return height - percent * height
  }

  /**
   * Generate frequency labels for grid
   * @private
   */
  generateFrequencyLabels() {
    const frequencies = [50, 100, 200, 500, 1000, 2000, 5000, 10000, 20000]
    const nyquist = this.audioContext.sampleRate / 2

    return frequencies
      .filter((freq) => freq <= nyquist)
      .map((freq) => ({
        freq,
        label: freq >= 1000 ? `${freq / 1000}k` : `${freq}`,
        position: freq / nyquist,
      }))
  }
}

/**
 * Renders static spectrum analysis of audio buffer
 *
 * @param {HTMLCanvasElement} canvas - Target canvas element
 * @param {AudioBuffer} audioBuffer - Audio buffer to analyze
 * @param {SpectrumRenderOptions} [options={}] - Rendering options
 * @returns {Promise<Object>} Analysis result with frequency data
 *
 * @example
 * ```javascript
 * import { renderStaticSpectrum } from './SpectrumAnalyzer.js';
 *
 * const result = await renderStaticSpectrum(canvas, audioBuffer, {
 *   fftSize: 4096,
 *   style: 'filled',
 *   logScale: true
 * });
 *
 * console.log('Peak frequency:', result.peakFrequency);
 * ```
 */
export async function renderStaticSpectrum(canvas, audioBuffer, options = {}) {
  const opts = {
    fftSize: 2048,
    style: 'bars',
    color: '#00ff88',
    logScale: true,
    windowFunction: 'hann',
    ...options,
  }

  // Create offline context for analysis
  const offlineContext = new OfflineAudioContext(
    1,
    audioBuffer.length,
    audioBuffer.sampleRate,
  )
  const source = offlineContext.createBufferSource()
  const analyser = offlineContext.createAnalyser()

  analyser.fftSize = opts.fftSize
  analyser.smoothingTimeConstant = 0

  source.buffer = audioBuffer
  source.connect(analyser)

  // Get FFT data
  const frequencyData = new Uint8Array(analyser.frequencyBinCount)
  const timeData = new Uint8Array(analyser.frequencyBinCount)

  // Trigger analysis
  source.start()
  await offlineContext.startRendering()
  analyser.getByteFrequencyData(frequencyData)

  // Render to canvas
  const ctx = canvas.getContext('2d')
  const width = canvas.width
  const height = canvas.height

  ctx.clearRect(0, 0, width, height)

  // Create analyzer instance for rendering
  const tempAnalyzer = new RealtimeSpectrumAnalyzer(
    canvas,
    { sampleRate: audioBuffer.sampleRate },
    opts,
  )
  tempAnalyzer.frequencyData = frequencyData

  switch (opts.style) {
    case 'bars':
      tempAnalyzer.renderBars()
      break
    case 'line':
      tempAnalyzer.renderLine()
      break
    case 'filled':
      tempAnalyzer.renderFilled()
      break
  }

  // Calculate analysis results
  const peakIndex = frequencyData.indexOf(Math.max(...frequencyData))
  const peakFrequency =
    (peakIndex / frequencyData.length) * (audioBuffer.sampleRate / 2)

  const spectralCentroid = calculateSpectralCentroid(
    frequencyData,
    audioBuffer.sampleRate,
  )
  const spectralRolloff = calculateSpectralRolloff(
    frequencyData,
    audioBuffer.sampleRate,
  )

  return {
    frequencyData: Array.from(frequencyData),
    peakFrequency,
    spectralCentroid,
    spectralRolloff,
    fftSize: opts.fftSize,
    sampleRate: audioBuffer.sampleRate,
  }
}

/**
 * Creates a spectrogram visualization of audio over time
 *
 * @param {HTMLCanvasElement} canvas - Target canvas element
 * @param {AudioBuffer} audioBuffer - Audio buffer to analyze
 * @param {Object} [options={}] - Spectrogram options
 * @returns {Promise<Object>} Spectrogram data and metadata
 *
 * @example
 * ```javascript
 * import { createSpectrogram } from './SpectrumAnalyzer.js';
 *
 * const spectrogram = await createSpectrogram(canvas, audioBuffer, {
 *   fftSize: 2048,
 *   hopLength: 512,
 *   colormap: 'hot'
 * });
 * ```
 */
export async function createSpectrogram(canvas, audioBuffer, options = {}) {
  const opts = {
    fftSize: 2048,
    hopLength: 512,
    colormap: 'viridis',
    minDb: -100,
    maxDb: -10,
    ...options,
  }

  const channelData = audioBuffer.getChannelData(0)
  const sampleRate = audioBuffer.sampleRate
  const numFrames =
    Math.floor((channelData.length - opts.fftSize) / opts.hopLength) + 1
  const numBins = opts.fftSize / 2

  // Create spectrogram data
  const spectrogramData = new Array(numFrames)

  for (let frame = 0; frame < numFrames; frame++) {
    const start = frame * opts.hopLength
    const frameData = channelData.slice(start, start + opts.fftSize)

    // Apply window function (Hann window)
    for (let i = 0; i < frameData.length; i++) {
      const windowValue =
        0.5 * (1 - Math.cos((2 * Math.PI * i) / (frameData.length - 1)))
      frameData[i] *= windowValue
    }

    // Simple FFT approximation (magnitude spectrum)
    const spectrum = new Float32Array(numBins)
    for (let bin = 0; bin < numBins; bin++) {
      let real = 0
      let imag = 0

      for (let n = 0; n < frameData.length; n++) {
        const angle = (-2 * Math.PI * bin * n) / frameData.length
        real += frameData[n] * Math.cos(angle)
        imag += frameData[n] * Math.sin(angle)
      }

      const magnitude = Math.sqrt(real * real + imag * imag)
      spectrum[bin] = 20 * Math.log10(Math.max(magnitude, 1e-10))
    }

    spectrogramData[frame] = spectrum
  }

  // Render spectrogram to canvas
  const ctx = canvas.getContext('2d')
  const width = canvas.width
  const height = canvas.height

  ctx.clearRect(0, 0, width, height)

  const imageData = ctx.createImageData(width, height)
  const data = imageData.data

  for (let x = 0; x < width; x++) {
    const frameIndex = Math.floor((x / width) * numFrames)
    if (frameIndex >= spectrogramData.length) continue

    const spectrum = spectrogramData[frameIndex]

    for (let y = 0; y < height; y++) {
      const binIndex = Math.floor((1 - y / height) * numBins)
      if (binIndex >= spectrum.length) continue

      const db = spectrum[binIndex]
      const normalized = (db - opts.minDb) / (opts.maxDb - opts.minDb)
      const color = getSpectrogramColor(
        Math.max(0, Math.min(1, normalized)),
        opts.colormap,
      )

      const pixelIndex = (y * width + x) * 4
      data[pixelIndex] = color.r
      data[pixelIndex + 1] = color.g
      data[pixelIndex + 2] = color.b
      data[pixelIndex + 3] = 255
    }
  }

  ctx.putImageData(imageData, 0, 0)

  return {
    data: spectrogramData,
    timeFrames: numFrames,
    frequencyBins: numBins,
    hopLength: opts.hopLength,
    sampleRate: sampleRate,
    duration: audioBuffer.duration,
  }
}

// Helper functions

/**
 * Calculate spectral centroid
 * @private
 */
function calculateSpectralCentroid(frequencyData, sampleRate) {
  let weightedSum = 0
  let magnitudeSum = 0

  for (let i = 0; i < frequencyData.length; i++) {
    const frequency = (i / frequencyData.length) * (sampleRate / 2)
    const magnitude = frequencyData[i]

    weightedSum += frequency * magnitude
    magnitudeSum += magnitude
  }

  return magnitudeSum > 0 ? weightedSum / magnitudeSum : 0
}

/**
 * Calculate spectral rolloff (95% of energy)
 * @private
 */
function calculateSpectralRolloff(frequencyData, sampleRate) {
  const totalEnergy = frequencyData.reduce((sum, val) => sum + val * val, 0)
  const threshold = totalEnergy * 0.95

  let cumulativeEnergy = 0

  for (let i = 0; i < frequencyData.length; i++) {
    cumulativeEnergy += frequencyData[i] * frequencyData[i]

    if (cumulativeEnergy >= threshold) {
      return (i / frequencyData.length) * (sampleRate / 2)
    }
  }

  return sampleRate / 2
}

/**
 * Get color for spectrogram visualization
 * @private
 */
function getSpectrogramColor(value, colormap) {
  // Simple colormaps
  switch (colormap) {
    case 'hot':
      if (value < 0.33) {
        return { r: Math.floor(value * 3 * 255), g: 0, b: 0 }
      } else if (value < 0.66) {
        return { r: 255, g: Math.floor((value - 0.33) * 3 * 255), b: 0 }
      } else {
        return { r: 255, g: 255, b: Math.floor((value - 0.66) * 3 * 255) }
      }

    case 'viridis':
      const r = Math.floor(
        255 * (0.267 + 0.105 * value + 0.547 * value * value),
      )
      const g = Math.floor(
        255 * (0.005 + 0.628 * value + 0.367 * value * value),
      )
      const b = Math.floor(255 * (0.329 + 0.751 * value - 0.08 * value * value))
      return { r, g, b }

    default:
      const gray = Math.floor(value * 255)
      return { r: gray, g: gray, b: gray }
  }
}

// Alias for primary export to match expected name in index.js
export const SpectrumAnalyzer = RealtimeSpectrumAnalyzer;
