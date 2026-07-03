/**
 * JavaScript recurrence matrix and loop structure analysis
 * For finding loop structures in audio.
 *
 * Wave 3 repairs:
 *  - stackMemory / matrix helpers now accept Float32Array rows (ArrayBuffer.isView),
 *    which computeChroma has always produced. The old Array.isArray-only checks
 *    silently rejected every real input.
 *  - computeFFT stub (which performed NO transform, just interleaved packing) is
 *    replaced by the real FFT from xa-fft.js.
 *  - recurrenceLoopDetection returns real, audio-validated candidates or THROWS
 *    a diagnostic error. The old fabricated fallbacks (confidence: 50 on 100% of
 *    calls) are gone.
 */

import { fft } from './xa-fft.js'
import { debugLog } from './debug.js'

/** True for plain arrays and typed arrays alike. */
function isRow(x) {
  return Array.isArray(x) || ArrayBuffer.isView(x)
}

/**
 * Compute chroma features from audio buffer
 * @returns {Float32Array[]} 12 chroma rows × numFrames columns (empty array if
 *   the buffer is too short for a single frame)
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
    // Real FFT (xa-fft returns Array<{real, imag}>)
    const spectrum = fft(frameData)
    const numBins = Math.floor(spectrum.length / 2)
    // Map frequency bins to chroma bins
    for (let bin = 1; bin < numBins; bin++) {
      const { real, imag } = spectrum[bin]
      const magnitude = Math.sqrt(real * real + imag * imag)
      const freq = (bin * sampleRate) / spectrum.length
      const chromaBin = frequencyToChroma(freq)
      if (chromaBin >= 0 && chromaBin < 12) {
        chroma[chromaBin][frame] += magnitude
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
  const chromaBin = Math.floor(midiNote) % 12
  return chromaBin < 0 ? chromaBin + 12 : chromaBin
}

/**
 * Time-delay embedding to stack chroma features.
 * Accepts rows as plain arrays or typed arrays (Float32Array).
 */
