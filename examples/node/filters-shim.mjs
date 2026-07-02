/**
 * scripts/xa-filters.js — post-repair acceptance: shim round-trip + the
 * wrong local mel/get_window duplicates retired.
 *
 * The module under test is deliberately imported from src (it is a
 * compatibility shim being folded into the canon, not part of the curated
 * dist surface). Proofs:
 *   (1) preemphasis/deemphasis shims ({y, zf} object convention) round-trip
 *       and chain across a 2-block split exactly like a single call;
 *   (2) the re-pointed mel/get_window exports now agree with the librosa
 *       0.11.0 parity fixtures — the old local mel() (HTK math sold as
 *       'slaney', integer-snapped triangle corners) is provably gone.
 */
import {
  preemphasis, deemphasis, mel, get_window,
} from '../../packages/pleco-xa/src/scripts/xa-filters.js'
import { readFileSync } from 'node:fs'
import { fileURLToPath } from 'node:url'
import { check, checkTrue, summary } from './_harness.mjs'

const fixture = (name) => JSON.parse(readFileSync(
  fileURLToPath(new URL(`../../tools/parity/fixtures/${name}`, import.meta.url)), 'utf8'))

// Deterministic pseudo-random test signal (LCG)
const x = new Float32Array(4096)
let s = 42 >>> 0
for (let i = 0; i < x.length; i++) {
  s = (1664525 * s + 1013904223) >>> 0
  x[i] = s / 4294967296 - 0.5
}
const maxErr = (a, b, offset = 0) => {
  let m = 0
  for (let i = 0; i < a.length; i++) m = Math.max(m, Math.abs(a[i] - b[i + offset]))
  return m
}

// ── (1) shim round-trip + {y, zf} block chaining ────────────────────────────
const emphasized = preemphasis(x)
const restored = deemphasis(emphasized)
checkTrue('deemphasis(preemphasis(x)) round-trip maxErr < 1e-6',
  maxErr(restored, x) < 1e-6, `maxErr=${maxErr(restored, x).toExponential(2)}`)

const SPLIT = 2000
const p1 = preemphasis(x.slice(0, SPLIT), 0.97, null, true)
const p2 = preemphasis(x.slice(SPLIT), 0.97, p1.zf, true)
checkTrue('preemphasis {y,zf} chain across 2 blocks == single call EXACTLY',
  maxErr(p1.y, emphasized) === 0 && maxErr(p2.y, emphasized, SPLIT) === 0,
  `block2 maxErr=${maxErr(p2.y, emphasized, SPLIT)}`)

const d1 = deemphasis(emphasized.slice(0, SPLIT), 0.97, null, true)
const d2 = deemphasis(emphasized.slice(SPLIT), 0.97, d1.zf, true)
checkTrue('deemphasis {y,zf} chain across 2 blocks matches single call < 1e-6',
  maxErr(d1.y, restored) < 1e-6 && maxErr(d2.y, restored, SPLIT) < 1e-6,
  `block2 maxErr=${maxErr(d2.y, restored, SPLIT).toExponential(2)}`)
checkTrue('return_zf=true returns the {y, zf} object convention',
  p1.y instanceof Float32Array && typeof p1.zf === 'number', `zf=${p1.zf.toFixed(4)}`)

// ── (2) repair gate: re-pointed exports match the parity fixtures ───────────
for (const c of fixture('mel_filterbank.json').cases) {
  const { sr, n_fft, n_mels, htk, norm } = c.input
  const fb = mel(sr, n_fft, n_mels, 0.0, null, htk, norm)
  const [rows, cols] = c.expected_shape
  let err = 0
  let k = 0
  for (let i = 0; i < rows; i++) {
    for (let j = 0; j < cols; j++) err = Math.max(err, Math.abs(fb[i][j] - c.expected[k++]))
  }
  checkTrue(
    `mel(sr=${sr}, n_fft=${n_fft}, n_mels=${n_mels}, htk=${htk}, norm=${norm}) vs fixture < 1e-6`,
    fb.length === rows && fb[0].length === cols && err < 1e-6,
    `shape=${fb.length}x${fb[0].length} maxErr=${err.toExponential(2)}`,
  )
}
for (const c of fixture('windows.json').cases) {
  const w = get_window(c.input.window, c.input.n)
  let err = 0
  for (let i = 0; i < c.input.n; i++) err = Math.max(err, Math.abs(w[i] - c.expected[i]))
  checkTrue(`get_window('${c.input.window}', ${c.input.n}) vs fixture < 1e-6`,
    err < 1e-6, `maxErr=${err.toExponential(2)}`)
}

// The placeholder-quality family is gone (no more 'Coefficients would be
// computed here' objects or bare-triangle 'semitone' banks).
const retired = await import('../../packages/pleco-xa/src/scripts/xa-filters.js')
check('retired exports (_multirate_fb / semitone_filterbank / constant_q / wavelet) removed',
  ['_multirate_fb', 'semitone_filterbank', 'constant_q', 'wavelet', 'window_sumsquare', 'cq_to_chroma']
    .filter((name) => name in retired),
  [])

summary('scripts/xa-filters.js — shim round-trip + mel/get_window re-pointed at canon')
