/**
 * Vocal Separation Module for Pleco-XA
 * Recreates the multi-scale spectral fingerprinting approach from the Python demo
 */

import { _amax } from './_arrstat.js'
import { stft, istft } from './xa-fft.js'
import { debugLog } from './debug.js'

/**
 * 2D Convolution for spectrograms
 * @param {Array<Array<number>>} matrix - 2D spectrogram (freq x time)
 * @param {Array<Array<number>>} kernel - 2D convolution kernel
 * @param {string} mode - Padding mode ('constant', 'edge', etc.)
 * @param {number} cval - Constant value for padding
 * @returns {Array<Array<number>>} Convolved matrix
 */
export function convolve2d(matrix, kernel, mode = 'constant', cval = 0.0) {
  const rows = matrix.length
  const cols = matrix[0].length
  const kRows = kernel.length
  const kCols = kernel[0].length
  const padRow = Math.floor(kRows / 2)
  const padCol = Math.floor(kCols / 2)

  const result = Array.from({ length: rows }, () => new Array(cols).fill(0))

  for (let i = 0; i < rows; i++) {
    for (let j = 0; j < cols; j++) {
      let sum = 0

      for (let ki = 0; ki < kRows; ki++) {
        for (let kj = 0; kj < kCols; kj++) {
          const mi = i + ki - padRow
          const mj = j + kj - padCol

          let val = cval
          if (mi >= 0 && mi < rows && mj >= 0 && mj < cols) {
            val = matrix[mi][mj]
          } else if (mode === 'edge') {
            const clampedI = Math.max(0, Math.min(rows - 1, mi))
            const clampedJ = Math.max(0, Math.min(cols - 1, mj))
            val = matrix[clampedI][clampedJ]
          }

          sum += val * kernel[ki][kj]
        }
      }

      result[i][j] = sum
    }
  }

  return result
}

/**
 * Downsample spectrum (MaxPool-like)
 * @param {Array<number>} spectrum - Frequency spectrum
 * @param {number} factor - Downsampling factor
 * @returns {Array<number>} Downsampled spectrum
 */
export function downsampleSpectrum(spectrum, factor = 2) {
  const newLen = Math.floor(spectrum.length / factor)
  const downsampled = new Array(newLen)

  for (let i = 0; i < newLen; i++) {
    let max = -Infinity
    for (let j = 0; j < factor; j++) {
      const idx = i * factor + j
      if (idx < spectrum.length) {
        max = Math.max(max, spectrum[idx])
      }
    }
    downsampled[i] = max
  }

  return downsampled
}

/**
 * Create oriented edge detection filter
 * @param {number} angleDeg - Angle in degrees
 * @param {number} size - Kernel size
 * @returns {Array<Array<number>>} Convolution kernel
 */
export function createOrientedFilter(angleDeg, size = 3) {
  const angleRad = (angleDeg * Math.PI) / 180
  const x = Math.cos(angleRad)
  const y = Math.sin(angleRad)

  if (size === 3) {
    const kernel = [
      [-y, 0, y],
      [-x, 0, x],
      [-y, 0, y]
    ]

    // Normalize
    const flat = kernel.flat()
    const absSum = flat.reduce((sum, val) => sum + Math.abs(val), 0)
    return kernel.map(row => row.map(val => val / (absSum + 1e-8)))
  }

  return []
}

/**
 * Create 18 different views/slices of the spectrogram
 * @param {Array<Array<number>>} magnitudeSpectrogram - Magnitude spectrogram (freq x time)
 * @returns {Object} Dictionary of slices
 */
