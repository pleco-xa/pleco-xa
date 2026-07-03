/**
 * scripts/xa-normalize.js — normalization exactness proof.
 * Known-vector goldens: inf-norm normalize is exact, rms_normalize hits its
 * target when re-measured, softmask on equal energy is exactly half (the
 * librosa-correct X^p/(X^p+Xref^p) form), and crossfade length/blend math holds.
 * (xa-normalize is not on the dist curated surface yet — imported from src;
 * pure ESM, zero dependencies.)
 */
import { normalize, rms_normalize, softmask, crossfade } from '../../packages/pleco-xa/src/scripts/xa-normalize.js'
import { check, checkTrue, summary } from './_harness.mjs'

const v = [0.1, -0.5, 0.25]

const out = normalize(v) // default: inf-norm (divide by max |x| = 0.5)
checkTrue('normalize(v) inf-norm == [0.2, -1, 0.5] exactly',
  out[0] === 0.2 && out[1] === -1 && out[2] === 0.5, JSON.stringify(out))
check('max|normalize(v)| == 1', Math.max(...out.map(Math.abs)), 1)

const r = rms_normalize(v, 0.1)
const measuredRms = Math.sqrt(r.reduce((s, x) => s + x * x, 0) / r.length)
check('rms_normalize(v, 0.1) -> re-measured RMS == 0.1', measuredRms, 0.1, 1e-6)

check('softmask([1,2], [1,2]) == [0.5, 0.5] (equal energy -> half mask)',
  softmask([1, 2], [1, 2]), [0.5, 0.5])

const cf = crossfade(new Float32Array([1, 2, 3, 4]), new Float32Array([10, 20, 30, 40]), 2)
check('crossfade(len4, len4, overlap 2) length == 6', cf.length, 6)
// Overlap sample at t=0.5 blends y1[3]=4 and y2[1]=20 linearly -> 12
check('overlap midpoint == linear blend (0.5·4 + 0.5·20 = 12)', cf[3], 12)
check('full crossfade output == [1,2,3,12,30,40]', Array.from(cf), [1, 2, 3, 12, 30, 40])

summary('xa-normalize — normalization exactness proof')
