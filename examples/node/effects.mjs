/**
 * effects/index.js — the effects suite on a known signal:
 * trim / split / preemphasis→deemphasis / time_stretch / pitch_shift /
 * hpss / remix, each asserted against closed-form expectations.
 *
 * Signal: 2 s at 22050 Hz — silence, then a 1 s 440 Hz tone burst carrying
 * 4 click transients, then silence (burst edges exactly [11025, 33075]).
 * Also covers the shim surface (xa-trim/xa-split/xa-remix/xa-filters/
 * xa-processing delegate here).
 * Web twin: examples/web/effects.html (same asserts + audible playback).
 */
import { effects, stft, istft } from '../../packages/pleco-xa/dist/pleco-xa.js'
import { check, checkTrue, summary } from './_harness.mjs'

const SR = 22050
const N = 2 * SR // 44100
const BURST = [11025, 33075] // 0.5 s .. 1.5 s

// Mixture: tone burst + 4 clicks inside the burst
const y = new Float32Array(N)
for (let i = BURST[0]; i < BURST[1]; i++) {
  y[i] = 0.8 * Math.sin((2 * Math.PI * 440 * (i - BURST[0])) / SR)
}
for (const tClick of [0.7, 0.9, 1.1, 1.3]) {
  const s = Math.round(tClick * SR)
  for (let k = 0; k < 32; k++) y[s + k] += (k % 2 ? -0.9 : 0.9) * (1 - k / 32)
}
// Pure tone (for the pitch measurements)
const tone = new Float32Array(SR)
for (let i = 0; i < SR; i++) tone[i] = 0.8 * Math.sin((2 * Math.PI * 440 * i) / SR)

/** Zero-crossing pitch estimate over [a, b): sign changes / (2 * seconds). */
function zcPitch(x, sr, a = 0, b = x.length) {
  let zc = 0
  for (let i = a + 1; i < b; i++) {
    if ((x[i - 1] < 0 && x[i] >= 0) || (x[i - 1] >= 0 && x[i] < 0)) zc++
  }
  return zc / (2 * ((b - a) / sr))
}

// ── (1) trim / split: exact frame-quantized burst edges ───────────────────
// The plan's "within 1 hop" tolerance is numerically impossible under
// the trim semantics: trim uses CENTERED 2048-sample RMS frames, so a frame
// whose window merely touches the burst is non-silent — detected edges lead
// the true edges by up to frame_length/2 + hop - 1 samples. The CORRECT
// (stronger) expectation is the exact frame-quantized golden:
//   first frame t with t*512 + 1024 > 11025  → t=20 → start 10240
//   last  frame t with t*512 - 1024 < 33075  → t=66 → end (66+1)*512 = 34304
// plus the enclosure guarantee that trim NEVER cuts into the burst.
const [yTrim, idx] = effects.trim(y)
check('trim index == exact centered-frame golden [10240, 34304]', [...idx], [10240, 34304])
checkTrue('trim edges enclose the true burst (never cuts into signal)',
  idx[0] <= BURST[0] && idx[1] >= BURST[1], `[${idx}] ⊇ [${BURST}]`)
check('trim returns y.slice(start, end)', yTrim.length, idx[1] - idx[0])

const intervals = effects.split(y)
check('split finds exactly one non-silent interval', intervals.length, 1)
check('split interval == the same exact golden (clicks never split the burst)',
  [...intervals[0]], [10240, 34304])

// ── (2) preemphasis → deemphasis round-trip ────────────────────────────────
const pre = effects.preemphasis(y)
const back = effects.deemphasis(pre)
let rtErr = 0
for (let i = 0; i < N; i++) rtErr = Math.max(rtErr, Math.abs(back[i] - y[i]))
checkTrue('deemphasis(preemphasis(y)) maxErr < 1e-6', rtErr < 1e-6, rtErr.toExponential(2))

// ── (3) time_stretch(rate 2): exact length, pitch preserved ────────────────
const yFast = effects.time_stretch(y, 2.0)
check('time_stretch(y, 2.0) length == round(N/2)', yFast.length, Math.round(N / 2))
const toneFast = effects.time_stretch(tone, 2.0)
check('time_stretch(tone, 2.0) length == round(N/2)', toneFast.length, Math.round(SR / 2))
// measure away from the boundary smear (interior 60% of the stretched tone)
const tf0 = Math.round(toneFast.length * 0.2)
const tf1 = Math.round(toneFast.length * 0.8)
check('stretched tone pitch stays 440 Hz ± 2% (pitch PRESERVED)',
  zcPitch(toneFast, SR, tf0, tf1), 440, 8.8)

// ── (4) pitch_shift(+12): octave up, duration unchanged ────────────────────
const up = effects.pitch_shift(tone, SR, 12)
check('pitch_shift(+12) length unchanged', up.length, tone.length)
check('pitch_shift(+12) measures 880 Hz ± 2%',
  zcPitch(up, SR, Math.round(up.length * 0.2), Math.round(up.length * 0.8)), 880, 17.6)

