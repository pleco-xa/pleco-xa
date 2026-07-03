/**
 * multichannel — Stereo without broadcasting: channel independence (librosa
 * multichannel advanced-example replica).
 *
 * encodeWav a 2-channel file (440 Hz sine left, 880 Hz right), decodeWav back
 * to the planar channel array, and run stft + magnitude peak-picking per
 * channel against fft_frequencies: each channel must peak at ITS OWN bin, with
 * cross-bleed at the other channel's bin below −40 dB — channels provably
 * independent through the interleaved-PCM encode/decode path.
 */
import { encodeWav, decodeWav, stft, fft_frequencies } from '../../packages/pleco-xa/dist/pleco-xa.js'
import { check, checkTrue, summary } from './_harness.mjs'

const sr = 22050
const N = 22050
const L = new Float32Array(N)
const R = new Float32Array(N)
for (let i = 0; i < N; i++) {
  L[i] = 0.7 * Math.sin((2 * Math.PI * 440 * i) / sr)
  R[i] = 0.7 * Math.sin((2 * Math.PI * 880 * i) / sr)
}
const { channels, sampleRate } = decodeWav(encodeWav([L, R], sr))
check('decoded channel count', channels.length, 2)
check('decoded sample rate', sampleRate, sr)

const n_fft = 2048
const freqs = fft_frequencies(sr, n_fft)
const binOf = (hz) => {
  let b = 0
  for (let i = 0; i < freqs.length; i++) if (Math.abs(freqs[i] - hz) < Math.abs(freqs[b] - hz)) b = i
  return b
}
const targetBins = [binOf(440), binOf(880)]

const rows = []
for (let ch = 0; ch < 2; ch++) {
  const S = stft(channels[ch], n_fft, 512)
  const nF = S.length
  const nT = S[0].length
  const meanPow = new Float64Array(nF)
  for (let f = 0; f < nF; f++) {
    let a = 0
    for (let t = 0; t < nT; t++) {
      const c = S[f][t]
      a += c.real * c.real + c.imag * c.imag
    }
    meanPow[f] = a / nT
  }
  let peak = 0
  for (let f = 1; f < nF; f++) if (meanPow[f] > meanPow[peak]) peak = f
  const otherBin = targetBins[1 - ch]
  const bleedDb = 10 * Math.log10(meanPow[otherBin] / meanPow[peak])
  rows.push({ ch, peak, bleedDb })
}

console.log('ch | peak bin (Hz)      | bleed at other channel bin')
for (const r of rows) {
  console.log(`${r.ch}  | ${r.peak} (${freqs[r.peak].toFixed(1)} Hz) | ${r.bleedDb.toFixed(1)} dB`)
}

checkTrue('ch0 peak bin == bin(440 Hz) ±1', Math.abs(rows[0].peak - targetBins[0]) <= 1,
  `peak ${rows[0].peak}, bin(440) ${targetBins[0]}`)
checkTrue('ch1 peak bin == bin(880 Hz) ±1', Math.abs(rows[1].peak - targetBins[1]) <= 1,
  `peak ${rows[1].peak}, bin(880) ${targetBins[1]}`)
checkTrue('ch0 cross-bleed at bin(880) < −40 dB', rows[0].bleedDb < -40, `${rows[0].bleedDb.toFixed(1)} dB`)
checkTrue('ch1 cross-bleed at bin(440) < −40 dB', rows[1].bleedDb < -40, `${rows[1].bleedDb.toFixed(1)} dB`)

summary('multichannel — stereo channel independence through WAV + STFT')
