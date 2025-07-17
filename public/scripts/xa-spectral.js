import { stft as fftStft, fft_frequencies } from './xa-fft.js'
import { normalize } from './xa-util.js'
/**
 * Web-ready JavaScript spectral feature extraction
 *
 * This module provides functions for extracting various spectral features from audio:
 * - Spectral characteristics (centroid, bandwidth, contrast, rolloff, flatness)
 * - Chroma features (STFT, CQT, CENS, VQT)
 * - Mel-frequency features (melspectrogram, MFCCs)
 * - Tonnetz and other tonal features
 *
 * Dependencies required:
 * - Web Audio API for FFT operations
 * - A matrix library (like numeric.js or custom implementations)
 */

// Exception class
class ParameterError extends Error {
  constructor(message) {
    super(message)
    this.name = 'ParameterError'
  }
}

// Helper function to compute spectrogram if not provided
function _spectrogram(options) {
  const {
    y,
    S,
    n_fft,
    hop_length,
    win_length,
    window,
    center,
    pad_mode,
    power = 1,
  } = options

  if (S !== null) {
    return { S, n_fft }
  }

  if (y === null) {
    throw new ParameterError('Either y or S must be provided')
  }

  // Check for empty or all-zero input
  if (!Array.isArray(y) || y.length === 0 || y.every((v) => v === 0)) {
    // Return a zero-filled spectrogram of expected shape
    const frames = Math.max(
      1,
      Math.floor((n_fft ? y.length : 0) / (hop_length || 1)),
    )
    const zeroSpec = Array.from({ length: n_fft || 2048 }, () =>
      new Array(frames).fill(0),
    )
    return { S: zeroSpec, n_fft }
  }

  // Compute STFT
  const stft_result = stft(y, {
    n_fft,
    hop_length,
    win_length,
    window,
    center,
    pad_mode,
  })
  let spec = abs(stft_result)

  // Sanitize: replace any NaN/Infinity with zero
  function sanitize(arr) {
    if (Array.isArray(arr[0])) {
      return arr.map((row) => sanitize(row))
    }
    return arr.map((v) => (Number.isFinite(v) ? v : 0))
  }
  spec = sanitize(spec)

  if (power !== 1) {
    spec = power === 2 ? abs2(spec) : pow(spec, power)
    spec = sanitize(spec)
  }

  return { S: spec, n_fft }
}

/**
 * Compute the spectral centroid
 * @param {Object} options
 * @param {Array} [options.y=null] - Audio time series
 * @param {number} [options.sr=22050] - Sample rate
 * @param {Array} [options.S=null] - Pre-computed spectrogram
 * @param {number} [options.n_fft=2048] - FFT window size
 * @param {number} [options.hop_length=512] - Hop length
 * @param {number} [options.win_length=null] - Window length
 * @param {string} [options.window='hann'] - Window type
 * @param {boolean} [options.center=true] - Center frames
 * @param {string} [options.pad_mode='constant'] - Padding mode
 * @param {Array} [options.freq=null] - Center frequencies
 * @returns {Array} Spectral centroid for each frame
 */
function spectralCentroid(options = {}) {
  const {
    y = null,
    sr = 22050,
    S = null,
    n_fft = 2048,
    hop_length = 512,
    win_length = null,
    window = 'hann',
    center = true,
    pad_mode = 'constant',
    freq = null,
  } = options

  const specResult = _spectrogram({
    y,
    S,
    n_fft,
    hop_length,
    win_length,
    window,
    center,
    pad_mode,
  })
  const spec = specResult.S
  const fft_size = specResult.n_fft

  // Validate input
  if (!isRealArray(spec)) {
    throw new ParameterError(
      'Spectral centroid is only defined with real-valued input',
    )
  }
  if (anyNegative(spec)) {
    throw new ParameterError(
      'Spectral centroid is only defined with non-negative energies',
    )
  }

  // Compute center frequencies if not provided
  let frequencies = freq
  if (frequencies === null) {
    frequencies = fft_frequencies(sr, fft_size)
  }

  // Ensure frequencies can be broadcast
  if (frequencies.length === spec.length) {
    frequencies = expandDims(frequencies, -2)
  }

  // Check for non-finite values before normalization
  const flatSpec = Array.isArray(spec) ? spec.flat(Infinity) : []
  if (!flatSpec.every(Number.isFinite)) {
    throw new ParameterError(
      'Spectrogram contains non-finite values (NaN or Infinity)',
    )
  }

  // Column-normalize S
  const S_norm = normalize(spec, { norm: 1, axis: -2 })

  // Compute weighted mean
  const centroid = sumArray(multiply(frequencies, S_norm), {
    axis: -2,
    keepdims: true,
  })
  return centroid

  // Helper: sum along axis for 1D/2D arrays
  function sumArray(arr, options = {}) {
    // Only axis -2 (last but one) is supported for now
    const { axis = -2, keepdims = false } = options
    if (!Array.isArray(arr[0])) {
      // 1D array
      const s = arr.reduce((a, b) => a + b, 0)
      return keepdims ? [s] : s
    } else {
      // 2D array: sum along axis -2 (rows)
      const nRows = arr.length
      const nCols = arr[0].length
      const result = new Array(nCols).fill(0)
      for (let i = 0; i < nRows; i++) {
        for (let j = 0; j < nCols; j++) {
          result[j] += arr[i][j]
        }
      }
      return keepdims ? [result] : result
    }
  }
}

