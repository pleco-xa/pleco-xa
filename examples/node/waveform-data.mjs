/**
 * WaveformData — waveform stats vs analytic sine truth (node surface).
 *
 * Proves the environment-blind claim: analyzeWaveform/getWaveformPeaks only
 * need a duck-typed { getChannelData, length, sampleRate, duration } buffer —
 * no Web Audio, no DOM. Signal: 0.5-amplitude 440 Hz sine, 2 s at 44.1 kHz.
 * Closed-form truth: peak = A, rms = A/sqrt(2), zcr = 2f/sr, crest = sqrt(2).
 */
import { analyzeWaveform, getWaveformPeaks } from '../../packages/pleco-xa/dist/pleco-xa.js'
import { check, checkTrue, summary } from './_harness.mjs'

const sr = 44100
const dur = 2
const f = 440
const amp = 0.5

const n = sr * dur
const data = new Float32Array(n)
for (let i = 0; i < n; i++) data[i] = amp * Math.sin((2 * Math.PI * f * i) / sr)

// Duck-typed buffer — the whole point: no AudioBuffer, no browser.
const buffer = {
  getChannelData: () => data,
  numberOfChannels: 1,
  length: n,
  sampleRate: sr,
  duration: dur,
}

const stats = analyzeWaveform(buffer)
check('peak == A (0.500)', stats.peak, amp, 0.002)
check('rms == A/sqrt(2) (0.3536)', stats.rms, amp / Math.SQRT2, 0.002)
check('zeroCrossingRate == 2f/sr (0.01995)', stats.zeroCrossingRate, (2 * f) / sr, 0.0005)
check('crestFactor == sqrt(2) (1.414)', stats.crestFactor, Math.SQRT2, 0.01)
check('dcOffset ~ 0', stats.dcOffset, 0, 1e-4)

const peaks = getWaveformPeaks(buffer, { width: 800 })
check('peaks length == width (800)', peaks.length, 800)
check('normalized max == 1', Math.max(...peaks.data), 1)
checkTrue(
  'sampleRate/duration pass through',
  peaks.sampleRate === sr && peaks.duration === dur,
  `sr=${peaks.sampleRate} dur=${peaks.duration}`,
)

summary('scripts/analysis/WaveformData.ts — stats vs analytic sine truth')