export function create18Slices(magnitudeSpectrogram) {
  const slices = {}

  // SLICE 0: Raw spectrogram
  slices['slice_0_raw'] = magnitudeSpectrogram.map(row => [...row])

  // SLICE 1: Horizontal (sustained frequencies)
  const kernelH = [
    [0, 0, 0],
    [1, 1, 1],
    [0, 0, 0]
  ].map(row => row.map(val => val / 3)) // Normalize
  slices['slice_1_horizontal'] = convolve2d(magnitudeSpectrogram, kernelH)

  // SLICE 2: Vertical (onsets)
  const kernelV = [
    [-1, 0, 1],
    [-1, 0, 1],
    [-1, 0, 1]
  ]
  slices['slice_2_vertical'] = convolve2d(magnitudeSpectrogram, kernelV)

  // SLICE 3: Diagonal up
  const kernelDiag1 = [
    [0, 0, 1],
    [0, 1, 0],
    [1, 0, 0]
  ]
  slices['slice_3_diagonal_up'] = convolve2d(magnitudeSpectrogram, kernelDiag1)

  // SLICE 4: Diagonal down
  const kernelDiag2 = [
    [1, 0, 0],
    [0, 1, 0],
    [0, 0, 1]
  ]
  slices['slice_4_diagonal_down'] = convolve2d(magnitudeSpectrogram, kernelDiag2)

  // SLICE 5: Blob detector
  const kernelBlob = [
    [0, 1, 0],
    [1, 2, 1],
    [0, 1, 0]
  ].map(row => row.map(val => val / 6)) // Normalize
  slices['slice_5_blob'] = convolve2d(magnitudeSpectrogram, kernelBlob)

  // SLICE 6: Harmonic stack
  const kernelHarmonic = [
    [1, 1, 1],
    [0, 0, 0],
    [1, 1, 1]
  ].map(row => row.map(val => val / 6)) // Normalize
  slices['slice_6_harmonic'] = convolve2d(magnitudeSpectrogram, kernelHarmonic)

  // SLICE 7: High-pass (edge detection)
  const kernelHp = [
    [-1, -1, -1],
    [-1, 8, -1],
    [-1, -1, -1]
  ]
  slices['slice_7_highpass'] = convolve2d(magnitudeSpectrogram, kernelHp)

  // SLICE 8: Low-pass (smoothing)
  const _kernelLp = Array(9).fill(1/9) // 3x3 box filter
  const kernelLp2d = [
    [1/9, 1/9, 1/9],
    [1/9, 1/9, 1/9],
    [1/9, 1/9, 1/9]
  ]
  slices['slice_8_lowpass'] = convolve2d(magnitudeSpectrogram, kernelLp2d)

  // SLICES 9-15: Oriented edge detectors
  const angles = [22.5, 45, 67.5, 90, 112.5, 135, 157.5]
  for (let i = 0; i < angles.length; i++) {
    const kernel = createOrientedFilter(angles[i])
    slices[`slice_${9+i}_edge_${angles[i]}deg`] = convolve2d(magnitudeSpectrogram, kernel)
  }

  // SLICE 16: Laplacian (all edges)
  const kernelLaplacian = [
    [0, -1, 0],
    [-1, 4, -1],
    [0, -1, 0]
  ]
  slices['slice_16_laplacian'] = convolve2d(magnitudeSpectrogram, kernelLaplacian)

  // SLICE 17: MaxPool (downsampled)
  const pooledMax = []
  for (let i = 0; i < magnitudeSpectrogram.length; i += 2) {
    const row = []
    for (let j = 0; j < magnitudeSpectrogram[0].length; j += 2) {
      let max = -Infinity
      for (let di = 0; di < 2; di++) {
        for (let dj = 0; dj < 2; dj++) {
          const ni = i + di
          const nj = j + dj
          if (ni < magnitudeSpectrogram.length && nj < magnitudeSpectrogram[0].length) {
            max = Math.max(max, magnitudeSpectrogram[ni][nj])
          }
        }
      }
      row.push(max)
    }
    pooledMax.push(row)
  }
  slices['slice_17_maxpool'] = pooledMax

  // SLICE 18: AvgPool (downsampled)
  const pooledAvg = []
  for (let i = 0; i < magnitudeSpectrogram.length; i += 2) {
    const row = []
    for (let j = 0; j < magnitudeSpectrogram[0].length; j += 2) {
      let sum = 0
      let count = 0
      for (let di = 0; di < 2; di++) {
        for (let dj = 0; dj < 2; dj++) {
          const ni = i + di
          const nj = j + dj
          if (ni < magnitudeSpectrogram.length && nj < magnitudeSpectrogram[0].length) {
            sum += magnitudeSpectrogram[ni][nj]
            count++
          }
        }
      }
      row.push(sum / count)
    }
    pooledAvg.push(row)
  }
  slices['slice_18_avgpool'] = pooledAvg

  return slices
}

/**
 * Extract detailed metrics from a frequency window (425-point fingerprint)
 * @param {Array<number>} window - Frequency spectrum for one time window
 * @param {number} sr - Sample rate
 * @returns {Object} Fingerprint metrics
 */
