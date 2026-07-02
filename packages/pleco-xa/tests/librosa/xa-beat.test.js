/**
 * Test Suite for xa-beat
 * Real algorithmic validation tests based on Librosa test_beat.py
 *
 * Key pattern from Librosa (test_beat.py lines 50-77):
 * 1. Generate click track at known BPM
 * 2. Run tempo detection
 * 3. Validate detected tempo is within 5% of expected
 */

import { describe, it, expect, beforeEach } from 'vitest';
import * as xa_beat from '../../src/scripts/xa-beat.js';
import {
  generateClickTrack,
  generateSilence,
  withinPercent,
  almostEqual,
  knownTestVectors
} from '../fixtures/test-data.js';

describe('xa-beat - Algorithmic Validation', () => {
  let sampleRate;

  beforeEach(() => {
    sampleRate = 22050;
  });

  describe('tempo detection with click tracks (Librosa test_tempo pattern)', () => {
    /**
     * Based on Librosa test_beat.py lines 50-77
     *
     * Pattern:
     *   y = np.zeros(20 * sr)
     *   delay = librosa.time_to_samples(60.0 / tempo, sr=sr).item()
     *   y[::delay] = 1
     *   tempo_est = librosa.feature.tempo(y=y, sr=sr, ...)
     *   assert np.abs(tempo_est - tempo) <= 0.05 * tempo  # 5% tolerance
     */

    it('should detect 60 BPM from click track within 5% tolerance', () => {
      const expectedTempo = 60;
      const duration = 20;  // 20 seconds as in Librosa
      const clickTrack = generateClickTrack(expectedTempo, sampleRate, duration);

      // Run tempo detection
      let detectedTempo;
      if (typeof xa_beat.tempo === 'function') {
        detectedTempo = xa_beat.tempo(clickTrack, sampleRate);
      } else if (typeof xa_beat.estimateTempo === 'function') {
        detectedTempo = xa_beat.estimateTempo(clickTrack, sampleRate);
      } else {
        throw new Error('No tempo detection function found');
      }

      // Validate: detected tempo should be within 5% of expected
      expect(detectedTempo).toBeDefined();
      expect(typeof detectedTempo).toBe('number');
      expect(Number.isFinite(detectedTempo)).toBe(true);

      // Core assertion: within 5% tolerance (Librosa pattern)
      expect(withinPercent(detectedTempo, expectedTempo, 0.05)).toBe(true);
    });

    it('should detect 120 BPM from click track within 5% tolerance', () => {
      const expectedTempo = 120;
      const duration = 20;
      const clickTrack = generateClickTrack(expectedTempo, sampleRate, duration);

      let detectedTempo;
      if (typeof xa_beat.tempo === 'function') {
        detectedTempo = xa_beat.tempo(clickTrack, sampleRate);
      } else if (typeof xa_beat.estimateTempo === 'function') {
        detectedTempo = xa_beat.estimateTempo(clickTrack, sampleRate);
      } else {
        throw new Error('No tempo detection function found');
      }

      expect(withinPercent(detectedTempo, expectedTempo, 0.05)).toBe(true);
    });

    it('should detect 80 BPM from click track within 5% tolerance', () => {
      const expectedTempo = 80;
      const duration = 20;
      const clickTrack = generateClickTrack(expectedTempo, sampleRate, duration);

      let detectedTempo;
      if (typeof xa_beat.tempo === 'function') {
        detectedTempo = xa_beat.tempo(clickTrack, sampleRate);
      } else if (typeof xa_beat.estimateTempo === 'function') {
        detectedTempo = xa_beat.estimateTempo(clickTrack, sampleRate);
      } else {
        throw new Error('No tempo detection function found');
      }

      expect(withinPercent(detectedTempo, expectedTempo, 0.05)).toBe(true);
    });

    it('should detect 160 BPM from click track within 5% tolerance', () => {
      const expectedTempo = 160;
      const duration = 20;
      const clickTrack = generateClickTrack(expectedTempo, sampleRate, duration);

      let detectedTempo;
      if (typeof xa_beat.tempo === 'function') {
        detectedTempo = xa_beat.tempo(clickTrack, sampleRate);
      } else if (typeof xa_beat.estimateTempo === 'function') {
        detectedTempo = xa_beat.estimateTempo(clickTrack, sampleRate);
      } else {
        throw new Error('No tempo detection function found');
      }

      expect(withinPercent(detectedTempo, expectedTempo, 0.05)).toBe(true);
    });

    it('should handle all Librosa test tempos', () => {
      // Test with all tempos from Librosa test suite
      knownTestVectors.tempo.clickTrackTests.forEach(({ tempo: expectedTempo, sr, tolerance }) => {
        const clickTrack = generateClickTrack(expectedTempo, sr, 20);

        let detectedTempo;
        if (typeof xa_beat.tempo === 'function') {
          detectedTempo = xa_beat.tempo(clickTrack, sr);
        } else if (typeof xa_beat.estimateTempo === 'function') {
          detectedTempo = xa_beat.estimateTempo(clickTrack, sr);
        } else {
          throw new Error('No tempo detection function found');
        }

        expect(withinPercent(detectedTempo, expectedTempo, tolerance)).toBe(true);
      });
    });
  });

  describe('tempo detection edge cases (Librosa test_tempo_no_onsets)', () => {
    /**
     * Based on Librosa test_beat.py lines 111-127
     * When onset envelope is all zeros, should return start_bpm (or 0)
     */

    it('should handle silence (no onsets) gracefully', () => {
      const silence = generateSilence(sampleRate * 10);  // 10 seconds of silence

      let result;
      if (typeof xa_beat.tempo === 'function') {
        result = xa_beat.tempo(silence, sampleRate);
      } else if (typeof xa_beat.estimateTempo === 'function') {
        result = xa_beat.estimateTempo(silence, sampleRate);
      } else {
        throw new Error('No tempo detection function found');
      }

      // Should return a valid number (could be 0 or default BPM)
      expect(Number.isFinite(result)).toBe(true);
      expect(result).toBeGreaterThanOrEqual(0);
    });

    it('should handle constant signal (no variation) gracefully', () => {
      const constant = new Float32Array(sampleRate * 10);
      constant.fill(0.5);

      let result;
      if (typeof xa_beat.tempo === 'function') {
        result = xa_beat.tempo(constant, sampleRate);
      } else if (typeof xa_beat.estimateTempo === 'function') {
        result = xa_beat.estimateTempo(constant, sampleRate);
      } else {
        throw new Error('No tempo detection function found');
      }

      expect(Number.isFinite(result)).toBe(true);
      expect(result).toBeGreaterThanOrEqual(0);
    });
  });

  describe('beat_track / beatTrack function', () => {
    /**
     * Based on Librosa test_beat.py lines 147-177
     * Beat tracking should return valid beat positions
     */

    it('should be defined and exported', () => {
      const hasBeatTrack = xa_beat.beatTrack || xa_beat.beat_track || xa_beat.trackBeats;
      expect(hasBeatTrack).toBeDefined();
    });

    it('should return valid beat positions for click track', () => {
      const tempo = 120;
      const duration = 10;
      const clickTrack = generateClickTrack(tempo, sampleRate, duration);

      let result;
      if (typeof xa_beat.beatTrack === 'function') {
        result = xa_beat.beatTrack(clickTrack, sampleRate);
      } else if (typeof xa_beat.beat_track === 'function') {
        result = xa_beat.beat_track(clickTrack, sampleRate);
      } else if (typeof xa_beat.trackBeats === 'function') {
        result = xa_beat.trackBeats(clickTrack, sampleRate);
      } else {
        // Skip if no beat tracking function available
        return;
      }

      // Validate result structure
      expect(result).toBeDefined();

      // Should have tempo and beats
      if (result.tempo !== undefined) {
        expect(typeof result.tempo).toBe('number');
        expect(result.tempo).toBeGreaterThan(0);
      }

      if (result.beats !== undefined) {
        expect(Array.isArray(result.beats) || ArrayBuffer.isView(result.beats)).toBe(true);

        // Beats should be in ascending order (Librosa test pattern)
        if (result.beats.length > 1) {
          for (let i = 1; i < result.beats.length; i++) {
            expect(result.beats[i]).toBeGreaterThan(result.beats[i - 1]);
          }
        }

        // All beats should be non-negative
        for (const beat of result.beats) {
          expect(beat).toBeGreaterThanOrEqual(0);
        }
      }
    });
  });

  describe('function exports (existence checks)', () => {
    // Keep existence checks for completeness

    it('should export tempo estimation function', () => {
      const hasTempo = xa_beat.tempo || xa_beat.estimateTempo || xa_beat.extractTempo;
      expect(hasTempo).toBeDefined();
      expect(typeof hasTempo).toBe('function');
    });

    it('should export beat tracking function', () => {
      const hasBeatTrack = xa_beat.beatTrack || xa_beat.beat_track || xa_beat.trackBeats;
      expect(hasBeatTrack).toBeDefined();
      expect(typeof hasBeatTrack).toBe('function');
    });
  });

  describe('input validation', () => {
    it('should handle invalid inputs gracefully', () => {
      const tempoFn = xa_beat.tempo || xa_beat.estimateTempo;

      if (tempoFn) {
        expect(() => tempoFn(null, sampleRate)).toThrow();
        expect(() => tempoFn(undefined, sampleRate)).toThrow();
        expect(() => tempoFn(new Float32Array(0), sampleRate)).toThrow();
      }
    });

    it('should handle invalid sample rates', () => {
      const tempoFn = xa_beat.tempo || xa_beat.estimateTempo;
      const audio = generateClickTrack(120, 22050, 5);

      if (tempoFn) {
        expect(() => tempoFn(audio, 0)).toThrow();
        expect(() => tempoFn(audio, -1)).toThrow();
        expect(() => tempoFn(audio, null)).toThrow();
      }
    });
  });
});
