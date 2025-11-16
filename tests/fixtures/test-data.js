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
 * Known test vectors for validation
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

  // Mel scale test vectors
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

  // MIDI/frequency conversion test vectors
  midi: {
    midiToHz: [
      { midi: 69, hz: 440 },
      { midi: 60, hz: 261.63 },
      { midi: 81, hz: 880 }
    ],
    hzToMidi: [
      { hz: 440, midi: 69 },
      { hz: 261.63, midi: 60 },
      { hz: 880, midi: 81 }
    ]
  },

  // Note name test vectors
  notes: {
    midiToNote: [
      { midi: 60, note: 'C4' },
      { midi: 69, note: 'A4' },
      { midi: 72, note: 'C5' }
    ]
  }
};

/**
 * Tolerance comparison helpers
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
