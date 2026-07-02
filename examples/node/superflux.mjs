/**
 * plot_superflux — Superflux vs vanilla flux: vibrato immunity (librosa
 * plot_superflux advanced-example replica).
 *
 * Four notes with heavy vibrato (±30 cents at 6 Hz) at known onset times,
 * analyzed at the gallery's ~5 ms hop (sr/200 — vanilla flux only "hears"
 * vibrato at high time resolution). Both ODFs are peak-picked with identical
 * librosa onset_detect parameters via the promoted peakPick:
 *   - superflux (n_mels 138, fmin 27.5, fmax 16000, lag 2, max_size 3) must
 *     fire EXACTLY 4 times, each within ±2 hops of ground truth;
 *   - the default ODF must fire MORE than 4 times (vibrato false positives).
 * The web page (superflux.html) reruns the identical asserts in the browser —
 * the environment-blind claim.
 */
import { onset_strength, feature, convert, peakPick } from '../../packages/pleco-xa/dist/pleco-xa.js'
import { check, checkTrue, summary } from './_harness.mjs'

const sr = 22050
const hop = 110 // ≈5 ms, librosa superflux example uses sr/200
const n_fft = 1024
const noteOn = [0.2, 1.2, 2.2, 3.2]
const noteFreq = [440, 523.25, 392, 587.33]

// 4-note vibrato melody: ±30 cents at 6 Hz, 5 ms attack, 50 ms release
const y = new Float32Array(Math.round(4.4 * sr))
for (let k = 0; k < noteOn.length; k++) {
  const s0 = Math.round(noteOn[k] * sr)
  const len = Math.round(0.9 * sr)
  let phase = 0
  for (let i = 0; i < len && s0 + i < y.length; i++) {
    const f = noteFreq[k] * Math.pow(2, (30 / 1200) * Math.sin(2 * Math.PI * 6 * (i / sr)))
    phase += (2 * Math.PI * f) / sr
    const attack = Math.min(1, i / (0.005 * sr))
    const release = Math.min(1, (len - i) / (0.05 * sr))
    y[s0 + i] += 0.8 * attack * release * Math.exp(-i / (2.0 * sr)) * Math.sin(phase)
  }
}

// default ODF vs superflux ODF (lag 2, max_size 3 over a 138-band mel)
const odfDefault = onset_strength(y, { sr, hop_length: hop, n_fft })
const mel = feature.melspectrogram(y, { sr, n_fft, hop_length: hop, n_mels: 138, fmin: 27.5, fmax: 16000 })
const odfSuper = onset_strength(null, {
  S: convert.power_to_db(mel), sr, hop_length: hop, n_fft, lag: 2, max_size: 3,
})
check('ODF frame counts match', odfDefault.length, odfSuper.length)

// identical librosa onset_detect peak picking for both (normalized envelope)
const pickOnsets = (env) => {
  const mx = Math.max(...env)
  const e = Float64Array.from(env, (v) => (mx > 0 ? v / mx : v))
  return Array.from(peakPick(e, {
    preMax: Math.ceil((0.03 * sr) / hop),
    postMax: Math.ceil((0.0 * sr) / hop) + 1,
    preAvg: Math.ceil((0.1 * sr) / hop),
    postAvg: Math.ceil((0.1 * sr) / hop) + 1,
    delta: 0.07,
    wait: Math.ceil((0.03 * sr) / hop),
  }))
}
const framesToTime = (f) => (f * hop) / sr
const defTimes = pickOnsets(odfDefault).map(framesToTime)
const supTimes = pickOnsets(odfSuper).map(framesToTime)

console.log(`default ODF onsets (${defTimes.length}): ${defTimes.map((t) => t.toFixed(3)).join(' ')}`)
console.log(`superflux onsets  (${supTimes.length}): ${supTimes.map((t) => t.toFixed(3)).join(' ')}`)

check('superflux detection count == 4 (one per note)', supTimes.length, 4)
const tol = (2 * hop) / sr
const maxDelta = supTimes.length === 4
  ? Math.max(...supTimes.map((t, i) => Math.abs(t - noteOn[i])))
  : Infinity
checkTrue(`each superflux onset within ±2 hops (${(tol * 1000).toFixed(1)} ms) of ground truth`,
  maxDelta <= tol, `max delta ${(maxDelta * 1000).toFixed(1)} ms`)
checkTrue('default ODF fires > 4 (vibrato false positives)', defTimes.length > 4,
  `${defTimes.length} detections`)

summary('plot_superflux — vibrato immunity, node run')
