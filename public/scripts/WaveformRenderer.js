/**
 * WaveformRenderer - Framework-agnostic waveform visualization module
 *
 * Provides pure functions and classes for rendering waveforms to canvas.
 * Works with any framework (Astro, React, Vue, vanilla JS) and supports
 * multiple visualization styles including peaks, bars, and spectrograms.
 *
 * @module WaveformRenderer
 * @author PlecoXA Audio Analysis
 */

/**
 * Waveform rendering configuration
 * @typedef {Object} WaveformRenderOptions
 * @property {string} [style='peaks'] - Rendering style: 'peaks', 'bars', 'line', 'filled'
 * @property {string} [color='#3498db'] - Primary color
 * @property {string} [backgroundColor='transparent'] - Background color
 * @property {number} [lineWidth=1] - Line width for line-style rendering
 * @property {boolean} [mirror=true] - Mirror waveform vertically
 * @property {number} [gap=0] - Gap between bars (for bar style)
 * @property {Object} [gradient=null] - Gradient configuration
 * @property {boolean} [responsive=true] - Auto-resize with canvas
 * @property {number} [pixelRatio=window.devicePixelRatio] - Pixel ratio for HiDPI
 */

/**
 * Loop region configuration
 * @typedef {Object} LoopRegion
 * @property {number} start - Start time in seconds
 * @property {number} end - End time in seconds
 * @property {string} [color='rgba(255,255,0,0.3)'] - Region color
 * @property {string} [borderColor='#ffff00'] - Border color
 * @property {number} [borderWidth=2] - Border width
 */

/**
 * Renders waveform data to a canvas element
 *
 * @param {HTMLCanvasElement} canvas - Target canvas element
 * @param {Float32Array} waveformData - Waveform peak data
 * @param {WaveformRenderOptions} [options={}] - Rendering options
 *
 * @example
 * ```javascript
 * import { renderWaveform } from './WaveformRenderer.js';
 * import { getWaveformPeaks } from './analysis/WaveformData.ts';
 *
 * const canvas = document.getElementById('waveform');
 * const peaks = getWaveformPeaks(audioBuffer, { width: canvas.width });
 *
 * renderWaveform(canvas, peaks.data, {
 *   style: 'filled',
 *   color: '#e74c3c',
 *   mirror: true
 * });
 * ```
 */
export function renderWaveform(canvas, waveformData, options = {}) {
  const opts = {
    style: 'peaks',
    color: '#3498db',
    backgroundColor: 'transparent',
    lineWidth: 1,
    mirror: true,
    gap: 0,
    gradient: null,
    responsive: true,
    pixelRatio: window.devicePixelRatio || 1,
    ...options,
  }

  const ctx = canvas.getContext('2d')
  const width = canvas.width
  const height = canvas.height

  // Set up high DPI rendering
  if (opts.pixelRatio > 1) {
    canvas.style.width = width + 'px'
    canvas.style.height = height + 'px'
    canvas.width = width * opts.pixelRatio
    canvas.height = height * opts.pixelRatio
    ctx.scale(opts.pixelRatio, opts.pixelRatio)
  }

  // Clear canvas
  ctx.clearRect(0, 0, width, height)

  // Draw background
  if (opts.backgroundColor !== 'transparent') {
    ctx.fillStyle = opts.backgroundColor
    ctx.fillRect(0, 0, width, height)
  }

  // Set up rendering style
  const centerY = height / 2
  const maxAmplitude = opts.mirror ? centerY : height

  switch (opts.style) {
    case 'peaks':
      renderPeaks(ctx, waveformData, width, height, centerY, maxAmplitude, opts)
      break
    case 'bars':
      renderBars(ctx, waveformData, width, height, centerY, maxAmplitude, opts)
      break
    case 'line':
      renderLine(ctx, waveformData, width, height, centerY, maxAmplitude, opts)
      break
    case 'filled':
      renderFilled(
        ctx,
        waveformData,
        width,
        height,
        centerY,
        maxAmplitude,
        opts,
      )
      break
    default:
      throw new Error(`Unknown waveform style: ${opts.style}`)
  }
}

