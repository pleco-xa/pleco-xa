/**
 * Port of librosa.effects
 * Audio effects and transformations
 * Librosa-compatible audio effects for JavaScript
 */

import { stft, istft } from './xa-fft.js'
import { hpss } from './xa-decompose.js'

/**
 * Time-stretch audio without changing pitch
 * Port of librosa.effects.time_stretch
 * @param {Float32Array} y - Audio time series
 * @param {number} rate - Stretch factor (> 1 = faster, < 1 = slower)
 * @param {number} n_fft - FFT size
 * @param {number} hop_length - Hop length
 * @returns {Float32Array} Time-stretched audio
 */
export function time_stretch(y, rate = 1.0, n_fft = 2048, hop_length = null) {
  if (hop_length === null) {
    hop_length = Math.floor(n_fft / 4)
  }

  const D = stft(y, n_fft, hop_length, null, 'hann', true, 'constant')
  const n_freq = D.length
  const n_frames = D[0] ? D[0].length : 0

  const D_stretch = phase_vocoder(D, rate, hop_length)

  return istft(D_stretch, hop_length, null, 'hann', true, y.length * rate)
}

/**
 * Phase vocoder for time stretching
 * @param {Array} D - Complex STFT [freq][time]
 * @param {number} rate - Time stretch rate
 * @param {number} hop_length - Hop length
 * @returns {Array} Time-stretched STFT
 */
function phase_vocoder(D, rate, hop_length) {
  const n_freq = D.length
  const n_frames = D[0] ? D[0].length : 0
  const n_frames_out = Math.floor(n_frames / rate)

  const D_out = Array(n_freq).fill(null).map(() => new Array(n_frames_out))

  const phase_advance = new Float32Array(n_freq)
  for (let f = 0; f < n_freq; f++) {
    phase_advance[f] = (2 * Math.PI * hop_length * f) / (n_freq * 2)
  }

  let phase_acc = new Float32Array(n_freq)

  for (let t_out = 0; t_out < n_frames_out; t_out++) {
    const t_in = t_out * rate
    const t_floor = Math.floor(t_in)
    const t_frac = t_in - t_floor

    if (t_floor >= n_frames - 1) break

    for (let f = 0; f < n_freq; f++) {
      const mag1 = Math.sqrt(D[f][t_floor].real ** 2 + D[f][t_floor].imag ** 2)
      const mag2 = Math.sqrt(D[f][t_floor + 1].real ** 2 + D[f][t_floor + 1].imag ** 2)
      const mag = mag1 * (1 - t_frac) + mag2 * t_frac

      const phase1 = Math.atan2(D[f][t_floor].imag, D[f][t_floor].real)
      const phase2 = Math.atan2(D[f][t_floor + 1].imag, D[f][t_floor + 1].real)

      const phase_diff = phase2 - phase1
      const phase_diff_wrapped = ((phase_diff + Math.PI) % (2 * Math.PI)) - Math.PI

      phase_acc[f] += phase_advance[f] + phase_diff_wrapped

      D_out[f][t_out] = {
        real: mag * Math.cos(phase_acc[f]),
        imag: mag * Math.sin(phase_acc[f])
      }
    }
  }

  return D_out
}

/**
 * Trim leading and trailing silence
 * Port of librosa.effects.trim
 * @param {Float32Array} y - Audio signal
 * @param {number} top_db - Threshold in dB below peak
 * @param {number} frame_length - Frame length for RMS
 * @param {number} hop_length - Hop length
 * @returns {Object} {trimmed: Float32Array, index: [start, end]}
 */
export function trim(y, top_db = 60, frame_length = 2048, hop_length = 512) {
  const n_frames = Math.floor((y.length - frame_length) / hop_length) + 1
  const rms = new Float32Array(n_frames)

  for (let i = 0; i < n_frames; i++) {
    const start = i * hop_length
    const frame = y.slice(start, start + frame_length)
    
    let sum = 0
    for (const sample of frame) {
      sum += sample * sample
    }
    rms[i] = Math.sqrt(sum / frame.length)
  }

  const max_rms = Math.max(...rms)
  const threshold = max_rms * Math.pow(10, -top_db / 20)

  let start_frame = 0
  for (let i = 0; i < n_frames; i++) {
    if (rms[i] > threshold) {
      start_frame = i
      break
    }
  }

  let end_frame = n_frames - 1
  for (let i = n_frames - 1; i >= 0; i--) {
    if (rms[i] > threshold) {
      end_frame = i
      break
    }
  }

  const start_sample = start_frame * hop_length
  const end_sample = Math.min((end_frame + 1) * hop_length + frame_length, y.length)

  return {
    trimmed: y.slice(start_sample, end_sample),
    index: [start_sample, end_sample]
  }
}

