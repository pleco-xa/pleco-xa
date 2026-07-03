/**
 * feature/ internals — the chroma/mfcc pipeline stages behind the consolidated
 * namespace, plus filters.mel_filterbank, on tones with known ground truth.
 *
 *   - ParameterError: real Error subclass; foldLogSpectrumToChroma throws it
 *     when bins_per_octave != n_chroma (documented modulo-fold limitation),
 *   - chroma_stft on a 440 Hz tone: strongest chroma row is A (index 9),
 *   - piptrackPeaks: the strongest tracked pitch is 440 ± 5 Hz,
 *   - estimate_tuning: 440 Hz → 0.00 ± 0.02 bins; 452 Hz (+46.6 cents) →
 *     +0.47 ± 0.03 bins (both mod-1 tuning offsets),
 *   - logFrequencySpectrum → foldLogSpectrumToChroma: 84 log bins fold to 12
 *     chroma rows, frame count preserved, argmax chroma == A,
 *   - dctBasis(3, 5): orthonormal DCT-II basis — row 0 constant 1/√3, rows
 *     mutually orthogonal (|dot| ≤ 1e-9),
 *   - mfccFromLogMel of a CONSTANT log-mel matrix (c == 1, 4 mels): coeff 0
 *     == c·√n_mels == 2 per frame, higher coefficients exactly ~0,
 *   - spectral_contrast: standard shape (n_bands+1 == 7 rows); white noise has
 *     LOWER mean contrast than a harmonic tone (peaks ≈ valleys in noise),
 *   - filters.mel_filterbank(22050, 2048, 40): shape (40, 1025), non-negative,
 *     filter peak positions strictly increase with mel index.
 */
import { feature, filters } from '../../packages/pleco-xa/dist/pleco-xa.js'
import { check, checkTrue, summary } from './_harness.mjs'

const {
  ParameterError, chroma_stft, estimate_tuning, pitch_tuning, piptrackPeaks,
  logFrequencySpectrum, foldLogSpectrumToChroma, dctBasis, mfccFromLogMel,
  spectral_contrast,
} = feature

const sr = 22050
const tone = (f, n = sr) => {
  const y = new Float32Array(n)
  for (let i = 0; i < n; i++) y[i] = Math.sin((2 * Math.PI * f * i) / sr)
  return y
}
const a440 = tone(440)

// ── ParameterError contract ─────────────────────────────────────────────────
check('ParameterError is an Error subclass', new ParameterError('x') instanceof Error, true)
let threw = null
try { foldLogSpectrumToChroma([[0]], 12, 24) } catch (e) { threw = e }
checkTrue('foldLogSpectrumToChroma(bins_per_octave != n_chroma) throws ParameterError',
  threw instanceof ParameterError, threw ? threw.message.slice(0, 40) : 'no throw')

// ── chroma_stft: A440 lights up chroma row 9 (A) ────────────────────────────
const chroma = chroma_stft(a440, { sr })
check('chroma_stft shape == (12, frames)', chroma.length, 12)
{
  const sums = chroma.map((row) => row.reduce((s, v) => s + v, 0))
  check('chroma_stft(440 Hz): argmax chroma row == 9 (A)', sums.indexOf(Math.max(...sums)), 9)
}

// ── piptrackPeaks + estimate_tuning ─────────────────────────────────────────
{
  const { pitches, mags } = piptrackPeaks({ y: a440, sr })
  let best = 0
  for (let i = 1; i < mags.length; i++) if (mags[i] > mags[best]) best = i
  checkTrue('piptrackPeaks: strongest tracked pitch == 440 ± 5 Hz',
    Math.abs(pitches[best] - 440) <= 5, `${pitches[best].toFixed(2)} Hz`)
}
checkTrue('estimate_tuning(440 Hz tone) == 0.00 ± 0.02 bins',
  Math.abs(estimate_tuning({ y: a440, sr })) <= 0.02,
  estimate_tuning({ y: a440, sr }).toFixed(4))
{
  const t = estimate_tuning({ y: tone(452), sr }) // 12·log2(452/440) ≈ +0.466
  checkTrue('estimate_tuning(452 Hz tone) == +0.47 ± 0.03 bins',
    Math.abs(t - 12 * Math.log2(452 / 440)) <= 0.03, t.toFixed(4))
}

// ── pitch_tuning: the primitive behind estimate_tuning, called DIRECTLY on a
// set of detected frequencies (the pitch_tuning primitive). Take equal-tempered notes
// and detune them by a KNOWN fraction of a semitone; the histogram-mode offset
// must recover that detuning (in fractions of a chroma bin, resolution 0.01).
{
  const etNotes = [220, 261.63, 329.63, 440, 523.25] // A3 C4 E4 A4 C5, on-grid
  const detune = (cents) => etNotes.map((f) => f * 2 ** (cents / 100 / 12))

  check('pitch_tuning(on-grid ET notes) == 0 bins (in tune)',
    pitch_tuning(etNotes), 0)
  check('pitch_tuning(+25-cent-sharp notes) == +0.25 bins',
    pitch_tuning(detune(25)), 0.25, 1e-9)
  check('pitch_tuning(−40-cent-flat notes) == −0.40 bins',
    pitch_tuning(detune(-40)), -0.4, 1e-9)
  // Custom resolution still recovers the sign of the offset.
  checkTrue('pitch_tuning(+30-cent notes, resolution 0.02) is positive ≈ +0.3',
    pitch_tuning(detune(30), { resolution: 0.02 }) > 0.2, pitch_tuning(detune(30), { resolution: 0.02 }).toFixed(3))
  // empty-set contract: an empty frequency set warns and returns 0 (not NaN/throw).
  check('pitch_tuning([]) == 0.0 (empty-set fallback)', pitch_tuning([]), 0)
}

