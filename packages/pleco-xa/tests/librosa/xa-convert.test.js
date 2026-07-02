/**
 * Test Suite for xa-convert
 * Comprehensive tests for conversion functions (MIDI, frequency, time, tempo)
 */

import { describe, it, expect } from 'vitest';
import * as convert from '../../src/scripts/xa-convert.js';
import { almostEqual, knownTestVectors } from '../fixtures/test-data.js';

describe('xa-convert', () => {
  describe('hz_to_midi', () => {
    it('should be defined and exported', () => {
      expect(convert.hz_to_midi).toBeDefined();
      expect(typeof convert.hz_to_midi).toBe('function');
    });

    it('should convert known frequencies correctly (Librosa test_convert.py line 281)', () => {
      // Test with Librosa's known test vectors: [55, 110, 220, 440] -> [33, 45, 57, 69]
      knownTestVectors.midi.hzToMidi.forEach(({ hz, midi }) => {
        const result = convert.hz_to_midi(hz);
        expect(almostEqual(result, midi, 0.01)).toBe(true);
      });
    });

    it('should handle edge cases', () => {
      const veryLow = convert.hz_to_midi(20);
      const veryHigh = convert.hz_to_midi(10000);
      expect(Number.isFinite(veryLow)).toBe(true);
      expect(Number.isFinite(veryHigh)).toBe(true);
    });

    it('should throw on invalid inputs', () => {
      expect(() => convert.hz_to_midi(0)).toThrow();
      expect(() => convert.hz_to_midi(-1)).toThrow();
      expect(() => convert.hz_to_midi(null)).toThrow();
    });
  });

  describe('midi_to_hz', () => {
    it('should be defined and exported', () => {
      expect(convert.midi_to_hz).toBeDefined();
      expect(typeof convert.midi_to_hz).toBe('function');
    });

    it('should convert known MIDI notes correctly (Librosa test_convert.py line 277)', () => {
      // Test with Librosa's known test vectors: [33, 45, 57, 69] -> [55, 110, 220, 440]
      knownTestVectors.midi.midiToHz.forEach(({ midi, hz }) => {
        const result = convert.midi_to_hz(midi);
        expect(almostEqual(result, hz, 0.5)).toBe(true);
      });
    });

    it('should handle full MIDI range', () => {
      for (let midi = 0; midi <= 127; midi++) {
        const hz = convert.midi_to_hz(midi);
        expect(hz).toBeGreaterThan(0);
        expect(Number.isFinite(hz)).toBe(true);
      }
    });

    it('should be inverse of hz_to_midi', () => {
      const frequencies = [100, 200, 440, 880, 1000, 5000];
      frequencies.forEach(hz => {
        const midi = convert.hz_to_midi(hz);
        const reconstructed = convert.midi_to_hz(midi);
        expect(almostEqual(hz, reconstructed, 0.01)).toBe(true);
      });
    });

    it('should throw on invalid MIDI values', () => {
      expect(() => convert.midi_to_hz(-1)).toThrow();
      expect(() => convert.midi_to_hz(128)).toThrow();
      expect(() => convert.midi_to_hz(null)).toThrow();
    });
  });

  describe('midi_to_note', () => {
    it('should be defined and exported', () => {
      expect(convert.midi_to_note).toBeDefined();
      expect(typeof convert.midi_to_note).toBe('function');
    });

    it('should convert known MIDI values to note names', () => {
      expect(convert.midi_to_note(60)).toBe('C4');
      expect(convert.midi_to_note(69)).toBe('A4');
      expect(convert.midi_to_note(72)).toBe('C5');
    });

    it('should handle sharps correctly', () => {
      expect(convert.midi_to_note(61)).toMatch(/[CD][#♯]4/);
      expect(convert.midi_to_note(70)).toMatch(/[AB][#♯]4/);
    });

    it('should handle full MIDI range', () => {
      for (let midi = 0; midi <= 127; midi++) {
        const note = convert.midi_to_note(midi);
        expect(note).toBeDefined();
        expect(typeof note).toBe('string');
        expect(note.length).toBeGreaterThan(1);
      }
    });

    it('should throw on invalid MIDI values', () => {
      expect(() => convert.midi_to_note(-1)).toThrow();
      expect(() => convert.midi_to_note(128)).toThrow();
    });
  });

  describe('note_to_midi', () => {
    it('should be defined and exported', () => {
      expect(convert.note_to_midi).toBeDefined();
      expect(typeof convert.note_to_midi).toBe('function');
    });

    it('should convert known note names to MIDI', () => {
      expect(convert.note_to_midi('C4')).toBe(60);
      expect(convert.note_to_midi('A4')).toBe(69);
      expect(convert.note_to_midi('C5')).toBe(72);
    });

    it('should handle sharps', () => {
      const cSharp = convert.note_to_midi('C#4');
      expect(cSharp).toBe(61);
    });

    it('should handle flats', () => {
      const dFlat = convert.note_to_midi('Db4');
      expect(dFlat).toBe(61);
    });

    it('should be case insensitive', () => {
      expect(convert.note_to_midi('c4')).toBe(60);
      expect(convert.note_to_midi('C4')).toBe(60);
    });

    it('should be inverse of midi_to_note', () => {
      const midiNotes = [60, 64, 67, 69, 72, 76];
      midiNotes.forEach(midi => {
        const note = convert.midi_to_note(midi);
        const reconstructed = convert.note_to_midi(note);
        expect(reconstructed).toBe(midi);
      });
    });

    it('should throw on invalid note names', () => {
      expect(() => convert.note_to_midi('invalid')).toThrow();
      expect(() => convert.note_to_midi('H4')).toThrow();
      expect(() => convert.note_to_midi('')).toThrow();
    });
  });

  describe('note_to_hz', () => {
    it('should be defined and exported', () => {
      expect(convert.note_to_hz).toBeDefined();
      expect(typeof convert.note_to_hz).toBe('function');
    });

    it('should convert note names to frequencies', () => {
      expect(almostEqual(convert.note_to_hz('A4'), 440, 0.01)).toBe(true);
      expect(almostEqual(convert.note_to_hz('C4'), 261.63, 0.1)).toBe(true);
    });

    it('should handle sharps and flats', () => {
      const cSharpHz = convert.note_to_hz('C#4');
      const dFlatHz = convert.note_to_hz('Db4');
      expect(almostEqual(cSharpHz, dFlatHz, 0.01)).toBe(true);
    });
  });

  describe('hz_to_note', () => {
    it('should be defined and exported', () => {
      expect(convert.hz_to_note).toBeDefined();
      expect(typeof convert.hz_to_note).toBe('function');
    });

    it('should convert frequencies to note names', () => {
      expect(convert.hz_to_note(440)).toMatch(/A4/);
      expect(convert.hz_to_note(261.63)).toMatch(/C4/);
    });

    it('should round to nearest note', () => {
      const note = convert.hz_to_note(445); // Close to A4 (440 Hz)
      expect(note).toBeDefined();
      expect(typeof note).toBe('string');
    });
  });

  describe('mel_to_hz', () => {
    it('should be defined and exported', () => {
      expect(convert.mel_to_hz).toBeDefined();
      expect(typeof convert.mel_to_hz).toBe('function');
    });

    it('should convert mel scale correctly', () => {
      expect(almostEqual(convert.mel_to_hz(0), 0, 0.1)).toBe(true);
      expect(almostEqual(convert.mel_to_hz(1000), 1000, 1)).toBe(true);
    });

    it('should handle high mel values', () => {
      const hz = convert.mel_to_hz(2840);
      expect(hz).toBeGreaterThan(7000);
      expect(hz).toBeLessThan(9000);
    });

    it('should produce monotonically increasing output', () => {
      const mels = [0, 500, 1000, 1500, 2000, 2500];
      const hzValues = mels.map(m => convert.mel_to_hz(m));

      for (let i = 1; i < hzValues.length; i++) {
        expect(hzValues[i]).toBeGreaterThan(hzValues[i - 1]);
      }
    });
  });

  describe('hz_to_mel', () => {
    it('should be defined and exported', () => {
      expect(convert.hz_to_mel).toBeDefined();
      expect(typeof convert.hz_to_mel).toBe('function');
    });

    it('should convert frequency to mel scale', () => {
      expect(almostEqual(convert.hz_to_mel(0), 0, 0.1)).toBe(true);
      expect(almostEqual(convert.hz_to_mel(1000), 1000, 1)).toBe(true);
    });

    it('should be inverse of mel_to_hz', () => {
      const mels = [0, 500, 1000, 1500, 2000];
      mels.forEach(mel => {
        const hz = convert.mel_to_hz(mel);
        const reconstructed = convert.hz_to_mel(hz);
        expect(almostEqual(mel, reconstructed, 1)).toBe(true);
      });
    });
  });

  describe('frames_to_time', () => {
    it('should be defined and exported', () => {
      expect(convert.frames_to_time).toBeDefined();
      expect(typeof convert.frames_to_time).toBe('function');
    });

    it('should convert frame indices to time', () => {
      const sr = 22050;
      const hop_length = 512;

      const time0 = convert.frames_to_time(0, sr, hop_length);
      expect(almostEqual(time0, 0, 0.001)).toBe(true);

      const time1 = convert.frames_to_time(1, sr, hop_length);
      expect(almostEqual(time1, hop_length / sr, 0.001)).toBe(true);
    });

    it('should handle array of frames', () => {
      const frames = [0, 10, 20, 30];
      const times = convert.frames_to_time(frames, 22050, 512);

      expect(Array.isArray(times) || ArrayBuffer.isView(times)).toBe(true);
      expect(times.length).toBe(frames.length);
    });
  });

  describe('time_to_frames', () => {
    it('should be defined and exported', () => {
      expect(convert.time_to_frames).toBeDefined();
      expect(typeof convert.time_to_frames).toBe('function');
    });

    it('should convert time to frame indices', () => {
      const sr = 22050;
      const hop_length = 512;

      const frame0 = convert.time_to_frames(0, sr, hop_length);
      expect(frame0).toBe(0);

      const frame1 = convert.time_to_frames(hop_length / sr, sr, hop_length);
      expect(frame1).toBeCloseTo(1, 0);
    });

    it('should be inverse of frames_to_time', () => {
      const sr = 22050;
      const hop_length = 512;
      const frames = [0, 10, 20, 50, 100];

      frames.forEach(frame => {
        const time = convert.frames_to_time(frame, sr, hop_length);
        const reconstructed = convert.time_to_frames(time, sr, hop_length);
        expect(Math.abs(frame - reconstructed)).toBeLessThan(1);
      });
    });
  });

  describe('samples_to_time', () => {
    it('should be defined and exported', () => {
      expect(convert.samples_to_time).toBeDefined();
      expect(typeof convert.samples_to_time).toBe('function');
    });

    it('should convert samples to time (Librosa test_convert.py line 79)', () => {
      // Test with Librosa vectors: samples_to_time([0, sr, 2*sr], sr=sr) == [0, 1, 2]
      knownTestVectors.time.samplesToTime.forEach(({ samples, sr, time }) => {
        const result = convert.samples_to_time(samples, sr);
        expect(almostEqual(result, time, 0.001)).toBe(true);
      });
    });

    it('should handle array of samples', () => {
      const samples = [0, 1000, 2000, 3000];
      const times = convert.samples_to_time(samples, 22050);

      expect(Array.isArray(times) || ArrayBuffer.isView(times)).toBe(true);
      expect(times.length).toBe(samples.length);
    });
  });

  describe('time_to_samples', () => {
    it('should be defined and exported', () => {
      expect(convert.time_to_samples).toBeDefined();
      expect(typeof convert.time_to_samples).toBe('function');
    });

    it('should convert time to samples (Librosa test_convert.py line 75)', () => {
      // Test with Librosa vectors: time_to_samples([0, 1, 2], sr=sr) == [0, sr, 2*sr]
      knownTestVectors.time.timeToSamples.forEach(({ time, sr, samples }) => {
        const result = convert.time_to_samples(time, sr);
        expect(almostEqual(result, samples, 1)).toBe(true);
      });
    });

    it('should be inverse of samples_to_time', () => {
      const sr = 44100;
      const samples = [0, 1000, 5000, 10000, 22050];

      samples.forEach(sample => {
        const time = convert.samples_to_time(sample, sr);
        const reconstructed = convert.time_to_samples(time, sr);
        expect(Math.abs(sample - reconstructed)).toBeLessThan(1);
      });
    });
  });

  describe('bpm_to_tempo', () => {
    it('should be defined and exported', () => {
      expect(convert.bpm_to_tempo).toBeDefined();
      expect(typeof convert.bpm_to_tempo).toBe('function');
    });

    it('should convert BPM to tempo (frames per beat)', () => {
      const bpm = 120;
      const sr = 22050;
      const hop_length = 512;
      const tempo = convert.bpm_to_tempo(bpm, sr, hop_length);

      expect(tempo).toBeGreaterThan(0);
      expect(Number.isFinite(tempo)).toBe(true);
    });

    it('should handle different BPM values', () => {
      const bpms = [60, 90, 120, 140, 180];
      bpms.forEach(bpm => {
        const tempo = convert.bpm_to_tempo(bpm, 22050, 512);
        expect(tempo).toBeGreaterThan(0);
      });
    });
  });

  describe('tempo_to_bpm', () => {
    it('should be defined and exported', () => {
      expect(convert.tempo_to_bpm).toBeDefined();
      expect(typeof convert.tempo_to_bpm).toBe('function');
    });

    it('should convert tempo to BPM', () => {
      const sr = 22050;
      const hop_length = 512;
      const tempo = 100;
      const bpm = convert.tempo_to_bpm(tempo, sr, hop_length);

      expect(bpm).toBeGreaterThan(0);
      expect(Number.isFinite(bpm)).toBe(true);
    });

    it('should be inverse of bpm_to_tempo', () => {
      const sr = 22050;
      const hop_length = 512;
      const bpms = [60, 90, 120, 140, 180];

      bpms.forEach(bpm => {
        const tempo = convert.bpm_to_tempo(bpm, sr, hop_length);
        const reconstructed = convert.tempo_to_bpm(tempo, sr, hop_length);
        expect(almostEqual(bpm, reconstructed, 0.1)).toBe(true);
      });
    });
  });

  describe('A_weighting', () => {
    it('should be defined and exported', () => {
      expect(convert.A_weighting).toBeDefined();
      expect(typeof convert.A_weighting).toBe('function');
    });

    it('should compute A-weighting for known frequencies', () => {
      // A-weighting should be close to 0 dB at 1 kHz
      const weight1k = convert.A_weighting(1000);
      expect(Math.abs(weight1k)).toBeLessThan(5);

      // A-weighting should be negative at low frequencies
      const weight100 = convert.A_weighting(100);
      expect(weight100).toBeLessThan(-10);
    });

    it('should handle array of frequencies', () => {
      const frequencies = [100, 500, 1000, 5000, 10000];
      const weights = convert.A_weighting(frequencies);

      expect(Array.isArray(weights) || ArrayBuffer.isView(weights)).toBe(true);
      expect(weights.length).toBe(frequencies.length);
    });
  });

  describe('fft_frequencies', () => {
    it('should be defined and exported', () => {
      expect(convert.fft_frequencies).toBeDefined();
      expect(typeof convert.fft_frequencies).toBe('function');
    });

    it('should generate FFT frequency bins', () => {
      const sr = 22050;
      const n_fft = 2048;
      const freqs = convert.fft_frequencies(sr, n_fft);

      expect(freqs.length).toBe(Math.floor(n_fft / 2) + 1);
      expect(freqs[0]).toBe(0);
      expect(freqs[freqs.length - 1]).toBeCloseTo(sr / 2, 1);
    });
  });

  describe('cqt_frequencies', () => {
    it('should be defined and exported', () => {
      expect(convert.cqt_frequencies).toBeDefined();
      expect(typeof convert.cqt_frequencies).toBe('function');
    });

    it('should generate CQT frequency bins', () => {
      const n_bins = 84;
      const fmin = 32.7; // C1
      const bins_per_octave = 12;
      const freqs = convert.cqt_frequencies(n_bins, fmin, bins_per_octave);

      expect(freqs.length).toBe(n_bins);
      expect(freqs[0]).toBeCloseTo(fmin, 0.1);
    });

    it('should produce geometrically spaced frequencies', () => {
      const n_bins = 36;
      const fmin = 100;
      const bins_per_octave = 12;
      const freqs = convert.cqt_frequencies(n_bins, fmin, bins_per_octave);

      // Ratio between consecutive bins should be constant
      const ratio = Math.pow(2, 1 / bins_per_octave);
      for (let i = 1; i < freqs.length; i++) {
        const actualRatio = freqs[i] / freqs[i - 1];
        expect(almostEqual(actualRatio, ratio, 0.01)).toBe(true);
      }
    });
  });

  describe('mel_frequencies', () => {
    it('should be defined and exported', () => {
      expect(convert.mel_frequencies).toBeDefined();
      expect(typeof convert.mel_frequencies).toBe('function');
    });

    it('should generate mel-spaced frequencies', () => {
      const n_mels = 128;
      const fmin = 0;
      const fmax = 8000;
      const freqs = convert.mel_frequencies(n_mels, fmin, fmax);

      expect(freqs.length).toBe(n_mels);
      expect(freqs[0]).toBeCloseTo(fmin, 1);
      expect(freqs[freqs.length - 1]).toBeCloseTo(fmax, 1);
    });

    it('should produce monotonically increasing frequencies', () => {
      const n_mels = 64;
      const freqs = convert.mel_frequencies(n_mels, 0, 11025);

      for (let i = 1; i < freqs.length; i++) {
        expect(freqs[i]).toBeGreaterThan(freqs[i - 1]);
      }
    });
  });

  describe('tempo_frequencies', () => {
    it('should be defined and exported', () => {
      expect(convert.tempo_frequencies).toBeDefined();
      expect(typeof convert.tempo_frequencies).toBe('function');
    });

    it('should generate tempo frequency bins', () => {
      const n_bins = 128;
      const hop_length = 512;
      const sr = 22050;
      const freqs = convert.tempo_frequencies(n_bins, hop_length, sr);

      expect(freqs.length).toBe(n_bins);
      expect(freqs[0]).toBeGreaterThanOrEqual(0);
    });
  });

  describe('fourier_tempo_frequencies', () => {
    it('should be defined and exported', () => {
      expect(convert.fourier_tempo_frequencies).toBeDefined();
      expect(typeof convert.fourier_tempo_frequencies).toBe('function');
    });

    it('should generate Fourier tempo frequencies', () => {
      const sr = 22050;
      const win_length = 384;
      const hop_length = 512;
      const freqs = convert.fourier_tempo_frequencies(sr, win_length, hop_length);

      expect(Array.isArray(freqs) || ArrayBuffer.isView(freqs)).toBe(true);
      expect(freqs.length).toBeGreaterThan(0);
    });
  });

  describe('db_to_power', () => {
    it('should be defined and exported', () => {
      expect(convert.db_to_power).toBeDefined();
      expect(typeof convert.db_to_power).toBe('function');
    });

    it('should convert dB to power correctly', () => {
      expect(almostEqual(convert.db_to_power(0), 1, 0.001)).toBe(true);
      expect(almostEqual(convert.db_to_power(3), 2, 0.1)).toBe(true);
      expect(almostEqual(convert.db_to_power(-3), 0.5, 0.1)).toBe(true);
    });

    it('should handle negative dB values', () => {
      const power = convert.db_to_power(-20);
      expect(power).toBeGreaterThan(0);
      expect(power).toBeLessThan(1);
    });
  });

  describe('power_to_db', () => {
    it('should be defined and exported', () => {
      expect(convert.power_to_db).toBeDefined();
      expect(typeof convert.power_to_db).toBe('function');
    });

    it('should convert power to dB correctly', () => {
      expect(almostEqual(convert.power_to_db(1), 0, 0.001)).toBe(true);
      expect(almostEqual(convert.power_to_db(2), 3, 0.1)).toBe(true);
      expect(almostEqual(convert.power_to_db(0.5), -3, 0.1)).toBe(true);
    });

    it('should be inverse of db_to_power', () => {
      const dbs = [-20, -10, 0, 3, 6, 10];
      dbs.forEach(db => {
        const power = convert.db_to_power(db);
        const reconstructed = convert.power_to_db(power);
        expect(almostEqual(db, reconstructed, 0.01)).toBe(true);
      });
    });
  });

  describe('amplitude_to_db', () => {
    it('should be defined and exported', () => {
      expect(convert.amplitude_to_db).toBeDefined();
      expect(typeof convert.amplitude_to_db).toBe('function');
    });

    it('should convert amplitude to dB', () => {
      expect(almostEqual(convert.amplitude_to_db(1), 0, 0.001)).toBe(true);
      expect(almostEqual(convert.amplitude_to_db(0.5), -6, 0.1)).toBe(true);
    });
  });

  describe('db_to_amplitude', () => {
    it('should be defined and exported', () => {
      expect(convert.db_to_amplitude).toBeDefined();
      expect(typeof convert.db_to_amplitude).toBe('function');
    });

    it('should convert dB to amplitude', () => {
      expect(almostEqual(convert.db_to_amplitude(0), 1, 0.001)).toBe(true);
      expect(almostEqual(convert.db_to_amplitude(-6), 0.5, 0.01)).toBe(true);
    });

    it('should be inverse of amplitude_to_db', () => {
      const dbs = [-20, -10, -6, 0, 3, 6];
      dbs.forEach(db => {
        const amplitude = convert.db_to_amplitude(db);
        const reconstructed = convert.amplitude_to_db(amplitude);
        expect(almostEqual(db, reconstructed, 0.01)).toBe(true);
      });
    });
  });
});
