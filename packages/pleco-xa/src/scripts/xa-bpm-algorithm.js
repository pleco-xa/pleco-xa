/**
 * BPM Detection Algorithm from lb
 * Advanced tempo detection with spectral flux onset detection,
 * autocorrelation tempo estimation, and Fourier tempogram validation
 *
 * IMPORTANT: This is the exact algorithm from lb/index.html lines 917-1276
 * All functions preserved exactly for accurate BPM detection
 */

/**
 * Main analysis orchestrator with progress yielding
 * From lb/index.html lines 917-981
 */
export async function analyzeWithProgress(y, sr, windowSize = 4, hopSize = 1) {
  // Step 1: Compute onset strength
  const onsetEnvelope = await computeOnsetStrength(y, sr);

  // Step 2: Find global tempo
  const globalResult = await estimateGlobalTempo(onsetEnvelope, sr);
  const globalTempo = globalResult.bpm;
  const globalConfidence = globalResult.confidence;
  const globalCandidates = globalResult.candidates;

  // Step 3: Compute tempogram
  const tempogramResult = await computeFourierTempogram(onsetEnvelope, sr);
  const tempogram = tempogramResult.tempogram;
  const tempogramFreqs = tempogramResult.frequencies;
  const tempogramPeaks = tempogramResult.peakTempos;

  // Step 4: Analyze tempo stability window-by-window
  const tempo = [];
  const times = [];
  const confidence = [];

  const onsetRate = sr / 512; // hop_length = 512
  const windowSamples = Math.floor(windowSize * onsetRate);
  const hopSamples = Math.floor(hopSize * onsetRate);
  const numWindows = Math.floor((onsetEnvelope.length - windowSamples) / hopSamples) + 1;

  // Process windows with periodic yielding
  for (let i = 0; i < numWindows; i++) {
    const start = i * hopSamples;
    const end = start + windowSamples;
    const window = onsetEnvelope.slice(start, end);

    const localResult = await estimateConstrainedTempo(window, sr, globalTempo);
    tempo.push(localResult.bpm);
    confidence.push(localResult.confidence);
    times.push(start / onsetRate);

    // Yield every 2 windows
    if (i % 2 === 0) {
      await new Promise(resolve => setTimeout(resolve, 10));
    }
  }

  return {
    globalTempo,
    globalConfidence,
    globalCandidates,
    tempo,
    confidence,
    times,
    onsetEnvelope,
    tempogram: {
      data: tempogram,
      frequencies: tempogramFreqs,
      peakTempos: tempogramPeaks
    }
  };
}

/**
 * Compute onset strength using spectral flux
 * From lb/index.html lines 983-1019
 */
export async function computeOnsetStrength(y, sr) {
  const frameSize = 2048;
  const hopSize = 512;
  const numFrames = Math.floor((y.length - frameSize) / hopSize) + 1;

  // Pre-compute window
  const window = new Float32Array(frameSize);
  for (let i = 0; i < frameSize; i++) {
    window[i] = 0.5 * (1 - Math.cos(2 * Math.PI * i / (frameSize - 1)));
  }

  const onsetStrength = new Float32Array(numFrames);
  let prevSpectrum = null;

  for (let i = 0; i < numFrames; i++) {
    const start = i * hopSize;
    const frame = new Float32Array(frameSize);

    // Apply window
    for (let j = 0; j < frameSize && start + j < y.length; j++) {
      frame[j] = y[start + j] * window[j];
    }

    // Compute spectrum
    const spectrum = await computeSimpleSpectrum(frame);

    // Calculate spectral flux
    if (prevSpectrum) {
      let flux = 0;
      for (let k = 0; k < spectrum.length; k++) {
        const diff = spectrum[k] - prevSpectrum[k];
        if (diff > 0) flux += diff;
      }
      onsetStrength[i] = flux;
    }

    prevSpectrum = spectrum;

    // Yield periodically
    if (i % 200 === 0) {
      await new Promise(resolve => setTimeout(resolve, 1));
    }
  }

  return onsetStrength;
}

/**
 * Estimate global tempo using autocorrelation
 * From lb/index.html lines 1021-1081
 */