// ── log-frequency spectrum → chroma fold ────────────────────────────────────
{
  const logSpec = logFrequencySpectrum(a440, sr, 512, null, 84, 0.0)
  check('logFrequencySpectrum: 84 bins per frame', logSpec[0].length, 84)
  const folded = foldLogSpectrumToChroma(logSpec, 12, 12)
  check('foldLogSpectrumToChroma: (12, frames) with frame count preserved',
    [folded.length, folded[0].length], [12, logSpec.length])
  const sums = folded.map((row) => row.reduce((s, v) => s + v, 0))
  check('folded chroma argmax == 9 (A) for the 440 Hz tone',
    sums.indexOf(Math.max(...sums)), 9)
}

// ── DCT basis + mfccFromLogMel goldens ──────────────────────────────────────
{
  const basis = dctBasis(3, 5)
  check('dctBasis(3, 5) shape == (5, 3)', [basis.length, basis[0].length], [5, 3])
  checkTrue('dctBasis row 0 is the constant 1/√3 vector (ortho norm)',
    Array.from(basis[0]).every((v) => Math.abs(v - 1 / Math.sqrt(3)) < 1e-12),
    Array.from(basis[0], (v) => +v.toFixed(4)).join(','))
  let maxDot = 0
  for (let i = 0; i < 5; i++) {
    for (let j = i + 1; j < 5; j++) {
      let d = 0
      for (let k = 0; k < 3; k++) d += basis[i][k] * basis[j][k]
      maxDot = Math.max(maxDot, Math.abs(d))
    }
  }
  // 5 rows in 3-dim space cannot ALL be orthogonal; DCT-II rows 0..2 must be.
  let dot012 = 0
  for (let i = 0; i < 3; i++) {
    for (let j = i + 1; j < 3; j++) {
      let d = 0
      for (let k = 0; k < 3; k++) d += basis[i][k] * basis[j][k]
      dot012 = Math.max(dot012, Math.abs(d))
    }
  }
  checkTrue('dctBasis rows 0..2 mutually orthogonal (|dot| ≤ 1e-9)', dot012 <= 1e-9,
    dot012.toExponential(2))

  const constLogMel = Array.from({ length: 4 }, () => Float64Array.from([1, 1, 1]))
  const mf = mfccFromLogMel(constLogMel, { n_mfcc: 3 })
  check('mfccFromLogMel(constant 1, 4 mels): coeff 0 == √4 == 2 per frame',
    Array.from(mf[0], (v) => +v.toFixed(9)), [2, 2, 2])
  checkTrue('mfccFromLogMel(constant): higher coefficients are ~0 (|v| ≤ 1e-9)',
    [1, 2].every((r) => Array.from(mf[r]).every((v) => Math.abs(v) <= 1e-9)),
    `max |c1,c2| = ${Math.max(...[1, 2].map((r) => Math.max(...Array.from(mf[r], Math.abs))))}`)
}

// ── spectral_contrast: tone vs noise ────────────────────────────────────────
{
  const sc = spectral_contrast(a440, { sr })
  check('spectral_contrast shape == (7, frames) (6 bands + 1, default)',
    sc.length, 7)
  let seed = 7
  const lcg = () => (seed = (seed * 1103515245 + 12345) & 0x7fffffff) / 0x7fffffff
  const noise = new Float32Array(sr)
  for (let i = 0; i < sr; i++) noise[i] = lcg() * 2 - 1
  const scn = spectral_contrast(noise, { sr })
  const mean = (M) => {
    let s = 0, n = 0
    for (const row of M) for (const v of row) { s += v; n++ }
    return s / n
  }
  checkTrue('mean contrast: 440 Hz tone > white noise (harmonic peaks vs flat)',
    mean(sc) > mean(scn), `tone=${mean(sc).toFixed(2)} dB vs noise=${mean(scn).toFixed(2)} dB`)
}

// ── filters.mel_filterbank ──────────────────────────────────────────────────
{
  const fb = filters.mel_filterbank(sr, 2048, 40)
  check('mel_filterbank(22050, 2048, 40) shape == (40, 1025)',
    [fb.length, fb[0].length], [40, 1025])
  checkTrue('mel_filterbank: all weights non-negative',
    fb.every((row) => Array.from(row).every((v) => v >= 0)))
  const argmax = fb.map((row) => {
    let b = 0
    for (let i = 1; i < row.length; i++) if (row[i] > row[b]) b = i
    return b
  })
  checkTrue('mel_filterbank: filter peak bins strictly increase with mel index',
    argmax.every((v, i) => i === 0 || v > argmax[i - 1]),
    `first/last peaks: ${argmax[0]} → ${argmax[39]}`)
}

summary('feature/ pipeline internals + filters.mel_filterbank goldens')
