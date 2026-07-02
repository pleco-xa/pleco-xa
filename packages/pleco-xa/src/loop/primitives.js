/**
 * Loop primitives — boundary snapping, loop-state control, timing scores.
 * Part of the flagship `loop` namespace (Wave 3 consolidation).
 */

import { debugLog } from '../scripts/debug.js'

export { calculateBeatAlignment } from '../scripts/musical-timing.js'

/**
 * Dynamic Zero Crossing with Micro Crossfades.
 * Maintains musical accuracy while ensuring clean audio boundaries.
 * All-static API: use `DynamicZeroCrossing.snap(...)` / `.optimizeLoopBoundaries(...)`.
 */
export class DynamicZeroCrossing {
  /**
   * Find optimal loop boundaries with zero crossing alignment
   * @param {Float32Array} audioData - Raw audio samples
   * @param {Object} musicalLoop - { start: 0-1, end: 0-1 } musical loop points
   * @param {number} sampleRate - Audio sample rate
   * @returns {Object} - Optimized loop with crossfade data
   */
  static optimizeLoopBoundaries(audioData, musicalLoop, sampleRate) {
    const startSample = Math.floor(musicalLoop.start * audioData.length)
    const endSample = Math.floor(musicalLoop.end * audioData.length)

    // Search window: ±5ms around musical points
    const searchWindow = Math.floor(0.005 * sampleRate) // 5ms

    // Find zero crossings near musical boundaries
    const startZero = this.findNearestZeroCrossing(
      audioData,
      startSample,
      searchWindow,
    )
    const endZero = this.findNearestZeroCrossing(
      audioData,
      endSample,
      searchWindow,
    )

    const result = {
      musical: musicalLoop,
      optimized: {
        start: startZero.sample / audioData.length,
        end: endZero.sample / audioData.length,
      },
      crossfades: [],
    }

    // Create micro crossfades if needed
    if (Math.abs(startZero.sample - startSample) > 10) {
      result.crossfades.push({
        type: 'start',
        musicalPoint: startSample,
        zeroPoint: startZero.sample,
        crossfadeDuration: Math.abs(startZero.sample - startSample),
      })
    }

    if (Math.abs(endZero.sample - endSample) > 10) {
      result.crossfades.push({
        type: 'end',
        musicalPoint: endSample,
        zeroPoint: endZero.sample,
        crossfadeDuration: Math.abs(endZero.sample - endSample),
      })
    }

    return result
  }

  /**
   * Find nearest zero crossing within search window
   * @param {Float32Array} audioData - Audio samples
   * @param {number} centerSample - Target sample position
   * @param {number} searchWindow - Samples to search around center
   * @returns {Object} - { sample: number, confidence: number, distanceFromMusical: number }
   */
  static findNearestZeroCrossing(audioData, centerSample, searchWindow) {
    const startSearch = Math.max(0, centerSample - searchWindow)
    const endSearch = Math.min(
      audioData.length - 1,
      centerSample + searchWindow,
    )

    let bestSample = centerSample
    let bestDistance = Math.abs(audioData[centerSample])

    for (let i = startSearch; i < endSearch - 1; i++) {
      // Check for zero crossing (sign change)
      if (audioData[i] >= 0 !== audioData[i + 1] >= 0) {
        const distance = Math.min(
          Math.abs(audioData[i]),
          Math.abs(audioData[i + 1]),
        )

        if (distance < bestDistance) {
          bestDistance = distance
          bestSample =
            Math.abs(audioData[i]) < Math.abs(audioData[i + 1]) ? i : i + 1
        }
      }
    }

    return {
      sample: bestSample,
      confidence: 1 - bestDistance, // Closer to zero = higher confidence
      distanceFromMusical: Math.abs(bestSample - centerSample),
    }
  }

  /**
   * Generate crossfade data for smooth loop transitions
   * @param {Object} crossfadeInfo - Crossfade configuration ({ crossfadeDuration })
   * @returns {{ fadeIn: Float32Array, fadeOut: Float32Array, length: number }}
   */
  static generateMicroCrossfade(crossfadeInfo) {
    const { crossfadeDuration } = crossfadeInfo
    const fadeLength = Math.min(crossfadeDuration, 441) // Max 10ms at 44.1kHz

    // Create fade curve (cosine for smooth transition)
    const fadeIn = new Float32Array(fadeLength)
    const fadeOut = new Float32Array(fadeLength)

    for (let i = 0; i < fadeLength; i++) {
      const position = i / fadeLength
      fadeIn[i] = Math.cos(((1 - position) * Math.PI) / 2) // Smooth fade in
      fadeOut[i] = Math.cos((position * Math.PI) / 2) // Smooth fade out
    }

    return { fadeIn, fadeOut, length: fadeLength }
  }

  /**
   * Snap raw start/end sample indices to the nearest zero-crossing within
   * ±searchWindow samples.
   *
   * @param {Float32Array} audioData
   * @param {number} startSample    initial start index (samples)
   * @param {number} endSample      initial end index   (samples)
   * @param {number} [searchWindow=441] - window half-width in samples (≈10 ms @ 44.1 kHz)
   * @returns {[number, number]}    [snappedStart, snappedEnd] sample indices
   */
  static snap(audioData, startSample, endSample, searchWindow = 441) {
    const startZero = this.findNearestZeroCrossing(
      audioData,
      Math.floor(startSample),
      searchWindow,
    )
    const endZero = this.findNearestZeroCrossing(
      audioData,
      Math.floor(endSample),
      searchWindow,
    )
    return [startZero.sample, endZero.sample]
  }
}

