/**
 * Pleco-XA effects domain (Wave 5A).
 *
 * Canonical home for trim / split / preemphasis / deemphasis / remix /
 * phase_vocoder / time_stretch / pitch_shift and the waveform-level
 * hpss / harmonic / percussive wrappers. The legacy xa-trim / xa-split /
 * xa-remix / xa-filters / xa-processing / xa-advanced modules are shims
 * that delegate here.
 *
 * Validated against committed reference fixtures:
 *   - trim, split, preemphasis
 *   - phase vocoder (rates 0.5 and 2.0)
 */

import { stft, istft } from '../scripts/xa-fft.js'
import { resample, zeroCrossings } from '../scripts/xa-audioio.js'
import { hpss as hpssSpectrogram } from '../decompose/index.js'

/** amin used by amplitude_to_db (amplitude domain). */
const AMIN = 1e-5

/* ────────────────────────────────────────────────────────────────────────
 * Silence framing (_signal_to_frame_nonsilent)
 * ──────────────────────────────────────────────────────────────────────── */

/**
 * Frame RMS envelope (center=true, zero pad).
 * @param {Float32Array|Float64Array|number[]} y - Mono signal
 * @param {number} frame_length - Samples per analysis frame
 * @param {number} hop_length - Samples between frames
 * @returns {Float64Array} Per-frame RMS
 */
function frameRms(y, frame_length, hop_length) {
  const n = y.length
  const pad = Math.floor(frame_length / 2)
  const paddedLen = n + 2 * pad
  const nFrames = paddedLen >= frame_length
    ? Math.floor((paddedLen - frame_length) / hop_length) + 1
    : 0
  const out = new Float64Array(nFrames)
  for (let t = 0; t < nFrames; t++) {
    const start = t * hop_length - pad
    const lo = Math.max(0, start)
    const hi = Math.min(n, start + frame_length)
    let sum = 0
    for (let i = lo; i < hi; i++) sum += y[i] * y[i]
    out[t] = Math.sqrt(sum / frame_length)
  }
  return out
}

/**
 * Per-frame non-silence indicator. Reference: frame RMS power (max frame RMS
 * by default — NOT peak sample amplitude, which over-trims by 6–15 dB).
 * @param {Float32Array} y - Mono signal
 * @param {Object} opts - { top_db, ref, frame_length, hop_length }
 * @returns {Uint8Array} 1 where the frame is non-silent
 */
function nonSilentFrames(y, { top_db, ref, frame_length, hop_length }) {
  const rms = frameRms(y, frame_length, hop_length)

  let refValue
  if (typeof ref === 'function') {
    refValue = ref(rms)
  } else if (ref === null || ref === undefined) {
    // np.max over the RMS envelope, spread-free (stack-safe on long audio)
    refValue = 0
    for (let i = 0; i < rms.length; i++) if (rms[i] > refValue) refValue = rms[i]
  } else {
    refValue = Math.abs(ref)
  }

  // amplitude_to_db(rms, ref=refValue, top_db=None):
  //   20*log10(max(amin, rms)) - 20*log10(max(amin, ref)); non-silent when > -top_db
  const refDb = 20 * Math.log10(Math.max(AMIN, refValue))
  const out = new Uint8Array(rms.length)
  for (let i = 0; i < rms.length; i++) {
    const db = 20 * Math.log10(Math.max(AMIN, rms[i])) - refDb
    out[i] = db > -top_db ? 1 : 0
  }
  return out
}

/**
 * Trim leading and trailing silence from an audio signal.
 *
 * @param {Float32Array} y - Mono audio signal
 * @param {Object} [options]
 * @param {number} [options.top_db=60] - Threshold (dB) below reference to call silence
 * @param {number|Function|null} [options.ref=null] - Reference amplitude; default max frame RMS
 * @param {number} [options.frame_length=2048]
 * @param {number} [options.hop_length=512]
 * @returns {[Float32Array, number[]]} [y_trimmed, [start, end]] with
 *   y_trimmed === y.slice(start, end). All-silent input yields an EMPTY
 *   slice ([0, 0]).
 */
