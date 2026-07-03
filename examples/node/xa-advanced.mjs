/**
 * Proof: scripts/xa-advanced.js — Griffin-Lim reconstruction A/B (post-repair).
 *
 * Before the tier-2/3 repairs griffinlim returned a LENGTH-1 array: it called
 * istft(S, hop, win_length, n_fft, window, ...) against the real signature
 * istft(D, hop_length, win_length, window, center, length), so n_fft landed in
 * the window slot and center=true landed in length, slicing the output to one
 * sample (and its stft call shifted dtype into pad_mode). This demo is the
 * repair gate: a 440+660 Hz chord's |STFT| goes through griffinlim and must
 * come back as audio-length, pitch-correct, spectrally converging signal.
 *
 * init=null (zero phase) makes every run deterministic, so the per-iteration
 * convergence numbers below are stable goldens, not random-init luck.
 * Spot-run goldens (node, 2026-07-02): errs k=1..8 = 0.4432 0.3728 0.3551
 * 0.3491 0.3447 0.3413 0.3390 0.3372; relErr(32) = 0.0977; FFT peak 441.43 Hz.
 */
import { stft, griffinlim, fft } from '../../packages/pleco-xa/dist/pleco-xa.js'
import { check, checkTrue, summary } from './_harness.mjs'

const SR = 22050
const N = SR // 1 s
const N_FFT = 1024
const HOP = 256

// 440 Hz fundamental (dominant) + 660 Hz fifth
const y = new Float32Array(N)
for (let i = 0; i < N; i++) {
  y[i] = 0.6 * Math.sin((2 * Math.PI * 440 * i) / SR) + 0.3 * Math.sin((2 * Math.PI * 660 * i) / SR)
}

// Target magnitude spectrogram
const D = stft(y, N_FFT, HOP)
const S = D.map((row) => Float64Array.from(row, (c) => Math.hypot(c.real, c.imag)))
check('|STFT| shape 513 x 87', `${S.length}x${S[0].length}`, '513x87')

/** Relative spectral-convergence error ‖|STFT(rec)| − S‖ / ‖S‖ (L2). */
function relErr(rec) {
  const D2 = stft(rec, N_FFT, HOP)
  let num = 0
  let den = 0
  for (let f = 0; f < S.length; f++) {
    for (let t = 0; t < S[f].length; t++) {
      const bin = D2[f] && D2[f][t] ? D2[f][t] : { real: 0, imag: 0 }
      const m2 = Math.hypot(bin.real, bin.imag)
      num += (m2 - S[f][t]) ** 2
      den += S[f][t] ** 2
    }
  }
  return Math.sqrt(num / den)
}

// griffinlim positional signature:
// (S, n_iter, hop, win_length, n_fft, window, center, dtype, length, pad_mode, momentum, init)
const gl = (iters) =>
  griffinlim(S, iters, HOP, null, null, 'hann', true, null, N, 'constant', 0.99, null)

/* ── the 1-sample regression: output must be audio-length ─────────────────── */
const y32 = gl(32)
check('griffinlim(32) length == 22050 (NOT the 1-sample regression)', y32.length, N)
checkTrue('reconstruction all finite', Array.from(y32).every(Number.isFinite))

/* ── per-iteration spectral convergence strictly decreases (k = 1..8) ─────── */
const errs = []
for (let k = 1; k <= 8; k++) errs.push(relErr(gl(k)))
console.log('spectral-convergence error by iteration (deterministic zero-phase init):')
console.log('  k=1..8: ' + errs.map((e) => e.toFixed(4)).join('  '))
const strictlyDecreasing = errs.every((e, i) => i === 0 || e < errs[i - 1])
checkTrue(
  'convergence error strictly decreases over the first 8 iterations',
  strictlyDecreasing,
  errs.map((e) => e.toFixed(3)).join('>'),
)

/* ── after 32 iterations the magnitude is recovered to <10% relative L2 ────── */
const e32 = relErr(y32)
checkTrue('relative L2 error of |STFT(recon)| vs target < 0.1 after 32 iters', e32 < 0.1, e32.toFixed(4))

/* ── pitch survives the phase reconstruction: FFT peak within 1% of 440 ───── */
const M = 16384
const spec = fft(y32.slice(0, M))
let pk = 1
for (let i = 1; i < M / 2; i++) {
  if (Math.hypot(spec[i].real, spec[i].imag) > Math.hypot(spec[pk].real, spec[pk].imag)) pk = i
}
const peakHz = (pk * SR) / M
checkTrue('FFT-peak pitch of reconstruction within 1% of 440 Hz', Math.abs(peakHz - 440) / 440 < 0.01, `${peakHz.toFixed(2)} Hz`)

summary('xa-advanced: Griffin-Lim reconstruction post-repair')
