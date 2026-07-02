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
/** Array-like check covering plain arrays AND typed arrays (Float32Array etc.). */
const isArrayLike = (x) => Array.isArray(x) || (ArrayBuffer.isView(x) && !(x instanceof DataView))

export function frames_to_samples(frames, hop_length = 512, n_fft = null) {
  const offset = n_fft !== null ? Math.floor(n_fft / 2) : 0

  if (isArrayLike(frames)) {
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

  if (isArrayLike(samples)) {
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

  if (isArrayLike(samples)) {
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
  if (isArrayLike(times)) {
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
  if (isArrayLike(samples)) {
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
  if (isArrayLike(times)) {
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
  if (isArrayLike(frequencies)) {
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
  if (isArrayLike(notes)) {
    return notes.map((n) => 440.0 * Math.pow(2, (n - 69) / 12))
  }
  return 440.0 * Math.pow(2, (notes - 69) / 12)
}

/**
 * Convert MIDI note number to note name
 * @param {number|Array} midi - MIDI note number(s)
 * @param {boolean} octave - Include octave number (default: true)
 * @param {boolean} cents - Include cent deviation (default: false)
 * @returns {string|Array} Note name(s) (e.g., 'A4', 'C#5')
 */
export function midi_to_note(midi, octave = true, cents = false) {
  const note_names = ['C', 'C#', 'D', 'D#', 'E', 'F', 'F#', 'G', 'G#', 'A', 'A#', 'B']

  const convertSingle = (m) => {
    const note_int = Math.round(m)
    const note_name = note_names[note_int % 12]
    const octave_num = Math.floor(note_int / 12) - 1

    let result = note_name
    if (octave) {
      result += octave_num
    }

    if (cents) {
      const cent_deviation = Math.round((m - note_int) * 100)
      if (cent_deviation !== 0) {
        result += ` ${cent_deviation > 0 ? '+' : ''}${cent_deviation} cents`
      }
    }

    return result
  }

  if (isArrayLike(midi)) {
    return midi.map(convertSingle)
  }
  return convertSingle(midi)
}

/**
 * Convert note name to MIDI note number
 * @param {string|Array} note - Note name(s) (e.g., 'A4', 'C#5')
 * @param {boolean} round_midi - Round to integer MIDI values (default: true)
 * @returns {number|Array} MIDI note number(s)
 */
export function note_to_midi(note, round_midi = true) {
  const note_pattern = /^([A-G])(#|b)?(-?\d+)$/

  const convertSingle = (n) => {
    const match = n.match(note_pattern)

    if (!match) {
      throw new Error(`Invalid note format: ${n}`)
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

    return round_midi ? Math.round(midi) : midi
  }

  if (isArrayLike(note)) {
    return note.map(convertSingle)
  }
  return convertSingle(note)
}

/**
 * Convert Hz to note name
 * @param {number|Array} hz - Frequency in Hz
 * @param {boolean} octave - Include octave number (default: true)
 * @param {boolean} cents - Include cent deviation (default: false)
 * @returns {string|Array} Note name(s)
 */
export function hz_to_note(hz, octave = true, cents = false) {
  const midi = hz_to_midi(hz)
  return midi_to_note(midi, octave, cents)
}

/**
 * Convert note name to Hz
 * @param {string|Array} note - Note name(s) (e.g., 'A4', 'C#5')
 * @returns {number|Array} Frequency in Hz
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

  if (isArrayLike(frequencies)) {
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

  if (isArrayLike(octs)) {
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

  if (isArrayLike(amplitude)) {
    const db = Array.from(amplitude, log_spec)
    if (top_db == null) return db
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
  if (isArrayLike(db)) {
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
  if (isArrayLike(power) && isArrayLike(power[0])) {
    const db = power.map((band) => band.map(log_spec))

    // Find maximum dB for dynamic range compression
    let max_db = -Infinity
    for (const band of db) {
      for (const val of band) {
        max_db = Math.max(max_db, val)
      }
    }

    if (top_db == null) return db
    const threshold = max_db - top_db
    return db.map((band) => band.map((val) => Math.max(threshold, val)))
  }

  // Handle 1D array
  if (isArrayLike(power)) {
    const db = Array.from(power, log_spec)
    if (top_db == null) return db
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
  if (isArrayLike(db) && isArrayLike(db[0])) {
    return db.map((band) => band.map((val) => ref * Math.pow(10.0, val / 10.0)))
  }

  // Handle 1D array
  if (isArrayLike(db)) {
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
  const C0 = 12194.217 ** 2, C1 = 20.598997 ** 2, C2 = 107.65265 ** 2, C3 = 737.86223 ** 2
  const compute_a = (f) => {
    const f_sq = f * f
    const w = 2.0 + 20.0 * (
      Math.log10(C0) + 2 * Math.log10(f_sq)
      - Math.log10(f_sq + C0) - Math.log10(f_sq + C1)
      - 0.5 * Math.log10(f_sq + C2) - 0.5 * Math.log10(f_sq + C3)
    )
    return min_db == null ? w : Math.max(min_db, w)
  }

  if (isArrayLike(frequencies)) {
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

  if (isArrayLike(frequencies)) {
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
  const C0 = 12194.217 ** 2, C1 = 20.598997 ** 2
  const compute_c = (f) => {
    const f_sq = f * f
    const w = 0.062 + 20.0 * (
      Math.log10(C0) + Math.log10(f_sq)
      - Math.log10(f_sq + C0) - Math.log10(f_sq + C1)
    )
    return min_db == null ? w : Math.max(min_db, w)
  }

  if (isArrayLike(frequencies)) {
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
  const D0 = 8.3046305e-3 ** 2, D1 = 1018.7 ** 2, D2 = 1039.6 ** 2,
        D3 = 3136.5 ** 2, D4 = 3424 ** 2, D5 = 282.7 ** 2, D6 = 1160 ** 2
  const compute_d = (f) => {
    const f_sq = f * f
    const w = 20.0 * (
      0.5 * Math.log10(f_sq) - Math.log10(D0)
      + 0.5 * (
        Math.log10((D1 - f_sq) ** 2 + D2 * f_sq)
        - Math.log10((D3 - f_sq) ** 2 + D4 * f_sq)
        - Math.log10(D5 + f_sq) - Math.log10(D6 + f_sq)
      )
    )
    return min_db == null ? w : Math.max(min_db, w)
  }

  if (isArrayLike(frequencies)) {
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

  if (isArrayLike(bpm)) {
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

  if (isArrayLike(lag)) {
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
  if (isArrayLike(blocks)) {
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
  } else if (isArrayLike(X)) {
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
  } else if (isArrayLike(X)) {
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

/**
 * Convert Hz to Mel scale
 * @param {number|Array} frequencies - Frequencies in Hz (scalar or array)
 * @param {boolean} htk - Use HTK formula instead of Slaney
 * @returns {number|Array} Frequencies in Mel scale
 */
export function hz_to_mel(frequencies, htk = false) {
  if (isArrayLike(frequencies)) {
    return frequencies.map(f => hz_to_mel(f, htk));
  }

  if (htk) {
    // HTK formula
    return 2595.0 * Math.log10(1.0 + frequencies / 700.0);
  }

  // Slaney formula
  const f_min = 0.0;
  const f_sp = 200.0 / 3;
  const min_log_hz = 1000.0;
  const min_log_mel = (min_log_hz - f_min) / f_sp;
  const logstep = Math.log(6.4) / 27.0;

  if (frequencies >= min_log_hz) {
    return min_log_mel + Math.log(frequencies / min_log_hz) / logstep;
  } else {
    return (frequencies - f_min) / f_sp;
  }
}

/**
 * Convert Mel scale to Hz
 * @param {number|Array} mels - Frequencies in Mel scale (scalar or array)
 * @param {boolean} htk - Use HTK formula instead of Slaney
 * @returns {number|Array} Frequencies in Hz
 */
export function mel_to_hz(mels, htk = false) {
  if (isArrayLike(mels)) {
    return mels.map(m => mel_to_hz(m, htk));
  }

  if (htk) {
    // HTK formula
    return 700.0 * (Math.pow(10, mels / 2595.0) - 1.0);
  }

  // Slaney formula
  const f_min = 0.0;
  const f_sp = 200.0 / 3;
  const min_log_hz = 1000.0;
  const min_log_mel = (min_log_hz - f_min) / f_sp;
  const logstep = Math.log(6.4) / 27.0;

  if (mels >= min_log_mel) {
    return min_log_hz * Math.exp(logstep * (mels - min_log_mel));
  } else {
    return f_min + f_sp * mels;
  }
}

/**
 * Z-weighting (flat/no weighting) for frequency analysis
 * @param {number|Array} frequencies - Frequencies in Hz (scalar or array)
 * @param {number} min_db - Minimum dB value (not used for Z-weighting, included for API compatibility)
 * @returns {number|Array} Weighting values (all zeros for Z-weighting)
 */
export function z_weighting(frequencies, min_db = null) {
  if (isArrayLike(frequencies)) {
    return new Array(frequencies.length).fill(0);
  }
  return 0;
}

/**
 * Convert reference pitch A4 frequency to tuning deviation
 * @param {number|Array} A4 - Reference frequency for A4 in Hz (scalar or array)
 * @param {number} bins_per_octave - Number of bins per octave
 * @returns {number|Array} Tuning deviation in fractional bins
 */
export function A4_to_tuning(A4, bins_per_octave = 12) {
  if (isArrayLike(A4)) {
    return A4.map(a4 => A4_to_tuning(a4, bins_per_octave));
  }

  const ref_a4 = 440.0;
  return bins_per_octave * Math.log2(A4 / ref_a4);
}

/**
 * Convert tuning deviation to A4 reference frequency
 * @param {number|Array} tuning - Tuning deviation in fractional bins (scalar or array)
 * @param {number} bins_per_octave - Number of bins per octave
 * @returns {number|Array} Reference frequency for A4 in Hz
 */
export function tuning_to_A4(tuning, bins_per_octave = 12) {
  if (isArrayLike(tuning)) {
    return tuning.map(t => tuning_to_A4(t, bins_per_octave));
  }

  const ref_a4 = 440.0;
  return ref_a4 * Math.pow(2, tuning / bins_per_octave);
}

/**
 * General frequency weighting function (wrapper for A/B/C/D/Z weightings)
 * @param {number|Array} frequencies - Frequencies in Hz (scalar or array)
 * @param {string} kind - Weighting type: 'A', 'B', 'C', 'D', or 'Z'
 * @param {number} min_db - Minimum dB value
 * @returns {number|Array} Weighting values in dB
 */
export function frequency_weighting(frequencies, kind = 'A', min_db = -80.0) {
  const kindUpper = kind.toUpperCase();

  switch (kindUpper) {
    case 'A':
      return a_weighting(frequencies, min_db);
    case 'B':
      return b_weighting(frequencies, min_db);
    case 'C':
      return c_weighting(frequencies, min_db);
    case 'D':
      return d_weighting(frequencies, min_db);
    case 'Z':
      return z_weighting(frequencies, min_db);
    default:
      throw new Error(`Unknown weighting kind: ${kind}. Use 'A', 'B', 'C', 'D', or 'Z'`);
  }
}

/**
 * Compute multiple frequency weightings at once
 * @param {number|Array} frequencies - Frequencies in Hz (scalar or array)
 * @param {Array<string>} kinds - Array of weighting types, e.g., ['Z', 'A', 'C']
 * @param {number} min_db - Minimum dB value
 * @returns {Array} Array of weighting arrays, one per kind
 *
 * @example
 * multi_frequency_weighting([100, 1000, 10000], ['Z', 'A', 'C'])
 * // Returns [[0, 0, 0], [-19.1, 0, 0], [-0.2, 0, -0.2]]
 */
export function multi_frequency_weighting(frequencies, kinds = ['Z', 'A', 'C'], min_db = -80.0) {
  const freqArray = isArrayLike(frequencies) ? frequencies : [frequencies];

  return kinds.map(kind => {
    const weights = frequency_weighting(freqArray, kind, min_db);
    return isArrayLike(frequencies) ? weights : weights;
  });
}
