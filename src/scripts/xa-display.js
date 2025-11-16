/**
 * Port of librosa.display
 * Canvas-based audio visualization utilities for browser environments
 * Librosa-compatible display functions adapted for JavaScript/Canvas API
 */

/**
 * Colormap configurations for different data types
 */
const COLORMAP_CONFIGS = {
  sequential: {
    magma: [
      [0, 0, 4], [6, 4, 24], [26, 11, 56], [54, 14, 81], [84, 13, 94],
      [113, 15, 98], [141, 23, 96], [167, 36, 89], [190, 54, 79], [209, 76, 67],
      [224, 102, 56], [235, 131, 48], [243, 163, 46], [249, 197, 62], [252, 232, 112], [252, 253, 191]
    ],
    viridis: [
      [68, 1, 84], [72, 35, 116], [64, 67, 135], [52, 94, 141], [41, 120, 142],
      [32, 144, 140], [34, 167, 132], [68, 190, 112], [121, 209, 81], [189, 223, 38], [253, 231, 37]
    ],
    plasma: [
      [13, 8, 135], [75, 3, 161], [125, 3, 168], [168, 34, 150], [203, 70, 121],
      [229, 107, 93], [248, 148, 65], [253, 195, 40], [240, 249, 33]
    ],
    inferno: [
      [0, 0, 4], [20, 11, 53], [58, 15, 87], [99, 19, 96], [139, 22, 89],
      [177, 32, 74], [209, 55, 55], [232, 87, 37], [246, 126, 22], [252, 172, 16],
      [246, 215, 70], [252, 255, 164]
    ],
    coolwarm: [
      [59, 76, 192], [98, 130, 234], [156, 181, 251], [207, 219, 252], [247, 244, 236],
      [253, 219, 199], [244, 165, 130], [214, 96, 77], [178, 24, 43], [103, 0, 31]
    ]
  },
  boolean: {
    gray: [[0, 0, 0], [255, 255, 255]],
    gray_r: [[255, 255, 255], [0, 0, 0]]
  },
  diverging: {
    coolwarm: [
      [59, 76, 192], [98, 130, 234], [156, 181, 251], [207, 219, 252], [247, 244, 236],
      [253, 219, 199], [244, 165, 130], [214, 96, 77], [178, 24, 43], [103, 0, 31]
    ],
    bwr: [
      [0, 0, 255], [127, 127, 255], [255, 255, 255], [255, 127, 127], [255, 0, 0]
    ],
    seismic: [
      [0, 0, 76], [0, 0, 255], [127, 127, 255], [255, 255, 255],
      [255, 127, 127], [255, 0, 0], [127, 0, 0]
    ]
  }
};

/**
 * Get a default colormap from the given data
 *
 * Determines an appropriate colormap based on data characteristics:
 * - Sequential colormaps for non-negative data
 * - Boolean colormaps for binary data
 * - Diverging colormaps for centered data
 *
 * @param {Float32Array|Array|Array<Array<number>>} data - Input data (1D or 2D array)
 * @param {boolean} robust - If true, use 2nd/98th percentiles for range detection
 * @param {string} cmapSeq - Sequential colormap name (default: 'magma')
 * @param {string} cmapBool - Boolean colormap name (default: 'gray_r')
 * @param {string} cmapDiv - Diverging colormap name (default: 'coolwarm')
 * @returns {Object} Colormap configuration with {type, name, colors, map function}
 *
 * @example
 * // Sequential data (spectrogram)
 * const spec = new Float32Array([0.1, 0.5, 0.9, 1.2]);
 * const cmap = cmap(spec);  // Returns 'magma' sequential colormap
 *
 * @example
 * // Centered data (chromagram difference)
 * const diff = new Float32Array([-1.0, -0.5, 0.0, 0.5, 1.0]);
 * const cmap = cmap(diff, true, 'magma', 'gray_r', 'coolwarm');  // Returns 'coolwarm' diverging
 */
