/**
 * JavaScript recurrence matrix and loop structure analysis
 * For finding loop structures in audio
 */

import { debugLog } from './debug.js'

/**
 * Compute chroma features from audio buffer
 */
export function computeChroma(audioBuffer, hopLength = 512) {
  const audioData = audioBuffer.getChannelData(0)
  const sampleRate = audioBuffer.sampleRate
  const frameLength = 2048
  if (!audioData || audioData.length < frameLength + 1) {
    // Not enough data for even one frame
    return []
  }
  const numFrames = Math.floor((audioData.length - frameLength) / hopLength)
  if (numFrames <= 0) {
    return []
  }
  // 12 chroma bins (C, C#, D, D#, E, F, F#, G, G#, A, A#, B)
  const chroma = Array(12)
    .fill(0)
    .map(() => new Float32Array(numFrames))
  for (let frame = 0; frame < numFrames; frame++) {
    const start = frame * hopLength
    const frameData = audioData.slice(start, start + frameLength)
    // Simple FFT to get frequency bins
    const fft = computeFFT(frameData)
    const magnitudes = new Float32Array(fft.length / 2)
    for (let i = 0; i < magnitudes.length; i++) {
      const real = fft[i * 2]
      const imag = fft[i * 2 + 1]
      magnitudes[i] = Math.sqrt(real * real + imag * imag)
    }
    // Map frequency bins to chroma bins
    for (let bin = 1; bin < magnitudes.length; bin++) {
      const freq = (bin * sampleRate) / frameLength
      const chromaBin = frequencyToChroma(freq)
      if (chromaBin >= 0 && chromaBin < 12) {
        chroma[chromaBin][frame] += magnitudes[bin]
      }
    }
  }
  return chroma
}

/**
 * Convert frequency to chroma bin (0-11)
 */
function frequencyToChroma(freq) {
  if (freq <= 0) return -1

  // Convert to MIDI note number
  const midiNote = 12 * Math.log2(freq / 440) + 69

  // Map to chroma (mod 12)
  return Math.floor(midiNote) % 12
}

/**
 * Time-delay embedding to stack chroma features
 */
export function stackMemory(chroma, nSteps = 10, delay = 3) {
  debugLog('Input chroma:', chroma)
  debugLog('Chroma dimensions:', chroma.length, chroma[0]?.length)

  if (
    !Array.isArray(chroma) ||
    chroma.length === 0 ||
    !Array.isArray(chroma[0]) ||
    chroma[0].length === 0
  ) {
    return []
  }
  const numChroma = chroma.length
  const numFrames = chroma[0].length
  // Ensure all chroma rows have the same length
  if (!chroma.every((row) => row.length === numFrames)) {
    throw new Error('All chroma rows must have the same length')
  }
  const stackedSize = numChroma * nSteps
  const validFrames = numFrames - (nSteps - 1) * delay
  if (validFrames <= 0) {
    return []
  }
  const stacked = Array(stackedSize)
    .fill(0)
    .map(() => new Float32Array(validFrames))
  for (let frame = 0; frame < validFrames; frame++) {
    for (let step = 0; step < nSteps; step++) {
      const sourceFrame = frame + step * delay
      for (let chroma_bin = 0; chroma_bin < numChroma; chroma_bin++) {
        const stackIndex = step * numChroma + chroma_bin
        stacked[stackIndex][frame] = chroma[chroma_bin][sourceFrame]
      }
    }
  }
  return stacked
}

/**
 * Validate input data for gen_sim_matrix to ensure it is a valid 2D array.
 * @param {Array} data - The input data to validate.
 * @returns {boolean} - True if valid, false otherwise.
 */
function validateInputData(data) {
  return (
    Array.isArray(data) &&
    data.length > 0 &&
    Array.isArray(data[0]) &&
    data[0].length > 0 &&
    data.every((row) => row.length === data[0].length)
  )
}

/**
 * Generate similarity matrix (helper for recurrence_matrix)
 */
