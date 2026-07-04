/* xa-audioio.js — High‑performance, browser‑ready IO, DSP & utility routines.
 *
 * Now includes playback functionality via Web Audio API.
 *
 */

// Repaired path (Wave 5A): the old 'src/core/xa-fft.js' specifier resolved
// nowhere in Node or the browser — xa-fft lives beside this module.
import { _amax } from './_arrstat.js'
import { fft, ifft } from './xa-fft.js'

let globalAudioContext = null
let currentAudioBuffer = null
let currentSourceNode = null

/*───────────────────────────────────────────────────────────────────────────*/
/* I/O                                                                    */
/*───────────────────────────────────────────────────────────────────────────*/

async function decodeBuffer(arrayBuffer) {
  const tmpCtx = new (window.AudioContext ||
    window.webkitAudioContext ||
    function () {
      throw new Error('AudioContext not supported')
    })()
  const audio = await tmpCtx.decodeAudioData(arrayBuffer)
  await tmpCtx.close()
  return audio
}

/**
 * Private loader using Web Audio API (JavaScript equivalent of soundfile backend)
 *
 * Internal helper function that loads audio using the Web Audio API.
 * This is the primary audio loading backend for browser environments.
 *
 * @param {string|ArrayBuffer} source - URL or ArrayBuffer of audio file
 * @param {Object} options - Loading options
 * @param {number} options.sr - Target sample rate (null to use native)
 * @param {boolean} options.mono - Convert to mono if true
 * @param {number} options.offset - Start time in seconds
 * @param {number} options.duration - Duration in seconds (null for entire file)
 * @returns {Promise<{y: Float32Array, sr: number}>} Audio data and sample rate
 *
 * @example
 * // Load audio file using Web Audio API backend
 * const {y, sr} = await __soundfile_load('audio.mp3', {sr: 22050, mono: true});
 */
async function __soundfile_load(source, { sr = 22050, mono = true, offset = 0, duration = null } = {}) {
  let arrayBuffer;

  if (source instanceof ArrayBuffer) {
    arrayBuffer = source;
  } else {
    const response = await fetch(source);
    arrayBuffer = await response.arrayBuffer();
  }

  const decoded = await decodeBuffer(arrayBuffer);

  const nativeSr = decoded.sampleRate;
  const start = Math.floor(offset * nativeSr);
  const end = duration === null
    ? decoded.length
    : Math.min(decoded.length, start + Math.floor(duration * nativeSr));
  const length = end - start;

  const chans = Array.from({ length: decoded.numberOfChannels }, (_, c) =>
    decoded.getChannelData(c).slice(start, end)
  );

  let y = mono ? toMono(chans) : Float32Array.from(chans.flat());

  if (sr !== null && sr !== nativeSr) {
    y = resample(y, { origSr: nativeSr, targetSr: sr });
  }

  return { y, sr: sr ?? nativeSr };
}

/**
 * Private loader using HTML5 Audio element (JavaScript equivalent of audioread backend)
 *
 * Fallback audio loader using HTML5 Audio element when Web Audio API fails.
 * Provides compatibility with older browsers or when AudioContext is unavailable.
 *
 * @param {string} url - URL of audio file
 * @param {Object} options - Loading options
 * @param {number} options.sr - Target sample rate (null to use native)
 * @param {boolean} options.mono - Convert to mono if true
 * @param {number} options.offset - Start time in seconds
 * @param {number} options.duration - Duration in seconds (null for entire file)
 * @returns {Promise<{y: Float32Array, sr: number}>} Audio data and sample rate
 *
 * @example
 * // Load audio with HTML5 Audio fallback
 * const {y, sr} = await __audioread_load('audio.mp3', {sr: 22050});
 */