export function cmap(data, robust = true, cmapSeq = 'magma', cmapBool = 'gray_r', cmapDiv = 'coolwarm') {
  if (!data || (Array.isArray(data) && data.length === 0)) {
    throw new Error('cmap: data must be a non-empty array');
  }

  // Flatten 2D arrays to 1D for analysis
  let flatData;
  if (Array.isArray(data) && Array.isArray(data[0])) {
    flatData = data.flat();
  } else if (data instanceof Float32Array || data instanceof Float64Array || Array.isArray(data)) {
    flatData = Array.from(data);
  } else {
    throw new TypeError('cmap: data must be an array or typed array');
  }

  // Filter out NaN and Infinity values
  const validData = flatData.filter(v => Number.isFinite(v));

  if (validData.length === 0) {
    throw new Error('cmap: data contains no valid finite values');
  }

  // Determine data range
  let dataMin, dataMax;

  if (robust) {
    // Use 2nd and 98th percentiles for robust range estimation
    const sorted = [...validData].sort((a, b) => a - b);
    const p2Index = Math.floor(sorted.length * 0.02);
    const p98Index = Math.floor(sorted.length * 0.98);
    dataMin = sorted[p2Index];
    dataMax = sorted[p98Index];
  } else {
    dataMin = Math.min(...validData);
    dataMax = Math.max(...validData);
  }

  // Determine colormap type based on data characteristics
  const uniqueValues = new Set(validData.filter(v => v === 0 || v === 1));
  const isBinary = uniqueValues.size <= 2 && validData.every(v => v === 0 || v === 1);

  // Check if data is centered around zero (diverging)
  const threshold = (dataMax - dataMin) * 0.05;
  const isCentered = Math.abs(dataMin + dataMax) < threshold && dataMin < 0 && dataMax > 0;

  let mapType, mapName, colors;

  if (isBinary) {
    mapType = 'boolean';
    mapName = cmapBool;
    colors = COLORMAP_CONFIGS.boolean[cmapBool] || COLORMAP_CONFIGS.boolean.gray_r;
  } else if (isCentered) {
    mapType = 'diverging';
    mapName = cmapDiv;
    colors = COLORMAP_CONFIGS.diverging[cmapDiv] || COLORMAP_CONFIGS.diverging.coolwarm;
  } else {
    mapType = 'sequential';
    mapName = cmapSeq;
    colors = COLORMAP_CONFIGS.sequential[cmapSeq] || COLORMAP_CONFIGS.sequential.magma;
  }

  // Create color interpolation function
  const interpolateColor = (value, vmin, vmax) => {
    // Normalize value to [0, 1]
    const normalized = Math.max(0, Math.min(1, (value - vmin) / (vmax - vmin)));

    // Find color position in gradient
    const colorIndex = normalized * (colors.length - 1);
    const lowerIndex = Math.floor(colorIndex);
    const upperIndex = Math.ceil(colorIndex);
    const t = colorIndex - lowerIndex;

    const color1 = colors[lowerIndex];
    const color2 = colors[upperIndex];

    // Linear interpolation between colors
    const r = Math.round(color1[0] + (color2[0] - color1[0]) * t);
    const g = Math.round(color1[1] + (color2[1] - color1[1]) * t);
    const b = Math.round(color1[2] + (color2[2] - color1[2]) * t);

    return `rgb(${r}, ${g}, ${b})`;
  };

  return {
    type: mapType,
    name: mapName,
    colors: colors,
    vmin: dataMin,
    vmax: dataMax,
    map: (value) => interpolateColor(value, dataMin, dataMax),
    // Generate CSS gradient string
    toCSSGradient: () => {
      const stops = colors.map((c, i) => {
        const pct = (i / (colors.length - 1)) * 100;
        return `rgb(${c[0]}, ${c[1]}, ${c[2]}) ${pct}%`;
      });
      return `linear-gradient(to right, ${stops.join(', ')})`;
    }
  };
}

