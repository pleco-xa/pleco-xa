/**
 * Port of librosa.core.convert
 * Unit conversion and time/frequency transformations
 * Librosa-compatible conversion utilities for JavaScript
 */

/**
 * Convert frames to audio samples
 * @param {number|Array} frames - Frame indices
 * @param {number} hop_length - Hop length
 * @param {number} n_fft - FFT window size (optional)
 * @returns {number|Array} Sample indices
 */
export function frames_to_samples(frames, hop_length = 512, n_fft = null) {
  const offset = n_fft !== null ? Math.floor(n_fft / 2) : 0

  if (Array.isArray(frames)) {
    return frames.map((f) => f * hop_length + offset)
  }
  return frames * hop_length + offset
}

/**
 * Convert audio samples to frame indices
 * @param {number|Array} samples - Sample indices
 * @param {number} hop_length - Hop length
 * @param {number} n_fft - FFT window size (optional)
 * @returns {number|Array} Frame indices
 */
export function samples_to_frames(samples, hop_length = 512, n_fft = null) {
  const offset = n_fft !== null ? Math.floor(n_fft / 2) : 0

  if (Array.isArray(samples)) {
    return samples.map((s) => Math.max(0, Math.floor((s - offset) / hop_length)))
  }
  return Math.max(0, Math.floor((samples - offset) / hop_length))
}

/**
 * Convert frame indices to time (seconds)
 * @param {number|Array} frames - Frame indices
 * @param {number} sr - Sample rate
 * @param {number} hop_length - Hop length
 * @param {number} n_fft - FFT window size (optional)
 * @returns {number|Array} Time in seconds
 */
export function frames_to_time(frames, sr = 22050, hop_length = 512, n_fft = null) {
  const samples = frames_to_samples(frames, hop_length, n_fft)

  if (Array.isArray(samples)) {
    return samples.map((s) => s / sr)
  }
  return samples / sr
}

/**
 * Convert time (seconds) to frame indices
 * @param {number|Array} times - Time in seconds
 * @param {number} sr - Sample rate
 * @param {number} hop_length - Hop length
 * @param {number} n_fft - FFT window size (optional)
 * @returns {number|Array} Frame indices
 */
export function time_to_frames(times, sr = 22050, hop_length = 512, n_fft = null) {
  if (Array.isArray(times)) {
    const samples = times.map((t) => Math.round(t * sr))
    return samples_to_frames(samples, hop_length, n_fft)
  }
  const samples = Math.round(times * sr)
  return samples_to_frames(samples, hop_length, n_fft)
}

/**
 * Convert sample indices to time (seconds)
 * @param {number|Array} samples - Sample indices
 * @param {number} sr - Sample rate
 * @returns {number|Array} Time in seconds
 */
export function samples_to_time(samples, sr = 22050) {
  if (Array.isArray(samples)) {
    return samples.map((s) => s / sr)
  }
  return samples / sr
}

/**
 * Convert time (seconds) to sample indices
 * @param {number|Array} times - Time in seconds
 * @param {number} sr - Sample rate
 * @returns {number|Array} Sample indices
 */
export function time_to_samples(times, sr = 22050) {
  if (Array.isArray(times)) {
    return times.map((t) => Math.round(t * sr))
  }
  return Math.round(times * sr)
}

/**
 * Convert Hz to MIDI note number
 * @param {number|Array} frequencies - Frequency in Hz
 * @returns {number|Array} MIDI note number
 */
export function hz_to_midi(frequencies) {
  if (Array.isArray(frequencies)) {
    return frequencies.map((f) => 12 * Math.log2(f / 440.0) + 69)
  }
  return 12 * Math.log2(frequencies / 440.0) + 69
}

/**
 * Convert MIDI note number to Hz
 * @param {number|Array} notes - MIDI note number
 * @returns {number|Array} Frequency in Hz
 */