export function windowToFingerprint(window, sr) {
  // Suppress warnings for log operations
  const safeLog = (x) => (x > 0 ? Math.log(x) : -Infinity)
  const _safePow = (x, p) => (x >= 0 ? Math.pow(x, p) : 0)

  // Compress through layers
  const layer1 = downsampleSpectrum(window, 2)
  const layer2 = downsampleSpectrum(layer1, 2)
  const layer3 = downsampleSpectrum(layer2, 2)
  const layer4 = downsampleSpectrum(layer3, 2)
  const bottleneckVector = downsampleSpectrum(layer4, 2)

  // Core: 400-point frequency profile
  const freqProfile400 = []
  for (let i = 0; i < 400; i++) {
    const freq = (i * (sr / 2)) / 400
    const idx = Math.floor((freq / (sr / 2)) * layer2.length)
    const val = idx < layer2.length ? layer2[idx] : 0
    freqProfile400.push(val)
  }

  // Band energies
  const numBins = layer2.length
  const bassBins = { start: 0, end: Math.max(1, Math.floor(numBins * 250 / (sr / 2))) }
  const lowMidBins = {
    start: bassBins.end,
    end: Math.floor(numBins * 500 / (sr / 2))
  }
  const midBins = {
    start: lowMidBins.end,
    end: Math.floor(numBins * 2000 / (sr / 2))
  }
  const highMidBins = {
    start: midBins.end,
    end: Math.floor(numBins * 4000 / (sr / 2))
  }
  const presenceBins = {
    start: highMidBins.end,
    end: Math.min(numBins, Math.floor(numBins * 8000 / (sr / 2)))
  }
  const highBins = {
    start: presenceBins.end,
    end: numBins
  }

  const bassEnergy = sum(layer2.slice(bassBins.start, bassBins.end).map(x => x * x)) + 1e-8
  const lowMidEnergy = sum(layer2.slice(lowMidBins.start, lowMidBins.end).map(x => x * x)) + 1e-8
  const midEnergy = sum(layer2.slice(midBins.start, midBins.end).map(x => x * x)) + 1e-8
  const highMidEnergy = sum(layer2.slice(highMidBins.start, highMidBins.end).map(x => x * x)) + 1e-8
  const presenceEnergy = sum(layer2.slice(presenceBins.start, presenceBins.end).map(x => x * x)) + 1e-8
  const highEnergy = sum(layer2.slice(highBins.start, highBins.end).map(x => x * x)) + 1e-8

  // Spectral shape
  const freqsL4 = []
  for (let i = 0; i < layer4.length; i++) {
    freqsL4.push((i * sr) / (2 * layer4.length))
  }

  const totalEnergyL4 = sum(layer4)
  const centroid = totalEnergyL4 > 0 ? sum(layer4.map((v, i) => freqsL4[i] * v)) / totalEnergyL4 : 0

  const spread = totalEnergyL4 > 0 ?
    Math.sqrt(sum(layer4.map((v, i) => Math.pow(freqsL4[i] - centroid, 2) * v)) / totalEnergyL4) : 0

  // Spectral rolloff
  const cumsumEnergy = cumulativeSum(layer4)
  const total = cumsumEnergy[cumsumEnergy.length - 1]
  const rolloffIdx = cumsumEnergy.findIndex(v => v >= 0.85 * total)
  const rolloff = rolloffIdx >= 0 ? freqsL4[rolloffIdx] : sr / 2

  // Geometric mean and flatness
  const geoMean = Math.exp(mean(layer4.map(x => x > 0 ? safeLog(x) : safeLog(1e-8))))
  const arithmeticMean = mean(layer4)
  const flatness = arithmeticMean > 0 ? geoMean / arithmeticMean : 0
  const slope = layer4.length > 1 ? (layer4[layer4.length - 1] - layer4[0]) / layer4.length : 0
  const crest = arithmeticMean > 0 ? _amax(layer4) / arithmeticMean : 0

  // Harmonic structure (simplified)
  // For now, just basic peak detection
  const peaks = []
  const threshold = _amax(layer3) * 0.1
  for (let i = 1; i < layer3.length - 1; i++) {
    if (layer3[i] > layer3[i-1] && layer3[i] > layer3[i+1] && layer3[i] > threshold) {
      peaks.push(i)
    }
  }

  const numHarmonics = peaks.length
  let harmonicSpacing = 0
  let fundamental = 0

  if (numHarmonics > 1) {
    harmonicSpacing = mean(peaks.slice(1).map((p, i) => p - peaks[i])) * (sr / 2) / layer3.length
    fundamental = harmonicSpacing
  }

  const harmonicStrength = numHarmonics > 0 ? mean(peaks.map(p => layer3[p])) / (mean(layer3) + 1e-8) : 0

  // Formants (simplified)
  const midRangePeaks = []
  for (let i = 1; i < layer2.length - 1; i++) {
    if (i >= midBins.start && i < midBins.end) {
      const val = layer2[i]
      if (val > layer2[i-1] && val > layer2[i+1] && val > _amax(layer2.slice(midBins.start, midBins.end)) * 0.3) {
        midRangePeaks.push(i)
      }
    }
  }

  const formants = []
  for (let i = 0; i < Math.min(3, midRangePeaks.length); i++) {
    const peakIdx = midRangePeaks[i]
    const formantFreq = (peakIdx * (sr / 2)) / layer2.length
    formants.push(formantFreq)
  }
  while (formants.length < 3) formants.push(0)

  const formantStrength = midRangePeaks.length > 0 ?
    mean(midRangePeaks.map(p => layer2[p])) : 0

  // Dynamics
  const peakToRms = _amax(layer4) / (Math.sqrt(mean(layer4.map(x => x * x))) + 1e-8)
  const top10Percent = Math.max(1, Math.floor(layer4.length * 0.1))
  const sortedLayer4 = [...layer4].sort((a, b) => b - a)
  const topEnergy = sum(sortedLayer4.slice(0, top10Percent))
  const energyConcentration = topEnergy / (sum(layer4) + 1e-8)

  const normalized = layer4.map(x => x / (sum(layer4) + 1e-8))
  const entropy = -sum(normalized.map(x => x > 0 ? x * safeLog(x) : 0))
  const totalEnergy = sum(bottleneckVector.map(x => x * x))

  return {
    freq_profile_400: freqProfile400,
    bass_energy: bassEnergy,
    low_mid_energy: lowMidEnergy,
    mid_energy: midEnergy,
    high_mid_energy: highMidEnergy,
    presence_energy: presenceEnergy,
    high_energy: highEnergy,
    mid_to_bass_ratio: midEnergy / bassEnergy,
    high_to_mid_ratio: highEnergy / midEnergy,
    spectral_centroid: centroid,
    spectral_spread: spread,
    spectral_rolloff: rolloff,
    spectral_flatness: flatness,
    spectral_slope: slope,
    spectral_crest: crest,
    fundamental_frequency: fundamental,
    num_harmonics: numHarmonics,
    harmonic_spacing: harmonicSpacing,
    harmonic_strength: harmonicStrength,
    formant_1: formants[0],
    formant_2: formants[1],
    formant_3: formants[2],
    formant_strength: formantStrength,
    peak_to_rms: peakToRms,
    energy_concentration: energyConcentration,
    spectral_entropy: entropy,
    total_energy: totalEnergy,
  }
}