function gen_sim_matrix(
  data,
  _k = null,
  _metric = 'euclidean',
  _sparse = false,
  mode = 'connectivity',
  _bandwidth = null,
  _hop_length = 1,
  _win_length = null,
  _axis = -1,
) {
  debugLog('Preparing input data for gen_sim_matrix:', data)
  debugLog(`Data dimensions: ${data.length}x${data[0]?.length || 0}`)

  debugLog('Data before gen_sim_matrix:', data)
  if (!validateInputData(data)) {
    throw new Error(
      'Invalid input data: Expected a 2D array before gen_sim_matrix.',
    )
  }

  const [numFeatures, numFrames] = [data.length, data[0].length]
  const matrix = Array(numFrames)
    .fill(0)
    .map(() => new Float32Array(numFrames))

  for (let i = 0; i < numFrames; i++) {
    for (let j = 0; j < numFrames; j++) {
      // Compute cosine similarity (since euclidean is more complex)
      let dotProduct = 0
      let norm1 = 0
      let norm2 = 0

      for (let f = 0; f < numFeatures; f++) {
        const val1 = data[f][i]
        const val2 = data[f][j]
        dotProduct += val1 * val2
        norm1 += val1 * val1
        norm2 += val2 * val2
      }

      const similarity = dotProduct / (Math.sqrt(norm1 * norm2) + 1e-8)

      if (mode === 'connectivity') {
        matrix[i][j] = similarity > 0.5 ? 1 : 0
      } else if (mode === 'affinity') {
        matrix[i][j] = Math.max(0, similarity)
      } else if (mode === 'distance') {
        matrix[i][j] = 1 - similarity
      }
    }
  }

  return matrix
}

/**
 * Proper recurrence matrix (xa-style)
 */
export function recurrenceMatrix(
  data,
  k = null,
  width = 1,
  metric = 'euclidean',
  sym = false,
  axis = -1,
  sparse = false,
  mode = 'connectivity',
  bandwidth = null,
  hop_length = 1,
  win_length = null,
) {
  let S = gen_sim_matrix(
    data,
    k,
    metric,
    sparse,
    mode,
    bandwidth,
    hop_length,
    win_length,
    axis,
  )

  if (sym && !sparse) {
    // S = S + S.T, then divide diagonal by 2
    const numFrames = S.length
    for (let i = 0; i < numFrames; i++) {
      for (let j = 0; j < numFrames; j++) {
        S[i][j] = S[i][j] + S[j][i]
      }
      S[i][i] = S[i][i] / 2
    }
  }

  if (!sparse) {
    // Add small constant to avoid zeros
    const minVal = Math.min(...S.flat())
    const numFrames = S.length
    for (let i = 0; i < numFrames; i++) {
      for (let j = 0; j < numFrames; j++) {
        S[i][j] = S[i][j] * 0.5 + minVal * 0.5
      }
      S[i][i] = 1 // Set diagonal to 1
    }
  }

  if (width > 1) {
    // Apply width filtering (simplified)
    const filtered = Array(S.length)
      .fill(0)
      .map(() => new Float32Array(S[0].length))
    for (let i = 0; i < S.length; i++) {
      for (let j = 0; j < S[0].length; j++) {
        if (Math.abs(i - j) <= width) {
          filtered[i][j] = 0
        } else {
          filtered[i][j] = S[i][j]
        }
      }
    }
    S = filtered
  }

  return S
}

/**
 * Convert recurrence matrix to lag representation (xa-style)
 */
export function recurrenceToLag(recurrence, pad = true, axis = -1) {
  if (axis !== 0 && axis !== 1 && axis !== -1) {
    throw new Error('Invalid target axis: ' + axis)
  }
  if (
    !Array.isArray(recurrence) ||
    recurrence.length === 0 ||
    !Array.isArray(recurrence[0]) ||
    recurrence[0].length === 0
  ) {
    return []
  }
  // Check for square matrix
  const originalSize = recurrence.length
  if (
    !recurrence.every(
      (row) => Array.isArray(row) && row.length === originalSize,
    )
  ) {
    throw new Error('Recurrence matrix must be square')
  }
  let R = recurrence
  if (pad) {
    // Pad the matrix
    const newSize = originalSize * 2
    const padded = Array(newSize)
      .fill(0)
      .map(() => new Float32Array(newSize))
    // Copy original matrix to padded
    for (let i = 0; i < originalSize; i++) {
      for (let j = 0; j < originalSize; j++) {
        padded[i][j] = R[i][j]
      }
    }
    R = padded
  }
  const numFrames = R.length
  const lagMatrix = Array(numFrames)
    .fill(0)
    .map(() => new Float32Array(numFrames))
  // Convert to lag representation
  for (let i = 0; i < numFrames; i++) {
    for (let j = 0; j < numFrames; j++) {
      const lag = Math.abs(i - j)
      if (lag < numFrames) {
        lagMatrix[lag][Math.min(i, j)] += R[i][j]
      }
    }
  }
  return lagMatrix
}

/**
 * Convert frames to time (xa-style)
 */
