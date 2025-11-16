/**
 * Test Data Fixtures for Pleco-Audio Test Suite
 * Provides sample audio data and known inputs/outputs for testing
 */

/**
 * Generate synthetic audio buffer for testing
 */
export function generateTestAudio(duration = 1.0, sampleRate = 22050, frequency = 440) {
  const numSamples = Math.floor(duration * sampleRate);
  const audioData = new Float32Array(numSamples);

  for (let i = 0; i < numSamples; i++) {
    audioData[i] = Math.sin(2 * Math.PI * frequency * i / sampleRate);
  }

  return audioData;
}

/**
 * Generate synthetic stereo audio buffer
 */
export function generateStereoTestAudio(duration = 1.0, sampleRate = 22050, freqLeft = 440, freqRight = 880) {
  const numSamples = Math.floor(duration * sampleRate);
  const left = new Float32Array(numSamples);
  const right = new Float32Array(numSamples);

  for (let i = 0; i < numSamples; i++) {
    left[i] = Math.sin(2 * Math.PI * freqLeft * i / sampleRate);
    right[i] = Math.sin(2 * Math.PI * freqRight * i / sampleRate);
  }

  return { left, right };
}

/**
 * Generate white noise
 */
export function generateWhiteNoise(duration = 1.0, sampleRate = 22050, amplitude = 1.0) {
  const numSamples = Math.floor(duration * sampleRate);
  const audioData = new Float32Array(numSamples);

  for (let i = 0; i < numSamples; i++) {
    audioData[i] = (Math.random() * 2 - 1) * amplitude;
  }

  return audioData;
}

/**
 * Generate chirp signal (frequency sweep)
 */
export function generateChirp(duration = 1.0, sampleRate = 22050, f0 = 100, f1 = 1000) {
  const numSamples = Math.floor(duration * sampleRate);
  const audioData = new Float32Array(numSamples);

  for (let i = 0; i < numSamples; i++) {
    const t = i / sampleRate;
    const freq = f0 + (f1 - f0) * t / duration;
    audioData[i] = Math.sin(2 * Math.PI * freq * t);
  }

  return audioData;
}

/**
 * Generate impulse signal
 */
export function generateImpulse(length = 1024, position = 0) {
  const audioData = new Float32Array(length);
  audioData[position] = 1.0;
  return audioData;
}

/**
 * Generate drum pattern (kick, snare, hihat)
 */
export function generateDrumPattern(bars = 1, bpm = 120, sampleRate = 22050) {
  const beatsPerBar = 4;
  const totalBeats = bars * beatsPerBar;
  const beatDuration = 60 / bpm;
  const duration = totalBeats * beatDuration;
  const numSamples = Math.floor(duration * sampleRate);
  const audioData = new Float32Array(numSamples);

  // Add kick on beats 1 and 3
  for (let beat = 0; beat < totalBeats; beat += 2) {
    const start = Math.floor(beat * beatDuration * sampleRate);
    const kickDuration = Math.floor(0.1 * sampleRate);
    for (let i = 0; i < kickDuration && start + i < numSamples; i++) {
      const env = Math.exp(-i / (0.05 * sampleRate));
      audioData[start + i] += Math.sin(2 * Math.PI * 60 * i / sampleRate) * env;
    }
  }

  // Add snare on beats 2 and 4
  for (let beat = 1; beat < totalBeats; beat += 2) {
    const start = Math.floor(beat * beatDuration * sampleRate);
    const snareDuration = Math.floor(0.05 * sampleRate);
    for (let i = 0; i < snareDuration && start + i < numSamples; i++) {
      const env = Math.exp(-i / (0.02 * sampleRate));
      const noise = (Math.random() * 2 - 1) * 0.5;
      audioData[start + i] += noise * env;
    }
  }

  return audioData;
}

/**
 * Known test vectors for validation (based on Librosa test suite)
 */
