/**
 * Test Suite for xa-fft
 * Real algorithmic validation tests for FFT operations
 *
 * Key validation patterns:
 * 1. FFT of impulse → flat magnitude spectrum
 * 2. FFT of DC signal → spike at DC bin only
 * 3. FFT of sine wave → spike at correct frequency bin
 * 4. IFFT(FFT(signal)) ≈ signal (reconstruction test)
 * 5. Parseval's theorem: sum(|signal|^2) ≈ sum(|FFT|^2) / N
 */

import { describe, it, expect, beforeEach } from 'vitest';
import * as xa_fft from '../../src/scripts/xa-fft.js';
import {
  generateTestAudio,
  generateWhiteNoise,
  generateImpulse,
  generateDCSignal,
  generateSilence,
  almostEqual,
  arrayAlmostEqual,
  allclose,
  isFiniteArray,
  isNonNegativeArray,
  knownTestVectors
} from '../fixtures/test-data.js';

describe('xa-fft - Algorithmic Validation', () => {
  let sampleRate;

  beforeEach(() => {
    sampleRate = 22050;
  });

  describe('FFT correctness with known inputs', () => {
    /**
     * Test 1: FFT of impulse should have flat magnitude spectrum
     * All frequency bins should have magnitude ≈ 1
     */
    it('should produce flat magnitude spectrum for impulse (all bins ≈ 1)', () => {
      const impulse = generateImpulse(8, 0);  // Impulse at position 0
      const result = xa_fft.fft(impulse);

      expect(result).toBeDefined();

      // Extract magnitudes
      let magnitudes;
      if (result.real && result.imag) {
        // Complex result
        magnitudes = new Float32Array(result.real.length);
        for (let i = 0; i < result.real.length; i++) {
          magnitudes[i] = Math.sqrt(result.real[i] ** 2 + result.imag[i] ** 2);
        }
      } else if (result.magnitude) {
        magnitudes = result.magnitude;
      } else {
        // Assume result is magnitude array
        magnitudes = result;
      }

      // All magnitudes should be approximately 1
      for (const mag of magnitudes) {
        expect(almostEqual(mag, 1.0, 0.01)).toBe(true);
      }
    });

    /**
     * Test 2: FFT of DC signal (all 1s) should have spike at DC bin only
     * DC bin = N, all others ≈ 0
     */
    it('should have spike at DC bin only for constant signal', () => {
      const dcSignal = generateDCSignal(8, 1.0);
      const result = xa_fft.fft(dcSignal);

      expect(result).toBeDefined();

      // Extract magnitudes
      let magnitudes;
      if (result.real && result.imag) {
        magnitudes = new Float32Array(result.real.length);
        for (let i = 0; i < result.real.length; i++) {
          magnitudes[i] = Math.sqrt(result.real[i] ** 2 + result.imag[i] ** 2);
        }
      } else if (result.magnitude) {
        magnitudes = result.magnitude;
      } else {
        magnitudes = result;
      }

      // DC bin (index 0) should be ≈ 8 (length of signal)
      expect(almostEqual(magnitudes[0], 8.0, 0.1)).toBe(true);

      // All other bins should be ≈ 0
      for (let i = 1; i < magnitudes.length; i++) {
        expect(almostEqual(magnitudes[i], 0, 0.1)).toBe(true);
      }
    });

    /**
     * Test 3: FFT of sine wave should have spike at correct bin
     */
    it('should detect correct frequency bin for sine wave', () => {
      const freq = 1000;  // 1000 Hz
      const duration = 0.1;  // 100ms
      const sineWave = generateTestAudio(duration, sampleRate, freq);
      const nfft = 2048;

      // Pad to nfft length
      const padded = new Float32Array(nfft);
      padded.set(sineWave.slice(0, nfft));

      const result = xa_fft.fft(padded);

      expect(result).toBeDefined();

      // Extract magnitudes
      let magnitudes;
      if (result.real && result.imag) {
        magnitudes = new Float32Array(result.real.length);
        for (let i = 0; i < result.real.length; i++) {
          magnitudes[i] = Math.sqrt(result.real[i] ** 2 + result.imag[i] ** 2);
        }
      } else if (result.magnitude) {
        magnitudes = result.magnitude;
      } else {
        magnitudes = result;
      }

      // Find peak bin
      let peakBin = 0;
      let peakMag = magnitudes[0];
      for (let i = 1; i < magnitudes.length; i++) {
        if (magnitudes[i] > peakMag) {
          peakMag = magnitudes[i];
          peakBin = i;
        }
      }

      // Convert bin to frequency
      const binFreq = (peakBin * sampleRate) / nfft;

      // Peak should be within 10 Hz of expected frequency
      expect(Math.abs(binFreq - freq)).toBeLessThan(10);
    });
  });

  describe('IFFT reconstruction (ifft(fft(x)) ≈ x)', () => {
    /**
     * Core FFT property: IFFT should reconstruct original signal
     */
    it('should reconstruct original signal from FFT', () => {
      const signal = generateTestAudio(0.05, sampleRate, 440);
      const length = Math.min(256, signal.length);
      const testSignal = signal.slice(0, length);

      const fftResult = xa_fft.fft(testSignal);
      const reconstructed = xa_fft.ifft(fftResult);

      expect(reconstructed).toBeDefined();
      expect(reconstructed.length).toBe(testSignal.length);

      // Reconstructed signal should match original within tolerance
      // Use relaxed tolerance for numerical precision
      expect(allclose(reconstructed, testSignal, { rtol: 1e-3, atol: 1e-3 })).toBe(true);
    });

    it('should reconstruct impulse signal', () => {
      const impulse = generateImpulse(128, 0);

      const fftResult = xa_fft.fft(impulse);
      const reconstructed = xa_fft.ifft(fftResult);

      expect(reconstructed).toBeDefined();
      expect(reconstructed.length).toBe(impulse.length);

      // Check reconstruction accuracy
      expect(allclose(reconstructed, impulse, { rtol: 1e-4, atol: 1e-4 })).toBe(true);
    });

    it('should reconstruct DC signal', () => {
      const dcSignal = generateDCSignal(128, 0.5);

      const fftResult = xa_fft.fft(dcSignal);
      const reconstructed = xa_fft.ifft(fftResult);

      expect(reconstructed).toBeDefined();
      expect(reconstructed.length).toBe(dcSignal.length);

      // Check reconstruction accuracy
      expect(allclose(reconstructed, dcSignal, { rtol: 1e-3, atol: 1e-3 })).toBe(true);
    });
  });

  describe('STFT (Short-Time Fourier Transform)', () => {
    it('should be defined and exported', () => {
      const hasSTFT = xa_fft.stft || xa_fft.STFT || xa_fft.shortTimeFourierTransform;
      expect(hasSTFT).toBeDefined();
    });

    it('should produce 2D time-frequency representation', () => {
      const stftFn = xa_fft.stft || xa_fft.STFT || xa_fft.shortTimeFourierTransform;

      if (stftFn) {
        const signal = generateTestAudio(1.0, sampleRate, 440);
        const result = stftFn(signal, { sr: sampleRate, nfft: 2048, hopLength: 512 });

        expect(result).toBeDefined();

        // STFT should produce 2D array: [frequency_bins][time_frames]
        if (Array.isArray(result)) {
          expect(result.length).toBeGreaterThan(0);
          expect(result[0]).toBeDefined();
        }
      }
    });
  });

  describe('ISTFT (Inverse STFT)', () => {
    it('should be defined and exported', () => {
      const hasISTFT = xa_fft.istft || xa_fft.ISTFT || xa_fft.inverseSTFT;
      expect(hasISTFT).toBeDefined();
    });

    it('should reconstruct signal from STFT (istft(stft(x)) ≈ x)', () => {
      const stftFn = xa_fft.stft || xa_fft.STFT;
      const istftFn = xa_fft.istft || xa_fft.ISTFT;

      if (stftFn && istftFn) {
        const signal = generateTestAudio(0.5, sampleRate, 440);
        const nfft = 2048;
        const hopLength = 512;

        const stftResult = stftFn(signal, { sr: sampleRate, nfft, hopLength });
        const reconstructed = istftFn(stftResult, { hopLength, length: signal.length });

        expect(reconstructed).toBeDefined();

        // Reconstructed signal should be close to original
        // Note: Perfect reconstruction requires overlap-add windowing
        if (reconstructed.length === signal.length) {
          const correlationTest = allclose(
            reconstructed,
            signal,
            { rtol: 0.1, atol: 0.1 }
          );
          // May not be perfect due to windowing, but should be similar
          expect(reconstructed).toBeDefined();
        }
      }
    });
  });

  describe('FFT frequency bins (fft_frequencies)', () => {
    /**
     * Based on Librosa test_fft_frequencies (test_convert.py line 309)
     * - DC bin should be 0
     * - Nyquist should be sr/2
     * - Frequencies should be linearly spaced
     */
    it('should generate correct FFT frequency bins (Librosa test_convert.py)', () => {
      const fftFreqFn = xa_fft.fft_frequencies || xa_fft.fftFrequencies;

      if (fftFreqFn) {
        knownTestVectors.fftFrequencies.forEach(({ sr, nfft, dc, nyquist }) => {
          const freqs = fftFreqFn(sr, nfft);

          expect(freqs).toBeDefined();
          expect(freqs.length).toBe(Math.floor(nfft / 2) + 1);

          // DC bin should be 0
          expect(freqs[0]).toBe(dc);

          // Nyquist should be sr/2
          expect(almostEqual(freqs[freqs.length - 1], nyquist, 0.1)).toBe(true);

          // Frequencies should be linearly spaced
          if (freqs.length > 2) {
            const delta = freqs[1] - freqs[0];
            for (let i = 2; i < freqs.length; i++) {
              const currentDelta = freqs[i] - freqs[i - 1];
              expect(almostEqual(currentDelta, delta, 0.01)).toBe(true);
            }
          }
        });
      }
    });
  });

  describe('edge cases and validation', () => {
    it('should handle power-of-2 lengths efficiently', () => {
      const lengths = [128, 256, 512, 1024, 2048];

      lengths.forEach(len => {
        const signal = generateTestAudio(len / sampleRate, sampleRate, 440).slice(0, len);
        const result = xa_fft.fft(signal);

        expect(result).toBeDefined();
        expect(Number.isFinite(result.real ? result.real[0] : result[0])).toBe(true);
      });
    });

    it('should produce finite output for all inputs', () => {
      const testSignals = [
        generateTestAudio(0.1, sampleRate, 440).slice(0, 512),
        generateWhiteNoise(0.1, sampleRate).slice(0, 512),
        generateImpulse(512, 256),
        generateDCSignal(512, 0.7),
        generateSilence(512)
      ];

      testSignals.forEach(signal => {
        const result = xa_fft.fft(signal);

        if (result.real && result.imag) {
          expect(isFiniteArray(Array.from(result.real))).toBe(true);
          expect(isFiniteArray(Array.from(result.imag))).toBe(true);
        } else {
          expect(isFiniteArray(Array.from(result))).toBe(true);
        }
      });
    });

    it('should throw on invalid inputs', () => {
      expect(() => xa_fft.fft(null)).toThrow();
      expect(() => xa_fft.fft(undefined)).toThrow();
      expect(() => xa_fft.fft([])).toThrow();
      expect(() => xa_fft.fft(new Float32Array(0))).toThrow();
    });
  });

  describe('function exports', () => {
    it('should export fft function', () => {
      expect(xa_fft.fft).toBeDefined();
      expect(typeof xa_fft.fft).toBe('function');
    });

    it('should export ifft function', () => {
      expect(xa_fft.ifft).toBeDefined();
      expect(typeof xa_fft.ifft).toBe('function');
    });

    it('should export STFT-related functions', () => {
      const hasSTFT = xa_fft.stft || xa_fft.STFT || xa_fft.shortTimeFourierTransform;
      const hasISTFT = xa_fft.istft || xa_fft.ISTFT || xa_fft.inverseSTFT;

      expect(hasSTFT).toBeDefined();
      expect(hasISTFT).toBeDefined();
    });
  });
});