/**
 * Process audio to create complete fingerprint
 * @param {AudioBuffer} audioBuffer - Audio buffer
 * @param {number} nFft - FFT window size
 * @param {number} hopLength - Hop length
 * @returns {Object} Processing results including fingerprints
 */
export function processAudioToFingerprints(audioBuffer, nFft = 2048, hopLength = 1024) {
  const channelData = audioBuffer.getChannelData(0)
  const sr = audioBuffer.sampleRate

  // Create STFT — xa-fft.js returns (freq x time), the layout we need.
  // (Wave 5A repair: the old code transposed here on the assumption stft
  // returned time x freq, which scrambled frequency and time semantics for
  // the entire fingerprint pipeline.)
  const stftResult = stft(channelData, nFft, hopLength)
  const _numFreqBins = stftResult.length
  const numWindows = stftResult[0].length

  // Extract magnitude spectrogram in (freq x time) format
  const magnitudeSpec = stftResult.map(freqRow => freqRow.map(bin => {
    return Math.sqrt(bin.real * bin.real + bin.imag * bin.imag)
  }))

  // Create 18 slices - now magnitudeSpec is (freq x time)
  const slices = create18Slices(magnitudeSpec)

  // Process each slice to fingerprints
  const fingerprints = {}

  for (const [sliceName, sliceData] of Object.entries(slices)) {
    const sliceFingerprints = []
    const numSliceWindows = sliceData[0].length

    for (let windowIdx = 0; windowIdx < numSliceWindows; windowIdx++) {
      // Extract window column (frequency vector for this time)
      const window = sliceData.map(row => row[windowIdx])
      const metrics = windowToFingerprint(window, sr)
      sliceFingerprints.push(metrics)
    }

    fingerprints[sliceName] = sliceFingerprints
  }

  return {
    audioBuffer,
    stftResult,  // (freq x time) format
    magnitudeSpec,  // (freq x time) format
    slices,
    fingerprints,
    numWindows: numWindows,
    sr
  }
}

