// @ts-check
/**
 * AudioPlayer - Framework-agnostic audio playback controller
 * Wraps Web Audio API with a clean, event-driven interface
 *
 * Inspired by GSAP's approach: imperative API that works anywhere
 *
 * @author Pleco-XA Audio Analysis Suite
 * @version 1.0.0
 */

/**
 * @typedef {Object} AudioPlayerOptions
 * @property {AudioContext} [audioContext] - Existing audio context
 * @property {number} [volume=1.0] - Initial volume (0.0 to 1.0)
 * @property {boolean} [autoplay=false] - Whether to autoplay when loaded
 * @property {boolean} [loop=false] - Whether to loop by default
 */

/**
 * @typedef {Object} LoopRegion
 * @property {number} start - Start time in seconds
 * @property {number} end - End time in seconds
 */

/**
 * @typedef {Object} PlaybackState
 * @property {boolean} isPlaying - Whether audio is currently playing
 * @property {boolean} isPaused - Whether audio is paused
 * @property {number} currentTime - Current playback time in seconds
 * @property {number} duration - Total duration in seconds
 * @property {number} volume - Current volume (0.0 to 1.0)
 * @property {LoopRegion|null} loop - Current loop region or null
 */

/**
 * Event-driven AudioPlayer class for framework-agnostic audio control
 *
 * @example
 * // Basic usage
 * const player = new AudioPlayer();
 * await player.load('song.mp3');
 * player.setLoop(10.0, 20.5);
 * player.play();
 *
 * // Event handling
 * player.on('timeupdate', (time) => console.log('Current time:', time));
 * player.on('loopchange', (loop) => console.log('Loop changed:', loop));
 */
export class AudioPlayer {
  /**
   * Create a new AudioPlayer instance
   * @param {AudioPlayerOptions} [options={}] - Configuration options
   */
  constructor(options = {}) {
    // Private properties
    this._audioContext = options.audioContext || null
    this._audioBuffer = null
    this._source = null
    this._gainNode = null

    this._isPlaying = false
    this._isPaused = false
    this._startTime = 0
    this._pauseTime = 0
    this._currentTime = 0
    this._duration = 0
    this._volume = options.volume ?? 1.0
    this._loop = null

    this._animationFrame = null
    this._eventListeners = new Map()

    // Lazy initialization - only create context when needed
    if (typeof window !== 'undefined') {
      this._setupAudioContext()
    }
  }

  /**
   * Get or create Web Audio API context
   * @returns {AudioContext} The audio context
   */
  get audioContext() {
    if (!this._audioContext) {
      this._setupAudioContext()
    }
    return this._audioContext
  }

  /**
   * Get current audio buffer
   * @returns {AudioBuffer|null} The loaded audio buffer
   */
  get audioBuffer() {
    return this._audioBuffer
  }

  /**
   * Get current playback state
   * @returns {PlaybackState} Current state information
   */
  get state() {
    return {
      isPlaying: this._isPlaying,
      isPaused: this._isPaused,
      currentTime: this.getCurrentTime(),
      duration: this._duration,
      volume: this._volume,
      loop: this._loop,
    }
  }

  /**
   * Load audio from various sources
   * @param {string|File|AudioBuffer} source - URL, File object, or AudioBuffer
   * @returns {Promise<void>} Promise that resolves when audio is loaded
   */
  async load(source) {
    try {
      if (source instanceof AudioBuffer) {
        this._audioBuffer = source
      } else {
        let arrayBuffer

        if (typeof source === 'string') {
          // Load from URL
          const response = await fetch(source)
          if (!response.ok) {
            throw new Error(`Failed to fetch audio: ${response.status}`)
          }
          arrayBuffer = await response.arrayBuffer()
        } else if (source instanceof File) {
          // Load from File
          arrayBuffer = await source.arrayBuffer()
        } else {
          throw new Error(
            'Invalid source type. Must be URL, File, or AudioBuffer.',
          )
        }

        this._audioBuffer = await this.audioContext.decodeAudioData(arrayBuffer)
      }

      this._duration = this._audioBuffer.duration
      this._emit('loaded', this._audioBuffer)
    } catch (error) {
      this._emit('error', error)
      throw error
    }
  }