export function midi_to_hz(notes) {
  if (Array.isArray(notes)) {
    return notes.map((n) => 440.0 * Math.pow(2, (n - 69) / 12))
  }
  return 440.0 * Math.pow(2, (notes - 69) / 12)
}

/**
 * Convert MIDI note number to note name
 * @param {number} midi - MIDI note number
 * @param {boolean} octave - Include octave number (default: true)
 * @param {boolean} cents - Include cent deviation (default: false)
 * @returns {string} Note name (e.g., 'A4', 'C#5')
 */
export function midi_to_note(midi, octave = true, cents = false) {
  const note_names = ['C', 'C#', 'D', 'D#', 'E', 'F', 'F#', 'G', 'G#', 'A', 'A#', 'B']

  const note_int = Math.round(midi)
  const note_name = note_names[note_int % 12]
  const octave_num = Math.floor(note_int / 12) - 1

  let result = note_name
  if (octave) {
    result += octave_num
  }

  if (cents) {
    const cent_deviation = Math.round((midi - note_int) * 100)
    if (cent_deviation !== 0) {
      result += ` ${cent_deviation > 0 ? '+' : ''}${cent_deviation} cents`
    }
  }

  return result
}

/**
 * Convert note name to MIDI note number
 * @param {string} note - Note name (e.g., 'A4', 'C#5')
 * @returns {number} MIDI note number
 */
