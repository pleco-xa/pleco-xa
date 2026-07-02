// Live speed control for real-time half/double speed effects
import { detectLoop } from '../core/index.js';
import { enqueueToast } from './ui/toastQueue.js';

class LiveSpeedController {
  constructor() {
    this.currentSpeed = 1.0;
    this.isActive = false;
    this.originalBuffer = null;
    this.speedBuffer = null;
    this.audioContext = null;
    this.source = null;
  }

  // Initialize with current audio context and buffer
  init(audioContext, buffer) {
    this.audioContext = audioContext;
    this.originalBuffer = buffer;
    this.currentSpeed = 1.0;
    this.isActive = false;
  }

  // Apply speed change live using Web Audio API
  async applyLiveSpeed(targetSpeed, options = {}) {
    const {
      preservePitch = false,
      fadeTime = 0.05, // 50ms crossfade
      method = 'playbackRate' // 'playbackRate' or 'resample'
    } = options;

    if (!this.audioContext || !this.originalBuffer) {
      throw new Error('Speed controller not initialized');
    }

    console.log(`🏃 Applying live speed change: ${this.currentSpeed} → ${targetSpeed}`);

    if (method === 'playbackRate') {
      // Method 1: Use Web Audio playbackRate (fast but changes pitch)
      return this.applyPlaybackRateSpeed(targetSpeed, fadeTime);
    } else {
      // Method 2: Resample buffer (slower but preserves pitch)
      return this.applyResampleSpeed(targetSpeed, preservePitch);
    }
  }

  // Fast method using playbackRate (changes pitch)
  async applyPlaybackRateSpeed(targetSpeed, fadeTime) {
    // Get current audio source
    const audioProcessor = window.audioProcessor;
    if (!audioProcessor) {
      throw new Error('Audio processor not available');
    }

    // If currently playing, we need to adjust the playback rate
    if (audioProcessor.source && audioProcessor.isPlaying) {
      // Create gain nodes for crossfading
      const currentGain = this.audioContext.createGain();
      const newGain = this.audioContext.createGain();
      
      // Start new source with target speed
      const newSource = this.audioContext.createBufferSource();
      newSource.buffer = this.originalBuffer;
      newSource.playbackRate.value = targetSpeed;
      
      // Connect audio graph
      audioProcessor.source.connect(currentGain);
      newSource.connect(newGain);
      currentGain.connect(audioProcessor.gainNode);
      newGain.connect(audioProcessor.gainNode);
      
      // Crossfade
      const now = this.audioContext.currentTime;
      currentGain.gain.setValueAtTime(1, now);
      currentGain.gain.linearRampToValueAtTime(0, now + fadeTime);
      newGain.gain.setValueAtTime(0, now);
      newGain.gain.linearRampToValueAtTime(1, now + fadeTime);
      
      // Start new source at current position
      const currentTime = audioProcessor.getCurrentTime();
      newSource.start(now, currentTime);
      
      // Stop old source after fade
      setTimeout(() => {
        audioProcessor.source.stop();
        audioProcessor.source = newSource;
      }, fadeTime * 1000);
      
    } else {
      // Not playing, just update for next play
      if (audioProcessor.source) {
        audioProcessor.source.playbackRate.value = targetSpeed;
      }
    }

    this.currentSpeed = targetSpeed;
    return { speed: targetSpeed, method: 'playbackRate', preservePitch: false };
  }

  // Slower method using buffer resampling (preserves pitch)
  async applyResampleSpeed(targetSpeed, preservePitch) {
    const loop = detectLoop(this.originalBuffer);
    const loopStart = loop.startSample;
    const loopEnd = loop.endSample;
    const loopLength = loopEnd - loopStart;

    console.log(`🔄 Resampling buffer at ${targetSpeed}x speed`);

    // Create new buffer with adjusted length
    const newLength = Math.floor(loopLength / targetSpeed);
    const newBuffer = this.audioContext.createBuffer(
      this.originalBuffer.numberOfChannels,
      this.originalBuffer.length, // Keep same total length
      this.originalBuffer.sampleRate
    );

    // Resample each channel
    for (let channel = 0; channel < this.originalBuffer.numberOfChannels; channel++) {
      const originalData = this.originalBuffer.getChannelData(channel);
      const newData = newBuffer.getChannelData(channel);
      
      // Copy everything before the loop
      for (let i = 0; i < loopStart; i++) {
        newData[i] = originalData[i];
      }
      
      // Resample the loop section
      for (let i = 0; i < newLength; i++) {
        const sourceIndex = loopStart + (i * targetSpeed);
        const sourceIndexFloor = Math.floor(sourceIndex);
        const sourceIndexCeil = Math.ceil(sourceIndex);
        const fraction = sourceIndex - sourceIndexFloor;
        
        // Linear interpolation
        let sample = originalData[sourceIndexFloor];
        if (sourceIndexCeil < loopEnd && sourceIndexCeil !== sourceIndexFloor) {
          sample = originalData[sourceIndexFloor] * (1 - fraction) + 
                  originalData[sourceIndexCeil] * fraction;
        }
        
        newData[loopStart + i] = sample;
      }
      
      // Fill or truncate the rest of the loop area
      for (let i = loopStart + newLength; i < loopEnd; i++) {
        if (targetSpeed < 1.0) {
          // For slower speeds, fill with silence
          newData[i] = 0;
        } else {
          // For faster speeds, this area is already filled
        }
      }
      
      // Copy everything after the loop
      for (let i = loopEnd; i < this.originalBuffer.length; i++) {
        newData[i] = originalData[i];
      }
    }

    this.speedBuffer = newBuffer;
    this.currentSpeed = targetSpeed;

    return { 
      buffer: newBuffer, 
      speed: targetSpeed, 
      method: 'resample', 
      preservePitch: preservePitch,
      newLoopLength: newLength 
    };
  }

  // Quick half speed
  async halfSpeed(preservePitch = false) {
    return this.applyLiveSpeed(0.5, { 
      preservePitch, 
      method: preservePitch ? 'resample' : 'playbackRate' 
    });
  }

  // Quick double speed  
  async doubleSpeed(preservePitch = false) {
    return this.applyLiveSpeed(2.0, { 
      preservePitch, 
      method: preservePitch ? 'resample' : 'playbackRate' 
    });
  }

  // Reset to normal speed
  async normalSpeed() {
    return this.applyLiveSpeed(1.0, { method: 'playbackRate' });
  }

  // Get current speed info
  getSpeedInfo() {
    return {
      currentSpeed: this.currentSpeed,
      isActive: this.isActive,
      hasSpeedBuffer: !!this.speedBuffer,
      method: this.currentSpeed === 1.0 ? 'normal' : 'modified'
    };
  }
}

// Export singleton instance
export const liveSpeedController = new LiveSpeedController();

// Helper functions for easy use
export async function applyLiveHalfSpeed(preservePitch = false) {
  const buffer = window.currentAudioBuffer;
  const audioContext = window.audioContext;
  
  if (!buffer || !audioContext) {
    throw new Error('No audio loaded');
  }
  
  liveSpeedController.init(audioContext, buffer);
  return await liveSpeedController.halfSpeed(preservePitch);
}

export async function applyLiveDoubleSpeed(preservePitch = false) {
  const buffer = window.currentAudioBuffer;
  const audioContext = window.audioContext;
  
  if (!buffer || !audioContext) {
    throw new Error('No audio loaded');
  }
  
  liveSpeedController.init(audioContext, buffer);
  return await liveSpeedController.doubleSpeed(preservePitch);
}

export async function resetLiveSpeed() {
  return await liveSpeedController.normalSpeed();
}