/**
 * Renders stereo waveform with separate channels
 *
 * @param {HTMLCanvasElement} canvas - Target canvas element
 * @param {Object} stereoData - Stereo waveform data with left and right properties
 * @param {WaveformRenderOptions} [options={}] - Rendering options
 *
 * @example
 * ```javascript
 * import { renderStereoWaveform } from './WaveformRenderer.js';
 *
 * renderStereoWaveform(canvas, stereoWaveformData, {
 *   leftColor: '#e74c3c',
 *   rightColor: '#3498db',
 *   style: 'filled'
 * });
 * ```
 */
export function renderStereoWaveform(canvas, stereoData, options = {}) {
  const opts = {
    leftColor: '#e74c3c',
    rightColor: '#3498db',
    channelGap: 10,
    ...options,
  }

  const ctx = canvas.getContext('2d')
  const width = canvas.width
  const height = canvas.height
  const channelHeight = (height - opts.channelGap) / 2

  // Clear canvas
  ctx.clearRect(0, 0, width, height)

  // Render left channel (top)
  ctx.save()
  ctx.clipRect(0, 0, width, channelHeight)
  renderWaveform(canvas, stereoData.left.data, {
    ...opts,
    color: opts.leftColor,
    mirror: false,
  })
  ctx.restore()

  // Render right channel (bottom)
  ctx.save()
  ctx.translate(0, channelHeight + opts.channelGap)
  ctx.clipRect(0, 0, width, channelHeight)
  renderWaveform(canvas, stereoData.right.data, {
    ...opts,
    color: opts.rightColor,
    mirror: false,
  })
  ctx.restore()

  // Draw channel separator
  ctx.strokeStyle = '#ddd'
  ctx.lineWidth = 1
  ctx.beginPath()
  ctx.moveTo(0, channelHeight + opts.channelGap / 2)
  ctx.lineTo(width, channelHeight + opts.channelGap / 2)
  ctx.stroke()
}

/**
 * Adds loop region overlays to existing waveform
 *
 * @param {HTMLCanvasElement} canvas - Canvas with existing waveform
 * @param {LoopRegion[]} loops - Array of loop regions to render
 * @param {number} duration - Total audio duration in seconds
 *
 * @example
 * ```javascript
 * import { addLoopRegions } from './WaveformRenderer.js';
 *
 * addLoopRegions(canvas, [
 *   { start: 1.5, end: 3.2, color: 'rgba(255,255,0,0.3)' },
 *   { start: 4.0, end: 6.5, color: 'rgba(0,255,0,0.3)' }
 * ], audioBuffer.duration);
 * ```
 */
export function addLoopRegions(canvas, loops, duration) {
  const ctx = canvas.getContext('2d')
  const width = canvas.width
  const height = canvas.height

  loops.forEach((loop) => {
    const startX = (loop.start / duration) * width
    const endX = (loop.end / duration) * width
    const regionWidth = endX - startX

    // Draw region background
    ctx.fillStyle = loop.color || 'rgba(255,255,0,0.3)'
    ctx.fillRect(startX, 0, regionWidth, height)

    // Draw region borders
    ctx.strokeStyle = loop.borderColor || '#ffff00'
    ctx.lineWidth = loop.borderWidth || 2
    ctx.beginPath()
    ctx.moveTo(startX, 0)
    ctx.lineTo(startX, height)
    ctx.moveTo(endX, 0)
    ctx.lineTo(endX, height)
    ctx.stroke()
  })
}

/**
 * Creates an interactive waveform renderer with events
 *
 * @param {HTMLCanvasElement} canvas - Target canvas element
 * @param {Object} [options={}] - Renderer configuration
 * @returns {Object} Interactive renderer instance
 *
 * @example
 * ```javascript
 * import { createInteractiveRenderer } from './WaveformRenderer.js';
 *
 * const renderer = createInteractiveRenderer(canvas, {
 *   enableSelection: true,
 *   enableZoom: true
 * });
 *
 * renderer.on('select', (start, end) => {
 *   console.log(`Selected: ${start}s - ${end}s`);
 * });
 *
 * renderer.render(waveformData);
 * ```
 */