/**
 * Split audio on silence
 * Port of librosa.effects.split
 * @param {Float32Array} y - Audio signal
 * @param {number} top_db - Threshold in dB
 * @param {number} frame_length - Frame length
 * @param {number} hop_length - Hop length
 * @returns {Array} Array of [start, end] intervals for non-silent regions
 */
export function split(y, top_db = 60, frame_length = 2048, hop_length = 512) {
  const n_frames = Math.floor((y.length - frame_length) / hop_length) + 1
  const rms = new Float32Array(n_frames)

  for (let i = 0; i < n_frames; i++) {
    const start = i * hop_length
    const frame = y.slice(start, start + frame_length)
    
    let sum = 0
    for (const sample of frame) {
      sum += sample * sample
    }
    rms[i] = Math.sqrt(sum / frame.length)
  }

  const max_rms = Math.max(...rms)
  const threshold = max_rms * Math.pow(10, -top_db / 20)

  const intervals = []
  let in_segment = false
  let start_frame = 0

  for (let i = 0; i < n_frames; i++) {
    if (!in_segment && rms[i] > threshold) {
      in_segment = true
      start_frame = i
    } else if (in_segment && rms[i] <= threshold) {
      in_segment = false
      const start_sample = start_frame * hop_length
      const end_sample = Math.min(i * hop_length + frame_length, y.length)
      intervals.push([start_sample, end_sample])
    }
  }

  if (in_segment) {
    const start_sample = start_frame * hop_length
    intervals.push([start_sample, y.length])
  }

  return intervals
}

/**
 * Extract harmonic component
 * @param {Float32Array} y - Audio signal
 * @param {number} margin - HPSS margin
 * @returns {Float32Array} Harmonic component
 */
export function harmonic(y, margin = 1.0) {
  const result = hpss(y, null, [17, 17], 2.0, false, margin)
  return result.harmonic
}

/**
 * Extract percussive component
 * @param {Float32Array} y - Audio signal
 * @param {number} margin - HPSS margin
 * @returns {Float32Array} Percussive component
 */
export function percussive(y, margin = 1.0) {
  const result = hpss(y, null, [17, 17], 2.0, false, margin)
  return result.percussive
}

/**
 * Remix audio by rearranging intervals
 * Port of librosa.effects.remix
 * @param {Float32Array} y - Audio signal
 * @param {Array} intervals - Array of [start, end, output_start] tuples
 * @param {boolean} align_zeros - Align on zero crossings
 * @returns {Float32Array} Remixed audio
 */
export function remix(y, intervals, align_zeros = false) {
  let total_length = 0
  for (const interval of intervals) {
    const [start, end, out_start] = interval
    total_length = Math.max(total_length, out_start + (end - start))
  }

  const output = new Float32Array(total_length)

  for (const interval of intervals) {
    let [start, end, out_start] = interval

    if (align_zeros) {
      start = find_zero_crossing(y, start)
      end = find_zero_crossing(y, end)
    }

    const segment = y.slice(start, end)
    output.set(segment, out_start)
  }

  return output
}

function find_zero_crossing(y, pos) {
  if (pos <= 0 || pos >= y.length - 1) return pos

  if (y[pos] === 0) return pos

  const sign = Math.sign(y[pos])

  for (let i = pos; i < Math.min(pos + 100, y.length - 1); i++) {
    if (Math.sign(y[i]) !== sign && Math.sign(y[i + 1]) === -sign) {
      return Math.abs(y[i]) < Math.abs(y[i + 1]) ? i : i + 1
    }
  }

  for (let i = pos; i > Math.max(pos - 100, 0); i--) {
    if (Math.sign(y[i]) !== sign && Math.sign(y[i - 1]) === -sign) {
      return Math.abs(y[i]) < Math.abs(y[i - 1]) ? i : i - 1
    }
  }

  return pos
}

/**
 * Pre-emphasize audio signal
 * @param {Float32Array} y - Audio signal
 * @param {number} coef - Pre-emphasis coefficient (typical: 0.97)
 * @returns {Float32Array} Pre-emphasized signal
 */
export function preemphasis(y, coef = 0.97) {
  const output = new Float32Array(y.length)
  output[0] = y[0]

  for (let i = 1; i < y.length; i++) {
    output[i] = y[i] - coef * y[i - 1]
  }

  return output
}

/**
 * De-emphasize audio signal
 * @param {Float32Array} y - Pre-emphasized signal
 * @param {number} coef - Pre-emphasis coefficient
 * @returns {Float32Array} De-emphasized signal
 */
export function deemphasis(y, coef = 0.97) {
  const output = new Float32Array(y.length)
  output[0] = y[0]

  for (let i = 1; i < y.length; i++) {
    output[i] = y[i] + coef * output[i - 1]
  }

  return output
}