async function __audioread_load(url, { sr = 22050, mono = true, offset = 0, duration = null } = {}) {
  return new Promise((resolve, reject) => {
    const audio = new Audio();
    audio.crossOrigin = 'anonymous';

    audio.addEventListener('error', (e) => {
      reject(new Error(`Failed to load audio: ${e.message || 'Unknown error'}`));
    });

    audio.addEventListener('canplaythrough', async () => {
      try {
        // Create offline context to capture audio data
        const ctx = new (window.OfflineAudioContext || window.webkitOfflineAudioContext)(
          mono ? 1 : 2,
          Math.floor(audio.duration * sr),
          sr
        );

        // Create media element source
        const source = ctx.createMediaElementSource(audio);
        source.connect(ctx.destination);

        // Render audio
        const rendered = await ctx.startRendering();

        // Extract channel data
        const nativeSr = rendered.sampleRate;
        const start = Math.floor(offset * nativeSr);
        const end = duration === null
          ? rendered.length
          : Math.min(rendered.length, start + Math.floor(duration * nativeSr));

        const chans = Array.from({ length: rendered.numberOfChannels }, (_, c) =>
          rendered.getChannelData(c).slice(start, end)
        );

        let y = mono ? toMono(chans) : Float32Array.from(chans.flat());

        if (sr !== null && sr !== nativeSr) {
          y = resample(y, { origSr: nativeSr, targetSr: sr });
        }

        resolve({ y, sr: sr ?? nativeSr });
      } catch (error) {
        reject(error);
      }
    });

    audio.src = url;
    audio.load();
  });
}

export async function load(
  url,
  { sr = 22050, mono = true, offset = 0, duration = null } = {},
) {
  const response = await fetch(url)
  const arrayBuffer = await response.arrayBuffer()
  const decoded = await decodeBuffer(arrayBuffer)

  const nativeSr = decoded.sampleRate
  const start = Math.floor(offset * nativeSr)
  const end =
    duration === null
      ? decoded.length
      : Math.min(decoded.length, start + Math.floor(duration * nativeSr))
  const length = end - start

  const chans = Array.from({ length: decoded.numberOfChannels }, (_, c) =>
    decoded.getChannelData(c).slice(start, end),
  )

  let y = mono ? toMono(chans) : Float32Array.from(chans.flat())

  if (sr !== null && sr !== nativeSr)
    y = resample(y, { origSr: nativeSr, targetSr: sr })

  currentAudioBuffer = {
    y,
    sr: sr ?? nativeSr,
  }

  return currentAudioBuffer
}

/*───────────────────────────────────────────────────────────────────────────*/
/* Playback                                                               */
/*───────────────────────────────────────────────────────────────────────────*/

export function play({ loop = false } = {}) {
  if (!currentAudioBuffer)
    throw new Error('No audio loaded. Call load() first.')
  stop()

  if (!globalAudioContext) {
    globalAudioContext = new (window.AudioContext ||
      window.webkitAudioContext ||
      function () {
        throw new Error('AudioContext not supported')
      })()
  }

  const { y, sr } = currentAudioBuffer
  const buffer = globalAudioContext.createBuffer(1, y.length, sr)
  buffer.copyToChannel(y, 0)

  const source = globalAudioContext.createBufferSource()
  source.buffer = buffer
  source.connect(globalAudioContext.destination)
  source.loop = loop
  source.start()

  currentSourceNode = source
}

export function stop() {
  if (currentSourceNode) {
    try {
      currentSourceNode.stop()
      currentSourceNode.disconnect()
    } catch (_) {}
    currentSourceNode = null
  }
}

/*───────────────────────────────────────────────────────────────────────────*/
/* Utility helpers                                                         */
/*───────────────────────────────────────────────────────────────────────────*/

export function toMono(channelArrays) {
  if (channelArrays.length === 1) return channelArrays[0]
  const len = channelArrays[0].length
  const out = new Float32Array(len)
  const mInv = 1 / channelArrays.length
  for (let i = 0; i < len; ++i) {
    let s = 0
    for (let c = 0; c < channelArrays.length; ++c) s += channelArrays[c][i]
    out[i] = s * mInv
  }
  return out
}

export function resample(y, { origSr, targetSr }) {
  if (!y || origSr === targetSr) return y
  const ratio = targetSr / origSr
  const nOut = Math.ceil(y.length * ratio)
  const out = new Float32Array(nOut)
  for (let i = 0; i < nOut; ++i) {
    const t = i / ratio
    const k = Math.floor(t)
    const frac = t - k
    const v0 = y[k]
    const v1 = y[Math.min(k + 1, y.length - 1)]
    out[i] = v0 + frac * (v1 - v0)
  }
  return out
}

export const getDuration = (y, sr) => y.length / sr
export const getSamplerate = (audioBuffer) => audioBuffer.sampleRate

/*───────────────────────────────────────────────────────────────────────────*/
/* Analysis                                                                */
/*───────────────────────────────────────────────────────────────────────────*/

