# Spectral Analysis Loop Detection Documentation

## Overview

This document details the sophisticated spectral analysis algorithms used for automatic loop detection in Pleco-XA. The system uses advanced signal processing techniques including FFT analysis, chroma feature extraction, and recurrence matrix computation to identify musically meaningful loop boundaries.

## Core Algorithm: Recurrence-Based Loop Detection

### Primary Implementation

**File:** `src/scripts/xa-recurrence.js`
**Algorithm:** Recurrence Matrix Analysis with Chroma Features
**Technology:** Custom FFT + Spectral Analysis

#### High-Level Process Flow

1. **Chroma Extraction:** Convert audio to 12-bin harmonic features
2. **Time-Delay Embedding:** Create feature vectors from chroma sequences
3. **Recurrence Matrix:** Compute similarity between all time points
4. **Loop Detection:** Find strongest recurring patterns in the matrix

### Detailed Algorithm Implementation

#### 1. Chroma Feature Extraction

**Purpose:** Convert audio to harmonic content representation (C, C#, D, D#, E, F, F#, G, G#, A, A#, B)

```javascript
function computeChroma(audioBuffer, hopLength = 512, fftSize = 2048) {
  const channelData = audioBuffer.getChannelData(0);
  const sampleRate = audioBuffer.sampleRate;
  const numFrames = Math.floor((channelData.length - fftSize) / hopLength) + 1;
  
  const chromaFeatures = [];
  
  for (let frame = 0; frame < numFrames; frame++) {
    const startSample = frame * hopLength;
    const frameData = channelData.slice(startSample, startSample + fftSize);
    
    // Apply Hann window
    const windowedFrame = applyHannWindow(frameData);
    
    // Compute FFT
    const fftResult = computeFFT(windowedFrame);
    
    // Convert magnitude spectrum to chroma
    const chromaBins = new Array(12).fill(0);
    
    for (let bin = 0; bin < fftResult.length / 2; bin++) {
      const frequency = (bin * sampleRate) / fftSize;
      const magnitude = Math.sqrt(
        fftResult[bin].real * fftResult[bin].real + 
        fftResult[bin].imag * fftResult[bin].imag
      );
      
      // Map frequency to chroma bin (0-11 for C-B)
      const chromaBin = frequencyToChromaBin(frequency);
      if (chromaBin >= 0 && chromaBin < 12) {
        chromaBins[chromaBin] += magnitude;
      }
    }
    
    // Normalize chroma vector
    const chromaNorm = Math.sqrt(chromaBins.reduce((sum, val) => sum + val * val, 0));
    if (chromaNorm > 0) {
      chromaBins.forEach((val, i) => chromaBins[i] = val / chromaNorm);
    }
    
    chromaFeatures.push(chromaBins);
  }
  
  return chromaFeatures;
}

function frequencyToChromaBin(frequency) {
  if (frequency <= 0) return -1;
  
  // Convert frequency to MIDI note number
  const midiNote = 12 * Math.log2(frequency / 440) + 69; // A4 = 440Hz = MIDI 69
  
  // Map to chroma bin (0 = C, 1 = C#, ..., 11 = B)
  return Math.round(midiNote) % 12;
}
```

#### 2. Time-Delay Embedding

**Purpose:** Create feature vectors by stacking consecutive chroma frames

```javascript
function createTimeDelayEmbedding(chromaFeatures, embeddingDimension = 5) {
  const embeddedFeatures = [];
  
  for (let i = 0; i < chromaFeatures.length - embeddingDimension + 1; i++) {
    const embeddedVector = [];
    
    // Stack consecutive chroma vectors
    for (let j = 0; j < embeddingDimension; j++) {
      embeddedVector.push(...chromaFeatures[i + j]);
    }
    
    embeddedFeatures.push(embeddedVector);
  }
  
  return embeddedFeatures;
}
```

#### 3. Recurrence Matrix Computation

**Purpose:** Compute similarity matrix showing when harmonic patterns repeat

```javascript
function computeRecurrenceMatrix(embeddedFeatures, threshold = 0.1) {
  const numFrames = embeddedFeatures.length;
  const recurrenceMatrix = Array(numFrames).fill().map(() => Array(numFrames).fill(0));
  
  for (let i = 0; i < numFrames; i++) {
    for (let j = 0; j < numFrames; j++) {
      // Compute cosine similarity between feature vectors
      const similarity = cosineSimilarity(embeddedFeatures[i], embeddedFeatures[j]);
      
      // Apply threshold for binary recurrence matrix
      recurrenceMatrix[i][j] = similarity > threshold ? 1 : 0;
    }
  }
  
  return recurrenceMatrix;
}

function cosineSimilarity(vectorA, vectorB) {
  let dotProduct = 0;
  let normA = 0;
  let normB = 0;
  
  for (let i = 0; i < vectorA.length; i++) {
    dotProduct += vectorA[i] * vectorB[i];
    normA += vectorA[i] * vectorA[i];
    normB += vectorB[i] * vectorB[i];
  }
  
  normA = Math.sqrt(normA);
  normB = Math.sqrt(normB);
  
  if (normA === 0 || normB === 0) return 0;
  
  return dotProduct / (normA * normB);
}
```

#### 4. Loop Boundary Detection

**Purpose:** Find diagonal structures in recurrence matrix indicating periodic repetition

```javascript
function detectLoopBoundaries(recurrenceMatrix, minLoopLength = 44100, maxLoopLength = 441000) {
  const numFrames = recurrenceMatrix.length;
  const loopCandidates = [];
  
  // Search for diagonal structures (parallel to main diagonal)
  for (let lag = minLoopLength; lag <= maxLoopLength && lag < numFrames; lag++) {
    let diagonalScore = 0;
    let diagonalLength = 0;
    
    // Compute diagonal line strength
    for (let i = 0; i < numFrames - lag; i++) {
      if (recurrenceMatrix[i][i + lag] === 1) {
        diagonalScore++;
      }
      diagonalLength++;
    }
    
    const normalizedScore = diagonalLength > 0 ? diagonalScore / diagonalLength : 0;
    
    if (normalizedScore > 0.3) { // Threshold for significant repetition
      loopCandidates.push({
        lag: lag,
        score: normalizedScore,
        startFrame: 0,
        endFrame: lag
      });
    }
  }
  
  // Select best loop candidate
  loopCandidates.sort((a, b) => b.score - a.score);
  
  if (loopCandidates.length > 0) {
    const bestLoop = loopCandidates[0];
    
    // Convert frame indices back to time
    const hopLength = 512;
    const sampleRate = 44100; // Should be passed from audio buffer
    
    return {
      start: (bestLoop.startFrame * hopLength) / sampleRate,
      end: (bestLoop.endFrame * hopLength) / sampleRate,
      confidence: bestLoop.score
    };
  }
  
  return null;
}
```

## Supporting Spectral Analysis Components

### 1. FFT Implementation

**File:** `src/scripts/xa-fft.js`
**Purpose:** Core frequency domain transformation

```javascript
export function computeFFT(timeData) {
  const N = timeData.length;
  
  // Ensure power of 2 for efficiency
  const paddedN = Math.pow(2, Math.ceil(Math.log2(N)));
  const paddedData = new Array(paddedN).fill(0);
  
  for (let i = 0; i < N; i++) {
    paddedData[i] = timeData[i];
  }
  
  return fftRecursive(paddedData);
}

function fftRecursive(x) {
  const N = x.length;
  
  if (N === 1) {
    return [{ real: x[0], imag: 0 }];
  }
  
  // Divide
  const even = [];
  const odd = [];
  
  for (let i = 0; i < N; i++) {
    if (i % 2 === 0) {
      even.push(x[i]);
    } else {
      odd.push(x[i]);
    }
  }
  
  // Conquer
  const evenFFT = fftRecursive(even);
  const oddFFT = fftRecursive(odd);
  
  // Combine
  const result = new Array(N);
  
  for (let k = 0; k < N / 2; k++) {
    const angle = -2 * Math.PI * k / N;
    const twiddle = {
      real: Math.cos(angle),
      imag: Math.sin(angle)
    };
    
    const oddTerm = {
      real: twiddle.real * oddFFT[k].real - twiddle.imag * oddFFT[k].imag,
      imag: twiddle.real * oddFFT[k].imag + twiddle.imag * oddFFT[k].real
    };
    
    result[k] = {
      real: evenFFT[k].real + oddTerm.real,
      imag: evenFFT[k].imag + oddTerm.imag
    };
    
    result[k + N / 2] = {
      real: evenFFT[k].real - oddTerm.real,
      imag: evenFFT[k].imag - oddTerm.imag
    };
  }
  
  return result;
}
```

### 2. Spectral Feature Extraction

**File:** `src/scripts/xa-spectral.js`
**Purpose:** Advanced spectral features for musical analysis

```javascript
export function spectralCentroid(magnitudeSpectrum, sampleRate) {
  let weightedSum = 0;
  let magnitudeSum = 0;
  
  for (let i = 0; i < magnitudeSpectrum.length; i++) {
    const frequency = (i * sampleRate) / (2 * magnitudeSpectrum.length);
    const magnitude = magnitudeSpectrum[i];
    
    weightedSum += frequency * magnitude;
    magnitudeSum += magnitude;
  }
  
  return magnitudeSum > 0 ? weightedSum / magnitudeSum : 0;
}

export function spectralRolloff(magnitudeSpectrum, sampleRate, rolloffPercent = 0.95) {
  const totalEnergy = magnitudeSpectrum.reduce((sum, mag) => sum + mag * mag, 0);
  const threshold = totalEnergy * rolloffPercent;
  
  let cumulativeEnergy = 0;
  
  for (let i = 0; i < magnitudeSpectrum.length; i++) {
    cumulativeEnergy += magnitudeSpectrum[i] * magnitudeSpectrum[i];
    
    if (cumulativeEnergy >= threshold) {
      return (i * sampleRate) / (2 * magnitudeSpectrum.length);
    }
  }
  
  return sampleRate / 2; // Nyquist frequency
}

export function spectralBandwidth(magnitudeSpectrum, sampleRate) {
  const centroid = spectralCentroid(magnitudeSpectrum, sampleRate);
  let weightedVariance = 0;
  let magnitudeSum = 0;
  
  for (let i = 0; i < magnitudeSpectrum.length; i++) {
    const frequency = (i * sampleRate) / (2 * magnitudeSpectrum.length);
    const magnitude = magnitudeSpectrum[i];
    
    weightedVariance += Math.pow(frequency - centroid, 2) * magnitude;
    magnitudeSum += magnitude;
  }
  
  return magnitudeSum > 0 ? Math.sqrt(weightedVariance / magnitudeSum) : 0;
}
```

### 3. Comprehensive Loop Analysis

**File:** `src/scripts/loop-analyzer.js`
**Purpose:** Integrate multiple analysis methods for robust loop detection

```javascript
export async function analyzeAudioForLoops(audioBuffer) {
  const results = {
    recurrenceLoop: null,
    spectralFeatures: null,
    confidence: 0,
    metadata: {}
  };
  
  try {
    // Primary method: Recurrence analysis
    results.recurrenceLoop = await recurrenceLoopDetection(audioBuffer);
    
    // Supporting analysis: Spectral features
    const magnitudeSpectrum = await computeMagnitudeSpectrum(audioBuffer);
    results.spectralFeatures = {
      centroid: spectralCentroid(magnitudeSpectrum, audioBuffer.sampleRate),
      bandwidth: spectralBandwidth(magnitudeSpectrum, audioBuffer.sampleRate),
      rolloff: spectralRolloff(magnitudeSpectrum, audioBuffer.sampleRate)
    };
    
    // Confidence calculation
    if (results.recurrenceLoop) {
      results.confidence = calculateLoopConfidence(results.recurrenceLoop, results.spectralFeatures);
    }
    
    // Metadata
    results.metadata = {
      duration: audioBuffer.duration,
      sampleRate: audioBuffer.sampleRate,
      channels: audioBuffer.numberOfChannels,
      analysisTime: Date.now()
    };
    
  } catch (error) {
    console.error('Loop analysis failed:', error);
    results.error = error.message;
  }
  
  return results;
}

function calculateLoopConfidence(loopData, spectralFeatures) {
  let confidence = loopData.confidence || 0;
  
  // Boost confidence for musically reasonable loop lengths
  const loopDuration = loopData.end - loopData.start;
  if (loopDuration >= 1.0 && loopDuration <= 16.0) { // 1-16 seconds
    confidence *= 1.2;
  }
  
  // Boost confidence for consistent spectral content
  if (spectralFeatures.bandwidth < 2000) { // Focused frequency content
    confidence *= 1.1;
  }
  
  return Math.min(confidence, 1.0);
}
```

## Integration with User Interface

### Detection Trigger

**Location:** `src/components/AudioAnalyzer.astro`
**Button:** "🔍 Detect Loop"

```javascript
async function detectLoop() {
  if (!globalAudioBuffer) {
    showToast('No audio loaded', 'error');
    return;
  }
  
  showToast('Analyzing audio for loops...', 'info');
  
  try {
    const analysis = await analyzeAudioForLoops(globalAudioBuffer);
    
    if (analysis.recurrenceLoop && analysis.confidence > 0.3) {
      currentLoop = analysis.recurrenceLoop;
      applyLoop(currentLoop);
      
      showToast(
        `Loop detected! Confidence: ${(analysis.confidence * 100).toFixed(1)}%`, 
        'success'
      );
    } else {
      showToast('No reliable loop detected', 'warning');
    }
    
  } catch (error) {
    console.error('Loop detection error:', error);
    showToast('Loop detection failed', 'error');
  }
}
```

### Real-time Analysis Mode

**Future Enhancement:** Continuous loop detection during playback

```javascript
class RealtimeLoopDetector {
  constructor(audioContext, analysisInterval = 1000) {
    this.audioContext = audioContext;
    this.analysisInterval = analysisInterval;
    this.isRunning = false;
    this.intervalId = null;
  }
  
  start() {
    if (this.isRunning) return;
    
    this.isRunning = true;
    this.intervalId = setInterval(() => {
      this.performIncrementalAnalysis();
    }, this.analysisInterval);
  }
  
  async performIncrementalAnalysis() {
    // Analyze recent audio chunk for emerging loop patterns
    const recentAudio = this.extractRecentAudio();
    if (recentAudio) {
      const analysis = await analyzeAudioForLoops(recentAudio);
      this.updateLoopHypotheses(analysis);
    }
  }
}
```

## Algorithm Performance and Optimization

### Computational Complexity

**Time Complexity:**
- FFT Computation: O(n log n) per frame
- Chroma Extraction: O(n) per frame  
- Recurrence Matrix: O(f²) where f = number of frames
- Overall: O(f² + fn log n) where f ≈ duration/hop_length

**Space Complexity:**
- Chroma Features: O(f × 12)
- Embedded Features: O(f × 12 × embedding_dimension)
- Recurrence Matrix: O(f²)

### Optimization Strategies

#### 1. Hierarchical Analysis

```javascript
function hierarchicalLoopDetection(audioBuffer) {
  // Level 1: Coarse analysis with large hop length
  const coarseResult = recurrenceLoopDetection(audioBuffer, {
    hopLength: 2048,
    embeddingDimension: 3
  });
  
  if (coarseResult && coarseResult.confidence > 0.5) {
    // Level 2: Fine analysis around detected region
    const fineRegion = extractAudioRegion(
      audioBuffer, 
      coarseResult.start - 2, 
      coarseResult.end + 2
    );
    
    const fineResult = recurrenceLoopDetection(fineRegion, {
      hopLength: 512,
      embeddingDimension: 5
    });
    
    return fineResult;
  }
  
  return coarseResult;
}
```

#### 2. Incremental Processing

```javascript
class IncrementalLoopDetector {
  constructor() {
    this.chromaHistory = [];
    this.recurrenceMatrixBuffer = [];
  }
  
  addAudioChunk(audioChunk) {
    // Compute chroma for new chunk
    const newChroma = computeChroma(audioChunk);
    this.chromaHistory.push(...newChroma);
    
    // Update recurrence matrix incrementally
    this.updateRecurrenceMatrix(newChroma);
    
    // Check for new loop patterns
    return this.detectEmergingLoops();
  }
}
```

## Error Handling and Edge Cases

### Robust Detection Strategies

```javascript
function robustLoopDetection(audioBuffer, options = {}) {
  const strategies = [
    () => recurrenceLoopDetection(audioBuffer, { ...options, threshold: 0.1 }),
    () => recurrenceLoopDetection(audioBuffer, { ...options, threshold: 0.2 }),
    () => autocorrelationLoopDetection(audioBuffer, options),
    () => templateMatchingLoopDetection(audioBuffer, options)
  ];
  
  for (const strategy of strategies) {
    try {
      const result = strategy();
      if (result && result.confidence > 0.3) {
        return result;
      }
    } catch (error) {
      console.warn('Loop detection strategy failed:', error);
    }
  }
  
  return null; // No reliable loop found
}
```

### Audio Quality Validation

```javascript
function validateAudioQuality(audioBuffer) {
  const channelData = audioBuffer.getChannelData(0);
  
  // Check for silence
  const rms = Math.sqrt(channelData.reduce((sum, sample) => sum + sample * sample, 0) / channelData.length);
  if (rms < 0.001) {
    throw new Error('Audio appears to be silent or very quiet');
  }
  
  // Check for clipping
  const maxAmplitude = Math.max(...channelData.map(Math.abs));
  if (maxAmplitude > 0.99) {
    console.warn('Audio may be clipped, loop detection accuracy may be reduced');
  }
  
  // Check duration
  if (audioBuffer.duration < 2.0) {
    throw new Error('Audio too short for reliable loop detection (minimum 2 seconds)');
  }
  
  return true;
}
```

## Future Enhancements

### Advanced Spectral Techniques

**Phase Vocoder Integration:**
- More sophisticated time-frequency analysis
- Better handling of transient sounds
- Improved pitch stability during analysis

**Machine Learning Integration:**
- Neural network-based loop detection
- Training on labeled loop datasets
- Genre-specific loop detection models

**Multi-resolution Analysis:**
- Wavelet transforms for multi-scale analysis
- Hierarchical pattern detection
- Cross-scale pattern correlation

---

*Last Updated: January 2025*
*Algorithm Basis: Recurrence Matrix Analysis, Chroma Feature Extraction, FFT Spectral Analysis*