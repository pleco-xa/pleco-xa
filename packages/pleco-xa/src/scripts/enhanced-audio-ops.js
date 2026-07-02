// Enhanced audio operations with live responsiveness and large buffer support
import { halfLoop, doubleLoop, moveForward, resetLoop, detectLoop } from '../core/index.js';

// Enhanced reverse with chunked processing for large buffers
export function reverseBufferSectionEnhanced(buffer, start, end, options = {}) {
  const {
    chunkSize = 44100 * 2, // 2 seconds at 44.1kHz
    maxProcessingTime = 100, // Max 100ms per chunk to stay responsive
    onProgress = null
  } = options;
  
  const totalSamples = end - start;
  const isLargeOperation = totalSamples > chunkSize;
  
  console.log(`🔄 Reversing ${totalSamples} samples (${(totalSamples/buffer.sampleRate).toFixed(2)}s)`);
  
  if (!isLargeOperation) {
    // Small operation - do it immediately (existing fast method)
    return reverseBufferSectionFast(buffer, start, end);
  }
  
  // Large operation - use chunked processing
  return reverseBufferSectionChunked(buffer, start, end, chunkSize, onProgress);
}

// Fast reverse for small sections (original method)
function reverseBufferSectionFast(buffer, start, end) {
  for (let c = 0; c < buffer.numberOfChannels; c++) {
    const data = buffer.getChannelData(c);
    let i = 0;
    let j = end - start - 1;
    while (i < j) {
      const a = data[start + i];
      data[start + i] = data[start + j];
      data[start + j] = a;
      i++;
      j--;
    }
  }
  return buffer;
}

// Chunked reverse for large sections
async function reverseBufferSectionChunked(buffer, start, end, chunkSize, onProgress) {
  const totalSamples = end - start;
  const numChunks = Math.ceil(totalSamples / chunkSize);
  
  for (let chunk = 0; chunk < numChunks; chunk++) {
    const chunkStart = start + (chunk * chunkSize);
    const chunkEnd = Math.min(chunkStart + chunkSize, end);
    
    // Process this chunk
    for (let c = 0; c < buffer.numberOfChannels; c++) {
      const data = buffer.getChannelData(c);
      let i = 0;
      let j = (chunkEnd - chunkStart) - 1;
      while (i < j) {
        const a = data[chunkStart + i];
        data[chunkStart + i] = data[chunkStart + j];
        data[chunkStart + j] = a;
        i++;
        j--;
      }
    }
    
    // Progress callback
    if (onProgress) {
      onProgress((chunk + 1) / numChunks);
    }
    
    // Yield control to prevent blocking (every 4 chunks)
    if (chunk % 4 === 0) {
      await new Promise(resolve => setTimeout(resolve, 0));
    }
  }
  
  return buffer;
}

// Enhanced operation detector - checks if operation is "large"
export function isLargeOperation(buffer, loop, operation) {
  const loopSamples = loop.endSample - loop.startSample;
  const loopDuration = loopSamples / buffer.sampleRate;
  const bufferDuration = buffer.length / buffer.sampleRate;
  
  // Consider "large" if:
  // 1. Loop is > 10 seconds
  // 2. Loop is > 70% of total buffer
  // 3. Buffer itself is > 60 seconds
  const isLongLoop = loopDuration > 10;
  const isLargePercentage = (loopSamples / buffer.length) > 0.7;
  const isLongFile = bufferDuration > 60;
  
  const large = isLongLoop || isLargePercentage || isLongFile;
  
  if (large) {
    console.log(`⚠️ Large operation detected:`, {
      operation,
      loopDuration: loopDuration.toFixed(2) + 's',
      loopPercentage: ((loopSamples / buffer.length) * 100).toFixed(1) + '%',
      bufferDuration: bufferDuration.toFixed(2) + 's',
      reason: isLongLoop ? 'long loop' : isLargePercentage ? 'large percentage' : 'long file'
    });
  }
  
  return large;
}

// Enhanced apply operation with live responsiveness
export async function applyOperationEnhanced(operation, buffer, loop, onProgress = null) {
  const isLarge = isLargeOperation(buffer, loop, operation);
  
  if (onProgress && isLarge) {
    onProgress(0, `Starting ${operation}...`);
  }
  
  switch (operation) {
    case 'reverse':
      if (isLarge) {
        // Use chunked processing for large reverse operations
        return await reverseBufferSectionEnhanced(buffer, loop.startSample, loop.endSample, {
          onProgress: (progress) => {
            if (onProgress) onProgress(progress, `Reversing... ${(progress * 100).toFixed(0)}%`);
          }
        });
      } else {
        // Use fast method for small operations
        return reverseBufferSectionFast(buffer, loop.startSample, loop.endSample);
      }
      
    case 'half':
      if (loop.endSample - loop.startSample >= 2 * (10 / 1000) * buffer.sampleRate) {
        return { buffer, loop: halfLoop(loop) };
      }
      break;
      
    case 'double':
      return { buffer, loop: doubleLoop(loop, buffer.length) };
      
    case 'move':
      const duration = loop.endSample - loop.startSample;
      const newStart = loop.startSample + duration;
      const newEnd = loop.endSample + duration;
      if (newEnd <= buffer.length) {
        return { buffer, loop: { startSample: newStart, endSample: newEnd } };
      }
      break;
      
    case 'reset':
      return { buffer, loop: resetLoop(buffer) };
      
    default:
      console.warn(`Unknown operation: ${operation}`);
  }
  
  return { buffer, loop };
}

// Safety checker for buffer operations
export function checkBufferSafety(buffer, loop) {
  const issues = [];
  
  // Check buffer validity
  if (!buffer || !buffer.getChannelData) {
    issues.push('Invalid audio buffer');
  }
  
  // Check loop bounds
  if (loop.startSample < 0) {
    issues.push('Loop start is negative');
  }
  
  if (loop.endSample > buffer.length) {
    issues.push(`Loop end (${loop.endSample}) exceeds buffer length (${buffer.length})`);
  }
  
  if (loop.startSample >= loop.endSample) {
    issues.push('Loop start >= loop end');
  }
  
  // Check for very large operations
  const loopSamples = loop.endSample - loop.startSample;
  const maxSafeOperation = 44100 * 120; // 120 seconds at 44.1kHz
  
  if (loopSamples > maxSafeOperation) {
    issues.push(`Loop too large for safe processing: ${(loopSamples/buffer.sampleRate).toFixed(1)}s`);
  }
  
  return {
    safe: issues.length === 0,
    issues: issues,
    loopDuration: loopSamples / buffer.sampleRate,
    loopPercentage: (loopSamples / buffer.length) * 100
  };
}