/**
 * Optimize EQ curves to match mixture fingerprints to vocal fingerprints
 * @param {Object} vocalFps - Vocal fingerprints
 * @param {Object} mixtureFps - Mixture fingerprints (used for initialization context)
 * @param {Array<Array<number>>} mixtureMag - Mixture magnitude spectrogram (freq x time)
 * @param {number} numWindows - Number of time windows
 * @param {number} sr - Sample rate
 * @param {number} numIterations - Number of optimization iterations
 * @param {number} learningRate - Learning rate for gradient descent
 * @returns {Array<Array<number>>} Optimized EQ curves
 */
export function optimizeEqCurves(vocalFps, mixtureFps, mixtureMag, numWindows, sr, numIterations = 100, learningRate = 0.01) {
  debugLog(`\n${'='.repeat(70)}`)
  debugLog(`PHASE 3: OPTIMIZATION (Matching Mixture to Vocal)`)
  debugLog('='.repeat(70))
  debugLog(`\nOptimizing ${numWindows} windows × 400 EQ points...`)
  debugLog(`Target: Match mixture fingerprint to vocal fingerprint\n`)

  // Initialize EQ curves (unity gain)
  const eqCurves = Array.from({ length: numWindows }, () => new Array(400).fill(1.0))

  const losses = []

  for (let iteration = 0; iteration < numIterations; iteration++) {
    let totalLoss = 0

    for (let winIdx = 0; winIdx < numWindows; winIdx++) {
      // Get target vocal fingerprint (slice_0_raw only)
      const vocalFp = vocalFps['slice_0_raw'][winIdx]['freq_profile_400']

      // Extract mixture window (freq x time format, so column winIdx)
      const mixtureWindow = mixtureMag.map(row => row[winIdx])

      // Convert to 400-point representation using linear interpolation
      const mixtureFp = []
      for (let i = 0; i < 400; i++) {
        const targetFreq = (i / 399) * (sr / 2)
        const sourceIdx = (targetFreq / (sr / 2)) * (mixtureWindow.length - 1)
        const idx = Math.floor(sourceIdx)
        const frac = sourceIdx - idx

        let val = 0
        if (idx < mixtureWindow.length - 1) {
          val = mixtureWindow[idx] * (1 - frac) + mixtureWindow[idx + 1] * frac
        } else if (idx < mixtureWindow.length) {
          val = mixtureWindow[idx]
        }
        mixtureFp.push(val)
      }

      // Apply EQ
      const adjustedFp = mixtureFp.map((val, i) => val * eqCurves[winIdx][i])

      // Compute loss (MSE)
      const loss = mean(adjustedFp.map((val, i) => Math.pow(val - vocalFp[i], 2)))
      totalLoss += loss

      // Compute gradient
      const gradient = adjustedFp.map((val, i) => 2 * (val - vocalFp[i]) * mixtureFp[i])

      // Update EQ curve (gradient descent)
      for (let i = 0; i < 400; i++) {
        eqCurves[winIdx][i] -= learningRate * gradient[i]
        // Clip to reasonable range [0.1, 3.0]
        eqCurves[winIdx][i] = Math.max(0.1, Math.min(3.0, eqCurves[winIdx][i]))
      }
    }

    const avgLoss = totalLoss / numWindows
    losses.push(avgLoss)

    if (iteration % 20 === 0) {
      debugLog(`  Iteration ${iteration.toString().padStart(3)}: Loss = ${avgLoss.toFixed(6)}`)
    }
  }

  debugLog(`\n✓ Optimization complete!`)
  debugLog(`  Final loss: ${losses[losses.length - 1].toFixed(6)}`)
  debugLog(`  Initial loss: ${losses[0].toFixed(6)}`)
  debugLog(`  Improvement: ${((1 - losses[losses.length - 1] / losses[0]) * 100).toFixed(1)}%`)

  return eqCurves
}

