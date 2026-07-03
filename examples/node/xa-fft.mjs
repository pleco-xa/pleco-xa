/**
 * Proof: scripts/xa-fft.js — FFT/STFT known-tone proof.
 * 440 Hz sine at sr=8192 with N=8192 makes bin index == Hz exactly: fft()
 * peak magnitude bin must be 440. ifft(fft([1,2,3,4])) must return 1,2,3,4
 * exactly. stft(1024/256) per-frame peak bin must be 55 (== 440 Hz at 8 Hz/bin)
 * and istft(stft(y)) must reconstruct the interior to maxErr < 1e-4.
 * Same asserts render as badges + spectrogram in examples/web/xa-fft.html.
 */
import {
  fft, ifft, stft, istft, magnitude, spectrogram,
  hann_window, hamming_window, blackman_window, phase, polar_to_complex,
} from '../../packages/pleco-xa/dist/pleco-xa.js'
import { check, checkTrue, summary } from './_harness.mjs'

const sr = 8192
const N = 8192
const y = new Float32Array(N)
for (let i = 0; i < N; i++) y[i] = Math.sin((2 * Math.PI * 440 * i) / sr)

// (1) fft peak bin == 440 exactly (bin width = sr/N = 1 Hz)
const mag = magnitude(fft(y))
let peak = 0
for (let k = 1; k <= N / 2; k++) if (mag[k] > mag[peak]) peak = k
check('fft peak magnitude bin == 440 (bin == Hz)', peak, 440)

// (2) ifft(fft(x)) identity on [1,2,3,4] — exact
const rt = ifft(fft([1, 2, 3, 4])).map((b) => b.real)
check('ifft(fft([1,2,3,4])) == [1,2,3,4] exactly', rt, [1, 2, 3, 4])

// (3) stft shape + per-frame peak-bin row (the node "spectrogram")
const D = stft(y, 1024, 256)
check('stft rows == n_fft/2+1', D.length, 513)
const S = spectrogram(y, 1024, 256)
const nFrames = S[0].length
const peakBins = []
for (let t = 0; t < nFrames; t++) {
  let p = 0
  for (let f = 1; f < S.length; f++) if (S[f][t] > S[p][t]) p = f
  peakBins.push(p)
}
console.log(`per-frame peak bins (${nFrames} frames, 8 Hz/bin):`)
console.log('  ' + peakBins.join(' '))
const interiorBins = peakBins.slice(2, -2) // edge frames see mostly pad
checkTrue('every interior frame peak bin == 55 (440 Hz)', interiorBins.every((b) => b === 55), `bins ${[...new Set(interiorBins)].join(',')}`)

// (4) istft roundtrip: interior reconstruction maxErr < 1e-4
const yHat = istft(D, 256, null, 'hann', true, y.length)
check('istft output length == input length', yHat.length, y.length)
let maxErr = 0
for (let i = 1024; i < N - 1024; i++) maxErr = Math.max(maxErr, Math.abs(yHat[i] - y[i]))
checkTrue('istft(stft(y)) interior maxErr < 1e-4', maxErr < 1e-4, `maxErr ${maxErr.toExponential(3)}`)

// (5) window functions — closed-form n=4 goldens (periodic/DFT convention, ÷n)
check('hann_window(4) == [0, 0.5, 1, 0.5]',
  Array.from(hann_window(4)).map((x) => +x.toFixed(4)), [0, 0.5, 1, 0.5])
check('hamming_window(4) == [0.08, 0.54, 1, 0.54]',
  Array.from(hamming_window(4)).map((x) => +x.toFixed(4)), [0.08, 0.54, 1, 0.54])
check('blackman_window(4) == [0, 0.34, 1, 0.34]',
  Array.from(blackman_window(4)).map((x) => +x.toFixed(4)), [0, 0.34, 1, 0.34])

// (6) polar_to_complex ∘ (magnitude, phase) reconstructs the spectrum
const spec = [{ real: 3, imag: 4 }, { real: -1, imag: 0 }, { real: 0, imag: 2 }]
const rebuilt = polar_to_complex(magnitude(spec), phase(spec))
let rebErr = 0
for (let i = 0; i < spec.length; i++) {
  rebErr = Math.max(rebErr, Math.abs(rebuilt[i].real - spec[i].real), Math.abs(rebuilt[i].imag - spec[i].imag))
}
checkTrue('polar_to_complex(magnitude(S), phase(S)) reconstructs S (maxErr < 1e-6)',
  rebErr < 1e-6, `maxErr ${rebErr.toExponential(3)}`)

summary('xa-fft: FFT/STFT known-tone proof')