/**
 * Display a spectrogram/chromagram/CQT/etc on a Canvas element
 *
 * Renders time-frequency data (spectrograms, chromagrams, CQT, etc.) to a Canvas
 * with appropriate scaling, colormaps, and axis labels.
 *
 * @param {Array<Array<number>>|Float32Array} S - 2D spectrogram data [frequency, time]
 * @param {Object} options - Display options
 * @param {HTMLCanvasElement} options.canvas - Target canvas element (required)
 * @param {number} options.sr - Sample rate in Hz (default: 22050)
 * @param {number} options.hopLength - Hop length in samples (default: 512)
 * @param {string} options.xAxis - X-axis type: 'time', 'frames', 's', 'ms' (default: 'time')
 * @param {string} options.yAxis - Y-axis type: 'linear', 'log', 'mel', 'cqt_hz', 'cqt_note' (default: 'linear')
 * @param {string} options.cmap - Colormap name (default: 'magma')
 * @param {number} options.fmin - Minimum frequency for y-axis (default: 0)
 * @param {number} options.fmax - Maximum frequency for y-axis (default: sr/2)
 * @param {number} options.vmin - Minimum value for colormap (default: auto)
 * @param {number} options.vmax - Maximum value for colormap (default: auto)
 * @param {boolean} options.drawAxes - Draw axis labels and ticks (default: true)
 * @param {boolean} options.drawColorbar - Draw colorbar legend (default: false)
 * @returns {CanvasRenderingContext2D} Canvas 2D context with rendered spectrogram
 *
 * @example
 * // Display mel spectrogram
 * const canvas = document.getElementById('spec-canvas');
 * const S = melspectrogram(y, sr, { nMels: 128 });
 * specshow(S, {
 *   canvas: canvas,
 *   sr: 22050,
 *   hopLength: 512,
 *   yAxis: 'mel',
 *   cmap: 'magma'
 * });
 */
