/**
 * Proof: beat tracking through a tempo change — librosa's plot_dynamic_beat, node edition.
 *
 * Replicates librosa.beat.beat_track's time-varying-tempo mode (docs/examples/
 * plot_dynamic_beat.py). A click track switches tempo mid-signal — 90 BPM for
 * the first 4 s, then 140 BPM for the last 4 s (sr=22050). Two trackers run:
 *
 *   STATIC : tempo() estimates one scalar BPM for the whole clip, beat_track
 *            follows it — so its beats keep a single spacing and mis-align in
 *            the slow section (surplus of detections where the average tempo
 *            runs too fast).
 *   DYNAMIC: tempo(aggregate:null) estimates a per-frame BPM curve, fed to
 *            beat_track(bpm=array) — so the beat spacing bends with the music.
 *
 * Library note (2026-07-02): the two APIs this demo exercises — tempo()'s
 * aggregate=null per-frame path and beat_track()'s time-varying bpm-array path
 * (the __beat_track_dp `tv` indexing over framesPerBeat) — were already present
 * and correct in scripts/xa-beat-tracker.js + dist; no repair was needed. The
 * only tuning that matters is the prior width: librosa's snare-accelerate demo
 * uses std_bpm=4 because it spans 30–240 BPM, but for this narrow 90–140 range
 * the default std_bpm=1 is required — the wide-4 prior lets the 140 BPM section
 * collapse onto its 70 BPM subharmonic (verified: dyn2=69.8 with std_bpm=4).
 *
 * Proofs: dynamic tempo curve is a per-frame array (not a scalar) whose two
 * halves land within one lag bin of 90 and 140 BPM and increase across the
 * switch; the dynamic inter-beat interval drops from ~0.667 s to ~0.429 s
 * (each within one hop, 23.2 ms) while static IBI stays ~constant; steady-region
 * dynamic beats land on clicks (< 1.5 hops); and static over-detects in the slow
 * section. Same asserts as examples/web/plot-dynamic-beat.html.
 */
import { beat_track, tempo, onset_strength } from '../../packages/pleco-xa/dist/pleco-xa.js'
import { check, checkTrue, summary } from './_harness.mjs'

const sr = 22050
const hop = 512
const hopT = hop / sr // one onset-frame in seconds (23.2 ms)
const BPM_SLOW = 90
const BPM_FAST = 140
const SWITCH = 4.0 // tempo change at t = 4 s
const DUR = 8.0
const IBI_SLOW = 60 / BPM_SLOW // 0.6667 s
const IBI_FAST = 60 / BPM_FAST // 0.4286 s
const GUARD = 0.3 // exclude ±0.3 s around the switch from steady-region IBI stats
const TRANSITION = 0.5 // ±0.5 s around the switch is the tempo-curve smear zone

// ---- synthesize the two-tempo click track ---------------------------------
// Accumulate beat intervals so the tempo switch is phase-continuous; each click
// is a 5 ms decaying 1 kHz burst (same generator as examples/node/beat-tracker.mjs).
const clickTimes = []
for (let t = 0; t < DUR - 1e-6; ) {
  clickTimes.push(t)
  t += t < SWITCH - 1e-6 ? IBI_SLOW : IBI_FAST
}
const y = new Float32Array(Math.round(sr * DUR))
const burst = Math.round(0.005 * sr)
for (const ct of clickTimes) {
  const s0 = Math.round(ct * sr)
  for (let i = 0; i < burst && s0 + i < y.length; i++) {
    y[s0 + i] += Math.sin((2 * Math.PI * 1000 * i) / sr) * Math.exp(-i / (0.001 * sr))
  }
}

const median = (a) => {
  const s = [...a].sort((x, y) => x - y)
  const n = s.length
  return n % 2 ? s[(n - 1) / 2] : 0.5 * (s[n / 2 - 1] + s[n / 2])
}
const ibisOf = (beats) => beats.slice(1).map((b, i) => b - beats[i])

// ---- static tracker: one scalar tempo for the whole clip ------------------
const staticRes = beat_track(y, sr, { units: 'time', trim: false })
const staticBeats = staticRes.beats
const staticIbis = ibisOf(staticBeats)

// ---- dynamic tracker: per-frame tempo curve, then time-varying beat_track --
const scalarTempo = tempo(y, { sr }) // librosa default aggregate='mean' → number
const dynTempo = tempo(y, { sr, aggregate: null, startBpm: 120, stdBpm: 1 })
const env = onset_strength(y, { sr, hop_length: hop, aggregate: 'median' })
const dynRes = beat_track(y, sr, { units: 'time', trim: false, bpm: dynTempo })
const dynBeats = dynRes.beats
const dynIbis = ibisOf(dynBeats)

// dynamic tempo curve, split at the switch frame
const switchFrame = Math.round((SWITCH * sr) / hop)
const dyn1 = median(Array.from(dynTempo.slice(0, switchFrame)))
const dyn2 = median(Array.from(dynTempo.slice(switchFrame)))

// steady-region IBIs: both endpoints on the same side, clear of the switch
const beforeIbis = []
const afterIbis = []
for (let i = 0; i < dynIbis.length; i++) {
  if (dynBeats[i + 1] <= SWITCH - GUARD) beforeIbis.push(dynIbis[i])
  else if (dynBeats[i] >= SWITCH + GUARD) afterIbis.push(dynIbis[i])
}
const ibiBefore = median(beforeIbis)
const ibiAfter = median(afterIbis)

