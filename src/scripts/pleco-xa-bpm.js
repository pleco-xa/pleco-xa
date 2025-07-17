/**
 * Enhanced BPM Detection Module for Pleco-XA
 * 
 * This module provides advanced BPM detection capabilities including:
 * - Live BPM tracking with real-time analysis
 * - Fourier tempogram analysis for detailed tempo analysis
 * - Constrained tempo estimation with musical intelligence
 * - Quick onset detection for performance optimization
 * - Enhanced accuracy for different music genres
 * 
 * Extracted from BPM-DEMO implementation with improvements for:
 * - R&B/hip-hop tempo detection (99 BPM bias)
 * - Genre-aware tempo selection
 * - Circular onset detection for seamless loops
 * - Advanced tempo stability analysis
 */

/**
 * Enhanced BPM Analyzer with progress tracking and detailed analysis
 * @param {Float32Array} audioData - Audio samples
 * @param {number} sampleRate - Sample rate in Hz
 * @param {number} windowSize - Analysis window size in seconds (default: 4.0)
 * @param {number} hopSize - Hop size in seconds (default: 1.0)
 * @returns {Promise<Object>} Analysis result with tempo, confidence, and detailed metrics
 */
export async function analyzeWithProgress(audioData, sampleRate, windowSize = 4.0, hopSize = 1.0) {
  try {
    console.log(`🎵 Enhanced BPM Analysis Starting...`);
    console.log(`📊 Track info: ${audioData.length.toLocaleString()} samples, ${(audioData.length/sampleRate).toFixed(1)}s duration`);
    
    // Step 1: Compute onset strength for entire track
    const globalOnsetEnvelope = await computeOnsetStrength(audioData, sampleRate);
    console.log(`✅ Onset envelope computed: ${globalOnsetEnvelope.length} frames`);
    
    // Step 2: Find global tempo candidates
    const globalTempo = await estimateGlobalTempo(globalOnsetEnvelope, sampleRate);
    console.log(`🎯 Global tempo: ${globalTempo.bpm.toFixed(1)} BPM (confidence: ${(globalTempo.confidence * 100).toFixed(1)}%)`);
    
    // Step 3: Compute Fourier tempogram for detailed analysis
    const tempogramResult = await computeFourierTempogram(globalOnsetEnvelope, sampleRate);
    console.log(`📈 Tempogram computed: ${tempogramResult.frames} time frames`);
    
    // Step 4: Analyze tempo stability over time
    const windowSamples = Math.floor(windowSize * sampleRate);
    const hopSamples = Math.floor(hopSize * sampleRate);
    const numWindows = Math.floor((audioData.length - windowSamples) / hopSamples);
    
    const dynamicTempo = [];
    const times = [];
    
    for (let i = 0; i < numWindows; i++) {
      const start = i * hopSamples;
      const window = audioData.slice(start, start + windowSamples);
      const localResult = await estimateConstrainedTempo(window, sampleRate, globalTempo.bpm, i);
      dynamicTempo.push(localResult.bpm);
      times.push(start / sampleRate);
    }
    
    return {
      success: true,
      times,
      tempo: dynamicTempo,
      globalTempo: globalTempo.bpm,
      confidence: globalTempo.confidence,
      candidates: globalTempo.candidates,
      tempogram: tempogramResult,
      onsetEnvelope: globalOnsetEnvelope
    };
  } catch (error) {
    return { success: false, error: error.message };
  }
}

/**
 * Compute onset strength envelope for audio signal
 * @param {Float32Array} audioData - Audio samples
 * @param {number} sampleRate - Sample rate in Hz
 * @returns {Promise<Float32Array>} Onset strength envelope
 */
export async function computeOnsetStrength(audioData, sampleRate) {
  const frameLength = 2048;
  const hopLength = 512;
  const frames = Math.floor((audioData.length - frameLength) / hopLength) + 1;
  const onset = new Float32Array(frames);
  
  let prevSpectrum = null;
  let maxFlux = 0;
  
  for (let i = 0; i < frames; i++) {
    const start = i * hopLength;
    const frame = new Float32Array(frameLength);
    
    // Apply Hann window
    for (let j = 0; j < frameLength && start + j < audioData.length; j++) {
      const windowValue = 0.5 * (1 - Math.cos((2 * Math.PI * j) / (frameLength - 1)));
      frame[j] = audioData[start + j] * windowValue;
    }
    
    const spectrum = computeSimpleSpectrum(frame);
    
    if (prevSpectrum) {
      let flux = 0;
      for (let k = 0; k < Math.min(spectrum.length, prevSpectrum.length); k++) {
        flux += Math.max(0, spectrum[k] - prevSpectrum[k]);
      }
      onset[i] = flux;
      maxFlux = Math.max(maxFlux, flux);
    } else {
      onset