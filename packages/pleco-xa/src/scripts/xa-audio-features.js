/**
 * Computes the Root Mean Square (RMS) energy of an audio buffer
 * RMS is a measure of the average power of the signal
 * 
 * @param {Float32Array} buffer - Audio buffer to analyze
 * @param {Number} frameSize - Size of each frame to analyze (default: 1024)
 * @param {Number} hopSize - Number of samples to advance between frames (default: frameSize/2)
 * @return {Float32Array} - Array of RMS values for each frame
 */
export function computeRMS(buffer, frameSize = 1024, hopSize = frameSize / 2) {
  const numFrames = Math.floor((buffer.length - frameSize) / hopSize) + 1;
  const rms = new Float32Array(numFrames);
  
  for (let i = 0; i < numFrames; i++) {
    const frameStart = i * hopSize;
    let sum = 0;
    
    // Sum squared values in this frame
    for (let j = 0; j < frameSize; j++) {
      const pos = frameStart + j;
      if (pos >= buffer.length) break;
      
      sum += buffer[pos] * buffer[pos];
    }
    
    // Calculate RMS (square root of mean of squares)
    rms[i] = Math.sqrt(sum / frameSize);
  }
  
  return rms;
}

/**
 * Computes the Zero Crossing Rate (ZCR) of an audio buffer
 * ZCR measures how often the signal crosses the zero line, useful for
 * detecting percussive sounds and distinguishing voiced/unvoiced audio
 * 
 * @param {Float32Array} buffer - Audio buffer to analyze
 * @param {Number} frameSize - Size of each frame to analyze (default: 1024)
 * @param {Number} hopSize - Number of samples to advance between frames (default: frameSize/2)
 * @return {Float32Array} - Array of ZCR values for each frame
 */
export function computeZeroCrossingRate(buffer, frameSize = 1024, hopSize = frameSize / 2) {
  const numFrames = Math.floor((buffer.length - frameSize) / hopSize) + 1;
  const zcr = new Float32Array(numFrames);
  
  for (let i = 0; i < numFrames; i++) {
    const frameStart = i * hopSize;
    let crossings = 0;
    
    // Count zero crossings in this frame
    for (let j = frameStart + 1; j < frameStart + frameSize; j++) {
      if ((buffer[j - 1] >= 0 && buffer[j] < 0) || 
          (buffer[j - 1] < 0 && buffer[j] >= 0)) {
        crossings++;
      }
    }
    
    // Normalize by frame size
    zcr[i] = crossings / (frameSize - 1);
  }
  
  return zcr;
}

/**
 * Computes peak amplitude values from an audio buffer
 * 
 * @param {Float32Array} buffer - Audio buffer to analyze
 * @param {Number} frameSize - Size of each frame to analyze (default: 1024)
 * @param {Number} hopSize - Number of samples to advance between frames (default: frameSize/2)
 * @return {Object} - Object containing peak values and positions
 */
export function computePeak(buffer, frameSize = 1024, hopSize = frameSize / 2) {
  const numFrames = Math.floor((buffer.length - frameSize) / hopSize) + 1;
  const peaks = new Float32Array(numFrames);
  const peakPositions = new Int32Array(numFrames);
  
  for (let i = 0; i < numFrames; i++) {
    const frameStart = i * hopSize;
    let maxPeak = 0;
    let maxPos = 0;
    
    // Find peak in this frame
    for (let j = 0; j < frameSize; j++) {
      const pos = frameStart + j;
      if (pos >= buffer.length) break;
      
      const absVal = Math.abs(buffer[pos]);
      if (absVal > maxPeak) {
        maxPeak = absVal;
        maxPos = pos;
      }
    }
    
    peaks[i] = maxPeak;
    peakPositions[i] = maxPos;
  }
  
  return {
    peakValues: peaks,
    peakPositions: peakPositions,
    globalPeak: Math.max(...peaks),
    globalPeakPosition: peakPositions[peaks.indexOf(Math.max(...peaks))]
  };
}