export function trim(y, { top_db = 60, ref = null, frame_length = 2048, hop_length = 512 } = {}) {
  const nonSilent = nonSilentFrames(y, { top_db, ref, frame_length, hop_length })

  let first = -1
  let last = -1
  for (let i = 0; i < nonSilent.length; i++) {
    if (nonSilent[i]) {
      if (first < 0) first = i
      last = i
    }
  }

  let start = 0
  let end = 0
  if (first >= 0) {
    start = first * hop_length
    end = Math.min(y.length, (last + 1) * hop_length)
  }

  return [y.slice(start, end), [start, end]]
}

/**
 * Split an audio signal into non-silent intervals.
 * Frame-edge sample indices, capped to y.length.
 *
 * @param {Float32Array} y - Mono audio signal
 * @param {Object} [options] - Same options as trim()
 * @returns {Array<number[]>} Array of [start, end) sample intervals; [] when all-silent
 */
export function split(y, { top_db = 60, ref = null, frame_length = 2048, hop_length = 512 } = {}) {
  const nonSilent = nonSilentFrames(y, { top_db, ref, frame_length, hop_length })
  const m = nonSilent.length

  const edges = []
  if (m > 0 && nonSilent[0]) edges.push(0)
  for (let i = 1; i < m; i++) {
    if (nonSilent[i] !== nonSilent[i - 1]) edges.push(i)
  }
  if (m > 0 && nonSilent[m - 1]) edges.push(m)

  const intervals = []
  for (let j = 0; j + 1 < edges.length; j += 2) {
    intervals.push([
      Math.min(edges[j] * hop_length, y.length),
      Math.min(edges[j + 1] * hop_length, y.length),
    ])
  }
  return intervals
}

/* ────────────────────────────────────────────────────────────────────────
 * Pre-emphasis / de-emphasis (scipy.signal.lfilter state semantics)
 * ──────────────────────────────────────────────────────────────────────── */

/**
 * Pre-emphasis filter y[n] = x[n] - coef*x[n-1], including its exact zi
 * handling: zi is the raw lfilter delay state, so out[0] = x[0] + zi, and the
 * default zi = 2*x[0] - x[1] (verified against the fixture).
 *
 * @param {Float32Array} y - Audio signal (>= 2 samples when zi is defaulted)
 * @param {Object} [options]
 * @param {number} [options.coef=0.97]
 * @param {number|null} [options.zi=null] - Initial filter state; chain blocks by passing the previous zf
 * @param {boolean} [options.return_zf=false]
 * @returns {Float32Array|[Float32Array, number]} Filtered signal, or [signal, zf]
 */
export function preemphasis(y, { coef = 0.97, zi = null, return_zf = false } = {}) {
  const n = y.length
  if (n === 0) throw new Error('preemphasis: input signal is empty')
  if ((zi === null || zi === undefined) && n < 2) {
    throw new Error('preemphasis: default zi needs at least 2 samples (pass zi explicitly)')
  }
  const z = zi === null || zi === undefined ? 2 * y[0] - y[1] : zi

  const out = new Float32Array(n)
  out[0] = y[0] + z
  for (let i = 1; i < n; i++) out[i] = y[i] - coef * y[i - 1]
  const zf = -coef * y[n - 1]

  return return_zf ? [out, zf] : out
}

/**
 * De-emphasis filter x[n] = y[n] + coef*x[n-1] — exact inverse of
 * preemphasis() including the default-zi extrapolation correction,
 * so deemphasis(preemphasis(x)) round-trips to x.
 *
 * @param {Float32Array} y - Pre-emphasized signal
 * @param {Object} [options] - Same options as preemphasis()
 * @returns {Float32Array|[Float32Array, number]} Filtered signal, or [signal, zf]
 */
export function deemphasis(y, { coef = 0.97, zi = null, return_zf = false } = {}) {
  const n = y.length
  if (n === 0) throw new Error('deemphasis: input signal is empty')
  if ((zi === null || zi === undefined) && n < 2) {
    throw new Error('deemphasis: default zi needs at least 2 samples (pass zi explicitly)')
  }

  const raw = new Float64Array(n)
  raw[0] = y[0] + (zi === null || zi === undefined ? 0 : zi)
  for (let i = 1; i < n; i++) raw[i] = y[i] + coef * raw[i - 1]
  const zf = coef * raw[n - 1]

  const out = new Float32Array(n)
  if (zi === null || zi === undefined) {
    // Remove the response to the implied preemphasis init (2x0 - x1)
    const c0 = ((2 - coef) * y[0] - y[1]) / (3 - coef)
    let decay = 1
    for (let i = 0; i < n; i++) {
      out[i] = raw[i] - c0 * decay
      decay *= coef
    }
  } else {
    for (let i = 0; i < n; i++) out[i] = raw[i]
  }

  return return_zf ? [out, zf] : out
}

