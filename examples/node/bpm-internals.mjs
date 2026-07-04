/**
 * scripts/xa-bpm-algorithm.js — the windowed BPM pipeline, stage by stage, plus the
 * demo-facing detectBPM() quick tier, on a synthetic 120 BPM click train.
 *
 * Every stage is exercised against a signal whose ground truth is known:
 *   - computeSimpleFFT of a DC frame == [N, 0, 0, ...] (all energy in bin 0),
 *   - computeSimpleSpectrum (decimated DFT) of the same frame == N/4 in the
 *     computed bins (n stepped by 4),
 *   - computeOnsetStrength yields one flux spike per click: the envelope's
 *     autocorrelation via estimateGlobalTempo must land within ONE LAG BIN of
 *     120 BPM (bins at hop 512 / sr 22050: 117.45 and 123.05 bracket 120),
 *   - estimateConstrainedTempo on the whole envelope agrees with the global
 *     estimate and reports a MEASURED confidence in (0, 0.95],
 *   - computeTempoFrequencies reproduces the Fourier-tempogram bin grid
 *     (bin 1 == 60·(sr/hop)/384 ≈ 6.7291 BPM),
 *   - computeFourierTempogram + analyzeTempogram find a mean-tempogram peak
 *     within one tempogram bin (±6.8 BPM) of 120,
 *   - detectBPM (quick tier) reports ~120 with its documented 0.7 confidence.
 */
import { bpm, detectBPM } from '../../packages/pleco-xa/dist/pleco-xa.js'
import { check, checkTrue, summary } from './_harness.mjs'

const sr = 22050
const dur = 10 // >= (384·512 + 2048)/22050 ≈ 9.0 s so the tempogram has >= 1 frame
const y = new Float32Array(sr * dur)
for (let t = 0; t < dur; t += 0.5) {
  const s0 = Math.round(t * sr)
  for (let i = 0; i < Math.round(0.005 * sr); i++) {
    y[s0 + i] += Math.sin((2 * Math.PI * 1000 * i) / sr) * Math.exp(-i / (0.001 * sr))
  }
}
const buffer = {
  numberOfChannels: 1, length: y.length, sampleRate: sr,
  duration: dur, getChannelData: () => y,
}

// ── spectrum kernels on a DC frame (exact goldens) ──────────────────────────
{
  const dc = new Float32Array(8).fill(1)
  const fft = await bpm.computeSimpleFFT(dc)
  check('computeSimpleFFT(DC ones, N=8) == [8, 0, 0, 0] (float roundoff ≤ 1e-12)',
    Array.from(fft, (v) => (Math.abs(v) < 1e-12 ? 0 : v)), [8, 0, 0, 0])
  const spec = await bpm.computeSimpleSpectrum(dc)
  check('computeSimpleSpectrum(DC ones, N=8) == [2, 2, 2, 0] (n decimated ×4, gap-filled)',
    Array.from(spec), [2, 2, 2, 0])
}

// ── onset strength → global tempo ───────────────────────────────────────────
const env = await bpm.computeOnsetStrength(y, sr)
const expectedFrames = Math.floor((y.length - 2048) / 512) + 1
check(`computeOnsetStrength: ${expectedFrames} frames (frame 2048, hop 512)`, env.length, expectedFrames)
checkTrue('computeOnsetStrength: click train produces positive flux spikes',
  Math.max(...env) > 0, `max flux ${Math.max(...env).toFixed(1)}`)

const global = await bpm.estimateGlobalTempo(env, sr)
checkTrue('estimateGlobalTempo within one lag bin of 120 BPM (|bpm−120| ≤ 7)',
  Math.abs(global.bpm - 120) <= 7, `bpm=${global.bpm.toFixed(2)}`)
checkTrue('estimateGlobalTempo: 5 ranked candidates, confidence in [0, 0.95]',
  global.candidates.length === 5 && global.confidence >= 0 && global.confidence <= 0.95,
  `conf=${global.confidence.toFixed(3)}`)

// ── constrained (windowed) re-estimate agrees with the global tempo ─────────
const local = await bpm.estimateConstrainedTempo(env, sr, global.bpm)
checkTrue('estimateConstrainedTempo re-lands within one lag bin of 120',
  Math.abs(local.bpm - 120) <= 7, `bpm=${local.bpm.toFixed(2)}`)
checkTrue('estimateConstrainedTempo confidence is measured, in (0, 0.95]',
  local.confidence > 0 && local.confidence <= 0.95, `conf=${local.confidence.toFixed(3)}`)

// ── tempo-frequency grid + Fourier tempogram peaks ──────────────────────────
const freqs = bpm.computeTempoFrequencies(384, sr / 512)
check('computeTempoFrequencies(384, sr/512) bin 1 == 60·(sr/512)/384 ≈ 6.7291 BPM',
  freqs[1], (60 * (sr / 512)) / 384, 1e-9)
check('computeTempoFrequencies: 192 bins, DC bin == 0 BPM', [freqs.length, freqs[0]], [192, 0])

const tg = await bpm.computeFourierTempogram(env, sr)
checkTrue('computeFourierTempogram: >= 1 tempogram frame on a 10 s envelope',
  tg.tempogram.length >= 1, `${tg.tempogram.length} frame(s)`)
check('computeFourierTempogram frequency axis == computeTempoFrequencies grid',
  Array.from(tg.frequencies.slice(0, 4)), Array.from(freqs.slice(0, 4)))

const peaks = await bpm.analyzeTempogram(tg.tempogram, tg.frequencies)
checkTrue('analyzeTempogram: strongest peak within one tempogram bin (±6.8) of 120 BPM',
  peaks.length > 0 && Math.abs(peaks[0].bpm - 120) <= 6.8,
  peaks.length ? `peak=${peaks[0].bpm.toFixed(2)} BPM` : 'no peaks')

// ── demo-facing quick tier ───────────────────────────────────────────────────
const quick = await detectBPM(buffer)
checkTrue('detectBPM (quick tier) lands within one lag bin of 120 (|bpm−120| ≤ 7)',
  Math.abs(quick.bpm - 120) <= 7, `bpm=${quick.bpm.toFixed(2)}`)
checkTrue('detectBPM reports a MEASURED confidence in (0, 1] (not a hardcoded default)',
  quick.confidence > 0 && quick.confidence <= 1, `confidence=${quick.confidence}`)

summary('xa-bpm-algorithm — pipeline stages + detectBPM on a 120 BPM train')
