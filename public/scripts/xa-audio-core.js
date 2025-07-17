/**
 * Core Audio Processing Module
 * Handles audio loading, playback, and basic waveform visualization
 */

// Audio buffer cache to avoid reloading the same files
const audioBufferCache = new Map();

/**
 * Initialize the audio processor
 * @returns {Object} Audio processor interface
 */
export function initAudioProcessor() {
  let audioContext = null;
  let currentSource = null;
  let isPlaying = false;
  let loopStart = 0;
  let loopEnd = 1;
  let playheadStartTime = 0;
  
  return {
    /**
     * Get or create audio context
     */
    getAudioContext() {
      if (!audioContext) {
        audioContext = new (window.AudioContext || window.webkitAudioContext)({
          latencyHint: 'interactive',
          sampleRate: 44100
        });
      }
      return audioContext;
    },
    
    /**
     * Play audio buffer
     * @param {AudioBuffer} audioBuffer - Audio buffer to play
     */
    async play(audioBuffer) {
      if (!audioBuffer) return;
      
      try {
        if (isPlaying) {
          this.stop();
        }
        
        const ctx = this.getAudioContext();
        
        if (ctx.state === 'suspended') {
          await ctx.resume();
        }
        
        currentSource = ctx.createBufferSource();
        currentSource.buffer = audioBuffer;
        
        // Add gain node for volume control
        const gainNode = ctx.createGain();
        gainNode.gain.value = 0.5; // 50% volume
        
        currentSource.connect(gainNode);
        gainNode.connect(ctx.destination);
        
        // Set loop points
        currentSource.loop = true;
        const startTime = loopStart * audioBuffer.duration;
        const endTime = loopEnd * audioBuffer.duration;
        
        currentSource.loopStart = startTime;
        currentSource.loopEnd = endTime;
        currentSource.start(0, startTime);
        
        isPlaying = true;
        playheadStartTime = ctx.currentTime;
        
        return true;
      } catch (error) {
        console.error('Playback error:', error);
        throw error;
      }
    },
    
    /**
     * Stop audio playback
     */
    stop() {
      if (currentSource) {
        try {
          currentSource.stop();
        } catch (error) {
          // Source may already be stopped
        }
        currentSource = null;
      }
      isPlaying = false;
    },
    
    /**
     * Set loop points
     * @param {number} start - Loop start (0-1)
     * @param {number} end - Loop end (0-1)
     */
    setLoopPoints(start, end) {
      loopStart = start;
      loopEnd = end;
      
      // Update current source if playing
      if (isPlaying && currentSource && currentSource.buffer) {
        const startTime = loopStart * currentSource.buffer.duration;
        const endTime = loopEnd * currentSource.buffer.duration;
        
        currentSource.loopStart = startTime;
        currentSource.loopEnd = endTime;
      }
    },
    
    /**
     * Get current loop points
     * @returns {Object} Loop points
     */
    getLoopPoints() {
      return { start: loopStart, end: loopEnd };
    },
    
    /**
     * Get loop duration in seconds
     * @returns {number} Loop duration
     */
    getLoopDuration() {
      if (!currentSource || !currentSource.buffer) return 0;
      return (loopEnd - loopStart) * currentSource.buffer.duration;
    },
    
    /**
     * Get current playback position (0-1)
     * @returns {number} Current position
     */
    getCurrentPosition() {
      if (!isPlaying || !audioContext || !currentSource || !currentSource.buffer) return loopStart;
      
      const currentTime = audioContext.currentTime;
      const elapsed = currentTime - playheadStartTime;
      
      const loopStartSec = loopStart * currentSource.buffer.duration;
      const loopEndSec = loopEnd * currentSource.buffer.duration;
      const loopDuration = loopEndSec - loopStartSec;
      
      // Calculate position within loop
      const positionInLoop = elapsed % loopDuration;
      const currentPosition = loopStartSec + positionInLoop;
      
      // Return normalized position (0-1)
      return currentPosition / currentSource.buffer.duration;
    },
    
    /**
     * Check if audio is playing
     * @returns {boolean} Is playing
     */
    isPlaying() {
      return isPlaying;
    }
  };
}

/**
 * Load audio file (from URL or File object)
 * @param {string|File} source - URL or File object
 * @returns {Promise<Object>} Audio data and context
 */