/* ────────────────────────────────────────────────────────────────────────
 * Remix
 * ──────────────────────────────────────────────────────────────────────── */

/**
 * Nearest value lookup in a sorted Int32-ish array (match_events
 * for sorted targets; ties resolve to the smaller value, like np.argmin).
 * @param {number[]} sorted - Ascending values
 * @param {number} v - Query
 * @returns {number} Element of `sorted` closest to v
 */
function nearestSorted(sorted, v) {
  let lo = 0
  let hi = sorted.length - 1
  while (lo < hi) {
    const mid = (lo + hi) >> 1
    if (sorted[mid] < v) lo = mid + 1
    else hi = mid
  }
  // sorted[lo] is the first element >= v; compare with its predecessor
  if (lo > 0 && Math.abs(sorted[lo - 1] - v) <= Math.abs(sorted[lo] - v)) {
    return sorted[lo - 1]
  }
  return sorted[lo]
}

/**
 * Remix an audio signal by re-ordering time intervals.
 * Intervals are concatenated in CALLER ORDER
 * (no sorting — reordering, e.g. beat reversal, is the whole point) and, by
 * default, interval boundaries snap to the nearest zero crossing of the
 * whole signal (match_events semantics), never shrinking segments
 * to their internal crossings.
 *
 * @param {Float32Array} y - Mono audio signal
 * @param {Array<number[]>} intervals - [start, end) sample intervals, any order
 * @param {Object} [options]
 * @param {boolean} [options.align_zeros=true] - Snap boundaries to zero crossings of y
 * @returns {Float32Array} Concatenation of the (aligned) segments in caller order
 * @throws {Error} On out-of-bounds or non-finite interval endpoints
 */
export function remix(y, intervals, { align_zeros = true } = {}) {
  let zeros = null
  if (align_zeros) {
    const zc = zeroCrossings(y)
    zeros = []
    for (let i = 0; i < zc.length; i++) if (zc[i]) zeros.push(i)
    zeros.push(y.length) // force end-of-signal onto zeros
  }

  const segments = []
  let total = 0
  for (const interval of intervals) {
    let start = Math.floor(interval[0])
    let end = Math.floor(interval[1])
    if (!Number.isFinite(start) || !Number.isFinite(end) || start < 0 || end > y.length) {
      throw new Error(`remix: interval [${interval[0]}, ${interval[1]}] exceeds audio bounds [0, ${y.length}]`)
    }
    if (zeros) {
      start = nearestSorted(zeros, start)
      end = nearestSorted(zeros, end)
    }
    const seg = y.slice(start, Math.max(start, end))
    segments.push(seg)
    total += seg.length
  }

  const out = new Float32Array(total)
  let offset = 0
  for (const seg of segments) {
    out.set(seg, offset)
    offset += seg.length
  }
  return out
}

/* ────────────────────────────────────────────────────────────────────────
 * Phase vocoder / time stretch / pitch shift
 * ──────────────────────────────────────────────────────────────────────── */

/**
 * Phase vocoder: time-stretch an STFT matrix by `rate`.
 * Ellis 2002 formulation:
 * phi_advance = linspace(0, π*hop_length, 1 + n_fft/2); phase accumulates
 * from column 0's phase; the DEVIATION (dphase - phi_advance) is wrapped to
 * (-π, π]; input is padded with 2 zero columns for the boundary.
 *
 * @param {Array<Array<{real:number,imag:number}>>} D - STFT matrix [freq][time]
 * @param {number} rate - Speed-up factor (> 1 faster, < 1 slower)
 * @param {Object} [options]
 * @param {number|null} [options.hop_length=null] - Defaults to n_fft/4
 * @param {number|null} [options.n_fft=null] - Defaults to 2*(D.length - 1)
 * @returns {Array<Array<{real:number,imag:number}>>} Stretched STFT [freq][ceil(time/rate)]
 * @throws {Error} When rate <= 0 or D is empty
 */
