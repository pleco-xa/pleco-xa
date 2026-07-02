/**
 * Test Suite for xa-onset
 * Real algorithmic validation tests based on Librosa test_onset.py
 *
 * Key patterns from Librosa:
 * 1. Constant signals should produce 0 or 1 onset
 * 2. Onset strength should be non-negative (unless detrend=True)
 * 3. Onset backtracking should never roll forward
 * 4. Detected onsets should be in ascending order
 */

import { describe, it, expect, beforeEach } from 'vitest';
import * as xa_onset from '../src/scripts/xa-onset.js';
import {
  generateTestAudio,
  generateSilence,
  generateDCSignal,
  generateClickTrack,
  generateImpulse,
  almostEqual,
  isFiniteArray,
  isNonNegativeArray
} from './fixtures/test-data.js';

describe('xa-onset - Algorithmic Validation', () => {
  let sampleRate;

  beforeEach(() => {
    sampleRate = 22050;
  });

  describe('onset_strength', () => {
    it('should be defined and exported', () => {
      const hasOnsetStrength = xa_onset.onset_strength || xa_onset.onsetStrength;
      expect(hasOnsetStrength).toBeDefined();
      expect(typeof hasOnsetStrength).toBe('function');
    });

    /**
     * Based on Librosa test_onset.py lines 42-70
     * Onset strength should return 1D envelope
     * Values should be non-negative (unless detrend=True)
     */
    it('should return non-negative onset strength envelope for audio', () => {
      const onsetFn = xa_onset.onset_strength || xa_onset.onsetStrength;

      if (onsetFn) {
        const audio = generateTestAudio(1.0, sampleRate, 440);
        const result = onsetFn(audio, sampleRate);

        expect(result).toBeDefined();
        expect(Array.isArray(result) || ArrayBuffer.isView(result)).toBe(true);

        // Should be 1D envelope
        expect(result.length).toBeGreaterThan(0);

        // All values should be non-negative (default: no detrend)
        expect(isNonNegativeArray(Array.from(result))).toBe(true);

        // All values should be finite
        expect(isFiniteArray(Array.from(result))).toBe(true);
      }
    });

    it('should handle silence gracefully', () => {
      const onsetFn = xa_onset.onset_strength || xa_onset.onsetStrength;

      if (onsetFn) {
        const silence = generateSilence(sampleRate * 2);
        const result = onsetFn(silence, sampleRate);

        expect(result).toBeDefined();
        expect(isFiniteArray(Array.from(result))).toBe(true);

        // Silence should have low/zero onset strength
        const maxValue = Math.max(...result);
        expect(maxValue).toBeLessThan(0.1);
      }
    });

    it('should handle constant signal gracefully', () => {
      const onsetFn = xa_onset.onset_strength || xa_onset.onsetStrength;

      if (onsetFn) {
        const constant = generateDCSignal(sampleRate * 2, 0.5);
        const result = onsetFn(constant, sampleRate);

        expect(result).toBeDefined();
        expect(isFiniteArray(Array.from(result))).toBe(true);
      }
    });

    it('should detect onsets in click track', () => {
      const onsetFn = xa_onset.onset_strength || xa_onset.onsetStrength;

      if (onsetFn) {
        const clickTrack = generateClickTrack(120, sampleRate, 5);
        const result = onsetFn(clickTrack, sampleRate);

        expect(result).toBeDefined();
        expect(result.length).toBeGreaterThan(0);

        // Click track should have clear onset peaks
        const maxValue = Math.max(...result);
        expect(maxValue).toBeGreaterThan(0);
      }
    });
  });

  describe('onset_detect', () => {
    it('should be defined and exported', () => {
      const hasOnsetDetect = xa_onset.onset_detect || xa_onset.onsetDetect || xa_onset.detectOnsets;
      expect(hasOnsetDetect).toBeDefined();
    });

    /**
     * Based on Librosa test_onset.py lines 216-233
     * Constant signals should produce 0 or 1 onset
     */
    it('should produce 0 or 1 onset for silence (Librosa pattern)', () => {
      const detectFn = xa_onset.onset_detect || xa_onset.onsetDetect || xa_onset.detectOnsets;

      if (detectFn) {
        const silence = generateSilence(sampleRate * 4);
        const onsets = detectFn(silence, sampleRate);

        expect(onsets).toBeDefined();
        expect(Array.isArray(onsets) || ArrayBuffer.isView(onsets)).toBe(true);

        // Should have 0 or 1 onset (Librosa allows one at start due to padding)
        expect(onsets.length).toBeLessThanOrEqual(1);
      }
    });

    it('should produce 0 or 1 onset for constant signal (ones)', () => {
      const detectFn = xa_onset.onset_detect || xa_onset.onsetDetect || xa_onset.detectOnsets;

      if (detectFn) {
        const ones = generateDCSignal(sampleRate * 4, 1.0);
        const onsets = detectFn(ones, sampleRate);

        expect(onsets).toBeDefined();

        // Should have 0 or 1 onset
        // (Librosa: "We'll allow one onset at the start when y is all-ones")
        expect(onsets.length).toBeLessThanOrEqual(1);
      }
    });

    it('should detect onsets in ascending order', () => {
      const detectFn = xa_onset.onset_detect || xa_onset.onsetDetect || xa_onset.detectOnsets;

      if (detectFn) {
        const audio = generateTestAudio(2.0, sampleRate, 440);
        const onsets = detectFn(audio, sampleRate);

        expect(onsets).toBeDefined();

        if (onsets.length > 1) {
          // All onsets should be in ascending order
          for (let i = 1; i < onsets.length; i++) {
            expect(onsets[i]).toBeGreaterThan(onsets[i - 1]);
          }
        }
      }
    });
  });

  describe('function exports', () => {
    it('should export onset strength function', () => {
      const hasOnsetStrength = xa_onset.onset_strength || xa_onset.onsetStrength;
      expect(hasOnsetStrength).toBeDefined();
      expect(typeof hasOnsetStrength).toBe('function');
    });

    it('should export onset detection function', () => {
      const hasOnsetDetect = xa_onset.onset_detect || xa_onset.onsetDetect || xa_onset.detectOnsets;
      expect(hasOnsetDetect).toBeDefined();
      expect(typeof hasOnsetDetect).toBe('function');
    });
  });
});