export function specshow(S, options = {}) {
  const {
    canvas,
    sr = 22050,
    hopLength = 512,
    xAxis = 'time',
    yAxis = 'linear',
    cmap: cmapName = 'magma',
    fmin = 0,
    fmax = sr / 2,
    vmin = null,
    vmax = null,
    drawAxes = true,
    drawColorbar = false
  } = options;

  if (!canvas || !(canvas instanceof HTMLCanvasElement)) {
    throw new Error('specshow: canvas option must be an HTMLCanvasElement');
  }

  if (!S || !Array.isArray(S) || S.length === 0) {
    throw new Error('specshow: S must be a non-empty 2D array');
  }

  const ctx = canvas.getContext('2d');
  if (!ctx) {
    throw new Error('specshow: failed to get 2D context from canvas');
  }

  // Get dimensions
  const numFreqBins = S.length;
  const numTimeFrames = S[0].length;

  // Flatten data for colormap determination
  const flatData = S.flat();

  // Get colormap
  const colormap = cmap(flatData, true, cmapName, 'gray_r', 'coolwarm');

  // Override vmin/vmax if specified
  const valueMin = vmin !== null ? vmin : colormap.vmin;
  const valueMax = vmax !== null ? vmax : colormap.vmax;

  // Set canvas size if not set
  if (canvas.width === 0) canvas.width = 800;
  if (canvas.height === 0) canvas.height = 400;

  const width = canvas.width;
  const height = canvas.height;

  // Reserve space for axes
  const marginLeft = drawAxes ? 60 : 10;
  const marginRight = drawColorbar ? 80 : 10;
  const marginTop = drawAxes ? 20 : 10;
  const marginBottom = drawAxes ? 50 : 10;

  const plotWidth = width - marginLeft - marginRight;
  const plotHeight = height - marginTop - marginBottom;

  // Clear canvas
  ctx.fillStyle = '#ffffff';
  ctx.fillRect(0, 0, width, height);

  // Draw spectrogram
  const cellWidth = plotWidth / numTimeFrames;
  const cellHeight = plotHeight / numFreqBins;

  for (let t = 0; t < numTimeFrames; t++) {
    for (let f = 0; f < numFreqBins; f++) {
      const value = S[f][t];
      const color = colormap.map(value);

      ctx.fillStyle = color;

      const x = marginLeft + t * cellWidth;
      // Flip y-axis (frequency increases upward)
      const y = marginTop + (numFreqBins - 1 - f) * cellHeight;

      ctx.fillRect(x, y, Math.ceil(cellWidth) + 1, Math.ceil(cellHeight) + 1);
    }
  }

  // Draw axes if requested
  if (drawAxes) {
    ctx.strokeStyle = '#000000';
    ctx.fillStyle = '#000000';
    ctx.font = '12px sans-serif';
    ctx.lineWidth = 1;

    // Draw axes box
    ctx.strokeRect(marginLeft, marginTop, plotWidth, plotHeight);

    // X-axis label
    const duration = (numTimeFrames * hopLength) / sr;
    ctx.textAlign = 'center';
    ctx.fillText(xAxis === 'frames' ? 'Frames' : 'Time (s)',
                 marginLeft + plotWidth / 2,
                 height - 10);

    // X-axis ticks
    const numXTicks = 5;
    for (let i = 0; i <= numXTicks; i++) {
      const x = marginLeft + (plotWidth * i) / numXTicks;
      const value = xAxis === 'frames'
        ? Math.round((numTimeFrames * i) / numXTicks)
        : ((duration * i) / numXTicks).toFixed(1);

      ctx.textAlign = 'center';
      ctx.fillText(value, x, height - 30);

      // Tick mark
      ctx.beginPath();
      ctx.moveTo(x, marginTop + plotHeight);
      ctx.lineTo(x, marginTop + plotHeight + 5);
      ctx.stroke();
    }

    // Y-axis label
    ctx.save();
    ctx.translate(15, marginTop + plotHeight / 2);
    ctx.rotate(-Math.PI / 2);
    ctx.textAlign = 'center';
    ctx.fillText(yAxis === 'mel' ? 'Mel Frequency' : 'Frequency (Hz)', 0, 0);
    ctx.restore();

    // Y-axis ticks
    const numYTicks = 5;
    for (let i = 0; i <= numYTicks; i++) {
      const y = marginTop + (plotHeight * i) / numYTicks;
      const freqValue = fmin + (fmax - fmin) * (1 - i / numYTicks);
      const label = freqValue >= 1000
        ? `${(freqValue / 1000).toFixed(1)}k`
        : Math.round(freqValue).toString();

      ctx.textAlign = 'right';
      ctx.fillText(label, marginLeft - 10, y + 4);

      // Tick mark
      ctx.beginPath();
      ctx.moveTo(marginLeft - 5, y);
      ctx.lineTo(marginLeft, y);
      ctx.stroke();
    }
  }

  // Draw colorbar if requested
  if (drawColorbar) {
    const barWidth = 20;
    const barHeight = plotHeight;
    const barX = width - marginRight + 20;
    const barY = marginTop;

    // Draw color gradient
    for (let i = 0; i < barHeight; i++) {
      const value = valueMin + (valueMax - valueMin) * (1 - i / barHeight);
      ctx.fillStyle = colormap.map(value);
      ctx.fillRect(barX, barY + i, barWidth, 1);
    }

    // Draw colorbar border
    ctx.strokeStyle = '#000000';
    ctx.strokeRect(barX, barY, barWidth, barHeight);

    // Draw colorbar labels
    ctx.fillStyle = '#000000';
    ctx.font = '10px sans-serif';
    ctx.textAlign = 'left';

    const numColorTicks = 5;
    for (let i = 0; i <= numColorTicks; i++) {
      const y = barY + (barHeight * i) / numColorTicks;
      const value = valueMax - (valueMax - valueMin) * (i / numColorTicks);
      ctx.fillText(value.toFixed(1), barX + barWidth + 5, y + 4);
    }
  }

  return ctx;
}