export function createInteractiveRenderer(canvas, options = {}) {
  const opts = {
    enableSelection: true,
    enableZoom: false,
    enablePlayhead: true,
    ...options,
  }

  let isSelecting = false
  let selectionStart = 0
  let selectionEnd = 0
  let playheadPosition = 0
  let currentWaveform = null
  let duration = 0

  const eventListeners = {}

  // Event handling
  function emit(event, ...args) {
    if (eventListeners[event]) {
      eventListeners[event].forEach((callback) => callback(...args))
    }
  }

  function on(event, callback) {
    if (!eventListeners[event]) {
      eventListeners[event] = []
    }
    eventListeners[event].push(callback)
  }

  function off(event, callback) {
    if (eventListeners[event]) {
      const index = eventListeners[event].indexOf(callback)
      if (index > -1) {
        eventListeners[event].splice(index, 1)
      }
    }
  }

  // Mouse event handlers
  function handleMouseDown(e) {
    if (!opts.enableSelection) return

    const rect = canvas.getBoundingClientRect()
    const x = e.clientX - rect.left
    const time = (x / canvas.width) * duration

    isSelecting = true
    selectionStart = time
    selectionEnd = time

    emit('selectionStart', time)
  }

  function handleMouseMove(e) {
    const rect = canvas.getBoundingClientRect()
    const x = e.clientX - rect.left
    const time = (x / canvas.width) * duration

    if (isSelecting) {
      selectionEnd = time
      render(currentWaveform, { preserveSelection: true })
      emit(
        'selectionChange',
        Math.min(selectionStart, selectionEnd),
        Math.max(selectionStart, selectionEnd),
      )
    }

    emit('hover', time)
  }

  function handleMouseUp(e) {
    if (!isSelecting) return

    isSelecting = false
    const start = Math.min(selectionStart, selectionEnd)
    const end = Math.max(selectionStart, selectionEnd)

    if (Math.abs(end - start) > 0.01) {
      // Minimum selection threshold
      emit('select', start, end)
    } else {
      emit('click', start)
    }
  }

  // Add event listeners
  canvas.addEventListener('mousedown', handleMouseDown)
  canvas.addEventListener('mousemove', handleMouseMove)
  canvas.addEventListener('mouseup', handleMouseUp)
  canvas.addEventListener('mouseleave', () => {
    isSelecting = false
  })

  // Render function
  function render(waveformData, renderOptions = {}) {
    if (!waveformData) return

    currentWaveform = waveformData

    // Render base waveform
    renderWaveform(canvas, waveformData.data || waveformData, {
      ...opts,
      ...renderOptions,
    })

    // Add selection overlay
    if (
      opts.enableSelection &&
      (isSelecting || renderOptions.preserveSelection)
    ) {
      const ctx = canvas.getContext('2d')
      const startX =
        (Math.min(selectionStart, selectionEnd) / duration) * canvas.width
      const endX =
        (Math.max(selectionStart, selectionEnd) / duration) * canvas.width

      ctx.fillStyle = 'rgba(255, 255, 255, 0.3)'
      ctx.fillRect(startX, 0, endX - startX, canvas.height)

      ctx.strokeStyle = '#fff'
      ctx.lineWidth = 2
      ctx.beginPath()
      ctx.moveTo(startX, 0)
      ctx.lineTo(startX, canvas.height)
      ctx.moveTo(endX, 0)
      ctx.lineTo(endX, canvas.height)
      ctx.stroke()
    }

    // Add playhead
    if (opts.enablePlayhead && playheadPosition > 0) {
      const ctx = canvas.getContext('2d')
      const x = (playheadPosition / duration) * canvas.width

      ctx.strokeStyle = '#ff0000'
      ctx.lineWidth = 2
      ctx.beginPath()
      ctx.moveTo(x, 0)
      ctx.lineTo(x, canvas.height)
      ctx.stroke()
    }
  }

  function setPlayheadPosition(time) {
    playheadPosition = time
    if (currentWaveform) {
      render(currentWaveform)
    }
  }

  function setDuration(newDuration) {
    duration = newDuration
  }

  function getSelection() {
    return {
      start: Math.min(selectionStart, selectionEnd),
      end: Math.max(selectionStart, selectionEnd),
    }
  }

  function clearSelection() {
    selectionStart = 0
    selectionEnd = 0
    if (currentWaveform) {
      render(currentWaveform)
    }
  }

  // Cleanup function
  function destroy() {
    canvas.removeEventListener('mousedown', handleMouseDown)
    canvas.removeEventListener('mousemove', handleMouseMove)
    canvas.removeEventListener('mouseup', handleMouseUp)
  }

  return {
    render,
    on,
    off,
    setPlayheadPosition,
    setDuration,
    getSelection,
    clearSelection,
    destroy,
  }
}