/**
 * Compute spectral bandwidth
 * @param {Object} options - Same as spectralCentroid plus:
 * @param {Array} [options.centroid=null] - Pre-computed centroid
 * @param {boolean} [options.norm=true] - Normalize spectrogram
 * @param {number} [options.p=2] - Power for deviation
 * @returns {Array} Spectral bandwidth for each frame
 */
function spectralBandwidth(options = {}) {
  const {
    y = null,
    sr = 22050,
    S = null,
    n_fft = 2048,
    hop_length = 512,
    win_length = null,
    window = 'hann',
    center = true,
    pad_mode = 'constant',
    freq = null,
    centroid = null,
    norm = true,
    p = 2,
  } = options

  const specResult = _spectrogram({
    y,
    S,
    n_fft,
    hop_length,
    win_length,
    window,
    center,
    pad_mode,
  })
  const spec = specResult.S
  const fft_size = specResult.n_fft

  // Validate input
  if (!isRealArray(spec)) {
    throw new ParameterError(
      'Spectral bandwidth is only defined with real-valued input',
    )
  }
  if (anyNegative(spec)) {
    throw new ParameterError(
      'Spectral bandwidth is only defined with non-negative energies',
    )
  }

  // Compute centroid if not provided
  let cent = centroid
  if (cent === null) {
    cent = spectralCentroid({
      y,
      sr,
      S: spec,
      n_fft: fft_size,
      hop_length,
      freq,
    })
  }

  // Compute center frequencies
  let frequencies = freq
  if (frequencies === null) {
    frequencies = fftFrequencies({ sr, n_fft: fft_size })
  }

  // Compute deviation from centroid
  let deviation
  if (frequencies.length === spec.length) {
    deviation = abs(subtract(frequencies, cent))
  } else {
    deviation = abs(subtract(frequencies, cent))
  }

  // Normalize if requested
  let S_norm = spec
  if (norm) {
    S_norm = normalize(spec, { norm: 1, axis: -2 })
  }

  // Compute bandwidth
  const bandwidth = pow(
    sum(multiply(S_norm, pow(deviation, p)), { axis: -2, keepdims: true }),
    1.0 / p,
  )

  return bandwidth
}

/**
 * Compute spectral contrast
 * @param {Object} options - Similar to spectralCentroid
 * @param {number} [options.fmin=200.0] - Minimum frequency
 * @param {number} [options.n_bands=6] - Number of frequency bands
 * @param {number} [options.quantile=0.02] - Quantile for peaks/valleys
 * @param {boolean} [options.linear=false] - Return linear difference
 * @returns {Array} Spectral contrast values
 */
function spectralContrast(options = {}) {
  const {
    y = null,
    sr = 22050,
    S = null,
    n_fft = 2048,
    hop_length = 512,
    win_length = null,
    window = 'hann',
    center = true,
    pad_mode = 'constant',
    freq = null,
    fmin = 200.0,
    n_bands = 6,
    quantile = 0.02,
    linear = false,
  } = options

  const specResult = _spectrogram({
    y,
    S,
    n_fft,
    hop_length,
    win_length,
    window,
    center,
    pad_mode,
  })
  const spec = specResult.S
  const fft_size = specResult.n_fft

  // Compute frequencies
  let frequencies = freq || fftFrequencies({ sr, n_fft: fft_size })

  // Validate parameters
  if (n_bands < 1 || !Number.isInteger(n_bands)) {
    throw new ParameterError('n_bands must be a positive integer')
  }
  if (quantile <= 0 || quantile >= 1) {
    throw new ParameterError('quantile must lie in the range (0, 1)')
  }
  if (fmin <= 0) {
    throw new ParameterError('fmin must be a positive number')
  }

  // Define octave bands
  const octa = new Array(n_bands + 2).fill(0)
  for (let i = 1; i < octa.length; i++) {
    octa[i] = fmin * Math.pow(2, i - 1)
  }

  // Check Nyquist
  if (octa.some((f) => f >= 0.5 * sr)) {
    throw new ParameterError(
      'Frequency band exceeds Nyquist. Reduce either fmin or n_bands.',
    )
  }

  // Initialize output arrays
  const shape = [...getShape(spec)]
  shape[shape.length - 2] = n_bands + 1
  const valley = createArray(shape, 0)
  const peak = createArray(shape, 0)

  // Process each frequency band
  for (let k = 0; k < n_bands + 1; k++) {
    const f_low = octa[k]
    const f_high = octa[k + 1]

    // Find frequencies in current band
    const current_band = frequencies.map((f, i) => ({
      inBand: f >= f_low && f <= f_high,
      index: i,
    }))

    const indices = current_band.filter((x) => x.inBand).map((x) => x.index)

    if (indices.length === 0) continue

    // Extract sub-band
    const sub_band = extractSubBand(spec, indices)

    // Calculate quantile index
    const idx = Math.max(1, Math.round(quantile * indices.length))

    // Sort and extract valley/peak
    const sorted = sortAlongAxis(sub_band, -2)

    valley[k] = mean(sorted.slice(0, idx), { axis: -2 })
    peak[k] = mean(sorted.slice(-idx), { axis: -2 })
  }

  // Compute contrast
  let contrast
  if (linear) {
    contrast = subtract(peak, valley)
  } else {
    contrast = subtract(powerToDb(peak), powerToDb(valley))
  }

  return contrast
}