/**
 * Visualize a waveform in the time domain on a Canvas element
 *
 * Renders audio waveform with envelope display and optional decimation
 * for efficient display of long audio files.
 *
 * @param {Float32Array|Array<number>} y - Audio time series
 * @param {Object} options - Display options
 * @param {HTMLCanvasElement} options.canvas - Target canvas element (required)
 * @param {number} options.sr - Sample rate in Hz (default: 22050)
 * @param {number} options.maxPoints - Maximum number of points to display (default: 11025)
 * @param {string} options.xAxis - X-axis type: 'time', 'samples', 's', 'ms' (default: 'time')
 * @param {number} options.offset - Time offset in seconds (default: 0.0)
 * @param {string} options.color - Waveform color (default: '#1f77b4')
 * @param {number} options.alpha - Transparency (0-1, default: 0.7)
 * @param {boolean} options.envelope - Show envelope for decimated display (default: true)
 * @param {boolean} options.drawAxes - Draw axis labels and ticks (default: true)
 * @returns {CanvasRenderingContext2D} Canvas 2D context with rendered waveform
 *
 * @example
 * // Display waveform
 * const canvas = document.getElementById('wave-canvas');
 * const y = new Float32Array(audioBuffer.getChannelData(0));
 * waveshow(y, {
 *   canvas: canvas,
 *   sr: 44100,
 *   color: '#2ca02c',
 *   envelope: true
 * });
 */
export function waveshow(y, options = {}) {
  const {
    canvas,
    sr = 22050,
    maxPoints = 11025,
    xAxis = 'time',
    offset = 0.0,
    color = '#1f77b4',
    alpha = 0.7,
    envelope = true,
    drawAxes = true
  } = options;

  if (!canvas || !(canvas instanceof HTMLCanvasElement)) {
    throw new Error('waveshow: canvas option must be an HTMLCanvasElement');
  }

  if (!y || (!Array.isArray(y) && !(y instanceof Float32Array) && !(y instanceof Float64Array))) {
    throw new Error('waveshow: y must be an array or typed array');
  }

  const ctx = canvas.getContext('2d');
  if (!ctx) {
    throw new Error('waveshow: failed to get 2D context from canvas');
  }

  // Set canvas size if not set
  if (canvas.width === 0) canvas.width = 800;
  if (canvas.height === 0) canvas.height = 300;

  const width = canvas.width;
  const height = canvas.height;

  // Reserve space for axes
  const marginLeft = drawAxes ? 60 : 10;
  const marginRight = 10;
  const marginTop = 20;
  const marginBottom = drawAxes ? 50 : 10;

  const plotWidth = width - marginLeft - marginRight;
  const plotHeight = height - marginTop - marginBottom;
  const centerY = marginTop + plotHeight / 2;

  // Clear canvas
  ctx.fillStyle = '#ffffff';
  ctx.fillRect(0, 0, width, height);

  const numSamples = y.length;
  const duration = numSamples / sr;

  // Determine if we need to decimate
  const hop = Math.ceil(numSamples / maxPoints);
  const needsDecimation = hop > 1;

  // Draw waveform
  ctx.strokeStyle = color;
  ctx.globalAlpha = alpha;
  ctx.lineWidth = 1;

  if (needsDecimation && envelope) {
    // Draw envelope (max/min over each hop)
    ctx.fillStyle = color;

    for (let i = 0; i < maxPoints; i++) {
      const startIdx = i * hop;
      const endIdx = Math.min(startIdx + hop, numSamples);

      if (startIdx >= numSamples) break;

      // Find min and max in this window
      let minVal = y[startIdx];
      let maxVal = y[startIdx];

      for (let j = startIdx; j < endIdx; j++) {
        minVal = Math.min(minVal, y[j]);
        maxVal = Math.max(maxVal, y[j]);
      }

      const x = marginLeft + (i / maxPoints) * plotWidth;
      const yMin = centerY - (minVal * plotHeight) / 2;
      const yMax = centerY - (maxVal * plotHeight) / 2;

      ctx.fillRect(x, yMax, Math.max(1, plotWidth / maxPoints), yMin - yMax);
    }
  } else {
    // Draw direct waveform
    ctx.beginPath();

    for (let i = 0; i < numSamples; i += hop) {
      const x = marginLeft + (i / numSamples) * plotWidth;
      const yVal = centerY - (y[i] * plotHeight) / 2;

      if (i === 0) {
        ctx.moveTo(x, yVal);
      } else {
        ctx.lineTo(x, yVal);
      }
    }

    ctx.stroke();
  }

  ctx.globalAlpha = 1.0;

  // Draw axes if requested
  if (drawAxes) {
    ctx.strokeStyle = '#000000';
    ctx.fillStyle = '#000000';
    ctx.font = '12px sans-serif';
    ctx.lineWidth = 1;

    // Draw center line (zero amplitude)
    ctx.strokeStyle = '#cccccc';
    ctx.beginPath();
    ctx.moveTo(marginLeft, centerY);
    ctx.lineTo(marginLeft + plotWidth, centerY);
    ctx.stroke();

    // Draw axes box
    ctx.strokeStyle = '#000000';
    ctx.strokeRect(marginLeft, marginTop, plotWidth, plotHeight);

    // X-axis label
    ctx.textAlign = 'center';
    ctx.fillText(xAxis === 'samples' ? 'Samples' : 'Time (s)',
                 marginLeft + plotWidth / 2,
                 height - 10);

    // X-axis ticks
    const numXTicks = 5;
    for (let i = 0; i <= numXTicks; i++) {
      const x = marginLeft + (plotWidth * i) / numXTicks;
      const timeValue = offset + (duration * i) / numXTicks;
      const value = xAxis === 'samples'
        ? Math.round((numSamples * i) / numXTicks)
        : timeValue.toFixed(2);

      ctx.textAlign = 'center';
      ctx.fillText(value, x, height - 30);

      // Tick mark
      ctx.beginPath();
      ctx.moveTo(x, marginTop + plotHeight);
      ctx.lineTo(x, marginTop + plotHeight + 5);
      ctx.stroke();
    }

    // Y-axis label
    ctx.save();
    ctx.translate(15, centerY);
    ctx.rotate(-Math.PI / 2);
    ctx.textAlign = 'center';
    ctx.fillText('Amplitude', 0, 0);
    ctx.restore();

    // Y-axis ticks
    const ampTicks = [-1.0, -0.5, 0.0, 0.5, 1.0];
    for (const amp of ampTicks) {
      const y = centerY - (amp * plotHeight) / 2;

      ctx.textAlign = 'right';
      ctx.fillText(amp.toFixed(1), marginLeft - 10, y + 4);

      // Tick mark
      ctx.beginPath();
      ctx.moveTo(marginLeft - 5, y);
      ctx.lineTo(marginLeft, y);
      ctx.stroke();
    }
  }

  return ctx;
}

