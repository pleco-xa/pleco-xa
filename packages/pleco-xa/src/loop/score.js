/**
 * Shared scoring helpers for the loop namespace.
 *
 * CONFIDENCE CONVENTION (Wave 3, unified across every strategy):
 *   confidence ∈ [0, 1], where the value is derived from a REAL measurement —
 *   the normalized cross-correlation (mean-subtracted, std-normalized) between
 *   the candidate loop segment and the audio that follows it, optionally
 *   weighted by strategy-specific quality factors (fade characteristics,
 *   beat alignment) that are themselves in [0, 1].
 *
 *   0    = no measurable repetition evidence
 *   1    = the loop segment repeats verbatim
 *
 *   Confidence is never fabricated: strategies that cannot measure anything
 *   THROW a diagnostic error instead of inventing a number. This replaces two
 *   legacy conventions: the 0–100 scale of loop-analyzer.js and the ×1000
 *   double-normalization of xa-loop.js (which pegged the precise path at 1.0).
 */

/** Clamp a number into [0, 1]. NaN clamps to 0. */
export function clamp01(x) {
  if (!(x > 0)) return 0
  return x < 1 ? x : 1
}

/**
 * Normalized cross-correlation (mean-subtracted, std-normalized) in [-1, 1].
 * Zero-variance input returns 0 (no evidence), never NaN.
 * @param {Float32Array|number[]} a
 * @param {Float32Array|number[]} b
 * @returns {number}
 */
export function normalizedCrossCorrelation(a, b) {
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

  let correlation = 0
  let std1 = 0
  let std2 = 0
  for (let i = 0; i < len; i++) {
    const d1 = a[i] - mean1
    const d2 = b[i] - mean2
    correlation += d1 * d2
    std1 += d1 * d1
    std2 += d2 * d2
  }

  const denominator = Math.sqrt(std1 * std2)
  if (denominator === 0) return 0
  return correlation / denominator
}

/**
 * Measure how well audioData loops at [startSec, endSec) by correlating the
 * loop segment against the audio that immediately follows it.
 * Returns a clamped confidence in [0, 1]; 0 when there is not enough trailing
 * audio (< 25% of the loop length) to measure anything.
 *
 * @param {Float32Array} audioData
 * @param {number} sampleRate
 * @param {number} startSec
 * @param {number} endSec
 * @returns {number} confidence in [0, 1]
 */
export function measureLoopConfidence(audioData, sampleRate, startSec, endSec) {
  const startSample = Math.max(0, Math.floor(startSec * sampleRate))
  const endSample = Math.min(audioData.length, Math.floor(endSec * sampleRate))
  const loopLength = endSample - startSample
  if (loopLength <= 0) return 0

  const available = Math.min(loopLength, audioData.length - endSample)
  if (available < loopLength * 0.25) return 0

  const a = audioData.subarray(startSample, startSample + available)
  const b = audioData.subarray(endSample, endSample + available)
  return clamp01(normalizedCrossCorrelation(a, b))
}
