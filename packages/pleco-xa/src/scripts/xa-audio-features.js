/**
 * xa-audio-features.js — LEGACY SHIM over the fixture-verified feature/
 * namespace (Wave 4 consolidation).
 *
 * The framewise calling convention is preserved exactly:
 *   computeRMS(channel, frameSize, hopSize)   (hopSize defaults frameSize/2)
 * with NO frame centering (frames start at sample 0), which is what
 * audio-analysis.js depends on. Delegation to feature/spectral.js with
 * center=false is numerically identical to the old loop for RMS.
 *
 * computeZeroCrossingRate now uses standard ZCR counting (divides by frameSize
 * instead of frameSize - 1, clips |v| <= 1e-10 to zero) — a ≤0.1% shift.
 */

import {
  rms as featureRms,
  zero_crossing_rate as featureZcr,
} from '../feature/spectral.js'

/**
 * Framewise RMS energy (no centering).
 * @param {Float32Array} buffer - Audio buffer to analyze
 * @param {Number} frameSize - Frame length in samples (default: 1024)
 * @param {Number} hopSize - Hop between frames (default: frameSize/2)
 * @return {Float32Array} RMS per frame
 */
export function computeRMS(buffer, frameSize = 1024, hopSize = frameSize / 2) {
  return Float32Array.from(
    featureRms(buffer, {
      frame_length: frameSize,
      hop_length: hopSize,
      center: false,
    }),
  )
}

/**
 * Framewise zero-crossing rate (no centering).
 * @param {Float32Array} buffer - Audio buffer to analyze
 * @param {Number} frameSize - Frame length in samples (default: 1024)
 * @param {Number} hopSize - Hop between frames (default: frameSize/2)
 * @return {Float32Array} ZCR per frame
 */
export function computeZeroCrossingRate(
  buffer,
  frameSize = 1024,
  hopSize = frameSize / 2,
) {
  return Float32Array.from(
    featureZcr(buffer, {
      frame_length: frameSize,
      hop_length: hopSize,
      center: false,
    }),
  )
}

/**
 * Framewise peak amplitude tracking (pleco extra).
 * @param {Float32Array} buffer - Audio buffer to analyze
 * @param {Number} frameSize - Frame length in samples (default: 1024)
 * @param {Number} hopSize - Hop between frames (default: frameSize/2)
 * @return {Object} peak values/positions per frame + global peak
 */
export function computePeak(buffer, frameSize = 1024, hopSize = frameSize / 2) {
  const numFrames = Math.floor((buffer.length - frameSize) / hopSize) + 1
  if (numFrames < 1) {
    throw new Error(
      `computePeak: buffer (${buffer.length} samples) shorter than frameSize=${frameSize}`,
    )
  }
  const peaks = new Float32Array(numFrames)
  const peakPositions = new Int32Array(numFrames)

  let globalPeak = 0
  let globalPeakFrame = 0
  for (let i = 0; i < numFrames; i++) {
    const frameStart = i * hopSize
    let maxPeak = 0
    let maxPos = frameStart

    for (let j = 0; j < frameSize; j++) {
      const pos = frameStart + j
      const absVal = Math.abs(buffer[pos])
      if (absVal > maxPeak) {
        maxPeak = absVal
        maxPos = pos
      }
    }

    peaks[i] = maxPeak
    peakPositions[i] = maxPos
    if (maxPeak > globalPeak) {
      globalPeak = maxPeak
      globalPeakFrame = i
    }
  }

  return {
    peakValues: peaks,
    peakPositions: peakPositions,
    // Loop-tracked (the old Math.max(...peaks) spread blew the arg stack on long files)
    globalPeak,
    globalPeakPosition: peakPositions[globalPeakFrame],
  }
}