export function phase_vocoder(D, rate, { hop_length = null, n_fft = null } = {}) {
  if (!(rate > 0)) throw new Error('phase_vocoder: rate must be a positive number')
  if (!D || D.length === 0 || !D[0]) throw new Error('phase_vocoder: empty STFT matrix')

  const nFreq = D.length
  const nFrames = D[0].length
  if (n_fft === null || n_fft === undefined) n_fft = 2 * (nFreq - 1)
  if (hop_length === null || hop_length === undefined) hop_length = Math.floor(n_fft / 4)

  const nSteps = Math.ceil(nFrames / rate)
  const twoPi = 2 * Math.PI

  // Expected phase advance per bin per frame
  const phiAdvance = new Float64Array(nFreq)
  for (let k = 0; k < nFreq; k++) phiAdvance[k] = (hop_length * twoPi * k) / n_fft

  // Phase accumulator initialized to the first frame's phase
  const phaseAcc = new Float64Array(nFreq)
  for (let k = 0; k < nFreq; k++) {
    phaseAcc[k] = Math.atan2(D[k][0].imag, D[k][0].real)
  }

  const out = new Array(nFreq)
  for (let k = 0; k < nFreq; k++) out[k] = new Array(nSteps)

  const ZERO = { real: 0, imag: 0 }
  for (let t = 0; t < nSteps; t++) {
    const step = t * rate
    const i0 = Math.floor(step)
    const alpha = step - i0
    for (let k = 0; k < nFreq; k++) {
      const row = D[k]
      const c0 = i0 < nFrames ? row[i0] : ZERO // pad 2 zero columns
      const c1 = i0 + 1 < nFrames ? row[i0 + 1] : ZERO

      const mag = (1 - alpha) * Math.hypot(c0.real, c0.imag) + alpha * Math.hypot(c1.real, c1.imag)
      out[k][t] = {
        real: mag * Math.cos(phaseAcc[k]),
        imag: mag * Math.sin(phaseAcc[k]),
      }

      // Wrap the deviation from the expected advance (NOT the raw delta)
      let dphase = Math.atan2(c1.imag, c1.real) - Math.atan2(c0.imag, c0.real) - phiAdvance[k]
      dphase -= twoPi * Math.round(dphase / twoPi)

      phaseAcc[k] += phiAdvance[k] + dphase
    }
  }

  return out
}

/**
 * Time-stretch an audio series by a fixed rate (pitch-preserving).
 * Pipeline: stft → phase_vocoder → istft with
 * output length round(n / rate).
 *
 * @param {Float32Array} y - Audio signal
 * @param {number} rate - Stretch factor (> 1 speeds up, < 1 slows down)
 * @param {Object} [options] - STFT parameters
 * @param {number} [options.n_fft=2048]
 * @param {number|null} [options.hop_length=null] - Defaults to n_fft/4
 * @param {number|null} [options.win_length=null]
 * @param {string} [options.window='hann']
 * @param {boolean} [options.center=true]
 * @param {string} [options.pad_mode='constant']
 * @returns {Float32Array} Stretched audio, length round(y.length / rate)
 * @throws {Error} When rate <= 0
 */
export function time_stretch(y, rate, {
  n_fft = 2048,
  hop_length = null,
  win_length = null,
  window = 'hann',
  center = true,
  pad_mode = 'constant',
} = {}) {
  if (!(rate > 0)) throw new Error('time_stretch: rate must be a positive number')

  const hop = hop_length === null || hop_length === undefined ? Math.floor(n_fft / 4) : hop_length
  const D = stft(y, n_fft, hop, win_length, window, center, pad_mode)
  const Dst = phase_vocoder(D, rate, { hop_length: hop, n_fft })
  const lenStretch = Math.round(y.length / rate)
  return istft(Dst, hop, win_length, window, center, lenStretch)
}

