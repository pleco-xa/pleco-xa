// xa-fx.js - Pleco-XA Effects Library
// All audio effects in one clean module

import {
  halfLoop,
  doubleLoop,
  moveForward,
  reverseBufferSection,
  resetLoop,
  detectLoop
} from '../../core/index.js';

/**
 * Stutter effect - Micro-repeat first 10ms
 * @param {Object} loop - Loop bounds {startSample, endSample}
 * @param {AudioBuffer} buffer - Audio buffer to process
 * @param {number} repeats - Number of repeats (default 3)
 * @returns {Object} {buffer, loop}
 */
export function stutter(loop, buffer, repeats = 3) {
  const span = Math.min(0.01 * buffer.sampleRate,
                        loop.endSample - loop.startSample);

  // Process all channels (stereo fix)
  for (let channel = 0; channel < buffer.numberOfChannels; channel++) {
    const channelData = buffer.getChannelData(channel);
    const slice = channelData.slice(loop.startSample, loop.startSample + span);

    for (let r = 0; r < repeats; r++) {
      slice.forEach((v, i) => {
        const targetIndex = loop.startSample + r * span + i;
        if (targetIndex < channelData.length) {
          channelData[targetIndex] = v;
        }
      });
    }
  }

  return { buffer, loop };
}

/**
 * Simple variable-delay phaser effect with LFO
 * Creates obvious sweeping comb-filter notches
 *
 * Wave-6 injection convention (tier-2 repair, 2026-07-02): parameters are an
 * explicit options argument — the legacy window.phaserParams global-bus read
 * crashed in Node/workers ('window is not defined').
 *
 * @param {Object} loop - Loop bounds {startSample, endSample}
 * @param {AudioBuffer} buffer - Audio buffer to process
 * @param {number} depth - Legacy mix argument (kept for call compatibility; use params.wetMix)
 * @param {Object} [params] - { minDelay, maxDelay, wetMix }
 * @returns {Object} {buffer, loop}
 */
export function phase(loop, buffer, depth = 1.0, params = {}) {
  const sampleRate = buffer.sampleRate;
  const numChannels = buffer.numberOfChannels;

  const lfoRate = 0.3; // LFO frequency in Hz (sweep speed)
  const minDelay = params.minDelay || 0.0005; // 0.5ms minimum delay
  const maxDelay = params.maxDelay || 0.005; // 5ms maximum delay
  const feedback = 0.8; // High feedback for resonance
  const wetMix = params.wetMix !== undefined ? params.wetMix : 0.9; // Use adjustable depth

  // Process only the loop section in-place
  const start = loop.startSample;
  const end = loop.endSample;
  const loopLength = end - start;

  // Max delay buffer size
  const maxDelaySamples = Math.ceil(maxDelay * sampleRate);

  // Process each channel
  for (let channel = 0; channel < numChannels; channel++) {
    const input = buffer.getChannelData(channel);

    // Create output and delay buffers
    const output = new Float32Array(loopLength);
    const delayBuffer = new Float32Array(maxDelaySamples);
    let writePos = 0;

    // Process each sample
    for (let n = 0; n < loopLength; n++) {
      // LFO: sine wave controlling delay time
      const lfoPhase = (2 * Math.PI * lfoRate * n) / sampleRate;
      const lfoValue = Math.sin(lfoPhase); // -1 to 1

      // Map LFO to delay time in samples
      const delayTime = minDelay + ((lfoValue * 0.5 + 0.5) * (maxDelay - minDelay));
      const delaySamples = delayTime * sampleRate;

      // Calculate read position (with fractional delay)
      let readPos = writePos - delaySamples;
      if (readPos < 0) readPos += maxDelaySamples;

      // Linear interpolation for fractional delay
      const readPosInt = Math.floor(readPos);
      const readPosFrac = readPos - readPosInt;
      const readPos2 = (readPosInt + 1) % maxDelaySamples;

      const delaySample = delayBuffer[readPosInt] * (1 - readPosFrac) +
                          delayBuffer[readPos2] * readPosFrac;

      // Get input sample
      const inputSample = input[start + n];

      // Write to delay buffer with feedback
      delayBuffer[writePos] = inputSample + delaySample * feedback;

      // Mix dry and wet (delayed) signal
      output[n] = inputSample * (1 - wetMix) + delaySample * wetMix;

      // Advance write position
      writePos = (writePos + 1) % maxDelaySamples;
    }

    // Copy output back to buffer
    for (let i = 0; i < loopLength; i++) {
      input[start + i] = output[i];
    }
  }

  return { buffer, loop };
}

/**
 * Fractal effect - Reverse first half of loop
 * @param {Object} loop - Loop bounds {startSample, endSample}
 * @param {AudioBuffer} buffer - Audio buffer to process
 * @returns {Object} {buffer, loop}
 */
export function fractal(loop, buffer) {
  const mid = Math.floor((loop.startSample + loop.endSample) / 2);
  buffer = reverseBufferSection(buffer, loop.startSample, mid);
  return { buffer, loop };
}

/**
 * Apply a quantum operation to audio buffer
 * @param {string} op - Operation name
 * @param {AudioBuffer} buffer - Audio buffer
 * @param {Object} loop - Loop bounds
 * @returns {Object} {buffer, loop}
 */
export const applyQuantumOp = (op, buffer, loop) => {
  switch (op) {
    case 'half':
      if (loop.endSample - loop.startSample >= 2 * (10 / 1000) * buffer.sampleRate) {
        loop = halfLoop(loop);
      }
      break;
    case 'double':
      loop = doubleLoop(loop, buffer.length);
      break;
    case 'move':
      const duration = loop.endSample - loop.startSample;
      const newStart = loop.startSample + duration;
      const newEnd = loop.endSample + duration;
      if (newEnd <= buffer.length) {
        loop = { startSample: newStart, endSample: newEnd };
      }
      break;
    case 'reverse':
      buffer = reverseBufferSection(buffer, loop.startSample, loop.endSample);
      break;
    case 'reset':
      loop = resetLoop(buffer);
      break;
    case 'stutter':
      ({ buffer, loop } = stutter(loop, buffer, 4));
      break;
    case 'phase':
      ({ buffer, loop } = phase(loop, buffer, 0.1));
      break;
    case 'fractal':
      ({ buffer, loop } = fractal(loop, buffer));
      break;
    case 'silence':
      // noop - treat as rest
      break;
    default:
      console.warn('Unknown quantum op', op);
  }
  return { buffer, loop };
};

// Export all effects as named exports
export default {
  phase,
  stutter,
  fractal,
  applyQuantumOp,
  // Re-export core helpers for convenience
  halfLoop,
  doubleLoop,
  moveForward,
  reverseBufferSection,
  resetLoop,
  detectLoop
};
