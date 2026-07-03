/**
 * decompose vocal separation — REAL ground truth (Orphans stems).
 *
 * The previous vocal-separation proofs injected a SYNTHETIC vocal into a beat
 * so the "true" parts were known by construction. This one uses Cameron's real
 * Orphans master and its real stems, decoded with the package's own decodeWav:
 *   input      = orphans-mix.wav          (the real 22.05 kHz mono master, 16 s)
 *   true vocal = orphans-vocals.wav       (the isolated vocal stem)
 *   true backg = orphans-instrumental.wav (summed non-vocal stems)
 * The master is the sample-exact linear sum of the stems
 * (‖mix−(voc+ins)‖² / ‖mix‖² = 0.0009), and the stems are mutually decorrelated
 * (corr(voc,ins) = 0.016) — so a plain time-domain Pearson correlation against
 * each stem is an honest recovery metric: everything shares the master's phase.
 *
 * Two separators run on the identical mixture:
 *   A. REPET-SIM (librosa gallery recipe, UNSUPERVISED) —
 *      decompose.nn_filter(|STFT|, median, cosine, width=2 s) → element-min with
 *      S → decompose.softmask (margins 2/10, power 2) → istft with mix phase.
 *   B. fingerprint (pleco flagship, SUPERVISED — it is handed the true vocal's
 *      fingerprints) — processAudioToFingerprints → optimizeEqCurves →
 *      reconstructVocal.
 *
 * The gate (per the honest earlier finding: the supervised method wins on real
 * percussion-heavy material) is B's vocal-vs-instrumental correlation ordering.
 * A's numbers are REPORTED honestly, not hidden: on this material REPET also
 * flips the raw-mix ordering, but by a smaller margin and its foreground keeps
 * far less of the vocal than the fingerprint reconstruction does.
 *
 * Metrics achieved (deterministic, this material):
 *   raw mix   corr voc 0.335 | ins 0.947   (instrumental-dominated — vocal buried)
 *   REPET fg  corr voc 0.438 | ins 0.246   projSDR voc −6.24 | ins −11.91 dB
 *   REPET bg  corr voc 0.187 | ins 0.834   (background carries the backing)
 *   FP recon  corr voc 0.744 | ins 0.514   projSDR voc +0.92 | ins  −4.46 dB
 * Web twin: examples/web/vocal-separation-real.html (mix / est-vocal / est-bg
 * audition rows + correlation badges + spectrograms).
 */
import fs from 'node:fs'
import { decompose, stft, istft, decodeWav } from '../../packages/pleco-xa/dist/pleco-xa.js'
import { check, checkTrue, summary } from './_harness.mjs'

const { nn_filter, softmask, processAudioToFingerprints, optimizeEqCurves, reconstructVocal } = decompose

// ── decode the real master + stems with the package's own decodeWav ──────────
const AUDIO = '../../apps/demo/public/audio/'
const loadMono = (name) => {
  const raw = fs.readFileSync(new URL(AUDIO + name, import.meta.url))
  const wav = decodeWav(raw.buffer.slice(raw.byteOffset, raw.byteOffset + raw.byteLength))
  return wav
}
const mixW = loadMono('orphans-mix.wav')
const vocW = loadMono('orphans-vocals.wav')
const insW = loadMono('orphans-instrumental.wav')

const SR = mixW.sampleRate
const mix = mixW.channels[0]
const voc = vocW.channels[0]
const ins = insW.channels[0]
const N = Math.min(mix.length, voc.length, ins.length)

check('all three stems share the sample rate (mix)', mixW.sampleRate, 22050)
check('all three stems share the sample rate (voc)', vocW.sampleRate, 22050)
check('all three stems share the sample rate (ins)', insW.sampleRate, 22050)
check('all three stems are mono', mixW.channels.length + vocW.channels.length + insW.channels.length, 3)

// ── ground-truth sanity: master == voc + ins, stems decorrelated ─────────────
let resid = 0, mixE = 0
for (let k = 0; k < N; k++) { const s = voc[k] + ins[k]; resid += (mix[k] - s) ** 2; mixE += mix[k] ** 2 }
checkTrue('master is the sample-exact sum of the stems: ‖mix−(voc+ins)‖²/‖mix‖² < 0.01',
  resid / mixE < 0.01, (resid / mixE).toExponential(2))