/**
 * Reconstruct vocal audio using learned EQ curves
 * @param {Array} mixtureStft - Mixture STFT in (freq x time) format
 * @param {Array<Array<number>>} eqCurves - EQ curves for each window
 * @param {number} sr - Sample rate
 * @param {number} nFft - FFT size
 * @param {number} hopLength - Hop length
 * @returns {Float32Array} Reconstructed audio
 */
export function reconstructVocal(mixtureStft, eqCurves, sr, nFft = 2048, hopLength = 1024) {
  debugLog(`\n${'='.repeat(70)}`)
  debugLog(`PHASE 4: RECONSTRUCTION`)
  debugLog('='.repeat(70))
  debugLog('\nApplying learned EQ curves to mixture...')

  const numFreqBins = mixtureStft.length
  const numWindows = mixtureStft[0].length

  // Extract magnitude and phase in (freq x time) format
  const magSpectrogram = mixtureStft.map(freqRow =>
    freqRow.map(bin => Math.sqrt(bin.real * bin.real + bin.imag * bin.imag))
  )
  const phaseSpectrogram = mixtureStft.map(freqRow =>
    freqRow.map(bin => Math.atan2(bin.imag, bin.real))
  )

  const adjustedMagnitude = Array.from({ length: numFreqBins }, () => new Array(numWindows))

  // Apply EQ to each window
  for (let winIdx = 0; winIdx < numWindows; winIdx++) {
    // Extract window column
    const windowMag = magSpectrogram.map(row => row[winIdx])

    // Interpolate 400-point EQ to numFreqBins STFT bins
    const freqBinsStft = []
    for (let k = 0; k < numFreqBins; k++) {
      freqBinsStft.push((k * sr) / nFft)
    }

    const freqPointsEq = []
    for (let i = 0; i < 400; i++) {
      freqPointsEq.push((i * (sr / 2)) / 400)
    }

    // Apply EQ with interpolation
    for (let k = 0; k < numFreqBins; k++) {
      const freq = freqBinsStft[k]

      // Linear interpolation
      let eqVal = 1.0
      if (freq <= freqPointsEq[0]) {
        eqVal = eqCurves[winIdx][0]
      } else if (freq >= freqPointsEq[freqPointsEq.length - 1]) {
        eqVal = eqCurves[winIdx][freqPointsEq.length - 1]
      } else {
        for (let i = 0; i < freqPointsEq.length - 1; i++) {
          if (freq >= freqPointsEq[i] && freq <= freqPointsEq[i + 1]) {
            const t_interp = (freq - freqPointsEq[i]) / (freqPointsEq[i + 1] - freqPointsEq[i])
            eqVal = eqCurves[winIdx][i] * (1 - t_interp) + eqCurves[winIdx][i + 1] * t_interp
            break
          }
        }
      }

      adjustedMagnitude[k][winIdx] = windowMag[k] * eqVal
    }
  }

  debugLog('  ✓ EQ curves applied')

  // Reconstruct complex STFT in (freq x time) format
  const adjustedStft = adjustedMagnitude.map((freqRow, k) =>
    freqRow.map((mag, t) => ({
      real: mag * Math.cos(phaseSpectrogram[k][t]),
      imag: mag * Math.sin(phaseSpectrogram[k][t])
    }))
  )

  // Inverse STFT — istft expects (freq x time), which adjustedStft already is.
  // (Wave 5A repair: the old code transposed to time x freq and passed
  // 'hann'/true into the win_length/window slots of istft(D, hop_length,
  // win_length, window, center, length) — both wrong.)
  debugLog('  Converting back to audio...')
  const reconstructedAudio = istft(adjustedStft, hopLength, null, 'hann', true)

  debugLog('  ✓ Audio reconstructed')

  // Normalize (loop, not _amax(spread) — stack-safe on long audio)
  let maxVal = 0
  for (let i = 0; i < reconstructedAudio.length; i++) {
    const a = Math.abs(reconstructedAudio[i])
    if (a > maxVal) maxVal = a
  }
  const normalized = new Float32Array(reconstructedAudio.length)
  for (let i = 0; i < reconstructedAudio.length; i++) {
    normalized[i] = reconstructedAudio[i] / (maxVal + 1e-8)
  }

  return normalized
}

// Utility functions
function sum(arr) {
  return arr.reduce((a, b) => a + b, 0)
}

function mean(arr) {
  return sum(arr) / arr.length
}

function cumulativeSum(arr) {
  const result = []
  let total = 0
  for (const val of arr) {
    total += val
    result.push(total)
  }
  return result
}
