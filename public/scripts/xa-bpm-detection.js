/**
 * BPM Detection Module
 * Handles tempo detection and beat tracking
 */

import { debugLog } from './debug.js'

/**
 * Detect BPM from audio buffer
 * @param {AudioBuffer} audioBuffer - Audio buffer to analyze
 * @param {Object} options - Detection options
 * @returns {Promise<Object>} BPM result
 */
export async function detectBPM(audioBuffer, options = {}) {
  const defaultOptions = {
    minBPM: 60,
    maxBPM: 180,
    windowSize: 2048,
    hopSize: 512
  };
  
  const opts = { ...defaultOptions, ...options };

  try {
    // Quick BPM estimation for immediate feedback
    const quickResult = await quickBPMDetect(audioBuffer, opts);
    
    // Apply musical corrections
    let bpm = quickResult.bpm;
    let confidence = quickResult.confidence || 0.7;
    
    // Simple sanity correction for extreme values
    if (bpm > 160) {
      bpm = bpm / 2;
    } else if (bpm < 55) {
      bpm = bpm * 2;
    }
    
    return {
      bpm,
      confidence,
      original: quickResult.bpm
    };
  } catch (error) {
    console.error('BPM detection failed:', error);

    // Return error instead of fake fallback
    return {
      bpm: null,
      confidence: 0,
      error: error.message
    };
  }
}

/**
 * Quick BPM detection using onset strength
 * @private
 */
async function quickBPMDetect(audioBuffer, options) {
  // For demo purposes, we'll use a simplified algorithm
  // In a real implementation, this would use proper onset detection and autocorrelation
  
  const channel = audioBuffer.getChannelData(0);
  const sr = audioBuffer.sampleRate;
  
  // Use only a small portion of the audio for faster processing
  // Especially important for large files like Jazz Drums
  const maxSeconds = 10; // Only analyze first 10 seconds
  const maxSamples = Math.min(channel.length, sr * maxSeconds);
  const data = channel.subarray(0, maxSamples);
  
  // Use larger hop size for faster processing
  const frameSize = options.windowSize || 4096; // Larger frame size
  const hopSize = options.hopSize || 1024;      // Larger hop size
  
  // Limit the number of frames to process
  const maxFrames = 1000;
  const skipFactor = Math.max(1, Math.ceil((data.length / hopSize) / maxFrames));
  
  const energyChanges = [];
  
  // Process with downsampling for speed
  let prevEnergy = 0;
  for (let i = 0; i + frameSize < data.length; i += (hopSize * skipFactor)) {
    // Calculate frame energy more efficiently
    let energy = 0;
    for (let j = 0; j < frameSize; j += 4) { // Skip samples for speed
      energy += data[i + j] * data[i + j];
    }
    energy *= 4; // Compensate for skipping
    energy /= frameSize;
    
    // Calculate energy change (onset strength)
    const change = Math.max(0, energy - prevEnergy);
    energyChanges.push(change);
    
    prevEnergy = energy;
  }
  
  // Try multiple thresholds to find peaks - start high and progressively lower
  let peaks = findPeaks(energyChanges, 0.6);

  // If too few peaks, try progressively lower thresholds
  if (peaks.length < 4) {
    peaks = findPeaks(energyChanges, 0.4);
  }
  if (peaks.length < 4) {
    peaks = findPeaks(energyChanges, 0.2);
  }
  if (peaks.length < 4) {
    peaks = findPeaks(energyChanges, 0.1);
  }

  // Last resort: if still too few peaks after all attempts, throw error
  if (peaks.length < 4) {
    debugLog(`BPM detection: Only found ${peaks.length} peaks after trying multiple thresholds`);
    throw new Error(`Unable to detect BPM - insufficient peaks found (${peaks.length}/4)`);
  }
  
  // Calculate intervals between peaks
  const intervals = [];
  for (let i = 1; i < peaks.length; i++) {
    intervals.push(peaks[i] - peaks[i - 1]);
  }
  
  // Convert to BPM
  const frameRate = sr / (hopSize * skipFactor);
  const medianInterval = median(intervals);
  
  // Avoid division by zero
  if (medianInterval === 0) {
    throw new Error('Unable to detect BPM - invalid interval data (median is 0)');
  }
  
  const bpm = 60 * frameRate / medianInterval;
  
  // Ensure BPM is in the specified range
  let finalBpm = bpm;
  while (finalBpm < options.minBPM) finalBpm *= 2;
  while (finalBpm > options.maxBPM) finalBpm /= 2;
  
  return {
    bpm: finalBpm,
    confidence: 0.7
  };
}

/**
 * Find peaks in a signal
 * @private
 */
function findPeaks(signal, threshold = 0.5) {
  const peaks = [];
  
  // Normalize the signal
  const max = Math.max(...signal);
  const normalizedSignal = signal.map(val => val / max);
  
  // Find peaks
  for (let i = 1; i < normalizedSignal.length - 1; i++) {
    if (normalizedSignal[i] > threshold && 
        normalizedSignal[i] > normalizedSignal[i - 1] && 
        normalizedSignal[i] > normalizedSignal[i + 1]) {
      peaks.push(i);
    }
  }
  
  return peaks;
}

/**
 * Calculate median of an array
 * @private
 */
function median(values) {
  if (values.length === 0) return 0;
  
  const sorted = [...values].sort((a, b) => a - b);
  const mid = Math.floor(sorted.length / 2);
  
  return sorted.length % 2 === 0
    ? (sorted[mid - 1] + sorted[mid]) / 2
    : sorted[mid];
}