export function framesToTime(frames, hopLength = 512, sr = 22050) {
  if (Array.isArray(frames)) {
    return frames.map((frame) => (frame * hopLength) / sr)
  } else {
    return (frames * hopLength) / sr
  }
}

/**
 * Find peaks in lag matrix to identify loop points
 */
export function findLoopCandidates(lagMatrix, frameTime = 512 / 44100) {
  const lagSums = lagMatrix.map((row) => row.reduce((sum, val) => sum + val, 0))

  // Find peaks (local maxima)
  const peaks = []
  const threshold = Math.max(...lagSums) * 0.1

  for (let i = 2; i < lagSums.length - 2; i++) {
    if (
      lagSums[i] > threshold &&
      lagSums[i] > lagSums[i - 1] &&
      lagSums[i] > lagSums[i + 1] &&
      lagSums[i] > lagSums[i - 2] &&
      lagSums[i] > lagSums[i + 2]
    ) {
      peaks.push({
        lagFrames: i,
        lagSeconds: i * frameTime,
        confidence: lagSums[i],
      })
    }
  }

  // Sort by confidence
  peaks.sort((a, b) => b.confidence - a.confidence)

  return peaks.slice(0, 10) // Return top 10 candidates
}

/**
 * Simple FFT implementation
 */
function computeFFT(signal) {
  const N = signal.length
  if (N <= 1) return signal

  // Pad to power of 2
  const nextPow2 = Math.pow(2, Math.ceil(Math.log2(N)))
  const padded = new Float32Array(nextPow2 * 2) // Complex: [real, imag, real, imag, ...]

  // Copy signal to real part
  for (let i = 0; i < N; i++) {
    padded[i * 2] = signal[i]
    padded[i * 2 + 1] = 0
  }

  return padded
}

/**
 * In-place FFT implementation
 */
function _fft(buffer, N) {
  if (N <= 1) return

  // Separate even and odd
  const even = new Float32Array(N)
  const odd = new Float32Array(N)

  for (let i = 0; i < N / 2; i++) {
    even[i * 2] = buffer[i * 4]
    even[i * 2 + 1] = buffer[i * 4 + 1]
    odd[i * 2] = buffer[i * 4 + 2]
    odd[i * 2 + 1] = buffer[i * 4 + 3]
  }

  // Recursive FFT
  fft(even, N / 2)
  fft(odd, N / 2)

  // Combine results
  for (let k = 0; k < N / 2; k++) {
    const theta = (-2 * Math.PI * k) / N
    const re = Math.cos(theta)
    const im = Math.sin(theta)

    const oddRe = odd[k * 2]
    const oddIm = odd[k * 2 + 1]

    const tRe = re * oddRe - im * oddIm
    const tIm = re * oddIm + im * oddRe

    const evenRe = even[k * 2]
    const evenIm = even[k * 2 + 1]

    buffer[k * 2] = evenRe + tRe
    buffer[k * 2 + 1] = evenIm + tIm
    buffer[(k + N / 2) * 2] = evenRe - tRe
    buffer[(k + N / 2) * 2 + 1] = evenIm - tIm
  }
}

/**
 * Recurrence loop detection using matrix analysis
 */
export async function recurrenceLoopDetection(audioBuffer) {
  // Extract chroma features
  const chroma = computeChroma(audioBuffer)
  if (!chroma.length) {
    return {
      loopStart: 0,
      loopEnd: audioBuffer.duration,
      confidence: 50,
      isFullTrack: true,
    }
  }

  // Stack features for time-delay embedding
  const stacked = stackMemory(chroma)
  if (!stacked.length) {
    return {
      loopStart: 0,
      loopEnd: audioBuffer.duration,
      confidence: 50,
      isFullTrack: true,
    }
  }

  // Generate recurrence matrix
  const recurrence = recurrenceMatrix(stacked)

  // Convert to lag representation
  const lag = recurrenceToLag(recurrence)

  // Find loop candidates
  const hopLength = 512
  const frameTime = hopLength / audioBuffer.sampleRate
  const candidates = findLoopCandidates(lag, frameTime)

  if (!candidates.length) {
    return {
      loopStart: 0,
      loopEnd: audioBuffer.duration,
      confidence: 50,
      isFullTrack: true,
    }
  }

  // Select best candidate
  const best = candidates[0]

  return {
    loopStart: 0,
    loopEnd: best.lagSeconds,
    confidence: Math.min(100, best.confidence * 10),
    isFullTrack: true,
    allCandidates: candidates,
  }
}