export function zeroCrossings(
  y,
  { threshold = 1e-10, pad = true, zeroPos = true } = {},
) {
  const out = new Uint8Array(y.length)
  let prev = y[0]
  if (pad) out[0] = 1
  for (let i = 1; i < y.length; ++i) {
    let x0 = prev
    let x1 = y[i]
    if (Math.abs(x0) <= threshold) x0 = 0
    if (Math.abs(x1) <= threshold) x1 = 0
    const s0 = zeroPos ? x0 >= 0 : Math.sign(x0)
    const s1 = zeroPos ? x1 >= 0 : Math.sign(x1)
    out[i] = s0 !== s1 ? 1 : 0
    prev = x1
  }
  return out
}

export function autocorrelate(y, maxSize = y.length) {
  const N = y.length
  const M = Math.min(maxSize, N)
  const out = new Float32Array(M)
  for (let lag = 0; lag < M; ++lag) {
    let sum = 0
    for (let i = lag; i < N; ++i) sum += y[i] * y[i - lag]
    out[lag] = sum
  }
  return out
}

/**
 * Private helper for LPC computation using Levinson-Durbin recursion
 *
 * Computes Linear Predictive Coding coefficients from autocorrelation.
 * This is an alternative implementation helper for the main lpc() function.
 *
 * @param {Float32Array|Float64Array} y - Input signal
 * @param {number} order - LPC order
 * @param {Float64Array} ar_coeffs - Output buffer for AR coefficients
 * @param {Float64Array} ar_coeffs_prev - Previous AR coefficients (work buffer)
 * @param {Float64Array} reflect_coeff - Reflection coefficients output
 * @param {Float64Array} den - Denominator buffer
 * @param {number} epsilon - Small value to prevent division by zero
 * @returns {Float64Array} AR coefficients
 */
function __lpc(y, order, ar_coeffs, ar_coeffs_prev, reflect_coeff, den, epsilon) {
  const n = y.length

  // Compute autocorrelation
  const r = new Float64Array(order + 1)
  for (let lag = 0; lag <= order; lag++) {
    let sum = 0
    for (let i = 0; i < n - lag; i++) {
      sum += y[i] * y[i + lag]
    }
    r[lag] = sum
  }

  // Levinson-Durbin recursion
  let error = r[0]

  for (let i = 0; i < order; i++) {
    // Compute reflection coefficient
    let acc = 0
    for (let j = 0; j < i; j++) {
      acc += ar_coeffs[j] * r[i - j]
    }

    const k = (r[i + 1] - acc) / (error + epsilon)
    reflect_coeff[i] = k

    // Update AR coefficients
    for (let j = 0; j < i; j++) {
      ar_coeffs_prev[j] = ar_coeffs[j]
    }

    for (let j = 0; j < i; j++) {
      ar_coeffs[j] = ar_coeffs_prev[j] - k * ar_coeffs_prev[i - 1 - j]
    }
    ar_coeffs[i] = k

    // Update error
    error *= (1 - k * k)
  }

  // Set up denominator polynomial [1, -a1, -a2, ..., -ap]
  den[0] = 1
  for (let i = 0; i < order; i++) {
    den[i + 1] = -ar_coeffs[i]
  }

  return ar_coeffs
}

/** Burg LPC (real‑valued) — returns LPC denominator polynomial a[0..p], a[0] == 1  */
export function lpc(signal, order) {
  if (order < 1 || order >= signal.length)
    throw new RangeError('Invalid LPC order')

  const N = signal.length
  const ef = Float64Array.from(signal)
  const eb = Float64Array.from(signal)
  let E = signal.reduce((s, v) => s + v * v, 0)

  const a = new Float64Array(order + 1)
  a[0] = 1

  for (let m = 1; m <= order; ++m) {
    let num = 0,
      den = 0
    for (let n = m; n < N; ++n) {
      num += ef[n] * eb[n - 1]
      den += ef[n] * ef[n] + eb[n - 1] * eb[n - 1]
    }
    const k = (-2 * num) / den
    a[m] = k
    for (let i = 1; i < m; ++i) a[i] = a[i] + k * a[m - i]
    for (let n = N - 1; n >= m; --n) {
      const tmp = ef[n]
      ef[n] = ef[n] + k * eb[n - 1]
      eb[n - 1] = eb[n - 1] + k * tmp
    }
    E *= 1 - k * k
  }
  return a
}

/*───────────────────────────────────────────────────────────────────────────*/
/* Signal synthesis                                                        */
/*───────────────────────────────────────────────────────────────────────────*/

