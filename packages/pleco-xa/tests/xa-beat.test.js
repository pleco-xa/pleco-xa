/**
 * Test Suite for the canonical rhythm engine (xa-beat-tracker)
 * Graduated from the seed test suite under truth-triage:
 *
 *  - Retargeted from xa-beat.js (fast heuristics, no longer exports
 *    tempo/beat_track) to the canonical reference engine in
 *    xa-beat-tracker.js — the single module that exports tempo/beat_track.
 *  - Click-track pattern kept from the reference test_beat.py (lines 50-77):
 *    generate clicks at a known BPM, assert the estimate within 5%.
 *    Reference-derived truths (verified against the reference implementation 0.11.0):
 *      60→60.093, 80→80.750, 110→112.347, 120→117.454, 160→161.499 BPM.
 *  - Silence/constant expectations corrected to the reference's actual behavior:
 *    feature.tempo returns the tempo-prior argmax (117.4538... BPM at the
 *    default start_bpm=120), and beat_track returns (0 BPM, no beats)
 *    because its median-aggregated onset envelope is all zero.
 *  - "Existence check" fallback chains (tempo || estimateTempo || ...)
 *    deleted — the canonical exports are asserted directly.
 *  - Input validation kept and tightened: the engine throws on invalid
 *    input, it never fabricates a default BPM.
 */

import { describe, it, expect } from 'vitest';
import { tempo, beat_track, quickTempo } from '../src/scripts/xa-beat-tracker.js';
import { generateClickTrack, generateSilence, withinPercent } from './fixtures/test-data.js';

const SR = 22050;

// The reference tempo estimate is lag-quantized: the closest representable BPM
// to the nominal click tempo can be ~2% off (e.g. 120 → 117.454). The 5%
// tolerance below is the reference's own test_beat.py assertion.
const PRIOR_ARGMAX_BPM = 117.45383522727273; // 60*22050/(512*22)

describe('canonical rhythm engine - algorithmic validation', () => {
  describe('tempo detection with click tracks (reference test_tempo pattern)', () => {
    for (const expectedTempo of [60, 80, 110, 120, 160]) {
      it(`detects ${expectedTempo} BPM from a click track within 5% tolerance`, () => {
        const clickTrack = generateClickTrack(expectedTempo, SR, 20);
        const detected = tempo(clickTrack, { sr: SR });

        expect(typeof detected).toBe('number');
        expect(Number.isFinite(detected)).toBe(true);
        expect(withinPercent(detected, expectedTempo, 0.05)).toBe(true);
      });
    }
  });

  describe('degenerate inputs (reference test_tempo_no_onsets semantics)', () => {
    it('returns the tempo-prior argmax for silence (reference behavior, not a fabricated default)', () => {
      const silence = generateSilence(SR * 10);
      // reference feature.tempo(zeros) == prior argmax == 117.4538... at start_bpm=120
      expect(tempo(silence, { sr: SR })).toBeCloseTo(PRIOR_ARGMAX_BPM, 10);
    });

    it('returns the tempo-prior argmax for a constant signal (verified vs reference 0.11.0)', () => {
      const constant = new Float32Array(SR * 10).fill(0.5);
      expect(tempo(constant, { sr: SR })).toBeCloseTo(PRIOR_ARGMAX_BPM, 10);
    });

    it('beat_track returns 0 BPM and no beats when the onset envelope is silent', () => {
      const silence = generateSilence(SR * 10);
      const { tempo: bpm, beats } = beat_track(silence, SR);
      expect(bpm).toBe(0);
      expect(beats).toEqual([]);
    });
  });

  describe('beat_track', () => {
    it('returns ascending, non-negative beat frames for a click track', () => {
      const clickTrack = generateClickTrack(120, SR, 10);
      const result = beat_track(clickTrack, SR);

      expect(typeof result.tempo).toBe('number');
      expect(result.tempo).toBeGreaterThan(0);
      expect(Array.isArray(result.beats)).toBe(true);
      expect(result.beats.length).toBeGreaterThan(1);

      for (let i = 1; i < result.beats.length; i++) {
        expect(result.beats[i]).toBeGreaterThan(result.beats[i - 1]);
      }
      for (const beat of result.beats) {
        expect(beat).toBeGreaterThanOrEqual(0);
      }
    });

    it('respects a caller-provided bpm instead of estimating', () => {
      const clickTrack = generateClickTrack(120, SR, 10);
      const result = beat_track(clickTrack, SR, { bpm: PRIOR_ARGMAX_BPM });
      expect(result.tempo).toBe(PRIOR_ARGMAX_BPM);
      expect(result.beats.length).toBeGreaterThan(1);
    });
  });

  describe('quickTempo (explicit quick tier)', () => {
    it('estimates a click track tempo from the trailing window', () => {
      const clickTrack = generateClickTrack(120, SR, 20);
      const result = quickTempo(clickTrack, SR, { windowSec: 8 });
      expect(result.tier).toBe('quick');
      expect(withinPercent(result.bpm, 120, 0.05)).toBe(true);
      expect(result.confidence).toBeGreaterThan(0);
      expect(result.confidence).toBeLessThanOrEqual(1);
    });

    it('throws on silence instead of returning a default BPM', () => {
      expect(() => quickTempo(generateSilence(SR * 10), SR)).toThrow();
    });
  });

  describe('exports', () => {
    it('exports the canonical functions', () => {
      expect(typeof tempo).toBe('function');
      expect(typeof beat_track).toBe('function');
      expect(typeof quickTempo).toBe('function');
    });
  });

  describe('input validation (throw, never fabricate)', () => {
    it('rejects invalid audio input', () => {
      expect(() => tempo(null, { sr: SR })).toThrow();
      expect(() => tempo(undefined, { sr: SR })).toThrow();
      expect(() => tempo(new Float32Array(0), { sr: SR })).toThrow();
      expect(() => beat_track(null, SR)).toThrow();
      expect(() => beat_track(new Float32Array(0), SR)).toThrow();
    });

    it('rejects invalid sample rates', () => {
      const audio = generateClickTrack(120, SR, 5);
      expect(() => tempo(audio, { sr: 0 })).toThrow();
      expect(() => tempo(audio, { sr: -1 })).toThrow();
      expect(() => tempo(audio, { sr: null })).toThrow();
      expect(() => tempo(audio, 0)).toThrow(); // positional sr form
      expect(() => beat_track(audio, 0)).toThrow();
      expect(() => beat_track(audio, null)).toThrow();
    });

    it('rejects invalid parameters', () => {
      const audio = generateClickTrack(120, SR, 5);
      expect(() => beat_track(audio, SR, { units: 'bogus' })).toThrow();
      expect(() => tempo(audio, { sr: SR, startBpm: 0 })).toThrow();
      expect(() => tempo(audio, { sr: SR, hopLength: 0 })).toThrow();
      expect(() => quickTempo(audio, SR, { windowSec: 0 })).toThrow();
      expect(() => quickTempo(audio, SR, { minBpm: 180, maxBpm: 70 })).toThrow();
    });
  });
});