export async function estimateGlobalTempo(onsetEnvelope, sr) {
  const hopLength = 512;
  const onsetRate = sr / hopLength;

  // BPM search range
  const minBPM = 70;
  const maxBPM = 180;

  // Convert to lag range
  const maxLag = Math.round(60 * onsetRate / minBPM);
  const minLag = Math.round(60 * onsetRate / maxBPM);

  const candidates = [];
  let bestScore = -Infinity;
  let bestBPM = 120;

  // Normalize onset envelope
  let mean = 0;
  for (let i = 0; i < onsetEnvelope.length; i++) {
    mean += onsetEnvelope[i];
  }
  mean /= onsetEnvelope.length;

  const normalized = new Float32Array(onsetEnvelope.length);
  for (let i = 0; i < onsetEnvelope.length; i++) {
    normalized[i] = onsetEnvelope[i] - mean;
  }

  // Autocorrelation
  for (let lag = minLag; lag <= maxLag && lag < onsetEnvelope.length; lag++) {
    let correlation = 0;
    let norm1 = 0;
    let norm2 = 0;

    for (let i = 0; i < onsetEnvelope.length - lag; i++) {
      correlation += normalized[i] * normalized[i + lag];
      norm1 += normalized[i] * normalized[i];
      norm2 += normalized[i + lag] * normalized[i + lag];
    }

    // Normalized correlation
    const score = correlation / Math.sqrt(norm1 * norm2 + 1e-10);
    const bpm = 60 * onsetRate / lag;

    candidates.push({ bpm, score });

    if (score > bestScore) {
      bestScore = score;
      bestBPM = bpm;
    }

    // Yield periodically
    if ((lag - minLag) % 20 === 0) {
      await new Promise(resolve => setTimeout(resolve, 1));
    }
  }

  // Calculate confidence based on peak prominence
  candidates.sort((a, b) => b.score - a.score);
  const confidence = candidates.length > 1
    ? (candidates[0].score - candidates[1].score) / (candidates[0].score + 1e-10)
    : 0.5;

  // REPAIR (2026-07-02 proof-of-work): octave correction. The hard 70-180
  // search range makes 2-period subharmonic lags win on material whose true
  // tempo sits above ~140 (e.g. a 140 BPM train scored best at 69.8). If the
  // winner sits in the subharmonic zone and a candidate near double tempo
  // carries at least 70% of its correlation, prefer the double — a true
  // slow tempo has no half-period correlation, so this never fires for
  // genuinely slow material.
  if (bestBPM < 90 && 2 * bestBPM <= maxBPM + 10) {
    let double = null;
    for (const c of candidates) {
      if (Math.abs(c.bpm - 2 * bestBPM) < 8 && (double === null || c.score > double.score)) {
        double = c;
      }
    }
    if (double !== null && double.score >= 0.7 * bestScore) {
      bestBPM = double.bpm;
    }
  }

  return {
    bpm: bestBPM,
    confidence: Math.min(confidence, 0.95),
    candidates: candidates.slice(0, 5)
  };
}

/**
 * Compute Fourier tempogram
 * From lb/index.html lines 1083-1125
 */
export async function computeFourierTempogram(onsetEnvelope, sr) {
  const hopLength = 512;
  const windowLength = 384;
  const hopLength2 = 96;

  const numFrames = Math.floor((onsetEnvelope.length - windowLength) / hopLength2) + 1;
  const tempogram = [];

  // Pre-compute window
  const window = new Float32Array(windowLength);
  for (let i = 0; i < windowLength; i++) {
    window[i] = 0.5 * (1 - Math.cos(2 * Math.PI * i / (windowLength - 1)));
  }

  for (let i = 0; i < numFrames; i++) {
    const start = i * hopLength2;
    const frame = new Float32Array(windowLength);

    // Extract and window frame
    for (let j = 0; j < windowLength && start + j < onsetEnvelope.length; j++) {
      frame[j] = onsetEnvelope[start + j] * window[j];
    }

    // Compute FFT
    const fft = await computeSimpleFFT(frame);
    tempogram.push(fft);

    // Yield periodically
    if (i % Math.max(1, Math.floor(numFrames / 10)) === 0) {
      await new Promise(resolve => setTimeout(resolve, 1));
    }
  }

  // Compute tempo frequencies
  const frequencies = computeTempoFrequencies(windowLength, sr / hopLength);

  // Analyze tempogram for peaks
  const peakTempos = await analyzeTempogram(tempogram, frequencies);

  return { tempogram, frequencies, peakTempos };
}

/**
 * Estimate tempo within constrained range
 * From lb/index.html lines 1210-1262
 *
 * REPAIR (2026-07-02 proof-of-work): the original reduced a 4s window to an
 * ~15-point energy downsample (8 sub-buckets, half-bucket hop) while the BPM
 * search needed lags >= ~17, so the autocorrelation loop never executed and
 * every window silently returned globalTempo — the window-by-window "tempo
 * stability" output was constant regardless of actual tempo changes. Now the
 * raw onset-envelope window is mean-centered and autocorrelated directly
 * (normalized correlation, same estimator as estimateGlobalTempo) over the
 * constrained lag range. Confidence is the best normalized correlation
 * (measured, in [0, 0.95]); if the window is too short to search any lag the
 * global tempo is returned with confidence 0 — never a fabricated confidence.
 */