/**
 * Compute spectral rolloff frequency
 * @param {Object} options - Similar to spectralCentroid
 * @param {number} [options.roll_percent=0.85] - Energy percentage threshold
 * @returns {Array} Rolloff frequency for each frame
 */
function spectralRolloff(options = {}) {
  const {
    y = null,
    sr = 22050,
    S = null,
    n_fft = 2048,
    hop_length = 512,
    win_length = null,
    window = 'hann',
    center = true,
    pad_mode = 'constant',
    freq = null,
    roll_percent = 0.85,
  } = options

  if (roll_percent <= 0 || roll_percent >= 1) {
    throw new ParameterError('roll_percent must lie in the range (0, 1)')
  }

  const specResult = _spectrogram({
    y,
    S,
    n_fft,
    hop_length,
    win_length,
    window,
    center,
    pad_mode,
  })
  const spec = specResult.S
  const fft_size = specResult.n_fft

  if (!isRealArray(spec)) {
    throw new ParameterError(
      'Spectral rolloff is only defined with real-valued input',
    )
  }
  if (anyNegative(spec)) {
    throw new ParameterError(
      'Spectral rolloff is only defined with non-negative energies',
    )
  }

  // Compute frequencies
  let frequencies = freq || fftFrequencies({ sr, n_fft: fft_size })

  // Ensure frequencies can be broadcast
  if (
    frequencies.length === spec.length &&
    frequencies[0].length === undefined
  ) {
    frequencies = expandDims(frequencies, -2)
  }

  // Compute cumulative energy
  const total_energy = cumsum(spec, { axis: -2 })

  // Get threshold
  const max_energy = getLastAlongAxis(total_energy, -2)
  const threshold = multiply(roll_percent, max_energy)

  // Find rolloff frequency
  const mask = greaterEqual(total_energy, expandDims(threshold, -2))
  const rolloff = nanmin(where(mask, frequencies, NaN), {
    axis: -2,
    keepdims: true,
  })

  return rolloff
}

/**
 * Compute spectral flatness
 * @param {Object} options - Similar to spectralCentroid
 * @param {number} [options.amin=1e-10] - Small value for numerical stability
 * @param {number} [options.power=2.0] - Power exponent
 * @returns {Array} Spectral flatness for each frame
 */
function spectralFlatness(options = {}) {
  const {
    y = null,
    S = null,
    n_fft = 2048,
    hop_length = 512,
    win_length = null,
    window = 'hann',
    center = true,
    pad_mode = 'constant',
    amin = 1e-10,
    power = 2.0,
  } = options

  if (amin <= 0) {
    throw new ParameterError('amin must be strictly positive')
  }

  const specResult = _spectrogram({
    y,
    S,
    n_fft,
    hop_length,
    power: 1.0,
    win_length,
    window,
    center,
    pad_mode,
  })
  const spec = specResult.S

  if (!isRealArray(spec)) {
    throw new ParameterError(
      'Spectral flatness is only defined with real-valued input',
    )
  }
  if (anyNegative(spec)) {
    throw new ParameterError(
      'Spectral flatness is only defined with non-negative energies',
    )
  }

  // Apply threshold and power
  const S_thresh = maximum(amin, pow(spec, power))

  // Compute geometric mean
  const gmean = exp(mean(log(S_thresh), { axis: -2, keepdims: true }))

  // Compute arithmetic mean
  const amean = mean(S_thresh, { axis: -2, keepdims: true })

  // Compute flatness
  const flatness = divide(gmean, amean)

  return flatness
}

