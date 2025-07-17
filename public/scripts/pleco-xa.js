/**
 * Pleco-XA: Main class that combines all audio analysis features
 * This is the main entry point for the Pleco-XA library
 */

import { AudioPlayer } from './analysis/AudioPlayer.ts'
import { LoopController } from './loop-controller.js'
import { enqueueToast } from './ui/toastQueue.js'

export class PlecoXA {
  constructor(options = {}) {
    this.audioPlayer = new AudioPlayer(options)
    this.loopController = new LoopController(options)
    this.currentAudioBuffer = null
    this.currentSource = null
    this.audioContext =
      options.audioContext ||
      new (window.AudioContext ||
        window.webkitAudioContext ||
        function () {
          throw new Error('AudioContext not supported')
        })()
    this.currentLoop = { start: 0, end: 1 }
    this.currentBPM = 0
  }

  /**
   * Load audio from file or URL
   * @param {string|File|Blob} source - Audio source
   * @returns {Promise<AudioBuffer>} - The decoded audio buffer
   */
  async loadAudio(source) {
    try {
      await this.audioPlayer.load(source)
      this.currentAudioBuffer = this.audioPlayer.audioBuffer
      this.loopController.setAudioBuffer(this.currentAudioBuffer)
      return this.currentAudioBuffer
    } catch (error) {
      console.error('Error loading audio:', error)
      throw error
    }
  }

  /**
   * Play the loaded audio
   * @returns {Promise<void>}
   */
  async playAudio() {
    if (!this.currentAudioBuffer) {
      throw new Error('No audio loaded')
    }

    try {
      if (this.audioContext.state === 'suspended') {
        await this.audioContext.resume()
      }

      this.audioPlayer.play()

      // Update UI if in browser environment
      if (typeof document !== 'undefined') {
        const playBtn = document.getElementById('playBtn')
        if (playBtn) playBtn.textContent = '⏸️ Pause'
      }

      return true
    } catch (error) {
      console.error('Error playing audio:', error)
      throw error
    }
  }

  /**
   * Stop audio playback
   */
  stopAudio() {
    this.audioPlayer.stop()

    // Update UI if in browser environment
    if (typeof document !== 'undefined') {
      const playBtn = document.getElementById('playBtn')
      if (playBtn) playBtn.textContent = '▶️ Play'
    }
  }

  /**
   * Analyze audio to detect BPM and other features
   * @returns {Promise<Object>} Analysis results
   */
  async analyzeAudio() {
    if (!this.currentAudioBuffer) {
      throw new Error('No audio loaded')
    }

    try {
      // Simple BPM detection algorithm
      const channelData = this.currentAudioBuffer.getChannelData(0)
      const sampleRate = this.currentAudioBuffer.sampleRate

      // Calculate energy over time
      const frameSize = 1024
      const hopSize = 512
      const frames = []

      for (let i = 0; i < channelData.length - frameSize; i += hopSize) {
        let energy = 0
        for (let j = 0; j < frameSize; j++) {
          energy += Math.abs(channelData[i + j])
        }
        frames.push(energy)
      }

      // Find peaks in energy
      const peaks = []
      const threshold = 0.5

      for (let i = 2; i < frames.length - 2; i++) {
        if (
          frames[i] > frames[i - 1] &&
          frames[i] > frames[i - 2] &&
          frames[i] > frames[i + 1] &&
          frames[i] > frames[i + 2] &&
          frames[i] > threshold
        ) {
          peaks.push(i)
        }
      }

      // Calculate intervals between peaks
      const intervals = []
      for (let i = 1; i < peaks.length; i++) {
        intervals.push(peaks[i] - peaks[i - 1])
      }

      // Calculate BPM from intervals
      const avgInterval =
        intervals.reduce((sum, val) => sum + val, 0) / intervals.length
      const bpm = 60 / ((avgInterval * hopSize) / sampleRate)

      // Round to nearest integer
      this.currentBPM = Math.round(bpm)

      // Update UI if in browser environment
      if (typeof document !== 'undefined') {
        const bpmValue = document.getElementById('bpmValue')
        if (bpmValue) bpmValue.textContent = this.currentBPM
      }

      return {
        bpm: this.currentBPM,
        peaks: peaks.length,
        duration: this.currentAudioBuffer.duration,
      }
    } catch (error) {
      console.error('Error analyzing audio:', error)
      throw error
    }
  }

  /**
   * Update track information in the UI
   * @param {string} name - Track name
   * @param {string} status - Track status
   */
  updateTrackInfo(name, status) {
    if (typeof document !== 'undefined') {
      const trackName = document.getElementById('trackName')
      const trackStatus = document.getElementById('trackStatus')

      if (trackName) trackName.textContent = name
      if (trackStatus) trackStatus.textContent = status
    }
  }