export function stackMemory(chroma, nSteps = 10, delay = 3) {
  if (
    !Array.isArray(chroma) ||
    chroma.length === 0 ||
    !isRow(chroma[0]) ||
    chroma[0].length === 0
  ) {
    return []
  }
  const numChroma = chroma.length
  const numFrames = chroma[0].length
  // Ensure all chroma rows have the same length
  if (!chroma.every((row) => isRow(row) && row.length === numFrames)) {
    throw new Error('stackMemory: all chroma rows must have the same length')
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
 * Validate input data for gen_sim_matrix: 2D, equal-length rows,
 * rows may be plain or typed arrays.
 */
function validateInputData(data) {
  return (
    Array.isArray(data) &&
    data.length > 0 &&
    isRow(data[0]) &&
    data[0].length > 0 &&
    data.every((row) => isRow(row) && row.length === data[0].length)
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
  if (!validateInputData(data)) {
    throw new Error(
      'gen_sim_matrix: expected a non-empty 2D array (rows may be typed arrays)',
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
    // Blend toward the matrix minimum to avoid hard zeros
    let minVal = Infinity
    for (const row of S) {
      for (const v of row) if (v < minVal) minVal = v
    }
    const numFrames = S.length
    for (let i = 0; i < numFrames; i++) {
      for (let j = 0; j < numFrames; j++) {
        S[i][j] = S[i][j] * 0.5 + minVal * 0.5
      }
      S[i][i] = 1 // Set diagonal to 1
    }
  }

  if (width > 1) {
    // Suppress near-diagonal self-matches (simplified width filter)
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
 * Convert recurrence matrix to lag representation (xa-style).
 * Accepts rows as plain arrays or typed arrays.
 */
export function recurrenceToLag(recurrence, pad = true, axis = -1) {
  if (axis !== 0 && axis !== 1 && axis !== -1) {
    throw new Error('Invalid target axis: ' + axis)
  }
  if (
    !Array.isArray(recurrence) ||
    recurrence.length === 0 ||
    !isRow(recurrence[0]) ||
    recurrence[0].length === 0
  ) {
    return []
  }
  // Check for square matrix
  const originalSize = recurrence.length
  if (!recurrence.every((row) => isRow(row) && row.length === originalSize)) {
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
 * Find peaks in lag matrix to identify loop-lag candidates.
 *
 * Lag strengths are normalized by the number of frame positions that can
 * contribute at each lag (numFrames − lag). Without this, raw lag sums decay
 * linearly with lag and real repetition peaks drown in the ramp (Wave 3 fix).
 *
 * @param {Float32Array[]} lagMatrix - output of recurrenceToLag
 * @param {number} [frameTime] - seconds per lag step
 * @param {number} [numFrames] - frames in the ORIGINAL (unpadded) recurrence
 *   matrix; defaults to lagMatrix.length / 2 (i.e., assumes pad=true)
 */
export function findLoopCandidates(
  lagMatrix,
  frameTime = 512 / 44100,
  numFrames = Math.floor(lagMatrix.length / 2),
) {
  const maxLag = Math.min(lagMatrix.length, numFrames)
  const strengths = new Float64Array(maxLag)
  for (let i = 0; i < maxLag; i++) {
    let sum = 0
    const row = lagMatrix[i]
    for (let j = 0; j < row.length; j++) sum += row[j]
    const positions = numFrames - i
    strengths[i] = positions > 0 ? sum / positions : 0
  }

  // Find peaks (local maxima on the normalized strengths)
  const peaks = []
  let maxStrength = 0
  for (let i = 2; i < maxLag - 2; i++) {
    if (strengths[i] > maxStrength) maxStrength = strengths[i]
  }
  if (!(maxStrength > 0)) return []
  const threshold = maxStrength * 0.1

  for (let i = 2; i < maxLag - 2; i++) {
    if (
      strengths[i] > threshold &&
      strengths[i] > strengths[i - 1] &&
      strengths[i] > strengths[i + 1] &&
      strengths[i] > strengths[i - 2] &&
      strengths[i] > strengths[i + 2]
    ) {
      peaks.push({
        lagFrames: i,
        lagSeconds: i * frameTime,
        strength: strengths[i],
      })
    }
  }

  // Sort by strength
  peaks.sort((a, b) => b.strength - a.strength)

  return peaks.slice(0, 10) // Return top 10 candidates
}

/**
 * Normalized cross-correlation (mean-subtracted, std-normalized) in [-1, 1].
 */
function ncc(a, b) {
  const len = Math.min(a.length, b.length)
  if (len === 0) return 0
  let mean1 = 0
  let mean2 = 0
  for (let i = 0; i < len; i++) {
    mean1 += a[i]
    mean2 += b[i]
  }
  mean1 /= len
  mean2 /= len
  let corr = 0
  let s1 = 0
  let s2 = 0
  for (let i = 0; i < len; i++) {
    const d1 = a[i] - mean1
    const d2 = b[i] - mean2
    corr += d1 * d2
    s1 += d1 * d1
    s2 += d2 * d2
  }
  const denom = Math.sqrt(s1 * s2)
  if (denom === 0) return 0
  return corr / denom
}

/**
 * Refine a frame-quantized lag to sample resolution by template matching:
 * slide the head of the buffer against the region around the coarse lag and
 * keep the offset with maximum normalized correlation.
 * @param {Float32Array} audioData
 * @param {number} lagSamples - coarse lag (from the hop-grid lag matrix)
 * @param {number} searchRadius - half-window in samples (one hop)
 * @returns {number} refined lag in samples
 */
function refineLagSamples(audioData, lagSamples, searchRadius) {
  const W = Math.min(4096, lagSamples)
  const maxOff = Math.min(
    searchRadius,
    audioData.length - lagSamples - W, // keep the slid window in bounds
  )
  const minOff = -Math.min(searchRadius, lagSamples - 32)
  if (W < 64 || maxOff <= minOff) return lagSamples

  const template = audioData.subarray(0, W)
  let bestOff = 0
  let bestCorr = -Infinity
  for (let off = minOff; off <= maxOff; off++) {
    const c = ncc(template, audioData.subarray(lagSamples + off, lagSamples + off + W))
    if (c > bestCorr) {
      bestCorr = c
      bestOff = off
    }
  }
  return lagSamples + bestOff
}

/**
 * Recurrence loop detection using matrix analysis.
 *
 * Returns REAL candidates validated against the raw audio, or THROWS a
 * diagnostic error. There are no fabricated fallbacks: every returned
 * confidence is the normalized cross-correlation (0..1) between the candidate
 * loop segment and the audio that follows it.
 *
 * Cost note: the similarity matrix is O(frames² × features). For long buffers
 * the hop length is scaled up (documented in `diagnostics.hopLength`) so that
 * frame count stays under `maxFrames` — a resolution trade within the same
 * algorithm, never a switch to a different strategy.
 *
 * @param {AudioBuffer|Object} audioBuffer - AudioBuffer or shim with getChannelData
 * @param {Object} [options]
 * @param {number} [options.hopLength=512]
 * @param {number} [options.maxFrames=1500] - cap on chroma frames (matrix is frames²)
 * @param {number} [options.minConfidence=0.1] - quality gate on audio-validated NCC
 * @returns {Promise<Object>} { loopStart, loopEnd, confidence, candidates, diagnostics }
 */
export async function recurrenceLoopDetection(audioBuffer, options = {}) {
  const { hopLength = 512, maxFrames = 1500, minConfidence = 0.1 } = options

  const audioData = audioBuffer.getChannelData(0)
  const sampleRate = audioBuffer.sampleRate
  const frameLength = 2048

  // Scale hop so the frame count stays tractable (documented, not silent:
  // the effective hop is reported in diagnostics).
  const projectedFrames = Math.floor(
    (audioData.length - frameLength) / hopLength,
  )
  let effectiveHop = hopLength
  if (projectedFrames > maxFrames) {
    effectiveHop = Math.ceil((audioData.length - frameLength) / maxFrames)
    debugLog(
      `recurrenceLoopDetection: scaling hop ${hopLength} -> ${effectiveHop} to cap frames at ${maxFrames}`,
    )
  }

  // Extract chroma features
  const chroma = computeChroma(audioBuffer, effectiveHop)
  if (!chroma.length) {
    throw new Error(
      `recurrence: chroma extraction gate failed — buffer too short ` +
        `(${audioData.length} samples < ${frameLength + 1} needed). ` +
        `Try strategy 'fast' or 'precise' for short material.`,
    )
  }

  // Stack features for time-delay embedding
  const stacked = stackMemory(chroma)
  if (!stacked.length) {
    throw new Error(
      `recurrence: time-delay embedding gate failed — ${chroma[0].length} chroma ` +
        `frames < 28 needed for stackMemory(nSteps=10, delay=3). ` +
        `Try a smaller hopLength, or strategy 'fast'/'precise'.`,
    )
  }

  // Generate recurrence matrix (graded affinity — binary connectivity
  // saturates on material with broadband transients) and its lag view
  const recurrence = recurrenceMatrix(
    stacked,
    null,
    1,
    'euclidean',
    false,
    -1,
    false,
    'affinity',
  )
  const lag = recurrenceToLag(recurrence)

  // Find loop-lag candidates
  const frameTime = effectiveHop / sampleRate
  const rawCandidates = findLoopCandidates(lag, frameTime, stacked[0].length)

  if (!rawCandidates.length) {
    throw new Error(
      `recurrence: lag-peak gate failed — no repetition peaks in the lag matrix ` +
        `(material may be non-repetitive). Try strategy 'precise' or 'musical'.`,
    )
  }

  // Validate candidates against the raw audio: frame-quantized lags are first
  // refined at sample resolution (the hop grid can be off by hop/2 samples,
  // which destroys sample-level correlation), then confidence is the NCC
  // between the candidate loop and the audio that follows it.
  const candidates = []
  for (const cand of rawCandidates.slice(0, 5)) {
    let lagSamples = Math.round(cand.lagSeconds * sampleRate)
    if (lagSamples < 32) continue
    lagSamples = refineLagSamples(audioData, lagSamples, effectiveHop)
    const available = Math.min(lagSamples, audioData.length - lagSamples)
    if (available < lagSamples * 0.5) continue // need ≥50% overlap to verify
    const a = audioData.subarray(0, available)
    const b = audioData.subarray(lagSamples, lagSamples + available)
    const confidence = Math.max(0, Math.min(1, ncc(a, b)))
    candidates.push({
      loopStart: 0,
      loopEnd: lagSamples / sampleRate,
      lagFrames: cand.lagFrames,
      lagStrength: cand.strength,
      confidence,
    })
  }

  if (!candidates.length) {
    throw new Error(
      `recurrence: audio-validation gate failed — no lag candidate had enough ` +
        `audio to verify against (all lags too long for the buffer). ` +
        `Try strategy 'fast' or 'precise'.`,
    )
  }

  candidates.sort((a, b) => b.confidence - a.confidence)
  const best = candidates[0]

  if (best.confidence < minConfidence) {
    throw new Error(
      `recurrence: confidence gate failed — best audio-validated candidate ` +
        `scored ${best.confidence.toFixed(3)} < minConfidence ${minConfidence}. ` +
        `Try strategy 'precise' or 'fast', or lower options.minConfidence.`,
    )
  }

  return {
    loopStart: best.loopStart,
    loopEnd: best.loopEnd,
    confidence: best.confidence,
    candidates,
    diagnostics: {
      hopLength: effectiveHop,
      frames: chroma[0].length,
      stackedFrames: stacked[0].length,
      lagPeaks: rawCandidates.length,
    },
  }
}
