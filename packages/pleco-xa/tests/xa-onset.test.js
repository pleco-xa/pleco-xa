/**
 * Test Suite for xa-onset
 * Graduated from the seed test suite under truth-triage:
 *
 *  - Import paths fixed for tests/ (./fixtures/test-data.js).
 *  - "Existence check" fallback chains (onset_strength || onsetStrength,
 *    onset_detect || onsetDetect || detectOnsets) deleted — the actual
 *    exports (onset_strength, onsetDetect) are asserted directly.
 *  - The onset_detect assertions were corrected for pleco's actual API:
 *    onsetDetect() returns {onsetTimes, onsetStrength, onsetFrames}; the
 *    seed compared `.length` on that object, which never tested anything.
 *  - Reference patterns retained: constant signals yield ≤1 onset
 *    (test_onset.py lines 216-233); onset strength is non-negative when
 *    detrend=False (lines 42-70); detections ascend.
 *  - Numerical accuracy against the reference is separately fixture-gated
 *    in the reference test suite.
 */

import { describe, it, expect } from 'vitest';
import { onset_strength, onsetDetect } from '../src/scripts/xa-onset.js';
import {
  generateTestAudio,
  generateSilence,
  generateDCSignal,
  generateClickTrack,
  isFiniteArray,
  isNonNegativeArray,
} from './fixtures/test-data.js';

const SR = 22050;

describe('xa-onset - Algorithmic Validation', () => {
  describe('onset_strength', () => {
    it('returns a non-negative, finite 1D envelope for audio (reference: detrend=False)', () => {
      const audio = generateTestAudio(1.0, SR, 440);
      const result = onset_strength(audio, SR);

      expect(ArrayBuffer.isView(result)).toBe(true);
      expect(result.length).toBeGreaterThan(0);
      expect(isNonNegativeArray(Array.from(result))).toBe(true);
      expect(isFiniteArray(Array.from(result))).toBe(true);
    });

    it('returns an all-zero envelope for silence', () => {
      const silence = generateSilence(SR * 2);
      const result = onset_strength(silence, SR);

      expect(isFiniteArray(Array.from(result))).toBe(true);
      expect(Math.max(...result)).toBe(0);
    });

    it('handles a constant (DC) signal without NaN/Infinity', () => {
      const constant = generateDCSignal(SR * 2, 0.5);
      const result = onset_strength(constant, SR);
      expect(isFiniteArray(Array.from(result))).toBe(true);
    });

    it('produces clear peaks for a click track', () => {
      const clickTrack = generateClickTrack(120, SR, 5);
      const result = onset_strength(clickTrack, SR);

      expect(result.length).toBeGreaterThan(0);
      expect(Math.max(...result)).toBeGreaterThan(0);
    });

    it('supports median aggregation (what the reference beat_track uses)', () => {
      const clickTrack = generateClickTrack(120, SR, 5);
      const result = onset_strength(clickTrack, { sr: SR, aggregate: 'median' });
      expect(isNonNegativeArray(Array.from(result))).toBe(true);
      expect(Math.max(...result)).toBeGreaterThan(0);
      expect(() => onset_strength(clickTrack, { sr: SR, aggregate: 'mode' })).toThrow();
    });

    it('throws when neither y nor a spectrogram is provided (never fabricates)', () => {
      expect(() => onset_strength(null, { sr: SR })).toThrow();
    });
  });

  describe('onsetDetect', () => {
    /**
     * reference test_onset.py lines 216-233: constant signals should produce
     * 0 or 1 onset (one is allowed at the start due to padding).
     */
    it('produces 0 or 1 onset for silence', () => {
      const { onsetFrames } = onsetDetect(generateSilence(SR * 4), SR);
      expect(Array.isArray(onsetFrames)).toBe(true);
      expect(onsetFrames.length).toBeLessThanOrEqual(1);
    });

    it('produces 0 or 1 onset for a constant signal (ones)', () => {
      const { onsetFrames } = onsetDetect(generateDCSignal(SR * 4, 1.0), SR);
      expect(onsetFrames.length).toBeLessThanOrEqual(1);
    });

    it('detects onsets in ascending order', () => {
      const clickTrack = generateClickTrack(120, SR, 5);
      const { onsetFrames, onsetTimes } = onsetDetect(clickTrack, SR);

      for (let i = 1; i < onsetFrames.length; i++) {
        expect(onsetFrames[i]).toBeGreaterThan(onsetFrames[i - 1]);
      }
      for (let i = 1; i < onsetTimes.length; i++) {
        expect(onsetTimes[i]).toBeGreaterThan(onsetTimes[i - 1]);
      }
    });
  });

  describe('exports', () => {
    it('exports onset strength and onset detection functions', () => {
      expect(typeof onset_strength).toBe('function');
      expect(typeof onsetDetect).toBe('function');
    });
  });
});
