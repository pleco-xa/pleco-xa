/**
 * scripts/xa-convert.js — unit-conversion golden table.
 * Definitional values every conversion library must hit (librosa 0.11.0 parity).
 * Note: hz_to_mel(1000) is 15 − 1.8e-15 in float64 (200/3 roundoff, identical to
 * librosa's own float result), so "exact" identities are asserted at 1e-9.
 */
import { convert } from '../../packages/pleco-xa/dist/pleco-xa.js'
import { check, summary } from './_harness.mjs'

check('hz_to_midi(440) == 69 (A4 is MIDI 69 by definition)', convert.hz_to_midi(440), 69)
check("midi_to_note(69) == 'A4'", convert.midi_to_note(69), 'A4')
check("note_to_hz('C4') ~= 261.6256 (middle C)", convert.note_to_hz('C4'), 261.6256, 1e-3)
check('amplitude_to_db(0.5) ~= -6.0206 (half amplitude)', convert.amplitude_to_db(0.5), -6.0206, 1e-3)
check('db_to_amplitude(amplitude_to_db(0.7)) == 0.7 (dB roundtrip)',
  convert.db_to_amplitude(convert.amplitude_to_db(0.7)), 0.7, 1e-12)
check('hz_to_mel(1000) == 15 (Slaney linear/log seam)', convert.hz_to_mel(1000), 15, 1e-9)
check('mel_to_hz(hz_to_mel(1000)) == 1000 (Slaney mel roundtrip)',
  convert.mel_to_hz(convert.hz_to_mel(1000)), 1000, 1e-9)
check('a_weighting(1000) == 0.000 dB (A-weighting zero at 1 kHz by definition)',
  convert.a_weighting(1000), 0, 1e-3)
check('time_to_frames(frames_to_time(100)) == 100 (frame roundtrip)',
  convert.time_to_frames(convert.frames_to_time(100)), 100)

summary('xa-convert — unit-conversion golden table')