  /**
   * Start playback
   * @throws {Error} If no audio is loaded
   */
  play() {
    if (!this._audioBuffer) {
      throw new Error('No audio loaded. Call load() first.')
    }

    if (this._isPlaying) {
      return // Already playing
    }

    try {
      this._createSource()

      const startTime = this._isPaused ? this._pauseTime : 0
      const offset = this._loop ? this._loop.start : startTime
      const duration = this._loop
        ? this._loop.end - this._loop.start
        : undefined

      this._source.start(0, offset, duration)
      this._startTime = this.audioContext.currentTime - startTime
      this._isPlaying = true
      this._isPaused = false

      this._startTimeTracking()
      this._emit('play')
    } catch (error) {
      this._emit('error', error)
      throw error
    }
  }

  /**
   * Pause playback
   */
  pause() {
    if (!this._isPlaying) {
      return
    }

    this._pauseTime = this.getCurrentTime()
    this._stop()
    this._isPaused = true
    this._emit('pause')
  }

  /**
   * Stop playback and reset position
   */
  stop() {
    this._stop()
    this._pauseTime = 0
    this._currentTime = 0
    this._isPaused = false
    this._emit('stop')
  }

  /**
   * Set volume level
   * @param {number} volume - Volume level (0.0 to 1.0)
   */
  setVolume(volume) {
    this._volume = Math.max(0, Math.min(1, volume))

    if (this._gainNode) {
      this._gainNode.gain.value = this._volume
    }

    this._emit('volumechange', this._volume)
  }

  /**
   * Set loop region
   * @param {number} start - Start time in seconds
   * @param {number} end - End time in seconds
   * @throws {Error} If no audio is loaded
   */
  setLoop(start, end) {
    if (!this._audioBuffer) {
      throw new Error('No audio loaded. Call load() first.')
    }

    const duration = this._audioBuffer.duration
    start = Math.max(0, Math.min(start, duration))
    end = Math.max(start, Math.min(end, duration))

    this._loop = { start, end }
    this._emit('loopchange', this._loop)

    // If playing, restart with new loop
    if (this._isPlaying) {
      const wasPlaying = this._isPlaying
      this.stop()
      if (wasPlaying) {
        this.play()
      }
    }
  }

  /**
   * Clear loop region (play entire track)
   */
  clearLoop() {
    this._loop = null
    this._emit('loopchange', null)
  }

  /**
   * Seek to specific time
   * @param {number} time - Time in seconds
   * @throws {Error} If no audio is loaded
   */
  seek(time) {
    if (!this._audioBuffer) {
      throw new Error('No audio loaded. Call load() first.')
    }

    time = Math.max(0, Math.min(time, this._duration))

    const wasPlaying = this._isPlaying
    this.stop()
    this._pauseTime = time
    this._currentTime = time

    if (wasPlaying) {
      this._isPaused = true
      this.play()
    }

    this._emit('seek', time)
  }

  /**
   * Get current playback time
   * @returns {number} Current time in seconds
   */
  getCurrentTime() {
    if (this._isPlaying) {
      const elapsed = this.audioContext.currentTime - this._startTime
      this._currentTime = this._isPaused ? this._pauseTime : elapsed

      // Handle looping
      if (this._loop) {
        const loopDuration = this._loop.end - this._loop.start
        const loopTime = (this._currentTime - this._loop.start) % loopDuration
        this._currentTime = this._loop.start + loopTime
      }
    }

    return this._currentTime
  }

  /**
   * Add event listener
   * @param {string} event - Event name (play, pause, stop, timeupdate, etc.)
   * @param {Function} callback - Event callback function
   */
  on(event, callback) {
    if (!this._eventListeners.has(event)) {
      this._eventListeners.set(event, [])
    }
    this._eventListeners.get(event).push(callback)
  }

