/**
 * tutorial — The librosa quickstart, pleco-native: same beats, both runtimes.
 *
 * Quickstart half (bit-exact parity claim): the pinned librosa 0.11.0 fixture
 * signal (tools/parity/fixtures/tempo_beats.json, click120) is encoded to a
 * 16-bit WAV, decoded back with io/wav decodeWav, and run through beat_track —
 * tempo AND beat frames must EXACTLY equal the fixture's librosa values, even
 * through PCM quantization. Beat times printed via convert.frames_to_time.
 *
 * Advanced half: effects.hpss (waveform tier) → beat_track(percussive) →
 * feature.mfcc + promoted delta_features, beat-synchronously aggregated with
 * the promoted util sync (explicit [0, …beats, T] boundaries — pleco's sync
 * aggregates BETWEEN consecutive boundaries; the librosa pad=True endpoints
 * are supplied by hand). tutorial.html reruns the same asserts as badges.
 */
import {
  encodeWav, decodeWav, beat_track, convert, effects, feature, sync, delta_features,
} from '../../packages/pleco-xa/dist/pleco-xa.js'
import { check, checkTrue, summary } from './_harness.mjs'
import { readFileSync } from 'node:fs'
import { fileURLToPath } from 'node:url'

const fixturePath = fileURLToPath(new URL(
  '../../tools/parity/fixtures/tempo_beats.json', import.meta.url,
))
const fixture = JSON.parse(readFileSync(fixturePath, 'utf8')).cases[0]
const sr = fixture.input.sr
const y0 = Float32Array.from(fixture.input.y)
console.log(`fixture: ${fixture.input.signal} (${fixture.input.true_bpm} BPM truth), ` +
  `librosa tempo ${fixture.expected_tempo}, beats [${fixture.expected_beats}]`)

// ── quickstart: WAV round trip → beat_track, bit-exact vs librosa ───────────
const { channels, sampleRate } = decodeWav(encodeWav([y0], sr))
check('decoded sample rate', sampleRate, sr)
const { tempo, beats } = beat_track(channels[0], sampleRate)
check('tempo EXACTLY equals the pinned librosa fixture value', tempo, fixture.expected_tempo)
check('beat frames EXACTLY equal the pinned librosa fixture', Array.from(beats), fixture.expected_beats)

const beatTimes = Array.from(beats, (b) => convert.frames_to_time(b, sr, 512))
console.log(`tempo ${tempo.toFixed(2)} BPM — first 4 beat times: ` +
  beatTimes.slice(0, 4).map((t) => t.toFixed(4)).join('s ') + 's')

// ── advanced pipeline: hpss → beat_track(percussive) → mfcc (+delta) → sync ──
const { harmonic, percussive } = effects.hpss(channels[0])
check('hpss components preserve length', [harmonic.length, percussive.length],
  [channels[0].length, channels[0].length])

const rp = beat_track(percussive, sr)
check('beat_track on the percussive component reproduces the same beat grid',
  Array.from(rp.beats), fixture.expected_beats)

const M = feature.mfcc(channels[0], { sr, n_mfcc: 13 })
check('mfcc shape 13 × n_frames', [M.length, M[0].length], [13, 130])
const Md = delta_features(M)
check('delta_features preserves the mfcc shape', [Md.length, Md[0].length], [13, 130])

// interior delta frames are the exact width-9 regression slope
const t0 = 50
let expectSlope = 0
let norm = 0
for (let i = -4; i <= 4; i++) {
  expectSlope += i * M[0][t0 + i]
  norm += i * i
}
checkTrue('delta interior frame == width-9 regression slope (≤1e-6)',
  Math.abs(Md[0][t0] - expectSlope / norm) <= 1e-6,
  `got ${Md[0][t0].toFixed(6)} expected ${(expectSlope / norm).toFixed(6)}`)

// beat-synchronous aggregation with explicit boundaries [0, …beats, T]
const bounds = [0, ...rp.beats, M[0].length]
const stacked = [...M, ...Md]
const Msync = sync(stacked, bounds)
check('beat-sync feature matrix shape 26 × (n_beats + 1)',
  [Msync.length, Msync[0].length], [26, rp.beats.length + 1])

// exactness: the segment between beats 1 and 2 is the plain mean of its
// frames, BIT-EXACT after sync's Float32Array storage rounding (fround).
const [b1, b2] = [rp.beats[0], rp.beats[1]]
let mean = 0
for (let t = b1; t < b2; t++) mean += M[0][t]
mean /= b2 - b1
check('sync segment [beat1, beat2) == fround(exact mean of mfcc frames)',
  Msync[0][1], Math.fround(mean))

summary('tutorial — quickstart bit-exact vs librosa fixture + advanced pipeline')
