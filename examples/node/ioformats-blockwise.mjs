/**
 * ioformats — Blockwise IO: streaming equals one-shot (the canonical
 * blockwise-streaming Node demo).
 *
 * (a) Decode a real golden WAV with io/wav decodeWav, feed it through the
 *     worker-safe streaming meters in 128-frame blocks (frame 2048 / hop 512,
 *     the streaming block contract), and prove the streamed RMS sequence
 *     equals one-shot feature.rms on the full signal — the overlap bookkeeping
 *     cross-checked with convert.blocks_to_frames.
 * (b) Prove chunk-size invariance: a flux analyzer fed random 37–1999-sample
 *     chunks emits a bitwise-identical sequence to a monolithic push.
 * (c) Write-out: encodeWav a generated stereo buffer and decodeWav it back
 *     within the 16-bit LSB.
 */
import {
  createRmsMeter, createFluxAnalyzer, decodeWav, encodeWav, feature, convert,
} from '../../packages/pleco-xa/dist/pleco-xa.js'
import { check, checkTrue, summary } from './_harness.mjs'
import { readFileSync } from 'node:fs'
import { fileURLToPath } from 'node:url'

const wavPath = fileURLToPath(new URL(
  '../../apps/demo/public/audio/Drive Through Beat.wav', import.meta.url,
))
const raw = readFileSync(wavPath)
const { channels, sampleRate } = decodeWav(raw.buffer.slice(raw.byteOffset, raw.byteOffset + raw.byteLength))
checkTrue('golden WAV decodes', channels.length >= 1 && channels[0].length > 0,
  `${channels.length} ch × ${channels[0].length} @ ${sampleRate} Hz`)
const y = channels.length > 1
  ? Float32Array.from(channels[0], (v, i) => (v + channels[1][i]) / 2)
  : channels[0]

// ── (a) blockwise streaming RMS vs one-shot feature.rms ─────────────────────
const FRAME = 2048
const HOP = 512
const BLOCK = 128 // frames per block (block_length)
const samplesPerBlock = BLOCK * HOP
const lookahead = FRAME / HOP - 1 // frames pending until their tail samples arrive

const meter = createRmsMeter({ frameSize: FRAME, hop: HOP })
const streamed = []
const emittedAtBlock = []
for (let off = 0; off < y.length; off += samplesPerBlock) {
  streamed.push(...meter.push(y.subarray(off, Math.min(off + samplesPerBlock, y.length))))
  emittedAtBlock.push(streamed.length)
}

const oneShot = feature.rms(y, { frame_length: FRAME, hop_length: HOP, center: false })
check('streamed frame count == one-shot frame count', streamed.length, oneShot.length)

let maxErr = 0
for (let i = 0; i < oneShot.length; i++) maxErr = Math.max(maxErr, Math.abs(oneShot[i] - streamed[i]))
checkTrue('streamed RMS == full-signal feature.rms per frame (≤1e-6)', maxErr <= 1e-6,
  `maxErr ${maxErr.toExponential(2)} over ${oneShot.length} frames`)

// Overlap bookkeeping: blocks_to_frames(b) is the first frame index of block b,
// so after b complete blocks exactly blocks_to_frames(b) − lookahead frames
// have their full 2048-sample window available and must have been emitted.
let bookkeepingOk = true
for (let b = 1; b <= 3; b++) {
  const expected = convert.blocks_to_frames(b, BLOCK) - lookahead
  if (emittedAtBlock[b - 1] !== expected) bookkeepingOk = false
}
checkTrue('frames emitted after blocks 1–3 == blocks_to_frames(b) − (frame/hop − 1)',
  bookkeepingOk,
  `after block 1: ${emittedAtBlock[0]} (= ${convert.blocks_to_frames(1, BLOCK)} − ${lookahead})`)

// ── (b) chunk-size invariance of the flux analyzer ──────────────────────────
const fluxMono = createFluxAnalyzer({ nFft: FRAME, hop: HOP }).push(y)
const chunked = createFluxAnalyzer({ nFft: FRAME, hop: HOP })
const fluxChunked = []
let seed = 12345
const lcg = () => (seed = (seed * 1103515245 + 12345) & 0x7fffffff) / 0x7fffffff
for (let off = 0; off < y.length;) {
  const size = 37 + Math.floor(lcg() * 1962)
  fluxChunked.push(...chunked.push(y.subarray(off, Math.min(off + size, y.length))))
  off += size
}
checkTrue('flux: random 37–1999-sample chunks emit a bitwise-identical sequence',
  fluxMono.length === fluxChunked.length && fluxMono.every((v, i) => v === fluxChunked[i]),
  `${fluxMono.length} frames, all identical`)
check('flux first frame reports 0 (no predecessor)', fluxMono[0], 0)

// ── (c) stereo write-out round trip ─────────────────────────────────────────
const N = 44100
const L = new Float32Array(N)
const R = new Float32Array(N)
for (let i = 0; i < N; i++) {
  L[i] = 0.8 * Math.sin((2 * Math.PI * 440 * i) / 44100)
  R[i] = 0.8 * Math.sin((2 * Math.PI * 880 * i) / 44100)
}
const dec = decodeWav(encodeWav([L, R], 44100))
check('roundtrip sampleRate', dec.sampleRate, 44100)
check('roundtrip channel count', dec.channels.length, 2)
let rtErr = 0
for (let i = 0; i < N; i++) {
  rtErr = Math.max(rtErr, Math.abs(dec.channels[0][i] - L[i]), Math.abs(dec.channels[1][i] - R[i]))
}
checkTrue('roundtrip max sample error ≤ 1/32768 (16-bit LSB)', rtErr <= 1 / 32768,
  `maxErr ${rtErr.toExponential(3)}`)

summary('ioformats — blockwise streaming equals one-shot + WAV write-out')
