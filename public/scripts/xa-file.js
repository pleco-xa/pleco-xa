/**
 * Librosa File Utilities Module
 * Web-ready JavaScript implementation of file utilities and example loading
 *
 * Provides tools for:
 * - Loading example audio files from remote sources
 * - Audio file caching and management
 * - Example audio registry and metadata
 * - Web Audio API integration helpers
 *
 * @author Pleco-XA Audio Analysis Suite
 * @version 1.0.0
 */

import { debugLog } from './debug.js'

/**
 * Custom error class for file operation errors
 */
class FileError extends Error {
  constructor(message) {
    super(message)
    this.name = 'FileError'
  }
}

/**
 * Audio example registry with metadata
 * Provides access to standard librosa example files
 */
const AUDIO_REGISTRY = {
  brahms: {
    path: 'brahms',
    desc: 'Hungarian Dance #5 by Johannes Brahms',
    duration: 25.7,
    sr: 22050,
    genre: 'classical',
  },
  vibeace: {
    path: 'vibeace',
    desc: 'Vibe Ace by Kevin MacLeod',
    duration: 54.2,
    sr: 22050,
    genre: 'electronic',
  },
  trumpet: {
    path: 'trumpet',
    desc: 'Trumpet sample - B♭4 note',
    duration: 2.1,
    sr: 22050,
    genre: 'instrumental',
  },
  nutcracker: {
    path: 'nutcracker',
    desc: 'The Nutcracker Suite by Tchaikovsky',
    duration: 40.3,
    sr: 22050,
    genre: 'classical',
  },
  choice: {
    path: 'choice',
    desc: 'Choice - electronic music sample',
    duration: 30.0,
    sr: 22050,
    genre: 'electronic',
  },
  fishin: {
    path: 'fishin',
    desc: 'Fishin Blues sample',
    duration: 42.1,
    sr: 22050,
    genre: 'blues',
  },
}

/**
 * Global audio cache for loaded examples
 * Stores both raw audio data and decoded AudioBuffer objects
 */
class AudioCache {
  constructor() {
    this._cache = new Map()
    this._bufferCache = new Map()
    this._maxSize = 100 * 1024 * 1024 // 100MB max cache
    this._currentSize = 0
  }

  /**
   * Get cached audio data
   * @param {string} key - Cache key
   * @returns {ArrayBuffer|null} Cached audio data
   */
  get(key) {
    const entry = this._cache.get(key)
    if (entry) {
      // Update access time for LRU
      entry.lastAccessed = Date.now()
      return entry.data
    }
    return null
  }

  /**
   * Cache audio data
   * @param {string} key - Cache key
   * @param {ArrayBuffer} data - Audio data to cache
   */
  set(key, data) {
    // Check if we need to evict old entries
    if (this._currentSize + data.byteLength > this._maxSize) {
      this._evictLRU(data.byteLength)
    }

    this._cache.set(key, {
      data,
      size: data.byteLength,
      lastAccessed: Date.now(),
    })

    this._currentSize += data.byteLength
  }

  /**
   * Get cached AudioBuffer
   * @param {string} key - Cache key
   * @returns {AudioBuffer|null} Cached AudioBuffer
   */
  getBuffer(key) {
    return this._bufferCache.get(key) || null
  }

  /**
   * Cache AudioBuffer
   * @param {string} key - Cache key
   * @param {AudioBuffer} buffer - AudioBuffer to cache
   */
  setBuffer(key, buffer) {
    this._bufferCache.set(key, buffer)
  }

  /**
   * Clear all cached data
   */
  clear() {
    this._cache.clear()
    this._bufferCache.clear()
    this._currentSize = 0
  }

  /**
   * Get cache statistics
   * @returns {Object} Cache statistics
   */
  getStats() {
    return {
      entries: this._cache.size,
      buffers: this._bufferCache.size,
      sizeBytes: this._currentSize,
      sizeMB: Math.round((this._currentSize / (1024 * 1024)) * 100) / 100,
    }
  }

  /**
   * Evict least recently used entries to free space
   * @private
   */
  _evictLRU(neededSpace) {
    const entries = Array.from(this._cache.entries())
    entries.sort((a, b) => a[1].lastAccessed - b[1].lastAccessed)

    let freedSpace = 0
    for (const [key, entry] of entries) {
      this._cache.delete(key)
      this._bufferCache.delete(key)
      this._currentSize -= entry.size
      freedSpace += entry.size

      if (freedSpace >= neededSpace) break
    }
  }
}

// Global cache instance
const audioCache = new AudioCache()

/**
 * Load example audio file from remote source
 * @param {string} key - Example identifier from AUDIO_REGISTRY
 * @param {boolean} hq - Load high quality version (default: false)
 * @param {string} baseUrl - Base URL for audio files
 * @returns {Promise<ArrayBuffer>} Audio data as ArrayBuffer
 */