export const knownTestVectors = {
  // FFT test vectors
  fft: {
    impulse: {
      input: [1, 0, 0, 0, 0, 0, 0, 0],
      expectedMagnitude: [1, 1, 1, 1, 1, 1, 1, 1]
    },
    dcSignal: {
      input: [1, 1, 1, 1, 1, 1, 1, 1],
      expectedMagnitude: [8, 0, 0, 0, 0, 0, 0, 0]
    }
  },

  // Mel scale test vectors (HTK formula)
  mel: {
    hzToMel: [
      { hz: 0, mel: 0 },
      { hz: 1000, mel: 1000 },
      { hz: 8000, mel: 2840 }
    ],
    melToHz: [
      { mel: 0, hz: 0 },
      { mel: 1000, hz: 1000 },
      { mel: 2840, hz: 8000 }
    ]
  },

  // MIDI/frequency conversion test vectors (Librosa test_convert.py)
  midi: {
    // test_midi_to_hz line 277
    midiToHz: [
      { midi: 33, hz: 55 },    // A1
      { midi: 45, hz: 110 },   // A2
      { midi: 57, hz: 220 },   // A3
      { midi: 69, hz: 440 },   // A4
      { midi: 60, hz: 261.63 }, // C4 (approximate)
      { midi: 81, hz: 880 }    // A5
    ],
    // test_hz_to_midi line 281
    hzToMidi: [
      { hz: 55, midi: 33 },
      { hz: 110, midi: 45 },
      { hz: 220, midi: 57 },
      { hz: 440, midi: 69 }
    ]
  },

  // Note name test vectors (test_midi_to_note line 264)
  notes: {
    midiToNote: [
      { midi: 24.25, note: 'C1', octave: true, cents: false },
      { midi: 24.25, note: 'C1+25', octave: true, cents: true },
      { midi: 60, note: 'C4' },
      { midi: 69, note: 'A4' },
      { midi: 72, note: 'C5' }
    ],
    // test_hz_to_note line 294
    hzToNote: [
      { hz: 440, note: 'A4', octave: true, cents: false },
      { hz: 440, note: 'A4+0', octave: true, cents: true },
      { hz: 880, note: 'A5+0', octave: true, cents: true }
    ]
  },

  // Time/sample conversion test vectors (test_time_to_samples line 75)
  time: {
    timeToSamples: [
      { time: 0, sr: 22050, samples: 0 },
      { time: 1, sr: 22050, samples: 22050 },
      { time: 2, sr: 22050, samples: 44100 },
      { time: 0, sr: 44100, samples: 0 },
      { time: 1, sr: 44100, samples: 44100 },
      { time: 2, sr: 44100, samples: 88200 }
    ],
    samplesToTime: [
      { samples: 0, sr: 22050, time: 0 },
      { samples: 22050, sr: 22050, time: 1 },
      { samples: 44100, sr: 22050, time: 2 }
    ]
  },

  // FFT frequencies (test_fft_frequencies line 309)
  fftFrequencies: [
    { sr: 22050, nfft: 2048, dc: 0, nyquist: 11025 },
    { sr: 44100, nfft: 2048, dc: 0, nyquist: 22050 },
    { sr: 8000, nfft: 1024, dc: 0, nyquist: 4000 }
  ],

  // Tempo test vectors (test_tempo line 50-77)
  tempo: {
    clickTrackTests: [
      { tempo: 60, sr: 22050, tolerance: 0.05 },   // 5% tolerance
      { tempo: 80, sr: 22050, tolerance: 0.05 },
      { tempo: 110, sr: 22050, tolerance: 0.05 },
      { tempo: 120, sr: 22050, tolerance: 0.05 },
      { tempo: 160, sr: 22050, tolerance: 0.05 }
    ]
  },

  // Spectral centroid (test_spectral_centroid_synthetic line 151-158)
  spectralCentroid: {
    singleBin: {
      // When all energy is in bin 5, centroid should equal freq[5]
      sr: 22050,
      nfft: 1024,
      bin: 5,
      expectedCentroidBin: 5  // Will convert to Hz in test
    }
  },

  // Spectral bandwidth (test_spectral_bandwidth_synthetic line 187-193)
  spectralBandwidth: {
    singleBin: {
      // Single bin should have zero bandwidth
      expectedBandwidth: 0
    }
  },

  // Zero crossing rate (test_zcr_synthetic line 397-409)
  zeroCrossingRate: {
    // For alternating signal with period P, ZCR = 2/P
    tests: [
      { period: 32, expectedRate: 2 / 32 },
      { period: 16, expectedRate: 2 / 16 },
      { period: 8, expectedRate: 2 / 8 },
      { period: 4, expectedRate: 2 / 4 },
      { period: 2, expectedRate: 2 / 2 }
    ]
  }
};