/**
 * Compute root-mean-square (RMS) energy
 * @param {Object} options
 * @param {Array} [options.y=null] - Audio time series
 * @param {Array} [options.S=null] - Spectrogram magnitude
 * @param {number} [options.frame_length=2048] - Frame length
 * @param {number} [options.hop_length=512] - Hop length
 * @param {boolean} [options.center=true] - Center frames
 * @param {string} [options.pad_mode='constant'] - Padding mode
 * @returns {Array} RMS value for each frame
 */
function rms(options = {}) {
  const {
    y = null,
    S = null,
    frame_length = 2048,
    hop_length = 512,
    center = true,
    pad_mode = 'constant',
  } = options

  let power

  if (y !== null) {
    // Compute from audio
    let audio = y
    if (center) {
      const pad_length = Math.floor(frame_length / 2)
      audio = padArray(audio, [[pad_length, pad_length]], { mode: pad_mode })
    }

    const frames = frame(audio, { frame_length, hop_length })
    power = mean(abs2(frames), { axis: -2, keepdims: true })
  } else if (S !== null) {
    // Compute from spectrogram
    const expected_frame_length = (S.length - 1) * 2
    if (
      frame_length !== expected_frame_length &&
      frame_length !== expected_frame_length + 1
    ) {
      throw new ParameterError(
        `Since S.shape[-2] is ${S.length}, frame_length is expected to be ` +
          `${expected_frame_length} or ${expected_frame_length + 1}; found ${frame_length}`,
      )
    }

    // Power spectrogram
    const x = abs2(S)

    // Adjust DC and Nyquist components
    const x_adjusted = [...x]
    x_adjusted[0] = x[0].map((v) => v * 0.5)
    if (frame_length % 2 === 0) {
      x_adjusted[x_adjusted.length - 1] = x[x.length - 1].map((v) => v * 0.5)
    }

    // Calculate power
    power = multiply(
      2 / (frame_length * frame_length),
      sum(x_adjusted, { axis: -2, keepdims: true }),
    )
  } else {
    throw new ParameterError('Either y or S must be input.')
  }

  return sqrt(power)
}

/**
 * Compute polynomial features
 * @param {Object} options - Similar to spectralCentroid
 * @param {number} [options.order=1] - Polynomial order
 * @returns {Array} Polynomial coefficients for each frame
 */
function polyFeatures(options = {}) {
  const {
    y = null,
    sr = 22050,
    S = null,
    n_fft = 2048,
    hop_length = 512,
    win_length = null,
    window = 'hann',
    center = true,
    pad_mode = 'constant',
    order = 1,
    freq = null,
  } = options

  const specResult = _spectrogram({
    y,
    S,
    n_fft,
    hop_length,
    win_length,
    window,
    center,
    pad_mode,
  })
  const spec = specResult.S
  const fft_size = specResult.n_fft

  // Compute frequencies
  let frequencies = freq || fftFrequencies({ sr, n_fft: fft_size })

  let coefficients

  if (frequencies.length === spec.length && !Array.isArray(frequencies[0])) {
    // Constant frequencies - fit once per frame
    coefficients = []
    for (let t = 0; t < spec[0].length; t++) {
      const y_values = spec.map((row) => row[t])
      const coef = polyfit(frequencies, y_values, order)
      coefficients.push(coef)
    }
    // Transpose to match expected output shape
    coefficients = transpose(coefficients)
  } else {
    // Variable frequencies - fit independently for each time frame
    coefficients = []
    for (let t = 0; t < spec[0].length; t++) {
      const x_values = frequencies.map((row) => row[t])
      const y_values = spec.map((row) => row[t])
      const coef = polyfit(x_values, y_values, order)
      coefficients.push(coef)
    }
    coefficients = transpose(coefficients)
  }

  return coefficients
}

/**
 * Compute zero-crossing rate
 * @param {Array} y - Audio time series
 * @param {Object} options
 * @param {number} [options.frame_length=2048] - Frame length
 * @param {number} [options.hop_length=512] - Hop length
 * @param {boolean} [options.center=true] - Center frames
 * @param {Object} [kwargs] - Additional options for zero_crossings
 * @returns {Array} Zero-crossing rate for each frame
 */
function zeroCrossingRate(y, options = {}) {
  const {
    frame_length = 2048,
    hop_length = 512,
    center = true,
    ...kwargs
  } = options

  // Validate audio
  if (!validAudio(y)) {
    throw new ParameterError('Invalid audio input')
  }

  let audio = y
  if (center) {
    const pad_length = Math.floor(frame_length / 2)
    audio = padArray(audio, [[pad_length, pad_length]], { mode: 'edge' })
  }

  const y_framed = frame(audio, { frame_length, hop_length })

  // Set default parameters for zero crossings
  kwargs.axis = -2
  kwargs.pad = kwargs.pad !== undefined ? kwargs.pad : false

  const crossings = zeroCrossings(y_framed, kwargs)
  const zcr = mean(crossings, { axis: -2, keepdims: true })

  return zcr
}