// Private rendering functions

/**
 * Render peaks style waveform
 * @private
 */
function renderPeaks(ctx, data, width, height, centerY, maxAmplitude, opts) {
  const barWidth = width / data.length

  ctx.fillStyle = opts.color

  for (let i = 0; i < data.length; i++) {
    const amplitude = Math.abs(data[i]) * maxAmplitude
    const x = i * barWidth

    if (opts.mirror) {
      ctx.fillRect(x, centerY - amplitude, barWidth, amplitude * 2)
    } else {
      ctx.fillRect(x, height - amplitude, barWidth, amplitude)
    }
  }
}

/**
 * Render bars style waveform
 * @private
 */
function renderBars(ctx, data, width, height, centerY, maxAmplitude, opts) {
  const totalGaps = (data.length - 1) * opts.gap
  const barWidth = (width - totalGaps) / data.length

  ctx.fillStyle = opts.color

  for (let i = 0; i < data.length; i++) {
    const amplitude = Math.abs(data[i]) * maxAmplitude
    const x = i * (barWidth + opts.gap)

    if (opts.mirror) {
      ctx.fillRect(x, centerY - amplitude, barWidth, amplitude * 2)
    } else {
      ctx.fillRect(x, height - amplitude, barWidth, amplitude)
    }
  }
}

/**
 * Render line style waveform
 * @private
 */
function renderLine(ctx, data, width, height, centerY, maxAmplitude, opts) {
  ctx.strokeStyle = opts.color
  ctx.lineWidth = opts.lineWidth
  ctx.lineCap = 'round'
  ctx.lineJoin = 'round'

  ctx.beginPath()

  for (let i = 0; i < data.length; i++) {
    const x = (i / (data.length - 1)) * width
    const amplitude = data[i] * maxAmplitude
    const y = opts.mirror ? centerY - amplitude : height - amplitude

    if (i === 0) {
      ctx.moveTo(x, y)
    } else {
      ctx.lineTo(x, y)
    }
  }

  ctx.stroke()
}

/**
 * Render filled style waveform
 * @private
 */
function renderFilled(ctx, data, width, height, centerY, maxAmplitude, opts) {
  // Create gradient if specified
  if (opts.gradient) {
    const gradient = ctx.createLinearGradient(0, 0, 0, height)
    opts.gradient.stops.forEach((stop) => {
      gradient.addColorStop(stop.offset, stop.color)
    })
    ctx.fillStyle = gradient
  } else {
    ctx.fillStyle = opts.color
  }

  ctx.beginPath()

  // Start from bottom-left
  ctx.moveTo(0, opts.mirror ? centerY : height)

  // Draw top edge
  for (let i = 0; i < data.length; i++) {
    const x = (i / (data.length - 1)) * width
    const amplitude = Math.abs(data[i]) * maxAmplitude
    const y = opts.mirror ? centerY - amplitude : height - amplitude
    ctx.lineTo(x, y)
  }

  // Complete the shape
  ctx.lineTo(width, opts.mirror ? centerY : height)
  ctx.closePath()
  ctx.fill()

  // Mirror bottom half if enabled
  if (opts.mirror) {
    ctx.beginPath()
    ctx.moveTo(0, centerY)

    for (let i = 0; i < data.length; i++) {
      const x = (i / (data.length - 1)) * width
      const amplitude = Math.abs(data[i]) * maxAmplitude
      const y = centerY + amplitude
      ctx.lineTo(x, y)
    }

    ctx.lineTo(width, centerY)
    ctx.closePath()
    ctx.fill()
  }
}

// Alias for primary export to match expected name in index.js
export const WaveformRenderer = renderWaveform;
