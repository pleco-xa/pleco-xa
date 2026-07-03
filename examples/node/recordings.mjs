/**
 * recordings — the house corpus with ground truth.
 *
 * Corpus generator: _corpus.mjs synthesizes the
 * shared demo assets (tone-440, chirp-110-880, click-track-120bpm, am-noise
 * vocal stand-in) via encodeWav and writes manifest.json. This script is the
 * verification pass: it re-decodes EVERY file from disk and proves each
 * manifest ground truth by measurement — sr, duration, tone peak bin, chirp
 * start/end frequency, click count, AM envelope periodicity.
 */
import { decodeWav, fft } from '../../packages/pleco-xa/dist/pleco-xa.js'
import { ensureCorpus } from './_corpus.mjs'
import { readFileSync } from 'node:fs'
import { join } from 'node:path'
import { check, checkTrue, summary } from './_harness.mjs'

const { dir, manifest } = ensureCorpus()
console.log(`corpus dir: ${dir}`)

/** Peak frequency of a chunk via FFT argmax (rectangular window). */
function peakHz(y, sr) {
  const spec = fft(y)
  const n = spec.length
  let best = 1
  let bestMag = -1
  for (let k = 1; k <= n / 2; k++) {
    const m = spec[k].real * spec[k].real + spec[k].imag * spec[k].imag
    if (m > bestMag) { bestMag = m; best = k }
  }
  return (best * sr) / n
}

/**
 * Count isolated transient onsets with an arm/re-arm detector: an onset
 * fires once per loud excursion, and the detector re-arms only after a
 * sustained quiet run (so one decaying burst can never double-count).
 */
function countClicks(y, { threshold = 0.3, quiet = 0.05, rearm = 200 } = {}) {
  let count = 0
  let quietRun = rearm // treat the file start as silence
  let armed = true
  for (let i = 0; i < y.length; i++) {
    const a = Math.abs(y[i])
    if (armed && a > threshold) {
      count++
      armed = false
      quietRun = 0
    } else {
      quietRun = a < quiet ? quietRun + 1 : 0
      if (quietRun >= rearm) armed = true
    }
  }
  return count
}

/** Frame-RMS envelope peaks (local max above half the global max). */
function countEnvelopePeaks(y, frameLen = 512) {
  const env = []
  for (let s = 0; s + frameLen <= y.length; s += frameLen) {
    let acc = 0
    for (let i = s; i < s + frameLen; i++) acc += y[i] * y[i]
    env.push(Math.sqrt(acc / frameLen))
  }
  const half = Math.max(...env) / 2
  let count = 0
  let lastPeak = -Infinity
  for (let i = 1; i < env.length - 1; i++) {
    if (env[i] > half && env[i] >= env[i - 1] && env[i] > env[i + 1] && i - lastPeak > 8) {
      count++
      lastPeak = i
    }
  }
  return count
}

const decoded = {}
for (const entry of manifest) {
  const raw = readFileSync(join(dir, entry.file))
  const { channels, sampleRate } = decodeWav(
    raw.buffer.slice(raw.byteOffset, raw.byteOffset + raw.byteLength))
  decoded[entry.key] = { y: channels[0], sr: sampleRate }

  check(`${entry.key}: decoded sr matches manifest`, sampleRate, entry.sr)
  check(`${entry.key}: decoded duration == ${entry.durationSec}s`,
    channels[0].length, Math.round(entry.durationSec * entry.sr))
}

// tone-440: FFT peak within one bin of 440 Hz (16384-sample window → 1.35 Hz bins)
{
  const { y, sr } = decoded['tone-440']
  const hz = peakHz(y.slice(0, 16384), sr)
  check('tone-440: FFT peak == 440 Hz ± 1 bin', hz, 440, sr / 16384)
}

// chirp-110-880: peak of the first/last 2048-sample window must sit within
// ±2 bins of the ANALYTIC instantaneous frequency at that window's center
// (the sweep moves ~36 Hz inside one window, so window-center truth — not the
// raw endpoints 110/880 — is the honest expectation).
{
  const { y, sr } = decoded['chirp-110-880']
  const { fminHz, fmaxHz } = manifest.find((m) => m.key === 'chirp-110-880').truth
  const T = y.length / sr
  const win = 2048
  const bin = sr / win
  const fAt = (tMid) => fminHz + ((fmaxHz - fminHz) * tMid) / T
  const startHz = peakHz(y.slice(0, win), sr)
  const endHz = peakHz(y.slice(y.length - win), sr)
  check(`chirp: start-window peak == f(t=${(win / 2 / sr).toFixed(3)}s) ± 2 bins`,
    startHz, fAt(win / 2 / sr), 2 * bin)
  check(`chirp: end-window peak == f(t=${(T - win / 2 / sr).toFixed(3)}s) ± 2 bins`,
    endHz, fAt(T - win / 2 / sr), 2 * bin)
  checkTrue('chirp: frequency actually swept upward (end − start > 700 Hz)',
    endHz - startHz > 700, `${startHz.toFixed(1)} → ${endHz.toFixed(1)} Hz`)
}

// click-track-120bpm: exactly 20 transients survive the WAV round-trip
{
  const { y } = decoded['click-track-120bpm']
  check('click-track: transient count == 20 (120 BPM × 10 s)', countClicks(y), 20)
}

// am-noise: 3 Hz amplitude modulation ⇒ exactly 24 envelope peaks in 8 s
{
  const { y } = decoded['am-noise']
  check('am-noise: RMS-envelope peaks == 24 (3 Hz × 8 s)', countEnvelopePeaks(y), 24)
}

summary('recordings — house corpus ground-truth verification')