/**
 * Compute chromagram from STFT
 * @param {Object} options - Similar to spectralCentroid
 * @param {number} [options.norm=Infinity] - Normalization
 * @param {number} [options.tuning=null] - Tuning deviation
 * @param {number} [options.n_chroma=12] - Number of chroma bins
 * @returns {Array} Chromagram
 */
function chromaStft(options = {}) {
  const {
    y = null,
    sr = 22050,
    S = null,
    norm = Infinity,
    n_fft = 2048,
    hop_length = 512,
    win_length = null,
    window = 'hann',
    center = true,
    pad_mode = 'constant',
    tuning = null,
    n_chroma = 12,
    ...kwargs
  } = options

  const specResult = _spectrogram({
    y,
    S,
    n_fft,
    hop_length,
    power: 2,
    win_length,
    window,
    center,
    pad_mode,
  })
  const spec = specResult.S
  const fft_size = specResult.n_fft

  // Estimate tuning if not provided
  let tuning_est = tuning
  if (tuning_est === null) {
    tuning_est = estimateTuning(spec, { sr, bins_per_octave: n_chroma })
  }

  // Get chroma filter bank
  const chromafb = chromaFilterBank({
    sr,
    n_fft: fft_size,
    tuning: tuning_est,
    n_chroma,
    ...kwargs,
  })

  // Compute raw chroma
  const raw_chroma = matmul(chromafb, spec)

  // Normalize
  return normalize(raw_chroma, { norm, axis: -2 })
}

/**
 * Compute chromagram from CQT
 * @param {Object} options
 * @param {Array} [options.y=null] - Audio time series
 * @param {number} [options.sr=22050] - Sample rate
 * @param {Array} [options.C=null] - Pre-computed CQT
 * @param {number} [options.hop_length=512] - Hop length
 * @param {number} [options.fmin=null] - Minimum frequency
 * @param {number} [options.norm=Infinity] - Normalization
 * @param {number} [options.threshold=0.0] - Energy threshold
 * @param {number} [options.tuning=null] - Tuning deviation
 * @param {number} [options.n_chroma=12] - Number of chroma bins
 * @param {number} [options.n_octaves=7] - Number of octaves
 * @param {number} [options.bins_per_octave=36] - Bins per octave
 * @param {string} [options.cqt_mode='full'] - CQT mode
 * @returns {Array} CQT chromagram
 */
function chromaCqt(options = {}) {
  const {
    y = null,
    sr = 22050,
    C = null,
    hop_length = 512,
    fmin = null,
    norm = Infinity,
    threshold = 0.0,
    tuning = null,
    n_chroma = 12,
    n_octaves = 7,
    window = null,
    bins_per_octave = 36,
    cqt_mode = 'full',
  } = options

  if (bins_per_octave !== null && bins_per_octave % n_chroma !== 0) {
    throw new ParameterError(
      `bins_per_octave=${bins_per_octave} must be an integer multiple of n_chroma=${n_chroma}`,
    )
  }

  // Build CQT if not provided
  let cqt_data = C
  if (cqt_data === null) {
    if (y === null) {
      throw new ParameterError(
        'At least one of C or y must be provided to compute chroma',
      )
    }

    const cqt_func = cqt_mode === 'full' ? cqt : hybridCqt
    cqt_data = abs(
      cqt_func(y, {
        sr,
        hop_length,
        fmin,
        n_bins: n_octaves * bins_per_octave,
        bins_per_octave,
        tuning,
      }),
    )
  }

  // Map to chroma
  const cq_to_chr = cqtToChroma({
    n_input: cqt_data.length,
    bins_per_octave,
    n_chroma,
    fmin,
    window,
  })

  let chroma = matmul(cq_to_chr, cqt_data)

  // Apply threshold
  if (threshold !== null && threshold > 0) {
    chroma = chroma.map((row) => row.map((val) => (val < threshold ? 0 : val)))
  }

  // Normalize
  return normalize(chroma, { norm, axis: -2 })
}

/**
 * Compute CENS chroma features
 * @param {Object} options - Similar to chromaCqt
 * @param {number} [options.win_len_smooth=41] - Smoothing window length
 * @param {string} [options.smoothing_window='hann'] - Smoothing window type
 * @returns {Array} CENS chromagram
 */
