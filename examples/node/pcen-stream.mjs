/**
 * Proof: plot_pcen_stream — streaming PCEN: block-wise == whole file.
 *
 * librosa's pcen_stream gallery example: process a long file in fixed-size
 * frame blocks, carrying the PCEN smoother's filter state (zi/zf) across
 * blocks, and prove the block-wise result equals the one-shot result.
 *
 * Here: 'Bassline For Doppler Song longer.wav' (45 s golden WAV, decoded with
 * the package's own decodeWav) is streamed in 16-frame blocks (n_fft 2048,
 * hop 512, center=false so block framing is exact); pcen(..., zi, return_zf)
 * chains state block-to-block. A negative control (state RESET each block)
 * proves the carry actually matters — without it, block seams diverge.
 *
 * HONEST DIVERGENCE NOTE (also on the index.js export): pleco's pcen is a
 * real PCEN but not librosa-parity — smoother coefficient exp(-1/t_frames)
 * vs librosa's sqrt steady-state formula, and warmup starts from state 0
 * where librosa seeds lfilter_zi with frame 0. The streaming contract proven
 * here is independent of those constants.
 */
import fs from 'node:fs'
import { decodeWav, stft, pcen } from '../../packages/pleco-xa/dist/pleco-xa.js'
import { check, checkTrue, summary } from './_harness.mjs'

const WAV = new URL('../../apps/demo/public/audio/Bassline For Doppler Song longer.wav', import.meta.url)
const raw = fs.readFileSync(WAV)
const wav = decodeWav(raw.buffer.slice(raw.byteOffset, raw.byteOffset + raw.byteLength))
const SR = wav.sampleRate
const chans = wav.channels ?? wav.channelData
const N = chans[0].length
const y = new Float32Array(N)
for (let i = 0; i < N; i++) y[i] = (chans[0][i] + chans[1][i]) / 2
console.log(`golden WAV: sr ${SR}, ${(N / SR).toFixed(2)} s mono downmix`)

const N_FFT = 2048
const HOP = 512
const BLOCK_FRAMES = 16

const mag = (D) => D.map((row) => Float64Array.from(row, (c) => Math.hypot(c.real, c.imag)))

/* ── one-shot reference: full-signal uncentered STFT → PCEN ────────────────── */
const S_full = mag(stft(y, N_FFT, HOP, null, 'hann', false))
const nFreq = S_full.length
const nFrames = S_full[0].length
console.log(`full |STFT| ${nFreq} x ${nFrames} (center=false)`)
// pcen positional: (S, sr, hop, gain, bias, power, time_constant, eps, b, max_size, ref, axis, max_axis, zi, return_zf)
const P_full = pcen(S_full, SR, HOP)

/* ── streaming pass: 16-frame blocks, zi/zf carried ────────────────────────── */
function streamPcen(carryState) {
  const cols = []
  const magCols = []
  let zi = null
  for (let m0 = 0; m0 < nFrames; m0 += BLOCK_FRAMES) {
    const s0 = m0 * HOP
    const s1 = Math.min(N, s0 + (BLOCK_FRAMES - 1) * HOP + N_FFT)
    if (s1 - s0 < N_FFT) break
    const Sb = mag(stft(y.subarray(s0, s1), N_FFT, HOP, null, 'hann', false))
    const { output, zf } = pcen(Sb, SR, HOP, 0.98, 2, 0.5, 0.4, 1e-6, null, 1, null, -1, null, carryState ? zi : null, true)
    zi = zf
    for (let t = 0; t < Sb[0].length; t++) {
      cols.push(Float64Array.from({ length: nFreq }, (_, f) => output[f][t]))
      magCols.push(Float64Array.from({ length: nFreq }, (_, f) => Sb[f][t]))
    }
  }
  return { cols, magCols }
}
const chained = streamPcen(true)
check('block-wise frame count == one-shot frame count', chained.cols.length, nFrames)

/* ── framing identity: uncentered block STFT frames are bit-exact ──────────── */
let magDiff = 0
for (let t = 0; t < nFrames; t++) {
  for (let f = 0; f < nFreq; f++) {
    magDiff = Math.max(magDiff, Math.abs(chained.magCols[t][f] - S_full[f][t]))
  }
}
checkTrue('block |STFT| frames identical to full-signal frames (center=false framing)',
  magDiff === 0, `max abs diff ${magDiff.toExponential(2)}`)

/* ── the streaming contract: chained blocks == whole file ──────────────────── */
let pcenDiff = 0
for (let t = 0; t < nFrames; t++) {
  for (let f = 0; f < nFreq; f++) {
    pcenDiff = Math.max(pcenDiff, Math.abs(chained.cols[t][f] - P_full[f][t]))
  }
}
checkTrue('block-wise PCEN (zi/zf carried) == one-shot PCEN, max abs diff < 1e-6',
  pcenDiff < 1e-6, `max abs diff ${pcenDiff.toExponential(2)}`)

/* ── negative control: WITHOUT state carry the block seams diverge ─────────── */
const reset = streamPcen(false)
let resetDiff = 0
for (let t = 0; t < nFrames; t++) {
  for (let f = 0; f < nFreq; f++) {
    resetDiff = Math.max(resetDiff, Math.abs(reset.cols[t][f] - P_full[f][t]))
  }
}
checkTrue('negative control: resetting zi each block DIVERGES (max abs diff > 1e-3)',
  resetDiff > 1e-3, `max abs diff ${resetDiff.toExponential(2)}`)

/* ── max-over-frequency PCEN curve: first/last 5 + sparkline ───────────────── */
const curve = (colsOrMatrix, fromCols) =>
  Array.from({ length: nFrames }, (_, t) => {
    let m = -Infinity
    for (let f = 0; f < nFreq; f++) {
      const v = fromCols ? colsOrMatrix[t][f] : colsOrMatrix[f][t]
      if (v > m) m = v
    }
    return m
  })
const cFull = curve(P_full, false)
const cChain = curve(chained.cols, true)
const fmt5 = (arr) => arr.map((v) => v.toFixed(5)).join(' ')
console.log('max-over-freq PCEN, first 5 frames: full', fmt5(cFull.slice(0, 5)))
console.log('                              block', fmt5(cChain.slice(0, 5)))
console.log('max-over-freq PCEN,  last 5 frames: full', fmt5(cFull.slice(-5)))
console.log('                              block', fmt5(cChain.slice(-5)))
const shades = '▁▂▃▄▅▆▇█'
const lo = Math.min(...cFull)
const hi = Math.max(...cFull)
let spark = ''
for (let i = 0; i < 80; i++) {
  const v = cFull[Math.floor((i / 80) * nFrames)]
  spark += shades[Math.min(7, Math.floor(((v - lo) / (hi - lo)) * 8))]
}
console.log('PCEN curve (80-frame downsample):')
console.log(spark)

checkTrue('all PCEN values finite', chained.cols.every((col) => col.every(Number.isFinite)))

summary('pcen-stream: block-wise PCEN with zi/zf carry == whole file')
