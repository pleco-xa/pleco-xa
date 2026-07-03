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

// ── pitch names & octaves ────────────────────────────────────────────────────
check('midi_to_hz(69) == 440 (A4 by definition)', convert.midi_to_hz(69), 440)
check("note_to_midi('A4') == 69", convert.note_to_midi('A4'), 69)
check("hz_to_note(440) == 'A4'", convert.hz_to_note(440), 'A4')
check("hz_to_note(261.63) == 'C4' (middle C)", convert.hz_to_note(261.63), 'C4')
check('hz_to_octs(440) == 4.75 (librosa: A4 sits at octave 4.75)',
  convert.hz_to_octs(440), 4.75, 1e-9)
check('octs_to_hz(hz_to_octs(261.6256)) == 261.6256 (octave roundtrip)',
  convert.octs_to_hz(convert.hz_to_octs(261.6256)), 261.6256, 1e-9)
check('A4_to_tuning(432) == 12·log2(432/440) ≈ -0.3177 bins',
  convert.A4_to_tuning(432), 12 * Math.log2(432 / 440), 1e-12)
check('tuning_to_A4(A4_to_tuning(432)) == 432 (tuning roundtrip)',
  convert.tuning_to_A4(convert.A4_to_tuning(432)), 432, 1e-9)
check('tuning_to_A4(0) == 440 (zero tuning offset is concert pitch)',
  convert.tuning_to_A4(0), 440)

// ── dB / power ───────────────────────────────────────────────────────────────
check('db_to_power(10) == 10 (10 dB is a power ratio of 10 by definition)',
  convert.db_to_power(10), 10, 1e-12)
check('db_to_power(power_to_db(42)) == 42 (power dB roundtrip)',
  convert.db_to_power(convert.power_to_db(42)), 42, 1e-9)

// ── frames / samples / time / blocks ────────────────────────────────────────
check('frames_to_samples(10) == 5120 (hop 512)', convert.frames_to_samples(10), 5120)
check('samples_to_frames(5120) == 10', convert.samples_to_frames(5120), 10)
check('samples_to_time(22050) == 1.0 s (sr 22050)', convert.samples_to_time(22050), 1)
check('time_to_samples(1.0) == 22050', convert.time_to_samples(1), 22050)
check('blocks_to_samples(2, 16, 512) == 2·16·512 == 16384',
  convert.blocks_to_samples(2, 16, 512), 16384)
check('blocks_to_time(2, 16, 512, 22050) == 16384/22050 s',
  convert.blocks_to_time(2, 16, 512, 22050), 16384 / 22050, 1e-12)
{
  const times = convert.times_like(5)
  check('times_like(5) == frames_to_time([0..4]) (5 frame times, hop 512, float32)',
    Array.from(times), [0, 1, 2, 3, 4].map((f) => Math.fround((f * 512) / 22050)))
  const samples = convert.samples_like(5)
  check('samples_like(5) == [0, 512, 1024, 1536, 2048]',
    Array.from(samples), [0, 512, 1024, 1536, 2048])
}

// ── frequency grids ──────────────────────────────────────────────────────────
{
  const cqtF = convert.cqt_frequencies(13)
  check('cqt_frequencies(13)[0] == C1 == 32.7032 Hz', cqtF[0], 32.7032, 1e-3)
  check('cqt_frequencies: bin 12 is exactly one octave up (2×fmin)',
    cqtF[12] / cqtF[0], 2, 1e-6)
  const melF = convert.mel_frequencies(40)
  check('mel_frequencies(40) spans [0, 11025] Hz exactly', [melF[0], melF[39]], [0, 11025])
  const ftf = convert.fourier_tempo_frequencies(22050, 384, 512)
  check('fourier_tempo_frequencies(384 win): 193 bins, DC bin == 0 BPM',
    [ftf.length, ftf[0]], [193, 0])
  check('fourier_tempo_frequencies bin 1 == 60·(sr/hop)/win ≈ 6.7291 BPM',
    ftf[1], (60 * (22050 / 512)) / 384, 1e-3)
  const tf = convert.tempo_frequencies(5)
  check('tempo_frequencies: lag 0 == Infinity, lag 1 == 60·sr/hop == 2583.98 BPM (librosa lag grid)',
    [tf[0] === Infinity, tf[1]], [true, (60 * 22050) / 512])
  check('tempo_frequencies lag 4 == 2583.98/4 == 645.996 BPM',
    tf[4], (60 * 22050) / 512 / 4, 1e-9)
  check('lag_to_tempo(tempo_to_lag(120)) == 120 (tempo/lag roundtrip)',
    convert.lag_to_tempo(convert.tempo_to_lag(120)), 120, 1e-9)
}

// ── frequency weightings (all normalized to 0 dB at 1 kHz by definition) ────
check('b_weighting(1000) == 0 dB', convert.b_weighting(1000), 0, 1e-3)
check('c_weighting(1000) == 0 dB', convert.c_weighting(1000), 0, 1e-3)
check('d_weighting(1000) == 0 dB', convert.d_weighting(1000), 0, 1e-3)
check('z_weighting is 0 dB everywhere (zero weighting)',
  [convert.z_weighting(123), convert.z_weighting(9999)], [0, 0])
check('A_weighting/B_weighting/C_weighting/D_weighting/Z_weighting aliases === lowercase',
  [convert.A_weighting, convert.B_weighting, convert.C_weighting,
    convert.D_weighting, convert.Z_weighting]
    .every((f, i) => f === [convert.a_weighting, convert.b_weighting,
      convert.c_weighting, convert.d_weighting, convert.z_weighting][i]), true)
check("frequency_weighting(1000, 'C') dispatches to c_weighting",
  convert.frequency_weighting(1000, 'C'), convert.c_weighting(1000))
check("multi_frequency_weighting([1000], ['Z','A','C']) rows == [z, a, c](1000)",
  convert.multi_frequency_weighting([1000], ['Z', 'A', 'C']),
  [[convert.z_weighting(1000)], [convert.a_weighting(1000)], [convert.c_weighting(1000)]])
check("perceptual_weighting(1000, 'A') == a_weighting(1000) (A-curve tier)",
  convert.perceptual_weighting(1000, 'A'), convert.a_weighting(1000))

summary('xa-convert — unit-conversion golden table')