export function note_to_midi(note) {
  const note_pattern = /^([A-G])(#|b)?(-?\d+)$/
  const match = note.match(note_pattern)

  if (!match) {
    throw new Error(`Invalid note format: ${note}`)
  }

  const note_names = {
    'C': 0, 'D': 2, 'E': 4, 'F': 5, 'G': 7, 'A': 9, 'B': 11
  }

  const [, letter, accidental, octave] = match
  let midi = note_names[letter] + (parseInt(octave) + 1) * 12

  if (accidental === '#') {
    midi += 1
  } else if (accidental === 'b') {
    midi -= 1
  }

  return midi
}

/**
 * Convert Hz to note name
 * @param {number} hz - Frequency in Hz
 * @param {boolean} octave - Include octave number (default: true)
 * @param {boolean} cents - Include cent deviation (default: false)
 * @returns {string} Note name
 */
export function hz_to_note(hz, octave = true, cents = false) {
  const midi = hz_to_midi(hz)
  return midi_to_note(midi, octave, cents)
}

/**
 * Convert note name to Hz
 * @param {string} note - Note name (e.g., 'A4', 'C#5')
 * @returns {number} Frequency in Hz
 */
export function note_to_hz(note) {
  const midi = note_to_midi(note)
  return midi_to_hz(midi)
}

/**
 * Convert Hz to octaves (relative to C0)
 * @param {number|Array} frequencies - Frequency in Hz
 * @param {number} tuning - Tuning frequency for A4 (default: 440.0)
 * @returns {number|Array} Octaves
 */
export function hz_to_octs(frequencies, tuning = 440.0) {
  const a4_octs = 4 + 9 / 12  // A4 in octaves from C0

  if (Array.isArray(frequencies)) {
    return frequencies.map((f) => Math.log2(f / tuning) + a4_octs)
  }
  return Math.log2(frequencies / tuning) + a4_octs
}

/**
 * Convert octaves to Hz
 * @param {number|Array} octs - Octaves (relative to C0)
 * @param {number} tuning - Tuning frequency for A4 (default: 440.0)
 * @returns {number|Array} Frequency in Hz
 */
export function octs_to_hz(octs, tuning = 440.0) {
  const a4_octs = 4 + 9 / 12

  if (Array.isArray(octs)) {
    return octs.map((o) => tuning * Math.pow(2, o - a4_octs))
  }
  return tuning * Math.pow(2, (octs - a4_octs))
}

/**
 * Convert amplitude to decibels
 * @param {number|Array} amplitude - Amplitude value(s)
 * @param {number} ref - Reference amplitude (default: 1.0)
 * @param {number} amin - Minimum amplitude threshold (default: 1e-5)
 * @param {number} top_db - Maximum dB range (default: 80.0)
 * @returns {number|Array} dB value(s)
 */
export function amplitude_to_db(amplitude, ref = 1.0, amin = 1e-5, top_db = 80.0) {
  const log_spec = (val) => {
    const mag = Math.max(amin, Math.abs(val))
    return 20 * Math.log10(mag / ref)
  }

  if (Array.isArray(amplitude)) {
    const db = amplitude.map(log_spec)
    const max_db = Math.max(...db)
    const threshold = max_db - top_db
    return db.map((val) => Math.max(threshold, val))
  }

  return log_spec(amplitude)
}

/**
 * Convert decibels to amplitude
 * @param {number|Array} db - dB value(s)
 * @param {number} ref - Reference amplitude (default: 1.0)
 * @returns {number|Array} Amplitude value(s)
 */
export function db_to_amplitude(db, ref = 1.0) {
  if (Array.isArray(db)) {
    return db.map((val) => ref * Math.pow(10.0, val / 20.0))
  }
  return ref * Math.pow(10.0, db / 20.0)
}

/**
 * Convert power to decibels
 * @param {number|Array|Array<Array>} power - Power value(s) or power spectrogram
 * @param {number} ref - Reference power (default: 1.0)
 * @param {number} amin - Minimum power threshold (default: 1e-10)
 * @param {number} top_db - Maximum dB range (default: 80.0)
 * @returns {number|Array|Array<Array>} dB value(s)
 */
export function power_to_db(power, ref = 1.0, amin = 1e-10, top_db = 80.0) {
  const log_spec = (val) => {
    const mag = Math.max(amin, Math.abs(val))
    return 10 * Math.log10(mag / ref)
  }

  // Handle 2D array (spectrogram)
  if (Array.isArray(power) && Array.isArray(power[0])) {
    const db = power.map((band) => band.map(log_spec))

    // Find maximum dB for dynamic range compression
    let max_db = -Infinity
    for (const band of db) {
      for (const val of band) {
        max_db = Math.max(max_db, val)
      }
    }

    const threshold = max_db - top_db
    return db.map((band) => band.map((val) => Math.max(threshold, val)))
  }

  // Handle 1D array
  if (Array.isArray(power)) {
    const db = power.map(log_spec)
    const max_db = Math.max(...db)
    const threshold = max_db - top_db
    return db.map((val) => Math.max(threshold, val))
  }

  // Handle scalar
  return log_spec(power)
}

/**
 * Convert decibels to power
 * @param {number|Array|Array<Array>} db - dB value(s) or dB spectrogram
 * @param {number} ref - Reference power (default: 1.0)
 * @returns {number|Array|Array<Array>} Power value(s)
 */
export function db_to_power(db, ref = 1.0) {
  // Handle 2D array (spectrogram)
  if (Array.isArray(db) && Array.isArray(db[0])) {
    return db.map((band) => band.map((val) => ref * Math.pow(10.0, val / 10.0)))
  }

  // Handle 1D array
  if (Array.isArray(db)) {
    return db.map((val) => ref * Math.pow(10.0, val / 10.0))
  }

  // Handle scalar
  return ref * Math.pow(10.0, db / 10.0)
}

/**
 * A-weighting of frequency
 * @param {number|Array} frequencies - Frequency in Hz
 * @param {number} min_db - Minimum dB value (default: -80.0)
 * @returns {number|Array} A-weighting in dB
 */
export function a_weighting(frequencies, min_db = -80.0) {
  const compute_a = (f) => {
    const f_sq = f * f
    const num = Math.pow(12194, 2) * Math.pow(f_sq, 2)
    const den = (f_sq + Math.pow(20.6, 2)) *
                Math.sqrt((f_sq + Math.pow(107.7, 2)) * (f_sq + Math.pow(737.9, 2))) *
                (f_sq + Math.pow(12194, 2))

    return Math.max(min_db, 2.0 + 20 * Math.log10(num / den))
  }

  if (Array.isArray(frequencies)) {
    return frequencies.map(compute_a)
  }
  return compute_a(frequencies)
}

/**
 * B-weighting of frequency
 * @param {number|Array} frequencies - Frequency in Hz
 * @param {number} min_db - Minimum dB value (default: -80.0)
 * @returns {number|Array} B-weighting in dB
 */
export function b_weighting(frequencies, min_db = -80.0) {
  const compute_b = (f) => {
    const f_sq = f * f
    const num = Math.pow(12194, 2) * Math.pow(f, 3)
    const den = (f_sq + Math.pow(20.6, 2)) *
                Math.sqrt(f_sq + Math.pow(158.5, 2)) *
                (f_sq + Math.pow(12194, 2))

    return Math.max(min_db, 0.17 + 20 * Math.log10(num / den))
  }

  if (Array.isArray(frequencies)) {
    return frequencies.map(compute_b)
  }
  return compute_b(frequencies)
}

/**
 * C-weighting of frequency
 * @param {number|Array} frequencies - Frequency in Hz
 * @param {number} min_db - Minimum dB value (default: -80.0)
 * @returns {number|Array} C-weighting in dB
 */
export function c_weighting(frequencies, min_db = -80.0) {
  const compute_c = (f) => {
    const f_sq = f * f
    const num = Math.pow(12194, 2) * f_sq
    const den = (f_sq + Math.pow(20.6, 2)) * (f_sq + Math.pow(12194, 2))

    return Math.max(min_db, 0.06 + 20 * Math.log10(num / den))
  }

  if (Array.isArray(frequencies)) {
    return frequencies.map(compute_c)
  }
  return compute_c(frequencies)
}

/**
 * D-weighting of frequency
 * @param {number|Array} frequencies - Frequency in Hz
 * @param {number} min_db - Minimum dB value (default: -80.0)
 * @returns {number|Array} D-weighting in dB
 */
export function d_weighting(frequencies, min_db = -80.0) {
  const compute_d = (f) => {
    const h_f = (
      (Math.pow(1037918.48 - f * f, 2) + 1080768.16 * f * f) /
      (Math.pow(9837328 - f * f, 2) + 11723776 * f * f)
    )
    const result = (f / (6.8966888496476e-5)) * Math.sqrt(h_f / ((f * f + 79919.29) * (f * f + 1345600)))

    return Math.max(min_db, 20 * Math.log10(result))
  }

  if (Array.isArray(frequencies)) {
    return frequencies.map(compute_d)
  }
  return compute_d(frequencies)
}

/**
 * Perceptual weighting curve (approximate)
 * @param {number|Array} frequencies - Frequency in Hz
 * @param {string} kind - Weighting kind ('A', 'B', 'C', 'D') (default: 'A')
 * @param {number} min_db - Minimum dB value (default: -80.0)
 * @returns {number|Array} Perceptual weighting in dB
 */
export function perceptual_weighting(frequencies, kind = 'A', min_db = -80.0) {
  switch (kind.toUpperCase()) {
    case 'A':
      return a_weighting(frequencies, min_db)
    case 'B':
      return b_weighting(frequencies, min_db)
    case 'C':
      return c_weighting(frequencies, min_db)
    case 'D':
      return d_weighting(frequencies, min_db)
    default:
      throw new Error(`Unknown weighting kind: ${kind}. Must be 'A', 'B', 'C', or 'D'`)
  }
}

/**
 * Compute FFT frequencies
 * @param {number} sr - Sample rate
 * @param {number} n_fft - FFT size
 * @returns {Float32Array} Frequency bins in Hz
 */
export function fft_frequencies(sr = 22050, n_fft = 2048) {
  const n_bins = Math.floor(n_fft / 2) + 1
  const freqs = new Float32Array(n_bins)
  for (let i = 0; i < n_bins; i++) {
    freqs[i] = (i * sr) / n_fft
  }
  return freqs
}

/**
 * Compute CQT (Constant-Q Transform) frequencies
 * @param {number} n_bins - Number of frequency bins
 * @param {number} fmin - Minimum frequency (default: C1 ~= 32.70 Hz)
 * @param {number} bins_per_octave - Number of bins per octave (default: 12)
 * @param {number} tuning - Tuning offset in fractions of a bin (default: 0.0)
 * @returns {Float32Array} CQT frequency bins in Hz
 */
export function cqt_frequencies(n_bins, fmin = 32.703195662574829, bins_per_octave = 12, tuning = 0.0) {
  const freqs = new Float32Array(n_bins)
  const correction = Math.pow(2.0, tuning / bins_per_octave)

  for (let i = 0; i < n_bins; i++) {
    freqs[i] = fmin * correction * Math.pow(2.0, i / bins_per_octave)
  }

  return freqs
}

/**
 * Compute Fourier tempogram frequencies
 * @param {number} sr - Sample rate
 * @param {number} win_length - Window length for temporal autocorrelation
 * @param {number} hop_length - Hop length for frame analysis (default: 512)
 * @returns {Float32Array} Tempo frequencies in BPM
 */
export function fourier_tempo_frequencies(sr = 22050, win_length = 384, hop_length = 512) {
  const n_bins = Math.floor(win_length / 2) + 1
  const freqs = new Float32Array(n_bins)

  // Convert from cycles per window to cycles per second (Hz)
  for (let i = 0; i < n_bins; i++) {
    const freq_hz = (i * sr) / (win_length * hop_length)
    // Convert Hz to BPM (beats per minute)
    freqs[i] = freq_hz * 60.0
  }

  return freqs
}

/**
 * Convert BPM to lag (in frames)
 * @param {number|Array} bpm - Tempo in BPM
 * @param {number} sr - Sample rate
 * @param {number} hop_length - Hop length
 * @returns {number|Array} Lag in frames
 */
export function tempo_to_lag(bpm, sr = 22050, hop_length = 512) {
  const compute_lag = (tempo) => {
    const beats_per_second = tempo / 60.0
    const samples_per_beat = sr / beats_per_second
    return samples_per_beat / hop_length
  }

  if (Array.isArray(bpm)) {
    return bpm.map(compute_lag)
  }
  return compute_lag(bpm)
}

/**
 * Convert lag (in frames) to BPM
 * @param {number|Array} lag - Lag in frames
 * @param {number} sr - Sample rate
 * @param {number} hop_length - Hop length
 * @returns {number|Array} Tempo in BPM
 */
export function lag_to_tempo(lag, sr = 22050, hop_length = 512) {
  const compute_tempo = (l) => {
    const samples_per_beat = l * hop_length
    const beats_per_second = sr / samples_per_beat
    return beats_per_second * 60.0
  }

  if (Array.isArray(lag)) {
    return lag.map(compute_tempo)
  }
  return compute_tempo(lag)
}

/**
 * Convert block indices to frame indices
 * @param {number|Array} blocks - Block indices
 * @param {number} block_length - Block length in frames
 * @returns {number|Array} Frame indices
 */
export function blocks_to_frames(blocks, block_length) {
  if (Array.isArray(blocks)) {
    return blocks.map(b => b * block_length)
  }
  return blocks * block_length
}

/**
 * Convert block indices to sample indices
 * @param {number|Array} blocks - Block indices
 * @param {number} block_length - Block length in frames
 * @param {number} hop_length - Hop length
 * @returns {number|Array} Sample indices
 */
export function blocks_to_samples(blocks, block_length, hop_length) {
  const frames = blocks_to_frames(blocks, block_length)
  return frames_to_samples(frames, hop_length)
}

/**
 * Convert block indices to time (in seconds)
 * @param {number|Array} blocks - Block indices
 * @param {number} block_length - Block length in frames
 * @param {number} hop_length - Hop length
 * @param {number} sr - Sample rate
 * @returns {number|Array} Time in seconds
 */
export function blocks_to_time(blocks, block_length, hop_length, sr) {
  const frames = blocks_to_frames(blocks, block_length)
  return frames_to_time(frames, sr, hop_length)
}

/**
 * Compute the frequencies (in BPM) corresponding to tempogram bins
 * @param {number} n_bins - Number of tempo bins
 * @param {number} hop_length - Hop length
 * @param {number} sr - Sample rate
 * @returns {Float32Array} Tempo frequencies in BPM
 */
export function tempo_frequencies(n_bins, hop_length = 512, sr = 22050) {
  const freqs = new Float32Array(n_bins)
  const win_length = 2 * (n_bins - 1)

  for (let i = 0; i < n_bins; i++) {
    // Fourier frequency for this bin
    const freq_hz = (sr * i) / (hop_length * win_length)
    // Convert to BPM
    freqs[i] = freq_hz * 60.0
  }

  return freqs
}

/**
 * Return an array of time values to match the time axis from a feature matrix
 * @param {Array|number} X - Feature matrix or number of frames
 * @param {number} sr - Sample rate
 * @param {number} hop_length - Hop length
 * @param {number|null} n_fft - FFT size
 * @param {number} axis - Time axis (default -1)
 * @returns {Float32Array} Array of time values
 */
export function times_like(X, sr = 22050, hop_length = 512, n_fft = null, axis = -1) {
  let n_frames

  if (typeof X === 'number') {
    n_frames = X
  } else if (Array.isArray(X)) {
    // Assume [freq x time] format (Librosa default)
    n_frames = X[0] ? X[0].length : 0
  } else {
    throw new Error('X must be a number or array')
  }

  const frames = new Float32Array(n_frames)
  for (let i = 0; i < n_frames; i++) {
    frames[i] = i
  }

  return frames_to_time(frames, sr, hop_length, n_fft)
}

/**
 * Return an array of sample indices to match the time axis from a feature matrix
 * @param {Array|number} X - Feature matrix or number of frames
 * @param {number} hop_length - Hop length
 * @param {number|null} n_fft - FFT size
 * @param {number} axis - Time axis (default -1)
 * @returns {Int32Array} Array of sample indices
 */
export function samples_like(X, hop_length = 512, n_fft = null, axis = -1) {
  let n_frames

  if (typeof X === 'number') {
    n_frames = X
  } else if (Array.isArray(X)) {
    n_frames = X[0] ? X[0].length : 0
  } else {
    throw new Error('X must be a number or array')
  }

  const frames = new Int32Array(n_frames)
  for (let i = 0; i < n_frames; i++) {
    frames[i] = i
  }

  return frames_to_samples(frames, hop_length, n_fft)
}

/**
 * Compute the mel-scale frequencies
 * @param {number} n_mels - Number of mel bins
 * @param {number} fmin - Minimum frequency
 * @param {number} fmax - Maximum frequency
 * @param {boolean} htk - Use HTK formula
 * @returns {Float32Array} Mel frequencies in Hz
 */
export function mel_frequencies(n_mels = 128, fmin = 0.0, fmax = 11025.0, htk = false) {
  const mel_min = hz_to_mel(fmin, htk)
  const mel_max = hz_to_mel(fmax, htk)

  const mels = new Float32Array(n_mels)
  const step = (mel_max - mel_min) / (n_mels - 1)

  for (let i = 0; i < n_mels; i++) {
    const mel = mel_min + i * step
    mels[i] = mel_to_hz(mel, htk)
  }

  return mels
}