// ── (5) waveform-level hpss: tone → harmonic channel ───────────────────────
const { harmonic, percussive } = effects.hpss(y)
check('hpss harmonic length == y.length', harmonic.length, N)
check('hpss percussive length == y.length', percussive.length, N)
/** Energy at the FFT bin nearest 440 Hz, summed over burst-interior frames. */
function energyAt440(x) {
  const D = stft(x, 2048, 512)
  const bin = Math.round((440 * 2048) / SR) // 41
  let e = 0
  const f0 = Math.ceil((BURST[0] + 2048) / 512)
  const f1 = Math.floor((BURST[1] - 2048) / 512)
  for (let t = f0; t <= f1; t++) {
    const c = D[bin][t]
    e += c.real * c.real + c.imag * c.imag
  }
  return e
}
const ratio440 = energyAt440(harmonic) / energyAt440(percussive)
checkTrue('440 Hz-bin energy: harmonic/percussive > 100', ratio440 > 100, ratio440.toExponential(2))

// ── (6) remix: reverse the two halves of the burst ─────────────────────────
// STRONGER than the planned >0.99 correlation: with align_zeros:false the
// output must equal the hand-swapped slices BIT-EXACTLY (caller-order
// concatenation proof). The default align_zeros path snaps boundaries to the
// nearest zero crossing of y (nearest-crossing snap semantics) — e.g. the
// burst's fade-in edge 11025 sits mid-silence, so it snaps ~25 samples in to
// the tone's first true crossing. A naive unsnapped reference therefore
// DECORRELATES by half a 440 Hz period; the honest reference snaps with an
// independent crossing scan, and then correlation must exceed 0.99.
const A = [BURST[0], 22050]
const B = [22050, BURST[1]]

const remixRaw = effects.remix(y, [B, A], { align_zeros: false })
const handRaw = new Float32Array((B[1] - B[0]) + (A[1] - A[0]))
handRaw.set(y.slice(B[0], B[1]), 0)
handRaw.set(y.slice(A[0], A[1]), B[1] - B[0])
let rawExact = remixRaw.length === handRaw.length
if (rawExact) for (let i = 0; i < handRaw.length; i++) if (remixRaw[i] !== handRaw[i]) { rawExact = false; break }
checkTrue('remix([B,A], align_zeros:false) BIT-EXACTLY equals hand-swapped halves',
  rawExact, `${remixRaw.length} samples`)

// independent nearest-crossing snap (plain sign-change scan + signal ends)
const crossings = [0]
for (let i = 1; i < N; i++) {
  if ((y[i - 1] < 0 && y[i] >= 0) || (y[i - 1] >= 0 && y[i] < 0)) crossings.push(i)
}
crossings.push(N)
const snap = (v) => crossings.reduce((best, c) => Math.abs(c - v) < Math.abs(best - v) ? c : best, crossings[0])
const [a0, a1, b0, b1] = [snap(A[0]), snap(A[1]), snap(B[0]), snap(B[1])]
const handSnap = new Float32Array((b1 - b0) + (a1 - a0))
handSnap.set(y.slice(b0, b1), 0)
handSnap.set(y.slice(a0, a1), b1 - b0)

const remixed = effects.remix(y, [B, A])
const M = Math.min(remixed.length, handSnap.length)
let dot = 0, ea = 0, eb = 0
for (let i = 0; i < M; i++) {
  dot += remixed[i] * handSnap[i]
  ea += remixed[i] * remixed[i]
  eb += handSnap[i] * handSnap[i]
}
const corr = dot / Math.sqrt(ea * eb)
checkTrue('remix([B,A]) default snap correlates > 0.99 with independently-snapped reference',
  corr > 0.99, corr.toFixed(5))

// ── (7) phase_vocoder: the STFT-domain time-stretch primitive time_stretch wraps
// Stretching the STFT of a 440 Hz tone at rate 2 halves the frame count while
// keeping the frequency-bin count, and istft still measures 440 Hz (phase
// vocoding stretches TIME, not pitch). Failure paths throw.
const D = stft(tone, 2048, 512)
const fastD = effects.phase_vocoder(D, 2.0)
check('phase_vocoder(D, 2.0) keeps freq bins (1025)', fastD.length, D.length)
check('phase_vocoder(D, 2.0) frames == ceil(nFrames/2)', fastD[0].length, Math.ceil(D[0].length / 2))
check('phase_vocoder(D, 0.5) frames == nFrames/0.5', effects.phase_vocoder(D, 0.5)[0].length, Math.ceil(D[0].length / 0.5))
check('istft(phase_vocoder(D,2)) still measures 440 Hz ± 2% (TIME stretched, pitch kept)',
  zcPitch(istft(fastD, 512), SR, 2048, istft(fastD, 512).length - 2048), 440, 8.8)
let pvThrew = false
try { effects.phase_vocoder([], 2) } catch { pvThrew = true }
checkTrue('phase_vocoder([]) throws on empty STFT', pvThrew)
let pvThrew2 = false
try { effects.phase_vocoder(D, 0) } catch { pvThrew2 = true }
checkTrue('phase_vocoder(D, 0) throws on non-positive rate', pvThrew2)

summary('effects/index.js — effects suite: trim/split/preemph/stretch/shift/hpss/remix')
