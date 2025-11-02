/**
 * Loop Detection Module
 * Handles finding and manipulating loop points in audio
 */

import { debugLog } from './debug.js'

/**
 * Find optimal loop points in audio buffer
 * @param {AudioBuffer} audioBuffer - Audio buffer to analyze
 * @param {Object} options - Detection options
 * @returns {Promise<Object>} Loop points
 */
export async function findLoop(audioBuffer, options = {}) {
  const defaultOptions = {
    bpmHint: 120,
    minLoopLength: 1.0, // seconds
    maxLoopLength: 8.0 // seconds - default loop length
  };
  
  const opts = { ...defaultOptions, ...options };
  
  try {
    const channel = audioBuffer.getChannelData(0);
    const sr = audioBuffer.sampleRate;
    
    // Calculate beat duration based on BPM
    const beatDuration = 60 / opts.bpmHint; // seconds per beat
    const barDuration = beatDuration * 4; // 4 beats per bar
    
    // Aim for 2, 4, or 8 bars based on BPM and audio length
    let barsToUse = 4;
    if (barDuration * 4 > opts.maxLoopLength) {
      barsToUse = 2;
    } else if (barDuration * 8 <= opts.maxLoopLength && audioBuffer.duration >= barDuration * 8) {
      barsToUse = 8;
    }
    
    // Calculate target duration based on musical bars
    const targetDuration = Math.min(barDuration * barsToUse, audioBuffer.duration * 0.8);
    
    // Find the best starting point by analyzing energy levels
    const frameSize = 1024;
    const hopSize = 512;
    const energyProfile = [];
    
    // Calculate energy profile
    for (let i = 0; i + frameSize < channel.length; i += hopSize) {
      let energy = 0;
      for (let j = 0; j < frameSize; j++) {
        energy += channel[i + j] * channel[i + j];
      }
      energyProfile.push(energy / frameSize);
    }
    
    // Find significant energy change (likely start of a phrase)
    let maxChange = 0;
    let bestStartFrame = 0;
    
    // Skip the very beginning (first 5% of the track)
    const startAnalysisFrame = Math.floor(energyProfile.length * 0.05);
    
    for (let i = startAnalysisFrame; i < energyProfile.length - 1; i++) {
      const change = Math.abs(energyProfile[i + 1] - energyProfile[i]);
      if (change > maxChange) {
        maxChange = change;
        bestStartFrame = i;
      }
    }
    
    // Convert frame index to sample index
    const startSample = Math.max(0, bestStartFrame * hopSize);
    
    // Find nearest zero crossing for clean start
    const cleanStartSample = findNearestZeroCrossing(channel, startSample);
    
    // Calculate end sample based on target duration
    const rawEndSample = cleanStartSample + Math.floor(targetDuration * sr);
    const endSample = findNearestZeroCrossing(channel, rawEndSample);
    
    // Make sure we don't exceed the buffer length
    const finalEndSample = Math.min(endSample, channel.length - 1);
    
    // Convert to normalized positions (0-1)
    const start = cleanStartSample / channel.length;
    const end = finalEndSample / channel.length;
    
    debugLog(`Loop detected: ${barsToUse} bars, ${(targetDuration).toFixed(2)}s`);
    
    return {
      start,
      end,
      confidence: 0.85,
      bars: barsToUse
    };
  } catch (error) {
    console.error('Loop detection failed:', error);
    
    // Fallback to a sensible portion of the track
    return {
      start: 0.1, // Skip the first 10%
      end: Math.min(0.5, 0.1 + (8 / audioBuffer.duration)), // 8 seconds or half the track
      confidence: 0.5,
      error: error.message
    };
  }
}

/**
 * Find nearest zero crossing
 * @private
 */
function findNearestZeroCrossing(channelData, startSample, direction = 1, maxSearch = 2048) {
  const len = channelData.length;
  let i = startSample;
  let steps = 0;
  
  // Ensure we're within bounds
  i = Math.max(0, Math.min(i, len - 1));
  
  while (steps < maxSearch && i > 0 && i < len - 1) {
    if ((channelData[i] >= 0) !== (channelData[i + 1] >= 0)) {
      return i;
    }
    i += direction;
    steps++;
  }
  
  // Fallback to original position if none found
  return startSample;
}

/**
 * Manipulate loop points
 * @param {string} action - Action to perform (half, double, forward, reset)
 * @param {Object} audioProcessor - Audio processor instance
 * @param {AudioBuffer} audioBuffer - Audio buffer
 * @returns {Object} New loop points
 */
export function manipulateLoop(action, audioProcessor, audioBuffer) {
  if (!audioProcessor || !audioBuffer) return null;
  
  const currentLoop = audioProcessor.getLoopPoints();
  let newLoop = { ...currentLoop };
  
  switch (action) {
    case 'half':
      const halfDuration = (currentLoop.end - currentLoop.start) / 2;
      newLoop.end = currentLoop.start + halfDuration;
      break;
      
    case 'double':
      const doubleDuration = (currentLoop.end - currentLoop.start) * 2;
      newLoop.end = Math.min(1, currentLoop.start + doubleDuration);
      break;
      
    case 'forward':
      const duration = currentLoop.end - currentLoop.start;
      if (currentLoop.end + duration <= 1) {
        newLoop.start += duration;
        newLoop.end += duration;
      }
      break;
      
    case 'reset':
      newLoop = { start: 0, end: 1 };
      break;
  }
  
  // Apply the new loop points
  audioProcessor.setLoopPoints(newLoop.start, newLoop.end);
  
  return newLoop;
}