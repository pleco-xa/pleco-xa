/**
 * Advanced rhythm analysis - librosa ports for precise beat alignment
 * Fixes phase/alignment issues in loop detection
 */

import { computeSTFT, fft } from './xa-onset.js'

/**
 * Port of librosa.beat.plp() - Predominant Local Pulse
 * Finds the actual phase of the beat grid (where beat 1 really is)
 */
export function predominantLocalPulse(
  onsetStrength,
  tempo,
  sampleRate,
  hopLength = 512,
) {
  console.time('predominant_local_pulse')

  const beatPeriod = ((60.0 / tempo) * sampleRate) / hopLength // Period in frames
  const nBins = Math.ceil(beatPeriod)

  // Create phase histogram
  const phaseHistogram = new Float32Array(nBins)

  // Accumulate onset strength at different phases
  for (let i = 0; i < onsetStrength.length; i++) {
    const phase = (i % beatPeriod) / beatPeriod // 0 to 1
    const bin = Math.floor(phase * nBins)
    phaseHistogram[bin] += onsetStrength[i]
  }

  // Find the strongest phase
  let maxPhase = 0
  let maxStrength = 0
  for (let i = 0; i < nBins; i++) {
    if (phaseHistogram[i] > maxStrength) {
      maxStrength = phaseHistogram[i]
      maxPhase = i / nBins
    }
  }

  // Convert phase to time offset
  const phaseOffset = (maxPhase * beatPeriod * hopLength) / sampleRate

  console.timeEnd('predominant_local_pulse')

  return {
    phase: maxPhase,
    phaseOffset: phaseOffset,
    histogram: phaseHistogram,
  }
}

/**
 * Port of librosa.onset.onset_strength_multi()
 * Multi-band onset strength for better beat detection
 */
export function onsetStrengthMulti(
  audioData,
  sampleRate,
  {
    hopLength = 512,
    frameLength = 2048,
    nMels = 128,
    fMin = 80,
    fMax = 16000,
  } = {},
) {
  // Compute STFT
  const stft = computeSTFT(audioData, frameLength, hopLength)

  // Create mel filterbank (simplified version)
  const melFilters = createMelFilterbank(
    sampleRate,
    frameLength,
    nMels,
    fMin,
    fMax,
  )

  // Apply mel filters to get mel spectrogram
  const melSpec = []
  for (let frame = 0; frame < stft.length; frame++) {
    const melFrame = new Float32Array(nMels)

    for (let mel = 0; mel < nMels; mel++) {
      let energy = 0
      const filter = melFilters[mel]

      for (let bin = 0; bin < filter.length; bin++) {
        if (filter[bin] > 0) {
          const real = stft[frame][bin * 2]
          const imag = stft[frame][bin * 2 + 1]
          const magnitude = Math.sqrt(real * real + imag * imag)
          energy += magnitude * filter[bin]
        }
      }

      melFrame[mel] = energy
    }

    melSpec.push(melFrame)
  }

  // Compute onset strength from mel spectrogram
  const onsetStrength = new Float32Array(melSpec.length)

  for (let i = 1; i < melSpec.length; i++) {
    let strength = 0

    for (let mel = 0; mel < nMels; mel++) {
      const diff = melSpec[i][mel] - melSpec[i - 1][mel]
      if (diff > 0) {
        strength += diff
      }
    }

    onsetStrength[i] = strength
  }

  return onsetStrength
}

/**
 * Create mel filterbank (simplified)
 */
function createMelFilterbank(sampleRate, fftSize, nMels, fMin, fMax) {
  const filters = []
  const melMin = 2595 * Math.log10(1 + fMin / 700)
  const melMax = 2595 * Math.log10(1 + fMax / 700)

  // Create mel points
  const melPoints = []
  for (let i = 0; i <= nMels + 1; i++) {
    const mel = melMin + ((melMax - melMin) * i) / (nMels + 1)
    const freq = 700 * (Math.pow(10, mel / 2595) - 1)
    const bin = Math.floor((freq * fftSize) / sampleRate)
    melPoints.push(bin)
  }

  // Create triangular filters
  for (let i = 0; i < nMels; i++) {
    const filter = new Float32Array(fftSize / 2)

    const left = melPoints[i]
    const center = melPoints[i + 1]
    const right = melPoints[i + 2]

    for (let bin = left; bin < center; bin++) {
      filter[bin] = (bin - left) / (center - left)
    }

    for (let bin = center; bin < right; bin++) {
      filter[bin] = (right - bin) / (right - center)
    }

    filters.push(filter)
  }

  return filters
}

/**
 * Port of librosa.sequence.viterbi()
 * Dynamic programming for beat tracking with proper phase
 */
