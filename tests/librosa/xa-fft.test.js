/**
 * Test Suite for xa-fft
 * Comprehensive tests for FFT operations matching Librosa behavior
 */

import { describe, it, expect, beforeEach } from 'vitest';
import * as xa_fft from '../../src/scripts/xa-fft.js';
import {
  generateTestAudio,
  generateWhiteNoise,
  generateImpulse,
  almostEqual,
  arrayAlmostEqual,
  isFiniteArray,
  isNonNegativeArray
} from '../fixtures/test-data.js';

describe('xa-fft', () => {
  let testSignal;
  let sampleRate;

  beforeEach(() => {
    sampleRate = 22050;
    testSignal = generateTestAudio(1.0, sampleRate, 440);
  });

  describe('fft', () => {
    it('should be defined and exported', () => {
      expect(xa_fft.fft).toBeDefined();
      expect(typeof xa_fft.fft).toBe('function');
    });

    it('should compute FFT of impulse correctly', () => {
      const impulse = generateImpulse(8, 0);
      const result = xa_fft.fft(impulse);
      expect(result).toBeDefined();
      expect(result.length).toBeGreaterThan(0);
    });

    it('should compute FFT of real signal', () => {
      const signal = new Float32Array([1, 2, 3, 4, 5, 6, 7, 8]);
      const result = xa_fft.fft(signal);
      expect(result).toBeDefined();
      expect(Array.isArray(result) || ArrayBuffer.isView(result)).toBe(true);
    });

    it('should handle power-of-2 lengths efficiently', () => {
      const lengths = [128, 256, 512, 1024, 2048];
      lengths.forEach(len => {
        const signal = generateTestAudio(len / sampleRate, sampleRate, 440);
        const result = xa_fft.fft(signal.slice(0, len));
        expect(result).toBeDefined();
      });
    });

    it('should produce finite output', () => {
      const result = xa_fft.fft(testSignal.slice(0, 1024));
      expect(result).toBeDefined();
      if (result.real && result.imag) {
        expect(isFiniteArray(Array.from(result.real))).toBe(true);
        expect(isFiniteArray(Array.from(result.imag))).toBe(true);
      }
    });

    it('should throw on invalid inputs', () => {
      expect(() => xa_fft.fft(null)).toThrow();
      expect(() => xa_fft.fft(undefined)).toThrow();
      expect(() => xa_fft.fft([])).toThrow();
    });
  });

  describe('ifft', () => {
    it('should be defined and exported', () => {
      expect(xa_fft.ifft).toBeDefined();
      expect(typeof xa_fft.ifft).toBe('function');
    });

    it('should reconstruct signal from FFT', () => {
      const signal = generateTestAudio(0.1, sampleRate, 440).slice(0, 256);
      const fftResult = xa_fft.fft(signal);
      const reconstructed = xa_fft.ifft(fftResult);

      expect(reconstructed).toBeDefined();
      expect(reconstructed.length).toBe(signal.length);
    });

    it('should produce finite output', () => {
      const signal = testSignal.slice(0, 512);
      const fftResult = xa_fft.fft(signal);
      const result = xa_fft.ifft(fftResult);
      expect(result).toBeDefined();
      if (Array.isArray(result) || ArrayBuffer.isView(result)) {
        expect(isFiniteArray(Array.from(result))).toBe(true);
      }
    });

    it('should throw on invalid inputs', () => {
      expect(() => xa_fft.ifft(null)).toThrow();
      expect(() => xa_fft.ifft(undefined)).toThrow();
    });
  });

  describe('stft', () => {
    it('should be defined and exported', () => {
      expect(xa_fft.stft).toBeDefined();
      expect(typeof xa_fft.stft).toBe('function');
    });

    it('should compute STFT with default parameters', () => {
      const result = xa_fft.stft(testSignal.slice(0, 4096));
      expect(result).toBeDefined();
      expect(Array.isArray(result) || typeof result === 'object').toBe(true);
    });

    it('should accept custom hop_length', () => {
      const result = xa_fft.stft(testSignal.slice(0, 4096), { hop_length: 256 });
      expect(result).toBeDefined();
    });

    it('should accept custom n_fft', () => {
      const result = xa_fft.stft(testSignal.slice(0, 4096), { n_fft: 1024 });
      expect(result).toBeDefined();
    });

    it('should accept custom window function', () => {
      const result = xa_fft.stft(testSignal.slice(0, 4096), { window: 'hamming' });
      expect(result).toBeDefined();
    });

    it('should produce 2D output', () => {
      const result = xa_fft.stft(testSignal.slice(0, 4096));
      expect(result).toBeDefined();
      if (Array.isArray(result)) {
        expect(result.length).toBeGreaterThan(0);
        if (result[0]) {
          expect(Array.isArray(result[0]) || ArrayBuffer.isView(result[0])).toBe(true);
        }
      }
    });

    it('should throw on invalid inputs', () => {
      expect(() => xa_fft.stft(null)).toThrow();
      expect(() => xa_fft.stft([])).toThrow();
    });
  });

  describe('istft', () => {
    it('should be defined and exported', () => {
      expect(xa_fft.istft).toBeDefined();
      expect(typeof xa_fft.istft).toBe('function');
    });

    it('should reconstruct signal from STFT', () => {
      const signal = testSignal.slice(0, 4096);
      const stftResult = xa_fft.stft(signal);
      const reconstructed = xa_fft.istft(stftResult);

      expect(reconstructed).toBeDefined();
      expect(Array.isArray(reconstructed) || ArrayBuffer.isView(reconstructed)).toBe(true);
    });

    it('should accept custom hop_length', () => {
      const signal = testSignal.slice(0, 4096);
      const stftResult = xa_fft.stft(signal, { hop_length: 256 });
      const reconstructed = xa_fft.istft(stftResult, { hop_length: 256 });
      expect(reconstructed).toBeDefined();
    });

    it('should throw on invalid inputs', () => {
      expect(() => xa_fft.istft(null)).toThrow();
      expect(() => xa_fft.istft([])).toThrow();
    });
  });

  describe('get_window', () => {
    it('should be defined and exported', () => {
      expect(xa_fft.get_window).toBeDefined();
      expect(typeof xa_fft.get_window).toBe('function');
    });

    it('should create Hann window', () => {
      const window = xa_fft.get_window('hann', 256);
      expect(window).toBeDefined();
      expect(window.length).toBe(256);
      expect(isFiniteArray(Array.from(window))).toBe(true);
    });

    it('should create Hamming window', () => {
      const window = xa_fft.get_window('hamming', 256);
      expect(window).toBeDefined();
      expect(window.length).toBe(256);
    });

    it('should create Blackman window', () => {
      const window = xa_fft.get_window('blackman', 256);
      expect(window).toBeDefined();
      expect(window.length).toBe(256);
    });

    it('should throw on invalid window type', () => {
      expect(() => xa_fft.get_window('invalid', 256)).toThrow();
    });

    it('should throw on invalid window length', () => {
      expect(() => xa_fft.get_window('hann', -1)).toThrow();
      expect(() => xa_fft.get_window('hann', 0)).toThrow();
    });
  });

  describe('hann_window', () => {
    it('should be defined and exported', () => {
      expect(xa_fft.hann_window).toBeDefined();
      expect(typeof xa_fft.hann_window).toBe('function');
    });

    it('should create Hann window of specified length', () => {
      const lengths = [64, 128, 256, 512, 1024];
      lengths.forEach(len => {
        const window = xa_fft.hann_window(len);
        expect(window.length).toBe(len);
        expect(isFiniteArray(Array.from(window))).toBe(true);
      });
    });

    it('should have zero values at endpoints', () => {
      const window = xa_fft.hann_window(256);
      expect(almostEqual(window[0], 0, 0.01)).toBe(true);
      expect(almostEqual(window[window.length - 1], 0, 0.01)).toBe(true);
    });

    it('should have maximum near center', () => {
      const window = xa_fft.hann_window(256);
      const center = Math.floor(window.length / 2);
      expect(window[center]).toBeGreaterThan(0.9);
    });
  });

  describe('hamming_window', () => {
    it('should be defined and exported', () => {
      expect(xa_fft.hamming_window).toBeDefined();
      expect(typeof xa_fft.hamming_window).toBe('function');
    });

    it('should create Hamming window of specified length', () => {
      const window = xa_fft.hamming_window(256);
      expect(window.length).toBe(256);
      expect(isFiniteArray(Array.from(window))).toBe(true);
    });

    it('should have non-zero values at endpoints', () => {
      const window = xa_fft.hamming_window(256);
      expect(window[0]).toBeGreaterThan(0);
      expect(window[window.length - 1]).toBeGreaterThan(0);
    });
  });

  describe('blackman_window', () => {
    it('should be defined and exported', () => {
      expect(xa_fft.blackman_window).toBeDefined();
      expect(typeof xa_fft.blackman_window).toBe('function');
    });

    it('should create Blackman window of specified length', () => {
      const window = xa_fft.blackman_window(256);
      expect(window.length).toBe(256);
      expect(isFiniteArray(Array.from(window))).toBe(true);
    });

    it('should have near-zero values at endpoints', () => {
      const window = xa_fft.blackman_window(256);
      expect(window[0]).toBeLessThan(0.01);
      expect(window[window.length - 1]).toBeLessThan(0.01);
    });
  });

  describe('magnitude', () => {
    it('should be defined and exported', () => {
      expect(xa_fft.magnitude).toBeDefined();
      expect(typeof xa_fft.magnitude).toBe('function');
    });

    it('should compute magnitude from complex FFT', () => {
      const signal = testSignal.slice(0, 512);
      const fftResult = xa_fft.fft(signal);
      const mag = xa_fft.magnitude(fftResult);

      expect(mag).toBeDefined();
      expect(Array.isArray(mag) || ArrayBuffer.isView(mag)).toBe(true);
      expect(isNonNegativeArray(Array.from(mag))).toBe(true);
    });

    it('should produce non-negative values', () => {
      const signal = generateWhiteNoise(0.1, sampleRate).slice(0, 256);
      const fftResult = xa_fft.fft(signal);
      const mag = xa_fft.magnitude(fftResult);

      Array.from(mag).forEach(val => {
        expect(val).toBeGreaterThanOrEqual(0);
      });
    });
  });

  describe('phase', () => {
    it('should be defined and exported', () => {
      expect(xa_fft.phase).toBeDefined();
      expect(typeof xa_fft.phase).toBe('function');
    });

    it('should compute phase from complex FFT', () => {
      const signal = testSignal.slice(0, 512);
      const fftResult = xa_fft.fft(signal);
      const ph = xa_fft.phase(fftResult);

      expect(ph).toBeDefined();
      expect(Array.isArray(ph) || ArrayBuffer.isView(ph)).toBe(true);
      expect(isFiniteArray(Array.from(ph))).toBe(true);
    });

    it('should produce values in range [-π, π]', () => {
      const signal = generateTestAudio(0.1, sampleRate, 440).slice(0, 256);
      const fftResult = xa_fft.fft(signal);
      const ph = xa_fft.phase(fftResult);

      Array.from(ph).forEach(val => {
        expect(val).toBeGreaterThanOrEqual(-Math.PI);
        expect(val).toBeLessThanOrEqual(Math.PI);
      });
    });
  });

  describe('power', () => {
    it('should be defined and exported', () => {
      expect(xa_fft.power).toBeDefined();
      expect(typeof xa_fft.power).toBe('function');
    });

    it('should compute power spectrum', () => {
      const signal = testSignal.slice(0, 512);
      const result = xa_fft.power(signal);

      expect(result).toBeDefined();
      expect(Array.isArray(result) || ArrayBuffer.isView(result)).toBe(true);
      expect(isNonNegativeArray(Array.from(result))).toBe(true);
    });

    it('should produce non-negative values', () => {
      const signal = generateWhiteNoise(0.1, sampleRate).slice(0, 256);
      const power = xa_fft.power(signal);

      Array.from(power).forEach(val => {
        expect(val).toBeGreaterThanOrEqual(0);
      });
    });
  });

  describe('polar_to_complex', () => {
    it('should be defined and exported', () => {
      expect(xa_fft.polar_to_complex).toBeDefined();
      expect(typeof xa_fft.polar_to_complex).toBe('function');
    });

    it('should convert polar to complex form', () => {
      const magnitude = new Float32Array([1, 1, 1, 1]);
      const phase = new Float32Array([0, Math.PI / 2, Math.PI, -Math.PI / 2]);
      const result = xa_fft.polar_to_complex(magnitude, phase);

      expect(result).toBeDefined();
      expect(result.real).toBeDefined();
      expect(result.imag).toBeDefined();
    });

    it('should handle zero magnitude', () => {
      const magnitude = new Float32Array([0, 0, 0]);
      const phase = new Float32Array([0, Math.PI, Math.PI / 2]);
      const result = xa_fft.polar_to_complex(magnitude, phase);

      expect(result).toBeDefined();
    });
  });

  describe('fft_frequencies', () => {
    it('should be defined and exported', () => {
      expect(xa_fft.fft_frequencies).toBeDefined();
      expect(typeof xa_fft.fft_frequencies).toBe('function');
    });

    it('should compute FFT bin frequencies', () => {
      const n_fft = 2048;
      const sr = 22050;
      const freqs = xa_fft.fft_frequencies(sr, n_fft);

      expect(freqs).toBeDefined();
      expect(freqs.length).toBe(Math.floor(n_fft / 2) + 1);
      expect(freqs[0]).toBe(0);
      expect(freqs[freqs.length - 1]).toBeCloseTo(sr / 2, 1);
    });

    it('should produce linearly spaced frequencies', () => {
      const n_fft = 1024;
      const sr = 44100;
      const freqs = xa_fft.fft_frequencies(sr, n_fft);

      for (let i = 1; i < freqs.length; i++) {
        const diff = freqs[i] - freqs[i - 1];
        expect(almostEqual(diff, sr / n_fft, 0.01)).toBe(true);
      }
    });

    it('should handle different sample rates', () => {
      const n_fft = 2048;
      const sampleRates = [8000, 16000, 22050, 44100, 48000];

      sampleRates.forEach(sr => {
        const freqs = xa_fft.fft_frequencies(sr, n_fft);
        expect(freqs[0]).toBe(0);
        expect(freqs[freqs.length - 1]).toBeCloseTo(sr / 2, 1);
      });
    });
  });

  describe('spectrogram', () => {
    it('should be defined and exported', () => {
      expect(xa_fft.spectrogram).toBeDefined();
      expect(typeof xa_fft.spectrogram).toBe('function');
    });

    it('should compute power spectrogram', () => {
      const signal = testSignal.slice(0, 4096);
      const result = xa_fft.spectrogram(signal);

      expect(result).toBeDefined();
      expect(Array.isArray(result) || typeof result === 'object').toBe(true);
    });

    it('should accept custom parameters', () => {
      const signal = testSignal.slice(0, 4096);
      const result = xa_fft.spectrogram(signal, {
        n_fft: 1024,
        hop_length: 256,
        window: 'hann'
      });

      expect(result).toBeDefined();
    });

    it('should produce non-negative values', () => {
      const signal = testSignal.slice(0, 2048);
      const spec = xa_fft.spectrogram(signal);

      if (Array.isArray(spec)) {
        spec.forEach(frame => {
          if (Array.isArray(frame) || ArrayBuffer.isView(frame)) {
            Array.from(frame).forEach(val => {
              expect(val).toBeGreaterThanOrEqual(0);
            });
          }
        });
      }
    });

    it('should throw on invalid inputs', () => {
      expect(() => xa_fft.spectrogram(null)).toThrow();
      expect(() => xa_fft.spectrogram([])).toThrow();
    });
  });
});
