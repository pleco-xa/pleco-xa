// src/utils/DopplerScroll.js

/**
 * Base DopplerScroll class for audio transitions based on scroll position
 */
export class DopplerScroll {
  constructor(options = {}) {
    // Initialize Web Audio context
    this.context =
      options.context ||
      new (window.AudioContext || window.webkitAudioContext)()

    // Set up event emitter
    this.emitter = options.emitter || {
      callbacks: {},
      on(event, callback) {
        this.callbacks[event] = this.callbacks[event] || []
        this.callbacks[event].push(callback)
      },
      emit(event, data) {
        if (this.callbacks[event]) {
          this.callbacks[event].forEach((callback) => callback(data))
        }
      },
    }

    // Initialize audio nodes
    this.loops = {
      loop1: {
        buffer: null,
        source: null,
        gain: this.context.createGain(),
        filter: this.context.createBiquadFilter(),
        spatialPanner: this.context.createStereoPanner(),
      },
      loop2: {
        buffer: null,
        source: null,
        gain: this.context.createGain(),
        filter: this.context.createBiquadFilter(),
        spatialPanner: this.context.createStereoPanner(),
      },
    }

    // Set up audio routing
    this.masterGain = this.context.createGain()
    this.masterGain.connect(this.context.destination)

    // Connect loop1 nodes
    this.loops.loop1.filter.type = 'highpass'
    this.loops.loop1.filter.frequency.value = 20
    this.loops.loop1.gain.connect(this.loops.loop1.filter)
    this.loops.loop1.filter.connect(this.loops.loop1.spatialPanner)
    this.loops.loop1.spatialPanner.connect(this.masterGain)

    // Connect loop2 nodes
    this.loops.loop2.filter.type = 'lowpass'
    this.loops.loop2.filter.frequency.value = 20000
    this.loops.loop2.gain.connect(this.loops.loop2.filter)
    this.loops.loop2.filter.connect(this.loops.loop2.spatialPanner)
    this.loops.loop2.spatialPanner.connect(this.masterGain)

    // Initialize state
    this.state = {
      isPlaying: false,
      isTransitioning: false,
      scrollProgress: 0,
      currentMaster: 'loop1',
    }

    // Initialize tempo data
    this.tempoData = {
      loop1: {
        bpm: 120,
        beatGrid: [],
        loopPoints: { start: 0, end: 0 },
      },
      loop2: {
        bpm: 120,
        beatGrid: [],
        loopPoints: { start: 0, end: 0 },
      },
    }
  }

  /**
   * Load audio loops
   */
  async loadLoops(loop1Url, loop2Url) {
    try {
      // Fetch and decode audio files
      const [buffer1, buffer2] = await Promise.all([
        this.fetchAudioBuffer(loop1Url),
        this.fetchAudioBuffer(loop2Url),
      ])

      this.loops.loop1.buffer = buffer1
      this.loops.loop2.buffer = buffer2

      // Basic analysis
      this.analyzeLoops()

      this.emitter.emit('loopsLoaded', { loop1: buffer1, loop2: buffer2 })
    } catch (error) {
      console.error('Error loading loops:', error)
      this.emitter.emit('loadError', error)
    }
  }

  /**
   * Fetch and decode audio buffer
   */
  async fetchAudioBuffer(url) {
    const response = await fetch(url)
    const arrayBuffer = await response.arrayBuffer()
    return await this.context.decodeAudioData(arrayBuffer)
  }

  /**
   * Basic loop analysis
   */
  analyzeLoops() {
    // Simple loop points (full buffer)
    this.tempoData.loop1.loopPoints = {
      start: 0,
      end: this.loops.loop1.buffer.duration,
    }

    this.tempoData.loop2.loopPoints = {
      start: 0,
      end: this.loops.loop2.buffer.duration,
    }
  }

  /**
   * Start playback
   */
  play() {
    if (this.state.isPlaying) return

    // Create and connect audio sources
    this.loops.loop1.source = this.context.createBufferSource()
    this.loops.loop1.source.buffer = this.loops.loop1.buffer
    this.loops.loop1.source.loop = true
    this.loops.loop1.source.connect(this.loops.loop1.gain)

    this.loops.loop2.source = this.context.createBufferSource()
    this.loops.loop2.source.buffer = this.loops.loop2.buffer
    this.loops.loop2.source.loop = true
    this.loops.loop2.source.connect(this.loops.loop2.gain)

    // Set loop points
    this.loops.loop1.source.loopStart = this.tempoData.loop1.loopPoints.start
    this.loops.loop1.source.loopEnd = this.tempoData.loop1.loopPoints.end

    this.loops.loop2.source.loopStart = this.tempoData.loop2.loopPoints.start
    this.loops.loop2.source.loopEnd = this.tempoData.loop2.loopPoints.end

    // Start playback
    this.loops.loop1.source.start(0, this.tempoData.loop1.loopPoints.start)
    this.loops.loop2.source.start(0, this.tempoData.loop2.loopPoints.start)

    // Set initial volumes
    this.loops.loop1.gain.gain.value = 1
    this.loops.loop2.gain.gain.value = 0

    this.state.isPlaying = true
    this.state.currentMaster = 'loop1'

    this.emitter.emit('playbackStarted')
  }