export function tone(
  frequency,
  { sr = 22050, length = null, duration = null, phi = -Math.PI * 0.5 } = {},
) {
  if (length == null) {
    if (duration == null) throw new Error('length or duration required')
    length = Math.floor(duration * sr)
  }
  const y = new Float32Array(length)
  const w = (2 * Math.PI * frequency) / sr
  for (let i = 0; i < length; ++i) y[i] = Math.cos(w * i + phi)
  return y
}

export function chirp({
  fmin,
  fmax,
  sr = 22050,
  length = null,
  duration = null,
  linear = false,
  phi = -Math.PI * 0.5,
} = {}) {
  if (length == null) {
    if (duration == null) throw new Error('length or duration required')
    length = Math.floor(duration * sr)
  }
  const out = new Float32Array(length)
  const T = length / sr
  for (let n = 0; n < length; ++n) {
    const t = n / sr
    const k = linear
      ? fmin + (fmax - fmin) * (t / T)
      : fmin * Math.pow(fmax / fmin, t / T)
    out[n] = Math.cos(2 * Math.PI * k * t + phi)
  }
  return out
}

export function clicks({
  times = null,
  frames = null,
  sr = 22050,
  hopLength = 512,
  clickFreq = 1000,
  clickDuration = 0.1,
  click = null,
  length = null,
} = {}) {
  if (!times && !frames) throw new Error('Provide "times" or "frames"')
  const positions = times
    ? times.map((t) => Math.round(t * sr))
    : frames.map((f) => f * hopLength)
  if (!click) {
    const cLen = Math.floor(sr * clickDuration)
    click = new Float32Array(cLen)
    const w = (2 * Math.PI * clickFreq) / sr
    for (let i = 0; i < cLen; ++i)
      click[i] = Math.pow(2, (-10 * i) / cLen) * Math.sin(w * i)
  }
  if (!length) length = _amax(positions) + click.length
  const out = new Float32Array(length)
  for (const pos of positions) {
    const end = Math.min(pos + click.length, length)
    for (let i = pos, j = 0; i < end; ++i, ++j) out[i] += click[j]
  }
  return out
}

/*───────────────────────────────────────────────────────────────────────────*/
/* mu‑law companding                                                      */
/*───────────────────────────────────────────────────────────────────────────*/

export function muCompress(x, { mu = 255, quantize = true } = {}) {
  if (mu <= 0) throw new RangeError('mu must be > 0')
  const ln_mu = Math.log1p(mu)
  const out = new Float32Array(x.length)
  for (let i = 0; i < x.length; ++i) {
    const v = x[i]
    if (v < -1 || v > 1) throw new RangeError('Input outside [-1,1]')
    const comp = (Math.sign(v) * Math.log1p(mu * Math.abs(v))) / ln_mu
    out[i] = comp
  }
  if (!quantize) return out
  const q = new Int16Array(x.length)
  // Codewords must stay inside muExpand's valid dequant domain: it maps a code
  // back to [-1,1] via code*2/mu, so |code| must not exceed mu/2. Rounding the
  // upper boundary (comp === 1 -> round(mu/2)) can overshoot by one level (e.g.
  // 128 for mu=255), which made muExpand throw on muCompress's own output.
  // Clamp to the largest integer level that still round-trips.
  const limit = Math.floor(mu / 2)
  for (let i = 0; i < out.length; ++i) {
    const code = Math.round(((out[i] + 1) * mu) / 2 - mu / 2)
    q[i] = code > limit ? limit : code < -limit ? -limit : code
  }
  return q
}

export function muExpand(x, { mu = 255, quantize = true } = {}) {
  if (mu <= 0) throw new RangeError('mu must be > 0')
  const out = new Float32Array(x.length)
  const invMu = 1 / mu
  const lnmu = Math.log1p(mu)
  for (let i = 0; i < x.length; ++i) {
    let v = x[i]
    if (quantize) v = (v * 2) / mu
    if (v < -1 || v > 1) throw new RangeError('Input outside [-1,1]')
    out[i] = Math.sign(v) * invMu * (Math.exp(Math.abs(v) * lnmu) - 1)
  }
  return out
}

/*───────────────────────────────────────────────────────────────────────────*/
/* Module exports                                                         */
/*───────────────────────────────────────────────────────────────────────────*/

export default {
  load,
  toMono,
  resample,
  getDuration,
  getSamplerate,
  autocorrelate,
  lpc,
  zeroCrossings,
  tone,
  chirp,
  clicks,
  muCompress,
  muExpand,
}