function chromaCens(options = {}) {
  const {
    y = null,
    sr = 22050,
    C = null,
    hop_length = 512,
    fmin = null,
    tuning = null,
    n_chroma = 12,
    n_octaves = 7,
    bins_per_octave = 36,
    cqt_mode = 'full',
    window = null,
    norm = 2,
    win_len_smooth = 41,
    smoothing_window = 'hann',
  } = options

  // Validate smoothing window length
  if (
    win_len_smooth !== null &&
    (!Number.isInteger(win_len_smooth) || win_len_smooth <= 0)
  ) {
    throw new ParameterError(
      `win_len_smooth=${win_len_smooth} must be a positive integer or null`,
    )
  }

  // Get base chroma
  const chroma = chromaCqt({
    y,
    C,
    sr,
    hop_length,
    fmin,
    bins_per_octave,
    tuning,
    norm: null,
    n_chroma,
    n_octaves,
    cqt_mode,
    window,
  })

  // L1-normalize
  const chroma_norm = normalize(chroma, { norm: 1, axis: -2 })

  // Quantize amplitudes
  const QUANT_STEPS = [0.4, 0.2, 0.1, 0.05]
  const QUANT_WEIGHTS = [0.25, 0.25, 0.25, 0.25]

  const chroma_quant = createArray(getShape(chroma), 0)

  for (let i = 0; i < QUANT_STEPS.length; i++) {
    const mask = greaterThan(chroma_norm, QUANT_STEPS[i])
    addInPlace(chroma_quant, multiply(mask, QUANT_WEIGHTS[i]))
  }

  let cens = chroma_quant

  // Apply temporal smoothing if requested
  if (win_len_smooth) {
    const win = getWindow(smoothing_window, win_len_smooth + 2)
    const win_norm = divide(win, sum(win))

    // Convolve along time axis
    cens = convolve1d(chroma_quant, win_norm, { axis: -1, mode: 'constant' })
  }

  // L2-normalize
  return normalize(cens, { norm: norm, axis: -2 })
}

/**
 * Compute MFCCs (Mel-frequency cepstral coefficients)
 * @param {Object} options
 * @param {Array} [options.y=null] - Audio time series
 * @param {number} [options.sr=22050] - Sample rate
 * @param {Array} [options.S=null] - Log-power Mel spectrogram
 * @param {number} [options.n_mfcc=20] - Number of MFCCs
 * @param {number} [options.dct_type=2] - DCT type
 * @param {string} [options.norm='ortho'] - DCT normalization
 * @param {number} [options.lifter=0] - Liftering parameter
 * @returns {Array} MFCC sequence
 */
function mfcc(options = {}) {
  const {
    y = null,
    sr = 22050,
    S = null,
    n_mfcc = 20,
    dct_type = 2,
    norm = 'ortho',
    lifter = 0,
    ...kwargs
  } = options

  let melspec = S
  if (melspec === null) {
    melspec = powerToDb(melspectrogram({ y, sr, ...kwargs }))
  }

  // Apply DCT
  const M = dct(melspec, { axis: -2, type: dct_type, norm }).slice(0, n_mfcc)

  // Apply liftering if requested
  if (lifter > 0) {
    const LI = new Array(n_mfcc)
    for (let i = 0; i < n_mfcc; i++) {
      LI[i] = Math.sin((Math.PI * (i + 1)) / lifter)
    }

    // Apply liftering
    for (let i = 0; i < n_mfcc; i++) {
      for (let j = 0; j < M[i].length; j++) {
        M[i][j] *= 1 + (lifter / 2) * LI[i]
      }
    }

    return M
  } else if (lifter === 0) {
    return M
  } else {
    throw new ParameterError(
      `MFCC lifter=${lifter} must be a non-negative number`,
    )
  }
}

/**
 * Compute mel spectrogram
 * @param {Object} options
 * @param {Array} [options.y=null] - Audio time series
 * @param {number} [options.sr=22050] - Sample rate
 * @param {Array} [options.S=null] - Spectrogram
 * @param {number} [options.n_fft=2048] - FFT size
 * @param {number} [options.hop_length=512] - Hop length
 * @param {number} [options.power=2.0] - Exponent for magnitude
 * @param {Object} [kwargs] - Additional mel filter bank parameters
 * @returns {Array} Mel spectrogram
 */
function melspectrogram(options = {}) {
  const {
    y = null,
    sr = 22050,
    S = null,
    n_fft = 2048,
    hop_length = 512,
    win_length = null,
    window = 'hann',
    center = true,
    pad_mode = 'constant',
    power = 2.0,
    ...kwargs
  } = options

  const specResult = _spectrogram({
    y,
    S,
    n_fft,
    hop_length,
    power,
    win_length,
    window,
    center,
    pad_mode,
  })
  const spec = specResult.S
  const fft_size = specResult.n_fft

  // Build mel filter bank
  const mel_basis = melFilterBank({ sr, n_fft: fft_size, ...kwargs })

  // Apply mel filter bank
  const melspec = matmul(mel_basis, spec)

  return melspec
}