  /**
   * Remove event listener
   * @param {string} event - Event name
   * @param {Function} callback - Callback function to remove
   */
  off(event, callback) {
    const listeners = this._eventListeners.get(event)
    if (listeners) {
      const index = listeners.indexOf(callback)
      if (index > -1) {
        listeners.splice(index, 1)
      }
    }
  }

  /**
   * Clean up resources (important for web apps)
   */
  dispose() {
    this.stop()
    this._eventListeners.clear()

    if (this._audioContext && this._audioContext.state !== 'closed') {
      this._audioContext.close()
    }
  }

  // ============= PRIVATE METHODS =============

  /**
   * Setup audio context with browser compatibility
   * @private
   */
  _setupAudioContext() {
    if (typeof window === 'undefined') {
      return // SSR safety
    }

    // Add type declaration for Safari's webkitAudioContext
    /** @type {typeof AudioContext} */
    // @ts-ignore - webkitAudioContext is not in the type definitions but exists in Safari
    const AudioContextClass = window.AudioContext || window.webkitAudioContext
    if (!AudioContextClass) {
      throw new Error('AudioContext not supported')
    }
    this._audioContext = new AudioContextClass()

    // Handle autoplay policy
    if (this._audioContext.state === 'suspended') {
      const resume = () => {
        this._audioContext.resume()
        document.removeEventListener('click', resume)
        document.removeEventListener('touchstart', resume)
      }
      document.addEventListener('click', resume)
      document.addEventListener('touchstart', resume)
    }
  }

  /**
   * Create audio source node and connect audio graph
   * @private
   */
  _createSource() {
    if (this._source) {
      this._source.disconnect()
    }

    this._source = this.audioContext.createBufferSource()
    this._source.buffer = this._audioBuffer

    // Create gain node for volume control
    if (!this._gainNode) {
      this._gainNode = this.audioContext.createGain()
    }
    this._gainNode.gain.value = this._volume

    // Connect audio graph
    this._source.connect(this._gainNode)
    this._gainNode.connect(this.audioContext.destination)

    // Handle end event
    this._source.onended = () => {
      if (this._isPlaying) {
        this._handleTrackEnd()
      }
    }
  }

  /**
   * Internal stop method
   * @private
   */
  _stop() {
    if (this._source) {
      try {
        this._source.stop()
      } catch (e) {
        // Source may already be stopped
      }
      this._source = null
    }

    this._isPlaying = false
    this._stopTimeTracking()
  }

  /**
   * Start time tracking for timeupdate events
   * @private
   */
  _startTimeTracking() {
    const updateTime = () => {
      if (this._isPlaying) {
        this._emit('timeupdate', this.getCurrentTime())
        this._animationFrame = requestAnimationFrame(updateTime)
      }
    }
    updateTime()
  }

  /**
   * Stop time tracking
   * @private
   */
  _stopTimeTracking() {
    if (this._animationFrame) {
      cancelAnimationFrame(this._animationFrame)
      this._animationFrame = null
    }
  }

  /**
   * Handle track end (loop or stop)
   * @private
   */
  _handleTrackEnd() {
    if (this._loop) {
      // Restart loop
      this.seek(this._loop.start)
      this.play()
    } else {
      this.stop()
      this._emit('ended')
    }
  }

  /**
   * Emit event to all listeners
   * @private
   * @param {string} event - Event name
   * @param {*} data - Event data
   */
  _emit(event, data) {
    const listeners = this._eventListeners.get(event)
    if (listeners) {
      listeners.forEach((callback) => {
        try {
          callback(data)
        } catch (error) {
          console.error(`Error in ${event} listener:`, error)
        }
      })
    }
  }
}

// Usage example:
/*
// Basic usage
const player = new AudioPlayer();
await player.load('song.mp3');
player.play();

// With loop
player.setLoop(10.0, 20.5);
player.play();

// Event handling (GSAP-like)
player.on('timeupdate', (time) => {
    console.log('Current time:', time);
    updateUI(time);
});

player.on('loopchange', (loop) => {
    console.log('Loop changed:', loop);
});

// Volume control
player.setVolume(0.7);

// Cleanup when done
player.dispose();
*/