/**
 * Display adaptor class for connecting canvas updates to event callbacks
 * Mimics Matplotlib's event connection system for interactive canvas displays
 */
class DisplayAdaptor {
  constructor(canvas) {
    if (!canvas || !(canvas instanceof HTMLCanvasElement)) {
      throw new Error('DisplayAdaptor: canvas must be an HTMLCanvasElement');
    }

    this.canvas = canvas;
    this.callbacks = new Map();
    this.connected = false;
  }

  /**
   * Connect the adaptor to a signal/event on the canvas
   *
   * @param {HTMLCanvasElement} canvas - Canvas element (for API compatibility)
   * @param {string} signal - Event type: 'resize', 'zoom', 'pan', 'xlim_changed', 'ylim_changed'
   * @returns {void}
   *
   * @example
   * const adaptor = new DisplayAdaptor(canvas);
   * adaptor.connect(canvas, 'resize');
   */
  connect(canvas, signal = 'resize') {
    if (this.connected) {
      console.warn('DisplayAdaptor: already connected, disconnecting first');
      this.disconnect();
    }

    // Map librosa/matplotlib signals to browser events
    const eventMap = {
      'xlim_changed': 'zoom',
      'ylim_changed': 'zoom',
      'resize': 'resize',
      'zoom': 'wheel',
      'pan': 'mousemove'
    };

    const browserEvent = eventMap[signal] || signal;

    // Create callback wrapper
    const callback = (event) => {
      this.update(canvas, event);
    };

    // Store callback reference for later disconnection
    this.callbacks.set(signal, { browserEvent, callback });

    // Add event listener
    if (browserEvent === 'resize') {
      window.addEventListener('resize', callback);
    } else {
      this.canvas.addEventListener(browserEvent, callback);
    }

    this.connected = true;
  }