/** Trim or zero-pad a signal to an exact length (fix_length). */
function fixLength(x, size) {
  if (x.length === size) return x
  if (x.length > size) return x.slice(0, size)
  const out = new Float32Array(size)
  out.set(x)
  return out
}

/**
 * Shift the pitch of a waveform by n_steps steps (duration preserved).
 * Recipe:
 * rate = 2^(-n_steps/bins_per_octave); resample(time_stretch(y, rate),
 * sr/rate → sr); fix_length to the input size.
 *
 * QUALITY NOTE: the resampling stage uses pleco's linear-interpolation
 * resample (xa-audioio.js) — no high-quality anti-aliasing filter. Downward
 * shifts (upsampling) are clean; upward shifts
 * can alias above ~sr/(2*rate). This is a documented fidelity limit of the
 * current resampler, not a silent fallback.
 *
 * @param {Float32Array} y - Audio signal
 * @param {number} sr - Sample rate of y
 * @param {number} n_steps - Steps to shift (may be fractional; 12 steps = 1 octave by default)
 * @param {Object} [options]
 * @param {number} [options.bins_per_octave=12] - Positive integer
 * @param {number} [options.n_fft=2048] - And the other time_stretch STFT options
 * @returns {Float32Array} Pitch-shifted audio, same length as y
 * @throws {Error} When bins_per_octave is not a positive integer
 */
export function pitch_shift(y, sr, n_steps, { bins_per_octave = 12, ...stretchOptions } = {}) {
  if (!Number.isInteger(bins_per_octave) || bins_per_octave <= 0) {
    throw new Error(`pitch_shift: bins_per_octave=${bins_per_octave} must be a positive integer`)
  }

  const rate = Math.pow(2, -n_steps / bins_per_octave)
  const stretched = time_stretch(y, rate, stretchOptions)
  const shifted = resample(stretched, { origSr: sr / rate, targetSr: sr })
  return fixLength(shifted, y.length)
}

/* ────────────────────────────────────────────────────────────────────────
 * Waveform-level HPSS
 * ──────────────────────────────────────────────────────────────────────── */

/**
 * Decompose an audio time series into harmonic and percussive components.
 * Pipeline: stft → decompose.hpss (masked components)
 * → istft with length matched to the input, so harmonic + percussive ≈ y
 * at margin=1.
 *
 * @param {Float32Array} y - Audio signal
 * @param {Object} [options]
 * @param {number|Array<number>} [options.kernel_size=31]
 * @param {number} [options.power=2.0]
 * @param {number|Array<number>} [options.margin=1.0]
 * @param {number} [options.n_fft=2048]
 * @param {number|null} [options.hop_length=null] - defaults to n_fft/4
 * @param {number|null} [options.win_length=null] - defaults to n_fft
 * @param {string} [options.window='hann']
 * @param {boolean} [options.center=true]
 * @param {string} [options.pad_mode='constant']
 * @returns {{harmonic: Float32Array, percussive: Float32Array}} Both length y.length
 */
export function hpss(y, {
  kernel_size = 31,
  power = 2.0,
  margin = 1.0,
  n_fft = 2048,
  hop_length = null,
  win_length = null,
  window = 'hann',
  center = true,
  pad_mode = 'constant',
} = {}) {
  const hop = hop_length === null || hop_length === undefined ? Math.floor(n_fft / 4) : hop_length
  const D = stft(y, n_fft, hop, win_length, window, center, pad_mode)
  const { harmonic: Dh, percussive: Dp } = hpssSpectrogram(D, { kernel_size, power, margin })
  return {
    harmonic: istft(Dh, hop, win_length, window, center, y.length),
    percussive: istft(Dp, hop, win_length, window, center, y.length),
  }
}

/**
 * Extract only the harmonic component of a waveform.
 * @param {Float32Array} y - Audio signal
 * @param {Object} [options] - Same options as hpss()
 * @returns {Float32Array} Harmonic component, length y.length
 */
export function harmonic(y, options = {}) {
  return hpss(y, options).harmonic
}

/**
 * Extract only the percussive component of a waveform.
 * @param {Float32Array} y - Audio signal
 * @param {Object} [options] - Same options as hpss()
 * @returns {Float32Array} Percussive component, length y.length
 */
export function percussive(y, options = {}) {
  return hpss(y, options).percussive
}
