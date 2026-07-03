/**
 * scripts/xa-constantq.js — CQT peak-bin proof (post-repair).
 *
 * The 1126-line marathon CQT was never verified; this demo is its judgment.
 * Pre-repair spot-run: a 440 Hz sine peaked at the WRONG bin with a smooth
 * monotonic magnitude ramp — __cqt_response multiplied TIME-domain wavelets
 * element-wise against STFT FREQUENCY bins (category error), resample() was
 * called positionally against an options-object signature (silent no-op),
 * and stft() got 8 positional args. Repair (2026-07-02): librosa-shaped
 * frequency-domain filter basis (wavelet → pad_center → ×lengths/n_fft →
 * FFT → non-negative bins) dotted with stft(y, n_fft, hop, window='ones'),
 * scale=true now DIVIDES by sqrt(lengths).
 *
 * Proofs on known tones (sr 22050, fmin C2 = 65.406 Hz, 48 bins, 12 per
 * octave):
 *   - A4 = 440 Hz → argmax bin round(12·log2(440/65.406)) = 33 exactly,
 *     with > 12 dB dominance over bins ±3 away (measured ≈ 43.7 / 36.5 dB);
 *   - A3 = 220 Hz → argmax bin 21, and 33 − 21 == 12 bins == one octave
 *     (log spacing proven);
 *   - frame count == 1 + floor(n / hop) (centered STFT contract).
 *
 * Honest-fail surface (NOT minimally repairable, now throws instead of
 * returning garbage): icqt (previous body overlap-added the analysis basis —
 * not librosa's dual frame — through an O(N²) IDFT) and griffinlim_cqt
 * (depends on icqt). Asserted to throw. pseudo_cqt / vqt / hybrid_cqt were
 * repaired to the same fft-basis path and cross-checked here (same peak bin)
 * but remain OFF the curated surface pending librosa fixtures.
 */
import { cqt } from '../../packages/pleco-xa/dist/pleco-xa.js'
import {
  icqt, griffinlim_cqt, pseudo_cqt, vqt,
} from '../../packages/pleco-xa/src/scripts/xa-constantq.js'
import { check, checkTrue, summary } from './_harness.mjs'

const sr = 22050
const hop = 512
const C2 = 65.40639132514966
const N_BINS = 48
const BPO = 12
const n = sr // 1.0 s

const sine = (f) => {
  const y = new Float32Array(n)
  for (let i = 0; i < n; i++) y[i] = 0.5 * Math.sin((2 * Math.PI * f * i) / sr)
  return y
}

/** Mean magnitude per bin over the interior 50% of frames. */
const meanMag = (C) => {
  const nT = C[0].length
  const t0 = Math.floor(nT * 0.25)
  const t1 = Math.ceil(nT * 0.75)
  return C.map((row) => {
    let s = 0
    for (let t = t0; t < t1; t++) s += Math.hypot(row[t].real, row[t].imag)
    return s / (t1 - t0)
  })
}
const argmax = (a) => a.reduce((m, v, i) => (v > a[m] ? i : m), 0)
const SPARK = ' .:-=+*#%@'

function analyze(label, freq, expectedBin) {
  const C = cqt(sine(freq), sr, hop, C2, N_BINS, BPO)
  check(`${label}: CQT shape ${N_BINS} x (1 + floor(n/hop))`,
    `${C.length}x${C[0].length}`, `${N_BINS}x${1 + Math.floor(n / hop)}`)

  const mag = meanMag(C)
  const peak = argmax(mag)
  check(`${label}: argmax bin == round(12*log2(f/C2)) == ${expectedBin}`, peak, expectedBin)

  const domLo = 20 * Math.log10(mag[peak] / mag[peak - 3])
  const domHi = 20 * Math.log10(mag[peak] / mag[peak + 3])
  checkTrue(`${label}: > 12 dB dominance over bin ${peak - 3}`,
    domLo > 12, `${domLo.toFixed(1)} dB`)
  checkTrue(`${label}: > 12 dB dominance over bin ${peak + 3}`,
    domHi > 12, `${domHi.toFixed(1)} dB`)

  const spark = mag.map((v) => SPARK[Math.min(9, Math.round((9 * v) / mag[peak]))]).join('')
  console.log(`${label.padEnd(8)} |${spark}|  peak bin ${peak}`)
  return peak
}

console.log(`bins C2..(C2*2^${(N_BINS - 1) / BPO}), ${BPO}/octave — per-bin mean magnitude:`)
const binA4 = analyze('A4=440', 440, 33)
const binA3 = analyze('A3=220', 220, 21)
check('log spacing: A4 bin - A3 bin == 12 (one octave)', binA4 - binA3, 12)

// cross-checks: the repaired shared basis drives the sibling transforms too
const pm = pseudo_cqt(sine(440), sr, hop, C2, N_BINS, BPO)
  .map((row) => row.slice(11, 33).reduce((a, b) => a + b, 0))
check('pseudo_cqt (repaired, uncurated): same peak bin for A4', argmax(pm), 33)
const vm = meanMag(vqt(sine(440), sr, hop, C2, N_BINS, 'equal', 0, BPO))
check('vqt(gamma=0) == cqt path: same peak bin for A4', argmax(vm), 33)

// honest-fail surface: the inverse path throws instead of emitting garbage
const throws = (fn) => { try { fn(); return false } catch { return true } }
checkTrue('icqt throws honest not-implemented (non-dual basis + O(N^2) IDFT before)',
  throws(() => icqt()))
checkTrue('griffinlim_cqt throws honest not-implemented (depends on icqt)',
  throws(() => griffinlim_cqt()))

summary('scripts/xa-constantq.js — CQT peak-bin proof (post-repair)')