  /**
   * Stop playback
   */
  stop() {
    if (!this.state.isPlaying) return

    // Stop and disconnect sources
    if (this.loops.loop1.source) {
      this.loops.loop1.source.stop()
      this.loops.loop1.source.disconnect()
      this.loops.loop1.source = null
    }

    if (this.loops.loop2.source) {
      this.loops.loop2.source.stop()
      this.loops.loop2.source.disconnect()
      this.loops.loop2.source = null
    }

    this.state.isPlaying = false
    this.emitter.emit('playbackStopped')
  }

  /**
   * Update scroll position (0-1)
   */
  updateScrollPosition(position) {
    // Clamp position between 0 and 1
    const clampedPosition = Math.max(0, Math.min(1, position))
    this.state.scrollProgress = clampedPosition

    // Define transition zones
    if (clampedPosition < 0.33) {
      // Loop 1 zone
      this.setLoop1State()
    } else if (clampedPosition > 0.66) {
      // Loop 2 zone
      this.setLoop2State()
    } else {
      // Transition zone
      this.setTransitionState(clampedPosition)
    }

    this.emitter.emit('scrollUpdate', clampedPosition)
  }

  /**
   * Set state for loop 1 dominance
   */
  setLoop1State() {
    this.state.isTransitioning = false

    // Set volumes
    this.loops.loop1.gain.gain.linearRampToValueAtTime(
      1,
      this.context.currentTime + 0.05,
    )
    this.loops.loop2.gain.gain.linearRampToValueAtTime(
      0,
      this.context.currentTime + 0.05,
    )

    // Reset filters
    this.loops.loop1.filter.frequency.linearRampToValueAtTime(
      20,
      this.context.currentTime + 0.05,
    )
    this.loops.loop2.filter.frequency.linearRampToValueAtTime(
      20000,
      this.context.currentTime + 0.05,
    )

    // Set master loop
    if (this.state.currentMaster !== 'loop1') {
      this.switchMaster('loop1')
    }
  }

  /**
   * Set state for loop 2 dominance
   */
  setLoop2State() {
    this.state.isTransitioning = false

    // Set volumes
    this.loops.loop1.gain.gain.linearRampToValueAtTime(
      0,
      this.context.currentTime + 0.05,
    )
    this.loops.loop2.gain.gain.linearRampToValueAtTime(
      1,
      this.context.currentTime + 0.05,
    )

    // Reset filters
    this.loops.loop1.filter.frequency.linearRampToValueAtTime(
      20,
      this.context.currentTime + 0.05,
    )
    this.loops.loop2.filter.frequency.linearRampToValueAtTime(
      20000,
      this.context.currentTime + 0.05,
    )

    // Set master loop
    if (this.state.currentMaster !== 'loop2') {
      this.switchMaster('loop2')
    }
  }

  /**
   * Set state for transition between loops
   */
  setTransitionState(progress) {
    this.state.isTransitioning = true

    // Calculate transition progress (0-1 within transition zone)
    const transitionProgress = (progress - 0.33) / 0.33

    // Simple crossfade
    const loop1Volume = 1 - transitionProgress
    const loop2Volume = transitionProgress

    this.loops.loop1.gain.gain.linearRampToValueAtTime(
      loop1Volume,
      this.context.currentTime + 0.05,
    )
    this.loops.loop2.gain.gain.linearRampToValueAtTime(
      loop2Volume,
      this.context.currentTime + 0.05,
    )

    // Simple filter crossover
    const loop1HighpassFreq = 20 + transitionProgress * 1000
    const loop2LowpassFreq = 20000 - transitionProgress * 10000

    this.loops.loop1.filter.frequency.linearRampToValueAtTime(
      loop1HighpassFreq,
      this.context.currentTime + 0.05,
    )
    this.loops.loop2.filter.frequency.linearRampToValueAtTime(
      loop2LowpassFreq,
      this.context.currentTime + 0.05,
    )

    // Switch master at midpoint
    if (transitionProgress >= 0.5 && this.state.currentMaster === 'loop1') {
      this.switchMaster('loop2')
    } else if (
      transitionProgress < 0.5 &&
      this.state.currentMaster === 'loop2'
    ) {
      this.switchMaster('loop1')
    }
  }

  /**
   * Switch master loop
   */
  switchMaster(newMaster) {
    this.state.currentMaster = newMaster
    this.emitter.emit('masterChanged', newMaster)
  }

  /**
   * Set master volume
   */
  setVolume(volume) {
    this.masterGain.gain.linearRampToValueAtTime(
      volume,
      this.context.currentTime + 0.05,
    )
  }

  /**
   * Clean up resources
   */
  dispose() {
    this.stop()

    // Disconnect all nodes
    this.loops.loop1.gain.disconnect()
    this.loops.loop1.filter.disconnect()
    this.loops.loop1.spatialPanner.disconnect()

    this.loops.loop2.gain.disconnect()
    this.loops.loop2.filter.disconnect()
    this.loops.loop2.spatialPanner.disconnect()

    this.masterGain.disconnect()
  }
}