export async function loadAudioFile(source) {
  // Create audio context if needed
  const audioContext = new (window.AudioContext || window.webkitAudioContext)({
    latencyHint: 'interactive',
    sampleRate: 44100
  });
  
  let audioBuffer;
  let arrayBuffer;
  
  // Handle URL string
  if (typeof source === 'string') {
    const url = source;
    
    // Check cache first
    if (audioBufferCache.has(url)) {
      return {
        audioBuffer: audioBufferCache.get(url),
        audioContext,
        arrayBuffer: null
      };
    }
    
    // Fetch the file
    console.log(`🌐 Fetching audio from: ${url}`);
    const response = await fetch(url, { cache: 'force-cache' });

    if (!response.ok) {
      throw new Error(`Failed to load audio: HTTP ${response.status}`);
    }
    
    console.log(`📦 Response received, size: ${response.headers.get('content-length')} bytes`);
    arrayBuffer = await response.arrayBuffer();
    console.log(`🔄 ArrayBuffer created, size: ${arrayBuffer.byteLength} bytes`);
    
    // Ensure audio context is in running state
    if (audioContext.state === 'suspended') {
      console.log('🔊 Resuming audio context...');
      await audioContext.resume();
    }
    
    console.log(`🎵 Decoding audio data...`);
    try {
      audioBuffer = await audioContext.decodeAudioData(arrayBuffer.slice(0));
      console.log(`✅ Audio decoded successfully: ${audioBuffer.duration.toFixed(2)}s, ${audioBuffer.numberOfChannels} channels`);
    } catch (decodeError) {
      console.error('❌ Audio decode error:', decodeError);
      throw new Error(`Unable to decode audio data: ${decodeError.message}`);
    }

    
    // Cache the result
    audioBufferCache.set(url, audioBuffer);
  } 
  // Handle File object
  else if (source instanceof File) {
    console.log(`📁 Loading file: ${source.name}, size: ${source.size} bytes`);
    arrayBuffer = await source.arrayBuffer();
    console.log(`🔄 ArrayBuffer created, size: ${arrayBuffer.byteLength} bytes`);
    
    // Ensure audio context is in running state
    if (audioContext.state === 'suspended') {
      console.log('🔊 Resuming audio context...');
      await audioContext.resume();
    }
    
    console.log(`🎵 Decoding audio data...`);
    try {
      audioBuffer = await audioContext.decodeAudioData(arrayBuffer.slice(0));
      console.log(`✅ Audio decoded successfully: ${audioBuffer.duration.toFixed(2)}s, ${audioBuffer.numberOfChannels} channels`);
    } catch (decodeError) {
      console.error('❌ Audio decode error:', decodeError);
      throw new Error(`Unable to decode audio data: ${decodeError.message}`);
    }

  }
  else {
    throw new Error('Invalid source type');
  }
  
  return {
    audioBuffer,
    audioContext,
    arrayBuffer
  };
}

/**
 * Draw waveform visualization
 * @param {AudioBuffer} audioBuffer - Audio buffer
 * @param {string} canvasId - Canvas element ID
 * @param {Object} loopData - Loop points (optional)
 * @param {Object} playbackInfo - Playback information (optional)
 */
export function drawWaveform(audioBuffer, canvasId, loopData = null, playbackInfo = null) {
  const canvas = document.getElementById(canvasId);
  if (!canvas || !audioBuffer) return;
  
  const ctx = canvas.getContext('2d');
  const width = canvas.width;
  const height = canvas.height;
  
  // Clear canvas
  ctx.fillStyle = 'rgba(0, 0, 0, 0.8)';
  ctx.fillRect(0, 0, width, height);
  
  const audioData = audioBuffer.getChannelData(0);
  const samplesPerPixel = Math.ceil(audioData.length / width);
  
  // Draw waveform
  ctx.strokeStyle = '#00ff88';
  ctx.lineWidth = 1;
  ctx.beginPath();
  
  for (let x = 0; x < width; x++) {
    let max = -1;
    let min = 1;
    
    // Sample audio data for this pixel
    const startSample = x * samplesPerPixel;
    const endSample = Math.min(startSample + samplesPerPixel, audioData.length);
    
    for (let i = startSample; i < endSample; i++) {
      const sample = audioData[i];
      if (sample > max) max = sample;
      if (sample < min) min = sample;
    }
    
    // Convert to screen coordinates
    const yMax = ((1 - max) * height) / 2;
    const yMin = ((1 - min) * height) / 2;
    
    // Draw vertical line from min to max
    ctx.moveTo(x, yMax);
    ctx.lineTo(x, yMin);
  }
  ctx.stroke();
  
  // Use default loop points if not provided
  const loop = loopData || { start: 0, end: 1 };
  
  // Draw loop region
  const startX = loop.start * width;
  const endX = loop.end * width;
  
  ctx.fillStyle = 'rgba(255, 215, 0, 0.15)';
  ctx.fillRect(startX, 0, endX - startX, height);
  
  // Loop markers
  ctx.strokeStyle = '#ffd700';
  ctx.lineWidth = 2;
  ctx.beginPath();
  ctx.moveTo(startX, 0);
  ctx.lineTo(startX, height);
  ctx.moveTo(endX, 0);
  ctx.lineTo(endX, height);
  ctx.stroke();
  
  // Draw playhead if playing
  if (playbackInfo && playbackInfo.isPlaying) {
    const playheadX = playbackInfo.position * width;
    
    // Draw playhead line
    ctx.strokeStyle = '#ff4444';
    ctx.lineWidth = 2;
    ctx.beginPath();
    ctx.moveTo(playheadX, 0);
    ctx.lineTo(playheadX, height);
    ctx.stroke();
    
    // Playhead marker
    ctx.fillStyle = '#ff4444';
    ctx.beginPath();
    ctx.moveTo(playheadX, 0);
    ctx.lineTo(playheadX - 5, 10);
    ctx.lineTo(playheadX + 5, 10);
    ctx.closePath();
    ctx.fill();
  }
}