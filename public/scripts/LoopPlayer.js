/**
 * Simple, reliable audio loop player class
 * Part of Pleco Xa audio analysis engine
 */

import { debugLog } from '../utils/debug.js'

export class LoopPlayer {
  constructor(audioBuffer) {
    this.audioBuffer = audioBuffer
    this.audioContext = new (window.AudioContext || window.webkitAudioContext)()
    this.source = null
    this.gainNode = null
    this.isPlaying = false
    this.loopStart = 0
    this.loopEnd = audioBuffer.duration
    this.startTime = 0
  }

  setLoopPoints(start, end) {
    this.loopStart = start
    this.loopEnd = end
  }

  async play() {
    this.stop()

    // Resume audio context if suspended (required by modern browsers)
    if (this.audioContext.state === 'suspended') {
      try {
        await this.audioContext.resume()
        debugLog('Audio context resumed')
      } catch (error) {
        console.error('Failed to resume audio context:', error)
        return
      }
    }

    this.source = this.audioContext.createBufferSource()
    this.gainNode = this.audioContext.createGain()

    this.source.buffer = this.audioBuffer
    this.source.loop = true
    this.source.loopStart = this.loopStart
    this.source.loopEnd = this.loopEnd

    this.source.connect(this.gainNode)
    this.gainNode.connect(this.audioContext.destination)
    this.gainNode.gain.value = 0.5

    try {
      debugLog(`Audio buffer duration: ${this.audioBuffer.duration}s`)
      debugLog(`Audio buffer sample rate: ${this.audioBuffer.sampleRate}Hz`)
      debugLog(`Loop start: ${this.loopStart}s, Loop end: ${this.loopEnd}s`)

      this.source.start(0, this.loopStart)
      this.isPlaying = true
      this.startTime = this.audioContext.currentTime

      debugLog(
        `Playing loop: ${this.loopStart.toFixed(3)}s - ${this.loopEnd.toFixed(3)}s`,
      )
      debugLog(`Audio context state: ${this.audioContext.state}`)

      // Test if audio is actually playing
      setTimeout(() => {
        debugLog(
          `Audio context time after 100ms: ${this.audioContext.currentTime}`,
        )
      }, 100)
    } catch (error) {
      console.error('Failed to start audio:', error)
    }
  }

  stop() {
    if (this.source) {
      this.source.stop()
      this.source = null
    }
    this.isPlaying = false
  }

  setVolume(volume) {
    if (this.gainNode) {
      this.gainNode.gain.value = volume
    }
  }
}