  /**
   * Update loop information in the UI
   */
  updateLoopInfo() {
    if (typeof document === 'undefined' || !this.currentAudioBuffer) return

    const loopInfo = document.getElementById('loopInfo')
    if (!loopInfo) return

    const loop = this.loopController.getCurrentLoop()
    const duration = this.currentAudioBuffer.duration
    const loopDuration = (loop.end - loop.start) * duration

    // Calculate bars based on BPM
    let barsText = 'Full Track'
    if (this.currentBPM > 0) {
      const beatsPerSecond = this.currentBPM / 60
      const totalBeats = loopDuration * beatsPerSecond
      const bars = totalBeats / 4 // Assuming 4/4 time signature
      barsText = `${bars.toFixed(1)} bars`
    }

    loopInfo.textContent = `${loopDuration.toFixed(2)}s (${barsText})`
  }

  /**
   * Draw waveform on canvas
   */
  drawWaveform() {
    if (typeof document === 'undefined' || !this.currentAudioBuffer) return

    const canvas = document.getElementById('waveformCanvas')
    if (!canvas) return

    const ctx = canvas.getContext('2d')
    const width = canvas.width
    const height = canvas.height

    // Clear canvas
    ctx.clearRect(0, 0, width, height)

    // Get audio data
    const channelData = this.currentAudioBuffer.getChannelData(0)
    const step = Math.ceil(channelData.length / width)

    // Draw waveform
    ctx.beginPath()
    ctx.strokeStyle = '#2196F3'
    ctx.lineWidth = 2

    for (let i = 0; i < width; i++) {
      const dataIndex = i * step
      let min = 1.0
      let max = -1.0

      // Find min/max in this segment
      for (let j = 0; j < step; j++) {
        const datum = channelData[dataIndex + j]
        if (datum < min) min = datum
        if (datum > max) max = datum
      }

      // Draw min/max as a vertical line
      const y1 = ((1 + min) * height) / 2
      const y2 = ((1 + max) * height) / 2
      ctx.moveTo(i, y1)
      ctx.lineTo(i, y2)
    }

    ctx.stroke()

    // Draw loop region if set
    const loop = this.loopController.getCurrentLoop()
    if (loop.start > 0 || loop.end < 1) {
      const loopStart = Math.floor(loop.start * width)
      const loopEnd = Math.ceil(loop.end * width)

      ctx.fillStyle = 'rgba(33, 150, 243, 0.3)'
      ctx.fillRect(loopStart, 0, loopEnd - loopStart, height)
    }
  }

  /**
   * Show error message
   * @param {string} message - Error message
   */
  showError(message) {
    if (typeof document === 'undefined') {
      console.error(message)
      return
    }

    enqueueToast(message, 5000)
  }

  /**
   * Halve the current loop duration
   */
  halfLoop() {
    const result = this.loopController.halfLoop()
    if (result.success) {
      this.currentLoop = result.loop
      this.updateLoopInfo()
      this.drawWaveform()
    } else {
      this.showError(result.reason)
    }
    return result
  }

  /**
   * Double the current loop duration
   */
  doubleLoop() {
    const currentLoop = this.loopController.getCurrentLoop()
    const duration = currentLoop.end - currentLoop.start
    const newEnd = Math.min(currentLoop.start + duration * 2, 1)

    const result = this.loopController.setLoop(currentLoop.start, newEnd)
    if (result.success) {
      this.currentLoop = result.loop
      this.updateLoopInfo()
      this.drawWaveform()
    } else {
      this.showError(result.reason)
    }
    return result
  }

  /**
   * Move loop forward
   */
  moveForward() {
    const result = this.loopController.moveLoopForward()
    if (result.success) {
      this.currentLoop = result.loop
      this.updateLoopInfo()
      this.drawWaveform()
    } else {
      this.showError(result.reason)
    }
    return result
  }
}

// Make these functions available globally for the tests
if (typeof window !== 'undefined') {
  window.halfLoop = function () {
    if (window.plecoXA) return window.plecoXA.halfLoop()
  }

  window.doubleLoop = function () {
    if (window.plecoXA) return window.plecoXA.doubleLoop()
  }

  window.moveForward = function () {
    if (window.plecoXA) return window.plecoXA.moveForward()
  }

  window.playAudio = async function () {
    if (window.plecoXA) return await window.plecoXA.playAudio()
  }

  window.stopAudio = function () {
    if (window.plecoXA) return window.plecoXA.stopAudio()
  }

  window.updateTrackInfo = function (name, status) {
    if (window.plecoXA) return window.plecoXA.updateTrackInfo(name, status)
  }

  window.updateLoopInfo = function () {
    if (window.plecoXA) return window.plecoXA.updateLoopInfo()
  }

  window.analyzeAudio = async function () {
    if (window.plecoXA) return await window.plecoXA.analyzeAudio()
  }

  window.showError = function (message) {
    if (window.plecoXA) return window.plecoXA.showError(message)
  }

  window.drawWaveform = function () {
    if (window.plecoXA) return window.plecoXA.drawWaveform()
  }
}