// beat→nearest-click offsets, in hops, for beats outside the transition smear
const nearestClickHops = (t) => Math.min(...clickTimes.map((c) => Math.abs(c - t))) / hopT
const steadyOffsets = dynBeats
  .filter((b) => Math.abs(b - SWITCH) >= TRANSITION)
  .map(nearestClickHops)
const maxSteadyOffset = Math.max(...steadyOffsets)
const medSteadyOffset = median(steadyOffsets)

// static over-detection in the slow section [0, SWITCH)
const clicksSlow = clickTimes.filter((c) => c < SWITCH).length
const staticSlow = staticBeats.filter((b) => b < SWITCH).length
const dynSlowSteady = dynBeats.filter((b) => b < SWITCH - TRANSITION).length
const clicksSlowSteady = clickTimes.filter((c) => c < SWITCH - TRANSITION).length

// ---- printed IBI before/after table ---------------------------------------
console.log(`\nTwo-tempo click track: ${BPM_SLOW} BPM for ${SWITCH}s, then ${BPM_FAST} BPM (sr=${sr}, hop=${hop}, ${hopT.toFixed(4)}s/frame)`)
console.log(`clicks: ${clickTimes.length}   frame rate: ${(sr / hop).toFixed(2)} fps`)
console.log('\nsection        | ground-truth IBI | dynamic beats IBI | static beats IBI')
console.log('---------------|------------------|-------------------|-----------------')
console.log(`slow (90 BPM)  |     ${IBI_SLOW.toFixed(4)}s      |      ${ibiBefore.toFixed(4)}s      |    ~${median(staticIbis).toFixed(4)}s`)
console.log(`fast (140 BPM) |     ${IBI_FAST.toFixed(4)}s      |      ${ibiAfter.toFixed(4)}s      |    ~${median(staticIbis).toFixed(4)}s`)
console.log(`\ndynamic tempo curve: scalar(static)=${scalarTempo.toFixed(2)} BPM  |  per-frame halves: ${dyn1.toFixed(1)} → ${dyn2.toFixed(1)} BPM (${dynTempo.length} frames)`)
console.log(`beat counts in slow section [0,${SWITCH}s):  clicks=${clicksSlow}  dynamic=${dynBeats.filter((b) => b < SWITCH).length}  static=${staticSlow} (surplus)`)
console.log(`steady-region beat→click offset: median ${medSteadyOffset.toFixed(2)} hop, max ${maxSteadyOffset.toFixed(2)} hop`)
console.log(`(transition zone ±${TRANSITION}s around the switch is excluded — the tempo curve smears there, as librosa documents)\n`)

// ---- proofs ---------------------------------------------------------------
// The repair surface: per-frame tempo + time-varying beat_track really ran.
check('static tempo() returns a scalar', typeof scalarTempo, 'number')
checkTrue('tempo(aggregate:null) returns a per-frame array (not a scalar)', dynTempo.length > 100 && typeof dynTempo.length === 'number', `length=${dynTempo.length}`)
checkTrue('per-frame tempo length == onset-envelope frame count', dynTempo.length === env.length, `${dynTempo.length} vs ${env.length}`)
checkTrue('beat_track(bpm=array) accepted the time-varying curve', dynBeats.length > 5, `${dynBeats.length} beats`)

// The dynamic tempo curve bends the right way.
checkTrue('dynamic tempo slow-half within one lag bin of 90 BPM', dyn1 >= 85 && dyn1 <= 95, `dyn1=${dyn1.toFixed(1)}`)
checkTrue('dynamic tempo fast-half within one lag bin of 140 BPM', dyn2 >= 135 && dyn2 <= 150, `dyn2=${dyn2.toFixed(1)}`)
checkTrue('dynamic tempo increases across the switch (>30 BPM)', dyn2 - dyn1 > 30, `+${(dyn2 - dyn1).toFixed(1)} BPM`)

// The inter-beat interval shifts at the switch — the headline assertion.
checkTrue('dynamic IBI before switch within 1 hop of 0.667s', Math.abs(ibiBefore - IBI_SLOW) <= hopT, `${ibiBefore.toFixed(4)}s`)
checkTrue('dynamic IBI after switch within 1 hop of 0.429s', Math.abs(ibiAfter - IBI_FAST) <= hopT, `${ibiAfter.toFixed(4)}s`)
checkTrue('IBI drop across the switch > 0.2s', ibiBefore - ibiAfter > 0.2, `Δ=${(ibiBefore - ibiAfter).toFixed(4)}s`)

// Beats land on clicks (steady regions); the transition smear is honestly excluded.
checkTrue('steady dynamic beats land on clicks (max < 1.5 hop)', maxSteadyOffset < 1.5, `max=${maxSteadyOffset.toFixed(2)} hop`)
checkTrue('steady dynamic beats land on clicks (median < 1 hop)', medSteadyOffset < 1.0, `median=${medSteadyOffset.toFixed(2)} hop`)
checkTrue('dynamic beat count matches clicks in the slow steady region', dynSlowSteady === clicksSlowSteady, `dyn=${dynSlowSteady} clicks=${clicksSlowSteady}`)

// The static tracker mis-aligns: constant spacing, surplus in the slow section.
checkTrue('static IBI stays ~constant (range < 0.1s — no tempo tracking)', Math.max(...staticIbis) - Math.min(...staticIbis) < 0.1, `range=${(Math.max(...staticIbis) - Math.min(...staticIbis)).toFixed(4)}s`)
checkTrue('static over-detects in the slow section (surplus vs clicks)', staticSlow > clicksSlow, `static=${staticSlow} vs clicks=${clicksSlow}`)

summary('plot-dynamic-beat: beat tracking through a 90→140 BPM tempo switch')