export async function example(
  key,
  hq = false,
  baseUrl = 'https://librosa.org/data/assets/audio/',
) {
  // Validate example key
  if (!AUDIO_REGISTRY[key]) {
    const available = Object.keys(AUDIO_REGISTRY)
    throw new FileError(
      `Unknown example key: ${key}. Available: ${available.join(', ')}`,
    )
  }

  const ext = hq ? '.hq.ogg' : '.ogg'
  const filename = AUDIO_REGISTRY[key].path + ext
  const cacheKey = `${key}_${hq}`

  // Check cache first
  const cached = audioCache.get(cacheKey)
  if (cached) {
    return cached
  }

  try {
    // Fetch from remote server
    debugLog(
      `Loading example: ${key} (${hq ? 'HQ' : 'standard'}) from ${baseUrl}${filename}`,
    )

    const response = await fetch(baseUrl + filename, {
      headers: {
        Accept: 'audio/*',
      },
    })

    if (!response.ok) {
      throw new FileError(
        `Failed to fetch ${filename}: ${response.status} ${response.statusText}`,
      )
    }

    const data = await response.arrayBuffer()

    // Cache the result
    audioCache.set(cacheKey, data)

    debugLog(`Loaded ${filename}: ${Math.round(data.byteLength / 1024)}KB`)

    return data
  } catch (error) {
    if (error instanceof FileError) throw error
    throw new FileError(`Network error loading ${filename}: ${error.message}`)
  }
}

/**
 * Load and decode audio example to AudioBuffer
 * @param {string} key - Example identifier
 * @param {boolean} hq - Load high quality version
 * @param {AudioContext} audioContext - Web Audio API context
 * @param {string} baseUrl - Base URL for audio files
 * @returns {Promise<AudioBuffer>} Decoded AudioBuffer
 */
export async function exampleBuffer(
  key,
  hq = false,
  audioContext = null,
  baseUrl = 'https://librosa.org/data/assets/audio/',
) {
  if (!audioContext) {
    audioContext = new (window.AudioContext ||
      window.webkitAudioContext ||
      function () {
        throw new Error('AudioContext not supported')
      })()
  }

  const cacheKey = `${key}_${hq}_buffer`

  // Check buffer cache first
  const cached = audioCache.getBuffer(cacheKey)
  if (cached) {
    return cached
  }

  try {
    // Load raw audio data
    const arrayBuffer = await example(key, hq, baseUrl)

    // Decode to AudioBuffer
    const audioBuffer = await audioContext.decodeAudioData(arrayBuffer.slice())

    // Cache the decoded buffer
    audioCache.setBuffer(cacheKey, audioBuffer)

    return audioBuffer
  } catch (error) {
    throw new FileError(`Failed to decode audio: ${error.message}`)
  }
}

/**
 * Get audio data as Float32Array from AudioBuffer
 * @param {string} key - Example identifier
 * @param {boolean} hq - Load high quality version
 * @param {number} channel - Channel to extract (default: 0)
 * @param {AudioContext} audioContext - Web Audio API context
 * @returns {Promise<Float32Array>} Audio samples
 */
export async function exampleAudio(
  key,
  hq = false,
  channel = 0,
  audioContext = null,
) {
  const buffer = await exampleBuffer(key, hq, audioContext)

  if (channel >= buffer.numberOfChannels) {
    throw new FileError(
      `Channel ${channel} not available. Audio has ${buffer.numberOfChannels} channels.`,
    )
  }

  return buffer.getChannelData(channel)
}

/**
 * List all available audio examples
 * @returns {Array<Object>} List of available examples with metadata
 */
export function listExamples() {
  return Object.entries(AUDIO_REGISTRY).map(([key, info]) => ({
    key,
    description: info.desc,
    duration: info.duration,
    sampleRate: info.sr,
    genre: info.genre,
  }))
}

/**
 * Get metadata for a specific example
 * @param {string} key - Example identifier
 * @returns {Object} Example metadata
 */
export function exampleInfo(key) {
  if (!AUDIO_REGISTRY[key]) {
    throw new FileError(`Unknown example: ${key}`)
  }

  return { ...AUDIO_REGISTRY[key] }
}

/**
 * Load local audio file from user input
 * @param {File} file - File object from input element
 * @param {AudioContext} audioContext - Web Audio API context
 * @returns {Promise<AudioBuffer>} Decoded AudioBuffer
 */
export async function loadFile(file, audioContext = null) {
  if (!audioContext) {
    audioContext = new (window.AudioContext ||
      window.webkitAudioContext ||
      function () {
        throw new Error('AudioContext not supported')
      })()
  }

  if (!file) {
    throw new FileError('No file provided')
  }

  try {
    const arrayBuffer = await file.arrayBuffer()
    const audioBuffer = await audioContext.decodeAudioData(arrayBuffer)

    return audioBuffer
  } catch (error) {
    throw new FileError(`Failed to load file ${file.name}: ${error.message}`)
  }
}

/**
 * Save audio data as downloadable file
 * @param {Float32Array} audioData - Audio samples
 * @param {number} sampleRate - Sample rate
 * @param {string} filename - Output filename
 * @param {string} format - Audio format ('wav', 'ogg')
 */