/**
 * Compute tonnetz (tonal centroid features)
 * @param {Object} options
 * @param {Array} [options.y=null] - Audio time series
 * @param {number} [options.sr=22050] - Sample rate
 * @param {Array} [options.chroma=null] - Pre-computed chromagram
 * @param {Object} [kwargs] - Additional options for chromaCqt
 * @returns {Array} Tonnetz features
 */
function tonnetz(options = {}) {
  const { y = null, sr = 22050, chroma = null, ...kwargs } = options

  if (y === null && chroma === null) {
    throw new ParameterError('Either y or chroma must be provided')
  }

  // Compute chroma if not provided
  let chroma_data = chroma
  if (chroma_data === null) {
    chroma_data = chromaCqt({ y, sr, ...kwargs })
  }

  // Generate transformation matrix
  const n_chroma = chroma_data.length
  const dim_map = linspace(0, 12, n_chroma, false)

  const scale = [7.0 / 6, 7.0 / 6, 3.0 / 2, 3.0 / 2, 2.0 / 3, 2.0 / 3]
  const V = []

  for (let i = 0; i < scale.length; i++) {
    V[i] = dim_map.map((d) => scale[i] * d)
  }

  // Even rows compute sin()
  for (let i = 0; i < V.length; i += 2) {
    V[i] = V[i].map((v) => v - 0.5)
  }

  const R = [1, 1, 1, 1, 0.5, 0.5]
  const phi = []

  for (let i = 0; i < R.length; i++) {
    phi[i] = V[i].map((v) => R[i] * Math.cos(Math.PI * v))
  }

  // Normalize chroma
  const chroma_norm = normalize(chroma_data, { norm: 1, axis: -2 })

  // Do the transform
  const ton = matmul(phi, chroma_norm)

  return ton
}

// Helper functions (simplified implementations)

function padArray(arr, padding, options = {}) {
  const { mode = 'constant' } = options
  const [[padStart, padEnd]] = padding

  const result = new Float32Array(arr.length + padStart + padEnd)

  // Fill start padding
  for (let i = 0; i < padStart; i++) {
    result[i] = mode === 'edge' ? arr[0] : 0
  }

  // Copy original array
  for (let i = 0; i < arr.length; i++) {
    result[i + padStart] = arr[i]
  }

  // Fill end padding
  for (let i = 0; i < padEnd; i++) {
    result[arr.length + padStart + i] =
      mode === 'edge' ? arr[arr.length - 1] : 0
  }

  return result
}

function frame(audio, options) {
  const { frame_length, hop_length } = options
  const numFrames = Math.floor((audio.length - frame_length) / hop_length) + 1
  const frames = []

  for (let i = 0; i < numFrames; i++) {
    const start = i * hop_length
    const frameData = new Float32Array(frame_length)

    for (let j = 0; j < frame_length && start + j < audio.length; j++) {
      frameData[j] = audio[start + j]
    }

    frames.push(frameData)
  }

  return frames
}

function mean(arr, options = {}) {
  const { axis = -2, keepdims = false } = options

  if (Array.isArray(arr[0])) {
    // 2D array - compute mean along axis
    const result = []
    for (let i = 0; i < arr.length; i++) {
      let sum = 0
      for (let j = 0; j < arr[i].length; j++) {
        sum += arr[i][j]
      }
      result.push(sum / arr[i].length)
    }
    return keepdims ? [result] : result
  } else {
    // 1D array
    let sum = 0
    for (let i = 0; i < arr.length; i++) {
      sum += arr[i]
    }
    return sum / arr.length
  }
}

function stft(y, options) {
  // Use the real STFT implementation from xa-fft.js
  const {
    n_fft = 2048,
    hop_length = 512,
    window = 'hann',
    center = true,
  } = options
  return fftStft(y, n_fft, hop_length, window, center)
}

function abs(x) {
  if (typeof x === 'number') return Math.abs(x)
  if (x.real !== undefined && x.imag !== undefined) {
    return Math.sqrt(x.real * x.real + x.imag * x.imag)
  }
  return x.map((row) => (row.map ? row.map(Math.abs) : Math.abs(row)))
}

function abs2(x) {
  if (typeof x === 'number') return x * x
  if (x.real !== undefined && x.imag !== undefined) {
    return x.real * x.real + x.imag * x.imag
  }
  return x.map((row) => (row.map ? row.map((v) => v * v) : row * row))
}

function pow(x, p) {
  if (typeof x === 'number') return Math.pow(x, p)
  return x.map((row) =>
    row.map ? row.map((v) => Math.pow(v, p)) : Math.pow(row, p),
  )
}

