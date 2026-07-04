/**
 * BPM Detection Module
 * Handles tempo detection and beat tracking
 */

import { _amax } from './_arrstat.js'
import { debugLog } from './debug.js'

/**
 * Detect BPM from audio.
 *
 * Input contract (explicit — no silent guessing):
 *   - An AudioBuffer (channel 0 and its sampleRate are read), or
 *   - A Float32Array of raw mono PCM, in which case `options.sampleRate`
 *     (a positive number) is REQUIRED.
 * Anything else throws a TypeError with a clear diagnostic. A genuine
 * detection failure on valid audio (no steady pulse found) resolves to
 * { bpm: null, confidence: 0, error } rather than a fabricated tempo.
 *
 * @param {AudioBuffer|Float32Array} input - Audio to analyze
 * @param {Object} [options] - Detection options (sampleRate required for Float32Array)
 * @returns {Promise<Object>} BPM result
 */
export async function detectBPM(input, options = {}) {
  const defaultOptions = {
    minBPM: 60,
    maxBPM: 180,
    windowSize: 2048,
    hopSize: 512
  };

  const opts = { ...defaultOptions, ...options };

  // Validate the input contract up front, OUTSIDE the try/catch below, so a
  // wrong input type surfaces as a loud, specific error instead of being
  // swallowed into a confusing { bpm: null, error: '...getChannelData...' }.
  const { data, sampleRate } = resolveAudioInput(input, opts);

  try {
    // Quick BPM estimation for immediate feedback
    const quickResult = await quickBPMDetect(data, sampleRate, opts);

    // Apply musical corrections
    let bpm = quickResult.bpm;
    let confidence = quickResult.confidence;

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
 * Resolve the public detectBPM input into { data: Float32Array, sampleRate }.
 * Throws a TypeError for unsupported inputs rather than silently guessing.
 * @private
 */
function resolveAudioInput(input, options) {
  // AudioBuffer (duck-typed: getChannelData + numeric sampleRate).
  if (input && typeof input.getChannelData === 'function' && typeof input.sampleRate === 'number') {
    return { data: input.getChannelData(0), sampleRate: input.sampleRate };
  }

  // Raw mono PCM. A Float32Array carries no sample rate, so require one.
  if (input instanceof Float32Array) {
    const sampleRate = options.sampleRate;
    if (typeof sampleRate !== 'number' || !(sampleRate > 0)) {
      throw new TypeError(
        'detectBPM: a Float32Array input requires options.sampleRate (a positive number)'
      );
    }
    return { data: input, sampleRate };
  }

  throw new TypeError(
    'detectBPM: unsupported input — expected an AudioBuffer or a Float32Array, got ' +
    (input === null ? 'null' : Array.isArray(input) ? 'Array' : typeof input)
  );
}

/**
 * Quick BPM detection using onset strength.
 * @param {Float32Array} channel - Mono PCM samples
 * @param {number} sr - Sample rate (Hz)
 * @param {Object} options - Detection options
 * @private
 */
async function quickBPMDetect(channel, sr, options) {
  // Energy-flux onset peaks → inter-onset intervals → median-period BPM.

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

  // Real confidence: how strongly the winning period (the median interval)
  // dominates the field of observed inter-onset intervals. A steady pulse
  // (clean click track) produces near-identical intervals → nearly all agree
  // with the median → confidence ≈ 1. Scattered onsets (noise) produce
  // intervals spread across the range → few agree → low confidence. This is a
  // measured quantity, never a fabricated constant.
  const tolerance = 0.15; // ±15% of the median period counts as "on the pulse"
  let agree = 0;
  for (const interval of intervals) {
    if (Math.abs(interval - medianInterval) <= tolerance * medianInterval) {
      agree++;
    }
  }
  const confidence = intervals.length > 0 ? agree / intervals.length : 0;

  return {
    bpm: finalBpm,
    confidence
  };
}

/**
 * Find peaks in a signal
 * @private
 */
function findPeaks(signal, threshold = 0.5) {
  const peaks = [];
  
  // Normalize the signal
  const max = _amax(signal);
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