export function saveAudio(
  audioData,
  sampleRate,
  filename = 'audio.wav',
  format = 'wav',
) {
  if (format !== 'wav') {
    throw new FileError('Only WAV format is currently supported')
  }

  // Create WAV file
  const wavData = _encodeWAV(audioData, sampleRate)

  // Create download link
  const blob = new Blob([wavData], { type: 'audio/wav' })
  const url = URL.createObjectURL(blob)

  const link = document.createElement('a')
  link.href = url
  link.download = filename
  link.style.display = 'none'

  document.body.appendChild(link)
  link.click()
  document.body.removeChild(link)

  // Clean up
  setTimeout(() => URL.revokeObjectURL(url), 1000)
}

/**
 * Get cache management interface
 * @returns {Object} Cache management functions
 */
export function cache() {
  return {
    /**
     * Get cache statistics
     */
    stats: () => audioCache.getStats(),

    /**
     * Clear all cached data
     */
    clear: () => audioCache.clear(),

    /**
     * Check if example is cached
     */
    has: (key, hq = false) => {
      const cacheKey = `${key}_${hq}`
      return audioCache.get(cacheKey) !== null
    },

    /**
     * Preload examples for faster access
     */
    preload: async (keys = Object.keys(AUDIO_REGISTRY), hq = false) => {
      const promises = keys.map((key) =>
        example(key, hq).catch((err) => {
          console.warn(`Failed to preload ${key}:`, err.message)
          return null
        }),
      )

      const results = await Promise.all(promises)
      const loaded = results.filter((r) => r !== null).length

      debugLog(`Preloaded ${loaded}/${keys.length} examples`)
      return { loaded, total: keys.length }
    },
  }
}

/**
 * Create audio visualization data
 * @param {Float32Array} audioData - Audio samples
 * @param {number} points - Number of visualization points
 * @returns {Object} Visualization data
 */
export function createVisualization(audioData, points = 1000) {
  const downsample = Math.max(1, Math.floor(audioData.length / points))
  const times = []
  const amplitudes = []

  for (let i = 0; i < points && i * downsample < audioData.length; i++) {
    const sample = audioData[i * downsample]
    times.push(i * downsample)
    amplitudes.push(sample)
  }

  return { times, amplitudes, sampleRate: 22050 }
}

// ============= Private Helper Functions =============

/**
 * Encode audio data as WAV file
 * @private
 */
function _encodeWAV(audioData, sampleRate) {
  const length = audioData.length
  const arrayBuffer = new ArrayBuffer(44 + length * 2)
  const view = new DataView(arrayBuffer)

  // WAV header
  const writeString = (offset, string) => {
    for (let i = 0; i < string.length; i++) {
      view.setUint8(offset + i, string.charCodeAt(i))
    }
  }

  writeString(0, 'RIFF')
  view.setUint32(4, 36 + length * 2, true)
  writeString(8, 'WAVE')
  writeString(12, 'fmt ')
  view.setUint32(16, 16, true)
  view.setUint16(20, 1, true)
  view.setUint16(22, 1, true)
  view.setUint32(24, sampleRate, true)
  view.setUint32(28, sampleRate * 2, true)
  view.setUint16(32, 2, true)
  view.setUint16(34, 16, true)
  writeString(36, 'data')
  view.setUint32(40, length * 2, true)

  // Convert float samples to 16-bit PCM
  let offset = 44
  for (let i = 0; i < length; i++) {
    const sample = Math.max(-1, Math.min(1, audioData[i]))
    view.setInt16(offset, sample < 0 ? sample * 0x8000 : sample * 0x7fff, true)
    offset += 2
  }

  return arrayBuffer
}

/**
 * Utility function to check if Web Audio API is available
 * @returns {boolean} True if Web Audio API is supported
 */
export function isWebAudioSupported() {
  return !!(window.AudioContext || window.webkitAudioContext)
}

/**
 * Create a new Web Audio API context with proper configuration
 * @param {Object} options - AudioContext options
 * @returns {AudioContext} Configured AudioContext
 */
export function createAudioContext(options = {}) {
  if (!isWebAudioSupported()) {
    throw new FileError('Web Audio API not supported in this browser')
  }

  const defaultOptions = {
    sampleRate: 44100,
    latencyHint: 'interactive',
  }

  const contextOptions = { ...defaultOptions, ...options }

  const AudioContextClass =
    window.AudioContext ||
    window.webkitAudioContext ||
    function () {
      throw new Error('AudioContext not supported')
    }
  return new AudioContextClass(contextOptions)
}

// Usage Example:
/*
// Load a standard example
const audioData = await example('brahms');
const audioBuffer = await exampleBuffer('trumpet', false, audioContext);
const samples = await exampleAudio('vibeace', true, 0, audioContext);

// List available examples
const examples = listExamples();
debugLog('Available examples:', examples);

// Load user file
const fileInput = document.getElementById('audioFile');
fileInput.addEventListener('change', async (e) => {
    const file = e.target.files[0];
    const buffer = await loadFile(file, audioContext);
    debugLog('Loaded:', buffer.duration, 'seconds');
});

// Cache management
const cacheManager = cache();
await cacheManager.preload(['brahms', 'trumpet']);
debugLog('Cache stats:', cacheManager.stats());

// Save processed audio
saveAudio(processedSamples, 44100, 'processed_audio.wav');
*/