  /**
   * Disconnect the adaptor's update callback
   *
   * @param {boolean} strict - If true, throw error if not connected
   * @returns {void}
   *
   * @example
   * adaptor.disconnect();
   */
  disconnect(strict = false) {
    if (!this.connected && strict) {
      throw new Error('DisplayAdaptor: not connected, cannot disconnect');
    }

    // Remove all event listeners
    for (const [signal, { browserEvent, callback }] of this.callbacks) {
      if (browserEvent === 'resize') {
        window.removeEventListener('resize', callback);
      } else {
        this.canvas.removeEventListener(browserEvent, callback);
      }
    }

    this.callbacks.clear();
    this.connected = false;
  }

  /**
   * Update the canvas display according to the current viewport/event
   *
   * This is a callback that should be overridden by subclasses or
   * attached as a custom handler.
   *
   * @param {HTMLCanvasElement} canvas - Canvas element
   * @param {Event} event - Browser event that triggered update
   * @returns {void}
   *
   * @example
   * adaptor.update = (canvas, event) => {
   *   // Custom redraw logic
   *   const ctx = canvas.getContext('2d');
   *   ctx.clearRect(0, 0, canvas.width, canvas.height);
   *   // Redraw content...
   * };
   */
  update(canvas, event) {
    // Default implementation - override this in subclasses
    console.log('DisplayAdaptor.update called:', event.type);

    // Example: Handle resize
    if (event.type === 'resize') {
      const container = canvas.parentElement;
      if (container) {
        canvas.width = container.clientWidth;
        canvas.height = container.clientHeight;
      }
    }
  }

  /**
   * Check if adaptor is currently connected
   * @returns {boolean}
   */
  isConnected() {
    return this.connected;
  }
}

/**
 * Connect a canvas display to an event callback
 *
 * Creates a DisplayAdaptor and connects it to the specified event signal.
 * Returns the adaptor for further customization.
 *
 * @param {HTMLCanvasElement} canvas - Target canvas element
 * @param {string} signal - Event signal name (default: 'resize')
 * @param {Function} updateCallback - Custom update callback (optional)
 * @returns {DisplayAdaptor} Connected display adaptor instance
 *
 * @example
 * // Auto-resize canvas on window resize
 * const adaptor = connect(canvas, 'resize', (canvas, event) => {
 *   // Redraw spectrogram on resize
 *   specshow(spectrogramData, { canvas });
 * });
 */
export function connect(canvas, signal = 'resize', updateCallback = null) {
  const adaptor = new DisplayAdaptor(canvas);

  if (updateCallback) {
    adaptor.update = updateCallback;
  }

  adaptor.connect(canvas, signal);

  return adaptor;
}

/**
 * Disconnect a display adaptor's event callback
 *
 * @param {DisplayAdaptor} adaptor - Display adaptor to disconnect
 * @param {boolean} strict - If true, throw error if not connected (default: false)
 * @returns {void}
 *
 * @example
 * const adaptor = connect(canvas, 'resize');
 * // ... later ...
 * disconnect(adaptor);
 */
export function disconnect(adaptor, strict = false) {
  if (!adaptor || !(adaptor instanceof DisplayAdaptor)) {
    throw new TypeError('disconnect: adaptor must be a DisplayAdaptor instance');
  }

  adaptor.disconnect(strict);
}

/**
 * Update a canvas display according to current viewport limits
 *
 * Triggers a manual update of a display adaptor without an event.
 * Useful for programmatic updates.
 *
 * @param {DisplayAdaptor} adaptor - Display adaptor to update
 * @param {HTMLCanvasElement} canvas - Canvas element (optional, uses adaptor's canvas if not provided)
 * @returns {void}
 *
 * @example
 * const adaptor = connect(canvas, 'resize');
 * // ... modify data ...
 * update(adaptor, canvas);  // Force redraw
 */
export function update(adaptor, canvas = null) {
  if (!adaptor || !(adaptor instanceof DisplayAdaptor)) {
    throw new TypeError('update: adaptor must be a DisplayAdaptor instance');
  }

  const targetCanvas = canvas || adaptor.canvas;

  // Create synthetic event for update
  const syntheticEvent = new Event('update');
  adaptor.update(targetCanvas, syntheticEvent);
}