export async function estimateConstrainedTempo(window, sr, globalTempo) {
  const hopLength = 512;
  const onsetRate = sr / hopLength;

  // Allow ±50 BPM variation from global tempo
  const minBPM = Math.max(30, globalTempo - 50);
  const maxBPM = Math.min(300, globalTempo + 50);

  // Convert to lag range
  const maxLag = Math.round(60 * onsetRate / minBPM);
  const minLag = Math.round(60 * onsetRate / maxBPM);

  // Mean-center the raw onset-envelope window
  let mean = 0;
  for (let i = 0; i < window.length; i++) {
    mean += window[i];
  }
  mean /= window.length;

  const centered = new Float32Array(window.length);
  for (let i = 0; i < window.length; i++) {
    centered[i] = window[i] - mean;
  }

  // Normalized autocorrelation over the constrained lag range
  let bestScore = -Infinity;
  let bestBPM = globalTempo;
  let searched = false;

  for (let lag = Math.max(1, minLag); lag <= maxLag && lag < centered.length; lag++) {
    let correlation = 0;
    let norm1 = 0;
    let norm2 = 0;

    for (let i = 0; i < centered.length - lag; i++) {
      correlation += centered[i] * centered[i + lag];
      norm1 += centered[i] * centered[i];
      norm2 += centered[i + lag] * centered[i + lag];
    }

    const score = correlation / Math.sqrt(norm1 * norm2 + 1e-10);

    if (score > bestScore) {
      bestScore = score;
      bestBPM = 60 * onsetRate / lag;
      searched = true;
    }
  }

  if (!searched) {
    // Window too short for the requested BPM range — report the global
    // estimate with zero confidence rather than a fabricated local one.
    return { bpm: globalTempo, confidence: 0 };
  }

  return {
    bpm: bestBPM,
    confidence: Math.min(Math.max(bestScore, 0), 0.95)
  };
}

/**
 * Compute simple spectrum using decimated FFT
 * From lb/index.html lines 1264-1276
 */
export async function computeSimpleSpectrum(frame) {
  const N = frame.length;
  const spectrum = new Float32Array(N / 2);

  // Simple DFT (decimated for speed)
  for (let k = 0; k < N / 2; k += 2) {
    let real = 0;
    let imag = 0;

    for (let n = 0; n < N; n += 4) {
      const angle = -2 * Math.PI * k * n / N;
      real += frame[n] * Math.cos(angle);
      imag += frame[n] * Math.sin(angle);
    }

    spectrum[k] = Math.sqrt(real * real + imag * imag);
    if (k > 0) spectrum[k - 1] = spectrum[k]; // Fill gaps
  }

  return spectrum;
}

/**
 * Compute simple FFT
 * From lb/index.html lines 1134-1147
 */
export async function computeSimpleFFT(signal) {
  const N = signal.length;
  const fft = new Float32Array(N / 2);

  for (let k = 0; k < N / 2; k++) {
    let real = 0;
    let imag = 0;

    for (let n = 0; n < N; n++) {
      const angle = -2 * Math.PI * k * n / N;
      real += signal[n] * Math.cos(angle);
      imag += signal[n] * Math.sin(angle);
    }

    fft[k] = Math.sqrt(real * real + imag * imag);
  }

  return fft;
}

/**
 * Convert FFT bins to tempo frequencies
 * From lb/index.html lines 1127-1132
 */
export function computeTempoFrequencies(windowLength, sr) {
  const frequencies = [];
  for (let k = 0; k < windowLength / 2; k++) {
    const freq = k * sr / windowLength;
    const bpm = freq * 60;
    frequencies.push(bpm);
  }
  return frequencies;
}

/**
 * Analyze tempogram for peak tempos
 * From lb/index.html lines 1149-1208
 */
export async function analyzeTempogram(tempogram, frequencies) {
  if (tempogram.length === 0) return [];

  // Average across time
  const avgTempogram = new Float32Array(tempogram[0].length);
  for (let i = 0; i < tempogram.length; i++) {
    for (let j = 0; j < tempogram[i].length; j++) {
      avgTempogram[j] += tempogram[i][j];
    }
  }

  for (let j = 0; j < avgTempogram.length; j++) {
    avgTempogram[j] /= tempogram.length;
  }

  // Find peaks in reasonable BPM range (60-200)
  const peaks = [];
  const minIdx = frequencies.findIndex(f => f >= 60);
  const maxIdx = frequencies.findIndex(f => f >= 200);

  if (minIdx === -1 || maxIdx === -1) return [];

  // Find local maxima
  for (let i = minIdx + 1; i < maxIdx - 1; i++) {
    if (avgTempogram[i] > avgTempogram[i - 1] &&
        avgTempogram[i] > avgTempogram[i + 1]) {
      peaks.push({
        bpm: frequencies[i],
        strength: avgTempogram[i]
      });
    }
  }

  // Sort by strength
  peaks.sort((a, b) => b.strength - a.strength);

  // Keep top peaks
  return peaks.slice(0, 8);
}