/**
 * Generate click track for tempo testing (Librosa test_tempo pattern)
 * Creates impulses at regular intervals corresponding to a given BPM
 *
 * @param {number} tempo - Tempo in BPM
 * @param {number} sr - Sample rate
 * @param {number} duration - Duration in seconds
 * @returns {Float32Array} Audio with clicks at tempo intervals
 *
 * Example from Librosa test_beat.py lines 56-61:
 *   y = np.zeros(20 * sr)
 *   delay = librosa.time_to_samples(60.0 / tempo, sr=sr).item()
 *   y[::delay] = 1
 */
export function generateClickTrack(tempo, sr = 22050, duration = 20) {
  const numSamples = duration * sr;
  const y = new Float32Array(numSamples);

  // Time between clicks in samples
  const delay = Math.floor((60.0 / tempo) * sr);

  // Place clicks at regular intervals
  for (let i = 0; i < numSamples; i += delay) {
    y[i] = 1.0;
  }

  return y;
}

/**
 * Generate idealized single-bin spectrum for spectral feature testing
 * (Librosa test_features.py lines 134-138)
 *
 * @param {number} nBins - Number of frequency bins
 * @param {number} nFrames - Number of time frames
 * @param {number} peakBin - Which bin should have all the energy
 * @returns {Float32Array[]} 2D spectrum [nBins][nFrames]
 */
export function generateSingleBinSpectrum(nBins = 513, nFrames = 3, peakBin = 5) {
  const S = [];
  for (let i = 0; i < nFrames; i++) {
    const frame = new Float32Array(nBins);
    frame[peakBin] = 1.0;
    S.push(frame);
  }
  return S;
}

/**
 * Generate constant (DC) signal for testing
 */
export function generateDCSignal(length = 1024, value = 1.0) {
  const signal = new Float32Array(length);
  signal.fill(value);
  return signal;
}

/**
 * Generate silence for edge case testing
 */
export function generateSilence(length = 1024) {
  return new Float32Array(length);
}

/**
 * Generate alternating signal for zero-crossing rate testing
 * (Librosa test_features.py lines 385-391)
 *
 * @param {number} sr - Sample rate
 * @param {number} period - Period of alternation in samples
 * @returns {Float32Array} Signal alternating between 1 and -1
 */
export function generateAlternatingSignal(sr = 16384, period = 32) {
  const y = new Float32Array(sr);
  y.fill(1);
  for (let i = 0; i < sr; i += period) {
    y[i] = -1;
  }
  return y;
}

/**
 * Tolerance comparison helpers (numpy.allclose equivalents)
 */
export function almostEqual(a, b, tolerance = 1e-6) {
  return Math.abs(a - b) < tolerance;
}

export function arrayAlmostEqual(arr1, arr2, tolerance = 1e-6) {
  if (arr1.length !== arr2.length) return false;
  for (let i = 0; i < arr1.length; i++) {
    if (!almostEqual(arr1[i], arr2[i], tolerance)) return false;
  }
  return true;
}

/**
 * Check if value is within a percentage of expected
 * Used for tempo testing: assert np.abs(tempo_est - tempo) <= 0.05 * tempo
 *
 * @param {number} actual - Actual value
 * @param {number} expected - Expected value
 * @param {number} percent - Tolerance as percentage (e.g., 0.05 for 5%)
 * @returns {boolean}
 */
export function withinPercent(actual, expected, percent = 0.05) {
  const tolerance = Math.abs(expected * percent);
  return Math.abs(actual - expected) <= tolerance;
}

/**
 * Numpy allclose equivalent - checks if arrays are element-wise equal within tolerance
 * @param {Array|TypedArray} a - First array
 * @param {Array|TypedArray} b - Second array
 * @param {Object} options - Tolerance options
 * @param {number} options.rtol - Relative tolerance (default 1e-5)
 * @param {number} options.atol - Absolute tolerance (default 1e-8)
 * @returns {boolean}
 */
export function allclose(a, b, { rtol = 1e-5, atol = 1e-8 } = {}) {
  if (a.length !== b.length) return false;

  for (let i = 0; i < a.length; i++) {
    const diff = Math.abs(a[i] - b[i]);
    const threshold = atol + rtol * Math.abs(b[i]);
    if (diff > threshold) {
      return false;
    }
  }

  return true;
}

/**
 * Generate test spectrogram data
 */
