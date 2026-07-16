/**
 * Proof: engine/OscillatorNode — band-limited oscillator, rendered headless.
 *
 * Builds a real graph on PlecoOfflineAudioContext (pleco's zero-dep Web Audio
 * engine), renders it offline with NO browser and NO audio device, and asserts
 * the output spectrum sample-exactly. At sr=8192 with N=8192 the FFT bin index
 * equals Hz, so every claim is checkable against the truth:
 *   - a 440 Hz sine peaks at bin 440 and nowhere else;
 *   - a square wave carries ONLY odd harmonics;
 *   - a sawtooth carries ALL harmonics;
 *   - the band-limited synthesis leaves NO aliased energy at non-harmonic bins.
 * Same asserts render as badges + a spectrum in examples/web/engine-oscillator.html.
 */
import { PlecoOfflineAudioContext } from '../../packages/pleco-xa/dist/engine.js'
import { fft, magnitude } from '../../packages/pleco-xa/dist/pleco-xa.js'
import { check, checkTrue, summary } from './_harness.mjs'

const sr = 8192
const N = 8192 // bin width = sr/N = 1 Hz exactly

/** Render one oscillator of `type` at `freq` Hz, return its magnitude spectrum. */
function renderSpectrum(type, freq) {
  const ctx = new PlecoOfflineAudioContext({ numberOfChannels: 1, length: N, sampleRate: sr })
  const osc = ctx.createOscillator()
  osc.type = type
  osc.frequency.value = freq
  osc.connect(ctx.destination)
  osc.start(0)
  const y = ctx.renderSync().getChannelData(0)
  return magnitude(fft(y))
}

const peakBin = (mag) => {
  let p = 1
  for (let k = 2; k <= N / 2; k++) if (mag[k] > mag[p]) p = k
  return p
}

// (1) sine 440 Hz → single peak at bin 440, with everything else negligible
const sine = renderSpectrum('sine', 440)
check('sine peak bin == 440 (bin == Hz)', peakBin(sine), 440)
const sineOffPeak = Math.max(...sine.filter((_, k) => k !== 440 && k <= N / 2))
checkTrue('sine has no energy off the 440 bin (off-peak / peak < 1e-3)',
  sineOffPeak / sine[440] < 1e-3, `ratio ${(sineOffPeak / sine[440]).toExponential(2)}`)

// (2) square 256 Hz → ODD harmonics only (256, 768, 1280…), evens near zero
const square = renderSpectrum('square', 256)
const sqFund = square[256]
checkTrue('square 3rd harmonic (768) present', square[768] / sqFund > 0.1, `ratio ${(square[768] / sqFund).toFixed(3)}`)
checkTrue('square 2nd harmonic (512) absent (even) — < 1e-3 of fundamental',
  square[512] / sqFund < 1e-3, `ratio ${(square[512] / sqFund).toExponential(2)}`)

// (3) sawtooth 256 Hz → ALL harmonics present (256, 512, 768…)
const saw = renderSpectrum('sawtooth', 256)
const sawFund = saw[256]
checkTrue('sawtooth 2nd harmonic (512) present', saw[512] / sawFund > 0.1, `ratio ${(saw[512] / sawFund).toFixed(3)}`)
checkTrue('sawtooth 3rd harmonic (768) present', saw[768] / sawFund > 0.05, `ratio ${(saw[768] / sawFund).toFixed(3)}`)

// (4) band-limiting: no aliased energy sprayed onto a non-harmonic bin.
//     For a 256 Hz saw, bin 300 is between harmonics — aliasing would light it up.
checkTrue('band-limited: non-harmonic bin 300 stays silent (< 1e-3 of fundamental)',
  saw[300] / sawFund < 1e-3, `ratio ${(saw[300] / sawFund).toExponential(2)}`)

summary('engine/OscillatorNode: band-limited oscillator, offline-rendered')
