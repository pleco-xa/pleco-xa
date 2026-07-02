/**
 * Worker-safe streaming analyzers.
 *
 * Incremental, push-based meters for live/streaming audio. No DOM, no
 * AudioContext, no globals — safe to run inside a Web Worker, an
 * AudioWorkletProcessor, or Node. Feed arbitrary-sized Float32Array chunks;
 * frames are emitted whenever enough samples have accumulated.
 *
 * These are QUICK-tier live meters (see the tier law in xa-beat-tracker.js):
 * they are explicit streaming tools, not fallbacks for the librosa-parity
 * offline analyzers.
 */

import { fft } from '../scripts/xa-fft.js'

/**
 * Validate a positive-integer framing parameter.
 * @private
 */
function assertPositiveInt(value, name) {
  if (!Number.isInteger(value) || value <= 0) {
    throw new Error(`${name}=${value} must be a positive integer`)
  }
}

/**
 * Validate a pushed chunk.
 * @private
 */
function assertChunk(chunk) {
  if (chunk == null || typeof chunk.length !== 'number') {
    throw new Error('push() expects a Float32Array (or array-like) chunk')
  }
}

/**
 * Shared incremental framer: buffers pushed samples and yields
 * frameSize-sample frames advancing by hop.
 * @private
 */
function createFramer(frameSize, hop) {
  let buffer = new Float32Array(0)

  return {
    /**
     * Append a chunk and invoke onFrame(view) for each complete frame.
     * The view is only valid during the callback.
     */
    push(chunk, onFrame) {
      assertChunk(chunk)
      if (chunk.length === 0) return

      const merged = new Float32Array(buffer.length + chunk.length)
      merged.set(buffer, 0)
      merged.set(chunk, buffer.length)

      let offset = 0
      while (offset + frameSize <= merged.length) {
        onFrame(merged.subarray(offset, offset + frameSize))
        offset += hop
      }
      buffer = merged.slice(offset)
    },
    reset() {
      buffer = new Float32Array(0)
    },
    get pending() {
      return buffer.length
    },
  }
}

/**
 * Create an incremental RMS meter.
 *
 * Emits one RMS value per complete frame:
 *   rms = sqrt(mean(frame^2))
 * For a steady sine of amplitude g, RMS ≈ g / sqrt(2).
 *
 * @param {Object} [opts]
 * @param {number} [opts.frameSize=2048] - samples per analysis frame
 * @param {number} [opts.hop=512] - samples between successive frames
 * @returns {{
 *   push: (chunk: Float32Array) => number[],
 *   read: () => {current: number|null, frameCount: number, pendingSamples: number},
 *   reset: () => void,
 * }} push() returns the RMS values newly completed by this chunk; read()
 *   reports the most recent value and totals without consuming anything.
 */
export function createRmsMeter({ frameSize = 2048, hop = 512 } = {}) {
  assertPositiveInt(frameSize, 'frameSize')
  assertPositiveInt(hop, 'hop')

  const framer = createFramer(frameSize, hop)
  let current = null
  let frameCount = 0

  return {
    push(chunk) {
      const out = []
      framer.push(chunk, (frame) => {
        let sq = 0
        for (let i = 0; i < frame.length; i++) {
          sq += frame[i] * frame[i]
        }
        current = Math.sqrt(sq / frame.length)
        frameCount++
        out.push(current)
      })
      return out
    },
    read() {
      return { current, frameCount, pendingSamples: framer.pending }
    },
    reset() {
      framer.reset()
      current = null
      frameCount = 0
    },
  }
}

/**
 * Create an incremental spectral-flux analyzer.
 *
 * Each complete frame is Hann-windowed and transformed (nFft-point FFT);
 * flux is the sum of positive magnitude increases versus the previous
 * frame's spectrum:
 *   flux[t] = sum_k max(0, |X_t[k]| - |X_{t-1}[k]|)
 * The first frame has no predecessor and reports flux 0. Flux spikes at
 * energy/amplitude onsets (e.g. an amplitude step in the input).
 *
 * @param {Object} [opts]
 * @param {number} [opts.nFft=2048] - frame/FFT size in samples
 * @param {number} [opts.hop=512] - samples between successive frames
 * @returns {{
 *   push: (chunk: Float32Array) => number[],
 *   read: () => {current: number|null, frameCount: number, pendingSamples: number},
 *   reset: () => void,
 * }} push() returns the flux values newly completed by this chunk; read()
 *   reports the most recent value and totals without consuming anything.
 */
export function createFluxAnalyzer({ nFft = 2048, hop = 512 } = {}) {
  assertPositiveInt(nFft, 'nFft')
  assertPositiveInt(hop, 'hop')

  const framer = createFramer(nFft, hop)

  // Periodic Hann window
  const window = new Float32Array(nFft)
  for (let i = 0; i < nFft; i++) {
    window[i] = 0.5 - 0.5 * Math.cos((2 * Math.PI * i) / nFft)
  }

  const nBins = Math.floor(nFft / 2) + 1
  const windowed = new Float32Array(nFft)
  let prevMag = null
  let current = null
  let frameCount = 0

  return {
    push(chunk) {
      const out = []
      framer.push(chunk, (frame) => {
        for (let i = 0; i < nFft; i++) {
          windowed[i] = frame[i] * window[i]
        }
        const spectrum = fft(windowed)
        const mag = new Float32Array(nBins)
        for (let k = 0; k < nBins; k++) {
          const { real, imag } = spectrum[k]
          mag[k] = Math.sqrt(real * real + imag * imag)
        }

        let flux = 0
        if (prevMag !== null) {
          for (let k = 0; k < nBins; k++) {
            const d = mag[k] - prevMag[k]
            if (d > 0) flux += d
          }
        }
        prevMag = mag
        current = flux
        frameCount++
        out.push(flux)
      })
      return out
    },
    read() {
      return { current, frameCount, pendingSamples: framer.pending }
    },
    reset() {
      framer.reset()
      prevMag = null
      current = null
      frameCount = 0
    },
  }
}