export function generateTestSpectrogram(nFrames = 100, nBins = 128) {
  const spec = [];
  for (let i = 0; i < nFrames; i++) {
    const frame = new Float32Array(nBins);
    for (let j = 0; j < nBins; j++) {
      // Simulate frequency content with some random variation
      frame[j] = Math.exp(-j / 20) * (0.5 + Math.random() * 0.5);
    }
    spec.push(frame);
  }
  return spec;
}

/**
 * Generate test beat times
 */
export function generateTestBeats(bpm = 120, duration = 10, sampleRate = 22050) {
  const beatInterval = 60 / bpm;
  const numBeats = Math.floor(duration / beatInterval);
  const beats = [];

  for (let i = 0; i < numBeats; i++) {
    beats.push(i * beatInterval * sampleRate);
  }

  return new Float32Array(beats);
}

/**
 * Generate test onset strength envelope
 */
export function generateTestOnsetEnvelope(length = 100) {
  const envelope = new Float32Array(length);

  // Add peaks at regular intervals
  const peakInterval = 10;
  for (let i = 0; i < length; i++) {
    if (i % peakInterval === 0) {
      envelope[i] = 1.0;
    } else {
      envelope[i] = Math.random() * 0.2;
    }
  }

  return envelope;
}

/**
 * Complex number helpers for testing FFT
 */
export class Complex {
  constructor(real, imag) {
    this.real = real;
    this.imag = imag;
  }

  magnitude() {
    return Math.sqrt(this.real * this.real + this.imag * this.imag);
  }

  phase() {
    return Math.atan2(this.imag, this.real);
  }

  add(other) {
    return new Complex(this.real + other.real, this.imag + other.imag);
  }

  multiply(other) {
    return new Complex(
      this.real * other.real - this.imag * other.imag,
      this.real * other.imag + this.imag * other.real
    );
  }
}

/**
 * Generate test chromagram
 */
export function generateTestChroma(nFrames = 100, nChroma = 12) {
  const chroma = [];
  for (let i = 0; i < nFrames; i++) {
    const frame = new Float32Array(nChroma);
    // Simulate a chord (e.g., C major = C, E, G = bins 0, 4, 7)
    const chord = [0, 4, 7];
    for (const note of chord) {
      frame[note] = 0.8 + Math.random() * 0.2;
    }
    chroma.push(frame);
  }
  return chroma;
}

/**
 * Validation helpers
 */
export function isFiniteArray(arr) {
  return arr.every(x => Number.isFinite(x));
}

export function isNonNegativeArray(arr) {
  return arr.every(x => x >= 0);
}

export function hasExpectedShape(arr, expectedLength) {
  return arr.length === expectedLength;
}

export function sumArray(arr) {
  return arr.reduce((sum, val) => sum + val, 0);
}

export function maxArray(arr) {
  return Math.max(...arr);
}

export function minArray(arr) {
  return Math.min(...arr);
}

export function meanArray(arr) {
  return sumArray(arr) / arr.length;
}

export function stdArray(arr) {
  const mean = meanArray(arr);
  const squaredDiffs = arr.map(x => (x - mean) ** 2);
  return Math.sqrt(meanArray(squaredDiffs));
}

/**
 * Mock Web Audio API for Node.js testing environment
 */
export class MockAudioBuffer {
  constructor(options) {
    this.numberOfChannels = options.numberOfChannels || 1;
    this.length = options.length;
    this.sampleRate = options.sampleRate || 22050;
    this.duration = this.length / this.sampleRate;

    this._channelData = [];
    for (let i = 0; i < this.numberOfChannels; i++) {
      this._channelData.push(new Float32Array(this.length));
    }
  }

  getChannelData(channel) {
    return this._channelData[channel];
  }

  copyToChannel(source, channelNumber, startInChannel = 0) {
    const dest = this._channelData[channelNumber];
    dest.set(source, startInChannel);
  }

  copyFromChannel(destination, channelNumber, startInChannel = 0) {
    const src = this._channelData[channelNumber];
    destination.set(src.slice(startInChannel));
  }
}

/**
 * Create mock AudioBuffer with test data
 */
export function createMockAudioBuffer(audioData, sampleRate = 22050) {
  const buffer = new MockAudioBuffer({
    numberOfChannels: 1,
    length: audioData.length,
    sampleRate: sampleRate
  });

  buffer.copyToChannel(audioData, 0);
  return buffer;
}