export function viterbiBeats(
  onsetStrength,
  tempo,
  sampleRate,
  hopLength = 512,
  tightness = 100,
) {
  const beatPeriod = ((60.0 / tempo) * sampleRate) / hopLength
  const nFrames = onsetStrength.length

  // Find phase offset using PLP
  const plp = predominantLocalPulse(onsetStrength, tempo, sampleRate, hopLength)
  const phaseOffset = (plp.phaseOffset * sampleRate) / hopLength // Convert to frames

  // Initialize dynamic programming table
  const nStates = Math.ceil(beatPeriod * 1.2) // Allow some tempo variation
  const dp = Array(nFrames)
    .fill(null)
    .map(() => new Float32Array(nStates).fill(-Infinity))
  const path = Array(nFrames)
    .fill(null)
    .map(() => new Int32Array(nStates))

  // Initialize first frame
  for (let state = 0; state < nStates; state++) {
    dp[0][state] = onsetStrength[0]
  }

  // Forward pass
  for (let frame = 1; frame < nFrames; frame++) {
    for (let state = 0; state < nStates; state++) {
      let maxScore = -Infinity
      let maxPrev = 0

      // Try different previous states
      for (let prevState = 0; prevState < nStates; prevState++) {
        const interval = state - prevState
        const expectedInterval = beatPeriod

        // Transition penalty based on tempo consistency
        const penalty =
          Math.pow((interval - expectedInterval) / expectedInterval, 2) *
          tightness
        const score = dp[frame - 1][prevState] - penalty

        if (score > maxScore) {
          maxScore = score
          maxPrev = prevState
        }
      }

      dp[frame][state] = maxScore + onsetStrength[frame]
      path[frame][state] = maxPrev
    }
  }

  // Backtrack to find best path
  const beats = []
  let currentState = 0
  let maxScore = -Infinity

  // Find best ending state
  for (let state = 0; state < nStates; state++) {
    if (dp[nFrames - 1][state] > maxScore) {
      maxScore = dp[nFrames - 1][state]
      currentState = state
    }
  }

  // Backtrack
  for (let frame = nFrames - 1; frame >= 0; frame--) {
    if (
      frame % Math.round(beatPeriod) ===
      Math.round(phaseOffset) % Math.round(beatPeriod)
    ) {
      beats.unshift((frame * hopLength) / sampleRate)
    }

    if (frame > 0) {
      currentState = path[frame][currentState]
    }
  }

  return beats
}

/**
 * Refined beat and downbeat detection using multi-band analysis
 */
export function refineBeatsAndDownbeats(audioData, sampleRate, tempo) {
  console.time('refine_beats_and_downbeats')

  // Multi-band onset strength
  const onsetStrength = onsetStrengthMulti(audioData, sampleRate)

  // Viterbi beat tracking for precise alignment
  const beats = viterbiBeats(onsetStrength, tempo, sampleRate)

  // Find downbeats using spectral flux patterns
  const downbeats = findDownbeatsFromBeats(audioData, beats, sampleRate)

  console.timeEnd('refine_beats_and_downbeats')

  return {
    beats: beats,
    downbeats: downbeats,
    onsetStrength: onsetStrength,
  }
}

/**
 * Find downbeats from beat positions using spectral patterns
 */
function findDownbeatsFromBeats(audioData, beats, sampleRate) {
  const downbeats = []
  const frameSize = 4096

  // Analyze spectral change at each beat
  const beatChanges = []

  for (let i = 0; i < beats.length; i++) {
    const beatSample = Math.floor(beats[i] * sampleRate)
    const prevBeatSample = i > 0 ? Math.floor(beats[i - 1] * sampleRate) : 0

    // Get spectral change magnitude
    const change = getSpectralChange(
      audioData,
      prevBeatSample,
      beatSample,
      frameSize,
    )

    beatChanges.push({
      time: beats[i],
      change: change,
      index: i,
    })
  }

  // Find peaks in spectral change (likely downbeats)
  for (let i = 0; i < beatChanges.length - 4; i++) {
    const current = beatChanges[i].change
    let isPeak = true

    // Check if this is a local maximum over 4 beats
    for (let j = 1; j <= 3; j++) {
      if (i + j < beatChanges.length && beatChanges[i + j].change > current) {
        isPeak = false
        break
      }
    }

    if (isPeak) {
      downbeats.push(beatChanges[i].time)
      i += 3 // Skip ahead
    }
  }

  // If we didn't find enough downbeats, use every 4th beat
  if (downbeats.length < 4) {
    return beats.filter((_, i) => i % 4 === 0)
  }

  return downbeats
}

/**
 * Calculate spectral change between two points
 */
function getSpectralChange(audioData, startSample, endSample, frameSize) {
  let frame1 = audioData.slice(
    Math.max(0, startSample - frameSize / 2),
    Math.min(audioData.length, startSample + frameSize / 2),
  )

  let frame2 = audioData.slice(
    Math.max(0, endSample - frameSize / 2),
    Math.min(audioData.length, endSample + frameSize / 2),
  )

  // Pad if necessary - create new arrays instead of reassigning
  if (frame1.length < frameSize) {
    const padded1 = new Float32Array(frameSize)
    padded1.set(frame1)
    frame1 = padded1
  }

  if (frame2.length < frameSize) {
    const padded2 = new Float32Array(frameSize)
    padded2.set(frame2)
    frame2 = padded2
  }

  // Compute FFTs
  const fft1 = fft(frame1)
  const fft2 = fft(frame2)

  // Calculate spectral difference
  let change = 0
  for (let i = 0; i < fft1.length; i += 2) {
    const mag1 = Math.sqrt(fft1[i] * fft1[i] + fft1[i + 1] * fft1[i + 1])
    const mag2 = Math.sqrt(fft2[i] * fft2[i] + fft2[i + 1] * fft2[i + 1])
    change += Math.abs(mag2 - mag1)
  }

  return change
}