// ── metrics ──────────────────────────────────────────────────────────────────
const corr = (a, b) => {
  const n = Math.min(a.length, b.length, N)
  let sa = 0, sb = 0
  for (let k = 0; k < n; k++) { sa += a[k]; sb += b[k] }
  const ma = sa / n, mb = sb / n
  let num = 0, da = 0, db = 0
  for (let k = 0; k < n; k++) { const x = a[k] - ma, y = b[k] - mb; num += x * y; da += x * x; db += y * y }
  return num / Math.sqrt(da * db)
}
// normalized-projection SDR-proxy: how much of the estimate lies along the ref
// direction vs off it. proj = (⟨est,ref⟩/⟨ref,ref⟩)·ref; SDR = 10log10(‖proj‖²/‖est−proj‖²)
const projSDR = (est, ref) => {
  const n = Math.min(est.length, ref.length, N)
  let dot = 0, rr = 0
  for (let k = 0; k < n; k++) { dot += est[k] * ref[k]; rr += ref[k] * ref[k] }
  const a = dot / rr
  let pe = 0, re = 0
  for (let k = 0; k < n; k++) { const p = a * ref[k]; pe += p * p; const r = est[k] - p; re += r * r }
  return 10 * Math.log10(pe / re)
}

checkTrue('corr(voc, ins) ≈ 0 — the real stems are mutually decorrelated',
  Math.abs(corr(voc, ins)) < 0.1, corr(voc, ins).toFixed(4))

const N_FFT = 2048
const HOP = 1024

// ── A. REPET-SIM (unsupervised) ───────────────────────────────────────────────
const D = stft(mix, N_FFT, HOP)
const S_full = D.map((row) => Float64Array.from(row, (c) => Math.hypot(c.real, c.imag)))
const nF = S_full.length
const nT = S_full[0].length
const widthFrames = Math.round((2 * SR) / HOP) // librosa: width = time_to_frames(2 s)
const S_filter = nn_filter(S_full, { aggregate: 'median', metric: 'cosine', width: widthFrames })
for (let f = 0; f < nF; f++) for (let t = 0; t < nT; t++) S_filter[f][t] = Math.min(S_full[f][t], S_filter[f][t])

const margin_i = 2, margin_v = 10, power = 2
const S_minus = S_full.map((row, f) => Float64Array.from(row, (v, t) => v - S_filter[f][t]))
const mask_i = softmask(S_filter, S_minus.map((row) => row.map((v) => margin_i * v)), { power })
const mask_v = softmask(S_minus, S_filter.map((row) => row.map((v) => margin_v * v)), { power })
const applyMask = (mask) => D.map((row, f) => row.map((c, t) => ({ real: c.real * mask[f][t], imag: c.imag * mask[f][t] })))
const repetVocal = istft(applyMask(mask_v), HOP, null, 'hann', true, N) // foreground = vocal estimate
const repetBackg = istft(applyMask(mask_i), HOP, null, 'hann', true, N) // background = backing estimate

// ── B. fingerprint (supervised: target = the true vocal stem) ─────────────────
const mockBuf = (d) => ({ getChannelData: () => d, sampleRate: SR, length: d.length })
const silent = console.log
console.log = () => {} // hush the library's phase banners so the proof table is clean
const vocalFp = processAudioToFingerprints(mockBuf(voc), N_FFT, HOP)
const mixFp = processAudioToFingerprints(mockBuf(mix), N_FFT, HOP)
let maxMag = 0
for (const row of mixFp.magnitudeSpec) for (const v of row) if (v > maxMag) maxMag = v
const LR = 0.5 / (maxMag * maxMag) // full-batch GD stability bound: lr < 1/max(|STFT|)²
const eq = optimizeEqCurves(vocalFp.fingerprints, mixFp.fingerprints, mixFp.magnitudeSpec, mixFp.numWindows, SR, 100, LR)
const fpVocal = reconstructVocal(mixFp.stftResult, eq, SR, N_FFT, HOP)
console.log = silent

// ── correlations ──────────────────────────────────────────────────────────────
const cMixV = corr(mix, voc), cMixI = corr(mix, ins)
const cRpV = corr(repetVocal, voc), cRpI = corr(repetVocal, ins)
const cRbV = corr(repetBackg, voc), cRbI = corr(repetBackg, ins)
const cFpV = corr(fpVocal, voc), cFpI = corr(fpVocal, ins)