/**
 * Convenience wrapper over DynamicZeroCrossing.snap for callers that prefer a
 * plain function.
 * @param {Float32Array} audioData
 * @param {number} startSample
 * @param {number} endSample
 * @param {number} [searchWindow=441]
 * @returns {[number, number]} [snappedStart, snappedEnd]
 */
export function snapToZeroCrossings(
  audioData,
  startSample,
  endSample,
  searchWindow = 441,
) {
  return DynamicZeroCrossing.snap(audioData, startSample, endSample, searchWindow)
}

/**
 * Pleco-XA Loop Controller — dynamic loop manipulation with configurable
 * constraints. Pure state, environment-agnostic, result-object API.
 * Positions are normalized 0..1 over the buffer duration.
 */
export class LoopController {
  constructor(options = {}) {
    this.minLoopDuration = options.minLoopDuration || 0.05 // Default 50ms
    this.audioBuffer = null
    this.currentLoop = { start: 0, end: 1 }
  }

  /**
   * Set minimum loop duration
   * @param {number} durationSeconds - Minimum loop duration in seconds (e.g. 0.001 for 1ms)
   */
  setMinLoopDuration(durationSeconds) {
    this.minLoopDuration = durationSeconds
    debugLog(
      `Loop controller: Min duration set to ${durationSeconds * 1000}ms`,
    )
  }

  /**
   * Set audio buffer for loop calculations
   * @param {AudioBuffer} audioBuffer - Web Audio API AudioBuffer
   */
  setAudioBuffer(audioBuffer) {
    this.audioBuffer = audioBuffer
  }

  /**
   * Halve the current loop duration
   * @returns {Object} - { success: boolean, loop: Object, reason?: string }
   */
  halfLoop() {
    const duration = this.currentLoop.end - this.currentLoop.start
    const newDuration = duration / 2

    // Check against configurable minimum
    if (
      this.audioBuffer &&
      newDuration * this.audioBuffer.duration < this.minLoopDuration
    ) {
      return {
        success: false,
        loop: this.currentLoop,
        reason: `Loop would be smaller than minimum ${this.minLoopDuration * 1000}ms`,
      }
    }

    this.currentLoop.end = this.currentLoop.start + newDuration

    return {
      success: true,
      loop: { ...this.currentLoop },
      actualDurationMs: this.audioBuffer
        ? newDuration * this.audioBuffer.duration * 1000
        : null,
    }
  }

  /**
   * Double the current loop duration (symmetric to halfLoop).
   * The end is clamped to the buffer end (1.0); if the loop is already at the
   * maximum extent, the call fails with a reason.
   * @returns {Object} - { success: boolean, loop: Object, reason?: string, clamped?: boolean }
   */
  doubleLoop() {
    const duration = this.currentLoop.end - this.currentLoop.start
    const targetEnd = this.currentLoop.start + duration * 2
    const newEnd = Math.min(1, targetEnd)

    if (newEnd <= this.currentLoop.end) {
      return {
        success: false,
        loop: { ...this.currentLoop },
        reason: 'Loop already extends to the end of the buffer',
      }
    }

    this.currentLoop.end = newEnd

    return {
      success: true,
      loop: { ...this.currentLoop },
      clamped: targetEnd > 1,
      actualDurationMs: this.audioBuffer
        ? (newEnd - this.currentLoop.start) * this.audioBuffer.duration * 1000
        : null,
    }
  }

  /**
   * Move loop forward by its current duration
   * @returns {Object} - { success: boolean, loop: Object, reason?: string }
   */
  moveLoopForward() {
    const duration = this.currentLoop.end - this.currentLoop.start

    // Check if there's enough space
    if (this.currentLoop.start + duration >= 1) {
      return {
        success: false,
        loop: this.currentLoop,
        reason: 'Not enough space for current loop size',
      }
    }

    const newStart = this.currentLoop.start + duration
    const newEnd = Math.min(this.currentLoop.end + duration, 1)

    this.currentLoop.start = newStart
    this.currentLoop.end = newEnd

    return {
      success: true,
      loop: { ...this.currentLoop },
    }
  }

  /**
   * Reset loop to full audio duration
   * @returns {Object} - { success: boolean, loop: Object }
   */
  resetLoop() {
    this.currentLoop = { start: 0, end: 1 }

    return {
      success: true,
      loop: { ...this.currentLoop },
    }
  }

  /**
   * Get current loop boundaries
   * @returns {Object} - { start: number, end: number }
   */
  getCurrentLoop() {
    return { ...this.currentLoop }
  }

  /**
   * Set custom loop boundaries
   * @param {number} start - Start position (0-1)
   * @param {number} end - End position (0-1)
   * @returns {Object} - { success: boolean, loop: Object, reason?: string }
   */
  setLoop(start, end) {
    if (start < 0 || end > 1 || start >= end) {
      return {
        success: false,
        loop: this.currentLoop,
        reason: 'Invalid loop boundaries',
      }
    }

    const duration = end - start

    // Check minimum duration
    if (
      this.audioBuffer &&
      duration * this.audioBuffer.duration < this.minLoopDuration
    ) {
      return {
        success: false,
        loop: this.currentLoop,
        reason: `Loop would be smaller than minimum ${this.minLoopDuration * 1000}ms`,
      }
    }

    this.currentLoop = { start, end }

    return {
      success: true,
      loop: { ...this.currentLoop },
    }
  }
}
