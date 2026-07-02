// @ts-check
/**
 * Pleco-XA Loop Controller Module
 * Dynamic loop manipulation with configurable constraints
 */

import { debugLog } from './debug.js'

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