// ── printed metric table ────────────────────────────────────────────────────
const row = (name, v, i) => `  ${name.padEnd(26)} voc ${v.toFixed(3).padStart(6)} | ins ${i.toFixed(3).padStart(6)}`
console.log('\n=== recovery vs REAL stems (time-domain Pearson correlation) ===')
console.log(row('raw mixture', cMixV, cMixI) + '   (instrumental-dominated)')
console.log(row('A. REPET-SIM vocal (fg)', cRpV, cRpI))
console.log(row('A. REPET-SIM backing (bg)', cRbV, cRbI))
console.log(row('B. fingerprint vocal', cFpV, cFpI))
console.log('\n=== SDR-proxy (normalized projection, dB) ===')
console.log(`  A. REPET-SIM vocal   ->voc ${projSDR(repetVocal, voc).toFixed(2)} | ->ins ${projSDR(repetVocal, ins).toFixed(2)}`)
console.log(`  B. fingerprint vocal ->voc ${projSDR(fpVocal, voc).toFixed(2)} | ->ins ${projSDR(fpVocal, ins).toFixed(2)}`)
let bgE = 0, insE = 0
for (let k = 0; k < N; k++) { bgE += repetBackg[k] ** 2; insE += ins[k] ** 2 }
console.log(`\n  REPET background retains ${((100 * bgE) / insE).toFixed(1)} % of the true instrumental energy`)

// ── (0) the problem: the raw mix is dominated by the instrumental ─────────────
checkTrue('raw mix is instrumental-dominated: corr(mix,ins) > corr(mix,voc)',
  cMixI > cMixV, `${cMixI.toFixed(3)} vs ${cMixV.toFixed(3)}`)

// ── (1) GATE — the supervised fingerprint estimate correlates HIGHER with the
//        true vocal than with the true instrumental, by a clear margin ─────────
checkTrue('GATE fingerprint: corr(vocal,voc) − corr(vocal,ins) > 0.1',
  cFpV - cFpI > 0.1, `${cFpV.toFixed(3)} − ${cFpI.toFixed(3)} = ${(cFpV - cFpI).toFixed(3)}`)

// ── (2) it recovers vocal structure that was buried in the mix ───────────────
checkTrue('fingerprint lifts the vocal out of the mix: corr(vocal,voc) > corr(mix,voc)',
  cFpV > cMixV, `${cFpV.toFixed(3)} > ${cMixV.toFixed(3)}`)

// ── (3) the supervised method beats REPET on vocal fidelity ──────────────────
checkTrue('fingerprint recovers the vocal more faithfully than REPET: corr_fp(voc) > corr_repet(voc)',
  cFpV > cRpV, `${cFpV.toFixed(3)} > ${cRpV.toFixed(3)}`)

// ── (4) fingerprint SDR-proxy ordering ───────────────────────────────────────
checkTrue('fingerprint SDR-proxy: projSDR(vocal→voc) > projSDR(vocal→ins)',
  projSDR(fpVocal, voc) > projSDR(fpVocal, ins),
  `${projSDR(fpVocal, voc).toFixed(2)} > ${projSDR(fpVocal, ins).toFixed(2)} dB`)

// ── (5) REPET (unsupervised) — reported honestly. On this material it too
//        flips the raw ordering, but by a smaller margin than the fingerprint ─
checkTrue('REPET-SIM vocal also flips the ordering here: corr(vocal,voc) > corr(vocal,ins)',
  cRpV > cRpI, `${cRpV.toFixed(3)} vs ${cRpI.toFixed(3)} (gap ${(cRpV - cRpI).toFixed(3)} < fingerprint's ${(cFpV - cFpI).toFixed(3)})`)

// ── (6) REPET background is the backing, not the vocal ───────────────────────
checkTrue('REPET-SIM background carries the instrumental: corr(bg,ins) > corr(bg,voc)',
  cRbI > cRbV, `${cRbI.toFixed(3)} vs ${cRbV.toFixed(3)}`)

summary('decompose vocal separation on REAL Orphans stems — supervised fingerprint wins the recovery gate')
