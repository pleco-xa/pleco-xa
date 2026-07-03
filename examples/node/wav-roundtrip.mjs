/**
 * io/wav.js — stereo WAV roundtrip + interleave regression proof.
 * Encodes planar stereo (L=440 Hz, R=880 Hz), writes a real temp .wav, decodes
 * it back, and proves per-sample accuracy at the 16-bit quantization floor PLUS
 * channel identity via zero-crossing counts — the regression that motivated this
 * module (three legacy encoders wrote channel-block PCM under an interleaved
 * header, garbling stereo).
 */
import { encodeWav, decodeWav } from '../../packages/pleco-xa/dist/pleco-xa.js'
import { check, checkTrue, summary } from './_harness.mjs'
import fs from 'node:fs'
import os from 'node:os'
import path from 'node:path'

const sr = 44100
const N = sr // 1 second
const L = new Float32Array(N)
const R = new Float32Array(N)
for (let i = 0; i < N; i++) {
  L[i] = 0.9 * Math.sin((2 * Math.PI * 440 * i) / sr)
  R[i] = 0.9 * Math.sin((2 * Math.PI * 880 * i) / sr)
}

const tmp = path.join(os.tmpdir(), `pleco-wav-roundtrip-${process.pid}.wav`)
fs.writeFileSync(tmp, Buffer.from(encodeWav([L, R], sr)))
const raw = fs.readFileSync(tmp)
fs.unlinkSync(tmp)
const { channels, sampleRate } = decodeWav(
  raw.buffer.slice(raw.byteOffset, raw.byteOffset + raw.byteLength),
)

check('decoded sampleRate == 44100', sampleRate, 44100)
check('decoded channel count == 2', channels.length, 2)
check('decoded frame count == 44100', channels[0].length, N)

let maxErr = 0
for (let i = 0; i < N; i++) {
  maxErr = Math.max(maxErr, Math.abs(channels[0][i] - L[i]), Math.abs(channels[1][i] - R[i]))
}
checkTrue(`per-sample maxErr <= 1/32767 (16-bit quantization floor)`, maxErr <= 1 / 32767, maxErr.toExponential(3))

// Channel-identity regression: 440 Hz over 1 s crosses zero ~880 times, 880 Hz ~1760.
const zc = (d) => {
  let c = 0
  for (let i = 1; i < d.length; i++) if (d[i - 1] < 0 !== d[i] < 0) c++
  return c
}
const zcL = zc(channels[0])
const zcR = zc(channels[1])
checkTrue('decoded L is the 440 Hz tone (zero crossings 880 ± 2)', Math.abs(zcL - 880) <= 2, `${zcL}`)
checkTrue('decoded R is the 880 Hz tone (zero crossings 1760 ± 2)', Math.abs(zcR - 1760) <= 2, `${zcR}`)
checkTrue('channels not swapped/garbled (zcR ≈ 2·zcL)', zcR > 1.9 * zcL, `${zcR} vs ${zcL}`)

summary('io/wav — stereo roundtrip + interleave regression')