function sqrt(x) {
  if (typeof x === 'number') return Math.sqrt(x)
  return x.map((row) => (row.map ? row.map(Math.sqrt) : Math.sqrt(row)))
}

function exp(x) {
  if (typeof x === 'number') return Math.exp(x)
  return x.map((row) => (row.map ? row.map(Math.exp) : Math.exp(row)))
}

function log(x) {
  if (typeof x === 'number') return Math.log(x)
  return x.map((row) => (row.map ? row.map(Math.log) : Math.log(row)))
}

// Element-wise multiply: supports scalar * array, array * scalar, or array * array
function multiply(a, b) {
  if (typeof a === 'number' && typeof b === 'number') {
    return a * b
  }
  if (typeof a === 'number') {
    return Array.isArray(b[0])
      ? b.map((row) => row.map((v) => a * v))
      : b.map((v) => a * v)
  }
  if (typeof b === 'number') {
    return Array.isArray(a[0])
      ? a.map((row) => row.map((v) => v * b))
      : a.map((v) => v * b)
  }
  // Both arrays: element-wise
  if (Array.isArray(a[0]) && Array.isArray(b[0])) {
    return a.map((row, i) => row.map((v, j) => v * b[i][j]))
  }
  return a.map((v, i) => v * b[i])
}

// Element-wise divide: supports scalar / array, array / scalar, or array / array
function divide(a, b) {
  if (typeof a === 'number' && typeof b === 'number') {
    return a / b
  }
  if (typeof a === 'number') {
    return Array.isArray(b[0])
      ? b.map((row) => row.map((v) => a / v))
      : b.map((v) => a / v)
  }
  if (typeof b === 'number') {
    return Array.isArray(a[0])
      ? a.map((row) => row.map((v) => v / b))
      : a.map((v) => v / b)
  }
  // Both arrays: element-wise
  if (Array.isArray(a[0]) && Array.isArray(b[0])) {
    return a.map((row, i) => row.map((v, j) => v / b[i][j]))
  }
  return a.map((v, i) => v / b[i])
}

// Element-wise maximum: returns element-wise max of two arrays or array and scalar
function maximum(a, b) {
  if (typeof a === 'number' && typeof b === 'number') {
    return Math.max(a, b)
  }
  if (typeof a === 'number') {
    return Array.isArray(b[0])
      ? b.map((row) => row.map((v) => Math.max(a, v)))
      : b.map((v) => Math.max(a, v))
  }
  if (typeof b === 'number') {
    return Array.isArray(a[0])
      ? a.map((row) => row.map((v) => Math.max(v, b)))
      : a.map((v) => Math.max(v, b))
  }
  // Both arrays: element-wise
  if (Array.isArray(a[0]) && Array.isArray(b[0])) {
    return a.map((row, i) => row.map((v, j) => Math.max(v, b[i][j])))
  }
  return a.map((v, i) => Math.max(v, b[i]))
}

function getShape(arr) {
  const shape = []
  let current = arr
  while (Array.isArray(current)) {
    shape.push(current.length)
    current = current[0]
  }
  return shape
}

function createArray(shape, fillValue = 0) {
  if (shape.length === 0) return fillValue
  const arr = new Array(shape[0])
  for (let i = 0; i < shape[0]; i++) {
    arr[i] = createArray(shape.slice(1), fillValue)
  }
  return arr
}

function isRealArray(arr) {
  // Check if array contains only real numbers
  return true // Simplified
}

function anyNegative(arr) {
  return flatten(arr).some((v) => v < 0)
}

function flatten(arr) {
  return arr.flat(Infinity)
}

function powerToDb(S, options = {}) {
  const { ref = 1.0, amin = 1e-10, top_db = 80.0 } = options
  // Convert power spectrogram to dB scale
  const magnitude = maximum(S, amin)
  const log_spec = multiply(10.0, log10(divide(magnitude, ref)))

  if (top_db !== null) {
    const max_val = max(log_spec)
    return maximum(log_spec, max_val - top_db)
  }

  return log_spec
}

// Matrix operations
function matmul(a, b) {
  // Simple matrix multiplication
  const result = []
  for (let i = 0; i < a.length; i++) {
    result[i] = []
    for (let j = 0; j < b[0].length; j++) {
      let sum = 0
      for (let k = 0; k < b.length; k++) {
        sum += a[i][k] * b[k][j]
      }
      result[i][j] = sum
    }
  }
  return result
}

// Export all functions
export {
  spectralCentroid,
  spectralBandwidth,
  spectralContrast,
  spectralRolloff,
  spectralFlatness,
  polyFeatures,
  rms,
  zeroCrossingRate,
  chromaStft,
  chromaCqt,
  chromaCens,
  mfcc,
  melspectrogram,
  tonnetz,
  ParameterError,
}
